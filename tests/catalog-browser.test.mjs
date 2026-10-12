import test from 'node:test';
import assert from 'node:assert/strict';
import { browseCatalog } from '../assets/js/diverty-catalog-browser.mjs';

const categories = [{ id: 'party', nombre: 'Animación infantil' }];
const rows = [
  { id: 'a', nombre: 'Magia Diverty', categoria: 'party', precio: 100, serviciosLista: 'Globoflexia\nJuegos', destacado: true },
  { id: 'b', name: 'Héroe azul', categoria: 'party', price: 80, tipoServicio: 'personaje', tematica: 'Superhéroes', oferta: true },
  { id: 'c', nombre: 'Hot dogs', precio: 2, tipoCobro: 'unidad', descripcion: 'Comida para fiestas' },
  { id: 'd', nombre: 'Opción pendiente', precio: 'no válido' },
  { id: 'e', nombre: 'Servicio gratuito', precio: 0 },
];
test('search combines words across names, inclusions, themes and category names, ignoring accents', () => {
  assert.deepEqual(browseCatalog(rows, { query: '  HEROE animacion  ' }, categories).map(row => row.id), ['b']);
  assert.deepEqual(browseCatalog(rows, { query: 'magia globoflexia' }, categories).map(row => row.id), ['a']);
  assert.deepEqual(browseCatalog(rows, { query: 'fiestas comida' }).map(row => row.id), ['c']);
});
test('filters compose with search without inventing offers or characters', () => {
  assert.deepEqual(browseCatalog(rows, { kind: 'offers', query: 'hero' }).map(row => row.id), ['b']);
  assert.deepEqual(browseCatalog(rows, { kind: 'characters', query: 'hot' }), []);
  assert.deepEqual(browseCatalog(rows, { kind: 'featured' }).map(row => row.id), ['a']);
});
test('sorting keeps zero prices, puts invalid prices last and retains the actual price and billing unit', () => {
  assert.deepEqual(browseCatalog(rows, { sort: 'price-asc' }).map(row => row.id), ['e', 'c', 'b', 'a', 'd']);
  assert.deepEqual(browseCatalog(rows, { sort: 'price-desc' }).map(row => row.id), ['a', 'b', 'c', 'e', 'd']);
  assert.equal(browseCatalog(rows, { sort: 'price-asc' })[1], rows[2]);
  assert.equal(rows[2].tipoCobro, 'unidad');
});
test('recommended order preserves the source order and sorting never mutates the catalog', () => {
  const before = structuredClone(rows);
  browseCatalog(rows, { sort: 'name' });
  assert.deepEqual(rows, before);
  assert.deepEqual(browseCatalog(rows).map(row => row.id), before.map(row => row.id));
  assert.deepEqual(browseCatalog([{ nombre: 'Plan 10' }, { nombre: 'Plan 2' }], { sort: 'name' }).map(row => row.nombre), ['Plan 2', 'Plan 10']);
});
