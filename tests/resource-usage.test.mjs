import test from 'node:test';
import assert from 'node:assert/strict';
import { peakResourceUsage } from '../assets/js/diverty-resource-usage.mjs';

const staff = (start, duration, animadores = 1, payasos = 0) => ({ start, duration, animadores, payasos });
test('adjacent events use one animator throughout a longer requested interval', () => {
  assert.deepEqual(peakResourceUsage(600, 120, [staff(600, 60), staff(660, 60)]), { animadores: 1, payasos: 0 });
});
test('overlapping events use their maximum simultaneous staff, clipped to the request', () => {
  assert.deepEqual(peakResourceUsage(600, 120, [staff(590, 60), staff(630, 60, 2, 1), staff(720, 60, 9)]), { animadores: 3, payasos: 1 });
});
test('each staff type retains its own peak and cancelled windows can be excluded by callers', () => {
  assert.deepEqual(peakResourceUsage(600, 120, [staff(600, 60, 2), staff(660, 60, 0, 1)]), { animadores: 2, payasos: 1 });
});
test('invalid times and negative resource counts do not produce unavailable or infinite capacity', () => {
  assert.deepEqual(peakResourceUsage(600, 120, [staff(null, 60, 9), staff(600, 60, -1, Infinity)]), { animadores: 0, payasos: 0 });
  assert.deepEqual(peakResourceUsage(null, 120, [staff(600, 60)]), { animadores: 0, payasos: 0 });
});
