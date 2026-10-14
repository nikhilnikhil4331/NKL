// Exercise the packaged Windows executable, not a mocked browser bridge.
const { _electron: electron } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  if (process.platform !== 'win32') throw new Error('Packaged-app smoke test requires Windows.');
  const app = await electron.launch({ executablePath: path.resolve('build/windows/win-unpacked/Wattwise.exe'), timeout: 60000 });
  let page;
  try {
    page = await app.firstWindow({ timeout: 60000 });
    await page.getByRole('heading', { name: 'Energy overview' }).waitFor({ timeout: 60000 });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const initial = await page.evaluate(() => window.wattwiseDesktop.getState());
    assert.equal(initial.session.mode, 'sensor');
    assert.equal(initial.desktop.platform, 'win32');
    await page.evaluate(() => window.wattwiseDesktop.command({ type: 'settings', settings: { currency: 'INR', rate: 8, watts: 100, budget: 500, hours: 8, device: 'Windows CI smoke test' }, mode: 'estimate', launchOnLogin: false }));
    await page.waitForFunction(async () => (await window.wattwiseDesktop.getState()).session.seconds >= 1, undefined, { timeout: 15000 });
    const before = await page.evaluate(() => window.wattwiseDesktop.getState());
    // Native Close must hide the window, without stopping the main-process sampler.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false);
    await new Promise(resolve => setTimeout(resolve, 2500));
    const hidden = await page.evaluate(() => window.wattwiseDesktop.getState());
    assert.ok(hidden.session.seconds > before.session.seconds + 1);
    assert.ok(Math.abs(hidden.session.kwh - hidden.session.seconds * 100 / 3600000) < 1e-10);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
    await page.getByRole('button', { name: 'Pause tracking', exact: true }).click();
    const paused = await page.evaluate(() => window.wattwiseDesktop.getState());
    await new Promise(resolve => setTimeout(resolve, 1200));
    const after = await page.evaluate(() => window.wattwiseDesktop.getState());
    assert.equal(after.running, false);
    assert.equal(after.session.kwh, paused.session.kwh);
    const dataFile = await app.evaluate(({ app }) => app.getPath('userData') + '/state.json');
    const persisted = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    assert.equal(persisted.running, false);
    assert.equal(persisted.session.kwh, after.session.kwh);
    assert.deepEqual(errors, []);
    console.log('PASS: packaged Windows app launches, uses IPC, tracks while tray-hidden, pauses, and saves state.');
  } catch (error) {
    fs.mkdirSync('test-results', { recursive: true });
    if (page) await page.screenshot({ path: 'test-results/windows-smoke-failure.png' }).catch(() => {});
    throw error;
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
