// Museum guards: patrol waypoints, raycast vision cones clipped by walls and
// smoke, and a state machine — patrol, suspicious, chase, search. Cameras
// reuse the same sight test (see cameras.js).
import {
  TILE,
  PLAY_TOP,
  GUARD_PATROL_SPEED,
  GUARD_CHASE_SPEED,
  GUARD_SIGHT_RANGE,
  GUARD_SIGHT_FOV,
  SNEAK_SIGHT_FACTOR,
  HEAR_RADIUS,
  angleDiff,
  clamp,
  tileCenter,
} from './config.js';
import { moveCircle, segmentBlocked } from './levels.js';

const CONE_RAYS = 26;
const RAY_STEP = 6;

// One guard, built from a patrol definition in levels.js.
export function makeGuard(def) {
  const first = tileCenter(def.path[0][0], def.path[0][1]);
  const second = tileCenter(def.path[1][0], def.path[1][1]);
  return {
    x: first.x,
    y: first.y,
    dir: Math.atan2(second.y - first.y, second.x - first.x),
    path: def.path.map(([c, r]) => tileCenter(c, r)),
    wp: 1,
    pauseT: 0,
    state: 'patrol', // patrol | suspicious | chase | search | hold (staged shots)
    stateT: 0,
    lastSeen: null,
    lostT: 0,
    touchT: 0, // cooldown between alarm spikes from grabbing Wren
    seesPlayer: false,
  };
}

// Raycast a vision cone: 26 rays across the field of view, each stopping at
// the first wall, closed door or smoke cloud. Returns polygon points.
export function castVisionCone(level, ox, oy, facing, fov, range, clouds) {
  const points = [{ x: ox, y: oy }];
  for (let i = 0; i <= CONE_RAYS; i++) {
    const a = facing - fov / 2 + (fov * i) / CONE_RAYS;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    let reach = range;
    for (let t = RAY_STEP; t <= range; t += RAY_STEP) {
      const x = ox + cos * t;
      const y = oy + sin * t;
      const col = Math.floor(x / TILE);
      const row = Math.floor((y - PLAY_TOP) / TILE);
      let blocked = false;
      if (level.grid[row] === undefined || level.grid[row][col] === '#') blocked = true;
      if (!blocked) {
        const door = level.doors.get(col + ',' + row);
        if (door && !door.open) blocked = true;
      }
      if (!blocked && clouds) {
        for (const cloud of clouds) {
          const dx = x - cloud.x;
          const dy = y - cloud.y;
          if (dx * dx + dy * dy < cloud.r * cloud.r) {
            blocked = true;
            break;
          }
        }
      }
      if (blocked) {
        reach = t;
        break;
      }
    }
    points.push({ x: ox + cos * reach, y: oy + sin * reach });
  }
  return points;
}

// Does an eye at (ox, oy) facing `facing` see the thief? Range, field of
// view, a clear line (walls, doors and smoke all block it), and sneaking
// shrinks the reach.
export function eyeSeesPlayer(level, ox, oy, facing, fov, range, player, clouds) {
  const dx = player.x - ox;
  const dy = player.y - oy;
  const d = Math.hypot(dx, dy);
  const reach = player.sneaking ? range * SNEAK_SIGHT_FACTOR : range;
  if (d > reach) return false;
  if (d > 4 && Math.abs(angleDiff(Math.atan2(dy, dx), facing)) > fov / 2) return false;
  return !segmentBlocked(level, ox, oy, player.x, player.y, clouds);
}

export function guardSeesPlayer(level, guard, player, clouds) {
  return eyeSeesPlayer(
    level, guard.x, guard.y, guard.dir,
    GUARD_SIGHT_FOV, GUARD_SIGHT_RANGE, player, clouds,
  );
}

