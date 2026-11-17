import test from 'node:test';
import assert from 'node:assert/strict';
import { saveProfile, profileInput, cleanPhone } from '../netlify/lib/navidad-profile.mjs';
import { navidadHandler } from '../netlify/lib/navidad-handler.mjs';
import { LINKS, OWNERS } from '../netlify/lib/navidad-links.mjs';

const base = 'artifacts/navidad_ownerA/public/data', scope = { uid: 'ownerA', base, legacy: false };
function fakeDb() {
  const rows = new Map();
  const snap = path => ({ exists: rows.has(path), data: () => rows.get(path) });
  const query = prefix => ({
    where() { return this; },
    limit() { return this; },
    get: async () => ({ docs: [...rows].filter(([p]) => p.startsWith(prefix + '/')).map(([, v]) => ({ data: () => v })) }),
    isQuery: true,
  });
  const doc = path => ({ path, get: async () => snap(path) });
  const tx = { get: async r => (r.isQuery ? r.get() : snap(r.path)), set: (r, v, o) => rows.set(r.path, o?.merge ? { ...rows.get(r.path), ...v } : v), delete: r => rows.delete(r.path) };
  return { rows, doc, collection: query, runTransaction: async work => work(tx) };
}

test('profile input is cleaned: Panama numbers get 507 and names lose markup', () => {
  assert.equal(cleanPhone('6236-5643'), '50762365643');
  assert.deepEqual(profileInput({ nombreEmpresa: '  <b>Santa</b>  Express ' }), { nombreEmpresa: 'bSanta/b Express' });
  assert.throws(() => profileInput({ telefonoEmpresa: '123' }), e => e.reason === 'PHONE_REQUIRED');
  assert.throws(() => profileInput({ capacidadSanta: 50 }), e => e.reason === 'INVALID_REQUEST');
  assert.throws(() => profileInput({}), e => e.reason === 'INVALID_REQUEST');
});

test('publishing needs WhatsApp and one service, but never an email confirmation; it creates the link', async () => {
  const db = fakeDb();
  db.rows.set(base + '/config_web/global', { nombreEmpresa: 'Santa Express', telefonoEmpresa: '', publicado: false, capacidadSanta: 2 });
  await assert.rejects(saveProfile(db, scope, { publicado: true }), e => e.reason === 'PHONE_REQUIRED');
  await assert.rejects(saveProfile(db, scope, { publicado: true, telefonoEmpresa: '60001234' }), e => e.reason === 'SERVICE_REQUIRED');
  db.rows.set(base + '/catalogo_web/santa-1', { nombre: 'Visita', esNavidad: true, activo: true });
  db.rows.set(`${LINKS}/santa-express`, { uid: 'otra' });
  const result = await saveProfile(db, scope, { publicado: true, telefonoEmpresa: '60001234' });
  assert.equal(result.publicado, true);
  assert.equal(result.slug, 'santa-express-2');
  assert.equal(db.rows.get(`${OWNERS}/ownerA`).slug, 'santa-express-2');
  const global = db.rows.get(base + '/config_web/global');
  assert.equal(global.telefonoEmpresa, '50760001234');
  assert.equal(global.capacidadSanta, 2);
  assert.equal(db.rows.get(base + '/config_web/web_sync').version, 1);
  // Pausar y cambiar el nombre no toca el enlace.
  const paused = await saveProfile(db, scope, { publicado: false, nombreEmpresa: 'Polo Norte' });
  assert.equal(paused.publicado, false);
  assert.equal(db.rows.get(`${OWNERS}/ownerA`).slug, 'santa-express-2');
});

test('only the owner of the account can change its profile', async () => {
  const db = fakeDb();
  db.rows.set(base + '/config_web/global', { nombreEmpresa: 'Santa', publicado: false });
  const api = navidadHandler(async () => ({ database: db, verifyToken: async t => ({ uid: t, firebase: { sign_in_provider: t === 'anon' ? 'anonymous' : 'password' } }) }));
  const call = (token, empresa) => api(new Request('https://x.test/api/navidad', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify({ empresa, action: 'profile', profile: { nombreEmpresa: 'Nuevo' } }) }));
  assert.equal((await call('ownerB', 'ownerA')).status, 404);
  assert.equal((await call('ownerA', 'ownerA')).status, 200);
  assert.equal(db.rows.get(base + '/config_web/global').nombreEmpresa, 'Nuevo');
});
