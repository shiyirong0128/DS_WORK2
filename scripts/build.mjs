import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const map = ['#######', '# . . #', '# $ $ #', '#  .  #', '# $$$ #', '#.@.  #', '#######'];
const css = fs.readFileSync(path.join(root, 'src/pocket.css'), 'utf8');
const font = fs.readFileSync(path.join(root, 'assets/fonts/terminal.ttf')).toString('base64');
const player = `<svg class="person" viewBox="0 0 16 16" aria-hidden="true"><path fill="#313d2d" d="M5 1h6v2h2v6h-2v2h2v4H9v-3H7v3H3v-4h2V9H3V3h2z"/><path fill="#41572c" d="M5 2h6v2H5zM4 4h8v4H4zM5 10h6v2H5zM3 12h3v2H3zM10 12h3v2h-3z"/><path fill="#c8d792" d="M5 5h2v2H5zM9 5h2v2H9z"/></svg>`;
const trophy = `<svg class="trophy" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M8 3h16v3h6v10h-4v3h-6v4h-2v3h6v4H8v-4h6v-3h-2v-4H6v-3H2V6h6zm-2 6v5h3V9zm17 0v5h3V9z"/><path fill="#c8d792" d="M11 5h3v10h-3z"/></svg>`;
const board = `<div class="board" role="img" aria-label="七乘七仓库地图，五个箱子、五个目标点和一个角色。">
${map.flatMap((row, r) => [...row].map((cell, c) => {
  const kind = { '#': 'wall', '$': 'crate', '.': 'target', '@': 'player', ' ': 'floor' }[cell];
  const content = cell === '$' ? '<span class="crate"></span>' : cell === '.' ? '<span class="target"></span>' : cell === '@' ? player : '';
  return `  <div class="cell ${cell === '#' ? 'wall' : 'floor'}" data-r="${r}" data-c="${c}" data-tile="${kind}">${content}</div>`;
})).join('\n')}
</div>`;
const stats = (complete = false) => `<div class="stats${complete ? ' win-stats' : ''}">
  <div><span>移动步数</span><strong>${complete ? '048' : '000'}</strong></div>
  <div><span>推动次数</span><strong>${complete ? '018' : '000'}</strong></div>
</div>`;
const controls = `<div class="console-bottom">
  <div class="dpad" aria-label="方向控制">
    <button class="up" type="button" aria-label="向上" disabled>↑</button>
    <button class="left" type="button" aria-label="向左" disabled>←</button>
    <i aria-hidden="true"></i>
    <button class="right" type="button" aria-label="向右" disabled>→</button>
    <button class="down" type="button" aria-label="向下" disabled>↓</button>
  </div>
  <div class="actions">
    <button type="button" aria-label="撤销" disabled>↶</button>
    <button type="button" aria-label="重开" disabled>↻</button>
  </div>
</div>
<div class="speaker" aria-hidden="true">${'<i></i>'.repeat(6)}</div>`;
const game = `${stats()}
${board}
<div class="legend"><span><i class="mini-box" aria-hidden="true"></i>箱子 × 5</span><span><i class="mini-goal" aria-hidden="true"></i>目标 × 5</span><span>7 × 7</span></div>`;
const complete = `<p class="tag">LEVEL CLEAR</p>
${trophy}
<h2 class="win-title">好耶，全部归位！</h2>
<div class="stars" aria-label="三星评价">★ ★ ★</div>
${stats(true)}
<button class="primary" type="button" disabled>下一关</button>
<p class="sleepy">TAKE A LITTLE BREAK.</p>`;

for (const [filename, content, victory] of [['index.html', game, false], ['complete.html', complete, true]]) {
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="口袋星期天，苔绿色复古掌机风格的二维推箱子。">
  <title>口袋星期天 · ${victory ? '通关' : '推箱子'}</title>
  <style>
@font-face { font-family: "terminal"; src: url(data:font/ttf;base64,${font}) format("truetype"); font-display: block; }
${css}</style>
</head>
<body>
  <main class="stage" aria-label="口袋星期天${victory ? '通关页' : '游戏主界面'}">
    <section class="console${victory ? ' victory' : ''}" aria-label="复古掌机">
      <header class="console-brand"><h1>POCKET / PUSH</h1></header>
      <div class="lcd-frame">
        <p class="lcd-label">DOT MATRIX WITH A LITTLE JOY</p>
        <div class="lcd">
${content}
        </div>
      </div>
${controls}
    </section>
  </main>
</body>
</html>
`;
  fs.writeFileSync(path.join(root, filename), html);
  console.log(`Generated ${filename}`);
}
