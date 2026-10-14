# Wattwise ⚡

**Windows 11 installer:** see [Wattwise preview releases](https://github.com/nikhilnikhil4331/Wattwise/releases). Successful Windows builds publish a standalone `.exe` and SHA-256 checksum. The installed app does **not** need Node.js or Python.

**Run from source instead:** install Node.js LTS 22.12+, extract the run package, then
double-click `Run-Wattwise.cmd`. Built-in battery reader, tray background tracking,
local disk history and optional Windows sign-in startup. No Python required.
[Simple Windows instructions](WINDOWS-START-HERE.txt) · [Desktop details & installer build](docs/WINDOWS-DESKTOP.md)

A local-first PC/laptop energy tracker with per-second sampling, minute/hour charts,
units (kWh), electricity costs, configurable currencies, session history and CSV export.

```sh
npm install
npm run dev
```

**[Setup, sensor support, calculations, limitations and tests →](docs/WATTWISE.md)**

Starts in labeled demo mode. Use Settings to enter your estimated wattage and per-unit tariff,
or run the included Windows/Linux battery sensor agent locally. Browser-only tracking needs
the app open; exact whole-device wall power needs an external meter.


## Project publishing

The intended standalone repository is `nikhilnikhil4331/Wattwise`. Repository creation and publication are pending GitHub access. The Windows workflow publishes preview installers only after the build and packaged-app smoke test pass.
