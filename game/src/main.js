// Boot and the one loop for The Marigold Job: input every frame, the world
// advancing in fixed 1/60 s steps, the renderer painting what is there.
// Screens: title, brief, play, clear, busted, win.
// ?shot=cover|vault|getaway stages a screenshot scene instead of running.
import {
  TILE, PLAY_TOP, VIEW_W, VIEW_H,
  SMOKE_COUNT, EMP_COUNT, SMOKE_RADIUS, SMOKE_DURATION, EMP_RADIUS, EMP_DURATION,
  LOCKPICK_SECONDS, GEM_VALUE, ALARM_TOUCH_SPIKE, ALARM_LOOT_SPIKE,
  clamp, dist,
} from './config.js';
import { parseLevel, nearestDoor, LEVEL_COUNT } from './levels.js';
import { makeThief, updateThief } from './thief.js';
import { makeGuard, updateGuard } from './guards.js';
import { makeCamera, updateCamera, cameraSeesPlayer, cameraDisabled, disableCamera } from './cameras.js';
import { makeAlarm, updateAlarm, alarmSpike } from './alarm.js';
import { createInput } from './input.js';
import { createRenderer } from './render.js';
import { stageShot } from './shots.js';
import { sfx } from './audio.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const input = createInput(canvas);

// The whole mutable game state, in one object the renderer and the test
// hooks both read.
const game = {
  screen: 'title',
  levelIndex: 0,
  level: null,
  thief: null,
  guards: [],
  cameras: [],
  alarm: makeAlarm(),
  smoke: [],
  emps: [],
  tools: { smoke: SMOKE_COUNT, emp: EMP_COUNT, selected: 'smoke' },
  score: 0,
  gemsGot: 0,
  time: 0,
  now: 0,
  lockpick: null,
  nearDoor: null,
  message: '',
  messageT: 0,
  frozen: false, // staged screenshot: render, but do not simulate
  input,
};

function announce(message) {
  status.textContent = message;
}

function setMessage(text, seconds) {
  game.message = text;
  game.messageT = seconds || 3;
}

function startLevel(index) {
  game.levelIndex = index;
  game.level = parseLevel(index);
  game.thief = makeThief(game.level);
  game.guards = game.level.guardDefs.map(makeGuard);
  game.cameras = game.level.cameraDefs.map(makeCamera);
  game.alarm = makeAlarm();
  game.smoke = [];
  game.emps = [];
  game.tools = { smoke: SMOKE_COUNT, emp: EMP_COUNT, selected: 'smoke' };
  game.lockpick = null;
  game.nearDoor = null;
  game.message = '';
  game.messageT = 0;
  game.frozen = false;
}
game.startLevel = startLevel;

function startRoom() {
  startLevel(game.levelIndex);
  game.screen = 'brief';
  announce(game.level.name + '. ' + game.level.sub);
}

function throwTool(kind) {
  const m = input.mouse;
  const tx = clamp(m.x, 0, VIEW_W);
  const ty = clamp(m.y, PLAY_TOP, VIEW_H);
  if (kind === 'smoke') {
    if (game.tools.smoke <= 0) {
      sfx.denied();
      setMessage('No smoke bombs left!', 1.5);
      return;
    }
    game.tools.smoke -= 1;
    game.smoke.push({ x: tx, y: ty, r: SMOKE_RADIUS, until: game.now + SMOKE_DURATION });
    sfx.smoke();
    setMessage('Smoke out — their cones cannot see through it.', 2);
  } else {
    if (game.tools.emp <= 0) {
      sfx.denied();
      setMessage('No EMPs left!', 1.5);
      return;
    }
    // The blast disables the nearest camera within reach of the impact.
    let best = null;
    let bestD = EMP_RADIUS;
    for (const cam of game.cameras) {
      const d = dist(cam.x, cam.y, tx, ty);
      if (d < bestD) {
        bestD = d;
        best = cam;
      }
    }
    game.tools.emp -= 1;
    game.emps.push({ x: tx, y: ty, t: game.now });
    if (best) {
      disableCamera(best, game.now);
      sfx.emp();
      setMessage('Camera disabled for ' + EMP_DURATION + ' seconds.', 2);
    } else {
      sfx.emp();
      setMessage('EMP burst — no camera in range.', 2);
    }
  }
}

