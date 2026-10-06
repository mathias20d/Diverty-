import test from 'node:test';
import assert from 'node:assert/strict';
import { panamaDateKey, isNormalBookingDateAllowed, bookingCalendarDays } from '../assets/js/diverty-date-picker.mjs';

test('minimum date follows Panama even when UTC is already the next day', () => {
  assert.equal(panamaDateKey(new Date('2026-10-06T04:59:59Z')), '2026-10-05');
  assert.equal(panamaDateKey(new Date('2026-10-06T05:00:00Z')), '2026-10-06');
});

test('normal booking excludes past, malformed and Santa-only dates', () => {
  const minimum = '2026-10-05';
  assert.equal(isNormalBookingDateAllowed('2026-10-04', minimum), false);
  assert.equal(isNormalBookingDateAllowed('2026-10-05', minimum), true);
  assert.equal(isNormalBookingDateAllowed('2026-12-24', minimum), false);
  assert.equal(isNormalBookingDateAllowed('2026-12-25', minimum), false);
  assert.equal(isNormalBookingDateAllowed('2026-12-26', minimum), true);
  assert.equal(isNormalBookingDateAllowed('2026-02-30', minimum), false);
  assert.equal(isNormalBookingDateAllowed('05/10/2026', minimum), false);
});

test('calendar uses Monday first and the correct number of days including leap years', () => {
  const october = bookingCalendarDays(2026, 9, '2026-10-05');
  assert.equal(october.slice(0, 3).every(cell => cell === null), true);
  assert.equal(october[3].value, '2026-10-01');
  assert.equal(october.filter(Boolean).length, 31);
  assert.equal(october.find(cell => cell?.day === 4).available, false);
  assert.equal(october.find(cell => cell?.day === 5).available, true);
  assert.equal(bookingCalendarDays(2028, 1, '2028-02-01').filter(Boolean).length, 29);
});
