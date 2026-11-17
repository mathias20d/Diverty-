// Operación Navidad · transporte configurable por cuenta.
// ESTE ARCHIVO SE COPIA IDÉNTICO EN:
//   - firebase/functions/navidad-transport.mjs (servidor, cálculo con autoridad)
//   - assets/js/diverty-navidad-transport.mjs (página pública)
//   - src/lib/navidad-transport.mjs del repositorio diverty-app (app del dueño)
// Si cambias uno, cambia los tres: el servidor rechaza un precio distinto (PRICE_CHANGED).
//
// Reglas de cálculo:
//  1. Cálculo automático apagado -> transporte por confirmar ($0, revisión).
//  2. Sin GPS -> ubicación por confirmar ($0, revisión).
//  3. Zonas en orden: primero los círculos (puntos con radio), después las áreas.
//     La primera zona que contiene el punto define el precio.
//  4. Fuera de todas las zonas -> fuera de cobertura automática ($0, revisión).
//  5. Zona roja activada (por nombre en dirección o referencia) -> se calcula el transporte
//     de su zona + el recargo de zona roja, y la reserva queda para confirmar.

export const TRANSPORT_SCHEMA = 1;
export const TRANSPORT_LIMITS = Object.freeze({ zones: 30, terms: 150, termLength: 60, nameLength: 60, price: 1000, radiusKm: 50 });

export const DEFAULT_RED_TERMS = Object.freeze([
  'barraza','chorrillo','calle 24','calle 25','san pedro','ciudad radial','villa del rey',
  'rana de oro','san joaquin','nazareno','villa cecilia','villa lobos','monterico sector 7',
  'monterico 7','cabuya','cabuyita','las mananitas sector 1','las mananitas sector 2','las mananitas sector 5',
  'felipillo','garzas de pacora','las garzas','el martillo','samaria','mano de piedra','torrijos carter',
  'santa marta','cerro batea','lago de los andes','coco solito','fatima','loma del cristo',
  'nuevo veranillo','veranillo','santa cruz','santa rita','caminos de omar','santa librada',
  'alcalde diaz','el trebol','nueva esperanza','jorge illueca','santa eduviges',
  'rio abajo calle 4','rio abajo calle 6','rio abajo calle 11','rio abajo calle 17'
]);

// Zonas y precios vigentes de Diverty (idénticos al cálculo anterior).
export const DEFAULT_TRANSPORT = Object.freeze({
  schemaVersion: TRANSPORT_SCHEMA,
  automatico: true,
  zonas: Object.freeze([
    Object.freeze({ id: 'punta-pacifica', nombre: 'Punta Pacífica', tipo: 'circulo', lat: 8.97644, lng: -79.50794, radioKm: 1.35, precio: 5 }),
    Object.freeze({ id: 'costa-del-este', nombre: 'Costa del Este', tipo: 'circulo', lat: 9.01318, lng: -79.46807, radioKm: 1.9, precio: 5 }),
    Object.freeze({ id: 'ciudad', nombre: 'Ciudad de Panamá', tipo: 'area', sur: 8.94, norte: 9.125, oeste: -79.545, este: -79.365, precio: 0 }),
    Object.freeze({ id: 'oeste', nombre: 'Albrook / Clayton', tipo: 'area', sur: 8.94, norte: 9.075, oeste: -79.605, este: -79.545, precio: 5 }),
    Object.freeze({ id: 'este', nombre: 'Panamá Este · hasta Pacora', tipo: 'area', sur: 8.95, norte: 9.145, oeste: -79.365, este: -79.275, precio: 5 }),
    Object.freeze({ id: 'norte', nombre: 'Panamá Norte · hasta La Cabima', tipo: 'area', sur: 9.125, norte: 9.185, oeste: -79.61, este: -79.47, precio: 5 })
  ]),
  zonasRojas: Object.freeze({ activo: true, terminos: DEFAULT_RED_TERMS, recargo: 0 })
});

