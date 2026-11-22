// The three rooms of the Marigold Museum: tile maps, patrol routes, cameras.
// Legend: # wall, . floor, D lockpickable door, L main loot, g side-loot gem,
// E exit, P where Wren starts. Rows are 40 tiles wide, 20 tall; the bottom
// corridor (row 18) links every wing, so each room has several routes.
import { TILE, PLAY_TOP, tileCenter } from './config.js';

const LEVEL_DEFS = [
  {
    name: 'Room 1 — The Jade Gallery',
    sub: 'Steal the Jade Scarab, then slip out the south door.',
    lootName: 'Jade Scarab',
    lootValue: 12000,
    lootColor: '#37e08a',
    rows: [
      '########################################',
      '#P......#.............#................#',
      '#.......#.............#........g.......#',
      '#.......#.............#................#',
      '#.......#.....g.......#................#',
      '#.......D.............D.......####.....#',
      '#.......#.............#.......#..#.....#',
      '#.......#.............#.......#.L#.....#',
      '#.......#.............#.......#..#.....#',
      '#.......#.............#.......##D#.....#',
      '#.......#.............#................#',
      '#..g....#.............#................#',
      '#.......#.............#.......g........#',
      '#.......#.............#................#',
      '#.......#.............#................#',
      '#.......#.............#................#',
      '#.......#.............#................#',
      '#.......#.............#................#',
      '#....................E.................#',
      '########################################',
    ],
    guards: [
      { path: [[4, 2], [4, 17]] },
      { path: [[15, 2], [15, 17]] },
      { path: [[26, 3], [37, 3], [37, 16], [26, 16]] },
    ],
    cameras: [{ col: 20, row: 1, angle: Math.PI / 2, sweep: 0.96, speed: 0.55 }],
  },
  {
    name: 'Room 2 — The Vault Corridor',
    sub: 'The Sapphire Peacock sits behind a locked vault. Two cameras watch the hall.',
    lootName: 'Sapphire Peacock',
    lootValue: 25000,
    lootColor: '#4fa8ff',
    rows: [
      '########################################',
      '#P.....#......#...........#............#',
      '#......#......#...........#.....g......#',
      '#......#......#...........#............#',
      '#..g...#......#...........#............#',
      '#......D......#...........#............#',
      '#......#......#...........#............#',
      '#......#......#...........#....####....#',
      '#......#......#...........#....#.L#....#',
      '#......#......#...........#....#..#....#',
      '#......#......#...........#....##D#....#',
      '#......#......#...........#............#',
      '#......#......#...........#............#',
      '#......#......#...........#.....g......#',
      '#......#......#...........#............#',
      '#......#......#...........#............#',
      '#......#......#...........#............#',
      '#......#......#...........#............#',
      '#..................E...................#',
      '########################################',
    ],
    guards: [
      { path: [[4, 2], [4, 17]] },
      { path: [[11, 2], [11, 17]] },
      { path: [[20, 2], [20, 17]] },
      { path: [[30, 3], [36, 3], [36, 16], [30, 16]] },
    ],
    cameras: [
      { col: 25, row: 1, angle: Math.PI / 2, sweep: 0.9, speed: 0.6 },
      { col: 33, row: 18, angle: -Math.PI / 2, sweep: 0.9, speed: 0.5 },
    ],
  },
  {
    name: 'Room 3 — The Grand Vault',
    sub: 'The Golden Marigold. Four guards, three cameras, one way out — the long way.',
    lootName: 'Golden Marigold',
    lootValue: 50000,
    lootColor: '#ffc93c',
    rows: [
      '########################################',
      '#P......#..........#..........#........#',
      '#.......#..........#..........#...g....#',
      '#.......#..........#..........#........#',
      '#.......#..........#..........#........#',
      '#...g...D..........D..........#........#',
      '#.......#..........#..........#........#',
      '#.......#..........#..........#........#',
      '#.......#.....##########......#........#',
      '#.......#.....#........#......#........#',
      '#.......#.....#.g..L...#......#........#',
      '#.......#.....#........#......#........#',
      '#.......#.....####D#####......#........#',
      '#.......#..........#..........#........#',
      '#.......#..........#..........#........#',
      '#.......#..........#..........#........#',
      '#.......#..........#..........#........#',
      '#.......#..........#..........#....g...#',
      '#....................E.................#',
      '########################################',
    ],
    guards: [
      { path: [[4, 2], [4, 17]] },
      { path: [[11, 2], [11, 17]] },
      { path: [[25, 3], [25, 17]] },
      { path: [[34, 2], [34, 17]] },
    ],
    cameras: [
      { col: 18, row: 1, angle: Math.PI / 2, sweep: 0.9, speed: 0.55 },
      { col: 24, row: 18, angle: -Math.PI / 2, sweep: 0.9, speed: 0.5 },
      { col: 38, row: 10, angle: Math.PI, sweep: 0.8, speed: 0.65 },
    ],
  },
];

