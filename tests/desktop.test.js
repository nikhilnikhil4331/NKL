import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { DesktopTracker } from "../desktop/tracker.js";
import {
  parseBatterySample,
  startWindowsSensor,
} from "../desktop/windows-sensor.js";
import { readState, writeState } from "../desktop/store.js";
import { DEFAULT_SETTINGS } from "../src/energy.js";

function fixture(t, initial = null) {
  let tick = 0,
    sample,
    writes = [],
    stopped = 0;
  const tracker = new DesktopTracker({
    initial,
    monotonic: () => tick,
    now: () => 1700000000000 + tick,
    sensor: (callback) => {
      sample = callback;
      return () => {
        stopped++;
      };
    },
    writeState: (state) => writes.push(JSON.parse(JSON.stringify(state))),
  });
  tracker.start();
  t.after(() => tracker.close());
  return {
    tracker,
    sample: (input) => sample(input),
    advance: (ms) => {
      tick += ms;
    },
    writes,
    stopped: () => stopped,
  };
}
const valid = { available: true, watts: 100, source: "Test battery" };

test("desktop starts with sensor, not demo, and tracks without any renderer", (t) => {
  const f = fixture(t);
  assert.equal(f.tracker.state.session.mode, "sensor");
  assert.equal(f.tracker.state.session.points.length, 0);
  f.sample(valid);
  f.advance(1000);
  f.sample(valid);
  assert.equal(f.tracker.state.session.seconds, 1);
  assert.equal(f.tracker.state.session.kwh, 100 / 3600000);
  f.tracker.flush();
  assert.equal(f.writes.at(-1).session.kwh, 100 / 3600000);
});
test("outages, long gaps and suspend/resume never invent energy", (t) => {
  const f = fixture(t);
  f.sample(valid);
  f.advance(1000);
  f.sample(valid);
  const before = f.tracker.state.session.kwh;
  f.sample({ available: false });
  f.advance(10000);
  f.sample(valid);
  assert.equal(f.tracker.state.session.kwh, before);
  f.advance(6000);
  f.sample(valid);
  assert.equal(f.tracker.state.session.kwh, before);
  f.tracker.suspend();
  f.advance(3600000);
  f.sample(valid);
  f.tracker.resume();
  f.sample(valid);
  assert.equal(f.tracker.state.session.kwh, before);
  f.advance(1000);
  f.sample(valid);
  assert.equal(f.tracker.state.session.seconds, 2);
});
test("pause cancels stale callbacks and preserves recorded totals", (t) => {
  const f = fixture(t);
  f.sample(valid);
  f.advance(1000);
  f.sample(valid);
  f.tracker.setRunning(false);
  f.advance(1000);
  f.sample(valid);
  assert.equal(f.tracker.state.session.seconds, 1);
  assert.equal(f.writes.at(-1).running, false);
  assert.ok(f.stopped() > 0);
  f.tracker.setRunning(true);
  f.sample(valid);
  f.advance(1000);
  f.sample(valid);
  assert.equal(f.tracker.state.session.seconds, 2);
});
test("new source archives real readings and validates preferences", (t) => {
  const f = fixture(t);
  f.sample(valid);
  f.advance(1000);
  f.sample(valid);
  assert.throws(() =>
    f.tracker.setSettings({ ...DEFAULT_SETTINGS, watts: -10 }, "estimate"),
  );
  assert.throws(() => f.tracker.setSettings(DEFAULT_SETTINGS, "fake"));
  f.tracker.setSettings({ ...DEFAULT_SETTINGS, rate: 10 }, "estimate");
  assert.equal(f.tracker.state.history.length, 1);
  assert.equal(f.tracker.state.history[0].mode, "sensor");
  assert.equal(f.tracker.state.session.mode, "estimate");
  assert.equal(f.tracker.state.session.kwh, 0);
  f.advance(1000);
  f.tracker.accept({ available: true, watts: 65 });
  assert.equal(f.tracker.state.session.kwh, 65 / 3600000);
});
test("relaunch resumes active preference but does not backfill closed time", (t) => {
  const f = fixture(t);
  f.sample(valid);
  f.advance(1000);
  f.sample(valid);
  f.tracker.flush();
  const restored = fixture(t, f.writes.at(-1));
  restored.advance(3600000);
  restored.sample(valid);
  assert.equal(restored.tracker.state.session.seconds, 1);
  const paused = { ...f.writes.at(-1), running: false };
  const p = fixture(t, paused);
  assert.equal(p.tracker.state.running, false);
});
test("failed disk writes surface an error without dropping in-memory totals", (t) => {
  const f = fixture(t);
  f.sample(valid);
  f.advance(1000);
  f.sample(valid);
  f.tracker.writeState = () => {
    throw new Error("disk full");
  };
  f.tracker.flush();
  assert.equal(f.tracker.state.storageError, true);
  assert.equal(f.tracker.state.session.seconds, 1);
});
test("Windows rates are milliwatts; plugged-in/sentinel/missing values are unavailable", () => {
  const b = {
    Discharging: true,
    PowerOnline: false,
    Charging: false,
    DischargeRate: 23500,
  };
  assert.equal(parseBatterySample({ batteries: [b] }).watts, 23.5);
  assert.equal(parseBatterySample({ batteries: [b, b] }).watts, 47);
  for (const changed of [
    { PowerOnline: true },
    { Charging: true },
    { Discharging: false },
    { DischargeRate: 4294967295 },
    { DischargeRate: 0 },
    { DischargeRate: "23" },
  ])
    assert.equal(
      parseBatterySample({ batteries: [{ ...b, ...changed }] }).available,
      false,
    );
  assert.equal(parseBatterySample({ batteries: [] }).available, false);
  assert.equal(parseBatterySample({ error: true }).available, false);
});
test("one persistent hidden PowerShell reader handles split JSON and cleanup", () => {
  const proc = new EventEmitter();
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  let killed = false,
    command;
  proc.kill = () => {
    killed = true;
    proc.emit("close");
  };
  const samples = [];
  const stop = startWindowsSensor((v) => samples.push(v), {
    platform: "win32",
    spawnProcess: (...args) => {
      command = args;
      return proc;
    },
  });
  proc.stdout.write('{"batteries":[{"Discharging":true,');
  proc.stdout.write('"DischargeRate":24000}]}\r\n');
  assert.equal(samples[0].watts, 24);
  assert.equal(command[2].windowsHide, true);
  assert.ok(command[1].includes("-EncodedCommand"));
  assert.ok(!command[1].includes("-ExecutionPolicy"));
  stop();
  assert.equal(killed, true);
});
test("atomic disk storage roundtrip; invalid JSON is preserved as backup", (t) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "wattwise-test-"));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const file = path.join(folder, "state.json");
  const f = fixture(t);
  writeState(file, f.tracker.state);
  assert.equal(readState(file).session.mode, "sensor");
  assert.equal(fs.existsSync(file + ".tmp"), false);
  fs.writeFileSync(file, "{broken");
  assert.equal(readState(file), null);
  assert.ok(fs.readdirSync(folder).some((name) => name.endsWith(".bak")));
});
