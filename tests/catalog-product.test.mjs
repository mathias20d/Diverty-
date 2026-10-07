import test from 'node:test';
import assert from 'node:assert/strict';
import {productOptionsForSave,productOptionsFromItem,catalogQuantityLimits,clampCatalogQuantity,DEFAULT_MAX_QUANTITY} from '../assets/js/diverty-catalog-product.mjs';
test('editing retains a product minimum, maximum, step and unit label',()=>{
 const product={tipoCobro:'unidad',cantidadMinima:50,cantidadMaxima:500,incrementoCantidad:25,unidadEtiqueta:'hot dog'};
 assert.deepEqual(productOptionsForSave({...product,...productOptionsFromItem(product)}),{...product,tipoServicio:'producto',tematica:''});
});
test('invalid quantities cannot be published and blank maximum uses the server default',()=>{
 const options={...productOptionsFromItem(),tipoCobro:'unidad'};
 for(const patch of [{cantidadMinima:0},{cantidadMinima:1.5},{cantidadMaxima:-1},{cantidadMinima:50,cantidadMaxima:20},{incrementoCantidad:0},{incrementoCantidad:Infinity}])assert.throws(()=>productOptionsForSave({...options,...patch}));
 assert.equal(productOptionsForSave({...options,cantidadMaxima:''}).cantidadMaxima,DEFAULT_MAX_QUANTITY);
});
test('character prices are fixed and preserve their theme when editing',()=>{
 assert.deepEqual(productOptionsForSave({...productOptionsFromItem(),tipoServicio:'personaje',tipoCobro:'unidad',tematica:' Superhéroes '}),{tipoServicio:'personaje',tipoCobro:'paquete',cantidadMinima:1,cantidadMaxima:null,incrementoCantidad:1,unidadEtiqueta:'unidad',tematica:'Superhéroes'});
});

test('empty and historical maxima display the effective server limit when editing',()=>{
 for(const cantidadMaxima of [undefined,null,'',0]){
  const limits=catalogQuantityLimits({cantidadMinima:50,cantidadMaxima,incrementoCantidad:25});
  assert.deepEqual(limits,{min:50,max:1000,step:25});assert.equal(productOptionsFromItem({cantidadMaxima}).cantidadMaxima,1000);
  assert.equal(clampCatalogQuantity(limits,1001),1000);assert.equal(clampCatalogQuantity(limits,49),50);
 }
 assert.deepEqual(catalogQuantityLimits({cantidadMinima:50.8,cantidadMaxima:1000.8,incrementoCantidad:2.5}),{min:50,max:1000,step:2});
 assert.deepEqual(catalogQuantityLimits({minCantidad:50,maxCantidad:1500,pasoCantidad:25}),{min:50,max:1500,step:25});
});
test('a higher minimum requires an explicit higher maximum, and every integer can be typed',()=>{
 const form={...productOptionsFromItem(),tipoCobro:'unidad',cantidadMinima:1200,cantidadMaxima:'',incrementoCantidad:25};
 assert.throws(()=>productOptionsForSave(form),/1000/);
 const saved=productOptionsForSave({...form,cantidadMaxima:'2000'});
 assert.equal(saved.cantidadMaxima,2000);const limits=catalogQuantityLimits(saved);
 assert.equal(clampCatalogQuantity(limits,1501),1501);assert.equal(clampCatalogQuantity(limits,2001),2000);
});
