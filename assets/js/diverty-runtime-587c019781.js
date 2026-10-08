/* ===== diverty-boot-failsafe ===== */
// Seguro: nunca dejar la interfaz bloqueada por una conexión lenta.
if (!window.__divertyFinishBoot) setTimeout(function(){document.documentElement.classList.remove('diverty-booting');document.getElementById('themeBootLoader')?.remove();},4000);

/* ===== diverty-home-swipe-guard ===== */
document.addEventListener('dragstart', function(e){ if(e.target.closest && e.target.closest('.home-swipe-track')) e.preventDefault(); }, {passive:false});

/* ===== diverty-benefits-scroll-js-v5 ===== */
(function(){
    if(window.__divertyBenefitsScrollFix) return;
    window.__divertyBenefitsScrollFix = true;

    document.addEventListener('toggle', function(e){
        const details = e.target;
        if(!details || !details.classList || !details.classList.contains('featured-offer-benefits')) return;

        const track = details.closest('.home-featured-track');
        if(!track) return;

        if(details.open){
            track.classList.add('benefits-expanded');
        } else if(!track.querySelector('.featured-offer-benefits[open]')){
            track.classList.remove('benefits-expanded');
        }
    }, true);
})();

/* ===== diverty-premium-performance-runtime-2 ===== */
(function(){
  'use strict';
  if(window.__divertyPremiumPerf2) return;
  window.__divertyPremiumPerf2=true;

  const root=document.documentElement;
  const conn=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  const lowMemory=typeof navigator.deviceMemory==='number' && navigator.deviceMemory<=4;
  const lowCPU=typeof navigator.hardwareConcurrency==='number' && navigator.hardwareConcurrency<=4;
  const saveData=!!(conn&&conn.saveData);
  if(saveData||lowMemory||lowCPU) root.classList.add('dv-lite');

  function tuneImage(img){
    if(!img||img.dataset.dvPerf2==='1') return;
    img.dataset.dvPerf2='1';
    img.decoding='async';
    const critical=!!img.closest('#mainHeader,#headerWrapper,#hero-section-identifier,#themeBootLoader') || img.getAttribute('loading')==='eager' || img.getAttribute('fetchpriority')==='high';
    if(critical){
      img.loading='eager';
      try{img.fetchPriority='high';}catch(_){}
    }else{
      if(!img.hasAttribute('loading'))img.loading='lazy';
      try{if(!img.hasAttribute('fetchpriority'))img.fetchPriority='low';}catch(_){}
    }
  }
  document.querySelectorAll('img').forEach(tuneImage);

  const main=document.getElementById('mainContent');
  if(main&&'MutationObserver' in window){
    const mo=new MutationObserver(records=>{
      for(const r of records){
        for(const n of r.addedNodes){
          if(n.nodeType!==1) continue;
          if(n.tagName==='IMG') tuneImage(n);
          else if(n.querySelectorAll) n.querySelectorAll('img').forEach(tuneImage);
        }
      }
    });
    mo.observe(main,{childList:true,subtree:true});
  }

  const video=document.getElementById('hero-video');
  if(video){
    if(saveData) video.preload='none';
    if('IntersectionObserver' in window){
      const io=new IntersectionObserver(entries=>{
        const e=entries[0]; if(!e) return;
        const blocked=document.hidden||document.body.classList.contains('cart-open')||document.body.classList.contains('menu-drawer-open');
        if(!e.isIntersecting||blocked){ if(!video.paused) video.pause(); }
        else if(video.paused&&!saveData){ window.__divertyScheduleHero?.(); }
      },{rootMargin:'100px 0px',threshold:.01});
      io.observe(video);
    }
  }

  document.addEventListener('visibilitychange',()=>{
    root.classList.toggle('dv-page-hidden',document.hidden);
    if(document.hidden&&video&&!video.paused) video.pause();
  },{passive:true});

})();

/* ===== diverty-mobile-app-feel-runtime-v1 ===== */
(function(){
 'use strict';
 if(window.__dvMobileFeelV1) return; window.__dvMobileFeelV1=true;
 // Evita doble toque accidental en acciones submit sin bloquear navegación normal.
 document.addEventListener('click', function(e){
   const b=e.target.closest('button[type="submit"]');
   if(!b || b.disabled) return;
   b.classList.add('dv-touch-confirm');
   setTimeout(()=>b.classList.remove('dv-touch-confirm'),220);
 }, {passive:true});
 // Al abrir un modal, evita conservar una posición de scroll extraña dentro del panel.
 const obs=new MutationObserver(function(records){
   for(const r of records){
     if(r.type!=='attributes') continue;
     const m=r.target;
     if(m.classList && m.classList.contains('modal-backdrop') && m.classList.contains('show')){
       const c=m.querySelector('.modal-content');
       if(c && c.scrollTop>24) requestAnimationFrame(()=>{c.scrollTop=0;});
     }
   }
 });
 document.querySelectorAll('.modal-backdrop').forEach(m=>obs.observe(m,{attributes:true,attributeFilter:['class']}));
})();
