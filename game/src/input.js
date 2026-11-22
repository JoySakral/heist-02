// Keyboard and mouse input for The Marigold Job. Held keys are a live set the
// loop reads every frame; one-shot presses (Enter, R, tool keys) are queued and
// taken once, so a press between two frames is never lost or counted twice.
// The mouse position is converted into the game's 1280x720 logical space.
import { VIEW_W, VIEW_H } from './config.js';

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  const mouse = { x: VIEW_W / 2, y: VIEW_H / 2, clicked: false, button: 0 };
  const BLOCKED = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

  window.addEventListener('keydown', (event) => {
    if (BLOCKED.has(event.code)) event.preventDefault();
    keys.add(event.code);
    if (!event.repeat) pressed.add(event.code);
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => {
    keys.clear();
  });

  function toGame(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * VIEW_W;
    mouse.y = ((event.clientY - rect.top) / rect.height) * VIEW_H;
  }
  canvas.addEventListener('mousemove', toGame);
  canvas.addEventListener('mousedown', (event) => {
    toGame(event);
    mouse.clicked = true;
    mouse.button = event.button;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    keys,
    mouse,
    isDown(code) {
      return keys.has(code);
    },
    // True once for each fresh press of the key.
    wasPressed(code) {
      return pressed.has(code);
    },
    // WASD / arrows steering, as a unit-ish vector (may be diagonal).
    moveVector() {
      let x = 0;
      let y = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
      if (x !== 0 && y !== 0) {
        x *= Math.SQRT1_2;
        y *= Math.SQRT1_2;
      }
      return { x, y };
    },
    // Take the queued one-shot presses; the loop calls this once per frame.
    takePressed() {
      const taken = new Set(pressed);
      pressed.clear();
      return taken;
    },
    takeClick() {
      const c = mouse.clicked;
      mouse.clicked = false;
      return c ? mouse.button : -1;
    },
  };
}
