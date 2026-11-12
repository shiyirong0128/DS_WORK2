import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startBrowser } from './browser.mjs';
import { solution, partialSolution } from '../tests/fixtures.mjs';
import { checkBlockedFeedback } from '../tests/blocked-feedback.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const qa = path.join(root, '.qa');
fs.mkdirSync(qa, { recursive: true });
const browser = await startBrowser(path.join(qa, 'demo-profile'));
const { call, evaluate, navigate } = browser;
const url = file => pathToFileURL(path.join(root, file)).href;
const report = { stage: '06_受阻反馈优化', offline: true, checks: [], layouts: [] };
const passed = (name, detail = {}) => { report.checks.push({ name, ...detail }); console.log('PASS', name); };
const size = async (width, height = 1000, mobile = false) => {
  await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  await evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
};
const key = async (value, type, extra = {}) => {
  const codes = { ArrowUp: ['ArrowUp', 38], ArrowDown: ['ArrowDown', 40], ArrowLeft: ['ArrowLeft', 37], ArrowRight: ['ArrowRight', 39], Backspace: ['Backspace', 8] };
  const [code, keyCode] = codes[value] || ['Key' + value.toUpperCase(), value.toUpperCase().charCodeAt(0)];
  for (const eventType of type ? [type] : ['keyDown', 'keyUp']) {
    await call('Input.dispatchKeyEvent', { type: eventType, key: value, code, windowsVirtualKeyCode: keyCode, ...extra });
  }
};
const buttonStyle = direction => evaluate(`(() => {
  const style = getComputedStyle(document.querySelector('[data-direction="${direction}"]'));
  return { filter: style.filter, transform: style.transform, shadow: style.boxShadow, opacity: style.opacity };
})()`);
const point = selector => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el || el.disabled || el.hidden) throw Error('Unavailable control'); el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
const click = async selector => {
  const p = await point(selector);
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 });
};
const read = () => evaluate(`(() => {
  const result = document.getElementById('result-view');
  const game = document.getElementById('game-view');
  const p = document.querySelector('.board .has-player');
  return {
    moves: +game.querySelector('[data-counter="moves"]').textContent,
    pushes: +game.querySelector('[data-counter="pushes"]').textContent,
    placed: +game.querySelector('[data-placed]').textContent,
    total: +game.querySelector('[data-total]').textContent,
    player: [+p.dataset.r, +p.dataset.c],
    crates: [...document.querySelectorAll('.board .has-crate')].map(e=>[+e.dataset.r,+e.dataset.c]),
    marks: document.querySelectorAll('.board .is-placed .checkmark').length,
    playerOnTarget: !!document.querySelector('.has-player.has-target > .target'),
    targets: document.querySelectorAll('.board [data-target="true"]').length,
    cells: document.querySelectorAll('.board .cell').length,
    view: result.hidden ? 'game' : 'result',
    emptyResult: document.getElementById('result-details').hidden,
    resultMoves: +result.querySelector('[data-counter="moves"]').textContent,
    resultPushes: +result.querySelector('[data-counter="pushes"]').textContent,
    undoDisabled: document.querySelector('.actions [data-action="undo"]').disabled,
    directionsDisabled: [...document.querySelectorAll('[data-direction]')].every(e=>e.disabled)
  };
})()`);
const shoot = async name => {
  await evaluate('scrollTo(0,0)');
  const height = await evaluate('Math.max(innerHeight,document.documentElement.scrollHeight)');
  const width = await evaluate('innerWidth');
  const image = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 } });
  fs.writeFileSync(path.join(root, '预览图', name + '.png'), Buffer.from(image.data, 'base64'));
};
const arrows = { U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight' };
const wasd = { U: 'w', D: 's', L: 'a', R: 'd' };
const play = async trail => { for (const d of trail) await key(arrows[d]); };

try {
  await size(1440);
  await navigate(url('index.html'));
  const initial = await read();
  assert.equal(initial.cells, 49); assert.equal(initial.targets, 5); assert.equal(initial.total, 5);
  assert.equal(initial.moves, 0); assert.equal(initial.undoDisabled, true);
  assert.equal(initial.directionsDisabled, false); assert.equal(initial.view, 'game');
  await shoot('游戏主界面');

  // Compare rendered keyboard feedback with native mouse feedback, including blocked moves.
  const idleStyle = await buttonStyle('U');
  const mousePoint = await point('[data-direction="U"]');
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...mousePoint, button: 'left', clickCount: 1 });
  const pressedStyle = await buttonStyle('U');
  assert.notEqual(pressedStyle.filter, idleStyle.filter);
  assert.notEqual(pressedStyle.transform, idleStyle.transform);
  assert.notEqual(pressedStyle.shadow, idleStyle.shadow);
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...mousePoint, button: 'left', clickCount: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
  assert.deepEqual(await buttonStyle('U'), idleStyle);
  for (const [value, direction] of Object.entries({ w:'U', a:'L', s:'D', d:'R', ArrowUp:'U', ArrowLeft:'L', ArrowDown:'D', ArrowRight:'R' })) {
    await key('r');
    await key(value, 'keyDown');
    assert.deepEqual(await buttonStyle(direction), pressedStyle, value);
    const heldState = await read();
    await key(value, 'keyUp');
    assert.deepEqual(await buttonStyle(direction), idleStyle, value + ' release');
    assert.deepEqual(await read(), heldState); // Releasing a key never moves again.
  }
  await key('r');
  await key('w', 'keyDown');
  await shoot('按键反馈');
  await key('ArrowUp', 'keyDown');
  await key('w', 'keyUp');
  assert.deepEqual(await buttonStyle('U'), pressedStyle);
  await key('a', 'keyDown');
  assert.deepEqual(await buttonStyle('L'), pressedStyle);
  await key('ArrowUp', 'keyUp');
  assert.deepEqual(await buttonStyle('U'), idleStyle);
  assert.deepEqual(await buttonStyle('L'), pressedStyle);
  await key('a', 'keyUp');
  await key('w', 'keyDown');
  await key('w', 'keyDown', { autoRepeat: true });
  await key('W', 'keyUp', { modifiers: 8 }); // Shift changes the label, not the physical key.
  assert.deepEqual(await buttonStyle('U'), idleStyle);
  await key('w', 'keyDown');
  await key('a', 'keyDown');
  const beforeBlur = await read();
  // Headless Chrome keeps tabs focused; dispatch the window event to check cleanup.
  await evaluate("window.dispatchEvent(new Event('blur'))");
  for (const direction of ['U','L']) assert.deepEqual(await buttonStyle(direction), idleStyle);
  await key('w', 'keyUp'); await key('a', 'keyUp');
  assert.deepEqual(await read(), beforeBlur);
  await key('r'); assert.deepEqual(await read(), initial);
  passed('WASD/arrows match mouse press appearance; release, key overlap, repeat and window blur event clear correctly');

  await checkBlockedFeedback({ call, evaluate, key, click, read, play, shoot, size, passed });

  await key('ArrowDown');
  assert.deepEqual(await read(), initial);
  await key('a');
  assert.equal((await read()).moves, 1); assert.equal((await read()).playerOnTarget, true);
  await click('[data-direction="U"]');
  const beforeChain = await read();
  await key('d');
  assert.deepEqual(await read(), beforeChain);
  passed('keyboard and mouse: blocked wall and two-crate push do not count');

  await key('r'); assert.deepEqual(await read(), initial);
  await key('w');
  assert.equal((await read()).moves, 1); assert.equal((await read()).pushes, 1);
  await click('[data-action="undo"]'); assert.deepEqual(await read(), initial);
  await play('LUURU');
  const beforeWall = await read();
  await key('ArrowUp'); assert.deepEqual(await read(), beforeWall);
  await key('z'); assert.equal((await read()).pushes, 0);
  await key('Backspace'); assert.equal((await read()).moves, 3);
  await click('.actions [data-action="restart"]'); assert.deepEqual(await read(), initial);
  passed('single pushes, keyboard/button undo and restart restore positions and statistics');

  for (const [i, d] of [...partialSolution].entries()) {
    if (i % 2) await click(`[data-direction="${d}"]`); else await key(wasd[d]);
  }
  const partial = await read();
  assert.equal(partial.moves, 11); assert.equal(partial.pushes, 2); assert.equal(partial.placed, 2);
  assert.equal(partial.marks, 2); assert.equal(partial.playerOnTarget, true); assert.equal(partial.targets, 5);
  await shoot('部分完成');
  await play(solution.slice(partialSolution.length, -1));
  await key(arrows[solution.at(-1)], 'keyDown');
  const disabledStyle = await buttonStyle('L');
  assert.equal(disabledStyle.transform, idleStyle.transform);
  assert.equal(disabledStyle.filter, idleStyle.filter);
  assert.equal(disabledStyle.shadow, idleStyle.shadow);
  assert.notEqual(disabledStyle.opacity, idleStyle.opacity);
  await key(arrows[solution.at(-1)], 'keyUp');
  for (const value of ['w', 'ArrowLeft']) {
    await key(value, 'keyDown');
    assert.deepEqual(await buttonStyle(value === 'w' ? 'U' : 'L'), disabledStyle);
    await key(value, 'keyUp');
  }
  const disabledPoint = await evaluate(`(() => { const r = document.querySelector('[data-direction="U"]').getBoundingClientRect(); return { x:r.x+r.width/2, y:r.y+r.height/2 }; })()`);
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...disabledPoint, button: 'left', clickCount: 1 });
  assert.deepEqual(await buttonStyle('U'), disabledStyle);
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...disabledPoint, button: 'left', clickCount: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
  passed('winning key releases its visual state immediately; disabled directions ignore keyboard and mouse press styling');
  let win = await read();
  assert.equal(win.view, 'result'); assert.equal(win.emptyResult, false);
  assert.equal(win.resultMoves, 28); assert.equal(win.resultPushes, 7); assert.equal(win.placed, 5);
  await key('ArrowDown'); assert.deepEqual(await read(), win);
  await click('[data-action="undo"]');
  assert.equal((await read()).moves, 27); assert.equal((await read()).pushes, 6); assert.equal((await read()).placed, 4);
  assert.equal((await read()).view, 'game');
  await key('ArrowLeft');
  await click('[data-action="board"]');
  assert.equal((await read()).marks, 5);
  await shoot('全部完成');
  await click('[data-action="result"]');
  await shoot('通关页');
  passed('actual offline win: 28 moves / 7 pushes; undo can leave completion and win again');

  await click('#play-again'); assert.deepEqual(await read(), initial);
  await play('LR' + solution);
  win = await read();
  assert.equal(win.resultMoves, 30); assert.equal(win.resultPushes, 7);
  const proofURL = await evaluate('location.href');
  await navigate(proofURL);
  assert.equal((await read()).resultMoves, 30);
  await navigate(url('complete.html'));
  assert.equal((await read()).resultMoves, 30);
  passed('result data is real: an alternate route reports 30 moves; reload and complete.html retain it');

  await call('Page.addScriptToEvaluateOnNewDocument', { source: `for(const method of ['getItem','setItem','removeItem']) Object.defineProperty(Storage.prototype, method, {value(){throw new Error('Storage disabled for verification')}});` });
  await navigate(url('index.html') + '#result');
  assert.equal((await read()).emptyResult, true);
  await click('#play-again');
  await play(solution);
  assert.equal((await read()).resultMoves, 28);
  await navigate(await evaluate('location.href'));
  assert.equal((await read()).resultMoves, 28);
  await navigate(url('index.html') + '#result=DD');
  assert.equal((await read()).emptyResult, true);
  await click('#play-again'); assert.deepEqual(await read(), initial);
  passed('storage disabled: game and result reload still work; invalid result trails show no fabricated scores');

  for (const [width, height] of [[320,740],[390,844],[768,1024],[1440,1000]]) {
    await size(width, height);
    const layout = await evaluate('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight})');
    assert.equal(layout.scrollWidth, width);
    report.layouts.push(layout);
  }
  await size(390, 844, true);
  await call('Emulation.setTouchEmulationEnabled', { enabled: true });
  const p = await point('[data-direction="U"]');
  await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
  await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await evaluate('new Promise(r=>setTimeout(r,100))');
  assert.equal((await read()).moves, 1); assert.equal((await read()).pushes, 1);
  await key('z'); assert.deepEqual(await read(), initial);
  await shoot('手机主界面');
  passed('320/390/768/1440 responsive widths and a real touchscreen tap (one tap = one move)');

  // Copy only the homepage: verifies that playing needs no sibling files or server.
  const standalone = path.join(qa, 'standalone.html');
  fs.copyFileSync(path.join(root, 'index.html'), standalone);
  await call('Emulation.setTouchEmulationEnabled', { enabled: false });
  await size(1440);
  await navigate(pathToFileURL(standalone).href);
  await play(solution);
  assert.equal((await read()).resultMoves, 28);
  passed('standalone index.html copied to another folder completes offline');

  for (const file of ['partial.html', 'solved.html']) {
    await navigate(url(file));
    assert.equal(await evaluate('document.scripts.length'), 0);
    assert.equal(await evaluate('[...document.querySelectorAll("button")].every(b=>b.disabled)'), true);
  }
  assert.deepEqual(browser.errors, []);
  assert.equal(browser.requests.filter(request => /^https?:/.test(request)).length, 0);
  passed('historical state samples stay static; no browser errors or external runtime requests');
  fs.writeFileSync(path.join(root, 'validation.json'), JSON.stringify(report, null, 2) + '\n');
} finally {
  await browser.close();
}
