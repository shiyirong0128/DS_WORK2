import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { room, scenes } from '../src/boards.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'src/pocket.css'), 'utf8');
const font = fs.readFileSync(path.join(root, 'assets/fonts/terminal.ttf')).toString('base64');
const engine = fs.readFileSync(path.join(root, 'src/game.mjs'), 'utf8').replace(/^export /gm, '');
const runtime = fs.readFileSync(path.join(root, 'src/runtime.js'), 'utf8');
const player = `<svg class="person" viewBox="0 0 16 16" aria-hidden="true"><path fill="#313d2d" d="M5 1h6v2h2v6h-2v2h2v4H9v-3H7v3H3v-4h2V9H3V3h2z"/><path fill="#41572c" d="M5 2h6v2H5zM4 4h8v4H4zM5 10h6v2H5zM3 12h3v2H3zM10 12h3v2h-3z"/><path fill="#c8d792" d="M5 5h2v2H5zM9 5h2v2H9z"/></svg>`;
const trophy = `<svg class="trophy" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M8 3h16v3h6v10h-4v3h-6v4h-2v3h6v4H8v-4h6v-3h-2v-4H6v-3H2V6h6zm-2 6v5h3V9zm17 0v5h3V9z"/><path fill="#c8d792" d="M11 5h3v10h-3z"/></svg>`;
const checkmark = `<svg class="checkmark" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M1 7h3v3H1zM4 10h3v3H4zM7 7h3v3H7zM10 4h3v3h-3zM13 1h3v3h-3z"/></svg>`;
const crateIcon = placed => `<span class="crate${placed ? ' is-placed' : ''}">${placed ? checkmark : ''}</span>`;
const placedCount = scene => scene.crates.filter(([r, c]) => room[r][c] === '.').length;
const summary = scene => `<div class="cargo-summary" aria-label="箱子进度">
  <div><span>总箱数</span><strong data-total>${scene.crates.length}</strong></div>
  <div class="placed-count"><span>已到位</span><strong><span data-placed>${placedCount(scene)}</span><small> / ${scene.crates.length}</small></strong></div>
</div>`;
const boardCells = scene => room.flatMap((row, r) => [...row].map((terrain, c) => {
  const target = terrain === '.';
  const crate = scene.crates.some(([br, bc]) => br === r && bc === c);
  const occupant = crate ? 'crate' : scene.player[0] === r && scene.player[1] === c ? 'player' : '';
  const kind = occupant === 'crate' && target ? 'crate-on-target' : occupant === 'player' && target ? 'player-on-target' : occupant || (target ? 'target' : terrain === '#' ? 'wall' : 'floor');
  const name = { wall: '墙', floor: '地板', target: '目标点', crate: '未到位箱子', player: '角色', 'crate-on-target': '已到位箱子', 'player-on-target': '角色站在目标点上' }[kind];
  const classes = ['cell', terrain === '#' ? 'wall' : 'floor', target ? 'has-target' : '', occupant ? `has-${occupant}` : ''].filter(Boolean).join(' ');
  const content = `${target ? '<span class="target" aria-hidden="true"></span>' : ''}${crate ? crateIcon(target) : occupant === 'player' ? player : ''}`;
  return `  <div class="${classes}" data-r="${r}" data-c="${c}" data-tile="${kind}" data-target="${target}" data-occupant="${occupant}" role="img" aria-label="第${r + 1}行第${c + 1}列，${name}">${content}</div>`;
})).join('\n');
const board = scene => `<div class="board" data-scene="${scene.id}" tabindex="-1" role="group" aria-label="七乘七仓库，${scene.crates.length}个箱子，5个目标点，已到位${placedCount(scene)}个。">
${boardCells(scene)}
</div>`;
const stats = (scene, complete = false) => `<div class="stats${complete ? ' win-stats' : ''}">
  <div><span>移动步数</span><strong data-counter="moves">${String(scene.moves).padStart(3, '0')}</strong></div>
  <div><span>推动次数</span><strong data-counter="pushes">${String(scene.pushes).padStart(3, '0')}</strong></div>
</div>`;
const controls = `<div class="console-bottom">
  <div class="dpad" aria-label="方向控制">
    <button class="up" data-direction="U" type="button" aria-label="向上" disabled>↑</button>
    <button class="left" data-direction="L" type="button" aria-label="向左" disabled>←</button>
    <i aria-hidden="true"></i>
    <button class="right" data-direction="R" type="button" aria-label="向右" disabled>→</button>
    <button class="down" data-direction="D" type="button" aria-label="向下" disabled>↓</button>
  </div>
  <div class="actions">
    <button type="button" data-action="undo" aria-label="撤销" title="撤销（Z / Backspace）" disabled>↶</button>
    <button type="button" data-action="restart" aria-label="重开" title="重开（R）" disabled>↻</button>
  </div>
</div>
<div class="speaker" aria-hidden="true">${'<i></i>'.repeat(6)}</div>`;
const legend = `<div class="legend" aria-label="棋盘图例">
  <span><i class="mini-box" aria-hidden="true"></i>未到位</span>
  <span><i class="mini-placed" aria-hidden="true">${checkmark}</i>已到位</span>
  <span><i class="mini-goal" aria-hidden="true"></i>目标点</span>
</div>`;
const game = scene => `${stats(scene)}
<div class="board-heading"><span data-status>${scene.status}</span><span class="grid-size">7 × 7</span></div>
${board(scene)}
${summary(scene)}
${legend}`;
const initial = scenes[0];
const complete = `<p class="tag" id="result-tag">LEVEL CLEAR</p>
<div id="result-celebration">${trophy}</div>
<h2 class="win-title" id="result-title" tabindex="-1">好耶，全部归位！</h2>
<div class="stars" id="result-stars" aria-label="三星评价">★ ★ ★</div>
<p class="result-message" id="result-message" hidden>完成这一关后，这里会显示你的成绩。</p>
<div id="result-details">${summary(initial)}${stats(initial, true)}</div>
<button class="primary" id="play-again" type="button" data-action="restart">再玩一次</button>
<button class="secondary" type="button" data-action="board">查看棋盘</button>
<p class="sleepy">TAKE A LITTLE BREAK.</p>`;

