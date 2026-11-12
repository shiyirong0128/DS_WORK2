// Shared live level and static reference scenes. Coordinates are zero-based [row, column].
// Terrain and targets are independent of crates and the player.
export const room = [
  '#######',
  '# . . #',
  '#     #',
  '#  .  #',
  '#     #',
  '#. .  #',
  '#######',
];

export const scenes = [
  {
    id: 'initial', file: 'index.html', title: '推箱子', status: '等待归位',
    crates: [[2, 2], [2, 4], [4, 2], [4, 3], [4, 4]],
    player: [5, 2], moves: 0, pushes: 0,
  },
  {
    id: 'partial', file: 'partial.html', title: '部分完成', status: '部分完成',
    crates: [[1, 2], [1, 4], [4, 2], [4, 3], [4, 4]],
    player: [3, 3], moves: 11, pushes: 2,
  },
  {
    id: 'solved', file: 'solved.html', title: '全部完成', status: '全部完成',
    crates: [[1, 2], [1, 4], [3, 3], [5, 1], [5, 3]],
    player: [3, 4], moves: 28, pushes: 7,
  },
];
