export class SokobanGame {
  #level;
  #state;
  #history = [];
  constructor(level) {
    this.#level = { room: [...level.room], player: [...level.player], crates: level.crates.map(p => [...p]) };
    this.restart();
  }
  #copy(state) {
    return { player: [...state.player], crates: state.crates.map(p => [...p]), moves: state.moves, pushes: state.pushes };
  }
  snapshot() {
    const state = this.#copy(this.#state);
    state.placed = state.crates.filter(([r, c]) => this.#level.room[r][c] === '.').length;
    state.won = state.placed === state.crates.length;
    state.canUndo = this.#history.length > 0;
    state.trail = this.#history.map(item => item.direction).join('');
    return state;
  }
  move(direction) {
    const delta = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] }[direction];
    if (!delta || this.#state.crates.every(([r, c]) => this.#level.room[r][c] === '.')) return { moved: false, reason: 'inactive' };
    const [dr, dc] = delta;
    const [r, c] = this.#state.player;
    const next = [r + dr, c + dc];
    const wall = ([y, x]) => this.#level.room[y]?.[x] === undefined || this.#level.room[y][x] === '#';
    const boxAt = ([y, x]) => this.#state.crates.findIndex(([br, bc]) => y === br && x === bc);
    if (wall(next)) return { moved: false, reason: 'wall' };
    const box = boxAt(next);
    const beyond = [next[0] + dr, next[1] + dc];
    if (box >= 0 && (wall(beyond) || boxAt(beyond) >= 0)) return { moved: false, reason: 'crate' };
    this.#history.push({ state: this.#copy(this.#state), direction });
    if (box >= 0) {
      this.#state.crates[box] = beyond;
      this.#state.pushes += 1;
    }
    this.#state.player = next;
    this.#state.moves += 1;
    return { moved: true, pushed: box >= 0 };
  }
  undo() {
    const previous = this.#history.pop();
    if (!previous) return false;
    this.#state = previous.state;
    return true;
  }
  restart() {
    this.#state = { player: [...this.#level.player], crates: this.#level.crates.map(p => [...p]), moves: 0, pushes: 0 };
    this.#history = [];
  }
}

// Saved results contain a replayable move trail, never trusted numeric scores.
export function replayWin(level, trail) {
  if (typeof trail !== 'string' || !/^[UDLR]+$/.test(trail)) return null;
  const game = new SokobanGame(level);
  for (const direction of trail) if (!game.move(direction).moved) return null;
  return game.snapshot().won ? game : null;
}
