import json
import tempfile
import unittest
from pathlib import Path
from agent.power_agent import linux_power, parse_windows


class AgentTests(unittest.TestCase):
    def battery(self, root, **fields):
        path = Path(root) / 'BAT0'
        path.mkdir()
        for key, value in {'type': 'Battery', 'status': 'Discharging', **fields}.items():
            (path / key).write_text(str(value))
        return path

    def test_linux_power_units(self):
        with tempfile.TemporaryDirectory() as root:
            self.battery(root, power_now=15000000)
            result = linux_power(Path(root))
            self.assertTrue(result['available'])
            self.assertEqual(result['watts'], 15)

    def test_linux_current_voltage(self):
        with tempfile.TemporaryDirectory() as root:
            self.battery(root, current_now=2000000, voltage_now=12000000)
            self.assertEqual(linux_power(Path(root))['watts'], 24)

    def test_no_charging_reading_or_fallback(self):
        with tempfile.TemporaryDirectory() as root:
            self.battery(root, status='Charging', power_now=25000000)
            self.assertFalse(linux_power(Path(root))['available'])

    def test_missing_sensor(self):
        with tempfile.TemporaryDirectory() as root:
            self.assertFalse(linux_power(Path(root))['available'])

    def test_invalid_linux_sensor(self):
        with tempfile.TemporaryDirectory() as root:
            self.battery(root, power_now='NaN')
            self.assertFalse(linux_power(Path(root))['available'])

    def test_windows_milliwatts(self):
        self.assertEqual(parse_windows('{"Discharging":true,"DischargeRate":25000}')['watts'], 25)

    def test_windows_unsupported_sentinel(self):
        self.assertFalse(parse_windows('{"Discharging":true,"DischargeRate":4294967295}')['available'])

    def test_windows_no_battery(self):
        self.assertFalse(parse_windows('null')['available'])

    def test_windows_charging(self):
        self.assertFalse(parse_windows('{"Discharging":false,"DischargeRate":20000}')['available'])


if __name__ == '__main__':
    unittest.main()
