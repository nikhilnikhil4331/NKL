# Wattwise — Windows 11 desktop preview

## Download and install

1. Download **Wattwise-Setup-1.0.0-x64.exe** from this release's Assets.
2. Open the installer, choose your folder and finish setup.
3. Launch Wattwise from the desktop/Start menu. **Node.js and Python are not required.**
4. In Settings, choose your currency and enter your actual electricity rate per kWh. ₹8 is an example, not your tariff.
5. Select Battery sensor and check readings while your laptop is discharging on battery.

The installer is **unsigned**. Windows may show an unknown-publisher/SmartScreen warning, or an organization policy may block it. Verify the release origin and optional SHA-256 checksum; do not disable Windows security or bypass organization policy.

## What it does

- Approximate one-second battery sensor sampling, second/minute/hour views, kWh and tariff-based costs.
- Optional explicitly labeled wattage-estimate mode, currency/rate settings, monthly projections and budgets.
- Closing the window hides to the system tray; tracking continues while the laptop is awake.
- Tray menu: Open, Pause/Resume, Quit. Optional Start with Windows is off by default.
- Readings save locally in `%APPDATA%\Wattwise\state.json`. CSV export is available.

## Important accuracy limits

- **Battery discharge power is NOT wall electricity.** The shown battery-energy cost is a tariff-based equivalent, not your charging bill.
- Plugged-in/charging or unsupported batteries show no signal; missing samples add no energy. No silent guessed readings.
- Whole-laptop wall consumption requires an external wattmeter or energy-monitoring plug. Direct smart-plug integration is not included.
- Sleep, shutdown, quit time and sensor outages are not backfilled. Browser-preview history is separate.
- Currency changes do not convert exchange rates. Tariff changes recalculate historical costs. Taxes, fixed charges and charger losses are excluded.

This is an **early preview**, not a certified energy meter. The release workflow checks unit tests and smoke-tests the packaged app on a Windows runner (startup, IPC, tray-hide background estimation, pause, persistence). Actual laptop battery-driver accuracy, login startup and the installation wizard still need device testing.

If installation or battery detection fails, report the exact error and laptop model. Do not share credentials or private data files.
