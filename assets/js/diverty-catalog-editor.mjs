import {serviceDurationHours} from './diverty-service-duration.mjs?v=000000000000';

export const categorySlug = name => String(name || '').trim().toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function catalogDurationForm(item = {}) {
  if (item.duracionCatalogoDefinida === false) return '';
  const hours = serviceDurationHours(item);
  return hours > 0 ? hours : '';
}

export function catalogDurationFields(value, mode = 'paquete') {
  if (mode === 'unidad' || mode === 'hora' || value === '' || value == null)
    return {duracionHoras: null, duracionCatalogoDefinida: false};
  const hours = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(hours) || hours <= 0) throw new Error('Indica una duración mayor que cero; por ejemplo, 1.5 para una hora y media.');
  return {duracionHoras: hours, duracionCatalogoDefinida: true};
}

// Reading before creating prevents two administrators overwriting the same slug.
export async function createCategoryWithSync({database, runTransaction, ref, data, syncRef, syncUpdate}) {
  return runTransaction(database, async tx => {
    if ((await tx.get(ref)).exists()) throw new Error('CATEGORY_EXISTS');
    tx.set(ref, data);
    tx.set(syncRef, syncUpdate, {merge:true});
  });
}