export const LEVEL_COUNT = LEVEL_DEFS.length;

// Turn one definition into a live level: walls stay in the grid, everything else
// becomes a typed object, and doors start locked.
export function parseLevel(index) {
  const def = LEVEL_DEFS[index];
  const grid = [];
  const doors = new Map();
  const gems = [];
  let loot = null;
  let exit = null;
  let start = null;
  def.rows.forEach((line, row) => {
    const cells = [];
    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      if (ch === '#') {
        cells.push('#');
      } else if (ch === 'D') {
        doors.set(col + ',' + row, { col, row, open: false, progress: 0 });
        cells.push('.');
      } else if (ch === 'L') {
        loot = { col, row, taken: false };
        cells.push('.');
      } else if (ch === 'g') {
        gems.push({ col, row, taken: false });
        cells.push('.');
      } else if (ch === 'E') {
        exit = { col, row };
        cells.push('.');
      } else if (ch === 'P') {
        start = { col, row };
        cells.push('.');
      } else {
        cells.push('.');
      }
    }
    grid.push(cells);
  });
  return {
    index,
    name: def.name,
    sub: def.sub,
    lootName: def.lootName,
    lootValue: def.lootValue,
    lootColor: def.lootColor,
    grid,
    doors,
    gems,
    loot,
    exit,
    start,
    guardDefs: def.guards,
    cameraDefs: def.cameras,
  };
}

// Is the tile at (col, row) solid right now? Out of bounds counts as a wall.
export function isSolid(level, col, row) {
  if (col < 0 || row < 0 || col >= level.grid[0].length || row >= level.grid.length) return true;
  if (level.grid[row][col] === '#') return true;
  const door = level.doors.get(col + ',' + row);
  if (door && !door.open) return true;
  return false;
}

// Does a circle at (x, y) with radius r overlap any solid tile?
export function circleBlocked(level, x, y, r) {
  const c0 = Math.floor((x - r) / TILE);
  const c1 = Math.floor((x + r) / TILE);
  const r0 = Math.floor((y - r - PLAY_TOP) / TILE);
  const r1 = Math.floor((y + r - PLAY_TOP) / TILE);
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      if (!isSolid(level, col, row)) continue;
      const bx = col * TILE;
      const by = PLAY_TOP + row * TILE;
      const nx = Math.max(bx, Math.min(x, bx + TILE));
      const ny = Math.max(by, Math.min(y, by + TILE));
      if ((x - nx) * (x - nx) + (y - ny) * (y - ny) < r * r) return true;
    }
  }
  return false;
}

// Slide a circle by (dx, dy), one axis at a time so it slides along walls.
export function moveCircle(level, x, y, dx, dy, r) {
  if (dx !== 0 && !circleBlocked(level, x + dx, y, r)) x += dx;
  if (dy !== 0 && !circleBlocked(level, x, y + dy, r)) y += dy;
  return { x, y };
}

// Is the straight line from (x0, y0) to (x1, y1) blocked by a wall, a closed
// door, or a smoke cloud? Sampled every 6 px — the shared sight test for
// guards and cameras.
export function segmentBlocked(level, x0, y0, x1, y1, clouds) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(len / 6));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = x0 + dx * t;
    const y = y0 + dy * t;
    const col = Math.floor(x / TILE);
    const row = Math.floor((y - PLAY_TOP) / TILE);
    if (isSolid(level, col, row)) return true;
    for (const cloud of clouds) {
      const cx = x - cloud.x;
      const cy = y - cloud.y;
      if (cx * cx + cy * cy < cloud.r * cloud.r) return true;
    }
  }
  return false;
}

// The nearest closed door within reach of (x, y), or null.
export function nearestDoor(level, x, y, reach) {
  let best = null;
  let bestD = reach;
  for (const door of level.doors.values()) {
    if (door.open) continue;
    const c = tileCenter(door.col, door.row);
    const d = Math.hypot(c.x - x, c.y - y);
    if (d < bestD) {
      bestD = d;
      best = door;
    }
  }
  return best;
}

// Breadth-first reachability over floor tiles, treating closed doors as
// passable: used by the play-test to prove a room can be cleared.
export function reachable(level, fromCol, fromRow, toCol, toRow) {
  const key = (c, r) => c + ',' + r;
  const seen = new Set([key(fromCol, fromRow)]);
  const queue = [[fromCol, fromRow]];
  while (queue.length) {
    const [c, r] = queue.shift();
    if (c === toCol && r === toRow) return true;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= level.grid[0].length || nr >= level.grid.length) continue;
      if (level.grid[nr][nc] === '#') continue;
      if (seen.has(key(nc, nr))) continue;
      seen.add(key(nc, nr));
      queue.push([nc, nr]);
    }
  }
  return false;
}
