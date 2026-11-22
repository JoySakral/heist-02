// Drawing only: the game state in, pixels out. The canvas keeps a fixed
// 1280x720 backing store and CSS letterboxes it to the window, so the layout
// never depends on the screen size. Safe cover, danger and loot are colour
// coded at a glance: amber for Wren, yellow cones for guards, orange cones
// for cameras, a pulsing glow for the loot, green for the exit.
import {
  TILE, COLS, ROWS, HUD_H, VIEW_W, VIEW_H, PLAY_TOP,
  ALARM_MAX, tileHash, tileCenter,
} from './config.js';
import { castVisionCone } from './guards.js';
import { cameraCone, cameraDisabled } from './cameras.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;

  function resize() {
    const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
    canvas.style.width = Math.floor(VIEW_W * scale) + 'px';
    canvas.style.height = Math.floor(VIEW_H * scale) + 'px';
  }
  resize();
  window.addEventListener('resize', resize);

  function text(value, x, y, size, color, align, weight) {
    ctx.font = (weight || '') + ' ' + size + 'px ' + FONT;
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function poly(points, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.fill();
  }

  function drawFloor(level) {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const x = col * TILE;
        const y = PLAY_TOP + row * TILE;
        const even = (col + row) % 2 === 0;
        ctx.fillStyle = even ? '#23272f' : '#262b34';
        ctx.fillRect(x, y, TILE, TILE);
        // Deterministic speckles so the marble reads as stone, not flat grey.
        const h = tileHash(col, row);
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(x + 4 + h * 18, y + 5 + h * 16, 3, 3);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(x + 8 + h * 12, y + 18 + h * 8, 2, 2);
      }
    }
  }

  function drawWalls(level) {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (level.grid[row][col] !== '#') continue;
        const x = col * TILE;
        const y = PLAY_TOP + row * TILE;
        ctx.fillStyle = '#454b59';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = '#5d6474';
        ctx.fillRect(x, y, TILE, 4);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(x, y + TILE - 3, TILE, 3);
      }
    }
  }

  function drawDoors(game) {
    for (const door of game.level.doors.values()) {
      const c = tileCenter(door.col, door.row);
      if (door.open) {
        ctx.fillStyle = '#3a2f1d';
        ctx.fillRect(c.x - 14, c.y - 14, 28, 28);
        ctx.fillStyle = '#6b5636';
        ctx.fillRect(c.x - 14, c.y - 14, 28, 3);
        continue;
      }
      ctx.fillStyle = '#7a5a2e';
      ctx.fillRect(c.x - 15, c.y - 15, 30, 30);
      ctx.fillStyle = '#9c743a';
      ctx.fillRect(c.x - 15, c.y - 15, 30, 5);
      ctx.fillStyle = '#2c2113';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 5, 0, Math.PI * 2);
      ctx.fill();
      // Lockpick progress ring while Wren works the lock.
      if (game.lockpick && game.lockpick.door === door) {
        ctx.strokeStyle = '#ffd34d';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(c.x, c.y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * game.lockpick.progress);
        ctx.stroke();
        text('E', c.x, c.y - 26, 13, '#ffd34d', 'center', 'bold');
      } else if (game.nearDoor === door) {
        text('Hold E to pick', c.x, c.y - 26, 12, '#ffd34d', 'center', 'bold');
      }
    }
  }

  function drawLoot(game, now) {
    const level = game.level;
    const loot = level.loot;
    const c = tileCenter(loot.col, loot.row);
    // Pedestal.
    ctx.fillStyle = '#33363f';
    ctx.fillRect(c.x - 13, c.y - 10, 26, 20);
    ctx.fillStyle = '#454954';
    ctx.fillRect(c.x - 13, c.y - 10, 26, 4);
    if (!loot.taken) {
      // Pulsing glow so the target is obvious from across the room.
      const pulse = 0.5 + 0.5 * Math.sin(now * 3.2);
      const glow = ctx.createRadialGradient(c.x, c.y - 6, 2, c.x, c.y - 6, 34 + pulse * 14);
      glow.addColorStop(0, level.lootColor + 'cc');
      glow.addColorStop(1, level.lootColor + '00');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(c.x, c.y - 6, 48, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = level.lootColor;
      ctx.beginPath();
      ctx.arc(c.x, c.y - 6, 8 + pulse * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(c.x - 2, c.y - 9, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // The loot's name, drawn after the walls so a vault never clips it.
  function drawLootLabel(game) {
    const level = game.level;
    const loot = level.loot;
    if (loot.taken) return;
    const c = tileCenter(loot.col, loot.row);
    ctx.font = 'bold 12px ' + FONT;
    ctx.textAlign = 'center';
    const w = ctx.measureText(level.lootName).width + 12;
    ctx.fillStyle = 'rgba(8,10,14,0.85)';
    ctx.fillRect(c.x - w / 2, c.y - 38, w, 17);
    ctx.fillStyle = level.lootColor;
    ctx.fillText(level.lootName, c.x, c.y - 25);
  }

  function drawGems(game) {
    for (const gem of game.level.gems) {
      if (gem.taken) continue;
      const c = tileCenter(gem.col, gem.row);
      ctx.fillStyle = '#5fe3e0';
      ctx.beginPath();
      ctx.moveTo(c.x, c.y - 8);
      ctx.lineTo(c.x + 6, c.y);
      ctx.lineTo(c.x, c.y + 8);
      ctx.lineTo(c.x - 6, c.y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(c.x - 1, c.y - 2, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawExit(game) {
    const level = game.level;
    const c = tileCenter(level.exit.col, level.exit.row);
    const armed = level.loot.taken;
    ctx.fillStyle = armed ? '#1d7a3f' : '#274a33';
    ctx.fillRect(c.x - 15, c.y - 15, 30, 30);
    ctx.strokeStyle = armed ? '#4be07f' : '#3d6b4d';
    ctx.lineWidth = 2;
    ctx.strokeRect(c.x - 15, c.y - 15, 30, 30);
    text('EXIT', c.x, c.y + 4, 9, armed ? '#b8ffcf' : '#7fae8d', 'center', 'bold');
    if (armed) {
      const pulse = 0.5 + 0.5 * Math.sin(game.now * 4);
      ctx.strokeStyle = 'rgba(75,224,127,' + (0.4 + pulse * 0.4) + ')';
      ctx.lineWidth = 3;
      ctx.strokeRect(c.x - 19, c.y - 19, 38, 38);
    }
  }

  function drawCones(game) {
    const level = game.level;
    const clouds = game.smoke;
    for (const guard of game.guards) {
      const cone = castVisionCone(level, guard.x, guard.y, guard.dir, 1.33, 255, clouds);
      poly(cone, guard.state === 'chase' ? 'rgba(255,70,60,0.30)' : 'rgba(255,205,80,0.16)');
    }
    for (const cam of game.cameras) {
      const disabled = cameraDisabled(cam, game.now);
      const cone = cameraCone(level, cam, clouds);
      if (disabled) {
        poly(cone, 'rgba(120,120,120,0.07)');
      } else {
        poly(cone, cam.seesPlayer ? 'rgba(255,70,60,0.30)' : 'rgba(255,150,60,0.14)');
      }
    }
  }

  function drawCameras(game) {
    for (const cam of game.cameras) {
      const disabled = cameraDisabled(cam, game.now);
      ctx.fillStyle = disabled ? '#555' : '#c8ccd4';
      ctx.fillRect(cam.x - 8, cam.y - 6, 16, 12);
      ctx.fillStyle = disabled ? '#333' : (cam.seesPlayer ? '#ff3b30' : '#ff9f2e');
      ctx.beginPath();
      ctx.arc(cam.x + Math.cos(cam.angle) * 8, cam.y + Math.sin(cam.angle) * 8, 3.5, 0, Math.PI * 2);
      ctx.fill();
      if (disabled) text('EMP', cam.x, cam.y - 12, 10, '#9aa0aa', 'center', 'bold');
    }
  }

  function drawGuards(game) {
    for (const guard of game.guards) {
      // Shadow.
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(guard.x, guard.y + 10, 13, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Body: navy uniform, visor facing the patrol direction.
      ctx.fillStyle = '#4a6fa5';
      ctx.beginPath();
      ctx.arc(guard.x, guard.y, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2c4a72';
      ctx.beginPath();
      ctx.arc(guard.x + Math.cos(guard.dir) * 5, guard.y + Math.sin(guard.dir) * 5, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#dfe6f2';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(guard.x + Math.cos(guard.dir) * 8, guard.y + Math.sin(guard.dir) * 8);
      ctx.lineTo(guard.x + Math.cos(guard.dir) * 16, guard.y + Math.sin(guard.dir) * 16);
      ctx.stroke();
      if (guard.state === 'chase') text('!', guard.x, guard.y - 20, 18, '#ff5b4d', 'center', 'bold');
      else if (guard.state === 'suspicious' || guard.state === 'search') text('?', guard.x, guard.y - 20, 16, '#ffd34d', 'center', 'bold');
    }
  }

  function drawThief(game) {
    const t = game.thief;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(t.x, t.y + 9, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Hooded amber figure: cloak, hood, and a facing tick.
    ctx.globalAlpha = t.sneaking ? 0.85 : 1;
    ctx.fillStyle = '#e8912d';
    ctx.beginPath();
    ctx.arc(t.x, t.y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b96f16';
    ctx.beginPath();
    ctx.moveTo(t.x + Math.cos(t.dir - 0.7) * 11, t.y + Math.sin(t.dir - 0.7) * 11);
    ctx.lineTo(t.x + Math.cos(t.dir) * 17, t.y + Math.sin(t.dir) * 17);
    ctx.lineTo(t.x + Math.cos(t.dir + 0.7) * 11, t.y + Math.sin(t.dir + 0.7) * 11);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f7c873';
    ctx.beginPath();
    ctx.arc(t.x + Math.cos(t.dir) * 4, t.y + Math.sin(t.dir) * 4, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (t.sneaking) {
      ctx.strokeStyle = 'rgba(232,145,45,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 17, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawSmoke(game) {
    for (const cloud of game.smoke) {
      const age = 1 - (cloud.until - game.now) / 7;
      ctx.fillStyle = 'rgba(205,205,205,' + (0.55 - age * 0.2) + ')';
      ctx.beginPath();
      ctx.arc(cloud.x - 18, cloud.y - 8, cloud.r * 0.62, 0, Math.PI * 2);
      ctx.arc(cloud.x + 16, cloud.y + 10, cloud.r * 0.58, 0, Math.PI * 2);
      ctx.arc(cloud.x, cloud.y, cloud.r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const burst of game.emps) {
      const age = (game.now - burst.t) / 0.6;
      if (age > 1) continue;
      ctx.strokeStyle = 'rgba(120,200,255,' + (1 - age) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(burst.x, burst.y, 12 + age * 130, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawAim(game) {
    const m = game.input.mouse;
    if (m.y < PLAY_TOP) return;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(m.x - 13, m.y);
    ctx.lineTo(m.x - 5, m.y);
    ctx.moveTo(m.x + 5, m.y);
    ctx.lineTo(m.x + 13, m.y);
    ctx.moveTo(m.x, m.y - 13);
    ctx.lineTo(m.x, m.y - 5);
    ctx.moveTo(m.x, m.y + 5);
    ctx.lineTo(m.x, m.y + 13);
    ctx.stroke();
  }

  function drawHud(game) {
    ctx.fillStyle = '#101318';
    ctx.fillRect(0, 0, VIEW_W, HUD_H);
    ctx.fillStyle = '#232830';
    ctx.fillRect(0, HUD_H - 2, VIEW_W, 2);

    text('THE MARIGOLD JOB', 20, 30, 22, '#f2c94c', 'left', 'bold');
    text(game.level.name, 20, 56, 14, '#b9bec9', 'left');

    // Alarm meter.
    text('ALARM', 400, 26, 12, '#b9bec9', 'left', 'bold');
    const barX = 400;
    const barY = 34;
    const barW = 300;
    ctx.fillStyle = '#262b33';
    ctx.fillRect(barX, barY, barW, 16);
    const frac = game.alarm.value / ALARM_MAX;
    const alarmColor = frac < 0.4 ? '#37b06a' : frac < 0.7 ? '#e0a83c' : '#e5534b';
    ctx.fillStyle = alarmColor;
    ctx.fillRect(barX, barY, Math.round(barW * frac), 16);
    ctx.strokeStyle = game.alarm.value > 70 && Math.floor(game.now * 4) % 2 === 0 ? '#ff5b4d' : '#4a505c';
    ctx.lineWidth = 2;
    ctx.strokeRect(barX, barY, barW, 16);
    text(Math.round(game.alarm.value) + '', barX + barW + 10, 48, 14, alarmColor, 'left', 'bold');

    // Loot, gems, timer.
    text('LOOT  $' + game.score.toLocaleString('en-US'), 780, 30, 16, '#f2f0e6', 'left', 'bold');
    text('◆ ' + game.gemsGot + ' gems', 780, 56, 14, '#5fe3e0', 'left');
    const mins = Math.floor(game.time / 60);
    const secs = Math.floor(game.time % 60);
    text('TIME ' + mins + ':' + String(secs).padStart(2, '0'), 980, 30, 16, '#f2f0e6', 'left', 'bold');
    text(game.level.loot.taken ? 'Loot secured — reach the EXIT!' : 'Steal the ' + game.level.lootName, 980, 56, 13, game.level.loot.taken ? '#4be07f' : '#b9bec9', 'left');

    // Tools.
    const smokeSel = game.tools.selected === 'smoke';
    const empSel = game.tools.selected === 'emp';
    text('◉ SMOKE ×' + game.tools.smoke + '  [1/Q]', 20, 76, 13, smokeSel ? '#ffffff' : '#8b93a3', 'left', smokeSel ? 'bold' : '');
    text('⚡ EMP ×' + game.tools.emp + '  [2/F]', 190, 76, 13, empSel ? '#ffffff' : '#8b93a3', 'left', empSel ? 'bold' : '');
    text('WASD move · Shift sneak · E pick lock · Click throws the selected tool', 560, 76, 12, '#6d7480', 'left');
  }

  function drawRoom(game) {
    drawFloor(game.level);
    drawExit(game);
    drawLoot(game, game.now);
    drawGems(game);
    drawCones(game);
    drawWalls(game.level);
    drawDoors(game);
    drawLootLabel(game);
    drawCameras(game);
    drawGuards(game);
    drawThief(game);
    drawSmoke(game);
    if (game.screen === 'play') drawAim(game);
    if (game.message) {
      text(game.message, VIEW_W / 2, PLAY_TOP + 30, 18, '#ffd34d', 'center', 'bold');
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    ctx.fillStyle = 'rgba(8,10,14,0.72)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const w = 680;
    const h = 150 + lines.length * 32;
    const x = (VIEW_W - w) / 2;
    const y = (VIEW_H - h) / 2;
    ctx.fillStyle = '#181c22';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = accent || '#f2c94c';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    text(title, VIEW_W / 2, y + 64, 40, accent || '#f2c94c', 'center', 'bold');
    lines.forEach((line, i) => {
      text(line, VIEW_W / 2, y + 108 + i * 32, 17, '#d7dae0', 'center');
    });
    text(prompt, VIEW_W / 2, y + h - 28, 18, '#ffd34d', 'center', 'bold');
  }

  function draw(game) {
    ctx.fillStyle = '#0b0d10';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (game.screen === 'title') {
      drawFloor(game.level);
      drawWalls(game.level);
      drawPanel(
        'THE MARIGOLD JOB',
        [
          'Wren is robbing the Marigold Museum — three rooms, three treasures.',
          'Read the patrols. Time the cones. Smoke the cameras. Get out rich.',
          '',
          'WASD / arrows — move      Shift — sneak (slower, quieter)',
          'Mouse — aim tools      Click — throw smoke / EMP      1 / 2 — pick tool',
          'Hold E — pick a lock      R — retry when busted',
        ],
        'Press Enter to case the joint',
        '#f2c94c',
      );
      return;
    }
    drawRoom(game);
    drawHud(game);
    if (game.screen === 'brief') {
      drawPanel(
        game.level.name,
        [game.level.sub, '', 'Loot: ' + game.level.lootName + ' — $' + game.level.lootValue.toLocaleString('en-US'),
          'Guards: ' + game.guards.length + '   Cameras: ' + game.cameras.length + '   Smoke ×' + game.tools.smoke + '   EMP ×' + game.tools.emp],
        'Press Enter to begin the room',
        '#f2c94c',
      );
    } else if (game.screen === 'clear') {
      const last = game.level;
      drawPanel(
        'ROOM CLEAR',
        ['The ' + last.lootName + ' is yours — $' + last.lootValue.toLocaleString('en-US') + '.',
          'Gems this run: ' + game.gemsGot + '   Time: ' + Math.floor(game.time / 60) + ':' + String(Math.floor(game.time % 60)).padStart(2, '0'),
          game.levelIndex + 1 < 3 ? 'One more room waits behind the next door.' : 'That was the last room.'],
        game.levelIndex + 1 < 3 ? 'Press Enter for the next room' : 'Press Enter to see the take',
        '#4be07f',
      );
    } else if (game.screen === 'busted') {
      drawPanel(
        'BUSTED!',
        ['The alarm hit 100 and the museum locked down.',
          'Wren slipped away — but the ' + game.level.lootName + ' stays behind.',
          'Rooms cleared: ' + game.levelIndex + ' of 3'],
        'Press R to retry this room',
        '#ff5b4d',
      );
    } else if (game.screen === 'win') {
      drawPanel(
        'THE MARIGOLD IS YOURS',
        ['All three treasures, one clean getaway.',
          'Total take: $' + game.score.toLocaleString('en-US') + '   Gems: ' + game.gemsGot,
          'Time: ' + Math.floor(game.time / 60) + ':' + String(Math.floor(game.time % 60)).padStart(2, '0') + '   Rooms cleared: 3 of 3'],
        'Press Enter to run it again',
        '#f2c94c',
      );
    }
  }

  return { draw };
}
