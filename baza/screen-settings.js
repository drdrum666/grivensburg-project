/* Device preferences only. Revisions stop delayed iframe echoes from undoing a slider edit. */
(function(w){
 'use strict';
 const defaults={size:80,journalSize:50,volume:100,muted:false},listeners=new Set(),memory=new Map(),source=Math.random().toString(36).slice(2);
 const key=room=>'gb_screen_v1_'+String(room||'').toUpperCase();
 const limit=(v,fallback)=>Number.isFinite(Number(v))?Math.max(0,Math.min(100,Number(v))):fallback;
 const clean=v=>({size:limit(v?.size,80),journalSize:limit(v?.journalSize,50),volume:limit(v?.volume,100),muted:v?.muted===true,...(Number.isFinite(v?._revision)?{_revision:v._revision,_source:String(v._source||'')}:{} )});
 const compare=(a,b)=>(a?._revision||0)-(b?._revision||0)||String(a?._source||'').localeCompare(String(b?._source||''));
 const equal=(a,b)=>a.size===b.size&&a.journalSize===b.journalSize&&a.volume===b.volume&&a.muted===b.muted;
 function stored(room){try{return clean(JSON.parse(localStorage.getItem(key(room))||'null'))}catch{return {...defaults}}}
 function read(room){const disk=stored(room),cached=memory.get(key(room));return {...(!cached||compare(disk,cached)>0?disk:cached)}}
 function emit(room,value){listeners.forEach(fn=>fn(String(room||'').toUpperCase(),value));}
 function set(room,patch){
  const previous=read(room),incoming=Number.isFinite(patch?._revision);
  if(incoming&&compare(patch,previous)<=0)return previous;
  const value=clean({...previous,...patch});
  if(!incoming){if(equal(value,previous))return previous;value._revision=Math.max(Date.now(),(previous._revision||0)+1);value._source=source;}
  memory.set(key(room),value);try{localStorage.setItem(key(room),JSON.stringify(value))}catch{}
  emit(room,value);return value;
 }
 w.addEventListener('storage',e=>{
  if(!e.key?.startsWith('gb_screen_v1_'))return;
  const room=e.key.slice(13),value=stored(room),cached=memory.get(e.key);
  if(!cached||compare(value,cached)>0){memory.set(e.key,value);emit(room,value);}
 });
 w.GrivensburgScreen={read,set,clean,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)}};
})(window);