const interactiveContent = `<div id="game-view">${game(initial)}<button class="secondary show-result" type="button" data-action="result" hidden>查看成绩</button></div><div id="result-view" hidden>${complete}</div>`;
const inlineRuntime = `<script>(() => {
const room = ${JSON.stringify(room)};
const level = ${JSON.stringify({ room, player: initial.player, crates: initial.crates })};
const player = ${JSON.stringify(player)};
const checkmark = ${JSON.stringify(checkmark)};
const crateIcon = ${crateIcon.toString()};
const boardCells = ${boardCells.toString()};
${engine}
${runtime}
})();</script>`;
const pages = scenes.map(scene => ({ filename: scene.file, content: scene.id === 'initial' ? interactiveContent : game(scene), title: scene.title, interactive: scene.id === 'initial' }));
for (const { filename, content, title, interactive } of pages) {
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="口袋星期天，苔绿色复古掌机风格的二维推箱子。">
  <title>口袋星期天 · ${title}</title>
  <style>
@font-face { font-family: "terminal"; src: url(data:font/ttf;base64,${font}) format("truetype"); font-display: block; }
${css}</style>
</head>
<body${interactive ? ' data-interactive="true"' : ''}>
  <main class="stage" aria-label="口袋星期天 · ${title}">
    <section class="console" aria-label="复古掌机">
      <header class="console-brand"><h1>POCKET / PUSH</h1></header>
      <div class="lcd-frame">
        <p class="lcd-label">DOT MATRIX WITH A LITTLE JOY</p>
        <div class="lcd">
${content}
        </div>
      </div>
${controls}
${interactive ? '<p class="control-hint">方向键 / WASD</p><p id="announcer" class="sr-only" role="status" aria-live="polite"></p><noscript>请启用 JavaScript 后游玩。</noscript>' : ''}
    </section>
  </main>
${interactive ? inlineRuntime : ''}
</body>
</html>
`;
  fs.writeFileSync(path.join(root, filename), html);
  console.log(`Generated ${filename}`);
}
// The standalone result entry resolves to the same offline app and storage origin.
fs.writeFileSync(path.join(root, 'complete.html'), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>口袋星期天 · 通关成绩</title></head><body><p><a href="index.html#result">查看通关成绩</a></p><script>location.replace('index.html' + (location.hash.startsWith('#result') ? location.hash : '#result'));</script></body></html>\n`);
console.log('Generated complete.html');
