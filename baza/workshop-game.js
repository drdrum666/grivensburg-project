/* Data-only bridge. Import is validated completely before any room mutation. */
(function(g){'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
let defaults=null,activePackId='',pendingMigration=false;
const LEGACY_VERSIONS=['engine-1.12.0-fix30','engine-1.12.0-rounds-v4'];
// Dice may alter rolls, never the enemy loadout. Reject before room mutation.
function stable(value){if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';return JSON.stringify(value);}
function assertSharedTable(table){
 if(!table||Object.keys(table).length!==240)throw Error('Нужны 120 общих встреч (240 одинаковых записей совместимости)');
 for(const scene of ['sc1_rats','sc2_king','sc3_wolves','sc4_alpha','sc5_bandits'])for(const d of ['easy','normal','hard'])for(let n=1;n<=8;n++){
  const a=table[scene+'/'+d+'/d20/'+n],b=table[scene+'/'+d+'/d10/'+n];
  if(!Array.isArray(a)||!a.length||stable(a)!==stable(b))throw Error('Враги должны совпадать для D20 и 2D10: '+scene+'/'+d+'/'+n);
 }
}

function base(){if(!defaults)defaults={creatures:clone(g.enemiesDB||{}),items:clone(g.masterItemsDB||{}),table:clone(g.GrivensburgSessionBalance.data.table)};return defaults;}
function itemsCheck(items){
 const original=base().items;
 if(!items || Object.keys(items).sort().join('|')!==Object.keys(original).sort().join('|'))throw Error('Набор предметов не соответствует FIX30');
 for(const [key,item] of Object.entries(items)){
  for(const field of ['type','subtype','slot','equipmentKind','isTwoHanded','twohand','isLight','classes','freezes','burns','cantrip'])
   if(JSON.stringify(item[field])!==JSON.stringify(original[key][field]))throw Error('Импорт не меняет тип предмета: '+key+' / '+field);
  for(const field of ['cost','atk','def','luck','manaCost','spellDamage','val','mood','drunkSteps'])
   if(item[field]!=null&&(!Number.isFinite(item[field])||Math.abs(item[field])>10000))throw Error('Некорректное значение предмета '+key);
  for(const v of Object.values(item.stats||{}))if(!Number.isFinite(v)||Math.abs(v)>10000)throw Error('Некорректная характеристика '+key);
 }
}
function decode(raw){
 base();let creatures,table=null,items=null;
 if(raw?.schema==='grivensburg-encounters-shared/1'){
  if(!Array.isArray(raw.records)||raw.records.length!==120)throw Error('Нужны 120 общих встреч');
  table={};for(const r of raw.records)for(const mode of ['d20','d10']){const k=r.sceneId+'/'+r.difficulty+'/'+mode+'/'+r.players;if(table[k])throw Error('Повтор встречи');table[k]=clone(r.enemies);}
  assertSharedTable(table);creatures=[];
 }else if(raw?.schema==='grivensburg-creatures/1')creatures=g.Workshop.readPack(raw);
 else{
  if(raw?.schema!=='grivensburg-balance-database/1' || raw.engine?.rulesVersion!==g.CombatRules.VERSION)throw Error('Нужна база, пересчитанная для '+g.CombatRules.VERSION);
  creatures=Object.entries(raw.bestiary||{}).map(([key,e])=>g.Workshop.fromEnemy(key,e));
  if(!Array.isArray(raw.report?.rows)||raw.report.rows.length!==120)throw Error('Нужны все 120 профилей групп и сложностей');
  items=clone(raw.catalog);itemsCheck(items);table={};
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
  assertSharedTable(table);
 }
 if((!creatures.length&&!table)||creatures.length>500)throw Error('Пустой или слишком большой бестиарий');
 const seen=new Set();for(const c of creatures){g.Workshop.checkCreature(c,false);if(seen.has(c.key))throw Error('Повтор существа');seen.add(c.key);}
 if(table)validateTable(table,creatures);
 return {schema:'grivensburg-game-pack/1',rulesVersion:g.CombatRules.VERSION,balancePolicy:'shared-dice',id:'pack-'+Date.now().toString(36),creatures:clone(creatures),...(table?{table,items}:{})};
}
function install(pack,legacy=false){
 const b=base();if(pack && (pack.schema!=='grivensburg-game-pack/1'||pack.rulesVersion!==g.CombatRules.VERSION && !(legacy && LEGACY_VERSIONS.includes(pack.rulesVersion))))throw Error('Несовместимый пакет комнаты');
 if(!legacy)assertSharedTable(pack?.table||b.table);
 validateTable(pack?.table||b.table,pack?.creatures||[]);
 for(const c of pack?.creatures||[])g.Workshop.checkCreature(c,false);
 if(pack?.items)itemsCheck(pack.items);
 const enemies=clone(b.creatures);
 for(const c of pack?.creatures||[])enemies[c.key]={...(enemies[c.key]||{}),...g.Workshop.toEnemy(c)};
 for(const key of Object.keys(g.enemiesDB||{}))delete g.enemiesDB[key];Object.assign(g.enemiesDB,enemies);
 const table=g.GrivensburgSessionBalance.data.table;for(const key of Object.keys(table))delete table[key];Object.assign(table,clone(pack?.table||b.table));
 const items=g.masterItemsDB;if(items){for(const key of Object.keys(items))delete items[key];Object.assign(items,clone(pack?.items||b.items));}
 pendingMigration=legacy;g.GrivensburgSessionBalance.data.legacy=legacy;activePackId=pack?.id||'';g.GrivensburgSessionBalance.attach();return activePackId;
}
function validateTable(table,creatures=[]){
 const ids=new Set([...Object.keys(base().creatures),...creatures.map(c=>c.key)]);
 if(!table||Object.keys(table).length!==240)throw Error('Неполная таблица встреч');
 for(const [key,rows]of Object.entries(table)){
  const [scene,d,mode,size,...extra]=key.split('/'),n=Number(size),seen=new Set();let count=0;
  if(extra.length||!Number.isInteger(n)||n<1||n>8||String(n)!==size)throw Error('Неверный размер встречи');
  if(!['sc1_rats','sc2_king','sc3_wolves','sc4_alpha','sc5_bandits'].includes(scene)||!['easy','normal','hard'].includes(d)||!['d20','d10'].includes(mode)||!Array.isArray(rows)||!rows.length)throw Error('Неверная встреча '+key);
  for(const e of rows){
   if(!ids.has(e.key)||seen.has(e.key)||!Number.isInteger(e.count)||e.count<0||!Number.isInteger(e.hp)||e.hp<1||e.hp>5000||!Number.isInteger(e.atk)||e.atk<0||e.atk>100)throw Error('Неверный враг '+key);
   seen.add(e.key);count+=e.count;
   for(const [field,lo,hi]of [['init',-10,20],['heal',0,5000],['potions',0,20]])if(e[field]!=null&&(!Number.isInteger(e[field])||e[field]<lo||e[field]>hi))throw Error('Неверное поле '+field);
   const source=creatures.find(c=>c.key===e.key)||g.Workshop.fromEnemy(e.key,base().creatures[e.key]);
   if(e.ai)g.Workshop.checkCreature({...source,profile:e.ai.profile||source.profile,tactic:e.ai.tactic||source.tactic,params:{...source.params,...e.ai.params},skills:['attack',...(e.ai.skills||[]),...(e.ai.passives||[])]},false);
   if((e.isUnique||g.Workshop.PROFILES[source.profile].boss)&&e.count>1)throw Error('Уникальный босс должен быть один');
  }
  if(count<1||count>g.Workshop.cap(n))throw Error('Превышен предел врагов');
 }
}
function installRoom(pack,policy,roomItems){
 if(roomItems && !pack?.items && policy==='shared-dice')pack={schema:'grivensburg-game-pack/1',rulesVersion:g.CombatRules.VERSION,id:'',creatures:[],table:clone(base().table),...pack,items:clone(roomItems)};
 if(policy==='shared-dice' && (!pack||pack.rulesVersion===g.CombatRules.VERSION)){install(pack);return false;}
 if(pack && !LEGACY_VERSIONS.includes(pack.rulesVersion) && pack.rulesVersion!==g.CombatRules.VERSION)throw Error('Неизвестная версия мастерской. Нужен совместимый экспорт.');
 let legacy=pack||{schema:'grivensburg-game-pack/1',rulesVersion:LEGACY_VERSIONS[0],id:'',creatures:[],table:clone(g.GrivensburgSessionBalance.data.legacyTable)};
 if(roomItems && !legacy.items)legacy={...legacy,items:clone(roomItems)};
 install(legacy,true);return true;
}
function migrateRoom(room,choice){
 if(room?.world?.battleOpen||Object.values(room?.battle?.queue||{}).length)throw Error('Переход на общий баланс доступен после завершения боя');
 if(!['d20','builtin'].includes(choice))throw Error('Выберите базу перехода');
 const old=room.config?.workshopPack,creatures=clone(old?.creatures||[]);
 let table=clone(choice==='builtin'?base().table:old?.table||g.GrivensburgSessionBalance.data.legacyTable);
 if(choice==='d20')for(const scene of ['sc1_rats','sc2_king','sc3_wolves','sc4_alpha','sc5_bandits'])for(const d of ['easy','normal','hard'])for(let n=1;n<=8;n++)table[scene+'/'+d+'/d10/'+n]=clone(table[scene+'/'+d+'/d20/'+n]);
 assertSharedTable(table);validateTable(table,creatures);
 const items=clone(room.config?.items || old?.items || base().items);itemsCheck(items);
 const pack={schema:'grivensburg-game-pack/1',rulesVersion:g.CombatRules.VERSION,balancePolicy:'shared-dice',id:'shared-'+choice+'-'+Date.now().toString(36),creatures,table,items};
 return {...room,config:{...room.config,balancePolicy:'shared-dice',workshopPack:pack}};
}
g.GrivensburgWorkshop={decode,install,installRoom,migrateRoom,assertSharedTable,validateTable,get pendingMigration(){return pendingMigration;},get activePackId(){return activePackId;}};
})(typeof window!=='undefined'?window:globalThis);
