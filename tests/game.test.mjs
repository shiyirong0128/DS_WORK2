import test from 'node:test';
import assert from 'node:assert/strict';
import { SokobanGame, replayWin } from '../src/game.mjs';
import { room, scenes } from '../src/boards.mjs';
import { solution } from './fixtures.mjs';

const level = { room, ...scenes[0] };
const play = (game, trail) => [...trail].forEach(d => assert.equal(game.move(d).moved, true, `Blocked solution step ${d}`));

test('7×7 level has five crates, five targets and one valid player', () => {
  assert.equal(room.length, 7);
  assert.ok(room.every(row => row.length === 7));
  assert.equal(room.join('').split('.').length - 1, 5);
  assert.equal(level.crates.length, 5);
  assert.equal(new Set(level.crates.map(p => p.join())).size, 5);
  assert.ok(level.crates.every(([r,c]) => room[r][c] !== '#'));
  assert.ok(!level.crates.some(p => p.join() === level.player.join()));
});
test('walking counts once; pushing counts one move and one push', () => {
  const game = new SokobanGame(level);
  game.move('L');
  assert.equal(game.snapshot().moves, 1);
  assert.equal(game.snapshot().pushes, 0);
  game.restart();
  game.move('U');
  assert.equal(game.snapshot().moves, 1);
  assert.equal(game.snapshot().pushes, 1);
  assert.deepEqual(game.snapshot().player, [4,2]);
  assert.ok(game.snapshot().crates.some(p => p.join() === '3,2'));
});
test('walking into a wall changes neither positions, counters nor undo history', () => {
  const game = new SokobanGame(level);
  const before = game.snapshot();
  assert.deepEqual(game.move('D'), { moved: false, reason: 'wall' });
  assert.deepEqual(game.snapshot(), before);
  assert.equal(game.undo(), false);
});
test('cannot push two adjacent crates', () => {
  const game = new SokobanGame(level);
  play(game, 'LU');
  const before = game.snapshot();
  assert.deepEqual(game.move('R'), { moved: false, reason: 'crate' });
  assert.deepEqual(game.snapshot(), before);
});
test('a crate blocked by a wall cannot move or increment counters', () => {
  const game = new SokobanGame(level);
  play(game, 'LUURU');
  const before = game.snapshot();
  assert.deepEqual(game.move('U'), { moved: false, reason: 'crate' });
  assert.deepEqual(game.snapshot(), before);
});
test('undo restores walks, pushes, placement and counters exactly', () => {
  const game = new SokobanGame(level);
  const snapshots = [game.snapshot()];
  for (const d of 'LUURU') { game.move(d); snapshots.push(game.snapshot()); }
  for (let i = snapshots.length - 2; i >= 0; i--) {
    assert.equal(game.undo(), true);
    assert.deepEqual(game.snapshot(), snapshots[i]);
  }
  assert.equal(game.undo(), false);
});
test('a player on a target is not a placed crate; crates can leave targets', () => {
  const game = new SokobanGame(level);
  play(game, 'LUURUDRRUDL');
  assert.deepEqual(game.snapshot().player, [3,3]);
  assert.equal(game.snapshot().placed, 2);
  play(game, 'ULLUR');
  assert.equal(game.snapshot().placed, 1);
  game.undo();
  assert.equal(game.snapshot().placed, 2);
});
test('real initial level is solvable in 28 moves and 7 pushes', () => {
  const game = new SokobanGame(level);
  play(game, solution);
  assert.equal(game.snapshot().won, true);
  assert.equal(game.snapshot().placed, 5);
  assert.equal(game.snapshot().moves, 28);
  assert.equal(game.snapshot().pushes, 7);
  const won = game.snapshot();
  assert.equal(game.move('D').moved, false);
  assert.deepEqual(game.snapshot(), won);
  game.undo();
  assert.equal(game.snapshot().won, false);
  assert.equal(game.snapshot().placed, 4);
  assert.equal(game.snapshot().moves, 27);
  assert.equal(game.snapshot().pushes, 6);
  game.move('L');
  assert.deepEqual(game.snapshot(), won);
});
test('restart clears all moves, pushes and undo history after winning', () => {
  const game = new SokobanGame(level);
  play(game, solution);
  game.restart();
  assert.deepEqual(game.snapshot(), new SokobanGame(level).snapshot());
});
test('snapshots are detached and result data is validated by replay', () => {
  const game = new SokobanGame(level);
  game.snapshot().crates[0][0] = 6;
  assert.deepEqual(game.snapshot().crates, level.crates);
  assert.equal(replayWin(level, 'D' + solution), null);
  assert.equal(replayWin(level, 'LU'), null);
  assert.equal(replayWin(level, '<script>'), null);
  assert.equal(replayWin(level, solution).snapshot().moves, 28);
});
