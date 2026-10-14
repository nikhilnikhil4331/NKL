# Wattwise — Every watt counts

> **Windows 11 desktop edition is now available as a source run package.** See
> [desktop setup](WINDOWS-DESKTOP.md). It has a built-in reader and main-process tray
> tracking; the browser-only limitations below apply to the web edition.

A local-first energy and electricity-cost dashboard for a personal laptop or PC.
React + Vite; all UI fonts and assets are bundled, with no external CDNs or analytics.

## Run

Install Node.js 20.19+ (22 LTS recommended), then:

```sh
npm install
npm run dev
```

Open the URL printed by Vite. The server binds to `0.0.0.0` for hosted previews.
The preview starts with **explicitly labeled demo data**, not your computer's power.

1. Select **Set up tracking** (or Settings).
2. Choose **Wattage estimate** and enter an average wattage.
3. Enter your currency and electricity **rate per kWh**. For example, INR and 8 means ₹8 per unit.
4. Save. A fresh session begins; its energy and cost accumulate while the app is open.
5. Use Pause/Resume, minute/hour charts, History, and Export report as needed.

**Ek unit = 1 kWh.** Example: 100 watts × 10 hours ÷ 1,000 = 1 unit.
At ₹8/unit, that costs ₹8. Charger nameplate wattage is a maximum, not actual draw.

## Features

- One-second best-effort sampling; second, minute, and hour chart aggregation.
- Live watts, recorded kWh, session cost and active time.
- INR, USD, EUR, GBP, JPY and AED; configurable flat tariff.
- Monthly projection and budget, based on session-average watts and your expected daily hours.
- Standalone what-if calculator for wattage, hours and days.
- Browser-local session history, CSV export, pause/resume and persisted settings.
- Three clearly separated data sources: Demo, Wattage estimate, Battery sensor.
- Responsive layouts, keyboard navigation, focus-trapped dialogs, reduced-motion support.

## Optional battery sensor agent

Python 3.10+ required. Run the application **on the laptop being measured**. In a second terminal:

```sh
python agent/power_agent.py
# On Linux, the command may be python3 instead of python.
```

Keep the Vite application running in the first terminal. Select **Battery sensor** in Settings.
The browser uses the relative endpoint `/api/agent/power`; Vite proxies it to the read-only
Python agent at `127.0.0.1:8765`. No browser request targets `localhost` directly.
The Python agent intentionally listens only on loopback, has no CORS allowance and writes no files.

Supported readings:

| OS | Sensor | Limitations |
|---|---|---|
| Linux | `/sys/class/power_supply/*/power_now`, or current × voltage | Present, discharging batteries only |
| Windows | WMI `root/wmi`, `BatteryStatus.DischargeRate` | An active, discharging battery with a driver that supplies a valid rate |
| macOS / desktops | No included hardware reader | Use manual estimate mode or an external power meter |

The hosted preview cannot reach a sensor on your personal laptop. A container/server battery,
if present, would be that server's battery, not yours. Unsupported, charging, absent, invalid
or unreachable sensors return no reading; the app never silently substitutes estimated data.
Missing samples do not add time or energy. Sensor tests use fixtures and mocked HTTP responses;
physical Windows/Linux battery hardware has not been verified in the sandbox.

**Battery discharge is not wall consumption.** Charger losses, mains charging and peripherals
are not included. Accurate whole-PC electricity measurement needs an external wattmeter or
energy-monitoring smart plug. This version does not directly integrate smart plugs.

## Accuracy, retention and privacy

- This is a browser app, **not an always-running native background service**. Keep it open.
  Browsers may throttle background tabs; sampling is best effort, not a precision meter.
- Gaps longer than five seconds are skipped rather than inventing readings after sleep.
- Reopened sessions start paused. There is no automatic backfill for closed-browser time.
- Energy: `watts × observed seconds / 3,600,000 = kWh`; cost: `kWh × rate`.
- Minute/hour charts use duration-weighted power averages and summed energy. Hover for
  bucket energy and cost; the second view covers the last 60 seconds.
- All displayed/exported costs use the **current tariff**, including past sessions. This is
  not an immutable billing ledger. No exchange-rate conversion, fixed charges, slab rates or taxes.
- Demo history is separate from recorded history and is clearly marked in exported filenames.
- State is saved locally every five seconds and at visibility/page-hide transitions. Up to the
  most recent five seconds can be lost in an abrupt crash. Private browsing/storage quotas may
  prevent saving; an in-app warning asks you to export.
- Up to 50 non-demo sessions (current + 49 history) are retained. Start a new session in History.
- Recent one-second detail is retained for at least ten minutes. Once the sample count reaches
  1,800, older samples are compacted to minute summaries; detail older than seven days is dropped
  on compaction. Session totals remain. CSV exports the **retained samples**, not dropped detail.
- Export regularly for permanent records. Clearing browser data removes local records.
- Two simultaneously open tabs can overwrite the same browser-local store. Track in one tab.
- No account, cloud upload, payment flow or telemetry. Monthly budget is a local planning setting,
  not a wallet or payment.

## Build and tests

```sh
npm run build
npm run preview
npm test
python -m unittest discover -s tests -p 'test_*.py'
npx playwright install chromium
npm run test:e2e
```

To use an existing Chromium binary in a constrained environment, set `CHROMIUM_PATH` before
running browser tests (and `LD_LIBRARY_PATH` if its shared libraries need a custom path).

Coverage: energy/cost math, aggregation, sample compaction, CSV, persisted state validation,
Linux/Windows sensor fixtures, demo source labeling, recording, pause/resume, safe reload,
session history, currency/rate calculator, downloads, valid/unavailable sensors, and mobile UI.

The Vite proxy is configured for local development/preview. A custom production server must
supply the same `/api/agent/*` reverse proxy for sensor mode; static hosting supports Demo and
Estimate modes only. Do not publicly expose a private sensor agent.
