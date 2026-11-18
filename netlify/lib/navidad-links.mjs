// Enlaces cortos de Operación Navidad: entregasnavidad.netlify.app/s/mi-empresa
// El servidor (Admin SDK) es la única autoridad: garantiza que cada nombre
// pertenezca a una sola cuenta. Los clientes no leen ni escriben estas colecciones.
import {ADMIN_UID} from '../../firebase/functions/policy.mjs';
const RESERVED = new Set(['api','admin','s','www','app','navidad','santa','soporte','ayuda','login','diverty-admin']);
export const LINKS = 'navidad_enlaces', OWNERS = 'navidad_enlaces_cuentas';

export function normalizeSlug(value) {
  const slug = String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
  if (slug.length < 3 || RESERVED.has(slug)) return null;
  return slug;
}

// Registra o cambia el enlace de una cuenta. Libera el enlace anterior de la misma cuenta.
export async function claimSlug(database, uid, base, rawSlug, now = new Date()) {
  const slug = normalizeSlug(rawSlug);
  if (!slug) throw Object.assign(Error(), { reason: 'INVALID_SLUG' });
  return database.runTransaction(async tx => {
    const linkRef = database.doc(`${LINKS}/${slug}`), ownerRef = database.doc(`${OWNERS}/${uid}`);
    const [link, owner] = await Promise.all([tx.get(linkRef), tx.get(ownerRef)]);
    if (link.exists && link.data().uid !== uid) throw Object.assign(Error(), { reason: 'SLUG_TAKEN' });
    const previous = owner.exists ? owner.data().slug : '';
    if (previous && previous !== slug) tx.delete(database.doc(`${LINKS}/${previous}`));
    const stamp = now.toISOString();
    tx.set(linkRef, { uid, updatedAt: stamp });
    tx.set(ownerRef, { slug, updatedAt: stamp });
    tx.set(database.doc(`${base}/config_web/disponibilidad`), { enlace: slug, enlaceActualizado: stamp }, { merge: true });
    return { slug };
  });
}

// GET /s/:slug -> redirige a la página de esa empresa.
export function linkRedirectHandler(getBackend) {
  return async request => {
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    const raw = decodeURIComponent(new URL(request.url).pathname.replace(/^\/s\/?/, '').split('/')[0] || '');
    const slug = normalizeSlug(raw);
    let target = '/?enlace=no-encontrado';
    if (slug) {
      try {
        const snap = await (await getBackend()).database.doc(`${LINKS}/${slug}`).get();
        const uid = snap.exists ? snap.data().uid : '';
        if (typeof uid === 'string' && /^[-_A-Za-z0-9]{1,128}$/.test(uid)) target = uid === ADMIN_UID ? '/' : '/?empresa=' + encodeURIComponent(uid);
      } catch { target = '/?enlace=no-disponible'; }
    }
    return new Response(null, { status: 302, headers: { ...headers, Location: target } });
  };
}
