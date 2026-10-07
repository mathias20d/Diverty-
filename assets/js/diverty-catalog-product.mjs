// Keep in sync with diverty-app/src/lib/catalog-product.mjs.
export const EMPTY_PRODUCT_OPTIONS = { tipoServicio: 'servicio', cantidadMinima: 1, cantidadMaxima: '', incrementoCantidad: 1, unidadEtiqueta: 'unidad', tematica: '' };

export function productOptionsFromItem(item = {}) {
  return { ...EMPTY_PRODUCT_OPTIONS, tipoServicio: item.tipoServicio || (item.tipoCobro === 'unidad' ? 'producto' : 'servicio'), cantidadMinima: item.cantidadMinima ?? 1, cantidadMaxima: item.cantidadMaxima ?? '', incrementoCantidad: item.incrementoCantidad ?? 1, unidadEtiqueta: item.unidadEtiqueta || 'unidad', tematica: item.tematica || '' };
}

export function productOptionsForSave(form) {
  const tipoServicio = ['producto', 'personaje'].includes(form.tipoServicio) ? form.tipoServicio : 'servicio';
  const tipoCobro = tipoServicio === 'personaje' ? 'paquete' : form.tipoCobro || 'paquete';
  const variable = ['unidad', 'hora', 'nino'].includes(tipoCobro);
  const min = Number(form.cantidadMinima), step = Number(form.incrementoCantidad);
  const max = form.cantidadMaxima === '' || form.cantidadMaxima == null ? null : Number(form.cantidadMaxima);
  if (variable && (!Number.isSafeInteger(min) || min < 1 || !Number.isSafeInteger(step) || step < 1 || (max !== null && (!Number.isSafeInteger(max) || max < min)))) throw new Error('Indica cantidades enteras positivas y un máximo igual o mayor al mínimo.');
  return { tipoServicio, tipoCobro, cantidadMinima: variable ? min : 1, cantidadMaxima: variable ? max : null, incrementoCantidad: variable ? step : 1, unidadEtiqueta: String(form.unidadEtiqueta || 'unidad').trim() || 'unidad', tematica: tipoServicio === 'personaje' ? String(form.tematica || '').trim() : '' };
}
