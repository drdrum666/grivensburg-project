/* Grivensburg Workshop 2. Pure, serializable rules for tools and game adapters.
   This module does not write Firebase or advance turns. */
(function(g){'use strict';
const VERSION='workshop-1.2.0', MAX_PLAYERS=8;
const clone=x=>JSON.parse(JSON.stringify(x));
const XP={easy:[100,200,250,450,450],normal:[150,250,350,700,600],hard:[200,300,400,1000,600]};
const PROFILES={
 animal:{name:'Обычное животное',human:false,ranged:false,boss:false,weapon:'',defense:'Без броска защиты',revenge:'50/50 в свой ход: последний попавший дальник'},
 animal_boss:{name:'Босс-животное',human:false,ranged:false,boss:true,weapon:'',defense:'Без броска защиты',revenge:'15% за попадание, до 100%; условная прибавка +25 п.п.'},
 melee:{name:'Воин с оружием',human:true,ranged:false,boss:false,weapon:'rusty_sword',defense:'Парирование: 15% урона при защите 19+',revenge:'15% за попадание, до 100%; условная прибавка +25 п.п.'},
 shield:{name:'Воин со щитом',human:true,ranged:false,boss:false,weapon:'rusty_sword',shield:true,defense:'Полный блок при защите 19+',revenge:'15% за попадание, до 100%; условная прибавка +25 п.п.'},
 archer:{name:'Стрелок',human:true,ranged:true,boss:false,weapon:'short_bow',defense:'Уклонение: 30% урона при защите 19+',revenge:'15% за попадание, до 100%; условная прибавка +25 п.п.'},
 mage:{name:'Маг',human:true,ranged:true,boss:false,weapon:'ambrosia_wand',defense:'Уклонение: 30% урона при защите 19+',revenge:'15% за попадание, до 100%; условная прибавка +25 п.п.'},
 boss:{name:'Разумный босс',human:true,ranged:false,boss:true,weapon:'rusty_sword',defense:'По оружию и щиту',revenge:'10% за попадание, до 100%; условная прибавка +25 п.п.'},
 flying:{name:'Летающее существо · заготовка',human:false,ranged:true,boss:false,weapon:'',draft:true,defense:'Будущее отдельное поведение',revenge:'В полёте недоступно ближним; подходящее дальнее управление приземляет. Пока не исполняется.'}
};
const SKILLS={
 king:{name:'Король',kind:'passive',description:'Постоянная прибавка к собственному броску атаки. Значение задаётся в параметрах навыков.'},
 attack:{name:'Обычная атака',kind:'basic',description:'Атака по текущим правилам попадания, защиты, контактов и перехватов.'},
 potion:{name:'Зелье лечения',kind:'extra',description:'Ниже 25% HP, при наличии зелья. Не заменяет основное действие.'},
 fear_howl:{name:'Устрашение',kind:'active',description:'Первый доступный собственный ход: атака и предупреждение. Следующий доступный ход: устрашение. Контроль откладывает применение.'},
 fury:{name:'Клич главаря',kind:'active',description:'Использует существующее правило клича и усиления союзников.'},
 deep_wound:{name:'Глубокая рана',kind:'passive',description:'10% после физического попадания с уроном: −1 HP три собственных хода. Лечение снимает рану.'},
 infected_wound:{name:'Гнойная рана',kind:'passive',description:'Существующая механика короля крыс: рана на пять собственных ходов и проверка болезни.'},
 head_stun:{name:'Удар по голове',kind:'passive',description:'15% оглушить на следующий собственный ход. Блок, парирование и уклонение предотвращают оглушение.'}
};
const PASSIVES={
 bard:{name:'Адский флекс',chance:.1,unlockLevel:2,description:'Обычное попадание инструментом: дезориентация на один собственный ход; последующий урон снимает.'},
 rogue:{name:'Рваная рана',chance:.1,unlockLevel:2,description:'Попадание: кровотечение 3% максимальных HP на три собственных хода. До окончания повторно не накладывается.'},
 archer:{name:'Тактическое превосходство',chance:.1,unlockLevel:2,description:'Один дополнительный обычный выстрел в конце раунда, без обновления хода и повторных тиков.'},
 warrior:{name:'Непробиваемый',chance:.1,unlockLevel:2,description:'Только со щитом: полностью блокирует прямой урон атаки. Физические эффекты удара блокируются, магические применяются по своим условиям.'},
 mage:{name:'Признак мастерства',chance:.1,unlockLevel:2,description:'Обычный успешный выстрел жезлом или посохом: +5 пунктов Арканы, максимум 100.'},
 priest:{name:'Истинная вера',chance:.1,unlockLevel:2,description:'Обычный успешный выстрел жезлом или посохом: +5 пунктов Веры, максимум 100.'}
};
function cap(n){if(!Number.isInteger(n)||n<1||n>8)throw Error('Партия: от 1 до 8 игроков');return [0,2,4,6,8,9,10,11,12][n];}
function checkCreature(c,allowDraft=true){
 if(!c||!/^[a-z][a-z0-9_]{1,29}$/.test(c.key||''))throw Error('Ключ: 2–30 символов, латиница, цифры и подчёркивания; начинается с буквы.');
 if(typeof c.name!=='string'||!c.name.trim()||c.name.length>60)throw Error('Имя: от 1 до 60 символов.');
 if(!Object.hasOwn(PROFILES,c.profile))throw Error('Неизвестный шаблон.');
 if(PROFILES[c.profile].draft&&!allowDraft)throw Error('Летающий тип пока только заготовка: его нельзя включить в расчёт.');
 for(const [k,min,max] of [['hp',1,5000],['atk',0,100],['init',-10,20],['potionHeal',0,5000]])if(!Number.isInteger(c[k])||c[k]<min||c[k]>max)throw Error('Некорректное поле '+k);
 if(!Array.isArray(c.skills)||c.skills.some(k=>!Object.hasOwn(SKILLS,k))||new Set(c.skills).size!==c.skills.length)throw Error('Неизвестные или повторные навыки.');
 if(!c.skills.includes('attack'))throw Error('Нужна обычная атака.');
 if((c.description||'').length>3000)throw Error('Описание слишком длинное.');
 if(!['rules','weakest','random'].includes(c.tactic||'rules'))throw Error('Неизвестная тактика.');
 for(const k of ['kingAttackBonus','fearPenalty'])if(c.params?.[k]!=null&&(!Number.isInteger(c.params[k])||c.params[k]<0||c.params[k]>10))throw Error('Параметр '+k+': целое число 0–10');
 return true;
}
function toEnemy(c){checkCreature(c,false);const p=PROFILES[c.profile];return {name:c.name,hp:c.hp,maxHP:c.hp,atk:c.atk,init:c.init,potionHeal:c.potionHeal,human:p.human,isRanged:p.ranged,isUnique:p.boss,cls:c.profile==='mage'?'mage':'',hasShield:!!p.shield,slots:{mainhand:p.weapon,...(p.shield?{offhand:'wooden_shield'}:{})},ai:{profile:c.profile,params:{kingAttackBonus:1,fearPenalty:1,...(c.params||{})},skills:c.skills.filter(k=>['fear_howl','fury'].includes(k)),passives:c.skills.filter(k=>SKILLS[k].kind==='passive'),allowPotion:c.skills.includes('potion'),tactic:c.tactic||'rules'},description:c.description||''};}
function fromEnemy(key,e){let profile=e.ai?.profile||e.aiProfile||(!e.human?(e.isUnique?'animal_boss':'animal'):e.isUnique?'boss':e.isRanged?'archer':'melee');if(!PROFILES[profile])profile='melee';const skills=['attack',...((e.ai?.allowPotion!==false)?['potion']:[]),...(e.ai?.skills||g.CombatRules?.ENEMY_ABILITY_DEFAULTS[key]||[])];skills.push(...(e.ai?.passives||({wild_wolf:['deep_wound'],direwolf:['deep_wound'],rat_king:['infected_wound','king'],bandit_leader:['head_stun']}[key]||[])));return {key,name:e.name,hp:e.hp??e.maxHP,atk:e.atk||0,init:e.init||0,potionHeal:e.potionHeal||0,profile,params:{kingAttackBonus:1,fearPenalty:1,...(e.ai?.params||{})},skills:[...new Set(skills)],tactic:e.ai?.tactic||'rules',description:e.description||''};}
function pack(creatures){creatures.forEach(c=>checkCreature(c));return {schema:'grivensburg-creatures/1',rulesVersion:VERSION,creatures:clone(creatures)};}
function readPack(p){if(p?.schema!=='grivensburg-creatures/1'||![VERSION,'workshop-1.1.0','workshop-1.0.0'].includes(p.rulesVersion)||!Array.isArray(p.creatures)||!p.creatures.length||p.creatures.length>500)throw Error('Нужен совместимый пакет «Крейча Креатора».');const keys=new Set();p.creatures.forEach(c=>{checkCreature(c);if(keys.has(c.key))throw Error('Повтор ключа '+c.key);keys.add(c.key);});return clone(p.creatures);}
g.Workshop=Object.freeze({VERSION,MAX_PLAYERS,XP,PROFILES,SKILLS,PASSIVES,cap,checkCreature,toEnemy,fromEnemy,pack,readPack});
})(typeof window!=='undefined'?window:globalThis);
