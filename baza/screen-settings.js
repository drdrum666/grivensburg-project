/* Each viewer owns its preferences. Cross-frame sharing is explicit, never a storage event. */
(function(w){
'use strict';
const q=new URLSearchParams(location.search),embedded=q.get('embedded')||'standalone';
const scope=embedded==='dashboard'?'gm-battle':embedded==='client'?'player-'+(q.get('viewer')||'local'):embedded;
const defaults={size:80,uiScale:100,heroSize:100,enemySize:100,queueSize:100,journalSize:50,resultSize:100,fighterSize:100,roundSize:100,volume:100,muted:false};
const listeners=new Set(),memory=new Map(),independentMemory=new Map();
const key=(room,view=scope)=>'gb_screen_v2_'+String(room||'').toUpperCase()+'_'+view;
const independentKey=(room,view=scope)=>key(room,view)+'_independent';
function clean(v){const out={};for(const[k,max]of Object.entries({size:100,uiScale:140,heroSize:140,enemySize:140,queueSize:140,journalSize:100,resultSize:150,fighterSize:130,roundSize:200,volume:100}))if(v?.[k]!=null&&Number.isFinite(Number(v[k])))out[k]=Math.max(['uiScale','heroSize','enemySize','queueSize','resultSize','fighterSize','roundSize'].includes(k)?60:0,Math.min(max,Number(v[k])));
 for(const k of ['muted','melee','personalWeapons','previewMuted','soundOnlyOnStreamer'])if(typeof v?.[k]==='boolean')out[k]=v[k];
 if(v?.diceSizes){out.diceSizes={};for(const die of [10,20])if(Number.isFinite(Number(v.diceSizes[die])))out.diceSizes[die]=Math.max(10,Math.min(60,Number(v.diceSizes[die])));}
 if(v?.journal)out.journal={x:Math.max(0,Math.min(1,Number(v.journal.x)||0)),y:Math.max(0,Math.min(1,Number(v.journal.y)||0)),collapsed:!!v.journal.collapsed};return out;}
function overrides(room,view=scope){const k=key(room,view);if(!memory.has(k)){let v={};try{v=clean(JSON.parse(localStorage.getItem(k)||'null'))}catch{}memory.set(k,v);}return {...memory.get(k)};}
function read(room,view=scope){return {...defaults,...overrides(room,view)}}
function set(room,patch,view=scope){const k=key(room,view),before=overrides(room,view),next={...before,...clean(patch)};if(JSON.stringify(before)===JSON.stringify(next))return read(room,view);memory.set(k,next);try{localStorage.setItem(k,JSON.stringify(next))}catch{}listeners.forEach(fn=>fn(String(room||'').toUpperCase(),read(room,view),view));return read(room,view);}
function independent(room,view=scope){const k=independentKey(room,view);if(!independentMemory.has(k)){let v=null;try{const raw=localStorage.getItem(k);if(raw)v=clean(JSON.parse(raw))}catch{}if(v){delete v.volume;delete v.muted;delete v.previewMuted;delete v.soundOnlyOnStreamer;}independentMemory.set(k,v);}const v=independentMemory.get(k);return v?{...v}:null;}
function setIndependent(room,snapshot,view=scope){const k=independentKey(room,view),v=clean(snapshot||{});delete v.volume;delete v.muted;delete v.previewMuted;delete v.soundOnlyOnStreamer;independentMemory.set(k,v);try{localStorage.setItem(k,JSON.stringify(v))}catch{}return {...v};}
function reset(room,view=scope){memory.set(key(room,view),{});independentMemory.set(independentKey(room,view),null);try{localStorage.removeItem(key(room,view));localStorage.removeItem(independentKey(room,view))}catch{}listeners.forEach(fn=>fn(String(room||'').toUpperCase(),read(room,view),view));}
w.GrivensburgScreen={read,set,clean,overrides,independent,setIndependent,reset,scope,defaults,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)}};
})(window);
