// Wren, the thief: WASD/arrows to walk, Shift to sneak (slower, quieter,
// harder to spot). Movement slides along walls through the level's collision.
import { WALK_SPEED, SNEAK_SPEED, THIEF_RADIUS, tileCenter } from './config.js';
import { moveCircle } from './levels.js';

export function makeThief(level) {
  const s = tileCenter(level.start.col, level.start.row);
  return {
    x: s.x,
    y: s.y,
    dir: 0, // facing angle, radians; 0 is east
    moving: false,
    sneaking: false,
    stepT: 0, // time until the next footstep sound
  };
}

// Move Wren for one frame. Returns how far she travelled, for step sounds.
export function updateThief(thief, input, level, dt) {
  const v = input.moveVector();
  thief.sneaking = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
  const speed = thief.sneaking ? SNEAK_SPEED : WALK_SPEED;
  const dx = v.x * speed * dt;
  const dy = v.y * speed * dt;
  thief.moving = dx !== 0 || dy !== 0;
  if (thief.moving) {
    const before = { x: thief.x, y: thief.y };
    const moved = moveCircle(level, thief.x, thief.y, dx, dy, THIEF_RADIUS);
    thief.x = moved.x;
    thief.y = moved.y;
    thief.dir = Math.atan2(thief.y - before.y, thief.x - before.x);
    thief.stepT -= dt;
    return Math.hypot(thief.x - before.x, thief.y - before.y);
  }
  return 0;
}
