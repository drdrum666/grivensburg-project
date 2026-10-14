/* Each viewer owns its preferences. Cross-frame sharing is explicit, never a storage event. */
(function(w){
'use strict';
const q=new URLSearchParams(location.search),embedded=q.get('embedded')||'standalone';
const scope=embedded==='dashboard'?'gm-battle':embedded==='client'?'player-'+(q.get('viewer')||'local'):embedded;
const defaults={size:80,journalSize:50,resultSize:100,fighterSize:100,volume:100,muted:false};
const listeners=new Set(),memory=new Map();
const key=(room,view=scope)=>'gb_screen_v2_'+String(room||'').toUpperCase()+'_'+view;
function clean(v){const out={};for(const[k,max]of Object.entries({size:100,journalSize:100,resultSize:150,fighterSize:130,volume:100}))if(v?.[k]!=null&&Number.isFinite(Number(v[k])))out[k]=Math.max(k==='resultSize'||k==='fighterSize'?60:0,Math.min(max,Number(v[k])));
 for(const k of ['muted','melee','personalWeapons'])if(typeof v?.[k]==='boolean')out[k]=v[k];
 if(v?.diceSizes){out.diceSizes={};for(const die of [10,20])if(Number.isFinite(Number(v.diceSizes[die])))out.diceSizes[die]=Math.max(10,Math.min(60,Number(v.diceSizes[die])));}
 if(v?.journal)out.journal={x:Math.max(0,Math.min(1,Number(v.journal.x)||0)),y:Math.max(0,Math.min(1,Number(v.journal.y)||0)),collapsed:!!v.journal.collapsed};return out;}
function overrides(room,view=scope){const k=key(room,view);if(!memory.has(k)){let v={};try{v=clean(JSON.parse(localStorage.getItem(k)||'null'))}catch{}memory.set(k,v);}return {...memory.get(k)};}
function read(room,view=scope){return {...defaults,...overrides(room,view)}}
function set(room,patch,view=scope){const k=key(room,view),before=overrides(room,view),next={...before,...clean(patch)};if(JSON.stringify(before)===JSON.stringify(next))return read(room,view);memory.set(k,next);try{localStorage.setItem(k,JSON.stringify(next))}catch{}listeners.forEach(fn=>fn(String(room||'').toUpperCase(),read(room,view),view));return read(room,view);}
function reset(room,view=scope){memory.set(key(room,view),{});try{localStorage.removeItem(key(room,view))}catch{}listeners.forEach(fn=>fn(String(room||'').toUpperCase(),read(room,view),view));}
w.GrivensburgScreen={read,set,clean,overrides,reset,scope,defaults,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)}};
})(window);
