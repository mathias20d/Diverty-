export function normalizePortalPhone(value) {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('00507')) digits = digits.slice(5);
  else if (digits.length === 11 && digits.startsWith('507')) digits = digits.slice(3);
  return digits;
}

export function normalizePortalName(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export class PortalError extends Error {
  constructor(reason) { super(reason); this.reason = reason; }
}

export function parsePortalQuery(input) {
  const raw = String(input ?? '').trim();
  if (/^[+\d\s().-]+$/.test(raw)) {
    const value = normalizePortalPhone(raw);
    if (value.length < 8 || value.length > 15) throw new PortalError('INVALID_PHONE');
    return { kind: 'phone', value, raw };
  }
  const value = normalizePortalName(raw);
  if (value.length < 3 || value.length > 150 || !/\p{L}/u.test(value)) throw new PortalError('INVALID_NAME');
  return { kind: 'name', value, raw };
}

export function matchesPortalQuery(event, search) {
  if (!event || event.deletedLocally === true) return false;
  return search.kind === 'phone' ? normalizePortalPhone(event.telefono) === search.value : normalizePortalName(event.cliente) === search.value;
}

export function portalIndex(event) {
  if (!event || event.deletedLocally === true) return null;
  return { nombreKey: normalizePortalName(event.cliente), telefonoKey: normalizePortalPhone(event.telefono) };
}

export function portalSummary(event, id) {
  const money = value => Number.isFinite(Number(value)) ? String(Math.max(0, Number(value))) : '0';
  return { id, cliente: String(event.cliente || ''), fecha: String(event.fecha || ''), hora: String(event.hora || ''),
    estado: String(event.estado || 'Pendiente'), servicio: String(event.servicio || ''), total: money(event.total), abono: money(event.abono) };
}

export function assertUnambiguousName(rows, search) {
  if (search.kind === 'name' && new Set(rows.map(row => normalizePortalPhone(row.telefono))).size > 1) throw new PortalError('AMBIGUOUS_NAME');
}

export async function searchCustomerPortal(input, { getOwned, lookup }) {
  const search = parsePortalQuery(input);
  let ownedFailure;
  try {
    const owned = (await getOwned()).filter(row => matchesPortalQuery(row, search));
    if (owned.length) {
      assertUnambiguousName(owned, search);
      return owned.map(row => portalSummary(row, row.id)).sort((a,b) => b.fecha.localeCompare(a.fecha) || b.hora.localeCompare(a.hora));
    }
  } catch (error) {
    if (error.reason === 'AMBIGUOUS_NAME') throw error;
    ownedFailure = error;
  }
  try {
    const result = await lookup(search);
    if (!Array.isArray(result?.reservations)) throw new PortalError('UNAVAILABLE');
    return result.reservations;
  } catch (error) {
    if (['AMBIGUOUS_NAME','RATE_LIMITED'].includes(error.reason)) throw new PortalError(error.reason);
    if (error.details?.reason === 'AMBIGUOUS_NAME') throw new PortalError('AMBIGUOUS_NAME');
    if (error.code === 'functions/resource-exhausted') throw new PortalError('RATE_LIMITED');
    throw ownedFailure?.reason === 'OFFLINE' ? ownedFailure : new PortalError('UNAVAILABLE');
  }
}
