import { Info } from "lucide-react";
export default function DesktopHelp() {
  return (
    <div className="help-content">
      <div className="help-callout">
        <Info size={20} />
        <p>
          You’re using the desktop edition. The Windows battery reader is built
          in — no browser, Python or separate agent needs to stay open.
        </p>
      </div>
      <h3>1. Set your electricity rate</h3>
      <p>
        Open <strong>Settings</strong>, choose INR, and enter your electricity
        bill’s rate per unit. The default ₹8 is only an example. One unit = one
        kWh.
      </p>
      <h3>2. Check battery readings</h3>
      <p>
        Select <strong>Battery sensor</strong> and use your laptop on battery.
        If Windows exposes its discharge rate, readings arrive approximately
        every second. Minute/hour views group those readings. Unsupported
        sensors show “No signal”; they never turn into fake measurements.
      </p>
      <h3>Plugged in? Know the limitation</h3>
      <p>
        Battery power is not wall electricity. When charging or plugged in, the
        sensor pauses energy accumulation. For an approximation, explicitly
        switch to <strong>Wattage estimate</strong>. For accurate wall-power
        use, you need an external energy meter; direct smart-plug integration is
        not included.
      </p>
      <h3>3. Close the window, keep tracking</h3>
      <p>
        The × button hides Wattwise in the Windows system tray near the clock.
        Tracking continues while the computer is awake, even when the window is
        hidden or minimized. Click the purple lightning icon to reopen it.
        Right-click it to pause/resume or <strong>Quit Wattwise</strong>.
      </p>
      <p>
        You can enable <strong>Start with Windows</strong> in Settings. This is
        off by default. It starts in the tray when you sign in, not before
        sign-in. A previously paused session stays paused. If you use the source
        run package, keep its extracted folder in the same location.
      </p>
      <h3>Sleep, shutdown and saved readings</h3>
      <p>
        Sleep, hibernate, shutdown, sensor outages and time while the app is
        quit are not recorded or backfilled. Tracking resumes after wake if it
        was active. Settings and readings save every 5 seconds in{" "}
        <code>%APPDATA%\Wattwise\state.json</code>, and when you pause, hide or
        quit normally. Export CSV regularly for a separate copy.
      </p>
      <p>
        Up to 50 sessions are retained. Recent second-level samples are
        compacted to minute summaries after ten minutes as the buffer fills;
        detailed samples are retained for up to seven days, while session totals
        remain. Exported samples may cover less time than the lifetime session
        totals.
      </p>
      <h3>How the cost works</h3>
      <p>
        <strong>Watts × seconds ÷ 3,600,000 = kWh.</strong> kWh × your rate =
        cost. Battery-mode cost is a tariff-based equivalent, not your charging
        bill: charger losses are excluded. Currency changes do not convert
        exchange rates, and rate changes recalculate historical costs.
      </p>
    </div>
  );
}
