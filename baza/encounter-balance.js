/* FIX20: итоговые составы для 3/5 героев. Остальные размеры — предварительный пересчёт.
   Число игроков никогда не умножает урон. Старые hpMult/atkMult здесь не применяются. */
(function(g){
 'use strict';
 const data={"id":"fix20-three-five-prices-r8-2026-10-12","balanceRevision":4,"sourceBuild":"Grivensburg_FIX20_2026-10-11(1).zip","sourceSHA256":"32d7190637511addc8cc9e47a98784165c87fcb344bf395339ceedd7313bfa6f","calibratedPlayers":[3,5],"provisionalPlayers":[1,2,4,6,7,8,9,10],"profiles":{"3":{"classes":["warrior","archer","priest"],"scenes":{"sc1_rats":{"easy":{"d20":[{"key":"fat_rat","count":2,"hp":10,"atk":1}],"d10":[{"key":"fat_rat","count":2,"hp":10,"atk":1}]},"normal":{"d20":[{"key":"fat_rat","count":4,"hp":10,"atk":3}],"d10":[{"key":"fat_rat","count":4,"hp":10,"atk":3}]},"hard":{"d20":[{"key":"fat_rat","count":4,"hp":10,"atk":4}],"d10":[{"key":"fat_rat","count":4,"hp":10,"atk":4}]}},"sc2_king":{"easy":{"d20":[{"key":"rat_king","count":1,"hp":28,"atk":3},{"key":"fat_rat","count":1,"hp":10,"atk":1}],"d10":[{"key":"rat_king","count":1,"hp":28,"atk":3},{"key":"fat_rat","count":1,"hp":10,"atk":1}]},"normal":{"d20":[{"key":"rat_king","count":1,"hp":48,"atk":6},{"key":"fat_rat","count":4,"hp":10,"atk":3}],"d10":[{"key":"rat_king","count":1,"hp":48,"atk":6},{"key":"fat_rat","count":4,"hp":10,"atk":3}]},"hard":{"d20":[{"key":"rat_king","count":1,"hp":58,"atk":7},{"key":"fat_rat","count":4,"hp":10,"atk":4}],"d10":[{"key":"rat_king","count":1,"hp":58,"atk":7},{"key":"fat_rat","count":4,"hp":10,"atk":4}]}},"sc3_wolves":{"easy":{"d20":[{"key":"wild_wolf","count":2,"hp":16,"atk":2}],"d10":[{"key":"wild_wolf","count":2,"hp":16,"atk":2}]},"normal":{"d20":[{"key":"wild_wolf","count":3,"hp":16,"atk":6}],"d10":[{"key":"wild_wolf","count":3,"hp":16,"atk":6}]},"hard":{"d20":[{"key":"wild_wolf","count":4,"hp":16,"atk":7}],"d10":[{"key":"wild_wolf","count":4,"hp":16,"atk":7}]}},"sc4_alpha":{"easy":{"d20":[{"key":"direwolf","count":1,"hp":37,"atk":4},{"key":"wild_wolf","count":1,"hp":16,"atk":2}],"d10":[{"key":"direwolf","count":1,"hp":37,"atk":4},{"key":"wild_wolf","count":1,"hp":16,"atk":2}]},"normal":{"d20":[{"key":"direwolf","count":1,"hp":68,"atk":7},{"key":"wild_wolf","count":2,"hp":16,"atk":4}],"d10":[{"key":"direwolf","count":1,"hp":68,"atk":7},{"key":"wild_wolf","count":2,"hp":16,"atk":4}]},"hard":{"d20":[{"key":"direwolf","count":1,"hp":68,"atk":8},{"key":"wild_wolf","count":3,"hp":16,"atk":6}],"d10":[{"key":"direwolf","count":1,"hp":68,"atk":8},{"key":"wild_wolf","count":3,"hp":16,"atk":6}]}},"sc5_bandits":{"easy":{"d20":[{"key":"bandit_leader","count":1,"hp":43,"atk":4},{"key":"bandit","count":1,"hp":22,"atk":2}],"d10":[{"key":"bandit_leader","count":1,"hp":43,"atk":4},{"key":"bandit","count":1,"hp":22,"atk":2}]},"normal":{"d20":[{"key":"bandit_leader","count":1,"hp":68,"atk":7},{"key":"bandit","count":3,"hp":26,"atk":6},{"key":"bandit_archer","count":1,"hp":18,"atk":6}],"d10":[{"key":"bandit_leader","count":1,"hp":64,"atk":8},{"key":"bandit","count":3,"hp":28,"atk":6},{"key":"bandit_archer","count":1,"hp":18,"atk":7}]},"hard":{"d20":[{"key":"bandit_leader","count":1,"hp":72,"atk":8,"potions":1,"heal":10},{"key":"bandit","count":3,"hp":26,"atk":7,"potions":1,"heal":10},{"key":"bandit_archer","count":2,"hp":20,"atk":8}],"d10":[{"key":"bandit_leader","count":1,"hp":80,"atk":8,"potions":1,"heal":10},{"key":"bandit","count":3,"hp":28,"atk":7,"potions":1,"heal":10},{"key":"bandit_archer","count":2,"hp":20,"atk":8}]}}}},"5":{"classes":["warrior","archer","mage","priest","bard"],"scenes":{"sc1_rats":{"easy":{"d20":[{"key":"fat_rat","count":3,"hp":10,"atk":1}],"d10":[{"key":"fat_rat","count":3,"hp":10,"atk":1}]},"normal":{"d20":[{"key":"fat_rat","count":7,"hp":10,"atk":3}],"d10":[{"key":"fat_rat","count":7,"hp":10,"atk":3}]},"hard":{"d20":[{"key":"fat_rat","count":8,"hp":10,"atk":4}],"d10":[{"key":"fat_rat","count":8,"hp":10,"atk":4}]}},"sc2_king":{"easy":{"d20":[{"key":"rat_king","count":1,"hp":44,"atk":3},{"key":"fat_rat","count":1,"hp":10,"atk":1}],"d10":[{"key":"rat_king","count":1,"hp":44,"atk":3},{"key":"fat_rat","count":1,"hp":10,"atk":1}]},"normal":{"d20":[{"key":"rat_king","count":1,"hp":80,"atk":6},{"key":"fat_rat","count":7,"hp":10,"atk":3}],"d10":[{"key":"rat_king","count":1,"hp":80,"atk":6},{"key":"fat_rat","count":7,"hp":10,"atk":3}]},"hard":{"d20":[{"key":"rat_king","count":1,"hp":90,"atk":7},{"key":"fat_rat","count":8,"hp":10,"atk":4}],"d10":[{"key":"rat_king","count":1,"hp":90,"atk":7},{"key":"fat_rat","count":8,"hp":10,"atk":4}]}},"sc3_wolves":{"easy":{"d20":[{"key":"wild_wolf","count":3,"hp":16,"atk":2}],"d10":[{"key":"wild_wolf","count":3,"hp":16,"atk":2}]},"normal":{"d20":[{"key":"wild_wolf","count":6,"hp":16,"atk":6}],"d10":[{"key":"wild_wolf","count":6,"hp":16,"atk":6}]},"hard":{"d20":[{"key":"wild_wolf","count":7,"hp":16,"atk":7}],"d10":[{"key":"wild_wolf","count":7,"hp":16,"atk":7}]}},"sc4_alpha":{"easy":{"d20":[{"key":"direwolf","count":1,"hp":62,"atk":4},{"key":"wild_wolf","count":1,"hp":16,"atk":2}],"d10":[{"key":"direwolf","count":1,"hp":62,"atk":4},{"key":"wild_wolf","count":1,"hp":16,"atk":2}]},"normal":{"d20":[{"key":"direwolf","count":1,"hp":90,"atk":7},{"key":"wild_wolf","count":4,"hp":16,"atk":4}],"d10":[{"key":"direwolf","count":1,"hp":94,"atk":7},{"key":"wild_wolf","count":4,"hp":16,"atk":4}]},"hard":{"d20":[{"key":"direwolf","count":1,"hp":108,"atk":8},{"key":"wild_wolf","count":5,"hp":16,"atk":6}],"d10":[{"key":"direwolf","count":1,"hp":110,"atk":8},{"key":"wild_wolf","count":5,"hp":16,"atk":6}]}},"sc5_bandits":{"easy":{"d20":[{"key":"bandit_leader","count":1,"hp":71,"atk":4},{"key":"bandit","count":1,"hp":22,"atk":2}],"d10":[{"key":"bandit_leader","count":1,"hp":71,"atk":4},{"key":"bandit","count":1,"hp":22,"atk":2}]},"normal":{"d20":[{"key":"bandit_leader","count":1,"hp":120,"atk":7},{"key":"bandit","count":4,"hp":26,"atk":6},{"key":"bandit_archer","count":3,"hp":18,"atk":6}],"d10":[{"key":"bandit_leader","count":1,"hp":104,"atk":8},{"key":"bandit","count":4,"hp":28,"atk":6},{"key":"bandit_archer","count":3,"hp":18,"atk":7}]},"hard":{"d20":[{"key":"bandit_leader","count":1,"hp":120,"atk":8,"potions":1,"heal":10},{"key":"bandit","count":5,"hp":30,"atk":7,"potions":1,"heal":10},{"key":"bandit_archer","count":3,"hp":24,"atk":8}],"d10":[{"key":"bandit_leader","count":1,"hp":120,"atk":8,"potions":1,"heal":10},{"key":"bandit","count":5,"hp":32,"atk":7,"potions":1,"heal":10},{"key":"bandit_archer","count":3,"hp":26,"atk":8}]}}}}},"normalFinalTarget":{"lo":0.8,"hi":0.85,"sceneId":"sc5_bandits"},"scalingPolicy":{"attack":"independent_of_party_size","ordinaryHP":"small_increase_for_provisional_large_parties_with_caps","bossHP":"scales_with_party_size","otherSizes":"provisional_not_calibrated"},"gearChanges":{"chainmail":{"stat":"str","before":1,"after":2,"cost":10},"leather_jacket":{"stat":"agi","before":1,"after":2,"cost":10},"old_robe":{"stat":"int","before":1,"after":2,"cost":10},"old_gypsy_shirt":{"stat":"cha","before":1,"after":2,"cost":10}}};
 const copy=x=>JSON.parse(JSON.stringify(x));
 for(const chapter of Object.values(g.chaptersDB))for(const scene of chapter.scenarios || []){
  if(!data.profiles['5'].scenes[scene.id] || !scene.configs)continue;
  for(const difficulty of Object.keys(scene.configs))scene.configs[difficulty].sessionBalance35={sceneId:scene.id,difficulty};
 }
 function rowsFor(sceneId,difficulty,mode,count){
  if(!Number.isInteger(count)||count<1||count>10)return null;
  const dice=mode==='d20'?'d20':'d10';
  const low=data.profiles['3'].scenes[sceneId]?.[difficulty]?.[dice];
  const high=data.profiles['5'].scenes[sceneId]?.[difficulty]?.[dice];
  if(!low||!high)return null;
  if(count===3)return copy(low);
  if(count===5)return copy(high);
  const keys=Array.from(new Set([...low,...high].map(r=>r.key)));
  let rows=keys.map(key=>{
   const a=low.find(r=>r.key===key),b=high.find(r=>r.key===key),src=b||a;
   const unique=!!g.enemiesDB[key]?.isUnique;
   let n,hp;
   if(count<3){n=unique?1:Math.ceil((a?.count||0)*count/3);hp=unique?Math.round((a?.hp||src.hp)*count/3):(a?.hp||src.hp);}
   else if(count<5){n=unique?1:Math.round(((a?.count||0)+(b?.count||0))/2);hp=Math.round(((a?.hp||src.hp)+(b?.hp||src.hp))/2);}
   else {n=unique?1:Math.ceil((b?.count||0)*count/5);hp=unique?Math.round(src.hp*count/5):Math.round(src.hp*(1+.025*(count-5)));}
   return {...copy(src),count:n,hp:Math.max(1,hp),atk:src.atk};
  }).filter(r=>r.count>0);
  const cap=g.CombatRules.spawnCap(count),before=rows.reduce((n,r)=>n+r.count,0);
  while(rows.reduce((n,r)=>n+r.count,0)>cap){
   const removable=rows.filter(r=>!g.enemiesDB[r.key]?.isUnique&&r.count>0).sort((a,b)=>(b.count-a.count)||Number(!!a.potions)-Number(!!b.potions));
   if(!removable.length)break;removable[0].count--;
  }
  rows=rows.filter(r=>r.count>0);
  const ratio=Math.max(1,before/Math.max(1,cap));
  const hpCeil={fat_rat:20,wild_wolf:24,bandit:32,bandit_archer:28};
  return rows.map(r=>({...r,hp:Math.min(hpCeil[r.key]||Infinity,Math.max(1,Math.ceil(r.hp*ratio)))}));
 }
 function plan(cfg,count,mode){
  const loc=cfg?.sessionBalance35;if(!loc)return null;
  const rows=rowsFor(loc.sceneId,loc.difficulty,mode,count);if(!rows)return null;
  return {list:rows.flatMap(r=>Array(r.count).fill(r.key)),rows,multiplier:1,buffRatio:1,elite:false,
    balancedProfile:true,profilePlayers:count,calibrated:count===3||count===5};
 }
 function enemy(cfg,p,key){
  const base=g.enemiesDB[key];if(!base)return null;
  const row=p.balancedProfile&&p.rows.find(r=>r.key===key);
  if(!row)return g.CombatRules.toughenEnemy(g.CombatRules.buffEnemy(base,p.buffRatio),g.CombatRules.sceneMults(cfg));
  return {...base,hp:row.hp,maxHP:row.hp,atk:row.atk,
    ...(row.init==null?{}:{init:row.init}),...(row.heal==null?{}:{potionHeal:row.heal})};
 }
 function potionTotals(cfg,p){return p.balancedProfile?Object.fromEntries(p.rows.map(r=>[r.key,r.potions||0])):cfg.potions;}
 function potions(cfg,p,rng){
  const out=g.CombatRules.distributeEnemyPotions(p.list,potionTotals(cfg,p));
  if(!p.balancedProfile)return out;
  const ids=p.list.map((k,i)=>k==='bandit'?i:-1).filter(i=>i>=0);
  if(ids.length&&ids.reduce((n,i)=>n+out[i],0)===1){ids.forEach(i=>out[i]=0);out[ids[Math.min(ids.length-1,Math.floor(rng()*ids.length))]]=1;}
  return out;
 }
 g.GrivensburgSessionBalance={data,rowsFor,plan,enemy,potionTotals,potions};
})(window);
