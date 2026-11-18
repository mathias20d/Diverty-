// Datos de la empresa y publicación del catálogo de Operación Navidad.
// Lo hace el servidor (Admin SDK) para que publicar no dependa de confirmar el correo:
// basta con una cuenta registrada (no anónima), un WhatsApp válido y un servicio activo.
import { claimSlug, normalizeSlug, OWNERS } from './navidad-links.mjs';

const fail = reason => Object.assign(Error(), { reason });
const cleanName = value => String(value ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100);
export function cleanPhone(value) {
  const digits = String(value ?? '').replace(/[^0-9]/g, '');
  return digits.length === 8 ? '507' + digits : digits;
}

export function profileInput(data = {}) {
  const out = {};
  if (data.nombreEmpresa !== undefined) {
    out.nombreEmpresa = cleanName(data.nombreEmpresa);
    if (!out.nombreEmpresa) throw fail('NAME_REQUIRED');
  }
  if (data.telefonoEmpresa !== undefined) {
    out.telefonoEmpresa = cleanPhone(data.telefonoEmpresa);
    if (out.telefonoEmpresa && (out.telefonoEmpresa.length < 8 || out.telefonoEmpresa.length > 15)) throw fail('PHONE_REQUIRED');
  }
  if (data.capacidadSanta !== undefined) {
    const n = Number(data.capacidadSanta);
    if (!Number.isInteger(n) || n < 1 || n > 20) throw fail('INVALID_REQUEST');
    out.capacidadSanta = n;
  }
  if (data.maxNinos !== undefined) {
    const n = Number(data.maxNinos);
    if (!Number.isInteger(n) || n < 1 || n > 50) throw fail('INVALID_REQUEST');
    out.maxNinos = n;
  }
  if (data.publicado !== undefined) {
    if (typeof data.publicado !== 'boolean') throw fail('INVALID_REQUEST');
    out.publicado = data.publicado;
  }
  if (!Object.keys(out).length) throw fail('INVALID_REQUEST');
  return out;
}

// Intenta el nombre de la empresa como enlace; si está ocupado, agrega un número.
async function autoSlug(database, uid, base, name) {
  const root = normalizeSlug(name) || normalizeSlug('navidad-' + name) || 'navidad-santa';
  for (let i = 0; i < 6; i++) {
    try {
      return (await claimSlug(database, uid, base, i ? `${root.slice(0, 36)}-${i + 1}` : root)).slug;
    } catch (error) {
      if (error.reason !== 'SLUG_TAKEN') throw error;
    }
  }
  return '';
}

export async function saveProfile(database, scope, data, now = new Date()) {
  const input = profileInput(data), stamp = now.toISOString();
  const globalRef = database.doc(scope.base + '/config_web/global'), syncRef = database.doc(scope.base + '/config_web/web_sync');
  const saved = await database.runTransaction(async tx => {
    const [globalSnap, syncSnap] = await Promise.all([tx.get(globalRef), tx.get(syncRef)]);
    const current = globalSnap.exists ? globalSnap.data() : {};
    const next = {
      nombreEmpresa: input.nombreEmpresa ?? current.nombreEmpresa ?? '',
      telefonoEmpresa: input.telefonoEmpresa ?? current.telefonoEmpresa ?? '',
      publicado: input.publicado ?? current.publicado === true,
      capacidadSanta: input.capacidadSanta ?? (Number.isInteger(current.capacidadSanta) ? current.capacidadSanta : 1),
      ...(input.maxNinos !== undefined || Number.isInteger(current.maxNinos) ? { maxNinos: input.maxNinos ?? current.maxNinos } : {}),
      centralBookingValidation: true,
      whatsappBookingEnabled: false,
      updatedAt: stamp,
    };
    if (!next.nombreEmpresa) throw fail('NAME_REQUIRED');
    if (next.publicado) {
      if (next.telefonoEmpresa.length < 8 || next.telefonoEmpresa.length > 15) throw fail('PHONE_REQUIRED');
      const services = await tx.get(database.collection(scope.base + '/catalogo_web').where('esNavidad', '==', true).limit(5));
      if (!services.docs.some(doc => doc.data()?.activo !== false)) throw fail('SERVICE_REQUIRED');
    }
    const sync = syncSnap.exists ? syncSnap.data() : {};
    tx.set(globalRef, next, { merge: true });
    tx.set(syncRef, { version: Number(sync.version || 0) + 1, versions: { ...(sync.versions || {}), config_web: Number(sync.versions?.config_web || 0) + 1 }, updatedAt: stamp }, { merge: true });
    return next;
  });
  // Al publicar sin enlace propio, se crea uno con el nombre de la empresa.
  let slug = '';
  if (saved.publicado) {
    const owner = await database.doc(`${OWNERS}/${scope.uid}`).get();
    slug = owner.exists ? owner.data().slug || '' : '';
    if (!slug) slug = await autoSlug(database, scope.uid, scope.base, saved.nombreEmpresa).catch(() => '');
  }
  return { publicado: saved.publicado, nombreEmpresa: saved.nombreEmpresa, telefonoEmpresa: saved.telefonoEmpresa, capacidadSanta: saved.capacidadSanta, maxNinos: saved.maxNinos ?? 2, slug };
}
