/* Device preferences. No Firebase writes and no gameplay state. */
(function(w){
 'use strict';
 const defaults={size:80,volume:100,muted:false},listeners=new Set(),memory=new Map();
 const key=room=>'gb_screen_v1_'+String(room||'').toUpperCase();
 const limit=(v,fallback)=>Number.isFinite(Number(v))?Math.max(0,Math.min(100,Number(v))):fallback;
 const clean=v=>({size:limit(v?.size,80),volume:limit(v?.volume,100),muted:v?.muted===true});
 function read(room){if(memory.has(key(room)))return {...memory.get(key(room))};try{return clean(JSON.parse(localStorage.getItem(key(room))||'null'))}catch{return memory.get(key(room))||{...defaults}}}
 function emit(room,value){listeners.forEach(fn=>fn(String(room||'').toUpperCase(),value));}
 function set(room,patch){const previous=read(room),value=clean({...previous,...patch});if(JSON.stringify(value)===JSON.stringify(previous))return value;memory.set(key(room),value);try{localStorage.setItem(key(room),JSON.stringify(value))}catch{}emit(room,value);return value;}
 w.addEventListener('storage',e=>{if(e.key?.startsWith('gb_screen_v1_')){memory.delete(e.key);emit(e.key.slice(13),read(e.key.slice(13)))}});
 w.GrivensburgScreen={read,set,clean,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)}};
})(window);
