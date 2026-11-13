const storageKey = 'pocket-push-result-v1';
const readRecord = () => { try { return localStorage.getItem(storageKey); } catch { return null; } };
const saveRecord = trail => {
  try { trail ? localStorage.setItem(storageKey, trail) : localStorage.removeItem(storageKey); } catch { /* Play also works without storage. */ }
};
const resultRequested = location.hash === '#result' || location.hash.startsWith('#result=');
const proof = location.hash.startsWith('#result=') ? location.hash.slice(8) : resultRequested ? readRecord() : null;
let game = (resultRequested && replayWin(level, proof)) || new SokobanGame(level);
let view = resultRequested ? 'result' : 'game';
const gameView = document.getElementById('game-view');
const resultView = document.getElementById('result-view');
const boardElement = gameView.querySelector('.board');
const directionKeys = { arrowup: 'U', arrowdown: 'D', arrowleft: 'L', arrowright: 'R', w: 'U', s: 'D', a: 'L', d: 'R' };
const directionButtons = new Map([...document.querySelectorAll('[data-direction]')].map(button => [button.dataset.direction, button]));
// Track physical keys separately: releasing W must not release a still-held ArrowUp.
const heldDirectionKeys = new Map();
function syncDirectionPresses() {
  for (const [key, direction] of heldDirectionKeys) {
    if (directionButtons.get(direction).disabled) heldDirectionKeys.delete(key);
  }
  const directions = new Set(heldDirectionKeys.values());
  for (const [direction, button] of directionButtons) {
    button.classList.toggle('is-pressed', !button.disabled && directions.has(direction));
  }
}
function clearDirectionPresses() {
  heldDirectionKeys.clear();
  syncDirectionPresses();
}
const announce = text => { document.getElementById('announcer').textContent = text; };
const blockedNotice = document.getElementById('blocked-notice');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let blockedAnimation = null;
let blockedNoticeTimer = null;
let nextBlockedFeedbackAt = 0;
function clearBlockedFeedback() {
  blockedAnimation?.cancel();
  blockedAnimation = null;
  clearTimeout(blockedNoticeTimer);
  blockedNoticeTimer = null;
  blockedNotice.hidden = true;
  nextBlockedFeedbackAt = 0;
}
function showBlockedFeedback(direction) {
  const now = performance.now();
  if (now < nextBlockedFeedbackAt) return;
  nextBlockedFeedbackAt = now + 450;
  // Animate only the sprite; the grid, game state and undo history never change.
  blockedAnimation?.cancel();
  if (!reducedMotion.matches) {
    const [x, y] = { U: [0, -4], D: [0, 4], L: [-4, 0], R: [4, 0] }[direction];
    const animation = boardElement.querySelector('.person').animate([
      { transform: 'translate(0, 0)', easing: 'steps(2, end)' },
      { transform: `translate(${x}px, ${y}px)`, offset: .4, easing: 'steps(2, end)' },
      { transform: 'translate(0, 0)' },
    ], { duration: 220 });
    blockedAnimation = animation;
    animation.onfinish = () => { if (blockedAnimation === animation) blockedAnimation = null; };
  }
  blockedNotice.hidden = false;
  clearTimeout(blockedNoticeTimer);
  blockedNoticeTimer = setTimeout(() => {
    blockedNotice.hidden = true;
    blockedNoticeTimer = null;
  }, 900);
  announce('Oops推不动了');
}
function clearTransientFeedback() {
  clearDirectionPresses();
  clearBlockedFeedback();
}
const setFragment = trail => {
  const url = new URL(location.href);
  url.hash = trail ? 'result=' + trail : '';
  try { history.replaceState(null, '', url.href); } catch { /* In-memory results remain available. */ }
};
function focusRegion(element) {
  element.focus({ preventScroll: true });
  // Reveal the destination and its focus outline in short windows, without animated scrolling.
  element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
}

