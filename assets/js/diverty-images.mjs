const uploadMarker='/image/upload/';
function cloudinarySource(value) {
  let url;
  try{url=new URL(String(value||'').trim());}catch{return null;}
  if(url.hostname!=='res.cloudinary.com'||!['https:','http:'].includes(url.protocol)||!url.pathname.includes(uploadMarker))return null;
  const [prefix,original]=url.pathname.split(uploadMarker);
  // Signed delivery URLs must retain their original signature/transformation.
  if(original.startsWith('s--'))return null;
  const version=original.match(/(?:^|\/)(v\d+\/)/);
  let source=version?original.slice(version.index+(original[version.index]==='/'?1:0)):original;
  if(!version){
    const segments=source.split('/');
    while(/^(?:(?:c|w|h|g|q|f|dpr|b|e|ar|a|x|y|z|r|bo|t|fl|o|l|u)_|\$)/.test(segments[0]))segments.shift();
    source=segments.join('/');
  }
  if(!source)return null;
  url.protocol='https:';
  return {url,prefix,source};
}
function transform(value,options){
  const parsed=cloudinarySource(value);
  if(!parsed)return null;
  parsed.url.pathname=parsed.prefix+uploadMarker+options+'/'+parsed.source;
  return parsed.url.toString();
}
export function catalogImageUrl(value,width=720,height=540){
  const w=Math.round(Math.max(120,Math.min(1600,Number(width)||720)));
  const h=Math.round(Math.max(120,Math.min(1600,Number(height)||540)));
  return transform(value,`c_fill,g_auto,w_${w},h_${h},f_webp,q_auto:good`)||String(value||'').trim();
}
// Explicit pixel candidates let the browser account for both layout and screen
// density, without multiplying every photo by dpr_auto a second time.
export function responsiveImage(value,{widths=[240,320,480,720,960],ratio=4/3}={}){
  const original=String(value||'').trim();
  if(!cloudinarySource(original))return {src:original,srcset:''};
  const candidates=[...new Set(widths.map(Number).filter(w=>Number.isFinite(w)&&w>=120&&w<=1600).map(Math.round))].sort((a,b)=>a-b);
  if(!candidates.length)return {src:original,srcset:''};
  const url=w=>ratio>0?catalogImageUrl(original,w,Math.round(w/ratio)):transform(original,`c_limit,w_${w},f_webp,q_auto:good`);
  return {src:url(candidates.find(w=>w>=480)||candidates.at(-1)),srcset:candidates.map(w=>`${url(w)} ${w}w`).join(', ')};
}
export function socialImage(value,origin){
  let url;
  try{url=new URL(String(value||'').trim()||'/android-chrome-512x512.png',origin);}catch{return socialImage('',origin);}
  if(!['http:','https:'].includes(url.protocol))return socialImage('',origin);
  url.protocol='https:';
  // The complete original is fitted over a blurred version of the same photo.
  // Only the background is cropped; poster text and people remain in the foreground.
  // JPEG avoids crawler-dependent AVIF/WebP delivery.
  const source=cloudinarySource(url.toString());
  const asset=source?.source.replace(/^v\d+\//,'').replace(/\.[a-z0-9]+$/i,'').split('/').map(encodeURIComponent).join(':');
  const image=asset?transform(url.toString(),`c_fill,g_auto,w_1200,h_630/e_blur:1000/l_${asset}/c_fit,w_1200,h_630/fl_layer_apply,g_center/f_jpg,q_auto:good`):null;
  if(image)return {url:image,width:1200,height:630,type:'image/jpeg'};
  if(url.pathname==='/android-chrome-512x512.png')return {url:url.toString(),width:512,height:512,type:'image/png'};
  return {url:url.toString()};
}

// Read-only backups of currently published photos. New URLs keep using the CDN.
const cachedPhotos={
  "https://res.cloudinary.com/djfboe8rg/image/upload/v1778211755/blob_l3dqc1.jpg": "/assets/catalog-fallback/d173d09a49da64d3.webp",
  "https://res.cloudinary.com/djfboe8rg/image/upload/v1790971947/blob_tgh6kz.png": "/assets/catalog-fallback/3026ea671f80480e.webp",
  "https://res.cloudinary.com/djfboe8rg/image/upload/v1780879064/blob_cnyeaf.jpg": "/assets/catalog-fallback/5f9d4b09808788e6.webp",
  "https://res.cloudinary.com/djfboe8rg/image/upload/v1780879210/blob_gzyr1z.jpg": "/assets/catalog-fallback/3efaba7dd048daa7.webp",
  "https://res.cloudinary.com/djfboe8rg/image/upload/v1780878892/blob_ar4qng.jpg": "/assets/catalog-fallback/2f484cb845c2107c.webp",
  "https://res.cloudinary.com/djfboe8rg/image/upload/v1790821507/blob_mjfeg7.webp": "/assets/catalog-fallback/956f4235faed4569.webp",
  "https://res.cloudinary.com/djfboe8rg/image/upload/v1778218325/blob_h2il68.jpg": "/assets/catalog-fallback/3967503f5ca59cce.webp",
  "https://res.cloudinary.com/djfboe8rg/image/upload/v1780875133/blob_eer3cc.jpg": "/assets/catalog-fallback/92f595aa5b0c0129.webp",
  "https://res.cloudinary.com/djfboe8rg/image/upload/v1786171659/blob_wgauxs.png": "/assets/catalog-fallback/35155dd1812993e2.webp",
  "https://res.cloudinary.com/djfboe8rg/image/upload/v1786417204/blob_bdarge.png": "/assets/catalog-fallback/7a980ddadecdf36c.webp",
  "https://res.cloudinary.com/djfboe8rg/image/upload/v1780879441/blob_e9t51x.jpg": "/assets/catalog-fallback/b48f8477a3302aa4.webp",
  "https://res.cloudinary.com/djfboe8rg/image/upload/v1780875258/blob_d3mwgq.jpg": "/assets/catalog-fallback/a9e21264eb0d4419.webp",
  "https://res.cloudinary.com/djfboe8rg/image/upload/v1786420819/blob_pixspa.png": "/assets/catalog-fallback/dfe00f15503f449e.webp",
  "https://res.cloudinary.com/djfboe8rg/image/upload/v1780880441/369105_quzbs7.jpg": "/assets/catalog-fallback/2ca66098dda6fe2b.webp",
  "https://res.cloudinary.com/djfboe8rg/image/upload/v1780880485/369063_jhrrtp.jpg": "/assets/catalog-fallback/bf11120738b716a5.webp",
  "https://res.cloudinary.com/djfboe8rg/image/upload/v1780880379/blob_p1oagd.jpg": "/assets/catalog-fallback/888b98f1738551ee.webp",
  "https://res.cloudinary.com/djfboe8rg/image/upload/v1780880469/369086_zwdzew.jpg": "/assets/catalog-fallback/d77ad2d884b7bafa.webp",
  "https://res.cloudinary.com/djfboe8rg/image/upload/v1780880402/blob_negvsj.jpg": "/assets/catalog-fallback/3efaba7dd048daa7.webp",
  "https://res.cloudinary.com/djfboe8rg/image/upload/v1780880415/blob_bbxmgt.jpg": "/assets/catalog-fallback/ed52c487b697c70a.webp",
  "https://res.cloudinary.com/djfboe8rg/image/upload/v1780880555/29fe80b1-bc57-4283-827b-052844eb6587-1_all_9863_f7g0vj.jpg": "/assets/catalog-fallback/de910336896476e8.webp",
  "https://res.cloudinary.com/djfboe8rg/image/upload/v1780880352/blob_dvlqr9.jpg": "/assets/catalog-fallback/b48f8477a3302aa4.webp",
  "https://res.cloudinary.com/djfboe8rg/image/upload/v1790820444/blob_yi9x4n.jpg": "/assets/catalog-fallback/6276d6a00d3c4218.webp"
};
export function imageFallbackUrl(value){return cachedPhotos[String(value||'').trim()]||'';}
