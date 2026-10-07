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
  return transform(value,`c_fill,g_auto,w_${w},h_${h},f_auto,q_auto:good`)||String(value||'').trim();
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
