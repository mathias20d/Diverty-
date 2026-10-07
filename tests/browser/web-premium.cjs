const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const output=path.resolve(__dirname,'../../dist');
const artifact=process.env.BROWSER_ARTIFACT_DIR;
const baseline=process.env.PREMIUM_BASELINE==='1';
const encode=value=>typeof value==='boolean'?{booleanValue:value}:typeof value==='number'?{integerValue:String(value)}:Array.isArray(value)?{arrayValue:{values:value.map(encode)}}:value&&typeof value==='object'?{mapValue:{fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)]))}}:{stringValue:String(value??'')};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');const file=path.resolve(output,'.'+decodeURIComponent(url.pathname));
 if(file!==output&&!file.startsWith(output+path.sep)){res.writeHead(403);return res.end();}
 const target=file===output?path.join(output,'index.html'):file;
 fs.readFile(target,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.webp':'image/webp','.woff2':'font/woff2'})[path.extname(target)]||'application/octet-stream'});res.end(error?'Not found':data);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 const metrics=[];
 try{
  for(const theme of (process.env.PREMIUM_THEMES||'normal,halloween,christmas,summer,school,custom').split(',')){
   for(const width of (process.env.PREMIUM_WIDTHS||'320,392,1280').split(',').map(Number)){
    const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
    const api={
     config_web:[{id:'global',bannerActive:true,bannerText:'Reserva tu próxima celebración'},{id:'web_sync',version:1,versions:{catalogo_web:1}}],
     temas_web:[{id:theme,nombre:theme,tipo:theme,isDefault:true,animaciones:false,decoracion:'none'}],
     categorias_web:[{id:'fiestas',nombre:'Planes de animación',imagen:'/test-media/plan.jpg',activo:true,visible:true,orden:1},{id:'extras',nombre:'Servicios y snacks',imagen:'/test-media/snack.jpg',activo:true,visible:true,orden:2},{id:'personajes',nombre:'Personajes temáticos',imagen:'/test-media/face.jpg',activo:true,visible:true,orden:3}],
     catalogo_web:[{id:'plan',nombre:'Plan Magic',descripcion:'Animación, juegos y diversión para tu celebración.',serviciosLista:'Payasito (a)\nAnimación infantil\nGloboflexia\nPintacaritas 1 hora\nMesa y silla de maquillaje\nMúsica infantil\nAsistencia para la piñata\nCanto de cumpleaños\nDuración 2 horas',categoria:'fiestas',precio:150,precioOriginal:180,oferta:true,destacado:true,imagen:'/test-media/plan.jpg'},
      {id:'plus',nombre:'Una celebración con animación y actividades para toda la familia',categoria:'fiestas',precio:200,imagen:'/test-media/face.jpg'},
      {id:'basic',nombre:'Plan Básico',categoria:'fiestas',precio:95,imagen:'/test-media/plan.jpg'},
      {id:'premium',nombre:'Plan Premium Recreativo',categoria:'fiestas',precio:115,imagen:'/test-media/face.jpg'},
      {id:'dogs',nombre:'Hot dogs',categoria:'extras',tipoCobro:'unidad',precio:2,cantidadMinima:50,cantidadMaxima:500,cantidadPaso:25,unidadNombre:'hot dog',imagen:'/test-media/snack.jpg'},
      {id:'face',nombre:'Pintacaritas',categoria:'extras',tipoCobro:'hora',precio:40,imagen:'/test-media/face.jpg'},
      {id:'character',nombre:'Personaje temático de prueba',categoria:'personajes',tipoServicio:'personaje',tematica:'Fantasía',precio:80,imagen:'/test-media/face.jpg'}],
    };
    if(theme==='custom')Object.assign(api.temas_web[0],{tipo:'normal',themeVersion:2,colorPrimary:'#7C3AED',colorSecondary:'#E11D48',colorButton:'#123456',colorBg:'#F6F0E7',colorCard:'#FFF0DD',colorText:'#172033',buttonStyle:'solid',gradient:'',decorations:'none',animations:false});
    const errors=[];const requests=[];
    await context.route('**/*',async route=>{
     const url=new URL(route.request().url());requests.push(url.href);
     if(url.origin===origin){
      if(url.pathname.startsWith('/test-media/')){
       const local=path.join(process.env.PREMIUM_MEDIA_PATH||'/tmp/diverty-step4-media',path.basename(url.pathname));
       return route.fulfill({body:fs.readFileSync(fs.existsSync(local)?local:path.join(output,'assets/logo-256.webp')),contentType:fs.existsSync(local)?'image/jpeg':'image/webp'});
      }
      return route.continue();
     }
     if(url.hostname==='firestore.googleapis.com'){
      const [collection,id]=url.pathname.split('/public/data/')[1]?.split('/')||[];const rows=api[collection]||[];
      const doc=row=>({name:url.pathname+'/'+row.id,fields:Object.fromEntries(Object.entries(row).filter(([key])=>key!=='id').map(([key,v])=>[key,encode(v)]))});
      if(id){const row=rows.find(row=>row.id===id);return route.fulfill({status:row?200:404,json:row?doc(row):{error:{status:'NOT_FOUND'}}});}
      return route.fulfill({json:{documents:rows.map(doc)}});
     }
     if(url.hostname==='res.cloudinary.com'&&url.pathname.includes('f_jpg')&&fs.existsSync('/tmp/diverty-step4-media/hero.jpg'))return route.fulfill({body:fs.readFileSync('/tmp/diverty-step4-media/hero.jpg'),contentType:'image/jpeg'});
     return route.abort();
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    const ready=async()=>{await page.waitForFunction(()=>window.catalogLoaded===true);await page.waitForLoadState('networkidle');await page.evaluate(()=>document.fonts.ready);};
    const shot=async name=>{if(artifact){fs.mkdirSync(artifact,{recursive:true});await page.screenshot({path:path.join(artifact,`${theme}-${width}-${name}.png`)});}};
    await page.goto(origin);await ready();await shot('home');
    if(!baseline){
     assert.ok(await page.locator('.hero-content').evaluate(el=>el.getBoundingClientRect().top>=document.querySelector('#headerWrapper').getBoundingClientRect().bottom),'the header must not cover the hero copy');
     if(theme==='custom')assert.equal(await page.locator('.hero-content .season-btn').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(18, 52, 86)');
    }
    assert.equal(await page.locator('#hero-video').count(),1);
    assert.equal(await page.locator('h1').count(),1);
    await page.goto(origin+'/?vista=catalog');await ready();await shot('categories');
    await page.locator('.catalog-category-card[data-target-section="cat_fiestas"]').click();await page.locator('.catalog-tile').first().waitFor();await page.waitForTimeout(120);await shot('services');
    const layout=await page.evaluate(()=>{
     const rect=e=>{const b=e.getBoundingClientRect();return {width:b.width,height:b.height,x:b.x,y:b.y};};
     const card=document.querySelector('.catalog-tile'),body=card.querySelector('.catalog-tile-body'),name=card.querySelector('h3');
     return {theme:document.body.dataset.theme,overflow:document.documentElement.scrollWidth-innerWidth,card:rect(card),radius:getComputedStyle(card).borderRadius,surface:getComputedStyle(body).backgroundColor,text:getComputedStyle(name).color,font:getComputedStyle(name).fontFamily,body:rect(body),heading:rect(document.querySelector('.catalog-grid-heading'))};
    });metrics.push({preset:theme,width,...layout});
    assert.ok(layout.overflow<=1,`${theme}/${width} horizontal overflow`);
    if(!baseline){
     assert.ok(layout.font.includes('Nunito'));
     assert.ok(layout.body.height<190,'a short service name must not create a tall empty panel');
     const photo=await page.locator('.catalog-tile-image-wrap').first().boundingBox();
     assert.ok(Math.abs(photo.width/photo.height-4/3)<.02,'landscape photos keep the catalog compact');
     assert.ok(parseFloat(layout.radius)>=16,'premium cards retain their rounded panel');
     assert.notEqual(layout.surface,layout.text,`${theme}: title and card must have distinct colors`);
     const contrast=await page.locator('.catalog-tile-name').first().evaluate(el=>{
      const rgb=s=>s.match(/[\d.]+/g).map(Number),root=getComputedStyle(document.documentElement).getPropertyValue('--s-bg-color').trim();
      const base=root.slice(1).match(/../g).map(x=>parseInt(x,16));
      const surface=rgb(getComputedStyle(el.parentElement).backgroundColor),a=surface[3]??1;
      const bg=surface.slice(0,3).map((x,i)=>x*a+base[i]*(1-a));
      const luminance=values=>values.map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
      const front=luminance(rgb(getComputedStyle(el).color).slice(0,3)),back=luminance(bg);
      return (Math.max(front,back)+.05)/(Math.min(front,back)+.05);
     });assert.ok(contrast>=4.5,`${theme}: card title contrast ${contrast}`);
     const same=metrics.find(row=>row.width===width&&row.preset==='normal')||metrics.find(row=>row.width===width);
     assert.equal(Math.round(layout.card.width),Math.round(same.card.width),'season must preserve the card width');
     assert.equal(Math.round(layout.body.height),Math.round(same.body.height),'season must preserve the content layout');
    }
    await page.locator('[data-action="open-item-detail"][data-item-id="plan"]').click();await page.locator('.catalog-detail-card').waitFor();await shot('detail');
    if(!baseline&&width<768){
     const compact=await page.evaluate(()=>({header:document.querySelector('#headerWrapper').getBoundingClientRect().bottom,list:document.querySelector('.catalog-detail-includes ul').getBoundingClientRect().height,actions:document.querySelector('.catalog-detail-button-row').getBoundingClientRect().height,top:document.querySelector('.catalog-detail-back').getBoundingClientRect().top,overflow:document.documentElement.scrollWidth-innerWidth}));
     assert.ok(compact.header<=100,'mobile header leaves more space for the catalog');
     assert.ok(compact.top>=compact.header,'the header does not hide the back action');
     assert.ok(compact.list<280,'all nine inclusions remain readable in a compact list');
     assert.ok(compact.actions<=64,'both actions fit together without tall stacked buttons');
     assert.ok(compact.overflow<=1,'detail has no horizontal overflow');
     metrics.at(-1).detail=compact;
    }
    assert.equal(await page.locator('.catalog-detail-price').innerText(),'$150.00');
    await page.locator('[data-action="add-to-cart"][data-item-id="plan"]').click();await page.locator('#cartModal').waitFor({state:'visible'});
    assert.ok((await page.locator('#cartItems').innerText()).includes('Plan Magic'));
    await page.locator('#viewCart').click();
    assert.equal(await page.locator('.catalog-detail-includes li').count(),9);
    assert.deepEqual(errors,[]);assert.equal(requests.some(url=>url.includes('fonts.googleapis.com')),false);
    await context.close();
   }
  }
  if(artifact)fs.writeFileSync(path.join(artifact,'metrics.json'),JSON.stringify(metrics,null,2));
  console.log(`PASS: ${baseline?'baseline':'premium'} catalog layout in ${new Set(metrics.map(m=>m.preset)).size} themes at ${[...new Set(metrics.map(m=>m.width))].join('/')}px, contrast, detail prices, inclusions and cart.`);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
