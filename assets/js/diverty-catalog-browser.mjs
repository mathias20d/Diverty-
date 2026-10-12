// Shared browsing rules; keep in sync with diverty-app/src/lib/catalog-browser.mjs.
export function normalizeCatalogText(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

export function browseCatalog(items, { query = '', kind = 'all', sort = 'recommended' } = {}, categories = []) {
  const categoryNames = new Map(categories.map(category => [category.id, category.nombre || category.name || '']));
  const terms = normalizeCatalogText(query).split(/\s+/).filter(Boolean);
  const rows = items.filter(item => {
    if (kind === 'offers' && item.oferta !== true && item.discountApplied !== true) return false;
    if (kind === 'characters' && item.tipoServicio !== 'personaje') return false;
    if (kind === 'featured' && item.destacado !== true) return false;
    const haystack = normalizeCatalogText([
      item.nombre || item.name || item.title, item.descripcion || item.description,
      item.tematica, categoryNames.get(item.categoria), item.serviciosLista,
      Array.isArray(item.services) ? item.services.join(' ') : '',
    ].filter(Boolean).join(' '));
    return terms.every(term => haystack.includes(term));
  });
  const price = item => {
    const value = Number(item.precio ?? item.price);
    return Number.isFinite(value) && value >= 0 ? value : null;
  };
  if (sort === 'price-asc' || sort === 'price-desc') rows.sort((a, b) => {
    const first = price(a), second = price(b);
    if (first === null || second === null) return first === second ? 0 : first === null ? 1 : -1;
    return (first - second) * (sort === 'price-desc' ? -1 : 1);
  });
  else if (sort === 'name') rows.sort((a, b) => String(a.nombre || a.name || a.title || '').localeCompare(String(b.nombre || b.name || b.title || ''), 'es', { sensitivity: 'base', numeric: true }));
  return rows;
}
