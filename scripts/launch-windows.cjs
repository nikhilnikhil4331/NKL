/* One-time verified npm dependency installation, then a detached desktop launch.
   This launcher never elevates privileges or changes Windows security settings. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}
if (process.platform !== "win32")
  fail(
    "This launcher is for Windows 11. Developers can use npm run desktop on their platform.",
  );
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 12))
  fail(
    "Please install Node.js LTS, version 22.12 or newer, from https://nodejs.org/en/download and try again.",
  );
const lockHash = crypto
  .createHash("sha256")
  .update(fs.readFileSync(path.join(root, "package-lock.json")))
  .digest("hex");
const marker = path.join(root, "node_modules", ".wattwise-ready");
const binary = path.join(
  root,
  "node_modules",
  "electron",
  "dist",
  "electron.exe",
);
const commandShell = path.join(
  process.env.SystemRoot || "C:\\Windows",
  "System32",
  "cmd.exe",
);
function npm(command) {
  const result = spawnSync(commandShell, ["/d", "/s", "/c", `npm ${command}`], {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    fail(
      `npm ${command} failed. Check your internet connection and the error above. No security settings need to be disabled.`,
    );
}
let cached = "";
try {
  cached = fs.readFileSync(marker, "utf8");
} catch {}
if (cached !== lockHash || !fs.existsSync(binary)) {
  console.log(
    "\nWattwise first-time setup: downloading app dependencies and the Electron runtime.",
  );
  console.log(
    "An internet connection is needed. This can take a few minutes.\n",
  );
  const envFlag = process.env.ELECTRON_SKIP_BINARY_DOWNLOAD;
  if (envFlag)
    fail(
      "ELECTRON_SKIP_BINARY_DOWNLOAD is set in your environment. Electron must be installed to run this desktop package.",
    );
  npm("ci");
  if (!fs.existsSync(binary))
    fail(
      "The Electron runtime download did not complete. Please share the setup error above.",
    );
  fs.writeFileSync(marker, lockHash);
}
console.log("\nPreparing the desktop interface…");
npm("run build");
console.log(
  "\nOpening Wattwise. Close its window to hide it in the system tray.",
);
const child = spawn(binary, [root], {
  cwd: root,
  detached: true,
  stdio: "ignore",
  windowsHide: true,
});
child.on("error", (error) => fail(`Cannot launch Wattwise: ${error.message}`));
child.unref();
