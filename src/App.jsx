import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BatteryCharging,
  Bolt,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Cpu,
  CreditCard,
  Gauge,
  History,
  Info,
  Laptop,
  LayoutDashboard,
  Leaf,
  Menu,
  Monitor,
  Pause,
  Play,
  Plug,
  Plus,
  Power,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DEFAULT_SETTINGS,
  aggregate,
  compactPoints,
  costFor,
  csvFor,
  demoWatts,
  duration,
  energyFor,
  makeDemo,
  money,
} from "./energy";

import { restoreState } from "./persistence";
import DesktopHelp from "./DesktopHelp";

const desktopBridge = window.wattwiseDesktop;
const isDesktop = Boolean(desktopBridge);

const STORAGE = "wattwise.v1";
const NAV = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Usage history", icon: History },
  { name: "Cost calculator", icon: Wallet },
  { name: "My device", icon: Monitor },
];
function load() {
  try {
    return restoreState(localStorage.getItem(STORAGE));
  } catch {
    return null;
  }
}
function IconBox({ icon: Icon, tone = "purple" }) {
  return (
    <span className={`icon-box ${tone}`}>
      <Icon size={20} strokeWidth={1.8} />
    </span>
  );
}
function Pill({ children, tone = "green" }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}
function Empty({ title, children }) {
  return (
    <div className="empty">
      <Activity size={30} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function ChartTip({ active, payload, label, currency, rate }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <span>
        {new Date(label).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </span>
      <strong>{payload[0].value.toFixed(1)} W</strong>
      <small>
        {payload[0].payload.kwh.toFixed(6)} kWh ·{" "}
        {money(payload[0].payload.kwh * rate, currency, 4)}
      </small>
    </div>
  );
}

export default function App({ desktopInitial = null }) {
  const [initial] = useState(() => desktopInitial || load());
  const [desktopInfo, setDesktopInfo] = useState(
    desktopInitial?.desktop || null,
  );
  const [settings, setSettings] = useState(
    initial?.settings || DEFAULT_SETTINGS,
  );
  const [session, setSession] = useState(
    initial?.session || (() => makeDemo()),
  );
  const [history, setHistory] = useState(initial?.history || []);
  const [running, setRunning] = useState(
    isDesktop ? initial?.running === true : !initial,
  );
  const [page, setPage] = useState("Overview");
  const [interval, setIntervalChoice] = useState("Minute");
  const [range, setRange] = useState("6");
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState("");
  const [sidebar, setSidebar] = useState(false);
  const [sensorError, setSensorError] = useState(
    desktopInitial?.sensorError || "",
  );
  const [sensorName, setSensorName] = useState(
    desktopInitial?.sensorName || "",
  );
  const [storageError, setStorageError] = useState(
    desktopInitial?.storageError || false,
  );
  const [historyFilter, setHistoryFilter] = useState("All sessions");
  const [calc, setCalc] = useState({ watts: 65, hours: 8, days: 30 });
  const latest = useRef();
  latest.current = { version: 1, settings, session, history };
  const notify = (text) => setToast(text);
  const syncDesktop = useCallback((state) => {
    setSettings(state.settings);
    setSession(state.session);
    setHistory(state.history);
    setRunning(state.running);
    setSensorError(state.sensorError || "");
    setSensorName(state.sensorName || "");
    setStorageError(state.storageError || false);
    setDesktopInfo(state.desktop);
  }, []);
  useEffect(() => {
    if (!isDesktop) return;
    let mounted = true;
    const unsubscribe = desktopBridge.onState((state) => {
      if (mounted) syncDesktop(state);
    });
    desktopBridge
      .getState()
      .then((state) => {
        if (mounted) syncDesktop(state);
      })
      .catch(() => setToast("Desktop connection failed. Reopen Wattwise."));
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [syncDesktop]);
  const desktopCommand = async (action) => {
    try {
      syncDesktop(await desktopBridge.command(action));
      return true;
    } catch (error) {
      notify(error.message || "Could not update desktop tracking.");
      return false;
    }
  };
  const toggleTracking = () =>
    isDesktop
      ? desktopCommand({ type: "running", running: !running })
      : setRunning((r) => !r);
  const save = () => {
    if (isDesktop) return;
    try {
      localStorage.setItem(STORAGE, JSON.stringify(latest.current));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  };
  useEffect(() => {
    if (isDesktop) return;
    const timer = window.setInterval(save, 5000);
    const onHide = () => {
      if (document.hidden) save();
    };
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);
  useEffect(() => {
    save();
  }, [settings, history, running]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (isDesktop || !running) return;
    let last = Date.now(),
      busy = false,
      cancelled = false;
    const controller = new AbortController();
    const timer = window.setInterval(async () => {
      if (busy) return;
      const now = Date.now();
      const elapsed = (now - last) / 1000;
      last = now;
      // A suspended/backgrounded browser must not invent readings for unobserved time.
      if (elapsed > 5 || elapsed <= 0) return;
      let watts = settings.watts;
      if (session.mode === "demo") watts = demoWatts(now / 1000);
      if (session.mode === "sensor") {
        busy = true;
        try {
          const response = await fetch("/api/agent/power", {
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(3500),
            ]),
          });
          if (!response.ok) throw new Error("Agent unavailable");
          const result = await response.json();
          if (
            !result.available ||
            !Number.isFinite(result.watts) ||
            result.watts < 0 ||
            result.watts > 10000
          )
            throw new Error(
              result.message ||
                "No supported discharging battery sensor found.",
            );
          watts = result.watts;
          if (!cancelled) {
            setSensorError("");
            setSensorName(result.source);
          }
        } catch (e) {
          if (!cancelled)
            setSensorError(
              e.message === "Failed to fetch" ||
                e.message === "Agent unavailable"
                ? "Local agent not connected. Run the agent on your laptop — see setup guide."
                : e.message,
            );
          return;
        } finally {
          busy = false;
        }
      }
      if (cancelled) return;
      const kwh = energyFor(watts, elapsed);
      setSession((s) => ({
        ...s,
        seconds: s.seconds + elapsed,
        kwh: s.kwh + kwh,
        peak: Math.max(s.peak, watts),
        points: compactPoints(
          [...s.points, { time: now, watts, seconds: elapsed, kwh }],
          now,
        ),
      }));
    }, 1000);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [running, settings.watts, session.mode]);

  const isDemo = session.mode === "demo";
  const points = session.points;
  const current = points.length ? points[points.length - 1].watts : 0;
  const average = session.seconds
    ? (session.kwh * 3600000) / session.seconds
    : 0;
  const cost = costFor(session.kwh, settings.rate);
  const monthlyKwh = energyFor(average, settings.hours * 3600 * 30);
  const monthlyCost = monthlyKwh * settings.rate;
  const unit = (value) => money(value, settings.currency);
  const allSessions = [session, ...history].filter(
    (s) => (s.mode === "demo") === isDemo,
  );
  const chartData = useMemo(() => {
    const now = Date.now();
    const cutoff =
      interval === "Second" ? now - 60000 : now - Number(range) * 3600000;
    return aggregate(
      points.filter((p) => p.time >= cutoff),
      interval,
    );
  }, [points, interval, range]);
  const sourceLabel = isDemo
    ? "Demo"
    : session.mode === "estimate"
      ? "Estimated"
      : "Battery sensor";
  const totalRecordedCost = allSessions.reduce(
    (total, s) => total + s.kwh * settings.rate,
    0,
  );
  const navigate = (name) => {
    setPage(name);
    setSidebar(false);
  };
  const exportData = async () => {
    if (isDesktop) {
      try {
        const result = await desktopBridge.exportCsv();
        if (result.saved)
          notify("CSV report saved. Costs use your current tariff.");
      } catch {
        notify(
          "Could not save the report. Choose a writable folder and try again.",
        );
      }
      return;
    }
    const blob = new Blob([csvFor(allSessions, settings)], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wattwise-${isDemo ? "demo-" : ""}${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Usage report exported. Costs use your current tariff.");
  };
  const newSession = async (mode = session.mode, nextSettings = settings) => {
    if (isDesktop) {
      if (await desktopCommand({ type: "new-session" })) {
        setModal(null);
        notify("New desktop session started. The previous session is saved.");
      }
      return;
    }
    if (session.seconds > 0 && session.mode !== "demo")
      setHistory((h) => [{ ...session, end: Date.now() }, ...h].slice(0, 49));
    setSession(
      mode === "demo"
        ? makeDemo()
        : {
            id: crypto.randomUUID(),
            mode,
            start: Date.now(),
            points: [],
            kwh: 0,
            seconds: 0,
            peak: 0,
            device: nextSettings.device,
          },
    );
    setSensorError("");
    setRunning(true);
    setModal(null);
    notify(
      mode === "demo"
        ? "Demo preview started. No real power is being measured."
        : "New tracking session started.",
    );
  };
  const applySettings = async (next, mode, launchOnLogin = false) => {
    if (isDesktop) {
      if (
        await desktopCommand({
          type: "settings",
          settings: next,
          mode,
          launchOnLogin,
        })
      ) {
        setModal(null);
        notify("Desktop preferences saved.");
      }
      return;
    }
    setSettings(next);
    if (mode !== session.mode) newSession(mode, next);
    else {
      setModal(null);
      notify("Your preferences have been saved.");
    }
  };

  return (
    <div className="app-shell">
      {sidebar && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setSidebar(false)}
        />
      )}
      <aside className={`sidebar ${sidebar ? "open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("Overview");
          }}
        >
          <span className="brand-mark">
            <Zap size={24} fill="currentColor" />
          </span>
          wattwise<span className="brand-dot">.</span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">
            <Laptop size={19} />
          </span>
          <div>
            Personal workspace<small>Your energy, in focus</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {NAV.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={`nav-item ${page === name ? "active" : ""}`}
              onClick={() => navigate(name)}
            >
              <Icon size={19} />
              {name}
              {name === "Overview" && <span className="active-dot" />}
            </button>
          ))}
        </nav>
        <div className="nav-label tools-label">PREFERENCES</div>
        <button className="nav-item" onClick={() => setModal("settings")}>
          <Settings2 size={19} />
          Settings
        </button>
        <button className="nav-item" onClick={() => setModal("help")}>
          <CircleHelp size={19} />
          Help & getting started
        </button>
        <div className="sidebar-bottom">
          <div className="eco-card">
            <span className="eco-icon">
              <Leaf size={21} />
            </span>
            <h4>Every watt counts.</h4>
            <p>
              A little awareness.
              <br />A lighter footprint.
            </p>
            <button onClick={() => setModal("tips")}>
              Explore energy tips <ArrowUpRight size={15} />
            </button>
            <div className="eco-orbit" />
          </div>
          <div className="local-status">
            <ShieldCheck size={18} />
            <div>
              Private by design
              <small>
                {isDesktop
                  ? "Data stays on this laptop"
                  : "Data stays on this browser"}
              </small>
            </div>
            <span className="status-dot" />
          </div>
          <div className="sidebar-version">
            WATTWISE <span>v1.0</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label="Open navigation"
              onClick={() => setSidebar(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{page}</strong>
          </div>
          <div className="topbar-right">
            <span className="local-tag">
              <span className="status-dot" />{" "}
              {isDesktop ? "Desktop workspace" : "Local workspace"}
            </span>
            <button
              className="icon-button help-top"
              aria-label="Help"
              onClick={() => setModal("help")}
            >
              <CircleHelp size={19} />
            </button>
            <span className="top-divider" />
            <button
              className="avatar"
              aria-label="Open preferences"
              onClick={() => setModal("settings")}
            >
              ME
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR ENERGY, AT A GLANCE</div>
              <h1>{page === "Overview" ? "Energy overview" : page}</h1>
              <p>
                {page === "Overview"
                  ? "Know your power. Understand your spend. Make every watt count."
                  : page === "Usage history"
                    ? "A little history behind every unit of energy."
                    : page === "Cost calculator"
                      ? "Turn watts into a clearer picture of your electricity bill."
                      : "One device. A more mindful way to use it."}
              </p>
            </div>
            <div className="heading-actions">
              <button
                className="button secondary export-button"
                onClick={exportData}
              >
                <ArrowDownToLine size={16} />
                Export report
              </button>
              <button
                className={`button ${running ? "primary" : "green-button"}`}
                onClick={toggleTracking}
              >
                {running ? (
                  <Pause size={15} fill="currentColor" />
                ) : (
                  <Play size={15} fill="currentColor" />
                )}
                {running ? "Pause tracking" : "Resume tracking"}
              </button>
            </div>
          </div>
          {isDesktop && (
            <div className="desktop-banner">
              <Monitor size={19} />
              <div>
                <strong>Desktop tracking is ready</strong>
                <p>
                  The × button hides to the system tray. Tracking continues
                  while awake. Set your own ₹/unit rate in Settings.
                </p>
              </div>
              <button onClick={() => setModal("help")}>
                How it works <ArrowUpRight size={15} />
              </button>
            </div>
          )}
          {storageError && (
            <div className="error-banner">
              <Info size={17} />{" "}
              {isDesktop
                ? "Unable to save to the laptop’s data folder. Export your data before quitting."
                : "Browser storage is full or unavailable. Export your data before closing this page."}
            </div>
          )}
          {sensorError && session.mode === "sensor" && (
            <div className="error-banner">
              <Info size={17} />
              <span>{sensorError} Missing readings are not counted.</span>
              <button onClick={() => setModal("help")}>
                Setup guide <ArrowRight size={15} />
              </button>
            </div>
          )}
          <div className={`source-notice ${isDemo ? "" : "real-source"}`}>
            <span>
              <span className={`status-dot ${isDemo ? "purple-dot" : ""}`} />
              <strong>
                {isDemo
                  ? "You’re exploring demo mode"
                  : session.mode === "estimate"
                    ? "Wattage-based estimate"
                    : "Battery discharge sensor"}
              </strong>
              <span className="notice-detail">
                {isDemo
                  ? "Sample data, real possibilities. Connect your device to make it yours."
                  : session.mode === "estimate"
                    ? `${settings.watts} W input · not a hardware measurement · ${isDesktop ? "background tracking enabled" : "records while this app is open"}`
                    : isDesktop
                      ? "Built-in Windows reader · battery discharge only, not wall consumption"
                      : "Battery-side power only, not wall consumption · records while this app is open"}
              </span>
            </span>
            <button onClick={() => setModal("settings")}>
              {isDemo ? "Set up tracking" : "Manage source"}
              <ArrowRight size={15} />
            </button>
          </div>
          {page === "Overview" && (
            <>
              <section className="hero">
                <div className="hero-copy">
                  <span className="hero-kicker">
                    <Sparkles size={14} /> A LITTLE INSIGHT GOES A LONG WAY
                  </span>
                  <h2>
                    Small watts.
                    <br />
                    Big picture<span>.</span>
                  </h2>
                  <p>
                    Your laptop’s energy story, one second at a time.
                    <br />
                    Less guesswork. More control.
                  </p>
                  <div className="hero-device">
                    <Laptop size={17} />
                    <strong>{settings.device}</strong>
                    <span className="hero-device-separator" />
                    <span
                      className={`status-dot ${!running ? "gray-dot" : ""}`}
                    />
                    {running ? "Tracking active" : "Tracking paused"}
                  </div>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="art-orbit orbit-one" />
                  <div className="art-orbit orbit-two" />
                  <div className="art-dot dot-one" />
                  <div className="art-dot dot-two" />
                  <div className="floating-leaf">
                    <Leaf size={26} />
                  </div>
                  <div className="floating-bolt">
                    <Zap size={27} fill="currentColor" />
                  </div>
                  <div className="laptop-art">
                    <div className="laptop-screen">
                      <div className="screen-top">
                        <span />
                        <span />
                        <span />
                      </div>
                      <div className="screen-content">
                        <div className="screen-lightning">
                          <Zap fill="currentColor" size={32} />
                        </div>
                        <div className="screen-bars">
                          {[24, 39, 30, 52, 46, 67, 58, 80, 65, 88, 72, 98].map(
                            (h, i) => (
                              <i key={i} style={{ height: h * 0.52 }} />
                            ),
                          )}
                        </div>
                        <div className="screen-line" />
                      </div>
                    </div>
                    <div className="laptop-base">
                      <span />
                    </div>
                    <div className="laptop-shadow" />
                  </div>
                  <div className="art-reading">
                    <span className="status-dot" />
                    <div>
                      POWER IN FOCUS
                      <strong>
                        {current.toFixed(1)} <span>watts</span>
                      </strong>
                    </div>
                    <Activity size={25} />
                  </div>
                </div>
                <div className="hero-caption">
                  <Leaf size={12} /> Mindful energy. Everyday.
                </div>
              </section>
              <section className="stats-grid">
                <Stat
                  icon={Zap}
                  title="Current power"
                  value={sensorError ? "—" : current.toFixed(1)}
                  unit="W"
                  tone="orange"
                  badge={
                    <Pill tone={running && !sensorError ? "green" : "gray"}>
                      <span
                        className={`status-dot ${!running ? "gray-dot" : ""}`}
                      />
                      {sensorError ? "No signal" : running ? "Live" : "Paused"}
                    </Pill>
                  }
                  foot={
                    <>
                      <span className="tiny-wave">⌁</span>
                      {sourceLabel} · updates every second
                    </>
                  }
                />
                <Stat
                  icon={BatteryCharging}
                  title="Energy used"
                  value={session.kwh.toFixed(3)}
                  unit="kWh"
                  tone="purple"
                  badge={<span className="stat-subtle">This session</span>}
                  foot={<>1 unit = 1 kilowatt-hour</>}
                />
                <Stat
                  icon={Wallet}
                  title={
                    session.mode === "sensor"
                      ? "Battery energy cost"
                      : "Electricity cost"
                  }
                  value={unit(cost)}
                  tone="green"
                  badge={<span className="stat-subtle">This session</span>}
                  foot={
                    <>
                      <span className="rate-dot" />
                      {unit(settings.rate)} per unit{" "}
                      <button
                        aria-label="Edit electricity rate"
                        onClick={() => setModal("settings")}
                      >
                        <Settings2 size={13} />
                      </button>
                    </>
                  }
                />
                <Stat
                  icon={Clock3}
                  title="Active time"
                  value={duration(session.seconds)}
                  tone="blue"
                  badge={<span className="stat-subtle">This session</span>}
                  foot={
                    <>
                      <span className="status-dot" />
                      {running
                        ? "Making every second count"
                        : "Your session is safely paused"}
                    </>
                  }
                />
              </section>
              <div className="analytics-grid">
                <section className="panel chart-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>
                        Power consumption{" "}
                        <span className="live-label">
                          <span className="status-dot" />
                          {sourceLabel}
                        </span>
                      </h3>
                      <p>A closer look at your energy throughout the day.</p>
                    </div>
                    <select
                      aria-label="Chart time range"
                      className="small-select"
                      value={range}
                      onChange={(e) => setRange(e.target.value)}
                      disabled={interval === "Second"}
                    >
                      <option value="1">Last hour</option>
                      <option value="6">Last 6 hours</option>
                      <option value="24">Last 24 hours</option>
                    </select>
                  </div>
                  <div className="chart-toolbar">
                    <div className="legend">
                      <span />
                      Power usage <small>(watts)</small>
                    </div>
                    <div className="segmented">
                      {["Second", "Minute", "Hour"].map((v) => (
                        <button
                          key={v}
                          className={interval === v ? "selected" : ""}
                          onClick={() => setIntervalChoice(v)}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="chart-wrap">
                    {chartData.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={chartData}
                          margin={{ top: 15, right: 10, left: -28, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient
                              id="powerGradient"
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="0%"
                                stopColor="#f3a16c"
                                stopOpacity={0.3}
                              />
                              <stop
                                offset="100%"
                                stopColor="#f3a16c"
                                stopOpacity={0.015}
                              />
                            </linearGradient>
                          </defs>
                          <CartesianGrid
                            strokeDasharray="3 5"
                            vertical={false}
                            stroke="#edeef1"
                          />
                          <XAxis
                            dataKey="time"
                            tickFormatter={(v) =>
                              new Date(v).toLocaleTimeString(
                                [],
                                interval === "Second"
                                  ? { minute: "2-digit", second: "2-digit" }
                                  : {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      hour12: false,
                                    },
                              )
                            }
                            axisLine={false}
                            tickLine={false}
                            minTickGap={45}
                            tick={{ fill: "#9897a2", fontSize: 10 }}
                            dy={10}
                          />
                          <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: "#9897a2", fontSize: 10 }}
                            domain={[0, "auto"]}
                            tickCount={5}
                          />
                          <Tooltip
                            content={
                              <ChartTip
                                rate={settings.rate}
                                currency={settings.currency}
                              />
                            }
                            cursor={{
                              stroke: "#f0ab81",
                              strokeDasharray: "4 4",
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="watts"
                            stroke="#ed9a67"
                            strokeWidth={2.2}
                            fill="url(#powerGradient)"
                            isAnimationActive={false}
                            dot={chartData.length < 3}
                            activeDot={{ r: 5, stroke: "#fff", strokeWidth: 3 }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <Empty title="Your energy story starts here">
                        {sensorError
                          ? "Connect your local sensor to see readings."
                          : "Start tracking to collect your first readings."}
                      </Empty>
                    )}
                  </div>
                  <div className="chart-footer">
                    <span>
                      Average <strong>{average.toFixed(1)} W</strong>
                    </span>
                    <span>
                      Peak <strong>{session.peak.toFixed(1)} W</strong>
                    </span>
                    <span className="chart-detail">
                      {interval === "Second"
                        ? "Last 60 seconds"
                        : `${interval} averages`}
                      <Info size={12} />
                    </span>
                  </div>
                </section>
                <section className="panel cost-panel">
                  <div className="panel-heading">
                    <div className="cost-title">
                      <IconBox icon={CreditCard} tone="purple" />
                      <h3>Your energy, in money</h3>
                    </div>
                  </div>
                  <div className="cost-label">
                    ESTIMATED MONTHLY COST <Info size={12} />
                  </div>
                  <div className="monthly-cost">
                    {session.seconds ? unit(monthlyCost) : "—"}
                    <span>/ mo</span>
                  </div>
                  <p className="monthly-note">
                    {session.seconds
                      ? `At ${settings.hours} hours of use per day`
                      : "Waiting for your first reading"}
                  </p>
                  <div className="budget-heading">
                    <span>Monthly budget</span>
                    <strong>{unit(settings.budget)}</strong>
                  </div>
                  <div className="budget-track">
                    <div
                      style={{
                        width: `${Math.min((monthlyCost / Math.max(settings.budget, 1)) * 100, 100)}%`,
                      }}
                    />
                  </div>
                  <div className="budget-caption">
                    <span>
                      {Math.round(
                        (monthlyCost / Math.max(settings.budget, 1)) * 100,
                      )}
                      % projected
                    </span>
                    <span>
                      {monthlyCost <= settings.budget
                        ? "Within budget"
                        : "Over budget"}
                    </span>
                  </div>
                  <div className="cost-separator" />
                  <div className="tariff-line">
                    <span>Electricity rate</span>
                    <button onClick={() => setModal("settings")}>
                      {unit(settings.rate)}
                      <small>/ kWh</small>
                      <Settings2 size={13} />
                    </button>
                  </div>
                  <div className="tariff-line">
                    <span>Currency</span>
                    <strong>
                      {settings.currency}
                      <ChevronDown size={12} />
                    </strong>
                  </div>
                  <button
                    className="button calculator-link"
                    onClick={() => navigate("Cost calculator")}
                  >
                    Open cost calculator <ArrowUpRight size={16} />
                  </button>
                </section>
              </div>
              <div className="bottom-grid">
                <section className="panel sessions-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Recent sessions</h3>
                      <p>Your power usage, neatly recorded.</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => navigate("Usage history")}
                    >
                      View history <ArrowRight size={14} />
                    </button>
                  </div>
                  <SessionTable
                    sessions={allSessions.slice(0, 3)}
                    currentId={session.id}
                    running={running}
                    settings={settings}
                  />
                </section>
                <section className="tip-card">
                  <div className="tip-top">
                    <span>
                      <Leaf size={17} /> THE WATTWISE WAY
                    </span>
                    <Sparkles size={18} />
                  </div>
                  <h3>
                    Small changes.
                    <br />
                    Smaller bills.
                  </h3>
                  <p>
                    Lower your screen brightness and let your laptop sleep when
                    you step away.
                  </p>
                  <button onClick={() => setModal("tips")}>
                    More ways to save <ArrowRight size={15} />
                  </button>
                </section>
              </div>
            </>
          )}
          {page === "Usage history" && (
            <>
              <div className="history-summary">
                <Stat
                  icon={History}
                  tone="purple"
                  title="Recorded sessions"
                  value={allSessions.length}
                  foot={`${isDemo ? "Sample" : "Locally stored"} session history`}
                />
                <Stat
                  icon={BatteryCharging}
                  tone="orange"
                  title="Total energy"
                  value={allSessions
                    .reduce((sum, s) => sum + s.kwh, 0)
                    .toFixed(3)}
                  unit="kWh"
                  foot="Across the sessions shown below"
                />
                <Stat
                  icon={Wallet}
                  tone="green"
                  title="Total cost"
                  value={unit(totalRecordedCost)}
                  foot="Recalculated at your current rate"
                />
              </div>
              <section className="panel history-panel">
                <div className="panel-heading">
                  <div>
                    <h3>
                      Session history{" "}
                      <span className="count-badge">{allSessions.length}</span>
                    </h3>
                    <p>
                      {isDemo
                        ? "Demo data is kept separate from your real tracking."
                        : "Up to 50 sessions saved locally. Export regularly to keep a permanent copy."}
                    </p>
                  </div>
                  <div className="table-actions">
                    <select
                      className="small-select"
                      aria-label="Filter sessions"
                      value={historyFilter}
                      onChange={(e) => setHistoryFilter(e.target.value)}
                    >
                      <option>All sessions</option>
                      <option>Active session</option>
                      <option>Completed</option>
                    </select>
                    <button
                      className="button secondary"
                      onClick={() => setModal("new")}
                    >
                      <Plus size={16} />
                      New session
                    </button>
                  </div>
                </div>
                <SessionTable
                  sessions={allSessions.filter(
                    (s) =>
                      historyFilter === "All sessions" ||
                      (historyFilter === "Active session"
                        ? s.id === session.id
                        : s.id !== session.id),
                  )}
                  currentId={session.id}
                  running={running}
                  settings={settings}
                />
                <div className="table-note">
                  <Info size={14} /> Detailed samples: last 10 minutes by
                  second, then minute summaries for up to 7 days. Session totals
                  are retained.
                </div>
              </section>
            </>
          )}
          {page === "Cost calculator" && (
            <div className="calculator-grid">
              <section className="panel calculator-form">
                <div className="panel-heading">
                  <div>
                    <h3>What does your device cost?</h3>
                    <p>Adjust your routine. See the difference.</p>
                  </div>
                  <IconBox icon={Wallet} />
                </div>
                <label>
                  Device power consumption <span>Watts (W)</span>
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    value={calc.watts}
                    onChange={(e) =>
                      setCalc({
                        ...calc,
                        watts: Math.min(
                          10000,
                          Math.max(0, Number(e.target.value)),
                        ),
                      })
                    }
                  />
                </label>
                <div className="preset-buttons">
                  {[
                    ["Light use", 30],
                    ["Everyday laptop", 65],
                    ["Gaming PC", 350],
                  ].map(([name, watts]) => (
                    <button
                      key={name}
                      className={calc.watts === watts ? "selected" : ""}
                      onClick={() => setCalc({ ...calc, watts })}
                    >
                      {name}
                      <small>{watts} W</small>
                    </button>
                  ))}
                </div>
                <label>
                  Daily usage <span>{calc.hours} hours / day</span>
                  <input
                    type="range"
                    min="1"
                    max="24"
                    value={calc.hours}
                    onChange={(e) =>
                      setCalc({ ...calc, hours: Number(e.target.value) })
                    }
                  />
                </label>
                <div className="range-labels">
                  <span>1 hour</span>
                  <span>24 hours</span>
                </div>
                <label>
                  Number of days
                  <input
                    type="number"
                    min="1"
                    max="366"
                    value={calc.days}
                    onChange={(e) =>
                      setCalc({
                        ...calc,
                        days: Math.min(
                          366,
                          Math.max(1, Number(e.target.value)),
                        ),
                      })
                    }
                  />
                </label>
                <div className="calculator-rate">
                  <Info size={17} />
                  <span>
                    Calculated at <strong>{unit(settings.rate)} per kWh</strong>
                  </span>
                  <button onClick={() => setModal("settings")}>Change</button>
                </div>
              </section>
              <section className="calculator-result">
                <span className="hero-kicker">
                  <Sparkles size={15} /> YOUR ESTIMATED ELECTRICITY COST
                </span>
                <div className="result-amount">
                  {unit(
                    energyFor(calc.watts, calc.hours * 3600 * calc.days) *
                      settings.rate,
                  )}
                </div>
                <p>for {calc.days} days of your routine</p>
                <div className="result-stat">
                  <BatteryCharging size={20} />
                  <span>Energy consumed</span>
                  <strong>
                    {energyFor(
                      calc.watts,
                      calc.hours * 3600 * calc.days,
                    ).toFixed(3)}{" "}
                    kWh
                  </strong>
                </div>
                <div className="result-stat">
                  <Clock3 size={20} />
                  <span>Daily cost</span>
                  <strong>
                    {unit(
                      energyFor(calc.watts, calc.hours * 3600) * settings.rate,
                    )}
                  </strong>
                </div>
                <div className="result-stat">
                  <Zap size={20} />
                  <span>Cost per hour</span>
                  <strong>{unit((calc.watts / 1000) * settings.rate)}</strong>
                </div>
                <div className="formula">
                  Watts × hours × days ÷ 1,000 = units (kWh)
                  <br />
                  Units × your electricity rate = estimated cost
                </div>
                <p className="result-disclaimer">
                  An estimate, not a bill. Excludes fixed charges, taxes and
                  tiered tariffs. Currency selection does not convert exchange
                  rates.
                </p>
              </section>
            </div>
          )}
          {page === "My device" && (
            <div className="device-grid">
              <section className="panel device-panel">
                <div className="device-big-icon">
                  <Laptop size={65} strokeWidth={1.3} />
                </div>
                <Pill tone="purple">Personal device</Pill>
                <h2>{settings.device}</h2>
                <p>{sourceLabel} power tracking</p>
                <div className="device-spec">
                  <span>Recording status</span>
                  <strong>
                    {running
                      ? sensorError
                        ? "Waiting for sensor"
                        : "Active"
                      : "Paused"}
                  </strong>
                </div>
                <div className="device-spec">
                  <span>Power source</span>
                  <strong>{sourceLabel}</strong>
                </div>
                <div className="device-spec">
                  <span>Current reading</span>
                  <strong>
                    {sensorError ? "Unavailable" : `${current.toFixed(1)} W`}
                  </strong>
                </div>
                <div className="device-spec">
                  <span>Sensor</span>
                  <strong>{sensorName || "Not connected"}</strong>
                </div>
                <button
                  className="button primary"
                  onClick={() => setModal("settings")}
                >
                  <SlidersHorizontal size={16} />
                  Configure device
                </button>
              </section>
              <section className="panel setup-panel">
                <IconBox icon={Plug} />
                <h2>From a preview to your power.</h2>
                <p>Choose the tracking method that works for your device.</p>
                <div className="setup-step">
                  <span>01</span>
                  <div>
                    <h3>Start with an estimate</h3>
                    <p>
                      Enter an average wattage. We record elapsed time and
                      calculate energy every second. A charger’s rated wattage
                      is a maximum, not actual usage.
                    </p>
                  </div>
                </div>
                <div className="setup-step">
                  <span>02</span>
                  <div>
                    <h3>Connect a battery sensor</h3>
                    <p>
                      {isDesktop
                        ? "The built-in Windows reader automatically reads supported discharging batteries. No separate Python agent is required."
                        : "Run the included local agent on a supported Windows or Linux laptop. It reads battery discharge power, not total electricity drawn at the wall."}
                    </p>
                  </div>
                </div>
                <div className="setup-step">
                  <span>03</span>
                  <div>
                    <h3>Need whole-device accuracy?</h3>
                    <p>
                      Use an external power meter or energy-monitoring smart
                      plug. Desktop PCs and plugged-in laptops generally need
                      one for wall-power measurement.
                    </p>
                  </div>
                </div>
                <button
                  className="button secondary"
                  onClick={() => setModal("help")}
                >
                  Read the setup guide
                  <ArrowUpRight size={16} />
                </button>
              </section>
            </div>
          )}
          <footer className="main-footer">
            <span>
              <ShieldCheck size={13} /> Your data stays yours. Stored locally,
              never uploaded.
            </span>
            <span>
              Made for a more mindful everyday. <Zap size={12} />
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {modal && (
        <Modal
          title={
            modal === "settings"
              ? "Make Wattwise yours"
              : modal === "help"
                ? "Let’s get you connected"
                : modal === "tips"
                  ? "A little less energy. A little more impact."
                  : "Start a fresh session?"
          }
          onClose={() => setModal(null)}
        >
          {modal === "settings" && (
            <SettingsForm
              settings={settings}
              mode={session.mode}
              desktopInfo={desktopInfo}
              onSave={applySettings}
              onCancel={() => setModal(null)}
            />
          )}
          {modal === "new" && (
            <>
              <p>
                Your current session will be saved in history. A new session
                starts from zero using the same tracking source.
              </p>
              <div className="modal-actions">
                <button
                  className="button secondary"
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button className="button primary" onClick={() => newSession()}>
                  <Plus size={16} />
                  Start new session
                </button>
              </div>
            </>
          )}
          {modal === "help" && isDesktop && <DesktopHelp />}
          {modal === "help" && !isDesktop && (
            <div className="help-content">
              <div className="help-callout">
                <Info size={20} />
                <p>
                  A browser cannot directly measure your computer’s electricity
                  use. Wattwise always labels sample data, estimates, and
                  battery sensor readings separately.
                </p>
              </div>
              <h3>Quick start: estimated tracking</h3>
              <p>
                Open <strong>Settings → Wattage estimate</strong>, enter your
                average watts and cost per unit, then save. Keep this tab open
                to record usage. Long sleep/background gaps are skipped, not
                guessed.
              </p>
              <h3>Local sensor setup (Windows / Linux)</h3>
              <p>
                Run Wattwise on the laptop you want to monitor. Install Node.js
                20+ and Python 3.10+, then open two terminals in the project
                folder:
              </p>
              <pre>
                <code>npm install{"\n"}npm run dev</code>
              </pre>
              <pre>
                <code>python agent/power_agent.py</code>
              </pre>
              <p>
                Open the local app URL shown by Vite and select{" "}
                <strong>Battery sensor</strong> in Settings. The online preview
                cannot reach the sensor on your laptop.
              </p>
              <p>
                Supported: Linux sysfs battery power/current sensors and Windows
                WMI BatteryStatus.DischargeRate. The laptop must be discharging.
                No compatible sensor? Wattwise shows “No signal” instead of
                guessing.
              </p>
              <h3>What is one unit?</h3>
              <p>
                <strong>1 unit = 1 kWh.</strong> A 100 W device running for 10
                hours consumes 1 unit. At ₹8 per unit, that costs ₹8. Tariff
                changes recalculate all displayed costs; currencies are not
                automatically converted.
              </p>
              <h3>Saving your readings</h3>
              <p>
                Data is saved in this browser every 5 seconds. Reopened sessions
                start paused. Export CSV regularly: browser storage can be
                cleared, and this app doesn’t run as a background system
                service.
              </p>
            </div>
          )}
          {modal === "tips" && (
            <div className="tips-list">
              {[
                [
                  Monitor,
                  "Give your display a little downtime",
                  "Lower brightness to a comfortable level and set the display to turn off after a few minutes of inactivity.",
                ],
                [
                  Power,
                  "Sleep more, waste less",
                  "Use sleep mode when taking a break. Shut down your device when you will not need it for an extended period.",
                ],
                [
                  BatteryCharging,
                  "Try your system’s efficiency mode",
                  "Battery saver or energy saver modes can reduce background activity and performance-related power draw.",
                ],
                [
                  Cpu,
                  "Close what you’re not using",
                  "Unused games, heavy applications, and background tasks may keep your processor or graphics card busy.",
                ],
              ].map(([Icon, title, text]) => (
                <div className="tip-item" key={title}>
                  <IconBox icon={Icon} tone="green" />
                  <div>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                </div>
              ))}
              <div className="help-callout">
                <Leaf size={19} />
                <p>
                  The impact depends on your device and usage. Compare similar
                  sessions to find what works for you.
                </p>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function Stat({ icon, title, value, unit, tone, badge, foot }) {
  return (
    <article className="stat-card">
      <div className="stat-top">
        <IconBox icon={icon} tone={tone} />
        {badge}
      </div>
      <h3>{title}</h3>
      <div className="stat-value">
        {value}
        <span>{unit}</span>
      </div>
      <div className="stat-foot">{foot}</div>
    </article>
  );
}
function SessionTable({ sessions, currentId, running, settings }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>DEVICE & SESSION</th>
            <th>DURATION</th>
            <th>ENERGY</th>
            <th>COST</th>
            <th>STATUS</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id}>
              <td>
                <span className="table-device">
                  <span className="table-laptop">
                    <Laptop size={19} />
                  </span>
                  <span>
                    <strong>{s.device}</strong>
                    <small>
                      {new Date(s.start).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      ·{" "}
                      {new Date(s.start).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      <span className="source-label">
                        {s.mode === "demo"
                          ? "Demo"
                          : s.mode === "estimate"
                            ? "Estimate"
                            : "Battery"}
                      </span>
                    </small>
                  </span>
                </span>
              </td>
              <td>{duration(s.seconds)}</td>
              <td>
                {s.kwh.toFixed(3)} <small>kWh</small>
              </td>
              <td className="table-cost">
                {money(s.kwh * settings.rate, settings.currency)}
              </td>
              <td>
                <Pill tone={s.id === currentId && running ? "green" : "gray"}>
                  {s.id === currentId ? (
                    <>
                      <span
                        className={`status-dot ${!running ? "gray-dot" : ""}`}
                      />
                      {running ? "Recording" : "Paused"}
                    </>
                  ) : (
                    "Completed"
                  )}
                </Pill>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!sessions.length && (
        <Empty title="No sessions here yet">
          Completed sessions will appear after you start a new one.
        </Empty>
      )}
    </div>
  );
}
function Modal({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const el = ref.current;
    el.focus();
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handler = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const nodes = el.querySelectorAll(
          'button, input, select, [tabindex="0"]',
        );
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === el)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    el.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = before;
      el.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        ref={ref}
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">WATTWISE</span>
            <h2 id="modal-title">{title}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function SettingsForm({ settings, mode, desktopInfo, onSave, onCancel }) {
  const [launchOnLogin, setLaunchOnLogin] = useState(
    desktopInfo?.launchOnLogin || false,
  );
  const [draft, setDraft] = useState({ ...settings });
  const [source, setSource] = useState(mode);
  const change = (key, value) => setDraft((s) => ({ ...s, [key]: value }));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(
          { ...draft, device: draft.device.trim() || "My laptop" },
          source,
          launchOnLogin,
        );
      }}
    >
      <p className="form-intro">Your device, your tariff, your way to track.</p>
      <label>
        Device name
        <input
          required
          maxLength={40}
          value={draft.device}
          onChange={(e) => change("device", e.target.value)}
        />
      </label>
      <label>Tracking source</label>
      <div className="source-options">
        {[
          ["demo", Sparkles, "Demo preview", "Explore with sample data"],
          ["estimate", Gauge, "Wattage estimate", "Calculate from your input"],
          [
            "sensor",
            Plug,
            "Battery sensor",
            isDesktop ? "Built-in Windows reader" : "Requires the local agent",
          ],
        ].map(([id, Icon, title, description]) => (
          <button
            key={id}
            className={source === id ? "selected" : ""}
            type="button"
            onClick={() => setSource(id)}
            aria-pressed={source === id}
          >
            <Icon size={20} />
            <strong>{title}</strong>
            <small>{description}</small>
            {source === id && <Check className="source-check" size={13} />}
          </button>
        ))}
      </div>
      {source === "estimate" && (
        <label>
          Average power (watts)
          <input
            type="number"
            min="1"
            max="10000"
            step="0.1"
            required
            value={draft.watts}
            onChange={(e) => change("watts", Number(e.target.value))}
          />
          <small>
            Use an average measured wattage if available. Charger rating is not
            actual consumption.
          </small>
        </label>
      )}
      {source === "sensor" && (
        <div className="help-callout">
          <Info size={18} />
          <p>
            {isDesktop
              ? "The built-in Windows reader runs automatically. No separate agent needed. Battery discharge power is not wall power. Charging or unsupported batteries show no signal."
              : "Run the local agent on your laptop. Battery discharge power is not wall power. Unsupported or plugged-in devices may not report readings."}
          </p>
        </div>
      )}
      <div className="form-row">
        <label>
          Currency
          <select
            aria-label="Currency"
            value={draft.currency}
            onChange={(e) => change("currency", e.target.value)}
          >
            <option value="INR">INR — Indian rupee (₹)</option>
            <option value="USD">USD — US dollar ($)</option>
            <option value="EUR">EUR — Euro (€)</option>
            <option value="GBP">GBP — British pound (£)</option>
            <option value="JPY">JPY — Japanese yen (¥)</option>
            <option value="AED">AED — UAE dirham</option>
          </select>
        </label>
        <label>
          Rate per unit (kWh)
          <input
            type="number"
            min="0"
            max="100000"
            step="0.01"
            required
            value={draft.rate}
            onChange={(e) => change("rate", Number(e.target.value))}
          />
        </label>
      </div>
      <div className="form-row">
        <label>
          Monthly budget ({draft.currency})
          <input
            type="number"
            min="1"
            max="10000000"
            step="0.01"
            required
            value={draft.budget}
            onChange={(e) => change("budget", Number(e.target.value))}
          />
        </label>
        <label>
          Expected daily use (hours)
          <input
            type="number"
            min="0.5"
            max="24"
            step="0.5"
            required
            value={draft.hours}
            onChange={(e) => change("hours", Number(e.target.value))}
          />
        </label>
      </div>
      {isDesktop && (
        <label className="startup-option">
          <input
            type="checkbox"
            checked={launchOnLogin}
            disabled={!desktopInfo?.canAutoStart}
            onChange={(e) => setLaunchOnLogin(e.target.checked)}
          />
          <div>
            Start with Windows
            <small>
              {desktopInfo?.canAutoStart
                ? "Launch in the system tray when you sign in. Off by default."
                : "Available in the Windows desktop app."}
            </small>
          </div>
        </label>
      )}
      <p className="form-footnote">
        Currency changes do not convert exchange rates. Enter your local tariff.
        Changing source starts a new session; non-demo sessions are saved.
      </p>
      <div className="modal-actions">
        <button type="button" className="button secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="button primary" type="submit">
          <Check size={16} />
          Save preferences
        </button>
      </div>
    </form>
  );
}
