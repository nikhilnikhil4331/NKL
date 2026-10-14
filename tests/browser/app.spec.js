import { test, expect } from "@playwright/test";

async function configureEstimate(page, watts = "100", rate = "8") {
  await page.getByRole("button", { name: "Set up tracking" }).click();
  await page.getByRole("button", { name: /Wattage estimate/ }).click();
  await page.getByLabel("Average power (watts)").fill(watts);
  await page.getByLabel("Rate per unit (kWh)").fill(rate);
  await page.getByRole("button", { name: "Save preferences" }).click();
}

test("demo loads without JS errors and chart intervals work", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Energy overview" }),
  ).toBeVisible();
  await expect(page.getByText("You’re exploring demo mode")).toBeVisible();
  for (const label of ["Second", "Minute", "Hour"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(
      page.getByRole("button", { name: label, exact: true }),
    ).toHaveClass("selected");
  }
  await expect(page.locator(".recharts-area")).toBeVisible();
  expect(errors).toEqual([]);
});

test("tracking records real elapsed time, pauses, and restores safely", async ({
  page,
}) => {
  await page.goto("/");
  await configureEstimate(page);
  await expect(page.getByText("Wattage-based estimate")).toBeVisible();
  await expect(page.locator(".stat-value").first()).toContainText("100.0", {
    timeout: 4000,
  });
  await page
    .getByRole("button", { name: "Pause tracking", exact: true })
    .click();
  let state = JSON.parse(
    await page.evaluate(() => localStorage.getItem("wattwise.v1")),
  );
  expect(state.session.mode).toBe("estimate");
  expect(state.session.seconds).toBeGreaterThan(0);
  expect(state.session.kwh).toBeCloseTo(
    (state.session.seconds * 100) / 3600000,
    10,
  );
  const energy = state.session.kwh;
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Resume tracking" }),
  ).toBeVisible();
  state = JSON.parse(
    await page.evaluate(() => localStorage.getItem("wattwise.v1")),
  );
  expect(state.session.kwh).toBe(energy);
  await page.getByRole("button", { name: "Resume tracking" }).click();
  await page
    .getByRole("button", { name: "Usage history", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Usage history", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New session", exact: true }).click();
  await page.getByRole("button", { name: "Start new session" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.getByLabel("Filter sessions").selectOption("Completed");
  await expect(page.locator("tbody tr")).toHaveCount(1);
});

test("calculator applies custom currency and tariff", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Currency", { exact: true }).selectOption("USD");
  await page.getByLabel("Rate per unit (kWh)").fill("0.20");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await page
    .getByRole("button", { name: "Cost calculator", exact: true })
    .click();
  await page.getByLabel("Device power consumption").fill("100");
  await page.getByLabel("Number of days").fill("10");
  // 100 W × 8 hours × 10 days / 1000 × $0.20 = $1.60
  await expect(page.locator(".result-amount")).toHaveText("$1.60");
  await page.getByRole("button", { name: /Gaming PC/ }).click();
  await expect(page.locator(".result-amount")).toHaveText("$5.60");
});

test("export is a downloadable CSV, clearly labeled demo", async ({ page }) => {
  await page.goto("/");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export report" }).click();
  expect((await download).suggestedFilename()).toMatch(
    /^wattwise-demo-.*\.csv$/,
  );
});

test("missing sensor never silently becomes an estimate", async ({ page }) => {
  await page.route("**/api/agent/power", (route) =>
    route.fulfill({
      json: { available: false, message: "No battery sensor found." },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Set up tracking" }).click();
  await page.getByRole("button", { name: /Battery sensor Requires/ }).click();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("No signal", { exact: true })).toBeVisible({
    timeout: 5000,
  });
  await page
    .getByRole("button", { name: "Pause tracking", exact: true })
    .click();
  const state = JSON.parse(
    await page.evaluate(() => localStorage.getItem("wattwise.v1")),
  );
  expect(state.session.kwh).toBe(0);
  expect(state.session.points).toHaveLength(0);
});

test("valid sensor data records only the supplied watts", async ({ page }) => {
  await page.route("**/api/agent/power", (route) =>
    route.fulfill({
      json: { available: true, watts: 27.5, source: "Test battery" },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Set up tracking" }).click();
  await page.getByRole("button", { name: /Battery sensor Requires/ }).click();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.locator(".stat-value").first()).toContainText("27.5", {
    timeout: 4000,
  });
  await page
    .getByRole("button", { name: "Pause tracking", exact: true })
    .click();
  const state = JSON.parse(
    await page.evaluate(() => localStorage.getItem("wattwise.v1")),
  );
  expect(state.session.points.every((p) => p.watts === 27.5)).toBe(true);
  expect(state.session.kwh).toBeGreaterThan(0);
});

test("mobile navigation and settings are usable without page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "My device", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My device" })).toBeVisible();
  await page.getByRole("button", { name: "Configure device" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save preferences" }),
  ).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("bad persisted JSON recovers into demo", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("wattwise.v1", "{not valid JSON"),
  );
  await page.goto("/");
  await expect(page.getByText("You’re exploring demo mode")).toBeVisible();
});
