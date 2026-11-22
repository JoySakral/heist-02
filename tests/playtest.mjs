// Play-test + screenshots for The Marigold Job (heist-02). Run from the repo root
// with the game served at http://127.0.0.1:8080 (node serve.ts):
//   node tests/playtest.mjs
// Takes 3 screenshots into screenshots/ and checks every mechanic item by item.
import { createRequire } from 'node:module';

const require = createRequire('/home/hatch/workspace/makefun/playwright-tools/package.json');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8080';
const OUT = '/home/hatch/workspace/makefun/heist-02/screenshots/';
const results = [];
const errors = [];

function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? ' — ' + detail : ''));
}

const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/ms-playwright/chromium-1148/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});
const state = () => page.evaluate(() => window.__marigold.state());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Screenshots (real renders of the game, shot mode) ---
for (const [shot, file] of [['cover', '01-cover.jpg'], ['vault', '02-vault.jpg'], ['getaway', '03-getaway.jpg']]) {
  await page.goto(BASE + '/?shot=' + shot, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 10000 });
  await sleep(300);
  await page.screenshot({ path: OUT + file, type: 'jpeg', quality: 82 });
  const s = await state();
  check('shot ' + shot + ' renders in play', s.screen === 'play', JSON.stringify({ screen: s.screen, alarm: s.alarm }));
}

// --- Title -> brief -> play, movement ---
await page.goto(BASE + '/', { waitUntil: 'load' });
await sleep(500);
let s = await state();
check('title screen shows', s.screen === 'title', s.screen);
await page.keyboard.press('Enter');
await sleep(300);
s = await state();
check('Enter opens the brief', s.screen === 'brief', s.screen);
await page.keyboard.press('Enter');
await sleep(300);
s = await state();
check('Enter starts play', s.screen === 'play', s.screen);
const x0 = s.thief.x;
await page.keyboard.down('KeyD');
await sleep(1000);
await page.keyboard.up('KeyD');
s = await state();
check('thief walks east with D', s.thief.x > x0 + 100, `x ${x0} -> ${s.thief.x}`);
// (Thief starts against the north wall, so test from open floor.)
await page.evaluate(() => window.__marigold.teleport(10, 10));
s = await state();
const y1 = s.thief.y;
await page.keyboard.down('KeyW');
await sleep(700);
await page.keyboard.up('KeyW');
s = await state();
check('thief walks north with W (open floor)', s.thief.y < y1 - 50, `y ${y1} -> ${s.thief.y}`);

// --- Sneak is slower ---
await page.evaluate(() => window.__marigold.teleport(2, 13));
await page.keyboard.down('ShiftLeft');
await page.keyboard.down('KeyD');
await sleep(1000);
await page.keyboard.up('KeyD');
await page.keyboard.up('ShiftLeft');
s = await state();
check('sneaking is slower than walking', s.thief.x > 100 && s.thief.x < 210, `x -> ${s.thief.x}`);

// --- Guard vision: hold a guard facing east, put Wren in its cone ---
await page.evaluate(() => {
  const g = window.__marigold.game;
  const guard = g.guards[0];
  guard.state = 'hold';
  guard.dir = 0;
  g.thief.x = guard.x + 110;
  g.thief.y = guard.y;
  g.thief.sneaking = false;
  window.__marigold.setAlarm(0);
});
await sleep(1200);
s = await state();
const alarmSeen = s.alarm;
check('guard sees thief in cone', s.guards[0].seesPlayer, JSON.stringify(s.guards[0]));
check('alarm rises while seen', alarmSeen > 10, `alarm ${alarmSeen}`);
// Release the guard from its hold: with Wren still in the cone it must chase.
await page.evaluate(() => {
  window.__marigold.game.guards[0].state = 'patrol';
});
await sleep(600);
s = await state();
check('guard chases on sight', s.guards[0].state === 'chase', `state ${s.guards[0].state}`);

// --- Smoke blocks the guard's vision ---
await page.evaluate(() => {
  const g = window.__marigold.game;
  g.guards[0].state = 'hold';
  g.guards[0].dir = 0;
});
await page.keyboard.press('Digit1');
s = await state();
await page.mouse.click((s.guards[0].x + s.thief.x) / 2, (s.guards[0].y + s.thief.y) / 2);
await sleep(500);
s = await state();
check('smoke bomb thrown', s.smoke === 1 && s.tools.smoke === 2, `smoke ${s.smoke}, left ${s.tools.smoke}`);
check('smoke blocks guard vision', !s.guards[0].seesPlayer, 'still seen through smoke');
const alarmAtSmoke = s.alarm;
await sleep(2000);
s = await state();
check('alarm decays when unseen', s.alarm < alarmAtSmoke, `${alarmAtSmoke} -> ${s.alarm}`);

