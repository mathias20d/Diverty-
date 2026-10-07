// Decode a small H.264 fixture in Chromium; remote APIs and analytics stay blocked.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'../../dist');
const fixture=fs.readFileSync(path.resolve(__dirname,'../fixtures/hero-playback.mp4'));
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const mobileSource=html.match(/data-src-mobile="([^"]+)"/)[1];
const desktopSource=html.match(/data-src="([^"]+\.mp4)"/)[1];
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 fs.readFile(file,(err,body)=>{res.writeHead(err?404:200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(err?'Not found':body);});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  for(const width of [392,1280]){
   const context=await browser.newContext({viewport:{width,height:852},isMobile:width<768});
   const mediaRequests=[];
   await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.pathname.endsWith('.mp4')){mediaRequests.push(url.href);return route.fulfill({contentType:'video/mp4',body:fixture});}
    // Leave the initial homepage alive even when the catalog/remote theme cannot load.
    if(url.origin===origin&&!url.pathname.includes('diverty-app-'))return route.continue();
    return route.abort();
   });
   await context.addInitScript(()=>{
    window.__heroMetrics={};
    new PerformanceObserver(list=>{for(const e of list.getEntries())if(e.name==='first-contentful-paint')window.__heroMetrics.paint=e.startTime;}).observe({type:'paint',buffered:true});
    document.addEventListener('playing',e=>{if(e.target.id==='hero-video'&&!window.__heroMetrics.playing)window.__heroMetrics.playing=performance.now();},true);
   });
   const page=await context.newPage();await page.goto(origin,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector('#hero-video')?.currentTime>.1,{},{timeout:2500});
   const metrics=await page.evaluate(()=>({...window.__heroMetrics,muted:document.querySelector('#hero-video').muted,inline:document.querySelector('#hero-video').playsInline,src:document.querySelector('#hero-video source').src}));
   assert.ok(metrics.paint<metrics.playing,'paint the homepage before playing the video');
   assert.ok(metrics.playing<2500,'no eight-second delay, even with the main module unavailable');
   assert.equal(metrics.src,width<768?mobileSource:desktopSource);assert.equal(metrics.muted,true);assert.equal(metrics.inline,true);
   await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
   await page.waitForFunction(()=>document.querySelector('#hero-video').paused);
   await page.evaluate(()=>window.scrollTo(0,0));
   await page.waitForFunction(()=>!document.querySelector('#hero-video').paused);
   // A newly rendered homepage must restart without the old eight-second wait.
   await page.evaluate(({mobileSource,desktopSource})=>{
    const old=document.querySelector('#hero-video'),next=old.cloneNode(true),source=next.querySelector('source');
    old.pause();source.removeAttribute('src');source.dataset.src=desktopSource;source.dataset.srcMobile=mobileSource;
    next.preload='none';old.replaceWith(next);window.__divertyScheduleHero();
   },{mobileSource,desktopSource});
   await page.waitForFunction(()=>document.querySelector('#hero-video').currentTime>.1,{},{timeout:2000});
   assert.ok(mediaRequests.length>=2);console.log(`PASS: ${width}px H.264 playback ${Math.round(metrics.playing)}ms; responsive source, pause/resume and recreated homepage.`);
   await context.close();
  }
  const context=await browser.newContext({viewport:{width:392,height:852}});
  await context.addInitScript(()=>Object.defineProperty(navigator,'connection',{value:{saveData:true}}));
  let requested=false;
  await context.route('**/*',r=>{const url=new URL(r.request().url());if(url.pathname.endsWith('.mp4')){requested=true;return r.abort();}return url.origin===origin&&!url.pathname.includes('diverty-app-')?r.continue():r.abort();});
  const page=await context.newPage();await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForTimeout(500);
  assert.equal(requested,false);assert.equal(await page.locator('#hero-video source').getAttribute('src'),null);
  assert.ok(await page.locator('#hero-video').getAttribute('poster'));
  await context.close();console.log('PASS: data saver keeps the poster and avoids video downloads.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
