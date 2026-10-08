import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogImageUrl,responsiveImage,socialImage} from '../assets/js/diverty-images.mjs';
import handler from '../netlify/edge-functions/share-meta.js';
const origin='https://divertypanama.netlify.app';
const original='https://res.cloudinary.com/demo/image/upload/v123456/fiestas/santa.jpg';
test('responsive photos provide bounded pixel candidates with the same crop and no extra DPR multiplier',()=>{
 const image=responsiveImage(original);
 assert.equal(image.src,catalogImageUrl(original,480,360));
 assert.match(image.srcset,/w_240,h_180.* 240w, .*w_320,h_240.* 320w/);
 assert.doesNotMatch(image.srcset,/dpr_auto/);
 assert.match(image.srcset,/f_webp/);assert.doesNotMatch(image.srcset,/f_auto/);
 const detail=responsiveImage(original,{ratio:2,widths:[1080,480,768,480,Infinity,-1]});
 assert.equal(detail.srcset.split(', ').length,3);
 assert.match(detail.srcset,/w_768,h_384.* 768w/);
 assert.match(responsiveImage(original,{ratio:1}).src,/w_480,h_480/);
 const desktop=responsiveImage(original,{ratio:0,widths:[480,768,1080]});
 assert.match(desktop.srcset,/c_limit,w_768/);assert.doesNotMatch(desktop.srcset,/c_fill|h_\d+/);
 assert.deepEqual(responsiveImage('/assets/photo.jpg'),{src:'/assets/photo.jpg',srcset:''});
 const signed=original.replace('/upload/','/upload/s--signature--/');
 assert.deepEqual(responsiveImage(signed),{src:signed,srcset:''});
});
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
