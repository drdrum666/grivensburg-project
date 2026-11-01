/* Единые награды живой игры и симулятора. Число предметов прежнее;
   первые два босса заменяют обычное снаряжение украшениями. */
(function(g){
'use strict';
const GOLD_MULT={easy:1,normal:1.5,hard:2};
const DEFAULT={goldPerHead:2,normal:{gear:1,jewel:0,potion:1}};
const rows={
 sc1_rats:{xpOnly:true,goldPerHead:0}, sc3_wolves:{xpOnly:true,goldPerHead:0},
 sc2_king:{goldPerHead:2,transferredGoldPerHead:2,jewelryOnly:true,easy:{gear:1,jewel:0,potion:1},normal:{gear:1,jewel:1,potion:1},hard:{gear:2,jewel:1,potion:2}},
 sc4_alpha:{goldPerHead:3,transferredGoldPerHead:2,jewelryOnly:true,easy:{gear:1,jewel:0,potion:1},normal:{gear:1,jewel:1,potion:1},hard:{gear:2,jewel:1,potion:2}},
 sc5_bandits:{goldPerHead:4,gearWeights:{gloves:3,feet:3,belt:3},cow:true,easy:{gear:1,jewel:0,potion:1},normal:{gear:2,jewel:1,potion:1},hard:{gear:3,jewel:2,potion:2}}
};
function plan(scenario,difficulty,count){
 const row=rows[scenario]||DEFAULT,mult=GOLD_MULT[difficulty]||1;
 const p=g.CombatRules.planLoot({base:row.xpOnly?{gear:0,jewel:0,potion:0}:(row[difficulty]||row.normal),playerCount:count,goldPerHead:row.goldPerHead,goldMult:mult});
 // Складываем отдельно округлённые старые награды: ни одна монета не теряется.
 p.gold+=Math.ceil((row.transferredGoldPerHead||0)*count*mult);
 if(row.jewelryOnly){p.jewelry+=p.gear;p.gear=0;}
 return {...p,xpOnly:!!row.xpOnly};
}
function pool(items,scenario,kind){
 const weights=rows[scenario]?.gearWeights||{};const out=[];
 for(const [key,it]of Object.entries(items)){
  if(!g.CombatRules.isRandomLoot(it))continue;
  const jewel=['ring','amulet'].includes(it.slot);
  if(kind==='jewelry'?!jewel:kind==='gear'?(it.type!=='gear'||jewel||['magic','relic','cantrip'].includes(it.slot)):it.type!=='consumable')continue;
  for(let i=0;i<(kind==='gear'?(weights[it.slot]||1):1);i++)out.push(key);
 }
 return out;
}
function roll({scenario,difficulty,playerCount,items,slainKeys=[],rng=Math.random}){
 const p=plan(scenario,difficulty,playerCount),out=[];
 if(!p.xpOnly){
  for(const [kind,n]of [['gear',p.gear],['jewelry',p.jewelry],['consumable',p.consumable]]){
   const keys=pool(items,scenario,kind);for(let i=0;i<n&&keys.length;i++)out.push(keys[Math.min(keys.length-1,Math.max(0,Math.floor(rng()*keys.length)))]);
  }
  for(const key of g.CombatRules.namedDrops({slainKeys,items}))if(!out.includes(key))out.push(key);
 }
 return {...p,items:out};
}
function butcherCow({roll,agi}){
 const res=g.CombatRules.resolveSkinning({roll,agi});
 return {...res,injury:0,quantity:res.outcome==='injury'?1:2,
 label:res.outcome==='perfect'?'ОТЛИЧНО РАЗДЕЛАЛ':res.outcome==='ok'?'РАЗДЕЛАЛ':'УДАЛОСЬ ДОБЫТЬ ПРИПАСЫ'};
}
g.GrivensburgRewards={rows,GOLD_MULT,plan,pool,roll,butcherCow};
})(window);
