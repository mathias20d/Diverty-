// Browser storage is optional: privacy settings and embedded browsers may deny
// access even to the window property. Reservations must still remain usable.
export function readBrowserStorage(type, key) {
  try { return window[type].getItem(key); } catch (_) { return null; }
}

export function writeBrowserStorage(type, key, value) {
  try { window[type].setItem(key, value); return true; } catch (_) { return false; }
}

// A retry keeps its ID, but may refresh its form only after the previous write
// has failed. An unresolved transaction must keep its original data immutable.
export function prepareBookingAttempt(previous, data) {
  if (previous?.promise) return previous;
  const id = previous?.id || data.id;
  return { id, data: { ...data, id }, promise: null };
}

// The customer projection is readable by its owner; the private event is not.
// A locally pending write cannot establish that Firestore accepted the request.
export async function readBookingReceipt(getDoc, reference, ownerUid) {
  const snap = await getDoc(reference);
  if (!snap.exists() || snap.metadata?.hasPendingWrites) return null;
  const data = snap.data();
  if (!ownerUid || data?.ownerUid !== ownerUid) return null;
  if (typeof data.fecha !== 'string' || typeof data.hora !== 'string' || typeof data.estado !== 'string') return null;
  return data;
}

export function isNormalDayFullyBooked(rows, date, capacity) {
  if (!Number.isInteger(capacity) || capacity < 1) return false;
  const counts = new Map();
  for (const row of rows) {
    const id = String(row._availabilityId || row.id || '');
    if (id.startsWith('slot_') || String(row.fecha || '') !== date ||
        row.esNavidad === true || String(row.recursoNavidad || '').toLowerCase() === 'santa' ||
        row.deletedLocally === true || /cancelad|rechaz|cot/i.test(String(row.estado || ''))) continue;
    const time = String(row.hora || '');
    counts.set(time, (counts.get(time) || 0) + 1);
  }
  // The same half-hour options offered by the normal booking form.
  for (let minutes = 8 * 60; minutes <= 23 * 60 + 30; minutes += 30) {
    const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    if ((counts.get(time) || 0) < capacity) return false;
  }
  return true;
}
