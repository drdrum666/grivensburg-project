/* Fixed compositions with an aspect-matched stage. Only the whole stage is zoomed. */
(function(w){
 'use strict';
 function create(){
  const root=document.createElement('div');root.id='gm-screen';
  const canvas=document.createElement('div');canvas.id='gm-canvas';
  for(const selector of ['.main-header','.battle-hud-container','.content-wrapper'])canvas.append(document.querySelector(selector));
  root.append(canvas);
  // Move each surface once, before any embedded application is loaded. Resizing never reparents an iframe.
  for(const el of [...document.body.children])if(!['SCRIPT','STYLE','LINK'].includes(el.tagName)&&el.id!=='login-screen'&&!el.classList.contains('gb-personal-panel'))root.append(el);
  document.body.append(root);
  const nav=document.createElement('nav');nav.id='gm-mobile-nav';nav.setAttribute('aria-label','Экраны ведущего');
  nav.innerHTML='<strong>ГРИВЕНСБУРГ</strong><button data-mode="pc" onclick="setGmView(\'pc\')">Обзор ПК</button><button data-mode="dashboard" onclick="setGmView(\'dashboard\')">Дашборд</button><button data-mode="story" onclick="setGmView(\'story\')">История</button><button data-mode="battle" onclick="setGmView(\'battle\')">Бой</button><button onclick="openGmClient()">Клиент</button><span class="gm-nav-space"></span><button onclick="gmDisplayFullscreen()" data-fullscreen>Полный экран</button><button onclick="gmResetZoom()">Масштаб 1:1</button><button onclick="openGmTools()">Меню</button><button onclick="setGmDevice(\'pc\')">Режим ПК</button>';
  root.append(nav);
  const hint=document.createElement('div');hint.id='gm-rotate-hint';hint.textContent='Поверните телефон горизонтально · клиент открывается вертикально';document.body.append(hint);
  const safe=document.createElement('div');safe.style.cssText='position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';document.body.append(safe);
  let device='pc',view='pc',zoom=1,panX=0,panY=0,fit=1,sw=0,sh=0,stageW=1280,stageH=720,left=0,top=0,gesture=null,suppressUntil=0;
  const pointers=new Map();
  function clampPan(){const extraW=Math.max(0,stageW*fit*zoom-sw),extraH=Math.max(0,stageH*fit*zoom-sh);panX=Math.max(-extraW/2,Math.min(extraW/2,panX));panY=Math.max(-extraH/2,Math.min(extraH/2,panY));}
  function resize(){
   const vv=w.visualViewport,c=getComputedStyle(safe);left=parseFloat(c.paddingLeft)||0;top=parseFloat(c.paddingTop)||0;
   sw=Math.max(1,(vv?vv.width*vv.scale:innerWidth)-left-(parseFloat(c.paddingRight)||0));sh=Math.max(1,(vv?vv.height*vv.scale:innerHeight)-top-(parseFloat(c.paddingBottom)||0));
   stageW=Math.max(1280,720*sw/sh);stageH=stageW*sh/sw;
   const contentW=stageW-96,pcFit=Math.min(contentW/1920,stageH/1080);
   const vars={'--gm-stage-width':stageW+'px','--gm-stage-height':stageH+'px','--gm-content-width':contentW+'px','--gm-content-vw':contentW/100+'px',
    '--gm-dashboard-height':(stageH-192)+'px','--gm-dashboard-vh':(stageH-192)/100+'px',
    '--gm-pc-width':contentW/pcFit+'px','--gm-pc-height':stageH/pcFit+'px','--gm-pc-scale':pcFit,
    '--gm-pc-vw':contentW/pcFit/100+'px','--gm-pc-vh':stageH/pcFit/100+'px'};
   for(const[k,v]of Object.entries(vars))root.style.setProperty(k,v);
   document.documentElement.style.setProperty('--gm-vw',device==='phone'?stageW/100+'px':'1vw');
   document.documentElement.style.setProperty('--gm-vh',device==='phone'?stageH/100+'px':'1vh');
   if(device==='phone'){
    fit=Math.min(sw/stageW,sh/stageH);clampPan();
    root.style.transform=`translate(${left+(sw-stageW*fit*zoom)/2+panX}px,${top+(sh-stageH*fit*zoom)/2+panY}px) scale(${fit*zoom})`;
   }else root.style.transform='';
   hint.hidden=device!=='phone'||sw>=sh||document.body.classList.contains('gm-client-open');
  }
  function reset(){zoom=1;panX=panY=0;gesture=null;pointers.clear();resize();}
  function setView(next){view=next;root.dataset.view=next;document.body.dataset.gmView=next;nav.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('on',b.dataset.mode===view);b.setAttribute('aria-pressed',b.dataset.mode===view)});reset();}
  function setDevice(next){device=next==='phone'?'phone':'pc';document.body.classList.toggle('gm-phone',device==='phone');document.body.classList.toggle('gm-desktop',device==='pc');document.querySelectorAll('[data-device]').forEach(b=>{b.classList.toggle('on',b.dataset.device===device);b.setAttribute('aria-pressed',b.dataset.device===device)});try{localStorage.setItem('gb_gm_device_v2',device)}catch{}setView('pc');}
  function point(e){return{x:e.clientX-left,y:e.clientY-top};}
  function pair(){const [a,b]=[...pointers.values()];return{d:Math.hypot(b.x-a.x,b.y-a.y),x:(a.x+b.x)/2,y:(a.y+b.y)/2};}
  function scrollTarget(el){
   for(let n=el;n&&n!==root;n=n.parentElement){const c=getComputedStyle(n),x=/auto|scroll/.test(c.overflowX)&&n.scrollWidth>n.clientWidth+2,y=/auto|scroll/.test(c.overflowY)&&n.scrollHeight>n.clientHeight+2;if(x||y)return{el:n,x,y,left:n.scrollLeft,top:n.scrollTop};}
   return null;
  }
  root.addEventListener('pointerdown',e=>{
   if(device!=='phone'||view!=='pc')return;
   pointers.set(e.pointerId,point(e));
   if(pointers.size===2){const p=pair();gesture={...p,zoom,panX,panY};suppressUntil=Date.now()+600;e.preventDefault();}
   else if(pointers.size===1){gesture={single:true,...point(e),panX,panY,moved:false,scroll:scrollTarget(e.target)};}
  });
  root.addEventListener('pointermove',e=>{
   if(!pointers.has(e.pointerId)||!gesture)return;
   pointers.set(e.pointerId,point(e));
   if(pointers.size>=2&&!gesture.single){
    const p=pair();zoom=Math.max(1,Math.min(4,gesture.zoom*p.d/Math.max(1,gesture.d)));
    const ratio=zoom/gesture.zoom;
    panX=(gesture.panX-(gesture.x-sw/2))*ratio+(p.x-sw/2);panY=(gesture.panY-(gesture.y-sh/2))*ratio+(p.y-sh/2);
    suppressUntil=Date.now()+600;resize();e.preventDefault();
   }else if(gesture.single){
    const dx=e.clientX-left-gesture.x,dy=e.clientY-top-gesture.y,sc=gesture.scroll;
    if(gesture.moved||Math.hypot(dx,dy)>7){
     if(sc&&((sc.y&&Math.abs(dy)>=Math.abs(dx))||(sc.x&&Math.abs(dx)>Math.abs(dy)))){sc.el.scrollTop=sc.top-dy/(fit*zoom);sc.el.scrollLeft=sc.left-dx/(fit*zoom);gesture.moved=true;}
     else if(zoom>1){gesture.moved=true;panX=gesture.panX+dx;panY=gesture.panY+dy;resize();}
     if(gesture.moved){suppressUntil=Date.now()+600;e.preventDefault();}
    }
   }
  });
  function end(e){pointers.delete(e.pointerId);if(gesture&&!gesture.single)suppressUntil=Date.now()+600;gesture=null;}
  w.addEventListener('pointerup',end);w.addEventListener('pointercancel',end);
  root.addEventListener('click',e=>{if(Date.now()<suppressUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
  root.addEventListener('wheel',e=>{if(device==='phone'&&view==='pc'&&(e.ctrlKey||e.metaKey)){e.preventDefault();zoom=Math.max(1,Math.min(4,zoom*Math.exp(-e.deltaY*.006)));resize();}},{passive:false});
  w.addEventListener('resize',resize);w.visualViewport?.addEventListener('resize',resize);w.visualViewport?.addEventListener('scroll',resize);
  let preferred;try{preferred=localStorage.getItem('gb_gm_device_v2')}catch{}
  setDevice(preferred||((navigator.maxTouchPoints>0&&matchMedia('(pointer:coarse)').matches)?'phone':'pc'));
  return{root,canvas,setDevice,setView,reset,resize,get device(){return device},get view(){return view}};
 }
 w.GrivensburgGmLayout={create};
})(window);
