# Wattwise for Windows 11

## Run the source package (available now)

See [`WINDOWS-START-HERE.txt`](../WINDOWS-START-HERE.txt) for non-technical steps.
Install **Node.js LTS 22.12+**, extract the run-package ZIP, then double-click
`Run-Wattwise.cmd`. Python, a browser, and a second sensor terminal are not needed.
First-time setup downloads locked npm dependencies and Electron. The launcher builds
the UI and starts Electron detached, so closing its setup console does not stop the app.
Keep the extracted folder in a permanent location if you enable sign-in startup.

For developers, the equivalent is:

```sh
npm ci
npm run desktop
```

This is a **source run package, not a prebuilt `.exe` installer**. A native installer
could not be produced in the Arena sandbox because the official Electron Windows
runtime download redirects to a host outside the sandbox's network allowlist.
No TLS checks or artifact checksum checks were disabled to work around that restriction.

## Build a normal installer

On a Windows machine with Node.js 22.12+ and normal network access:

```sh
npm ci
npm run package:win
```

Output: `build/windows/Wattwise-Setup-1.0.0-x64.exe` (NSIS per-user installer).
Installed builds contain the runtime, so end users do not need Node.js or Python.
The source configuration targets Windows x64; ARM64 is not separately packaged.

The workflow at `.github/workflows/windows-desktop.yml` builds on pushes to
`arena/07405809-nkl` and supports manual dispatch once registered. It tests the
packaged executable on a Windows runner, uploads installer/checksum artifacts and
publishes an immutable preview release only after all checks pass. Releases use
unique `wattwise-v<version>-build.<run>.<attempt>` tags; existing downloads are not
overwritten. See [the release list](https://github.com/nikhilnikhil4331/Wattwise/releases)
for successful builds. Workflow permissions are read-only during dependency
installation/build and write-enabled only in the separate publish job.

No code-signing certificate is configured. Any installer built this way is unsigned
and may prompt or be blocked by SmartScreen or organization policies. Verify its
origin and checksum; do not disable Windows protections to make it run.

## Desktop behavior

- Starts with **Battery sensor**, not demo. The Windows reader is built in.
- Uses one hidden, read-only Windows PowerShell/WMI process. No elevation, no
  ExecutionPolicy bypass, no scripts interpolated from user input.
- Samples approximately once per second, depending on WMI latency. Multiple supported
  discharging batteries are summed. Charging/plugged-in, zero, sentinel, missing or
  invalid readings show an explicit error and add no energy.
- **Battery energy is not wall energy.** Charger losses and mains charging are not
  measured. The displayed sensor cost is only a tariff-based energy equivalent.
- Manual estimate mode works while plugged in, clearly marked Estimated; it uses
  the wattage entered by the user. There is no automatic fallback to estimates.
- The Electron **main process** owns sampling, history and storage. UI hiding,
  minimizing or renderer reload does not own or stop the sampler.
- Close/× hides the window to the tray. Tray actions: Open, Pause/Resume, Quit.
- Optional **Start with Windows** is off by default and is per-user. It starts hidden
  at sign-in; an explicitly paused session stays paused. It works for both installed
  builds and the source launcher. Moving the source folder breaks its old startup
  entry; reopen from its new location and re-save the startup preference.
- Only one app instance can run per user. Launching it again focuses the existing one.
- Sleep/suspend stops the sampling source. Wake reconnects without adding sleeping time.
  Sensor outages, gaps over five seconds, shutdown and quit time are not backfilled.
- A previously running session resumes on relaunch without counting the time it was
  closed. Reopening a previously paused session keeps it paused.

## Storage and security

State lives in `%APPDATA%\Wattwise\state.json`, separate from browser-preview storage.
Saves occur every five seconds, on normal quit, pause, hide, settings changes and sleep.
A temporary file, fsync and atomic rename reduce partial-write risk. Invalid files are
backed up with an `.invalid-<timestamp>.bak` suffix before replacement; access failures
show a startup error. Failed writes leave in-memory readings intact and display a warning.
Abrupt power loss can lose the most recent unsaved samples. Export CSV regularly.

Retention, units, tariff recalculation, sample compaction and CSV limitations match the
browser version in [WATTWISE.md](WATTWISE.md). Desktop history is not automatically merged
with web preview data. No tracking data is uploaded, no account or payment is needed.

The renderer is sandboxed with context isolation and no Node integration. The narrow
preload bridge exposes snapshot subscription, validated preferences/tracking actions and
CSV export through a save dialog, not arbitrary file/network/shell APIs. IPC verifies the
main-frame sender. New windows, navigation, permissions and webviews are denied. Built
assets have a restrictive CSP and use relative, locally bundled URLs.

## Tests and validation boundary

```sh
npm test
npm run test:e2e
npm run build
```

Tests cover headless main-process integration math, pausing, source changes, renderer-free
sampling, stale callback cancellation, outage and suspend gaps, relaunch, write failures,
atomic store/backups, Windows battery parsing, and the persistent PowerShell stream using
fixtures. Browser tests cover the native bridge, settings/autostart commands, CSV delegation
and bootstrap failure, as well as the existing browser flows.

**No physical Windows laptop or Windows runtime was available in the sandbox.** The real
WMI sensor, native tray behavior, installer, login startup and Windows security prompts
still require Windows smoke testing. Test on battery, then plug in, pause/resume, hide the
window, reopen it, sleep/wake, and relaunch. Never validate energy by expecting a charger’s
rated maximum to equal its actual draw.
