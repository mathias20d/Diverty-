import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogImageUrl,socialImage} from '../assets/js/diverty-images.mjs';
import handler from '../netlify/edge-functions/share-meta.js';
const origin='https://divertypanama.netlify.app';
const original='https://res.cloudinary.com/demo/image/upload/v123456/fiestas/santa.jpg';
test('catalog crops fit the target frame and recover original files from previously cropped URLs',()=>{
 const cropped='https://res.cloudinary.com/demo/image/upload/c_fill,g_north,w_300,h_300/v123456/fiestas/santa.jpg';
 assert.equal(catalogImageUrl(cropped,720,540),catalogImageUrl(original,720,540));
 assert.match(catalogImageUrl(original,720,540),/c_fill,g_auto,w_720,h_540/);
 assert.match(catalogImageUrl(original,480,480),/w_480,h_480/);
 assert.equal(catalogImageUrl('/assets/photo.jpg'),'/assets/photo.jpg');
 const signed=original.replace('/upload/','/upload/s--signature--/');assert.equal(catalogImageUrl(signed),signed);
 assert.equal(catalogImageUrl('https://example.com/res.cloudinary.com/image/upload/test.jpg'),'https://example.com/res.cloudinary.com/image/upload/test.jpg');
});
test('social previews retain the full photo in a JPEG frame and report only known dimensions',()=>{
 const image=socialImage(original,origin);
 assert.equal(image.width,1200);assert.equal(image.height,630);assert.equal(image.type,'image/jpeg');
 assert.match(image.url,/w_1200,h_630\/e_blur:1000\/l_fiestas:santa\/c_fit,w_1200,h_630\/fl_layer_apply,g_center\/f_jpg/);
 assert.deepEqual(socialImage('',origin),{url:origin+'/android-chrome-512x512.png',width:512,height:512,type:'image/png'});
 assert.deepEqual(socialImage('https://example.com/photo.jpg',origin),{url:'https://example.com/photo.jpg'});
 assert.equal(socialImage('javascript:alert(1)',origin).width,512);
});
test('the edge preview uses the complete service photo, current price, JPEG dimensions and fresh link version',async()=>{
 const prior=globalThis.fetch;
 globalThis.fetch=async url=>{
  if(String(url).startsWith('https://identitytoolkit.googleapis.com/'))return Response.json({idToken:'fake-token',expiresIn:3600});
  assert.match(String(url),/firestore.googleapis.com/);
  return Response.json({fields:{nombre:{stringValue:'Santa & regalos'},precio:{doubleValue:50},imagen:{stringValue:original},imagenTarjeta:{stringValue:'https://example.com/cropped.jpg'}}});
 };
 try{
  const request=new Request(origin+'/?plan=santa&pv=image4');
  const response=await handler(request,{next:async()=>new Response('<html><head><meta property="og:image" content="old"><link rel="canonical" href="old"></head><body>Contenido</body></html>',{headers:{'content-type':'text/html'}})});
  const html=await response.text();
  assert.equal(response.headers.get('x-diverty-social-preview'),'plan-v4');
  assert.match(html,/e_blur:1000\/l_fiestas:santa\/c_fit,w_1200,h_630\/fl_layer_apply/);
  assert.match(html,/og:image:type" content="image\/jpeg/);assert.match(html,/og:image:width" content="1200/);
  assert.match(html,/Santa &amp; regalos · \$50.00/);assert.match(html,/plan=santa&amp;pv=image4/);
  assert.equal((html.match(/property="og:image"/g)||[]).length,1);assert.doesNotMatch(html,/cropped.jpg/);
  assert.match(html,/<body>Contenido<\/body>/);
 }finally{globalThis.fetch=prior;}
});