function render() {
  clearBlockedFeedback();
  const state = game.snapshot();
  boardElement.innerHTML = boardCells(state);
  boardElement.dataset.scene = 'live';
  boardElement.setAttribute('aria-label', `七乘七仓库，5个箱子，5个目标点，已到位${state.placed}个。`);
  document.querySelectorAll('[data-counter="moves"]').forEach(el => { el.textContent = String(state.moves).padStart(3, '0'); });
  document.querySelectorAll('[data-counter="pushes"]').forEach(el => { el.textContent = String(state.pushes).padStart(3, '0'); });
  document.querySelectorAll('[data-placed]').forEach(el => { el.textContent = state.placed; });
  gameView.querySelector('[data-status]').textContent = state.won ? '全部完成' : !state.moves ? '等待归位' : state.placed ? '部分完成' : '进行中';
  gameView.hidden = view !== 'game';
  resultView.hidden = view !== 'result';
  document.querySelector('.console').classList.toggle('victory', view === 'result');
  document.querySelectorAll('[data-direction]').forEach(button => { button.disabled = view !== 'game' || state.won; });
  syncDirectionPresses();
  document.querySelector('[data-action="undo"]').disabled = !state.canUndo;
  document.querySelectorAll('[data-action="restart"]').forEach(button => { button.disabled = false; });
  document.querySelector('[data-action="result"]').hidden = !state.won;
  document.querySelector('[data-action="board"]').hidden = !state.won;
  document.getElementById('result-details').hidden = !state.won;
  document.getElementById('result-celebration').hidden = !state.won;
  document.getElementById('result-stars').hidden = !state.won;
  document.getElementById('result-title').textContent = state.won ? '好耶，全部归位！' : '还没有通关记录';
  document.getElementById('result-tag').textContent = state.won ? 'LEVEL CLEAR' : 'READY TO PLAY';
  document.getElementById('result-message').hidden = state.won;
  document.getElementById('play-again').textContent = state.won ? '再玩一次' : '开始游戏';
  document.title = '口袋星期天 · ' + (view === 'result' ? state.won ? '通关' : '等待挑战' : '推箱子');
  return state;
}

function move(direction) {
  if (view !== 'game') return;
  const outcome = game.move(direction);
  if (!outcome.moved) {
    if (outcome.reason === 'wall' || outcome.reason === 'crate') showBlockedFeedback(direction);
    return;
  }
  if (game.snapshot().won) {
    view = 'result';
    saveRecord(game.snapshot().trail);
    setFragment(game.snapshot().trail);
  }
  const state = render();
  announce(`移动${state.moves}步，推动${state.pushes}次，已到位${state.placed}个。${state.won ? '恭喜通关！' : ''}`);
  if (state.won) focusRegion(document.getElementById('result-title'));
}

function action(name) {
  if (name === 'undo') {
    if (!game.undo()) return;
    view = 'game';
    saveRecord(null);
    setFragment(null);
    const state = render();
    announce(`已撤销。移动${state.moves}步，推动${state.pushes}次。`);
    focusRegion(boardElement);
  } else if (name === 'restart') {
    game.restart();
    view = 'game';
    saveRecord(null);
    setFragment(null);
    render();
    announce('已重开，步数和推动次数归零。');
    focusRegion(boardElement);
  } else if (game.snapshot().won && (name === 'board' || name === 'result')) {
    view = name === 'board' ? 'game' : 'result';
    render();
    focusRegion(view === 'game' ? boardElement : document.getElementById('result-title'));
  }
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.dataset.direction) move(button.dataset.direction);
  else if (button.dataset.action) action(button.dataset.action);
});
document.addEventListener('keydown', event => {
  if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
  const key = event.key.toLowerCase();
  const direction = directionKeys[key];
  if (direction) {
    event.preventDefault();
    if (directionButtons.get(direction).disabled) return;
    heldDirectionKeys.set(event.code || key, direction);
    syncDirectionPresses();
    move(direction);
  }
  else if (key === 'z' || key === 'backspace') { event.preventDefault(); action('undo'); }
  else if (key === 'r') { event.preventDefault(); action('restart'); }
});
document.addEventListener('keyup', event => {
  heldDirectionKeys.delete(event.code || event.key.toLowerCase());
  syncDirectionPresses();
});
window.addEventListener('blur', clearTransientFeedback);
window.addEventListener('pagehide', clearTransientFeedback);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearTransientFeedback(); });
render();
