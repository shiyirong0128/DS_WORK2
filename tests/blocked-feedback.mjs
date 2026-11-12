import assert from 'node:assert/strict';

export async function checkBlockedFeedback({ call, evaluate, key, click, read, play, shoot, size, passed }) {
  const arrows = { U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight' };
  const wasd = { U: 'w', D: 's', L: 'a', R: 'd' };
  const wait = ms => evaluate(`new Promise(resolve => setTimeout(resolve, ${ms}))`);
  const feedback = () => evaluate(`(() => {
    const sprite = document.querySelector('.person');
    const notice = document.getElementById('blocked-notice');
    const matrix = new DOMMatrix(getComputedStyle(sprite).transform);
    const n = notice.getBoundingClientRect(), b = document.querySelector('.board').getBoundingClientRect();
    return { hidden: notice.hidden, text: notice.textContent, x: matrix.m41, y: matrix.m42,
      animations: sprite.getAnimations().length, top: n.top, bottom: n.bottom, boardTop: b.top,
      left: n.left, right: n.right, viewport: innerWidth };
  })()`);
  const pauseAtPeak = () => evaluate(`(() => {
    const animations = document.querySelector('.person').getAnimations();
    if (animations.length !== 1) throw Error('Expected one recoil animation');
    animations[0].pause();
    animations[0].currentTime = animations[0].effect.getTiming().duration / 2;
  })()`);
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await key('r');
  const initial = await read();
  const cases = [
    { name: 'player against wall', route: '', direction: 'D' },
    { name: 'crate against wall', route: 'LUURU', direction: 'U' },
    { name: 'crate against crate', route: 'LU', direction: 'R' },
    { name: 'left wall', route: 'L', direction: 'L' },
  ];
  for (const { name, route, direction } of cases) {
    for (const input of ['wasd', 'arrows', 'mouse']) {
      await key('r'); await play(route);
      const before = await read();
      const boardTop = (await feedback()).boardTop;
      if (input === 'mouse') await click(`[data-direction="${direction}"]`);
      else await key((input === 'wasd' ? wasd : arrows)[direction]);
      assert.deepEqual(await read(), before, name + ' / ' + input);
      await pauseAtPeak();
      const bump = await feedback();
      assert.equal(bump.hidden, false); assert.equal(bump.text, 'Oops推不动了');
      assert.equal(bump.animations, 1); assert.equal(bump.boardTop, boardTop);
      assert.ok(bump.top >= 0 && bump.bottom < bump.boardTop);
      assert.ok(bump.left >= 0 && bump.right <= bump.viewport);
      assert.deepEqual([bump.x, bump.y], { U:[0,-4], D:[0,4], L:[-4,0], R:[4,0] }[direction]);
      if (!route && input === 'wasd') await shoot('受阻反馈');
      await evaluate("document.querySelector('.person').getAnimations()[0].finish()");
      const returned = await feedback();
      assert.equal(returned.x, 0); assert.equal(returned.y, 0);
      assert.deepEqual(await read(), before);
    }
  }
  passed('wall, blocked crate and adjacent crates: WASD/arrows/mouse recoil in all four directions without changing positions, counts or layout');

  // Observe actual animation instances during repeated native key events, without replacing game code.
  await key('r');
  await evaluate(`(() => {
    const seen = new WeakSet();
    window.feedbackProbe = { starts: [], maxActive: 0 };
    window.feedbackPoll = setInterval(() => {
      const animations = document.querySelector('.person').getAnimations();
      feedbackProbe.maxActive = Math.max(feedbackProbe.maxActive, animations.length);
      for (const animation of animations) if (!seen.has(animation)) {
        seen.add(animation); feedbackProbe.starts.push(performance.now());
      }
    }, 8);
  })()`);
  await key('s', 'keyDown');
  for (let i = 0; i < 24; i++) {
    await wait(40);
    await key('s', 'keyDown', { autoRepeat: true });
  }
  await key('s', 'keyUp');
  await wait(1000);
  const probe = await evaluate('clearInterval(feedbackPoll); feedbackProbe');
  await evaluate('delete window.feedbackPoll; delete window.feedbackProbe');
  assert.equal(probe.maxActive, 1);
  assert.ok(probe.starts.length >= 2);
  const gaps = probe.starts.slice(1).map((time, i) => time - probe.starts[i]);
  assert.ok(gaps.every(gap => gap >= 420), JSON.stringify(gaps));
  const ended = await feedback();
  assert.equal(ended.hidden, true); assert.equal(ended.animations, 0);
  assert.equal(ended.x, 0); assert.equal(ended.y, 0);
  assert.deepEqual(await read(), initial);
  passed('held blocked key is rate-limited, at most one recoil runs, notice expires and no queued animation follows release', {
    bursts: probe.starts.length, minimumObservedGapMs: Math.round(Math.min(...gaps)),
  });

  await key('r'); await key('s'); await key('w');
  assert.equal((await feedback()).hidden, true); assert.equal((await feedback()).animations, 0);
  assert.equal((await read()).moves, 1); assert.equal((await read()).pushes, 1);
  await key('z'); assert.deepEqual(await read(), initial);
  await key('a'); await key('a'); await key('z');
  assert.deepEqual(await read(), initial); assert.equal((await feedback()).hidden, true);
  await key('s'); await click('.actions [data-action="restart"]');
  assert.deepEqual(await read(), initial); assert.equal((await feedback()).hidden, true);
  await key('s'); await evaluate("window.dispatchEvent(new Event('blur'))");
  assert.equal((await feedback()).hidden, true); assert.equal((await feedback()).animations, 0);
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await key('s');
  assert.equal((await feedback()).hidden, false); assert.equal((await feedback()).animations, 0);
  assert.deepEqual(await read(), initial);
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  passed('valid move, undo, restart and blur cancel stale feedback; reduced-motion mode keeps the message without recoil');

  await size(320, 740, true);
  await key('r'); await key('s'); await pauseAtPeak();
  const narrow = await feedback();
  assert.ok(narrow.left >= 0 && narrow.right <= narrow.viewport && narrow.bottom < narrow.boardTop);
  await shoot('手机受阻反馈');
  await key('r'); await size(1440);
  assert.deepEqual(await read(), initial);
  passed('320px blocked notice stays above the board and inside the screen');
}
