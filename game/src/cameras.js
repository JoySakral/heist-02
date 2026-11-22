// Security cameras: ceiling mounts that sweep back and forth, with their own
// vision cones. An EMP blast switches one off for a while; a camera that
// spots Wren raises the alarm and tips off the nearest guard.
import {
  CAMERA_SIGHT_RANGE,
  CAMERA_SIGHT_FOV,
  EMP_DURATION,
  tileCenter,
} from './config.js';
import { castVisionCone, eyeSeesPlayer } from './guards.js';

export function makeCamera(def) {
  const p = tileCenter(def.col, def.row);
  return {
    x: p.x,
    y: p.y,
    baseAngle: def.angle,
    sweep: def.sweep,
    speed: def.speed,
    phase: Math.random() * Math.PI * 2,
    angle: def.angle,
    disabledUntil: 0,
    seesPlayer: false,
  };
}

export function updateCamera(cam, now) {
  cam.angle = cam.baseAngle + Math.sin(now * cam.speed + cam.phase) * cam.sweep;
}

export function cameraDisabled(cam, now) {
  return now < cam.disabledUntil;
}

export function disableCamera(cam, now) {
  cam.disabledUntil = now + EMP_DURATION;
}

export function cameraSeesPlayer(level, cam, player, clouds, now) {
  if (cameraDisabled(cam, now)) {
    cam.seesPlayer = false;
    return false;
  }
  const seen = eyeSeesPlayer(
    level, cam.x, cam.y, cam.angle,
    CAMERA_SIGHT_FOV, CAMERA_SIGHT_RANGE, player, clouds,
  );
  cam.seesPlayer = seen;
  return seen;
}

export function cameraCone(level, cam, clouds) {
  return castVisionCone(
    level, cam.x, cam.y, cam.angle,
    CAMERA_SIGHT_FOV, CAMERA_SIGHT_RANGE, clouds,
  );
}
