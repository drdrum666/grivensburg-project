/* Presentation receipts only. Authoritative HP is committed immediately by the game. */
(function(g){'use strict';
 function mark(record,facts,id){
  const field=Object.hasOwn(facts,'currentHP')?'currentHP':'hp';
  if(!Object.hasOwn(facts,field)||!Number.isFinite(Number(facts[field]))||Number(facts[field])===Number(record[field]))return facts;
  return {...facts,hpVisual:{id:String(id),before:Number(record[field])||0,after:Number(facts[field])}};
 }
 function create({changed=()=>{},direct=()=>{},timeout=20000}={}){
  const pending=new Map(),known=new Set(),painted=new Map();
  const key=(type,id)=>(type==='enemy'?'enemy:':'player:')+id;
  function remember(id){known.add(id);if(known.size>1024)known.delete(known.values().next().value)}
  function add(target,receipt,claimed=false){
   if(!receipt?.id||known.has(receipt.id)||!Number.isFinite(receipt.before)||!Number.isFinite(receipt.after))return;
   const list=pending.get(target)||[];let row=list.find(x=>x.id===receipt.id);
   if(!row){row={...receipt,claimed:false};list.push(row);pending.set(target,list);
    row.timer=setTimeout(()=>{if(!row.claimed){release(target,row.id);direct(target,row.after-row.before)}},timeout);}
   if(claimed){row.claimed=true;clearTimeout(row.timer)}
  }
  function release(target,id){const list=pending.get(target)||[],index=list.findIndex(x=>x.id===id);if(index<0)return false;const row=list[index];clearTimeout(row.timer);remember(row.id);painted.set(target,{id:row.id,after:row.after});list.splice(index,1);if(!list.length)pending.delete(target);changed();return true}
  function observe(type,id,before,after){
   if(!before)return;const field=type==='enemy'?'currentHP':'hp',diff=Number(after[field])-Number(before[field]);if(!diff)return;
   const target=key(type,id),receipt=after.hpVisual;
   if(receipt?.id!==before.hpVisual?.id&&Number(receipt?.after)===Number(after[field])){add(target,receipt);return}
   // Direct GM/periodic changes remain visible, including during a queued animation.
   for(const row of pending.get(target)||[]){row.before+=diff;row.after+=diff}
   painted.set(target,{after:Number(after[field])});direct(target,diff);
  }
  function stage(ev){if(ev.restored)return;for(const t of ev.presentation?.targets||[])if(t.vitalsId)add(t.id,{id:t.vitalsId,before:t.hpBefore,after:t.hpAfter},true)}
  function impact(ev,t){if(t.vitalsId)release(t.id,t.vitalsId)}
  function finish(ev){for(const t of ev.presentation?.targets||[])if(t.vitalsId&&release(t.id,t.vitalsId))direct(t.id,(t.hpAfter||0)-(t.hpBefore||0))}
  function clear(){for(const list of pending.values())for(const row of list)clearTimeout(row.timer);pending.clear();known.clear();painted.clear()}
  return {observe,stage,impact,finish,clear,value:(type,id,actual)=>pending.get(key(type,id))?.[0]?.before??painted.get(key(type,id))?.after??actual,snapshot:()=>[...pending].map(([target,list])=>({target,rows:list.map(({timer,...r})=>r)}))};
 }
 g.GrivensburgVitals={mark,create};
})(window);
