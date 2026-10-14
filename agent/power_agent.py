#!/usr/bin/env python3
"""Read-only, loopback-only battery discharge sensor for Wattwise.

No third-party dependencies. This is NOT a wall-power meter. Unsupported,
charging and missing sensors return available=False, never invented watts.
"""
import json
import math
import platform
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def unavailable(message):
    return {"available": False, "message": message}


def linux_power(root=Path('/sys/class/power_supply')):
    batteries = []
    try:
        for path in root.iterdir():
            if (path / 'type').read_text().strip() != 'Battery':
                continue
            if (path / 'present').exists() and (path / 'present').read_text().strip() == '0':
                continue
            if (path / 'status').read_text().strip() != 'Discharging':
                return unavailable('Battery is not discharging. Wall power requires an external meter.')
            if (path / 'power_now').exists():
                watts = abs(float((path / 'power_now').read_text())) / 1_000_000
            else:
                amps = abs(float((path / 'current_now').read_text())) / 1_000_000
                volts = float((path / 'voltage_now').read_text()) / 1_000_000
                watts = amps * volts
            if not math.isfinite(watts) or not 0 < watts < 10000:
                return unavailable('Battery sensor returned an invalid or unsupported reading.')
            batteries.append((path.name, watts))
    except (OSError, ValueError):
        return unavailable('No readable battery power sensor. Try wattage estimate mode.')
    if not batteries:
        return unavailable('No battery sensor found. Desktop PCs require an external power meter.')
    return {"available": True, "watts": sum(w for _, w in batteries),
            "source": 'Linux battery: ' + ', '.join(n for n, _ in batteries),
            "scope": 'battery-discharge'}


def parse_windows(raw):
    readings = json.loads(raw or 'null')
    if not readings:
        return unavailable('No Windows battery discharge sensor is available.')
    if isinstance(readings, dict):
        readings = [readings]
    total = 0
    for r in readings:
        rate = r.get('DischargeRate')
        if not r.get('Discharging'):
            return unavailable('Battery is not discharging. Wall power requires an external meter.')
        if not isinstance(rate, (int, float)) or not math.isfinite(rate) or not 0 < rate < 10_000_000:
            return unavailable('Windows battery driver does not report a valid discharge rate.')
        total += rate / 1000
    return {"available": True, "watts": total, "source": 'Windows WMI battery', "scope": 'battery-discharge'}


def windows_power():
    command = ('Get-CimInstance -Namespace root/wmi -ClassName BatteryStatus '
               '| Where-Object { $_.Active } '
               '| Select-Object Discharging,DischargeRate | ConvertTo-Json -Compress')
    try:
        result = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', command],
                                capture_output=True, text=True, timeout=3,
                                creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        if result.returncode != 0:
            return unavailable('Windows battery driver could not be queried.')
        return parse_windows(result.stdout.strip())
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return unavailable('Unable to read Windows battery sensor. Try wattage estimate mode.')


def read_power():
    system = platform.system()
    if system == 'Linux':
        return linux_power()
    if system == 'Windows':
        return windows_power()
    return unavailable('This agent supports Windows and Linux. Use wattage estimate mode on this OS.')


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != '/power':
            self.send_error(404)
            return
        body = json.dumps(read_power()).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass


if __name__ == '__main__':
    print('Wattwise battery agent: http://127.0.0.1:8765', flush=True)
    print('Battery discharge only, not wall consumption. Ctrl+C to stop.', flush=True)
    try:
        ThreadingHTTPServer(('127.0.0.1', 8765), Handler).serve_forever()
    except KeyboardInterrupt:
        print('\nAgent stopped.')
