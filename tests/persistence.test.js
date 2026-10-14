import { test } from "node:test";
import assert from "node:assert/strict";
import { restoreState } from "../src/persistence.js";
import { makeDemo, DEFAULT_SETTINGS } from "../src/energy.js";
const good = () => ({
  version: 1,
  settings: { ...DEFAULT_SETTINGS },
  session: makeDemo(),
  history: [],
});
test("valid saved session is restored without losing energy", () => {
  const state = good();
  assert.deepEqual(restoreState(JSON.stringify(state)), state);
});
test("malformed JSON and invalid shapes recover safely", () => {
  for (const raw of ["{not json", "null", "{}", "[]", "true"])
    assert.equal(restoreState(raw), null);
  const state = good();
  state.history = [{}];
  assert.equal(restoreState(JSON.stringify(state)), null);
});
test("invalid currency, negative energy, and missing settings cannot crash the UI", () => {
  const mutations = [
    (s) => (s.settings.currency = "INVALID"),
    (s) => (s.session.kwh = -1),
    (s) => delete s.settings.watts,
    (s) => (s.session.points[0].watts = "oops"),
  ];
  for (const mutate of mutations) {
    const state = good();
    mutate(state);
    assert.equal(restoreState(JSON.stringify(state)), null);
  }
});