function updatePlay(dt) {
  const level = game.level;
  const thief = game.thief;
  game.time += dt;
  game.now += dt;

  // Movement and footsteps.
  const moved = updateThief(thief, input, level, dt);
  if (moved > 0 && thief.stepT <= 0) {
    thief.stepT = thief.sneaking ? 0.55 : 0.34;
    if (!thief.sneaking) sfx.step();
  }

  // Smoke clouds fade out.
  game.smoke = game.smoke.filter((c) => game.now < c.until);
  game.emps = game.emps.filter((e) => game.now - e.t < 0.6);

  // Lockpicking: hold E beside a closed door.
  game.nearDoor = nearestDoor(level, thief.x, thief.y, 48);
  if (game.nearDoor && input.isDown('KeyE')) {
    if (!game.lockpick || game.lockpick.door !== game.nearDoor) {
      game.lockpick = { door: game.nearDoor, progress: 0 };
    }
    game.lockpick.progress += dt / LOCKPICK_SECONDS;
    if (Math.floor(game.lockpick.progress * 10) !== Math.floor((game.lockpick.progress - dt / LOCKPICK_SECONDS) * 10)) {
      sfx.lockTick();
    }
    if (game.lockpick.progress >= 1) {
      game.lockpick.door.open = true;
      game.lockpick = null;
      sfx.door();
      setMessage('Door picked. Quiet now.', 2);
    }
  } else if (game.lockpick) {
    game.lockpick.progress -= dt * 0.8;
    if (game.lockpick.progress <= 0) game.lockpick = null;
  }

  // Guards and cameras.
  let seenByGuard = false;
  let seenByCamera = false;
  let chasing = false;
  const events = {};
  for (const guard of game.guards) {
    updateGuard(guard, level, thief, game.smoke, dt, events);
    if (guard.seesPlayer) seenByGuard = true;
    if (guard.state === 'chase') chasing = true;
    if (events.spotted) {
      sfx.spotted();
      setMessage('Spotted! Break line of sight!', 2);
      events.spotted = false;
    }
    if (events.touch) {
      alarmSpike(game.alarm, ALARM_TOUCH_SPIKE);
      sfx.spotted();
      setMessage('A guard grabbed you — alarm surging!', 2);
      // Shove Wren clear of the guard so one touch is not a death spiral.
      const dx = thief.x - guard.x;
      const dy = thief.y - guard.y;
      const d = Math.hypot(dx, dy) || 1;
      thief.x += (dx / d) * 30;
      thief.y += (dy / d) * 30;
      events.touch = false;
    }
  }
  for (const cam of game.cameras) {
    updateCamera(cam, game.now);
    if (cameraSeesPlayer(level, cam, thief, game.smoke, game.now)) {
      seenByCamera = true;
      // A camera that spots Wren tips off the nearest guard.
      let best = null;
      let bestD = 500;
      for (const guard of game.guards) {
        const d = dist(guard.x, guard.y, thief.x, thief.y);
        if (d < bestD) {
          bestD = d;
          best = guard;
        }
      }
      if (best && best.state !== 'chase') {
        best.state = 'chase';
        best.lastSeen = { x: thief.x, y: thief.y };
        best.lostT = 0;
      }
    }
  }

  updateAlarm(game.alarm, seenByGuard, seenByCamera, chasing, dt);
  if (game.alarm.busted) {
    game.screen = 'busted';
    sfx.busted();
    announce('Busted. The alarm hit 100.');
    return;
  }

  // Loot and gems.
  const loot = level.loot;
  if (!loot.taken && dist(thief.x, thief.y, loot.col * TILE + TILE / 2, PLAY_TOP + loot.row * TILE + TILE / 2) < 28) {
    loot.taken = true;
    game.score += level.lootValue;
    alarmSpike(game.alarm, ALARM_LOOT_SPIKE);
    sfx.loot();
    setMessage('The ' + level.lootName + ' is yours! Get to the EXIT!', 3.5);
    announce('Loot secured: ' + level.lootName);
  }
  for (const gem of level.gems) {
    if (gem.taken) continue;
    if (dist(thief.x, thief.y, gem.col * TILE + TILE / 2, PLAY_TOP + gem.row * TILE + TILE / 2) < 24) {
      gem.taken = true;
      game.score += GEM_VALUE;
      game.gemsGot += 1;
      sfx.gem();
    }
  }

  // Exit, once the room's loot is in hand.
  const exit = level.exit;
  if (loot.taken && dist(thief.x, thief.y, exit.col * TILE + TILE / 2, PLAY_TOP + exit.row * TILE + TILE / 2) < 30) {
    if (game.levelIndex + 1 < LEVEL_COUNT) {
      game.screen = 'clear';
      sfx.clear();
      announce('Room clear.');
    } else {
      game.screen = 'win';
      sfx.win();
      announce('You win. The Marigold is yours.');
    }
    return;
  }

  // Tool throws: click throws the selected tool; Q and F throw directly.
  const button = input.takeClick();
  if (button === 0) throwTool(game.tools.selected);
  if (game.messageT > 0) {
    game.messageT -= dt;
    if (game.messageT <= 0) game.message = '';
  }
}