export const normalizePlace = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const cleanText = (value, max) => String(value ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const money = value => { const n = Math.round(Number(value) * 100) / 100; return Number.isFinite(n) && n >= 0 && n <= TRANSPORT_LIMITS.price ? n : null; };
const coord = (value, limit) => { const n = Number(value); return Number.isFinite(n) && Math.abs(n) <= limit ? n : null; };
const slugId = value => normalizePlace(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'zona';

export function distanceKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Convierte lo guardado por el dueño en una configuración segura. Si algo no es
// válido se descarta esa parte; si no hay nada guardado se usan los valores de Diverty.
export function normalizeTransportConfig(raw) {
  if (!raw || typeof raw !== 'object' || Number(raw.schemaVersion) !== TRANSPORT_SCHEMA) return DEFAULT_TRANSPORT;
  const zonas = [];
  const used = new Set();
  for (const zone of Array.isArray(raw.zonas) ? raw.zonas.slice(0, TRANSPORT_LIMITS.zones) : []) {
    if (!zone || typeof zone !== 'object') continue;
    const nombre = cleanText(zone.nombre, TRANSPORT_LIMITS.nameLength), precio = money(zone.precio);
    if (!nombre || precio === null) continue;
    let id = cleanText(zone.id, 40).replace(/[^a-z0-9-]/g, '') || slugId(nombre);
    while (used.has(id)) id += '-2';
    used.add(id);
    if (zone.tipo === 'circulo') {
      const lat = coord(zone.lat, 90), lng = coord(zone.lng, 180), radioKm = Number(zone.radioKm);
      if (lat === null || lng === null || (lat === 0 && lng === 0) || !Number.isFinite(radioKm) || radioKm <= 0 || radioKm > TRANSPORT_LIMITS.radiusKm) continue;
      zonas.push({ id, nombre, tipo: 'circulo', lat, lng, radioKm: Math.round(radioKm * 100) / 100, precio });
    } else if (zone.tipo === 'area') {
      const sur = coord(zone.sur, 90), norte = coord(zone.norte, 90), oeste = coord(zone.oeste, 180), este = coord(zone.este, 180);
      if ([sur, norte, oeste, este].includes(null) || sur >= norte || oeste >= este) continue;
      zonas.push({ id, nombre, tipo: 'area', sur, norte, oeste, este, precio });
    }
  }
  const red = raw.zonasRojas && typeof raw.zonasRojas === 'object' ? raw.zonasRojas : {};
  const terminos = Array.from(new Set((Array.isArray(red.terminos) ? red.terminos : [])
    .map(term => normalizePlace(cleanText(term, TRANSPORT_LIMITS.termLength))).filter(term => term.length >= 3)))
    .slice(0, TRANSPORT_LIMITS.terms);
  return { schemaVersion: TRANSPORT_SCHEMA, automatico: raw.automatico !== false, zonas, zonasRojas: { activo: red.activo !== false, terminos, recargo: money(red.recargo) ?? 0 } };
}

function zoneFor(config, point) {
  const ordered = [...config.zonas.filter(z => z.tipo === 'circulo'), ...config.zonas.filter(z => z.tipo === 'area')];
  for (const zone of ordered) {
    if (zone.tipo === 'circulo' && distanceKm(point, zone) <= zone.radioKm) return zone;
    if (zone.tipo === 'area' && point.lat >= zone.sur && point.lat <= zone.norte && point.lng >= zone.oeste && point.lng <= zone.este) return zone;
  }
  return null;
}

const zoneLabel = zone => zone.nombre + (Number(zone.precio) > 0 ? ' · transporte adicional' : ' · transporte incluido');

// Resultado: {status:'included'|'surcharge'|'review', charge, label, reason?, zoneId?}
export function evaluateTransport(rawConfig, point, placeText = '') {
  const config = normalizeTransportConfig(rawConfig);
  const lat = Number(point?.lat), lng = Number(point?.lng);
  const hasPoint = point != null && point.lat !== '' && point.lng !== '' && point.lat != null && point.lng != null && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  const text = normalizePlace(placeText);
  const red = config.zonasRojas.activo && text && config.zonasRojas.terminos.some(term => text.includes(term));
  if (!config.automatico) return { status: 'review', charge: 0, label: 'Transporte por confirmar', reason: 'manual' };
  const zone = hasPoint ? zoneFor(config, { lat, lng }) : null;
  if (red) {
    const charge = Math.round(((zone ? zone.precio : 0) + config.zonasRojas.recargo) * 100) / 100;
    // Al cliente nunca se le muestra "zona roja": solo que la ubicación se confirmará.
    return { status: 'review', charge, label: 'Ubicación especial · ' + (charge > 0 ? 'transporte calculado, por confirmar' : 'confirmar'), reason: 'security', ...(zone ? { zoneId: zone.id } : {}) };
  }
  if (!hasPoint) return { status: 'review', charge: 0, label: 'Ubicación por confirmar', reason: 'no-gps' };
  if (!zone) return { status: 'review', charge: 0, label: 'Fuera de cobertura automática', reason: 'outside' };
  return { status: zone.precio > 0 ? 'surcharge' : 'included', charge: zone.precio, label: zoneLabel(zone), zoneId: zone.id };
}

// Valor listo para guardar en config_web/disponibilidad.transporte
export function transportForStorage(config) {
  const clean = normalizeTransportConfig({ ...config, schemaVersion: TRANSPORT_SCHEMA });
  return JSON.parse(JSON.stringify(clean));
}
