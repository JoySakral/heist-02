// Staged scenes for the screenshots (?shot=cover|vault|getaway). Each one
// starts a real room in play state, then poses Wren, the guards and the alarm
// so a single frame shows the whole game: a room being crossed, guards with
// cones, a camera cone, the glowing loot and the alarm meter. Guards hold
// still (state 'hold') so the composition does not drift between loads.
import { tileCenter } from './config.js';

function poseGuard(guard, col, row, dir) {
  const p = tileCenter(col, row);
  guard.x = p.x;
  guard.y = p.y;
  guard.dir = dir;
  guard.state = 'hold';
  guard.seesPlayer = false;
}

export function stageShot(game, name) {
  if (name === 'cover') {
    game.startLevel(0);
    const t = tileCenter(19, 10);
    game.thief.x = t.x;
    game.thief.y = t.y;
    game.thief.dir = Math.PI / 2;
    poseGuard(game.guards[0], 4, 9, 0); // left gallery guard, looking east
    poseGuard(game.guards[1], 15, 7, Math.PI / 2); // mid-hall guard, looking south
    poseGuard(game.guards[2], 30, 12, -Math.PI / 2); // right guard, looking north
    game.alarm.value = 34;
    game.screen = 'play';
    game.frozen = true;
  } else if (name === 'vault') {
    game.startLevel(1);
    const t = tileCenter(30, 12);
    game.thief.x = t.x;
    game.thief.y = t.y;
    game.thief.dir = -Math.PI / 4;
    poseGuard(game.guards[2], 20, 8, 0);
    poseGuard(game.guards[3], 34, 14, Math.PI);
    // Wren is mid-pick on the vault door.
    const door = game.level.doors.get('33,10');
    if (door) game.lockpick = { door, progress: 0.6 };
    game.alarm.value = 52;
    game.screen = 'play';
    game.frozen = true;
  } else if (name === 'getaway') {
    game.startLevel(2);
    game.level.loot.taken = true;
    game.score = game.level.lootValue;
    const t = tileCenter(21, 15);
    game.thief.x = t.x;
    game.thief.y = t.y;
    game.thief.dir = Math.PI / 2;
    poseGuard(game.guards[1], 11, 12, Math.PI / 2);
    poseGuard(game.guards[2], 25, 13, Math.PI / 2);
    const chaser = game.guards[3];
    const cp = tileCenter(30, 15);
    chaser.x = cp.x;
    chaser.y = cp.y;
    chaser.dir = Math.PI;
    chaser.state = 'chase';
    chaser.lastSeen = { x: t.x, y: t.y };
    game.alarm.value = 68;
    game.screen = 'play';
    game.frozen = true;
  }
}
