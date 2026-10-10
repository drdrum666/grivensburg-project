/* Persistent embedded applications with an ordinary Back/Close lifecycle. */
(function(w){
 'use strict';
 const panels=new Map(),visits=new Map();let active=[];
 const marker='gbPanels',session='panel_'+Math.random().toString(36).slice(2);
 function historyState(ids){return{...(history.state||{}),[marker]:{session,ids,visits:Object.fromEntries(ids.map(id=>[id,visits.get(id)]))}}}
 function apply(ids){
  const previous=active;active=ids.filter(id=>panels.has(id));
  for(const[id,p]of panels){const opened=active.includes(id);p.el.hidden=!opened;if(opened)p.el.style.zIndex=String(8500+active.indexOf(id)*10);p.el.classList.toggle('open',opened);if(previous.includes(id)&&!opened)p.onClose?.();}
 }
 function open(id){if(!panels.has(id)||active.includes(id))return;visits.set(id,Math.random().toString(36).slice(2));const next=[...active,id];try{history.pushState(historyState(next),'')}catch{}apply(next)}
 function close(id){if(!active.includes(id))return;
  visits.delete(id);const next=active.filter(x=>x!==id);
  // Close immediately even when the last joint-history entry belongs to a child iframe.
  try{history.replaceState(historyState(next),'')}catch{}apply(next);
 }
 w.addEventListener('popstate',e=>{const s=e.state?.[marker];apply(s?.session===session?s.ids.filter(id=>visits.has(id)&&s.visits?.[id]===visits.get(id)):[])});
 w.addEventListener('keydown',e=>{if(e.key==='Escape'&&active.length&&!document.querySelector('.modal.open')){close(active.at(-1));e.preventDefault()}});
 function register(id,el,onClose){panels.set(id,{el,onClose});el.hidden=true;return{id,el,open:()=>open(id),close:()=>close(id)}}
 function appUrl(file,params={}){
  const local=new URLSearchParams(location.search).get('apps')==='local';
  const base=local?location.href:'https://drdrum666.github.io/grivensburg-project/';
  const u=new URL(file,base);u.searchParams.set('build','20261010-fix16');for(const[k,v]of Object.entries(params))if(v!=null)u.searchParams.set(k,String(v));
  if(local)u.searchParams.set('apps','local');else u.searchParams.set('assets','online');return u.href;
 }
 function create(id,title,onClose){
  const el=document.createElement('section');el.className='gb-app-panel';el.setAttribute('aria-label',title);
  const bar=document.createElement('header'),name=document.createElement('strong'),button=document.createElement('button');name.textContent=title;button.type='button';button.textContent='✕ Назад';
  const frame=document.createElement('iframe');frame.title=title;frame.allow='autoplay; fullscreen';
  bar.append(name,button);el.append(bar,frame);document.body.append(el);const p=register(id,el,onClose);button.onclick=p.close;
  return{...p,frame,load(url){if(frame.getAttribute('src')!==url)frame.src=url}};
 }
 const style=document.createElement('style');style.textContent='.gb-app-panel{position:fixed;inset:0;z-index:8500;display:flex;flex-direction:column;background:#111;color:#ead3a3}.gb-app-panel[hidden],#stream-view[hidden],#streamerModal[hidden]{display:none!important}.gb-app-panel>header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px max(8px,env(safe-area-inset-right)) 6px max(8px,env(safe-area-inset-left));background:#18130e;border-bottom:1px solid #896c37;flex:none}.gb-app-panel>header button{min-height:40px;padding:7px 12px;border:1px solid #9d7e43;border-radius:5px;background:#272018;color:#eedab6;font:inherit}.gb-app-panel>iframe{width:100%;border:0;min-height:0;flex:1;background:transparent}';document.head.append(style);
 async function orientation(kind){try{if(document.fullscreenElement&&screen.orientation?.lock)await screen.orientation.lock(kind)}catch{/* Browser may require a physical rotation. */}}
 async function fullscreen(kind='landscape'){
  try{
   if(document.fullscreenElement){await document.exitFullscreen();return true;}
   if(!document.documentElement.requestFullscreen)return false;
   await document.documentElement.requestFullscreen({navigationUI:'hide'});await orientation(kind);return true;
  }catch{return false;}
 }
 w.GrivensburgPanels={register,create,open,close,appUrl,orientation,fullscreen,active:()=>[...active]};
})(window);
