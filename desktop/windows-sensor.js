import { spawn } from "node:child_process";
import path from "node:path";

export function parseBatterySample(input) {
  if (!input || input.error)
    return {
      available: false,
      message:
        "Windows battery sensor could not be read. Your driver may not support it.",
    };
  const batteries = Array.isArray(input.batteries) ? input.batteries : [];
  if (!batteries.length)
    return {
      available: false,
      message:
        "No supported Windows battery sensor was found. Use Wattage estimate or an external meter.",
    };
  let watts = 0;
  for (const b of batteries) {
    if (
      b.Discharging !== true ||
      b.PowerOnline === true ||
      b.Charging === true
    ) {
      return {
        available: false,
        message:
          "Laptop is plugged in or not discharging. Battery watts are unavailable; wall electricity needs an external meter.",
      };
    }
    if (
      !Number.isFinite(b.DischargeRate) ||
      b.DischargeRate <= 0 ||
      b.DischargeRate >= 10000000
    ) {
      return {
        available: false,
        message:
          "This battery driver does not supply a valid discharge rate. Use Wattage estimate instead.",
      };
    }
    watts += b.DischargeRate / 1000;
  }
  if (watts > 10000)
    return {
      available: false,
      message: "Battery sensor returned an out-of-range reading.",
    };
  return { available: true, watts, source: "Windows battery discharge (WMI)" };
}

// A single read-only PowerShell process avoids spawning a console every second.
// Never interpolate renderer/user input into this command.
const SENSOR_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
while ($true) {
  try {
    $b = @(Get-CimInstance -Namespace root/wmi -ClassName BatteryStatus | Where-Object { $_.Active } | Select-Object Discharging, DischargeRate, PowerOnline, Charging)
    $line = @{ batteries = $b } | ConvertTo-Json -Compress -Depth 4
    [Console]::WriteLine($line)
  } catch { [Console]::WriteLine('{"error":true}') }
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 1000
}
`;

export function startWindowsSensor(
  onSample,
  { platform = process.platform, spawnProcess = spawn } = {},
) {
  if (platform !== "win32") {
    onSample({
      available: false,
      message:
        "The desktop battery sensor requires Windows 11. Estimate mode works on other operating systems.",
    });
    return () => {};
  }
  let stopped = false,
    child = null,
    retry = null,
    watchdog = null;
  const unavailable = (message) => onSample({ available: false, message });
  const launch = () => {
    if (stopped) return;
    let buffer = "";
    const executable = path.win32.join(
      process.env.SystemRoot || "C:\\Windows",
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    );
    const proc = spawnProcess(
      executable,
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(SENSOR_SCRIPT, "utf16le").toString("base64"),
      ],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    child = proc;
    const resetWatchdog = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        if (!stopped && child === proc) {
          unavailable(
            "Windows sensor stopped responding. Reconnecting; missing time is not counted.",
          );
          proc.kill();
        }
      }, 8000);
    };
    resetWatchdog();
    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (chunk) => {
      if (stopped || child !== proc) return;
      buffer += chunk;
      if (buffer.length > 65536) {
        buffer = "";
        unavailable("Invalid sensor response. Reconnecting.");
        proc.kill();
        return;
      }
      let index;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) continue;
        resetWatchdog();
        try {
          onSample(parseBatterySample(JSON.parse(line)));
        } catch {
          unavailable("Windows sensor returned an unreadable response.");
        }
      }
    });
    // Drain stderr; WMI failures are reported as structured JSON on stdout.
    proc.stderr.on("data", () => {});
    proc.on("error", () => {
      if (!stopped)
        unavailable(
          "Unable to start the Windows sensor. PowerShell may be restricted on this PC.",
        );
    });
    proc.on("close", () => {
      clearTimeout(watchdog);
      if (stopped || child !== proc) return;
      child = null;
      unavailable("Windows sensor disconnected. Retrying in 3 seconds.");
      retry = setTimeout(launch, 3000);
    });
  };
  launch();
  return () => {
    stopped = true;
    clearTimeout(retry);
    clearTimeout(watchdog);
    child?.kill();
    child = null;
  };
}
