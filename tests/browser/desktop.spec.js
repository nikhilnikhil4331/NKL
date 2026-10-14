import { test, expect } from "@playwright/test";

async function desktopFixture(page) {
  await page.addInitScript(() => {
    let state = {
      version: 1,
      settings: {
        currency: "INR",
        rate: 8,
        watts: 65,
        budget: 500,
        hours: 8,
        device: "My Windows laptop",
      },
      session: {
        id: "native-session",
        mode: "sensor",
        start: Date.now(),
        points: [],
        kwh: 0,
        seconds: 0,
        peak: 0,
        device: "My Windows laptop",
      },
      history: [],
      running: true,
      sensorError: "Checking the Windows battery sensor…",
      sensorName: "",
      storageError: false,
      desktop: { canAutoStart: true, launchOnLogin: false, platform: "win32" },
    };
    const listeners = new Set();
    window.desktopCommands = [];
    window.desktopExports = 0;
    window.wattwiseDesktop = {
      getState: async () => structuredClone(state),
      onState: (fn) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      command: async (action) => {
        window.desktopCommands.push(action);
        if (action.type === "running") state.running = action.running;
        if (action.type === "settings") {
          state.settings = action.settings;
          state.session.mode = action.mode;
          state.desktop.launchOnLogin = action.launchOnLogin;
        }
        return structuredClone(state);
      },
      exportCsv: async () => {
        window.desktopExports++;
        return { saved: true };
      },
    };
    window.pushDesktopReading = () => {
      state.sensorError = "";
      state.sensorName = "Windows battery (test)";
      state.session = {
        ...state.session,
        seconds: 1,
        kwh: 25 / 3600000,
        peak: 25,
        points: [
          { time: Date.now(), watts: 25, seconds: 1, kwh: 25 / 3600000 },
        ],
      };
      for (const listener of listeners) listener(structuredClone(state));
    };
  });
}

test("native bridge owns readings; browser timers/storage are disabled", async ({
  page,
}) => {
  let agentRequests = 0;
  page.on("request", (req) => {
    if (req.url().includes("/api/agent")) agentRequests++;
  });
  await desktopFixture(page);
  await page.goto("/");
  await expect(page.getByText("Desktop tracking is ready")).toBeVisible();
  await expect(page.getByText("You’re exploring demo mode")).not.toBeVisible();
  await page.evaluate(() => window.pushDesktopReading());
  await expect(page.locator(".stat-value").first()).toContainText("25.0");
  await page
    .getByRole("button", { name: "Pause tracking", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Resume tracking", exact: true }),
  ).toBeVisible();
  const commands = await page.evaluate(() => window.desktopCommands);
  expect(commands[0]).toEqual({ type: "running", running: false });
  expect(
    await page.evaluate(() => localStorage.getItem("wattwise.v1")),
  ).toBeNull();
  expect(agentRequests).toBe(0);
});

test("native preferences and export go through restricted desktop commands", async ({
  page,
}) => {
  await desktopFixture(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Battery sensor Built-in/ }),
  ).toBeVisible();
  await page.getByLabel("Start with Windows").check();
  await page.getByLabel("Rate per unit (kWh)").fill("9.5");
  await page.getByRole("button", { name: "Save preferences" }).click();
  const commands = await page.evaluate(() => window.desktopCommands);
  expect(commands[0].launchOnLogin).toBe(true);
  expect(commands[0].settings.rate).toBe(9.5);
  await page.getByRole("button", { name: "Export report" }).click();
  expect(await page.evaluate(() => window.desktopExports)).toBe(1);
  await page.getByRole("button", { name: "How it works" }).click();
  await expect(
    page.getByRole("heading", { name: "3. Close the window, keep tracking" }),
  ).toBeVisible();
});

test("desktop bootstrap failure never replaces saved state with demo data", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.wattwiseDesktop = {
      getState: () => Promise.reject(new Error("Disconnected")),
    };
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Desktop connection unavailable" }),
  ).toBeVisible();
  await expect(page.getByText("You’re exploring demo mode")).not.toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("wattwise.v1")),
  ).toBeNull();
});
