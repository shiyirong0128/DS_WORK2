import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const qa = path.join(root, '.qa');
fs.mkdirSync(qa, { recursive: true });
fs.mkdirSync(path.join(root, '预览图'), { recursive: true });
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--disable-background-networking',
  '--disable-extensions', '--disable-default-apps', '--no-first-run',
  '--no-default-browser-check', '--hide-scrollbars', '--remote-debugging-port=0',
  `--user-data-dir=${path.join(qa, 'pocket-profile')}`, 'about:blank',
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });

let ws;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let log = '';
    const timer = setTimeout(() => reject(new Error('Chrome startup timed out')), 20000);
    browser.stderr.on('data', chunk => {
      log += chunk;
      const match = log.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    browser.on('error', error => { clearTimeout(timer); reject(error); });
    browser.on('exit', code => { clearTimeout(timer); reject(new Error(`Chrome exited: ${code}`)); });
  });
  const target = await (await fetch(`http://${new URL(endpoint).host}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    clearTimeout(task.timer);
    message.error ? task.reject(new Error(JSON.stringify(message.error))) : task.resolve(message.result);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => { pending.delete(key); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(key, { resolve, reject, timer });
    ws.send(JSON.stringify({ id: key, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await call('Page.enable');
  await call('Network.enable');
  await call('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  const report = { stage: '03_棋盘状态辨识', offline: true, results: [] };
  const expectedMap = ['#######', '# . . #', '# $ $ #', '#  .  #', '# $$$ #', '#.@.  #', '#######'];
  const expectedTiles = expectedMap.flatMap(row => [...row].map(c => ({ '#': 'wall', ' ': 'floor', '$': 'crate', '.': 'target', '@': 'player' }[c])));

  const pages = [
    { filename: 'index.html', placed: 0, playerOnTarget: 0, stats: '000,000', preview: '游戏主界面' },
    { filename: 'partial.html', placed: 2, playerOnTarget: 1, stats: '011,002', preview: '部分完成' },
    { filename: 'solved.html', placed: 5, playerOnTarget: 0, stats: '028,007', preview: '全部完成' },
    { filename: 'complete.html', placed: 5, playerOnTarget: 0, stats: '028,007', preview: '通关页' },
  ];
  const targetCoordinates = [[1, 2], [1, 4], [3, 3], [5, 1], [5, 3]];
  for (const page of pages) {
    const { filename } = page;
    const source = fs.readFileSync(path.join(root, filename), 'utf8');
    if (/<script|https?:\/\//i.test(source)) throw new Error(`Unexpected runtime dependency: ${filename}`);
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await call('Page.navigate', { url: pathToFileURL(path.join(root, filename)).href });
    await evaluate(`new Promise(resolve => {
      const done = () => document.fonts.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      document.readyState === 'complete' ? done() : window.addEventListener('load', done, { once: true });
    })`);
    const content = await evaluate(`({
      title: document.title, text: document.body.innerText,
      tiles: [...document.querySelectorAll('.board .cell')].map(c => c.dataset.tile),
      targetCoordinates: [...document.querySelectorAll('.board .cell[data-target="true"]')].map(c => [+c.dataset.r, +c.dataset.c]),
      crates: document.querySelectorAll('.board .cell[data-occupant="crate"]').length,
      players: document.querySelectorAll('.board .cell[data-occupant="player"]').length,
      placedCrates: document.querySelectorAll('.board .has-crate.has-target').length,
      placedMarks: document.querySelectorAll('.board .crate.is-placed .checkmark').length,
      playerOnTarget: document.querySelectorAll('.board .has-player.has-target > .target').length,
      totalLabel: document.querySelector('[data-total]').textContent,
      placedLabel: document.querySelector('[data-placed]').textContent,
      stats: [...document.querySelectorAll('.stats strong')].map(c => c.textContent),
      consoles: document.querySelectorAll('.console').length,
      links: document.querySelectorAll('a,nav,select').length,
      victory: document.querySelectorAll('.victory').length,
      allButtonsDisabled: [...document.querySelectorAll('button')].every(b => b.disabled),
      scripts: document.scripts.length, fontReady: document.fonts.status
    })`);
    if (/方案|总览|风格切换|DESIGN|UI确认|风格确认|02\s*\/\s*10/i.test(content.text)) throw new Error('Proposal content remains');
    if (content.links || content.scripts || content.consoles !== 1 || !content.allButtonsDisabled) throw new Error(`Invalid static page: ${filename}`);
    if (filename === 'index.html' && (content.victory || JSON.stringify(content.tiles) !== JSON.stringify(expectedTiles) || content.stats.join() !== '000,000')) throw new Error('Main entry or map changed');
    if (content.stats.join() !== page.stats || content.totalLabel !== '5' || +content.placedLabel !== page.placed) throw new Error(`Incorrect counters: ${filename}`);
    if (filename === 'complete.html') {
      if (content.tiles.length || content.victory !== 1) throw new Error('Completion page invalid');
    } else {
      if (content.tiles.length !== 49 || content.crates !== 5 || content.players !== 1 || content.victory) throw new Error(`Invalid board: ${filename}`);
      if (JSON.stringify(content.targetCoordinates) !== JSON.stringify(targetCoordinates)) throw new Error(`Target layer changed: ${filename}`);
      if (content.placedCrates !== page.placed || content.placedMarks !== page.placed || content.playerOnTarget !== page.playerOnTarget) throw new Error(`Composite state mismatch: ${filename}`);
    }
    delete content.text;
    const screenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(path.join(root, '预览图', page.preview + '.png'), Buffer.from(screenshot.data, 'base64'));

    const layouts = [];
    for (const [width, height] of [[320, 740], [390, 844], [768, 1024], [1440, 900]]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      const layout = await evaluate(`({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight, consoleWidth: document.querySelector('.console').getBoundingClientRect().width })`);
      if (layout.scrollWidth > width) throw new Error(`Horizontal overflow: ${filename} at ${width}`);
      layouts.push(layout);
      if (width === 390) {
        const image = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: layout.height, scale: 1 } });
        fs.writeFileSync(path.join(qa, `${filename}-mobile.png`), Buffer.from(image.data, 'base64'));
      }
    }
    report.results.push({ filename, content, layouts });
    console.log(`PASS ${filename}: offline, no proposal navigation, disabled controls, responsive layout`);
  }
  fs.writeFileSync(path.join(root, 'validation.json'), JSON.stringify(report, null, 2) + '\n');
  await call('Browser.close');
} finally {
  if (ws) ws.close();
  if (browser.exitCode === null) browser.kill();
}
