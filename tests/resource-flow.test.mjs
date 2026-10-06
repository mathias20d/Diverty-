import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { peakResourceUsage } from '../assets/js/diverty-resource-usage.mjs';

const source = readFileSync(new URL('../assets/js/diverty-app-78bb30f118.js', import.meta.url), 'utf8');
const production = source.slice(source.indexOf('const normalTimeMinutes='), source.indexOf('function renderNormalCoverageStatus'));
const row = (id, hora, estado = 'Confirmado') => ({ id, hora, estado, resourceRequirements: { animadores: 1, payasos: 0, durationMinutes: 60 } });
function fixture(rows) {
  const context = vm.createContext({
    peakResourceUsage, db: {}, CRM_APP_ID: 'test',
    getCartResourceRequirements: () => ({ animadores: 1, payasos: 0, durationMinutes: 120 }),
    getNormalResourceCapacity: async () => ({ animadores: 2, payasos: 1 }),
    getDocs: async () => ({ docs: rows.map(value => ({ id: value.id, data: () => value })) }),
    collection() {}, query() {}, where() {},
    isBlockingEvent: value => !/cancelad|rechaz|cot/i.test(value.estado || '')
  });
  vm.runInContext(production + '\nthis.check = checkNormalResourceAvailability;', context);
  return context;
}
test('website permits adjacent events and ignores cancelled rows and internal counters', async () => {
  const f = fixture([row('a', '10:00'), row('b', '11:00'), row('c', '10:00', 'Cancelado'), row('slot_legacy', '10:00')]);
  const result = await f.check('2026-11-10', '10:00');
  assert.equal(result.feasible, true);
  assert.equal(result.used.animadores, 1);
});
test('website rejects real overlap of staff with existing events', async () => {
  const result = await fixture([row('a', '10:00'), row('b', '10:30')]).check('2026-11-10', '10:00');
  assert.equal(result.feasible, false);
  assert.equal(result.used.animadores, 2);
});
