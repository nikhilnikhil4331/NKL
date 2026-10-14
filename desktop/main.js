import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  dialog,
  ipcMain,
  nativeImage,
  powerMonitor,
} from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { DesktopTracker } from "./tracker.js";
import { startWindowsSensor } from "./windows-sensor.js";
import { readState, writeState } from "./store.js";
import { csvFor } from "../src/energy.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const index = path.join(here, "..", "dist", "index.html");
let window,
  tray,
  tracker,
  quitting = false,
  lastTrayState = "";
app.setName("Wattwise");
app.setAppUserModelId("com.wattwise.desktop");
const ownsLock = app.requestSingleInstanceLock();
if (!ownsLock) app.quit();
else {
  app.on("second-instance", () => showWindow());
  app
    .whenReady()
    .then(start)
    .catch((error) => {
      dialog.showErrorBox("Wattwise could not start", error.message);
      app.quit();
    });
  app.on("before-quit", () => {
    quitting = true;
    tracker?.close();
  });
  // The native main process owns sampling, not the hidden/closed renderer.
  app.on("window-all-closed", () => {});
}
function loginOptions() {
  return {
    name: "Wattwise",
    path: process.execPath,
    args: app.isPackaged ? ["--hidden"] : [app.getAppPath(), "--hidden"],
  };
}
function desktopInfo() {
  return {
    launchOnLogin:
      process.platform === "win32" &&
      app.getLoginItemSettings(loginOptions()).openAtLogin,
    canAutoStart: process.platform === "win32",
    platform: process.platform,
  };
}
function snapshot() {
  return { ...tracker.state, desktop: desktopInfo() };
}
function showWindow() {
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
function assertSender(event) {
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame
  )
    throw new Error("Untrusted desktop request.");
}
function publish() {
  if (
    window &&
    !window.isDestroyed() &&
    window.webContents &&
    !window.webContents.isDestroyed() &&
    window.isVisible()
  )
    window.webContents.send("wattwise:state", snapshot());
  if (tray) {
    const { running, sensorError, session } = tracker.state;
    const title = !running
      ? "Paused"
      : sensorError
        ? "No battery signal"
        : session.mode === "estimate"
          ? "Estimated tracking"
          : session.mode === "demo"
            ? "Demo tracking"
            : "Battery tracking";
    tray.setToolTip(`Wattwise — ${title}`);
    if (`${running}/${title}` !== lastTrayState) {
      lastTrayState = `${running}/${title}`;
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: "Open Wattwise", click: showWindow },
          { label: title, enabled: false },
          { type: "separator" },
          {
            label: running ? "Pause tracking" : "Resume tracking",
            click: () => tracker.setRunning(!tracker.state.running),
          },
          { type: "separator" },
          { label: "Quit Wattwise", click: () => app.quit() },
        ]),
      );
    }
  }
}
async function start() {
  const stateFile = path.join(app.getPath("userData"), "state.json");
  tracker = new DesktopTracker({
    initial: readState(stateFile),
    sensor: startWindowsSensor,
    writeState: (state) => writeState(stateFile, state),
  });
  const icon = nativeImage.createFromPath(
    path.join(here, "assets", "icon.png"),
  );
  window = new BrowserWindow({
    width: 1360,
    height: 940,
    minWidth: 390,
    minHeight: 640,
    title: "Wattwise — Laptop energy tracker",
    icon,
    backgroundColor: "#f8f9fb",
    show: false,
    webPreferences: {
      preload: path.join(here, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  Menu.setApplicationMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  window.webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.on("close", (event) => {
    if (!quitting && tray) {
      event.preventDefault();
      window.hide();
      tracker.flush();
    }
  });
  window.on("show", publish);
  try {
    tray = new Tray(icon.resize({ width: 20, height: 20 }));
    tray.on("double-click", showWindow);
    tray.on("click", showWindow);
  } catch (error) {
    // Do not strand an invisible app if the tray cannot be created.
    quitting = true;
    throw new Error(`Could not create the system tray icon: ${error.message}`);
  }
  tracker.on("state", publish);
  ipcMain.handle("wattwise:get-state", (event) => {
    assertSender(event);
    return snapshot();
  });
  ipcMain.handle("wattwise:command", (event, action) => {
    assertSender(event);
    if (!action || typeof action !== "object")
      throw new Error("Invalid command.");
    switch (action.type) {
      case "running":
        tracker.setRunning(action.running);
        break;
      case "new-session":
        tracker.newSession();
        break;
      case "settings": {
        tracker.validateSettings(action.settings, action.mode);
        if (typeof action.launchOnLogin !== "boolean")
          throw new Error("Invalid startup preference.");
        if (desktopInfo().canAutoStart)
          app.setLoginItemSettings({
            ...loginOptions(),
            openAtLogin: action.launchOnLogin,
          });
        tracker.setSettings(action.settings, action.mode);
        break;
      }
      default:
        throw new Error("Unsupported command.");
    }
    return snapshot();
  });
  ipcMain.handle("wattwise:export-csv", async (event) => {
    assertSender(event);
    const { session, history, settings } = tracker.state;
    const isDemo = session.mode === "demo";
    const data = csvFor(
      [session, ...history].filter((s) => (s.mode === "demo") === isDemo),
      settings,
    );
    const result = await dialog.showSaveDialog(window, {
      title: "Export Wattwise report",
      defaultPath: `wattwise-${isDemo ? "demo-" : ""}${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: "CSV report", extensions: ["csv"] }],
    });
    if (result.canceled || !result.filePath) return { saved: false };
    await fs.promises.writeFile(result.filePath, data, "utf8");
    return { saved: true };
  });
  powerMonitor.on("suspend", () => tracker.suspend());
  powerMonitor.on("resume", () => tracker.resume());
  powerMonitor.on("shutdown", () => tracker.close());
  await window.loadFile(index);
  if (!process.argv.includes("--hidden")) showWindow();
  tracker.start();
}
