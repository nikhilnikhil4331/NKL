import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  DEFAULT_SETTINGS,
  compactPoints,
  demoWatts,
  energyFor,
  makeDemo,
} from "../src/energy.js";
import { restoreState } from "../src/persistence.js";

export class DesktopTracker extends EventEmitter {
  constructor({
    initial = null,
    sensor,
    writeState,
    now = Date.now,
    monotonic = () => performance.now(),
  }) {
    super();
    this.now = now;
    this.monotonic = monotonic;
    this.sensor = sensor;
    this.writeState = writeState;
    this.state = initial || {
      version: 1,
      settings: { ...DEFAULT_SETTINGS },
      session: this.emptySession("sensor", DEFAULT_SETTINGS),
      history: [],
      running: true,
    };
    this.state.running = initial ? initial.running === true : true;
    this.state.sensorError = "";
    this.state.sensorName = "";
    this.state.storageError = false;
    this.suspended = false;
    this.generation = 0;
  }
  emptySession(mode, settings) {
    return mode === "demo"
      ? makeDemo(this.now())
      : {
          id: randomUUID(),
          mode,
          start: this.now(),
          points: [],
          kwh: 0,
          seconds: 0,
          peak: 0,
          device: settings.device,
        };
  }
  publish() {
    this.emit("state", this.state);
  }
  start() {
    this.resetSource();
    this.saveTimer = setInterval(() => this.flush(), 5000);
  }
  stopSource() {
    this.generation++;
    clearInterval(this.sampleTimer);
    this.stopSensor?.();
    this.stopSensor = null;
    this.last = null;
  }
  resetSource() {
    this.stopSource();
    if (!this.state.running || this.suspended) {
      this.publish();
      return;
    }
    const generation = this.generation;
    if (this.state.session.mode === "sensor") {
      this.state.sensorError = "Checking the Windows battery sensor…";
      this.stopSensor = this.sensor((sample) => {
        if (generation === this.generation) this.accept(sample);
      });
    } else {
      this.state.sensorError = "";
      this.state.sensorName = "";
      this.last = this.monotonic();
      this.sampleTimer = setInterval(
        () =>
          this.accept({
            available: true,
            watts:
              this.state.session.mode === "demo"
                ? demoWatts(this.now() / 1000)
                : this.state.settings.watts,
            source: "",
          }),
        1000,
      );
    }
    this.publish();
  }
  accept(sample) {
    if (!this.state.running || this.suspended) return;
    if (
      !sample.available ||
      !Number.isFinite(sample.watts) ||
      sample.watts < 0 ||
      sample.watts > 10000
    ) {
      this.last = null;
      this.state.sensorName = "";
      this.state.sensorError =
        sample.message ||
        "No valid battery reading. Missing time is not counted.";
      this.publish();
      return;
    }
    const tick = this.monotonic();
    const elapsed = this.last === null ? 0 : (tick - this.last) / 1000;
    this.last = tick;
    this.state.sensorError = "";
    this.state.sensorName = sample.source || "";
    // Never backfill a sensor outage, system sleep, relaunch or a clock change.
    if (elapsed > 0 && elapsed <= 5) {
      const watts = sample.watts,
        time = this.now(),
        kwh = energyFor(watts, elapsed);
      const s = this.state.session;
      this.state.session = {
        ...s,
        seconds: s.seconds + elapsed,
        kwh: s.kwh + kwh,
        peak: Math.max(s.peak, watts),
        points: compactPoints(
          [...s.points, { time, watts, seconds: elapsed, kwh }],
          time,
        ),
      };
    }
    this.publish();
  }
  setRunning(running) {
    if (typeof running !== "boolean")
      throw new Error("Invalid tracking state.");
    this.state.running = running;
    this.resetSource();
    this.flush();
  }
  newSession(mode = this.state.session.mode, settings = this.state.settings) {
    const s = this.state.session;
    if (s.mode !== "demo" && s.seconds > 0)
      this.state.history = [
        { ...s, end: this.now() },
        ...this.state.history,
      ].slice(0, 49);
    this.state.settings = settings;
    this.state.session = this.emptySession(mode, settings);
    this.state.running = true;
    this.resetSource();
    this.flush();
  }
  validateSettings(settings, mode) {
    if (
      !["demo", "estimate", "sensor"].includes(mode) ||
      !restoreState(JSON.stringify({ ...this.state, settings }))
    )
      throw new Error(
        "Invalid preferences. Check wattage, tariff, currency and device name.",
      );
  }
  setSettings(settings, mode) {
    this.validateSettings(settings, mode);
    const next = Object.fromEntries(
      Object.keys(DEFAULT_SETTINGS).map((key) => [key, settings[key]]),
    );
    if (mode !== this.state.session.mode) this.newSession(mode, next);
    else {
      this.state.settings = next;
      this.state.session.device = next.device;
      this.resetSource();
      this.flush();
    }
  }
  suspend() {
    this.suspended = true;
    this.stopSource();
    this.flush();
  }
  resume() {
    this.suspended = false;
    this.resetSource();
  }
  flush() {
    try {
      this.writeState({
        version: 1,
        settings: this.state.settings,
        session: this.state.session,
        history: this.state.history,
        running: this.state.running,
      });
      this.state.storageError = false;
    } catch {
      this.state.storageError = true;
    }
    this.publish();
  }
  close() {
    clearInterval(this.saveTimer);
    this.stopSource();
    this.flush();
  }
}
