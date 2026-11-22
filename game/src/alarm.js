// The alarm meter: 0 is quiet, 100 is busted. It climbs while any guard or
// camera has eyes on Wren (faster while a guard chases), spikes when loot is
// grabbed or a guard lays hands on her, and drains while she stays unseen.
import { ALARM_MAX, ALARM_RISE_GUARD, ALARM_RISE_CAMERA, ALARM_RISE_CHASE, ALARM_DECAY, clamp } from './config.js';

export function makeAlarm() {
  return { value: 0, busted: false };
}

export function updateAlarm(alarm, seenByGuard, seenByCamera, chasing, dt) {
  if (alarm.busted) return;
  let rate = 0;
  if (seenByGuard) rate += ALARM_RISE_GUARD;
  if (seenByCamera) rate += ALARM_RISE_CAMERA;
  if (chasing) rate += ALARM_RISE_CHASE;
  if (rate > 0) {
    alarm.value += rate * dt;
  } else {
    alarm.value -= ALARM_DECAY * dt;
  }
  alarm.value = clamp(alarm.value, 0, ALARM_MAX);
  if (alarm.value >= ALARM_MAX) alarm.busted = true;
}

export function alarmSpike(alarm, amount) {
  if (alarm.busted) return;
  alarm.value = clamp(alarm.value + amount, 0, ALARM_MAX);
  if (alarm.value >= ALARM_MAX) alarm.busted = true;
}