// --- Camera vision: stand under the sweeping camera until it catches Wren ---
await page.evaluate(() => {
  window.__marigold.teleport(20, 4);
  window.__marigold.setAlarm(0);
});
let cameraSaw = false;
for (let i = 0; i < 16; i++) {
  await sleep(500);
  s = await state();
  if (s.cameras[0].seesPlayer) {
    cameraSaw = true;
    break;
  }
}
check('camera sees thief in its cone', cameraSaw, JSON.stringify(s.cameras[0]));
const alarmBeforeCam = s.alarm;
await sleep(800);
s = await state();
check('camera raises the alarm', s.alarm > alarmBeforeCam, `${alarmBeforeCam} -> ${s.alarm}`);

// --- EMP disables the camera ---
await page.evaluate(() => window.__marigold.setAlarm(0));
await page.keyboard.press('Digit2');
s = await state();
await page.mouse.click(s.cameras[0].x, s.cameras[0].y);
await sleep(400);
s = await state();
check('EMP disables the camera', s.cameras[0].disabled && s.tools.emp === 1, JSON.stringify(s.cameras[0]));

// --- Lockpick: hold E beside the west door ---
await page.evaluate(() => {
  const g = window.__marigold.game;
  for (const guard of g.guards) {
    guard.state = 'hold';
    guard.dir = -Math.PI / 2;
  }
  window.__marigold.teleport(7, 5);
  window.__marigold.setAlarm(0);
});
await page.keyboard.down('KeyE');
await sleep(2200);
await page.keyboard.up('KeyE');
s = await state();
check('lockpick opens the door', s.doorsOpen >= 1, `doors open ${s.doorsOpen}`);

// --- Loot pickup, then the exit clears room 1 ---
await page.evaluate(() => window.__marigold.teleport(32, 7));
await sleep(400);
s = await state();
check('loot pickup (Jade Scarab)', s.lootTaken && s.score >= 12000, `score ${s.score}`);
await page.evaluate(() => window.__marigold.teleport(21, 18));
await sleep(400);
s = await state();
check('exit clears room 1', s.screen === 'clear', s.screen);

// --- Room 2: brief, play, loot, exit ---
await page.keyboard.press('Enter');
await sleep(300);
s = await state();
check('brief for room 2', s.screen === 'brief' && s.level === 1, `${s.screen} level ${s.level}`);
await page.keyboard.press('Enter');
await sleep(300);
await page.evaluate(() => window.__marigold.teleport(33, 8));
await sleep(400);
s = await state();
check('loot pickup (Sapphire Peacock)', s.lootTaken && s.score >= 37000, `score ${s.score}`);
await page.evaluate(() => window.__marigold.teleport(19, 18));
await sleep(400);
s = await state();
check('exit clears room 2', s.screen === 'clear', s.screen);

// --- Room 3: brief, play, loot, exit wins the game ---
await page.keyboard.press('Enter');
await sleep(300);
await page.keyboard.press('Enter');
await sleep(300);
await page.evaluate(() => window.__marigold.teleport(19, 10));
await sleep(400);
s = await state();
check('loot pickup (Golden Marigold)', s.lootTaken && s.score >= 87000, `score ${s.score}`);
await page.evaluate(() => window.__marigold.teleport(21, 18));
await sleep(400);
s = await state();
check('exit wins the game', s.screen === 'win', s.screen);

// --- Busted at alarm 100, then R retries ---
await page.evaluate(() => {
  const g = window.__marigold.game;
  window.__marigold.startLevel(0);
  window.__marigold.setAlarm(95);
  const guard = g.guards[0];
  guard.state = 'hold';
  guard.dir = 0;
  g.thief.x = guard.x + 110;
  g.thief.y = guard.y;
});
await sleep(1500);
s = await state();
check('alarm max busts the mission', s.screen === 'busted', `${s.screen} alarm ${s.alarm}`);
await page.keyboard.press('KeyR');
await sleep(300);
s = await state();
check('R retries the room', s.screen === 'play' && s.alarm === 0, `${s.screen} alarm ${s.alarm}`);

await browser.close();
console.log('---');
console.log('console/page errors: ' + errors.length);
for (const e of errors) console.log('  ' + e);
const failed = results.filter((r) => !r.ok);
console.log(`checks: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length || errors.length ? 1 : 0);
