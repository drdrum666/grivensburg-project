// Balance for the five-player session, 10 October 2026.
(function(g){
 'use strict';
 const data={"id":"fix10-five-2026-10-10","balanceRevision":2,"players":5,"normalFinalTarget":{"lo":0.8,"hi":0.85,"sceneId":"sc5_bandits"},"changedFromPrevious":["sc5_bandits/normal"],"sourceSHA256":"396b5e1223eebdf133fc3548faceb26d36bed445be6981fb75d1f63cecccff77","scenes":{"sc1_rats":{"easy":{"d20":[{"key":"fat_rat","count":3,"hp":10,"atk":1}],"d10":[{"key":"fat_rat","count":3,"hp":10,"atk":1}]},"normal":{"d20":[{"key":"fat_rat","count":7,"hp":10,"atk":3}],"d10":[{"key":"fat_rat","count":7,"hp":10,"atk":3}]},"hard":{"d20":[{"key":"fat_rat","count":8,"hp":10,"atk":4}],"d10":[{"key":"fat_rat","count":8,"hp":10,"atk":4}]}},"sc2_king":{"easy":{"d20":[{"key":"rat_king","count":1,"hp":44,"atk":3},{"key":"fat_rat","count":1,"hp":10,"atk":1}],"d10":[{"key":"rat_king","count":1,"hp":44,"atk":3},{"key":"fat_rat","count":1,"hp":10,"atk":1}]},"normal":{"d20":[{"key":"rat_king","count":1,"hp":80,"atk":6},{"key":"fat_rat","count":7,"hp":10,"atk":3}],"d10":[{"key":"rat_king","count":1,"hp":80,"atk":6},{"key":"fat_rat","count":7,"hp":10,"atk":3}]},"hard":{"d20":[{"key":"rat_king","count":1,"hp":90,"atk":7},{"key":"fat_rat","count":8,"hp":10,"atk":4}],"d10":[{"key":"rat_king","count":1,"hp":90,"atk":7},{"key":"fat_rat","count":8,"hp":10,"atk":4}]}},"sc3_wolves":{"easy":{"d20":[{"key":"wild_wolf","count":3,"hp":16,"atk":2}],"d10":[{"key":"wild_wolf","count":3,"hp":16,"atk":2}]},"normal":{"d20":[{"key":"wild_wolf","count":6,"hp":16,"atk":6}],"d10":[{"key":"wild_wolf","count":6,"hp":16,"atk":6}]},"hard":{"d20":[{"key":"wild_wolf","count":7,"hp":16,"atk":7}],"d10":[{"key":"wild_wolf","count":7,"hp":16,"atk":7}]}},"sc4_alpha":{"easy":{"d20":[{"key":"direwolf","count":1,"hp":62,"atk":4},{"key":"wild_wolf","count":1,"hp":16,"atk":2}],"d10":[{"key":"direwolf","count":1,"hp":62,"atk":4},{"key":"wild_wolf","count":1,"hp":16,"atk":2}]},"normal":{"d20":[{"key":"direwolf","count":1,"hp":90,"atk":7},{"key":"wild_wolf","count":4,"hp":16,"atk":4}],"d10":[{"key":"direwolf","count":1,"hp":90,"atk":7},{"key":"wild_wolf","count":4,"hp":16,"atk":4}]},"hard":{"d20":[{"key":"direwolf","count":1,"hp":100,"atk":8},{"key":"wild_wolf","count":5,"hp":16,"atk":6}],"d10":[{"key":"direwolf","count":1,"hp":100,"atk":8},{"key":"wild_wolf","count":5,"hp":16,"atk":6}]}},"sc5_bandits":{"easy":{"d20":[{"key":"bandit_leader","count":1,"hp":71,"atk":4},{"key":"bandit","count":1,"hp":22,"atk":2}],"d10":[{"key":"bandit_leader","count":1,"hp":71,"atk":4},{"key":"bandit","count":1,"hp":22,"atk":2}]},"normal":{"d20":[{"key":"bandit_leader","count":1,"hp":100,"atk":7},{"key":"bandit","count":4,"hp":22,"atk":6},{"key":"bandit_archer","count":2,"hp":18,"atk":6}],"d10":[{"key":"bandit_leader","count":1,"hp":100,"atk":8},{"key":"bandit","count":4,"hp":22,"atk":6},{"key":"bandit_archer","count":2,"hp":18,"atk":7}]},"hard":{"d20":[{"key":"bandit_leader","count":1,"hp":110,"atk":8,"potions":1,"heal":10},{"key":"bandit","count":5,"hp":22,"atk":6,"potions":1,"heal":10},{"key":"bandit_archer","count":3,"hp":18,"atk":8}],"d10":[{"key":"bandit_leader","count":1,"hp":110,"atk":8,"potions":1,"heal":10},{"key":"bandit","count":5,"hp":22,"atk":7,"potions":1,"heal":10},{"key":"bandit_archer","count":3,"hp":18,"atk":6}]}}}};
 for(const chapter of Object.values(g.chaptersDB))for(const scene of chapter.scenarios || []) {
   const table=data.scenes[scene.id];if(!table || !scene.configs)continue;
   for(const [difficulty,modes] of Object.entries(table))if(scene.configs[difficulty])scene.configs[difficulty].sessionBalance5=modes;
 }
 function plan(cfg,count,mode){
   const rows=cfg?.sessionBalance5?.[mode==='d20'?'d20':'d10'];
   if(count!==5 || !Array.isArray(rows))return null;
   return {list:rows.flatMap(r=>Array(r.count).fill(r.key)),rows:rows.map(r=>({...r})),
     multiplier:1,buffRatio:1,elite:false,balanced5:true};
 }
 function enemy(cfg,p,key){
   const base=g.enemiesDB[key];if(!base)return null;
   const row=p.balanced5 && p.rows.find(r=>r.key===key);
   if(!row)return g.CombatRules.toughenEnemy(g.CombatRules.buffEnemy(base,p.buffRatio),g.CombatRules.sceneMults(cfg));
   return {...base,hp:row.hp,maxHP:row.hp,atk:row.atk,
     ...(row.init==null?{}:{init:row.init}),...(row.heal==null?{}:{potionHeal:row.heal})};
 }
 function potionTotals(cfg,p){
   return p.balanced5?Object.fromEntries(p.rows.map(r=>[r.key,r.potions || 0])):cfg.potions;
 }
 function potions(cfg,p,rng){
   const out=g.CombatRules.distributeEnemyPotions(p.list,potionTotals(cfg,p));
   if(!p.balanced5)return out;
   const ids=p.list.map((k,i)=>k==='bandit'?i:-1).filter(i=>i>=0);
   if(ids.length && ids.reduce((n,i)=>n+out[i],0)===1){
     ids.forEach(i=>out[i]=0);out[ids[Math.min(ids.length-1,Math.floor(rng()*ids.length))]]=1;
   }
   return out;
 }
 g.GrivensburgSessionBalance={data,plan,enemy,potionTotals,potions};
})(window);
