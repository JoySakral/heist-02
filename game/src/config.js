// Shared tuning for The Marigold Job: tile size, speeds, alarm rates, tool counts.
// One place holds every number the other modules read, so balancing is a single edit.
export const TILE = 32;
export const COLS = 40;
export const ROWS = 20;
export const HUD_H = 80;
export const VIEW_W = 1280;
export const VIEW_H = 720;
export const PLAY_TOP = HUD_H;
export const PLAY_W = COLS * TILE;
export const PLAY_H = ROWS * TILE;

export const WALK_SPEED = 155; // thief, pixels per second
export const SNEAK_SPEED = 78; // thief while holding Shift
export const GUARD_PATROL_SPEED = 92;
export const GUARD_CHASE_SPEED = 148;
export const GUARD_SIGHT_RANGE = 255;
export const GUARD_SIGHT_FOV = (76 * Math.PI) / 180;
export const CAMERA_SIGHT_RANGE = 310;
export const CAMERA_SIGHT_FOV = (62 * Math.PI) / 180;
export const SNEAK_SIGHT_FACTOR = 0.72; // sneaking shrinks every cone's reach
export const HEAR_RADIUS = 95; // guards hear a running thief this close

export const ALARM_MAX = 100;
export const ALARM_RISE_GUARD = 24; // per second while a guard sees Wren
export const ALARM_RISE_CAMERA = 15; // per second while a camera sees Wren
export const ALARM_RISE_CHASE = 10; // extra per second while any guard chases
export const ALARM_LOOT_SPIKE = 12; // instant spike when the main loot is grabbed
export const ALARM_TOUCH_SPIKE = 30; // instant spike when a guard grabs Wren
export const ALARM_DECAY = 7; // per second while nobody sees Wren

export const SMOKE_COUNT = 3; // smoke bombs per room
export const EMP_COUNT = 2; // EMPs per room
export const SMOKE_RADIUS = 82;
export const SMOKE_DURATION = 7; // seconds a cloud hangs
export const EMP_RADIUS = 150; // a camera this close to the blast is disabled
export const EMP_DURATION = 8; // seconds a camera stays dark
export const LOCKPICK_SECONDS = 1.5; // hold E this long to open a door
export const GEM_VALUE = 500;
export const THIEF_RADIUS = 12;
export const GUARD_RADIUS = 13;

export function tileCenter(col, row) {
  return { x: col * TILE + TILE / 2, y: PLAY_TOP + row * TILE + TILE / 2 };
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

// Deterministic speckles for the floor: the same tile always looks the same.
export function tileHash(col, row) {
  let h = (col * 374761393 + row * 668265263) ^ 0x5bf03635;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}