function handlePressed(pressed) {
  if (pressed.has('Enter')) {
    sfx.unlockAudio();
    if (game.screen === 'title') {
      game.levelIndex = 0;
      startRoom();
    } else if (game.screen === 'brief') {
      game.screen = 'play';
      announce('Playing. ' + game.level.name);
    } else if (game.screen === 'clear') {
      game.levelIndex += 1;
      startRoom();
    } else if (game.screen === 'win') {
      game.levelIndex = 0;
      game.score = 0;
      game.gemsGot = 0;
      game.time = 0;
      startRoom();
    }
    return;
  }
  if (pressed.has('KeyR') && game.screen === 'busted') {
    startLevel(game.levelIndex);
    game.screen = 'play';
    announce('Retrying the room.');
    return;
  }
  if (game.screen !== 'play') return;
  if (pressed.has('Digit1')) game.tools.selected = 'smoke';
  if (pressed.has('Digit2')) game.tools.selected = 'emp';
  if (pressed.has('KeyQ')) throwTool('smoke');
  if (pressed.has('KeyF')) throwTool('emp');
  if (pressed.has('Escape')) {
    game.screen = 'title';
    announce('The Marigold Job. Press Enter to case the joint.');
  }
}

function step() {
  const pressed = input.takePressed();
  handlePressed(pressed);
  if (game.screen === 'play' && !game.frozen) updatePlay(STEP);
  // Cameras keep sweeping on every screen so the title backdrop feels alive.
  if (game.screen !== 'play') {
    game.now += STEP;
    for (const cam of game.cameras) updateCamera(cam, game.now);
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  accumulator += dt;
  while (accumulator >= STEP) {
    step();
    accumulator -= STEP;
  }
  renderer.draw(game);
}

// Debug hooks for the play-test (and only for the play-test): a plain snapshot
// of the state, plus the live objects so a test can pose the thief.
window.__marigold = {
  game,
  state() {
    return {
      screen: game.screen,
      level: game.levelIndex,
      levelName: game.level ? game.level.name : null,
      alarm: Math.round(game.alarm.value * 10) / 10,
      busted: game.alarm.busted,
      score: game.score,
      gems: game.gemsGot,
      time: Math.round(game.time * 10) / 10,
      lootTaken: game.level ? game.level.loot.taken : false,
      thief: { x: Math.round(game.thief.x), y: Math.round(game.thief.y), sneaking: game.thief.sneaking },
      guards: game.guards.map((g) => ({
        x: Math.round(g.x), y: Math.round(g.y),
        facing: Math.round(g.dir * 100) / 100, state: g.state, seesPlayer: g.seesPlayer,
      })),
      cameras: game.cameras.map((c) => ({
        x: Math.round(c.x), y: Math.round(c.y),
        angle: Math.round(c.angle * 100) / 100,
        disabled: cameraDisabled(c, game.now), seesPlayer: c.seesPlayer,
      })),
      tools: { ...game.tools },
      smoke: game.smoke.length,
      doorsOpen: [...game.level.doors.values()].filter((d) => d.open).length,
    };
  },
  teleport(col, row) {
    const p = { x: col * TILE + TILE / 2, y: PLAY_TOP + row * TILE + TILE / 2 };
    game.thief.x = p.x;
    game.thief.y = p.y;
  },
  setAlarm(v) {
    game.alarm.value = v;
  },
  startLevel(i) {
    startLevel(i);
    game.screen = 'play';
  },
};

let last = performance.now();
let accumulator = 0;

startLevel(0);
if (shot) {
  stageShot(game, shot);
  // Paint twice, then signal readiness for the screenshot.
  let painted = 0;
  (function paint() {
    renderer.draw(game);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  })();
} else {
  announce('The Marigold Job. Press Enter to case the joint.');
  requestAnimationFrame(frame);
}
