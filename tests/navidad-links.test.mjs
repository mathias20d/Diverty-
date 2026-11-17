import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSlug, claimSlug, linkRedirectHandler, LINKS, OWNERS } from '../netlify/lib/navidad-links.mjs';
import { ADMIN_UID } from '../firebase/functions/policy.mjs';

function fakeDb() {
  const rows = new Map();
  const ref = path => ({ path, get: async () => snap(path) });
  const snap = path => ({ exists: rows.has(path), data: () => rows.get(path) });
  return { rows, doc: ref, runTransaction: async work => work({ get: async r => snap(r.path), set: (r, v, o) => rows.set(r.path, o?.merge ? { ...rows.get(r.path), ...v } : v), delete: r => rows.delete(r.path) }) };
}

test('slugs are readable, safe and reserved words are refused', () => {
  assert.equal(normalizeSlug('  Santa Ñoño Express! '), 'santa-nono-express');
  assert.equal(normalizeSlug('ab'), null);
  assert.equal(normalizeSlug('api'), null);
  assert.equal(normalizeSlug('../../admin'), null);
  assert.equal(normalizeSlug('x'.repeat(60)).length, 40);
});

test('a name belongs to one account; changing it frees the previous one', async () => {
  const db = fakeDb();
  assert.deepEqual(await claimSlug(db, 'ownerA', 'artifacts/navidad_ownerA/public/data', 'Santa Express'), { slug: 'santa-express' });
  await assert.rejects(claimSlug(db, 'ownerB', 'artifacts/navidad_ownerB/public/data', 'santa express'), e => e.reason === 'SLUG_TAKEN');
  await claimSlug(db, 'ownerA', 'artifacts/navidad_ownerA/public/data', 'Polo Norte');
  assert.equal(db.rows.has(`${LINKS}/santa-express`), false);
  assert.equal(db.rows.get(`${OWNERS}/ownerA`).slug, 'polo-norte');
  assert.equal(db.rows.get('artifacts/navidad_ownerA/public/data/config_web/disponibilidad').enlace, 'polo-norte');
  await claimSlug(db, 'ownerB', 'artifacts/navidad_ownerB/public/data', 'santa express');
  await assert.rejects(claimSlug(db, 'ownerA', 'x', 'no'), e => e.reason === 'INVALID_SLUG');
});

test('/s/name redirects to the account page; unknown names go home', async () => {
  const db = fakeDb();
  db.rows.set(`${LINKS}/polo-norte`, { uid: 'ownerA' });
  db.rows.set(`${LINKS}/diverty`, { uid: ADMIN_UID });
  const go = async path => (await linkRedirectHandler(async () => ({ database: db }))(new Request('https://x.test' + path))).headers.get('location');
  assert.equal(await go('/s/polo-norte'), '/?empresa=ownerA');
  assert.equal(await go('/s/Polo-Norte/'), '/?empresa=ownerA');
  assert.equal(await go('/s/diverty'), '/');
  assert.equal(await go('/s/no-existe'), '/?enlace=no-encontrado');
  assert.equal(await go('/s/%2e%2e'), '/?enlace=no-encontrado');
});