// One frame of guard behaviour. `events` collects what main.js must react to:
// { spotted: true } when the guard first sees Wren, { touch: true } when it
// grabs her.
export function updateGuard(guard, level, player, clouds, dt, events) {
  guard.touchT = Math.max(0, guard.touchT - dt);

  // Sight is always evaluated — even for a held guard — so a staged scene
  // still reports what it sees; only movement and state changes are frozen.
  const seen = guardSeesPlayer(level, guard, player, clouds);
  guard.seesPlayer = seen;
  if (guard.state === 'hold') return;

  if (seen) {
    guard.lastSeen = { x: player.x, y: player.y };
    guard.lostT = 0;
    if (guard.state !== 'chase') {
      guard.state = 'chase';
      guard.stateT = 0;
      events.spotted = true;
    }
  } else if (guard.state === 'chase') {
    guard.lostT += dt;
    if (guard.lostT > 2.5) {
      guard.state = 'search';
      guard.stateT = 0;
    }
  }

  // A running thief is heard up close: the guard turns to look.
  if (guard.state === 'patrol' && player.moving && !player.sneaking) {
    const d = Math.hypot(player.x - guard.x, player.y - guard.y);
    if (d < HEAR_RADIUS) {
      guard.state = 'suspicious';
      guard.stateT = 0;
      guard.dir = Math.atan2(player.y - guard.y, player.x - guard.x);
    }
  }

  if (guard.state === 'patrol') {
    guard.pauseT -= dt;
    if (guard.pauseT > 0) return;
    const target = guard.path[guard.wp];
    const dx = target.x - guard.x;
    const dy = target.y - guard.y;
    const d = Math.hypot(dx, dy);
    if (d < 6) {
      guard.wp = (guard.wp + 1) % guard.path.length;
      guard.pauseT = 0.8;
      return;
    }
    const step = (GUARD_PATROL_SPEED * dt) / d;
    const moved = moveCircle(level, guard.x, guard.y, dx * step, dy * step, 13);
    guard.dir = Math.atan2(moved.y - guard.y, moved.x - guard.x);
    guard.x = moved.x;
    guard.y = moved.y;
  } else if (guard.state === 'suspicious') {
    guard.stateT += dt;
    if (guard.stateT > 1.2) {
      guard.state = 'patrol';
      guard.stateT = 0;
    }
  } else if (guard.state === 'chase') {
    guard.stateT += dt;
    const tx = guard.lastSeen ? guard.lastSeen.x : player.x;
    const ty = guard.lastSeen ? guard.lastSeen.y : player.y;
    const dx = tx - guard.x;
    const dy = ty - guard.y;
    const d = Math.hypot(dx, dy);
    if (d > 4) {
      const step = (GUARD_CHASE_SPEED * dt) / d;
      const moved = moveCircle(level, guard.x, guard.y, dx * step, dy * step, 13);
      guard.dir = Math.atan2(moved.y - guard.y, moved.x - guard.x);
      guard.x = moved.x;
      guard.y = moved.y;
    }
    if (d < 26 && guard.touchT <= 0) {
      guard.touchT = 1;
      events.touch = true;
    }
  } else if (guard.state === 'search') {
    guard.stateT += dt;
    const target = guard.lastSeen || guard.path[0];
    const dx = target.x - guard.x;
    const dy = target.y - guard.y;
    const d = Math.hypot(dx, dy);
    if (d > 8) {
      const step = (GUARD_PATROL_SPEED * dt) / d;
      const moved = moveCircle(level, guard.x, guard.y, dx * step, dy * step, 13);
      guard.dir = Math.atan2(moved.y - guard.y, moved.x - guard.x);
      guard.x = moved.x;
      guard.y = moved.y;
    } else {
      // Arrived where Wren was last seen: sweep the room, then give up.
      guard.dir += dt * 1.8;
      if (guard.stateT > 3.5) {
        guard.state = 'patrol';
        guard.stateT = 0;
      }
    }
  }
  guard.dir = clamp(guard.dir, -Math.PI * 4, Math.PI * 4);
}
