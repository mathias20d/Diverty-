// Keep in sync with Diverty-/assets/js/diverty-catalog-product.mjs and diverty-app/src/lib/catalog-product.mjs.
// This default matches the existing booking server; explicit catalog maxima take precedence.
export const DEFAULT_MAX_QUANTITY = 1000;
export const EMPTY_PRODUCT_OPTIONS = { tipoServicio: 'servicio', cantidadMinima: 1, cantidadMaxima: DEFAULT_MAX_QUANTITY, incrementoCantidad: 1, unidadEtiqueta: 'unidad', tematica: '' };

export function catalogQuantityLimits(item = {}) {
  const min = Math.max(1, Math.floor(Number(item.cantidadMinima ?? item.minCantidad) || 1));
  const max = Math.floor(Number(item.cantidadMaxima ?? item.maxCantidad) || DEFAULT_MAX_QUANTITY);
  const stepValue = Number(item.incrementoCantidad ?? item.pasoCantidad);
  const step = Number.isFinite(stepValue) && stepValue > 0 ? Math.max(1, Math.floor(stepValue)) : 1;
  return { min, max, step };
}

export function clampCatalogQuantity(rule, value) {
  const quantity = Number.isFinite(Number(value)) ? Math.floor(Number(value)) : rule.min;
  return Math.min(rule.max, Math.max(rule.min, quantity));
}

export function productOptionsFromItem(item = {}) {
  const { min, max, step } = catalogQuantityLimits(item);
  return { ...EMPTY_PRODUCT_OPTIONS, tipoServicio: item.tipoServicio || (item.tipoCobro === 'unidad' ? 'producto' : 'servicio'), cantidadMinima: min, cantidadMaxima: max, incrementoCantidad: step, unidadEtiqueta: item.unidadEtiqueta || 'unidad', tematica: item.tematica || '' };
}

export function productOptionsForSave(form) {
  const tipoServicio = ['producto', 'personaje'].includes(form.tipoServicio) ? form.tipoServicio : 'servicio';
  const tipoCobro = tipoServicio === 'personaje' ? 'paquete' : form.tipoCobro || 'paquete';
  const variable = ['unidad', 'hora', 'nino'].includes(tipoCobro);
  const min = Number(form.cantidadMinima), step = Number(form.incrementoCantidad);
  const max = form.cantidadMaxima === '' || form.cantidadMaxima == null ? DEFAULT_MAX_QUANTITY : Number(form.cantidadMaxima);
  if (variable && (!Number.isSafeInteger(min) || min < 1 || !Number.isSafeInteger(step) || step < 1 || !Number.isSafeInteger(max) || max < 1)) throw new Error('Indica cantidades enteras positivas para el mínimo, máximo e incremento.');
  if (variable && max < min) throw new Error(`La cantidad mínima no puede superar el máximo (${max}). Si dejas el máximo vacío, se usa ${DEFAULT_MAX_QUANTITY}.`);
  return { tipoServicio, tipoCobro, cantidadMinima: variable ? min : 1, cantidadMaxima: variable ? max : null, incrementoCantidad: variable ? step : 1, unidadEtiqueta: String(form.unidadEtiqueta || 'unidad').trim() || 'unidad', tematica: tipoServicio === 'personaje' ? String(form.tematica || '').trim() : '' };
}
