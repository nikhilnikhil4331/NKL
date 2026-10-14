import { test } from "node:test";
import assert from "node:assert/strict";
import {
  energyFor,
  costFor,
  aggregate,
  makeDemo,
  compactPoints,
  csvFor,
  money,
  duration,
} from "../src/energy.js";

test("100 W for 10 hours is one unit and costs INR 8 at rate 8", () => {
  assert.equal(energyFor(100, 36000), 1);
  assert.equal(costFor(1, 8), 8);
  assert.equal(money(8, "INR"), "₹8.00");
});
test("one-second samples preserve fractional energy", () => {
  const total = Array.from({ length: 3600 }, () => energyFor(65, 1)).reduce(
    (a, b) => a + b,
    0,
  );
  assert.ok(Math.abs(total - 0.065) < 1e-12);
  assert.equal(energyFor(-5, 100), 0);
  assert.equal(energyFor(100, -5), 0);
});
test("minute buckets use time-weighted power and sum energy", () => {
  const points = [
    { time: 1000, watts: 30, seconds: 1, kwh: energyFor(30, 1) },
    { time: 2000, watts: 90, seconds: 3, kwh: energyFor(90, 3) },
  ];
  const grouped = aggregate(points, "Minute");
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].watts, 75);
  assert.equal(grouped[0].kwh, energyFor(75, 4));
  assert.equal(aggregate(points, "Second").length, 2);
});
test("hourly boundaries do not blend across hours", () => {
  const points = [
    { time: 3599000, watts: 20, seconds: 1, kwh: energyFor(20, 1) },
    { time: 3600000, watts: 40, seconds: 1, kwh: energyFor(40, 1) },
  ];
  assert.deepEqual(
    aggregate(points, "Hour").map((p) => p.watts),
    [20, 40],
  );
});
test("compaction retains energy and durations within retention window", () => {
  const now = 200000000;
  const points = Array.from({ length: 3600 }, (_, i) => ({
    time: now - (3600 - i) * 1000,
    watts: 100,
    seconds: 1,
    kwh: energyFor(100, 1),
  }));
  const result = compactPoints(points, now);
  assert.ok(result.length < 700);
  assert.equal(
    result.reduce((s, p) => s + p.seconds, 0),
    3600,
  );
  assert.ok(Math.abs(result.reduce((s, p) => s + p.kwh, 0) - 0.1) < 1e-12);
});
test("demo totals and labels are consistent", () => {
  const demo = makeDemo(200000000);
  assert.equal(demo.mode, "demo");
  assert.equal(demo.points.length, 360);
  assert.equal(demo.seconds, 21600);
  assert.equal(
    demo.kwh,
    demo.points.reduce((s, p) => s + p.kwh, 0),
  );
});
test("CSV includes source, precise units, and selected currency", () => {
  const csv = csvFor([makeDemo()], { rate: 8, currency: "INR" });
  assert.ok(csv.includes("Energy (kWh)"));
  assert.ok(csv.includes('"demo"'));
  assert.ok(csv.includes('"INR"'));
  assert.equal(csv.split("\n").length, 361);
});
test("time is formatted for hours and minutes", () => {
  assert.equal(duration(3661), "1h 1m");
  assert.equal(duration(61), "1m 1s");
});
