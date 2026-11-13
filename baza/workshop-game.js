/* Data-only bridge. Import is validated completely before any room mutation. */
(function(g){'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
let defaults=null,activePackId='';
function base(){if(!defaults)defaults={creatures:clone(g.enemiesDB||{}),items:clone(g.masterItemsDB||{}),table:clone(g.GrivensburgSessionBalance.data.table)};return defaults;}
// Preserve a saved balance pack's prices/stats while adopting the installed
// rules for the three spells explicitly changed in HF07. Never mutate the save.
function currentSpellCatalog(items){
 if(!items)return items;
 const out=clone(items),original=base().items;
 for(const key of ['trick_spark','trick_icebolt','scroll_fire']){
  if(!out[key]||!original[key])continue;
  delete out[key].spellDamage;
  for(const field of ['spellIntPercent','burns','burnTurns','freezes','desc']){
   if(original[key][field]===undefined)delete out[key][field];else out[key][field]=clone(original[key][field]);
  }
 }
 return out;
}
function itemsCheck(items){
 const original=base().items;
 if(!items || Object.keys(items).sort().join('|')!==Object.keys(original).sort().join('|'))throw Error('Набор предметов не соответствует FIX30');
 for(const [key,item] of Object.entries(items)){
  for(const field of ['type','subtype','slot','equipmentKind','isTwoHanded','twohand','isLight','classes','freezes','burns','cantrip'])
   if(JSON.stringify(item[field])!==JSON.stringify(original[key][field]))throw Error('Импорт не меняет тип предмета: '+key+' / '+field);
  for(const field of ['cost','atk','def','luck','manaCost','spellDamage','spellIntPercent','burnTurns','val','mood','drunkSteps'])
   if(item[field]!=null&&(!Number.isFinite(item[field])||Math.abs(item[field])>10000))throw Error('Некорректное значение предмета '+key);
  for(const v of Object.values(item.stats||{}))if(!Number.isFinite(v)||Math.abs(v)>10000)throw Error('Некорректная характеристика '+key);
 }
}
function decode(raw){
 base();let creatures,table=null,items=null;
 if(raw?.schema==='grivensburg-creatures/1')creatures=g.Workshop.readPack(raw);
 else{
  if(raw?.schema!=='grivensburg-balance-database/1' || raw.engine?.rulesVersion!==g.CombatRules.VERSION)throw Error('Нужна база, пересчитанная для '+g.CombatRules.VERSION);
  creatures=Object.entries(raw.bestiary||{}).map(([key,e])=>g.Workshop.fromEnemy(key,e));
  if(!Array.isArray(raw.report?.rows)||raw.report.rows.length!==120)throw Error('Нужны все 120 профилей групп и сложностей');
  items=currentSpellCatalog(raw.catalog);itemsCheck(items);table={};
  const ids=new Set(creatures.map(c=>c.key));
  for(const row of raw.report.rows){
   const scene=row.config?.sceneId,d=row.d,n=row.n;
   if(!['sc1_rats','sc2_king','sc3_wolves','sc4_alpha','sc5_bandits'].includes(scene)||!['easy','normal','hard'].includes(d))throw Error('Неизвестный сценарий');
   const cap=g.Workshop.cap(n);
   for(const mode of ['d20','d10']){
    const rows=row.modes?.[mode]?.encounter,key=scene+'/'+d+'/'+mode+'/'+n;
    if(table[key]||!Array.isArray(rows)||!rows.length)throw Error('Повтор или отсутствие профиля '+key);
    let count=0;const seen=new Set();
    for(const r of rows){
     if(!ids.has(r.key)||seen.has(r.key))throw Error('Неизвестный или повторный вид '+r.key);seen.add(r.key);
     if(!Number.isInteger(r.count)||r.count<0||!Number.isInteger(r.hp)||r.hp<1||r.hp>5000||!Number.isInteger(r.atk)||r.atk<0||r.atk>100)throw Error('Некорректный состав '+key);
     if(r.potions!=null&&(!Number.isInteger(r.potions)||r.potions<0||r.potions>20))throw Error('Некорректные зелья');
     const c=creatures.find(c=>c.key===r.key);if(g.Workshop.PROFILES[c.profile].boss&&r.count>1)throw Error('Уникальный босс должен быть один');
     if(r.ai){g.Workshop.checkCreature({...c,profile:r.ai.profile||c.profile,tactic:r.ai.tactic||c.tactic,params:{...c.params,...r.ai.params},skills:['attack',...(r.ai.skills||[]),...(r.ai.passives||[])]},false);}
     count+=r.count;
    }
    if(count<1||count>cap)throw Error('Нарушен лимит врагов '+key);table[key]=clone(rows);
   }
  }
  if(Object.keys(table).length!==240)throw Error('Нужны 240 профилей с учётом обоих кубиков');
 }
 if(table)g.GrivensburgSessionBalance.validateTable(table);
 if(!creatures.length||creatures.length>500)throw Error('Пустой или слишком большой бестиарий');
 const seen=new Set();for(const c of creatures){g.Workshop.checkCreature(c,false);if(seen.has(c.key))throw Error('Повтор существа');seen.add(c.key);}
 return {schema:'grivensburg-game-pack/1',rulesVersion:g.CombatRules.VERSION,balancePolicy:'shared-dice',id:'pack-'+Date.now().toString(36),creatures:clone(creatures),...(table?{table,items}:{})};
}
function validatePack(pack,options={}){
 base();if(pack && (pack.schema!=='grivensburg-game-pack/1'||(pack.rulesVersion!==g.CombatRules.VERSION&&!(options.allowLegacy&&pack.rulesVersion==='engine-1.12.0-fix30'))))throw Error('Несовместимый пакет комнаты');
 // Validate every incoming section before changing any global catalogue.
 if(pack?.table)g.GrivensburgSessionBalance.validateTable(pack.table,!!options.allowLegacy);
 if(pack?.items){pack={...pack,items:currentSpellCatalog(pack.items)};itemsCheck(pack.items);}
 for(const c of pack?.creatures||[])g.Workshop.checkCreature(c,false);
 return pack;
}
function install(pack,options={}){
 const b=base();pack=validatePack(pack,options);
 const enemies=clone(b.creatures);
 for(const c of pack?.creatures||[])enemies[c.key]={...(enemies[c.key]||{}),...g.Workshop.toEnemy(c)};
 for(const key of Object.keys(g.enemiesDB||{}))delete g.enemiesDB[key];Object.assign(g.enemiesDB,enemies);
 const table=g.GrivensburgSessionBalance.data.table;for(const key of Object.keys(table))delete table[key];Object.assign(table,clone(pack?.table||b.table));
 const items=g.masterItemsDB;if(items){for(const key of Object.keys(items))delete items[key];Object.assign(items,clone(pack?.items||b.items));}
 activePackId=pack?.id||'';g.GrivensburgSessionBalance.attach();return activePackId;
}
function migrate(pack){
 if(!pack||pack.schema!=='grivensburg-game-pack/1')throw Error('Нет старого пакета комнаты');
 const next={...clone(pack),rulesVersion:g.CombatRules.VERSION,balancePolicy:'shared-dice',id:'shared-'+Date.now().toString(36)};
 if(next.table)next.table=g.GrivensburgSessionBalance.migrateD20(next.table);
 return validatePack(next);
}
g.GrivensburgWorkshop={decode,validatePack,install,migrate,get activePackId(){return activePackId;}};
})(typeof window!=='undefined'?window:globalThis);
