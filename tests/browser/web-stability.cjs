// Navegador real; Firebase y servicios externos siempre se sustituyen por datos ficticios.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');

const output=path.resolve(__dirname,'../../dist');
const server=http.createServer((req,res)=>{
  const file=path.resolve(output,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(file!==output && !file.startsWith(output+path.sep)){res.writeHead(403);return res.end();}
  const target=file===output?path.join(output,'index.html'):file;
  const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png'};
  fs.readFile(target,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream'});res.end(error?'Not found':data);});
});
const encode=value=>typeof value==='boolean'?{booleanValue:value}:typeof value==='number'?{integerValue:String(value)}:Array.isArray(value)?{arrayValue:{values:value.map(encode)}}:value&&typeof value==='object'?{mapValue:{fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)]))}}:{stringValue:String(value??'')};
const seed=()=>({
  config_web:[{id:'global',capacidadSimultanea:3,capacidadSanta:1,recursosDisponibles:{animadores:3,payasos:1},bannerActive:true,bannerText:'Anuncio de prueba'},{id:'disponibilidad',lista:true},{id:'web_sync',version:'test',versions:{}}],
  temas_web:[{id:'halloween',tipo:'halloween',isDefault:true,colorPrimario:'#ff6600'}],
  categorias_web:[{id:'fiestas',nombre:'Planes de recreación y animación para fiestas infantiles',icono:'party-popper',activo:true,visible:true,orden:1}],
  catalogo_web:[{id:'plan-test',nombre:'Paquete de prueba',descripcion:'Animación 2 horas',precio:100,categoria:'fiestas',destacado:true,serviciosLista:'1 animador\nJuegos',orden:1}],
});
const documentFor=(collection,row)=>({name:`projects/diverty-eventos/databases/(default)/documents/artifacts/diverty-oficial/public/data/${collection}/${row.id}`,fields:Object.fromEntries(Object.entries(row).filter(([k])=>k!=='id').map(([k,v])=>[k,encode(v)]))});
const sdk=`export const initializeApp=()=>({});export const getApps=()=>[];export const getApp=()=>({});export const getFirestore=()=>({});export const getAuth=()=>({currentUser:{uid:'test-user'}});export const signInAnonymously=async()=>({});export const signInWithCustomToken=async()=>({});export const doc=(...args)=>args.slice(1).join('/');export const collection=doc;export const where=(...args)=>args;export const query=(...args)=>args;
export const getDoc=async ref=>{const stored=window.__fakeWrites?.[ref];const isConfig=ref.includes('/config_web/');return {exists:()=>!!stored||isConfig,data:()=>stored||(ref.endsWith('disponibilidad')?{lista:true}:{capacidadSimultanea:3,capacidadSanta:1,recursosDisponibles:{animadores:3,payasos:1}})};};
export const getDocs=async()=>{window.__availabilityReads=(window.__availabilityReads||0)+1;if(window.__holdAvailability){window.__holdAvailability=false;await new Promise(resolve=>window.__releaseAvailability=resolve);}return {docs:window.__occupied?[{id:'web-test-occupied',data:()=>({fecha:'2026-12-24',hora:'18:00',esNavidad:true,recursoNavidad:'Santa'})}]:[]};};
export const setDoc=async()=>{throw new Error('Unexpected write');};export const onSnapshot=()=>()=>{};export const writeBatch=()=>({});export const runTransaction=async(_db,callback)=>{if(!window.__allowBookingWrite)throw new Error('Unexpected write');const writes={};await callback({get:async ref=>{if(Object.keys(writes).length)throw new Error('Read after write');return {exists:()=>!!window.__fakeWrites?.[ref],data:()=>window.__fakeWrites?.[ref]};},set:(ref,data)=>writes[ref]=data});window.__fakeWrites={...window.__fakeWrites,...writes};};`;

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const executablePath=process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
  const browser=await chromium.launch({executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
  const contexts=[];
  const fixture=async({width=392,slowTheme=false,blockedStorage=false,christmas=false,offline=false}={})=>{
    const api=seed();if(christmas)Object.assign(api.catalogo_web[0],{nombre:'Entrega de Santa',esNavidad:true,recursoNavidad:'Santa'});
    let releaseTheme;
    const gate=slowTheme?new Promise(resolve=>releaseTheme=resolve):Promise.resolve();
    const context=await browser.newContext({viewport:{width,height:852},isMobile:width<768,hasTouch:width<768,timezoneId:'America/Panama'});contexts.push(context);
    await context.addInitScript(blocked=>{
      const OriginalDate=Date;
      window.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:['2026-10-06T17:00:00Z']));}};
      const interval=window.setInterval.bind(window);
      window.setInterval=(fn,ms,...args)=>{if(ms===45000)window.__syncTick=fn;return interval(fn,ms,...args);};
      if(blocked){const deny=()=>{throw new DOMException('Storage blocked','SecurityError');};Object.defineProperty(window,'localStorage',{get:deny});Object.defineProperty(window,'sessionStorage',{get:deny});}
    },blockedStorage);
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin===origin)return route.continue();
      if(url.hostname==='firestore.googleapis.com'){
        if(offline)return route.abort();
        const [collection,id]=url.pathname.split('/public/data/')[1]?.split('/')||[];
        if(collection==='temas_web')await gate;
        const rows=api[collection]||[];
        if(id){const row=rows.find(r=>r.id===id);return route.fulfill({status:row?200:404,json:row?documentFor(collection,row):{error:{status:'NOT_FOUND'}}});}
        return route.fulfill({json:{documents:rows.map(row=>documentFor(collection,row))}});
      }
      if(url.hostname==='www.gstatic.com')return route.fulfill({contentType:'text/javascript',body:sdk});
      return route.abort();
    });
    const page=await context.newPage();const errors=[],requests=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
    const ready=async()=>{await page.waitForFunction(()=>window.catalogLoaded===true);await page.waitForLoadState('networkidle');};
    return {api,context,page,errors,requests,ready,releaseTheme};
  };
  const openBooking=async f=>{
    await f.page.goto(origin+'/?plan=plan-test');await f.ready();
    await f.page.locator('[data-action="book-now"][data-item-id="plan-test"]').click();
    await f.page.locator('#bookingForm').waitFor();
    assert.equal(new URL(f.page.url()).searchParams.get('vista'),'booking');
    assert.equal(new URL(f.page.url()).searchParams.has('plan'),false);
  };
  try {
    const cold=await fixture({slowTheme:true});await cold.page.goto(origin,{waitUntil:'domcontentloaded'});
    await cold.page.waitForTimeout(1100);
    assert.equal(await cold.page.locator('html').evaluate(e=>e.classList.contains('diverty-booting')),true);
    cold.releaseTheme();await cold.ready();
    assert.equal(await cold.page.locator('body').getAttribute('data-theme'),'halloween');
    assert.equal(await cold.page.locator('#themeBootLoader').count(),0);
    assert.equal(cold.requests.some(url=>url.includes('accounts:signUp')||url.includes('unpkg.com')),false);
    const cached=cold.page;await cached.route('**/assets/js/diverty-app*',r=>r.abort());
    await cached.reload({waitUntil:'domcontentloaded'});
    assert.equal(await cached.locator('body').getAttribute('data-theme'),'halloween');
    assert.equal(await cached.locator('html').evaluate(e=>getComputedStyle(e).getPropertyValue('--s-primary').trim()),'#ff6600');
    assert.equal(await cached.locator('html').evaluate(e=>e.classList.contains('diverty-booting')),false);
    assert.deepEqual(cold.errors,[]);
    console.log('PASS: tema lento, colores antes de ejecutar el módulo e iconos locales.');

    const desktop=await fixture({width:1280});await desktop.page.goto(origin+'/?vista=catalog');await desktop.ready();
    const desktopLayout=await desktop.page.evaluate(()=>({nav:document.querySelector('#desktopNav').getBoundingClientRect().toJSON(),logo:document.querySelector('#mainHeaderLogo').getBoundingClientRect().toJSON()}));
    assert.ok(desktopLayout.nav.top>=desktopLayout.logo.bottom);
    assert.ok(desktopLayout.nav.right<=1280);
    assert.deepEqual(desktop.errors,[]);console.log('PASS: menú de escritorio sin solaparse con el logo.');

    const cart=await fixture();await cart.page.goto(origin+'/?plan=plan-test');await cart.ready();
    await cart.page.locator('[data-action="add-to-cart"][data-item-id="plan-test"]').first().click();
    await cart.page.locator('#cartModal [data-action="navigate-from-modal"]').click();
    await cart.page.locator('#bookingForm').waitFor();await cart.page.waitForTimeout(150);
    assert.equal(new URL(cart.page.url()).searchParams.get('vista'),'booking');
    assert.equal(await cart.page.locator('#cartModal').evaluate(e=>e.classList.contains('show')),false);
    assert.deepEqual(cart.errors,[]);console.log('PASS: continuar desde el carrito conserva la ruta de reserva.');

    for(const width of [320,392,768]){
      const f=await fixture({width});await openBooking(f);
      await f.page.locator('[name="name"]').fill('Cliente ficticio');await f.page.locator('[name="email"]').fill('prueba@example.com');await f.page.locator('[name="phone"]').fill('60000000');
      await f.page.locator('#btn-next').click();await f.page.locator('#step-2.active').waitFor();
      await f.page.locator('#mobileToggle').click();await f.page.waitForTimeout(450);
      assert.equal(await f.page.locator('#mobileToggle svg').count(),1);
      const layout=await f.page.locator('#mobileMenu').evaluate(menu=>({rect:menu.getBoundingClientRect().toJSON(),headerBottom:document.querySelector('#headerWrapper').getBoundingClientRect().bottom,buttons:[...menu.querySelectorAll('.mobile-nav-link')].map(e=>e.getBoundingClientRect().toJSON())}));
      assert.ok(layout.rect.top>=layout.headerBottom);assert.ok(layout.rect.bottom<=852);
      for(const button of layout.buttons)assert.ok(button.right<layout.rect.right-5);
      await f.page.locator('#mobileToggle').click();await f.page.waitForTimeout(100);assert.equal(await f.page.locator('#step-2.active').count(),1);
      await f.page.locator('#mobileToggle').click();await f.page.goBack();await f.page.waitForTimeout(100);assert.equal(await f.page.locator('#step-2.active').count(),1);
      await f.page.locator('#viewCart').click();await f.page.locator('#viewCart').click();await f.page.waitForTimeout(100);assert.equal(await f.page.locator('#step-2.active').count(),1);
      await f.page.locator('#viewCart').click();await f.page.goBack();await f.page.waitForTimeout(100);assert.equal(await f.page.locator('#step-2.active').count(),1);
      await f.page.locator('#bookingForm').evaluate(form=>form.dataset.original='yes');await f.page.locator('[name="eventType"]').focus();
      f.api.config_web.find(r=>r.id==='web_sync').version='test2';f.api.temas_web[0].colorPrimario='#ee7700';
      await f.page.evaluate(()=>window.__syncTick());await f.page.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--s-primary').trim()==='#ee7700');
      assert.equal(await f.page.locator('#bookingForm').getAttribute('data-original'),'yes');assert.equal(await f.page.locator('#step-2.active').count(),1);
      assert.equal(await f.page.locator('[name="name"]').inputValue(),'Cliente ficticio');assert.equal(await f.page.evaluate(()=>document.activeElement.name),'eventType');
      f.api.config_web.find(r=>r.id==='web_sync').versions={catalogo_web:2};f.api.catalogo_web[0].descripcion='Contenido nuevo';await f.page.evaluate(()=>window.__syncTick());await f.page.waitForTimeout(500);
      assert.equal(await f.page.locator('#bookingForm').getAttribute('data-original'),'yes');
      await f.page.locator('#mobileToggle').click();await f.page.locator('#mobileGallery').click();await f.page.waitForTimeout(150);
      assert.equal(new URL(f.page.url()).searchParams.get('vista'),'gallery');await f.page.goBack();await f.page.locator('#step-2.active').waitFor();
      assert.equal(await f.page.locator('[name="name"]').inputValue(),'Cliente ficticio');
      await f.page.locator('#booking-open-date-picker').click();await f.page.locator('[data-calendar-date="2026-10-15"]').click();await f.page.locator('[name="time"]').selectOption('10:00');
      await f.page.evaluate(()=>window.__holdAvailability=true);await f.page.locator('#btn-next').click();await f.page.waitForFunction(()=>typeof window.__releaseAvailability==='function');
      assert.equal(await f.page.locator('#btn-next').isDisabled(),true);await f.page.evaluate(()=>document.querySelector('#btn-next').click());
      await f.page.evaluate(()=>window.__releaseAvailability());await f.page.locator('#step-3.active').waitFor();
      await f.page.goBack();await f.page.locator('#step-2.active').waitFor();assert.equal(await f.page.locator('[name="date"]').inputValue(),'2026-10-15');
      assert.deepEqual(f.errors,[]);console.log(`PASS ${width}px: menú, carrito, Atrás, sincronización, campos y doble toque.`);
    }

    const remote=await fixture({christmas:true,width:320});await openBooking(remote);
    assert.equal(await remote.page.locator('#christmas-manual-address').isVisible(),true);
    assert.equal(await remote.page.locator('[name="christmasReference"]').isVisible(),true);
    await remote.page.locator('#christmas-manual-address').fill('Casa de mi hermana, Brisas del Golf, casa 18');
    await remote.page.locator('[data-location-continue]').click();await remote.page.locator('#step-2.active').waitFor();
    await remote.page.locator('#btn-prev').click();await remote.page.locator('#step-1.active').waitFor();
    assert.equal(await remote.page.locator('#christmas-manual-address').inputValue(),'Casa de mi hermana, Brisas del Golf, casa 18');
    assert.equal(await remote.page.locator('[name="address"]').inputValue(),'Casa de mi hermana, Brisas del Golf, casa 18');
    assert.equal(await remote.page.locator('#christmas-manual-address').isVisible(),true);
    if(process.env.BROWSER_ARTIFACT_DIR){
      fs.mkdirSync(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
      await remote.page.locator('#bookingForm').screenshot({path:path.join(process.env.BROWSER_ARTIFACT_DIR,'location.png')});
    }
    await remote.page.locator('.location-extra summary').click();
    await remote.page.locator('#christmas-manual-address').fill('https://www.google.com/maps?q=9.0123,-79.5012');
    await remote.page.locator('#christmas-search-address').click();
    await remote.page.waitForFunction(()=>document.querySelector('#christmas-coverage-result').textContent.includes('Transporte adicional'));
    await remote.page.locator('#christmas-manual-address').fill('Nueva dirección sin pin');
    await remote.page.locator('[data-location-continue]').click();await remote.page.locator('#step-2.active').waitFor();
    assert.equal(await remote.page.locator('[name="address"]').inputValue(),'Nueva dirección sin pin');
    assert.deepEqual(remote.errors,[]);
    console.log('PASS: dirección remota sin buscar, referencia opcional, Atrás, enlace Maps y cambio de dirección.');

    const santa=await fixture({christmas:true});await openBooking(santa);
    await santa.page.locator('[data-christmas-location-mode="manual"]').click();await santa.page.locator('#christmas-manual-address').fill('PH Prueba');await santa.page.locator('[name="christmasReference"]').fill('Entrada ficticia');
    await santa.page.locator('[data-location-continue]').click();await santa.page.locator('#step-2.active').waitFor();await santa.page.locator('[data-christmas-date-choice="2026-12-24"]').click();
    await santa.page.locator('[data-christmas-time="18:00"]').click();const dialog=santa.page.getByRole('dialog',{name:'Confirmar horario 🎅'});await dialog.waitFor();
    await santa.page.evaluate(()=>window.__occupied=true);await dialog.getByRole('button',{name:'Seguir',exact:true}).click();await santa.page.waitForFunction(()=>!document.querySelector('#christmas-time-confirmation'));
    assert.equal(await santa.page.locator('#step-2.active').count(),1);assert.equal(await santa.page.locator('[data-christmas-time="18:00"]').isDisabled(),true);
    await santa.page.evaluate(()=>window.__occupied=false);await santa.page.locator('[data-christmas-date-choice="2026-12-25"]').click();await santa.page.locator('[data-christmas-time="10:00"]').click();
    await dialog.getByRole('button',{name:'Cambiar hora'}).click();await santa.page.waitForFunction(()=>!document.querySelector('#christmas-time-confirmation'));
    await santa.page.locator('[data-christmas-time="10:00"]').click();await dialog.getByRole('button',{name:'Seguir',exact:true}).click();await santa.page.locator('#step-3.active').waitFor();
    assert.deepEqual(santa.errors,[]);console.log('PASS: agenda de Navidad, confirmación y cupo ocupado al continuar.');
    await santa.page.locator('#btn-prev').click();await santa.page.locator('#step-2.active').waitFor();
    await santa.page.locator('[data-christmas-time="10:00"]').waitFor();assert.equal(await santa.page.locator('[name="date"]').inputValue(),'2026-12-25');
    await santa.page.goForward();await santa.page.locator('#step-3.active').waitFor();
    await santa.page.goBack();await santa.page.locator('#step-2.active').waitFor();await santa.page.locator('[data-christmas-time="10:00"]').click();
    await dialog.getByRole('button',{name:'Seguir',exact:true}).click();await santa.page.locator('#step-3.active').waitFor();
    assert.deepEqual(santa.errors,[]);console.log('PASS: Atrás/Adelante de Navidad conservan fecha, horas y formulario.');

    for(const christmas of [false,true]){
      const gps=await fixture({christmas});await gps.context.grantPermissions(['geolocation'],{origin});
      await gps.context.setGeolocation({latitude:9.0123,longitude:-79.5012,accuracy:10});await openBooking(gps);
      if(!christmas){
        await gps.page.locator('[name="name"]').fill('Cliente ficticio');await gps.page.locator('[name="email"]').fill('prueba@example.com');await gps.page.locator('[name="phone"]').fill('60000000');
        await gps.page.locator('#btn-next').click();await gps.page.locator('#step-2.active').waitFor();
        await gps.page.locator('#booking-open-date-picker').click();await gps.page.locator('[data-calendar-date="2026-10-15"]').click();await gps.page.locator('[name="time"]').selectOption('10:00');
        await gps.page.locator('#btn-next').click();await gps.page.locator('#step-3.active').waitFor();
      }
      const prefix=christmas?'christmas':'normal';
      await gps.page.locator(`[data-${prefix}-location-mode="gps"]`).click();
      await gps.page.waitForFunction(()=>document.querySelector('[name="address"]').value.startsWith('https://www.google.com/maps?q='));
      assert.equal(await gps.page.locator(`[name="${prefix}Reference"]`).isVisible(),true);
      await gps.page.locator('[data-location-continue]').click();
      assert.match(await gps.page.locator('#toast').innerText(), /barriada, PH o salón/);
      assert.equal(await gps.page.locator(christmas?'#step-1.active':'#step-3.active').count(),1);
      await gps.page.locator(`[name="${prefix}Reference"]`).fill('PH Las Palmeras, salón social');
      if(christmas){await gps.page.locator('[data-location-continue]').click();await gps.page.locator('#step-2.active').waitFor();await gps.page.locator('#btn-prev').click();await gps.page.locator('#step-1.active').waitFor();}
      await gps.page.locator(`[data-${prefix}-location-mode="manual"]`).click();
      assert.equal(await gps.page.locator('[name="address"]').inputValue(),'');
      await gps.page.locator(`#${prefix}-manual-address`).fill('Dirección nueva sin estar allí');
      assert.equal(await gps.page.locator('[name="address"]').inputValue(),'Dirección nueva sin estar allí');
      assert.deepEqual(gps.errors,[]);
      console.log(`PASS: GPS ${prefix}, dirección remota y limpieza del punto anterior.`);
    }

    for(const christmas of [false,true]){
      const f=await fixture({christmas});await openBooking(f);
      const contact=async()=>{await f.page.locator('[name="name"]').fill('Cliente remoto ficticio');await f.page.locator('[name="email"]').fill('prueba@example.com');await f.page.locator('[name="phone"]').fill('60000000');};
      if(christmas){
        await f.page.locator('#christmas-manual-address').fill('PH que no aparece, Brisas del Golf');await f.page.locator('[data-location-continue]').click();await f.page.locator('#step-2.active').waitFor();
        await f.page.locator('[data-christmas-date-choice="2026-12-24"]').click();await f.page.locator('[data-christmas-time="18:00"]').click();
        await f.page.getByRole('dialog').getByRole('button',{name:'Seguir',exact:true}).click();await f.page.locator('#step-3.active').waitFor();await contact();
      }else{
        await contact();await f.page.locator('#btn-next').click();await f.page.locator('#step-2.active').waitFor();
        await f.page.locator('#booking-open-date-picker').click();await f.page.locator('[data-calendar-date="2026-10-15"]').click();await f.page.locator('[name="time"]').selectOption('10:00');await f.page.locator('#btn-next').click();
        await f.page.locator('#step-3.active').waitFor();await f.page.locator('#normal-manual-address').fill('PH que no aparece, Brisas del Golf');
      }
      await f.page.evaluate(()=>window.__allowBookingWrite=true);
      await f.page.locator(christmas?'#btn-submit':'[data-location-continue]').click();
      await f.page.locator('[data-review-send]').click();
      await f.page.waitForFunction(()=>document.querySelector('#infoModal').classList.contains('show'));
      assert.deepEqual(f.errors,[]);
      await f.page.locator('#modalMessage').waitFor({state:'visible'});
      assert.match(await f.page.locator('#modalMessage').innerText(), /pendiente de cotizar transporte/);
      if(process.env.BROWSER_ARTIFACT_DIR) await f.page.screenshot({path:path.join(process.env.BROWSER_ARTIFACT_DIR,`transport-${christmas?'christmas':'normal'}.png`)});
      const saved=await f.page.evaluate(()=>Object.values(window.__fakeWrites).find(x=>x.ownerUid && x.direccion));
      assert.equal(saved.direccion,'PH que no aparece, Brisas del Golf');assert.equal(saved.referenciaLugar,'');assert.equal(saved.estado,'Pendiente');assert.equal('lat' in saved,false);
      assert.equal(saved.ubicacion,christmas?'Ubicación por confirmar':'Ubicación por revisar');
      assert.deepEqual(f.errors,[]);console.log(`PASS: envío completo ${christmas?'Navidad':'normal'} con dirección remota y Firebase simulado.`);
    }

    const denied=await fixture({blockedStorage:true});await denied.page.goto(origin);await denied.ready();assert.equal(await denied.page.locator('#themeBootLoader').count(),0);assert.deepEqual(denied.errors,[]);
    const offline=await fixture({offline:true});await offline.page.goto(origin);await offline.page.waitForFunction(()=>!document.documentElement.classList.contains('diverty-booting'));assert.deepEqual(offline.errors,[]);
    console.log('PASS: almacenamiento bloqueado y carga sin conexión sin bloquear la portada.');
  } finally {
    await Promise.all(contexts.map(context=>context.close()));await browser.close();await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
