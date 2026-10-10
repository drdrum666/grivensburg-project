globalThis.window=globalThis; var GITHUB_URL='';

/* Built from baza/combat-rules.js */
/* ============================================================================
   ГРИВЕНСБУРГ — БОЕВОЙ ДВИЖОК  (версия — в VERSION ниже)
   ----------------------------------------------------------------------------
   ОБЩИЙ ФАЙЛ ДЛЯ client.html, server.html И streamer.html (и редактора
   баланса). Копий больше нет — правится здесь.
   После любой правки прогнать проверки движка (tools/run.js — он гоняет
   tools/tests.js) и убедиться, что всё зелёное.
   Живёт в baza/combat-rules.js и подключается ОБЫЧНЫМ тегом <script src>, а не
   модулем — только так файл открывается с диска двойным кликом.

   ЖЕЛЕЗНЫЕ ПРАВИЛА ЭТОГО БЛОКА:
     1. Ноль обращений к document / window / localStorage.
     2. Ноль обращений к Firebase.
     3. Ноль Math.random напрямую — генератор всегда приходит аргументом rng.
        Иначе бой невозможно протестировать.
     4. Ничего не мутирует. Каждая функция возвращает НОВЫЙ объект.
     5. Состояния не хранятся, а ВЫЧИСЛЯЮТСЯ из фактов (см. deriveEffects).
   ============================================================================ */
(function (global) {
'use strict';

/* ==========================================================================
   1. КОНСТАНТЫ ПРАВИЛ  (раздел 3 ТЗ)
   ========================================================================== */

var VERSION = 'engine-1.6.4';   /* Мораль волков: 50%, одна сохранённая проверка за раунд. */

/* Пороги броска. Численно одинаковы для 2d10 и d20 (раздел 3). */
var T = { crit: 19, hit: 11, graze: 7 };
var MULT = { crit: 1.5, hit: 1.0, graze: 0.5, miss: 0 };

/* Защита: 3 порога, сила снятия урона зависит от сложности комнаты. */
/* Пороги обкатаны на живой игре, не сдвигать: <=12 пробитие, 13-18 блок, >=19 парирование. */
var DEF_THRESHOLD = { parry: 19, block: 13 };
var DEF_POWER = {
    hard:   { block: 0.50, parry: 1.00 },
    normal: { block: 0.35, parry: 0.70 },
    easy:   { block: 0.25, parry: 0.50 }
};

var INTERCEPT_CHANCE   = 0.50;  // раздел 6: единый шанс в обе стороны
/* СРЫВ НА ТЫЛОВИКА. Раньше решался случайным броском: 60% если тыловик
   ранен, 40% если цел. Враг мог сорваться на здорового лучника просто так,
   и объяснить это за столом было нечем.

   Теперь считает СЕРИЯ ПОПАДАНИЙ, а бросок убран совсем:
     тыловик выше REVENGE_LOW_HP — нужна серия подряд
     тыловик ниже REVENGE_LOW_HP — срывается сразу, и босс тоже

   ЗЛОСТЬ — так автор назвал серию (решение 26.09.2026). Порог постоянный:
   3 попадания подряд обычному врагу, 5 — боссу. Раньше он зависел от
   строя (LINE_PRESSURE ниже): 3/2/1 и боссу +1. Автор: «пока записываем
   так» — таблица строя оставлена, но больше не участвует. */
var REVENGE_STREAK     = 3;     /* Злость: попаданий подряд обычному врагу */
var REVENGE_STREAK_BOSS = 5;    /* Злость: попаданий подряд боссу */
var REVENGE_LOW_HP     = 30;    /* % HP тыловика, ниже — срыв мгновенный */

/* Давление на линию = врагов на фронте / бойцов фронта. Чем плотнее
   насели, тем легче прорваться в тыл.
   СЕЙЧАС НЕ УЧАСТВУЕТ: порог Злости постоянный (см. выше). Оставлено на
   случай, если автор вернётся к зависимости от строя. */
var LINE_PRESSURE = [
    { upTo: 1.5, streak: 3 },   /* линия держит — надо долбить трижды */
    { upTo: 3,   streak: 2 },   /* обычно */
    { upTo: Infinity, streak: 1 } /* линия трещит — хватит одного попадания */
];

function linePressure(meleeEnemies, frontHeroes) {
    var front = Math.max(1, num(frontHeroes));
    return num(meleeEnemies) / front;
}

function revengeStreakNeeded(p) {
    /* Строй больше не влияет (решение автора 26.09.2026): 3, боссу 5. */
    return (p && p.isBoss) ? REVENGE_STREAK_BOSS : REVENGE_STREAK;
}
var PRESENCE_STACKS    = 4;     /* раздел 7: удар вешает сразу 4 стака,
                                   спадают по одному за ХОД САМОГО ВРАГА,
                                   а не за раунд */
var RAGE_BASE          = 10;    /* шкала Ярости воина: база */
var RAGE_PER_STEP      = 2;     /* +2 за каждую ступень силы: каждые 5 очков с 10 */
/* Стартовая ярость и правила её роста живут ниже, в разделе 12
   (rageOnBattleStart, rageAfter). Здесь только размер шкалы. */
var MOOD_BASE          = 15;    /* стартовая шкала Настроения барда */
/* Шкала растёт за каждую ступень харизмы. Ступень — это КАЖДЫЕ ПЯТЬ ОЧКОВ
   начиная с десяти: 10, 15, 20, 25 и дальше без потолка (см. statSteps,
   STAT_FLOOR = 10, STAT_STEP = 5).

   Здесь было перечисление «пороги 10, 15, 20», и читалось это как «дальше
   не растёт». Числа не перечисляем, чтобы список не разошёлся с формулой. */
var MOOD_PER_STEP      = 2;     /* +2 к шкале за ступень харизмы */
var MOOD_PER_ATTACK    = 1;     /* одна атака барда стоит 1 Настроения */
var MOOD_ALLY_SHARE    = 0.5;   /* выпил союзник — барду половина, вверх */
var MOOD_PER_ENEMY_DEATH = 2;   /* враг пал — барду +2 */
var MOOD_PER_ALLY_CRIT   = 1;   /* кто-то в партии кританул — барду +1 */
var MOOD_LOST_WHEN_HIT   = 1;   /* по барду попали — −1 */

/* Ключевые слова в id предмета -> роль (раздел 4). */
var WEAPON_KEYS = {
    frontal: ['shield', 'sword', 'axe', 'mace'],
    stealth: ['dagger', 'knife'],
    ranged:  ['bow', 'crossbow'],
    caster:  ['staff', 'wand']
};

/* Классы. Базовые статы + главный стат + вид ресурса.
   Мана считается у ВСЕХ классов, включая воина и барда — движок её не теряет,
   просто клиент воину и барду её не показывает (раздел 7). */
var CLASS_TABLE = {
    warrior: { name: 'Воин',   main: 'str', resource: 'rage', base: { str: 5, agi: 3, int: 2, cha: 0 } },
    /* Интеллект 2, как у всех. Стояла тройка — из-за неё у лучника всю
       игру было больше маны, чем у воина и барда, без всякой причины. */
    archer:  { name: 'Лучник', main: 'agi', resource: 'mana', base: { str: 2, agi: 5, int: 2, cha: 0 } },
    mage:    { name: 'Маг',    main: 'int', resource: 'mana', base: { str: 2, agi: 2, int: 5, cha: 0 } },
    priest:  { name: 'Жрец',   main: 'int', resource: 'mana', base: { str: 2, agi: 2, int: 5, cha: 0 } },
    /* Бард сложён как маг: сила и ловкость по 2. Интеллект как у воина.
       Харизма 5 — столько же, сколько главный стат у остальных классов. */
    bard:    { name: 'Бард',   main: 'cha', resource: 'mood', base: { str: 2, agi: 2, int: 2, cha: 5 } }
};

/* Из какой папки предметов класс может носить снаряжение.
   Первый подходящий тег засчитывается. */
var GEAR_FOLDERS = {
    warrior: ['warrior'],
    archer:  ['archer'],
    mage:    ['mage'],
    /* У ЖРЕЦА ДВЕ МЕТКИ, А НЕ ОДНА.

       Одежда у него общая с магом — тряпьё лежит в папке `mage`, оттуда и
       бралась. Но список работает ещё и меткой класса на предмете, и метка
       `priest` у жреца НЕ СРАБАТЫВАЛА: в списке её не было.

       Заметно это стало ровно на одном предмете — деревянном щите. В базе
       он прописан воину и жрецу, а на деле его брал только воин: у щита
       метки `mage` нет, и правило до жреца не доходило. Щит тяжёлый, носят
       его двое — так и задумано, просто второй его не получал.

       Прочие вещи с меткой `priest` несут рядом и `mage`, поэтому работали
       и раньше; книги идут по своему правилу, по назначению заклинания. */
    priest:  ['mage', 'priest'],
    bard:    ['bard']
};

var STATS = ['str', 'agi', 'int', 'cha'];

/* ==========================================================================
   2. МЕЛОЧЬ
   ========================================================================== */

/* ЧИСЛО ИЗ ЧЕГО УГОДНО, ноль вместо мусора.

   ДРОБИ БОЛЬШЕ НЕ ТЕРЯЮТСЯ. Здесь стоял `parseInt`, и любая дробь в движке
   молча становилась нулём. Тихо ломалось всё, что дробное:

     - сила крита от опьянения: на 60% прибавка 0.75 превращалась в 0, и
       пьяный крит бил ×1.5 вместо ×2.25 — то есть пьянство не давало
       НИЧЕГО из обещанного;
     - амулет «Синяя Слеза» с `critPower: 0.15` не давал ничего;
     - шанс задеть своего (0.02 … 0.15) обнулялся везде, где проходил
       через num.

   Хуже того, обнулялось ДО проверки: `if (num(m.critPower))` никогда не
   срабатывало, и прибавка даже не пыталась сложиться.

   Почему не поймали проверки: в tests.js свой `num` на `Number`. Проверка
   собирала ожидаемое число своей функцией и зеленела на сломанном расчёте.
   Правило должно жить в одном месте — здесь оно жило в двух.

   Берём `parseFloat`, а не `Number`: он, как и прежний `parseInt`, читает
   число с начала строки и не давится хвостом. Где нужно целое — округляем
   явно, а не надеемся на побочный эффект разбора. */
function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
/* Математическое округление вверх без ложного +1 от 14.000000000000002.
   Очень малый положительный эффект остаётся положительным (ceil → 1). */
function ceilGame(value) {
    var v=num(value), nearest=Math.round(v);
    return nearest!==0 && Math.abs(v-nearest)<=Number.EPSILON*Math.max(1,Math.abs(v))*4
        ? nearest : Math.ceil(v);
}
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

function keysOf(mainhand, offhand) {
    return [mainhand, offhand]
        .filter(function (k) { return !!k; })
        .map(function (k) { return String(k).toLowerCase(); });
}
function hasKeyword(ids, list) {
    return ids.some(function (id) {
        return list.some(function (w) { return id.indexOf(w) !== -1; });
    });
}

/* Бросок кубика. mode: 'd10' (2d10 => 2..20) | 'd20' (1..20). */
function rollDice(mode, rng) {
    var r = rng || Math.random;
    if (mode === 'd20') return { total: 1 + Math.floor(r() * 20), dice: null };
    var a = 1 + Math.floor(r() * 10), b = 1 + Math.floor(r() * 10);
    return { total: a + b, dice: [a, b] };
}
function diceMin(mode) { return mode === 'd20' ? 1 : 2; }

/* РАЗБОР ВВОДА БРОСКА — один на клиент и дашборд (ТЗ кубиков, пункт 19).

   D20 — одно целое от 1 до 20. 2D10 — ДВА целых через пробел, каждое от 1 до
   10: «8 9», «1 10». Одну общую сумму вроде «17» не принимаем: из неё не
   восстановить настоящую пару, а анимации и проверке честности нужны именно
   грани. Для попадания считается сумма — rawTotal.

   Возвращает { faces, rawTotal } или null. Сам по себе ничего не меняет: где
   его звать и как показывать отказ, решает экран. */
function parseRollInput(raw, mode) {
    if (mode === 'd20') {
        var t = String(raw === undefined || raw === null ? '' : raw).trim();
        if (!/^\d+$/.test(t)) return null;
        var n = Number(t);
        return (n >= 1 && n <= 20) ? { faces: [n], rawTotal: n } : null;
    }
    var части = String(raw === undefined || raw === null ? '' : raw).trim().split(/\s+/);
    if (части.length !== 2) return null;
    for (var i = 0; i < 2; i++) {
        if (!/^\d+$/.test(части[i])) return null;
        var v = Number(части[i]);
        if (v < 1 || v > 10) return null;
    }
    var a = Number(части[0]), b = Number(части[1]);
    return { faces: [a, b], rawTotal: a + b };
}

/* ==========================================================================
   3. РОЛЬ  (раздел 4)
   ЕДИНСТВЕННАЯ реализация на весь проект. Иконка роли берётся отсюда же,
   чтобы иконка и правило не могли разойтись (болячка №3).
   ========================================================================== */

function getRole(who, world) {
    var cls = who.cls;
    if (cls==='priest' && who.id && world && meleeAttackersOn(who.id,world.enemies)>0)return 'front';
    if (cls === 'priest' && (who.position === 'front' || who.position === 'back')) return who.position;
    var ids = keysOf(who.mainhand, who.offhand);
    if (cls === 'warrior') return 'front';                       // воин — всегда фронт
    if (hasKeyword(ids, WEAPON_KEYS.frontal)) return 'front';    // щит/меч/топор/булава
    if (hasKeyword(ids, WEAPON_KEYS.stealth)) return 'stealth';  // кинжал/нож
    return 'back';                                               // лук/посох/жезл/пусто
}

function roleIcon(role) {
    if (role === 'front') return '🛡️';
    if (role === 'stealth') return '🗡️';
    return '🏹';
}

/* Разбойник = лучник с кинжалами. Отдельного класса нет. */
/* Разбойником делает ВТОРОЙ кинжал, а не первый. С одним кинжалом лучник
   остаётся лучником: при нём и классовая инициатива, и никакой скрытности.
   Раньше роль stealth (а с ней Присутствие, невидимость и выбор цели)
   включалась уже с одного кинжала — это расходилось с правилом стола. */
function isRogue(who) {
    return who.cls === 'archer' && getRole(who) === 'stealth' && hasDualDaggers(who);
}

/* Два кинжала в руках — нужно для бонуса шанса крита (раздел 7). */
function hasDualDaggers(who) {
    var mh = String(who.mainhand || '').toLowerCase();
    var oh = String(who.offhand || '').toLowerCase();
    var isD = function (id) { return hasKeyword([id], WEAPON_KEYS.stealth); };
    return !!mh && !!oh && isD(mh) && isD(oh);
}

/* ==========================================================================
   4. ФИЛЬТР ПРЕДМЕТОВ  (болячка №6 — одна функция на весь проект)
   Используется И при надевании, И в магазине. Второй копии быть не должно.
   ========================================================================== */

/* Явный тип рук; fallback поддерживает старые каталоги комнат. */
function equipmentKind(item) {
    if (!item) return '';
    if (item.equipmentKind) return item.equipmentKind;
    var s=String(item.icon || '').toLowerCase();
    if (/hunt_knife/.test(s)) return 'tool_knife';
    if (/dagger|knife/.test(s)) return 'dagger';
    if (/shield/.test(s)) return 'shield';
    if (/crossbow|bow/.test(s)) return 'bow';
    if (/staff/.test(s)) return 'staff';
    if (/wand/.test(s)) return 'wand';
    if (/sword|axe|mace/.test(s)) return 'weapon';
    if (/lute/.test(s) || (item.slot==='mainhand' && (item.classes || []).indexOf('bard')>=0)) return 'instrument';
    if (item.isLight) return 'tool';
    if (item.slot==='offhand' && (/frog/.test(s) || (item.classes || []).some(function(c){return c==='mage'||c==='priest';}))) return 'focus';
    return '';
}
function canEquip(item, cls, slot) {
    if (!item) return false;
    if (cls==='rogue') cls='archer';
    if (slot) {
        var type=slot.indexOf('magic')===0?'magic':/^relic[12]$/.test(slot)?'relic':slot==='ring2'?'ring':slot;
        if(item.slot!==type && !(slot==='offhand' && item.slot==='mainhand' && !item.isTwoHanded))return false;
    }

    /* ДОСТУПНО ВСЕМ ТОЛЬКО ТО, ЧТО НЕ БРОНЯ: расходники, квестовое,
       бижутерия и реликвии.

       Пояс, перчатки и левая рука раньше стояли в этом же списке — и
       правило их вообще не спрашивало. В базе у них классы расписаны верно
       (воину латные перчатки, лучнику кожаные, магу с жрецом ветхие), но
       проверка до них не доходила: бард спокойно надевал латные перчатки и
       железный пояс, а щит воина брал кто угодно.

       Теперь броня целиком идёт по папке класса, как и задумано: воин в
       латах, лучник в коже, маг с жрецом и бардом в тряпье. */
    if (item.type === 'consumable' || item.type === 'quest') return true;
    if (item.slot === 'ring' || item.slot === 'amulet' || item.slot === 'relic') return true;

    if (item.slot==='mainhand' || item.slot==='offhand') {
        var kind=equipmentKind(item), kinds={warrior:['weapon','shield'],archer:['dagger','bow'],
            mage:['staff','wand','focus'],priest:['weapon','staff','wand','shield','focus'],bard:['instrument']};
        /* Инструменты можно купить для рюкзака. Нож как оружие — только лучнику. */
        if (kind==='tool_knife') return !slot || cls==='archer';
        if (kind==='tool') return !slot || cls!=='priest';
        /* Магический посох доступен жрецу; двуручное оружие воина — нет. */
        if (cls==='priest' && item.isTwoHanded && kind!=='staff') return false;
        if (kind && (kinds[cls] || []).indexOf(kind)<0) return false;
        if (slot==='offhand' && cls==='priest' && ['shield','focus'].indexOf(kind)<0)return false;
        if (slot==='offhand' && item.slot==='mainhand' && !((cls==='archer' && kind==='dagger') || (cls==='warrior' && kind==='weapon')))return false;
        if (kind) return true;
    }

    /* Магия — по назначению заклинания. */
    if (item.slot === 'magic') {
        if (item.subtype === 'utility') return cls === 'warrior';   // агро
        if (item.subtype === 'heal')    return cls === 'priest';
        if (item.subtype === 'buff' || item.subtype === 'debuff') return cls === 'bard';
        return cls === 'mage' || cls === 'priest';                  // атакующая
    }

    /* Снаряжение — по папке класса. Тег 'all' означает «доступно всем». */
    var folders = GEAR_FOLDERS[cls] || [];
    if (!item.classes) return false;
    if (item.classes.indexOf('all') !== -1) return true;
    return folders.some(function (f) { return item.classes.indexOf(f) !== -1; });
}

/* Не удаляет вещи из инвентаря: снимает только недопустимое снаряжение. */
function legalHeroSlots(player, items) {
    var p=player || {}, out=Object.assign({},p.slots || {});
    Object.keys(out).forEach(function(slot){
        if(out[slot] && !canEquip((items || {})[out[slot]],p.cls,slot))out[slot]='';
    });
    if(((items || {})[out.mainhand] || {}).isTwoHanded)out.offhand='';
    return out;
}
function heroEquipmentVitals(player, items, world) {
    var p=player || {}, total=heroStats(p,items).total;
    var base=computeVitals({cls:p.cls,total:total});
    var prayer=prayerBonus(p,world || {},base.maxHP,total.int);
    var vitals=computeVitals({cls:p.cls,total:Object.assign({},total,{int:total.int+prayer.int})});
    vitals.maxHP+=prayer.hp;
    return Object.assign(vitals,sicknessVitals(vitals,p,world || {}));
}
function equipmentVitalsFacts(player, items, world) {
    var p=player || {}, v=heroEquipmentVitals(p,items,world);
    return {hp:clampToMax(p.hp,v.maxHP),mp:clampToMax(p.mp,v.maxMP),
        maxHP:v.maxHP,maxMP:v.maxMP,resource:clampToMax(p.resource,v.maxResource)};
}
/* Смена снаряжения сохраняет потраченные HP/MP: прибавка максимума
   пополняет ресурс, уменьшение снимает ту же величину. Если снять уже
   потраченный бонус у нижней границы, остаток запоминается: повторное
   надевание не создаёт лечение из воздуха. Полное восстановление снимает
   этот остаток. Снятие вещи не убивает, надевание не воскрешает. */
function sameEquipmentSlots(a, b) {
    a=a || {}; b=b || {};
    return Object.keys(Object.assign({},a,b)).every(function(k){return (a[k] || '')===(b[k] || '');});
}
function changeEquipmentFacts(player, slots, items, world) {
    var p=player || {}, before=heroEquipmentVitals(p,items,world);
    var after=heroEquipmentVitals(Object.assign({},p,{slots:slots}),items,world);
    var debt=Object.assign({hp:0,mp:0},p.equipmentDebt || {}), facts={};
    ['hp','mp'].forEach(function(k){
        var maxKey=k==='hp'?'maxHP':'maxMP', oldMax=before[maxKey], max=after[maxKey];
        var current=clampToMax(p[k],oldMax), floor=k==='hp' && current>0 ? Math.min(1,max) : 0;
        var rest=Math.max(0,num(debt[k]));
        if(current>=oldMax && oldMax>0)rest=0;
        if(k==='hp' && current<=0){facts.hp=0;debt.hp=0;return;}
        var delta=max-oldMax;
        if(delta>0){var used=Math.min(rest,delta);rest-=used;current+=delta-used;}
        else if(delta<0){current+=delta;if(current<floor){rest+=floor-current;current=floor;}}
        facts[k]=Math.max(floor,Math.min(max,current));debt[k]=rest;
    });
    return Object.assign(facts,{maxHP:after.maxHP,maxMP:after.maxMP,
        resource:clampToMax(p.resource,after.maxResource),equipmentDebt:debt,
        relicUsedDay:relicCooldowns(p)});
}

/* ==========================================================================
   5. ХАРАКТЕРИСТИКИ  (раздел 8)
   ========================================================================== */

/* Рост статов. Числа расписаны внутри функции, у самого цикла — здесь их
   намеренно НЕТ, чтобы не было второго места, которое надо не забыть
   поправить. Тут стояло «главный +1 за уровень, остальные +1 каждые три»:
   правило отменено, а подпись пережила его и врала читающему. */
function computeStats(p) {
    var cls = CLASS_TABLE[p.cls] ? p.cls : 'warrior';
    var tbl = CLASS_TABLE[cls];
    var race = p.raceBonus || RACE_BONUSES[p.race] || {};
    var gear = p.gearStats || {};
    var lvl = Math.max(1, num(p.level));

    /* РОСТ СТАТОВ. Главный +2 за уровень, каждый побочный +1 за уровень.
       Было: главный +1, побочные +1 каждые три уровня — побочные почти не
       росли, и половина партии всю игру сидела с нулевой инициативой.

       ЖРЕЦ РАЗМЕНИВАЕТ интеллект на силу: чётный уровень +2 и +2,
       нечётный +1 и +1. Поэтому он крепче мага, но беднее маной — ровно
       посередине между ним и воином. */
    var base = {}, total = {};
    var grown = {};
    STATS.forEach(function (s) { grown[s] = num(tbl.base[s]); });

    for (var lv = 2; lv <= lvl; lv++) {
        if (cls === 'priest') {
            var big = (lv % 2 === 0);
            grown.int += big ? 2 : 1;
            grown.str += big ? 2 : 1;
            grown.agi += 1;
            grown.cha += 1;
        } else {
            STATS.forEach(function (s) {
                grown[s] += (tbl.main === s) ? 2 : 1;
            });
        }
    }

    STATS.forEach(function (s) {
        base[s] = grown[s] + num(race[s]);
        total[s] = base[s] + num(gear[s]);
    });
    return { base: base, gear: gear, total: total, mainStat: tbl.main };
}

/* Общая версия максимума/миграция: расчёт с нуля, запись — у вызывающего.
   Расовые бонусы пока нулевые, но все экраны используют одну таблицу. */
var HP_FORMULA_VERSION = 2;
var RACE_BONUSES = { human:{str:0,agi:0,int:0,cha:0}, orc:{str:0,agi:0,int:0,cha:0},
    drow:{str:0,agi:0,int:0,cha:0}, elf:{str:0,agi:0,int:0,cha:0} };
var HERO_XP = [0,1000,2500,5200,9200,14700,21700,30200,40200,52200,66200,82200,
    100200,121200,145200,172200,202200,237200,277200,322200];
function heroLevel(player) {
    var p=player || {}, level=1;
    if (p.xp == null) return Math.max(1,num(p.level) || 1);
    HERO_XP.forEach(function(x,i){if(num(p.xp)>=x)level=i+1;});
    return level;
}
function heroStats(player, items) {
    var p=player || {}, gear={str:0,agi:0,int:0,cha:0};
    Object.keys(p.slots || {}).filter(function(slot){return slot.indexOf('magic')!==0;}).forEach(function(slot){
        var it=(items || {})[p.slots[slot]] || {}, st=it.stats || {};
        STATS.forEach(function(k){gear[k]+=num(st[k]);});
    });
    return computeStats({cls:p.cls,level:heroLevel(p),race:p.race,raceBonus:p.raceBonus,gearStats:gear});
}
function strengthMaxHP(strength, player, world, legacy) {
    var base=ceilGame(10+num(strength)*(legacy ? 2 : 3));
    var normal=base+prayerBonus(player || {},world || {},base,0).hp;
    return sicknessMaxHP(normal,player || {},world || {});
}
function upgradeHeroState(player, items, world) {
    var p=player || {}, facts={};
    if(p.relicUsedDay && JSON.stringify(p.relicUsedDay)!==JSON.stringify(relicCooldowns(p)))
        facts.relicUsedDay=relicCooldowns(p);
    if (num(p.hpFormulaVersion)<HP_FORMULA_VERSION) {
        var strength=heroStats(p,items).total.str;
        var oldMax=strengthMaxHP(strength,p,world,true), nextMax=strengthMaxHP(strength,p,world,false);
        var hp=num(p.hp);
        facts.hp=p.hp == null ? nextMax : hp>0 && hp===oldMax ? nextMax : Math.max(0,Math.min(hp,nextMax));
        facts.maxHP=nextMax; facts.hpFormulaVersion=HP_FORMULA_VERSION;
    }
    if(p.cls==='priest' && p.position!=='front' && p.position!=='back')
        facts.position=getRole({cls:p.cls,mainhand:(p.slots || {}).mainhand,offhand:(p.slots || {}).offhand});
    var legal=legalHeroSlots(p,items);
    if (JSON.stringify(legal)!==JSON.stringify(p.slots || {})) {
        facts.slots=legal;
        Object.assign(facts,equipmentVitalsFacts(Object.assign({},p,facts),items,world));
    }
    return facts;
}
/* Полные снимки героя в квитанциях тоже мигрируют: отмена старой операции
   не должна вернуть старую версию формулы и повторно заполнить HP. */
function upgradeHeroTree(value, items, world) {
    if(!value || typeof value!=='object')return value;
    var out=Array.isArray(value) ? [] : {};
    Object.keys(value).forEach(function(k){out[k]=upgradeHeroTree(value[k],items,world);});
    if(CLASS_TABLE[out.cls] && ('hp' in out) && ('slots' in out || 'xp' in out))
        Object.assign(out,upgradeHeroState(out,items,world));
    return out;
}

/* HP: 10 + сила×3 у ВСЕХ классов, жрецу прибавки за интеллект нет.
   Мана: интеллект×2 у всех. Очко в очко, без процентов (см. computeVitals). */
/* ══════════════════════════════════════════════════════════════════════
   СТУПЕНИ СТАТОВ: первая на 10, дальше каждые 5 (10, 15, 20, 25…).

   Считаем от ИТОГОВОГО стата — значит ступень можно добрать снаряжением, а
   не только уровнем.

   HP и ману ступени НЕ трогают. От ступеней растут:
      сила       шкала Ярости воина: 10 + 2 за ступень
      харизма    шкала Настроения барда: 15 + 2 за ступень
      интеллект  Аркана мага за каст: +2 за ступень (за фокус +1)
   Инициатива и порог крита считаются от ловкости напрямую, без ступеней
   (см. computeCombatValues).

   Было: проценты за каждые полные 10 пунктов (+10% HP за силу, +10% маны
   за интеллект и т.д.). Отменены — шкалы считаются очко в очко. */
var STAT_STEP = 5;
var STAT_FLOOR = 10;
/* Ресурсные ступени начинаются на 10, затем 15, 20, 25 и далее. */
function statSteps(v) {
    var n = num(v);
    return n < STAT_FLOOR ? 0 : Math.floor((n - STAT_FLOOR) / STAT_STEP) + 1;
}

function computeVitals(p) {
    var cls = CLASS_TABLE[p.cls] ? p.cls : 'warrior';
    var t = p.total || { str: 0, agi: 0, int: 0, cha: 0 };

    /* ШКАЛЫ СЧИТАЮТСЯ ОЧКО В ОЧКО, без процентов и множителей.

       Было: проценты за ступени статов и множитель маны у мага и жреца.
       Проценты почти ничего не давали тем, у кого стат побочный — бард и
       лучник получали +1 HP за всю игру, — зато разгоняли разрыв у тех,
       кто его качает. Множители делали то же самое с маной.

       Классы теперь различаются РОСТОМ СТАТОВ, а не коэффициентами:
       у жреца свой размен интеллекта на силу, и этого достаточно. */
    var maxHP = ceilGame(10 + num(t.str) * 3);
    var maxMP = ceilGame(num(t.int) * 2);

    /* Шкалы ресурсов растут от своего стата одинаково: +2 за ступень.
       Ярость — от силы, Настроение — от харизмы. Раньше ярость была
       жёсткой константой с пометкой «формула не согласована». */
    var kind = CLASS_TABLE[cls].resource;
    var maxResource = kind === 'rage' ? (RAGE_BASE + statSteps(t.str) * RAGE_PER_STEP)
                    /* Настроение: 15 + 2 за СТУПЕНЬ харизмы, как ярость от
                       силы (решение автора 27.09.2026, «как в гайде»). Было
                       +1 за каждое очко: бард с 10 харизмы начинал с 25, а
                       к 15 уровню шкала раздувалась до 48 против 25. */
                    : kind === 'mood' ? (MOOD_BASE + statSteps(t.cha) * MOOD_PER_STEP)
                    : maxMP;
    /* hpBonus и mpBonus остаются нулями: пороговых прибавок больше нет, а
       поля читает интерфейс — выбрасывать их значит ломать его молча. */
    return { maxHP: maxHP, maxMP: maxMP, resourceKind: kind, maxResource: maxResource,
             hpBonus: 0, mpBonus: 0 };
}

/* Стойкость (steadfast): постоянная классовая защита от итогового стата.
   Воин — сила, жрец — интеллект; +1 на 15, 25, 35 и далее. */
function steadfastDefense(cls, total) {
    var t = total || {};
    var stat = cls === 'warrior' ? t.str : cls === 'priest' ? t.int : 0;
    return Math.max(0, Math.floor((num(stat) - 5) / 10));
}

/* Производные боевые числа. Порог крита снижается шансом крита. */
function computeCombatValues(p) {
    var cls = CLASS_TABLE[p.cls] ? p.cls : 'warrior';
    var t = p.total || {};
    var gear = p.gear || {};

    var rogue = !!p.isRogue;
    /* Разбойник — это лучник С ДВУМЯ КИНЖАЛАМИ, отдельного класса нет. */
    var dualRogue = rogue && !!p.dualDaggers;

    /* История порога крита: сначала он рос за уровень персонажа (не зависел
       ни от вещей, ни от кинжалов), потом — по −1 за каждые 10 ловкости и
       только у разбойника. Оба правила отменены; действует то, что ниже. */
    /* ПОРОГ КРИТА: −1 за каждые полные 15 ловкости, у ВСЕХ классов.
       Разбойнику дополнительно −1 сразу за второй кинжал — это его размен
       за потерянную классовую инициативу лучника. */
    var critChance = num(gear.critChance)
        + Math.floor(num(t.agi) / 15)
        + (dualRogue ? 1 : 0);

    /* Лучник получает +1 к инициативе с первого уровня — это его классовый
       бонус. Взял два кинжала: бонус УХОДИТ, взамен −1 к порогу крита.
       В этом и размен: стрелок ходит раньше, разбойник бьёт больнее. */
    /* Инициатива считается прямо от ловкости, а не по ступеням статов:
       ступени начинаются с десятки, и на старте инициативы не было бы ни у
       кого. Здесь стояло «классового +1 лучнику больше нет, разбойник
       ничего не теряет» — неверно: единица есть, и разбойник её теряет. */
    /* ИНИЦИАТИВА: +1 за каждые полные 5 ловкости у всех, плюс классовая
       единица лучника. Взяв второй кинжал, он становится разбойником и
       ЭТУ единицу теряет — взамен получает крит. Размен читается: кинжалы
       подбираются, а не стреляют первыми. */
    var init = Math.floor(num(t.agi) / 5) + num(gear.init)
        + (cls === 'archer' && !dualRogue ? 1 : 0);

    var lightBonus = (p.isDark && p.hasLight) ? 2 : 0;

    return {
        atk: num(gear.atk) + lightBonus,
        def: num(gear.def) + steadfastDefense(cls, t),
        init: init,
        luck: num(gear.luck),
        critChance: critChance,
        critPower: num(gear.critPower),
        critThreshold: T.crit - critChance,
        lightBonus: lightBonus
    };
}

/* ==========================================================================
   6. СЛОИСТЫЙ РАСЧЁТ БРОСКА  (раздел 2 — ГЛАВНОЕ ТРЕБОВАНИЕ)

   БРОСОК -> [БАЗОВЫЙ] -> [РОЛЬ] -> [КЛАСС] -> [ЭФФЕКТЫ] -> finalize()

   Слои НЕ определяют исход. Они только накапливают поправки в аккумуляторе.
   Исход считает finalize() ОДИН раз, из финальных чисел. Поэтому «забыть
   сбросить» нечего: каждый вызов начинается с чистого аккумулятора.
   ========================================================================== */

function newAcc(raw) {
    return {
        raw: raw,           // что реально выкинул игрок
        total: raw,         // бросок + все поправки
        critThreshold: T.crit,
        critPower: 0,
        damageBonus: 0,
        baseDamage: 0,
        flags: [],
        parts: []           // разложение для карточки броска
    };
}
function part(acc, layer, label, value) {
    acc.parts.push({ layer: layer, label: label, value: (value === undefined ? null : value) });
    return acc;
}
function flag(acc, name) { if (acc.flags.indexOf(name) === -1) acc.flags.push(name); return acc; }

/* --- Слой 1: БАЗОВЫЙ ---------------------------------------------------- */
function layerBase(acc, ctx) {
    var a = ctx.attacker;
    part(acc, 'base', 'Бросок', acc.raw);
    if (num(a.combat.atk)) { acc.total += num(a.combat.atk); part(acc, 'base', 'Атака', num(a.combat.atk)); }
    if (num(a.combat.luck)) { acc.total += num(a.combat.luck); part(acc, 'base', 'Удача', num(a.combat.luck)); }
    if (num(a.combat.critChance)) {
        acc.critThreshold -= num(a.combat.critChance);
        part(acc, 'base', 'Шанс крита', -num(a.combat.critChance));
    }
    acc.critPower += num(a.combat.critPower);

    /* Базовый урон: физика — главный стат, магия — урон заклинания
       (spellDamage, запасной 6) + интеллект. */
    if (ctx.action === 'spell') {
        /* СВОЙ УРОН У КАЖДОГО ЗАКЛИНАНИЯ. Здесь стояла шестёрка для всех
           без разбора: огненная стрела (тогда ещё «огненный шар») и
           ледяной шип били одинаково, хотя у шипа удар слабее, зато он
           морозит. Число берём из самого заклинания, шестёрка остаётся
           запасной — для старых свитков, у которых поля ещё нет. */
        var spellBase = num((ctx.spell || {}).spellDamage) || 6;
        acc.baseDamage = spellBase + num(a.total.int);
        part(acc, 'base', 'Урон магии (' + spellBase + '+инт)', acc.baseDamage);
    } else {
        /* ЧЕМ БЬЁТ. Правило боя без оружия жило только здесь, в движке, и
           его не звал никто: бард без лютни бил всей харизмой, воин без
           меча — всей силой. Теперь решает единый расчёт удара — по рукам,
           которые передал зовущий. Рук не передали — считаем, что оружие
           есть, как было: читающая сторона переживает отсутствие полей. */
        var руки = armedState(a);
        if (руки === 'none') {
            acc.baseDamage = 0;
            flag(acc, 'no_attack');
            part(acc, 'base', 'Без инструмента не дерётся', 0);
        } else if (руки === 'bare') {
            acc.baseDamage = unarmedDamage(a, a.total);
            part(acc, 'base', 'Урон без оружия (половина стата)', acc.baseDamage);
        } else {
            acc.baseDamage = num(a.total[a.mainStat]);
            part(acc, 'base', 'Урон (главный стат)', acc.baseDamage);
        }
    }
    return acc;
}

/* --- Слой 2: РОЛЬ ------------------------------------------------------- */
function layerRole(acc, ctx) {
    var role = ctx.attacker.role;
    var tgt = ctx.target || {};
    if (role === 'front' && tgt.role === 'back') {
        flag(acc, 'intercept_check');           // раздел 6, случай А
        part(acc, 'role', 'Прорыв к дальнему — возможен перехват');
    }
    if (role === 'stealth') {
        flag(acc, 'applies_presence');          // раздел 7
        part(acc, 'role', 'Скрытная атака');
    }
    /* «АТАКА С ДИСТАНЦИИ» УБРАНА ИЗ ОКНА. Строка не несла числа и ничего не
       добавляла: то, что герой бьёт из задней линии, игрок и так видит по
       своей роли. Вместе со строкой ниже про силу музыки она давала барду
       две подписи подряд об одном и том же. Правило не менялось — исчезла
       только подпись. */
    return acc;
}

/* --- Слой 3: КЛАСС ------------------------------------------------------ */
function layerClass(acc, ctx) {
    var a = ctx.attacker;
    /* ФЛАГ ОСТАЁТСЯ, ПОДПИСЬ УХОДИТ. «Сила музыки (дальняя)» тоже была без
       числа и повторяла то же, что и убранная «Атака с дистанции»: бард
       бьёт издалека. Сам флаг `ranged_music` не трогаем — он часть правила,
       а не оформления. */
    if (a.cls === 'bard') flag(acc, 'ranged_music');

    /* БАРД НА ПУСТОМ НАСТРОЕНИИ ВСЁ РАВНО БЬЁТ.

       Раньше на нуле он не мог вообще ничего, кроме защиты, — то есть
       выбывал из боя, пока кто-нибудь не нальёт. Игрок сидел и смотрел.

       Теперь бьёт, но с −1 к броску. Крит снимается ОТДЕЛЬНЫМ правилом
       (флаг no_crit ниже): одной единицы в итоге не хватает, чтобы до
       порога не достать.

       На ПЕСНИ это не распространяется: у них своя цена в Настроении, её
       стережёт canSing. Здесь речь только про удар. */
    if (a.cls === 'bard' && ctx.action !== 'spell' && num(a.resource) <= 0) {
        acc.total += BARD_EMPTY_MOOD;
        part(acc, 'class', 'Пустое Настроение', BARD_EMPTY_MOOD);
        /* КРИТА НА ПУСТОЙ ШКАЛЕ НЕТ.

           Замысел был такой: поправка идёт в итог, а крит считается от
           итога — значит двадцатка станет девятнадцатью и до порога не
           достанет. Одной единицы для этого НЕ ХВАТАЕТ: порог крита 19, а
           не 20, и девятнадцать его как раз берут. У пьяного или разбойника
           порог ещё ниже.

           Поэтому крит снимаем прямо: на пустом Настроении его нет. */
        flag(acc, 'no_crit');
    }

    if (ctx.action === 'spell' && ctx.spell && num(ctx.spell.power)) {
        acc.damageBonus += num(ctx.spell.power);
        part(acc, 'class', 'Сила заклинания', num(ctx.spell.power));
    }
    return acc;
}

/* --- Слой 4: ЭФФЕКТЫ ---------------------------------------------------- */
function layerEffects(acc, ctx) {
    /* Опьянение и Бадун не лежат в effects — они вычисляются из ступени и
       номера боя, поэтому подмешиваются здесь и залипнуть не могут.

       Дубли по id отбрасываются. Вызывающий может передать те же эффекты
       готовым списком (так делают клиент и дашборд: у них список приходит из
       derivePlayerEffects). Без этой защиты штраф применился бы ДВАЖДЫ, и
       заметить это было бы почти невозможно — бросок просто оказался бы
       ниже, чем показывает карточка. */
    var list = (ctx.attacker.effects || []).slice();
    var seen = {};
    list.forEach(function (e) { if (e && e.id) seen[e.id] = true; });
    deriveDrunkEffects(ctx.attacker, ctx.world).forEach(function (e) {
        if (!seen[e.id]) list.push(e);
    });
    list.forEach(function (e) {
        var m = e.modifiers || {};
        if (num(m.atk)) { acc.total += num(m.atk); part(acc, 'effect', e.tooltip || e.id, num(m.atk)); }
        if (num(m.dmg)) { acc.damageBonus += num(m.dmg); part(acc, 'effect', (e.tooltip || e.id) + ' (урон)', num(m.dmg)); }
        if (num(m.critChance)) { acc.critThreshold -= num(m.critChance); part(acc, 'effect', (e.tooltip || e.id) + ' (крит)', -num(m.critChance)); }
        if (num(m.critPower)) acc.critPower += num(m.critPower);
        (e.flags || []).forEach(function (f) { flag(acc, f); });
    });
    if (ctx.action === 'phys' && ctx.target && ctx.target.kind === 'enemy'
        && isBowArcher(ctx.attacker) && hunterMarkActive(ctx.attacker, ctx.world, ctx.target.id)) {
        acc.total += HUNTER_MARK_BONUS;
        part(acc, 'effect', 'Метка охотника', HUNTER_MARK_BONUS);
    }
    return acc;
}

var LAYERS = [layerBase, layerRole, layerClass, layerEffects];

/* --- Итог --------------------------------------------------------------- */
function finalize(acc) {
    var outcome, mult;
    /* Флаг `no_crit` ставит тот, кто по правилу крит запрещает — сейчас это
       бард на пустом Настроении. Проверяем ЗДЕСЬ, в одном месте, где исход
       и решается: иначе каждое такое правило лезло бы в пороги по-своему. */
    var критМожно = acc.flags.indexOf('no_crit') === -1;
    /* `no_attack` — бить нечем вовсе (бард без инструмента): удар не
       состоялся, что бы ни выпало. Промах, а не попадание на ноль — иначе
       «попал — не пустил» при разрыве боя сработало бы от пустых рук. */
    if (acc.flags.indexOf('no_attack') !== -1)                    { outcome = 'miss';  mult = MULT.miss; }
    else if (критМожно && acc.total >= acc.critThreshold) { outcome = 'crit';  mult = MULT.crit + acc.critPower; }
    else if (acc.total >= T.hit)        { outcome = 'hit';   mult = MULT.hit; }
    else if (acc.total >= T.graze)      { outcome = 'graze'; mult = MULT.graze; }
    else                                { outcome = 'miss';  mult = MULT.miss; }

    var exact=Math.max(0,(acc.baseDamage + acc.damageBonus) * mult), dmg=ceilGame(exact);
    return {
        raw: acc.raw,
        total: acc.total,
        critThreshold: acc.critThreshold,
        outcome: outcome,
        mult: mult,
        damage: Math.max(0, dmg), damageExact:exact,
        hit: outcome !== 'miss',
        flags: acc.flags,
        parts: acc.parts
    };
}

/* Единственная точка расчёта атаки. */
function exactDamage(result) { return num(result.damageExact == null ? result.damage : result.damageExact); }
function scaleDamage(result, mult) {
    result.damageExact=Math.max(0,exactDamage(result)*num(mult));
    result.damage=ceilGame(result.damageExact);
    return result;
}
function resourceCost(value) { return Math.max(0,ceilGame(value)); }
function resolveRoll(ctx) {
    var acc = newAcc(num(ctx.roll));
    for (var i = 0; i < LAYERS.length; i++) acc = LAYERS[i](acc, ctx);
    return finalize(acc);
}

/* ==========================================================================
   7. ЗАЩИТА  (раздел 3)
   ========================================================================== */

function resolveDefense(p) {
    var power = DEF_POWER[p.difficulty] || DEF_POWER.normal;
    var dmg = Math.max(0, exactDamage(p));
    if (p.canDefend === false) {
        return { outcome: 'none', label: 'Защита невозможна', reduced: 0, damageTaken: ceilGame(dmg) };
    }
    /* defMod — поправка от опьянения и Бадуна, считается defenseModifier(). */
    var roll = num(p.roll) + num(p.defMod), cut = 0, outcome = 'fail', label = 'Полный урон';
    if (roll >= DEF_THRESHOLD.parry) { cut = power.parry; outcome = 'parry'; label = 'Парирование'; }
    else if (roll >= DEF_THRESHOLD.block) { cut = power.block; outcome = 'block'; label = 'Блок'; }
    var taken = Math.max(0, ceilGame(dmg * (1 - cut)));
    return { outcome: outcome, label: label, cutPercent: Math.round(cut * 100), reduced: ceilGame(dmg) - taken, damageTaken: taken };
}

/* ==========================================================================
   8. ЭФФЕКТЫ — ВЫЧИСЛЯЮТСЯ, А НЕ ХРАНЯТСЯ  (разделы 6, 9; болячка №1)

   В базе лежат только ФАКТЫ:
       enemy.presence = { by, count, setRound }
       enemy.interceptAttemptedForTarget = <id цели, на которой была попытка>
   Активность считается сравнением с текущим раундом / текущим таргетом.
   Сменился раунд или цель — эффект перестал быть активным САМ.
   Снимать нечего, значит нечего и забыть снять.
   ========================================================================== */

var EFFECT_ICONS = {
    presence:  'assets/gear/spells/near.png',
    intercept: 'assets/gear/spells/already_catch.png',
    stealth:   'assets/gear/spells/shadowpng.png',
    frostbite: 'assets/gear/spells/icebolt.png',
    ready:     'assets/gear/spells/ready.png',
    hamstring: 'assets/gear/spells/immobilized.png',
    hunterMark: 'assets/gear/spells/target.png',
    burn:      'assets/gear/spells/burn.png',
    deep_wound: 'assets/gear/spells/deep_wound.png',
    infected_wound: 'assets/gear/spells/infected_wound.png',
    sickness: 'assets/gear/spells/sickness.png',
    hangover:  'assets/gear/spells/hangover .png',
    fury:      'assets/gear/spells/banditos_fury.png',
    howl:      'assets/gear/spells/wolf_howl.png',
    king:      'assets/icons/rat_king_icon.png',
    giant:     'assets/icons/bossbandit_icon.png',
    fear:      'assets/icons/alfawolf_icon.png',
    surrounded: 'assets/gear/spells/surrounded.png',
    shield:     'assets/gear/spells/total_defense.png',
    drunk:      'assets/interface/drunk.png',
    /* Молитвы жреца — картинки автора. */
    god_protection: 'assets/gear/spells/holly_deff.png',
    god_wisdom:     'assets/gear/spells/holly_arcane.png'
};

/* ══════════════════════════════════════════════════════════════════════
   ПОСТОЯННЫЕ БАФЫ БОССОВ

   Король и Гигант действуют весь бой. Устрашение включается отдельным
   воем на третьем собственном ходу Лютоволка и связано с его источником.

   Король (Царский Пацюк)  +1 к своему броску атаки
   Гигант (Главарь)        +1 к своей защите
   Аура устрашения (Лютоволк) -1 к броску ВСЕХ ИГРОКОВ после воя, пока жив

   Первые два висят на самом враге и идут через enemyRollModifier вместе с
   яростью и маршем. Третий устроен иначе: он бьёт по чужой стороне, поэтому
   живёт отдельной функцией fieldAuras() — её результат подмешивается в
   effects игрока, как это делают опьянение и песни барда.
   ══════════════════════════════════════════════════════════════════════ */

var BOSS_AURAS = {
    rat_king:      { id: 'king',  name: 'Король', icon: EFFECT_ICONS.king,
                     tooltip: 'Король: +1 к броску атаки', modifiers: { atk: 1 } },
    bandit_leader: { id: 'giant', name: 'Гигант', icon: EFFECT_ICONS.giant,
                     tooltip: "Гигант: +1 к защите", modifiers: { def: 1 } }
};

/* Ключ врага, чья аура давит на игроков, и сама аура. */
var FEAR_SOURCE = 'direwolf';
var FEAR_AURA = { id: 'fear', kind: 'debuff', duration:'while', name: 'Аура устрашения',
                  icon: EFFECT_ICONS.fear, tooltip: 'Аура устрашения: -1 к броску',
                  modifiers: { atk: -1 } };

/* Источник хранит факт воя. Стан/дезориентация подавляют ауру, но не
   стирают её; обморожение не мешает сознанию. Несколько источников не
   складывают прежний штраф -1. Мёртвый источник не заменяется живым,
   который ещё не выл. */
function fieldAuras(enemies, world) {
    if (world && world.battleOpen === false) return [];
    var sources = (enemies || []).filter(function (e) {
        return e && e.key === FEAR_SOURCE && enemyAlive(e) && e.fearHowl
            && (!world || world.battleNo == null || num(e.fearHowl.battleNo) === num(world.battleNo));
    });
    if (!sources.length) return [];
    var awake = sources.filter(function (e) { return !isEnemyDisabled(e); });
    var source = awake[0] || sources[0];
    var effect = Object.assign({}, FEAR_AURA, { sourceId: source.fearHowl.sourceId,
        sourceIds: sources.map(function (e) { return e.fearHowl.sourceId; }) });
    if (!awake.length) Object.assign(effect, { suppressed: true, modifiers: {},
        tooltip: effect.tooltip + ' · Подавлено: источник оглушён или дезориентирован' });
    return [suppressInspiringEffect(effect, world)];
}

/* ══════════════════════════════════════════════════════════════════════
   СПОСОБНОСТИ ВРАГОВ И СРОКИ В ХОДАХ ВРАГА

   Все сроки на враге меряются ЕГО СОБСТВЕННЫМИ ходами, а не раундами.
   Отсюда само собой выходит правило стола: повесили ДО его хода — он
   сходит в этом же раунде и срок сократится сразу; повесили ПОСЛЕ —
   до конца раунда висит полностью.

   Считается из фактов: врагу пишется счётчик его ходов (turnNo), эффект
   помнит, на каком ходу поставлен. Разница — сколько прошло. Снимать
   нечего, значит нечего и забыть снять.
   ══════════════════════════════════════════════════════════════════════ */

var FROST_TURNS  = 1;      /* обездвиживание до конца ближайшего своего хода */
var BURN_TURNS   = 2;
var BURN_RATE    = 0.10;
var FURY_TURNS   = 2;      /* ярость бандитов: два хода */
var FURY_BONUS   = 2;      /* +2 к броску атаки И защиты */
var FURY_ROUND   = 5;      /* на каком раунде кричит главарь */
var HOWL_WARN    = 3;      /* на каком раунде появляется предупреждение */
var HOWL_ROUND   = 5;      /* когда воет */
var HOWL_HEAL    = 0.20;   /* доля МАКСИМАЛЬНОГО HP */
var FEAR_HOWL_TURN = 3;   /* собственный ход Лютоволка, отдельно от лечения */
var REVIVE_HP    = 0.25;   /* меньший уровень воскрешения — четверть HP */
/* ВОСКРЕШЕНИЕ ЗА ВЕРУ (решение автора 29.09.2026): жрец выбирает, с каким
   здоровьем поднять — 25, 50, 75 или 100%, и платит столько же Веры. Маны
   не стоит, по-прежнему раз в день. Кешбэка Веры не даёт. */
var REVIVE_LEVELS = [25, 50, 75, 100];

/* Общий счёт срока по ходам врага. */
function turnsLeft(enemy, mark, total) {
    if (!mark) return 0;
    var passed = num((enemy || {}).turnNo) - num(mark.setTurn);
    if (passed < 0) passed = 0;
    var left = num(total) - passed;
    return left > 0 ? left : 0;
}

/* Контроль живёт до КОНЦА собственного хода. turnNo растёт в начале,
   turnActive остаётся в базе, пока не закончены все броски защиты. */
var CONTROL_KEYS = ['frostbite', 'stun', 'hamstring', 'disorientation'];
function completedEnemyTurns(enemy) {
    return num((enemy || {}).turnNo) - ((enemy || {}).turnActive ? 1 : 0);
}
function controlUntil(mark) {
    return mark && mark.untilTurn !== undefined ? num(mark.untilTurn) : num((mark || {}).setTurn) + FROST_TURNS;
}
function controlLeft(enemy, key) {
    var mark = (enemy || {})[key];
    return mark ? Math.min(controlUntil(mark) - num(mark.setTurn),
        Math.max(0, controlUntil(mark) - completedEnemyTurns(enemy))) : 0;
}
function frostLeft(enemy) { return controlLeft(enemy, 'frostbite'); }
function isFrozen(enemy)  { return frostLeft(enemy) > 0; }
function isStunned(enemy) { return controlLeft(enemy, 'stun') > 0; }
function isDisoriented(enemy) { return controlLeft(enemy, 'disorientation') > 0; }
function isEnemyDisabled(enemy) { return isStunned(enemy) || isDisoriented(enemy); }
function isRooted(enemy) { return isFrozen(enemy) || controlLeft(enemy, 'hamstring') > 0; }
function controlReadyLeft(enemy) {
    var e = enemy || {};
    return e.human === true && e.controlReady
        ? Math.min(2, Math.max(0, num(e.controlReady.untilTurn) - completedEnemyTurns(e))) : 0;
}
function readyAfterControl(enemy) {
    if ((enemy || {}).human !== true || !enemyAlive(enemy)) return {};
    return { controlReady: { untilTurn: Math.max(num(enemy.turnNo) + 2,
        num((enemy.controlReady || {}).untilTurn)) } };
}
function applyEnemyControl(enemy, key, duration, bypassReady) {
    var e = enemy || {}, turns = Math.floor(num(duration));
    if (CONTROL_KEYS.indexOf(key) < 0 || turns < 1) return null;
    if (e.human === true && !bypassReady && (controlReadyLeft(e) > 0 ||
        CONTROL_KEYS.some(function (k) { return controlLeft(e, k) > 0; }))) return null;
    var facts = {};
    facts[key] = { setTurn: num(e.turnNo), untilTurn: num(e.turnNo) + turns };
    return facts;
}

function applyFrostbite(enemy, hit) {
    return hit ? applyEnemyControl(enemy, 'frostbite', FROST_TURNS, false) : null;
}
/* Источника стана пока нет; длительность ОБЯЗАНО передать будущее умение. */
function applyStun(enemy, duration, hit) {
    return hit ? applyEnemyControl(enemy, 'stun', duration, false) : null;
}
/* Адский флекс: случайное число получает разрешающий удар экран ОДИН РАЗ.
   Проверка и урон сохраняются одной транзакцией врага. Квитанции живут
   вместе с врагом текущего боя, включая неудачные и заблокированные попытки. */
var HELL_FLEX_CHANCE = 0.15;
function hellFlexEligible(who, hit, spell) {
    var w = who || {};
    return !!hit && !spell && w.cls === 'bard' && !!(w.mainhand || (w.slots || {}).mainhand);
}
function hellFlexReceipt(enemy, id) {
    return ((enemy || {}).hellFlexChecks || {})[encodeURIComponent(String(id)).replace(/\./g, '%2E')] || null;
}
function planHellFlex(enemy, id, roll) {
    if (!id || !enemyAlive(enemy) || hellFlexReceipt(enemy, id)
        || typeof roll !== 'number' || !(roll >= 0 && roll < 1)) return null;
    var proc = roll < HELL_FLEX_CHANCE;
    var control = proc ? applyEnemyControl(enemy, 'disorientation', 1, false) : null;
    var checks = Object.assign({}, enemy.hellFlexChecks || {});
    checks[encodeURIComponent(String(id)).replace(/\./g, '%2E')] = { roll: roll, proc: proc, applied: !!control };
    return Object.assign({ hellFlexChecks: checks }, control || {});
}
function finishEnemyTurn(enemy) {
    var e = enemy || {}, facts = { turnActive: null }, ended = false;
    CONTROL_KEYS.forEach(function (key) {
        if (e[key] && controlUntil(e[key]) <= num(e.turnNo)) {
            facts[key] = null; ended = true;
        }
    });
    if (ended) Object.assign(facts, readyAfterControl(e));
    else if (e.controlReady && num(e.controlReady.untilTurn) <= num(e.turnNo)) facts.controlReady = null;
    return facts;
}
/* Только фактически потерянные HP снимают контроль. Новый контроль
   накладывается вызывающей стороной ПОСЛЕ применения этих фактов. */
function damageEnemy(enemy, damage, damageType) {
    var e = enemy || {}, hp = hpAfterDamage(enemyHP(e), Math.max(0, num(damage)));
    var facts = { currentHP: hp }, ended = false;
    if (hp < enemyHP(e)) {
        if (isStunned(e)) { facts.stun = null; ended = true; }
        if (isDisoriented(e)) { facts.disorientation = null; ended = true; }
        if (damageType === 'fire' && isFrozen(e)) { facts.frostbite = null; ended = true; }
    }
    if (ended && hp > 0) Object.assign(facts, readyAfterControl(e));
    return facts;
}
function canEnemyMove(enemy) { return !isEnemyDisabled(enemy) && !isRooted(enemy); }
function enemyInMeleeContact(enemy, targetId) {
    return !!targetId && (enemy || {}).meleeContactId === targetId;
}
function heroInMeleeWith(enemy, heroId) {
    var e=enemy || {};
    return enemyAlive(e) && isMeleeEnemy(e) && (enemyInMeleeContact(e,heroId)
        || e.meleeContactId === undefined && e.hasEngagedTarget === true && e.aggroTargetId === heroId);
}
function canEnemyAttackTarget(enemy, targetId) {
    return !isEnemyDisabled(enemy) && (!isMeleeEnemy(enemy) || !isRooted(enemy) || enemyInMeleeContact(enemy, targetId));
}
/* Агро и контакт — разные факты. Удар подошедшего героя меняет цель
   обездвиженного ближнего; выстрел не заставляет его идти к стрелку. */
function enemyHitTargetFacts(enemy, facts, attackerId, melee, hit) {
    var out = Object.assign({}, facts || {});
    if (melee && hit) out.meleeContactId = attackerId;
    if (isMeleeEnemy(enemy) && isRooted(enemy)) {
        delete out.aggroTargetId; delete out.aggroReason; delete out.retargetIntent;
        if (melee && hit) Object.assign(out, { aggroTargetId: attackerId,
            aggroReason: 'Ближний удар по обездвиженному', retargetIntent: null });
    }
    return out;
}

/* Горение хранит округлённые вверх 10% итогового попадания после
   крита/касания/усиления. Повторное попадание обновляет эффект.
   Тик вызывается ДО увеличения turnNo. */
/* Общая арифметика HP врага: после дробного урона обычный удар
   не должен оставлять в карточке 0.2999999999999998 HP. */
function hpAfterDamage(hp, damage) {
    return Math.max(0, Math.round((num(hp) - num(damage)) * 1000) / 1000);
}
function burnLeft(enemy) { return turnsLeft(enemy, (enemy || {}).burn, BURN_TURNS); }
function applyBurn(enemy, damage, hit, sourceId) {
    if (!hit || num(damage) <= 0 || num((enemy || {}).currentHP) <= 0) return null;
    return { burn: { setTurn: num(enemy.turnNo),
        damage: ceilGame(num(damage) * BURN_RATE),
        sourceId: sourceId || '' } };
}
function planBurnTick(enemy) {
    if (!enemy || burnLeft(enemy) <= 0 || num(enemy.currentHP) <= 0) return null;
    var damage = Math.min(num(enemy.currentHP), Math.max(0, Math.ceil(num(enemy.burn.damage))));
    if (!damage) return null;
    var hp = hpAfterDamage(enemy.currentHP, damage);
    var facts = damageEnemy(enemy, damage, 'fire');
    if (hp === 0 || burnLeft(enemy) === 1) facts.burn = null;
    return { damage: damage, damageType: 'fire', sourceId: enemy.burn.sourceId || '', facts: facts };
}

/* --- Ярость бандитов: главарь кричит на 5-м раунде --------------------- */
function furyLeft(enemy) { return turnsLeft(enemy, (enemy || {}).fury, FURY_TURNS); }

/* Пора ли кричать. Кричит именно ГЛАВАРЬ; мёртв — крика не будет вовсе. */
function shouldRoarFury(p) {
    var e = p.enemy || {};
    if (e.key !== 'bandit_leader') return false;
    if (num(e.currentHP) <= 0) return false;
    if (e.furyUsed) return false;                  /* один раз за бой */
    return num(p.round) >= FURY_ROUND;
}

/* Кому достаётся: всем живым СВОИМ, включая самого главаря. */
function planFury(p) {
    var mark = { setTurn: 0 };
    return (p.enemies || [])
        .filter(function (e) { return num(e.currentHP) > 0; })
        .map(function (e) {
            return { id: e.id, facts: { fury: { setTurn: num(e.turnNo) } } };
        });
}

/* Устрашение: третий собственный ход; контроль откладывает, а не отменяет.
   Метка также отмечает потраченный ход для продолжения после перезагрузки. */
function planFearHowl(enemy, sourceId, battleNo) {
    var e = enemy || {};
    if (e.key !== FEAR_SOURCE || !sourceId || !enemyAlive(e) || isEnemyDisabled(e)
        || num(e.turnNo) < FEAR_HOWL_TURN
        || (e.fearHowl && num(e.fearHowl.battleNo) === num(battleNo))) return null;
    return { fearHowl: { sourceId: sourceId, battleNo: num(battleNo), turnNo: num(e.turnNo) } };
}

/* --- Лечебный вой альфы: предупреждение на 3-м, лечение на 5-м раунде --- */
function howlWarns(p) {
    var e = p.enemy || {};
    if (e.key !== 'direwolf' || num(e.currentHP) <= 0 || e.howlUsed) return false;
    return num(p.round) >= HOWL_WARN && num(p.round) < HOWL_ROUND;
}
function shouldHowl(p) {
    var e = p.enemy || {};
    if (e.key !== 'direwolf' || num(e.currentHP) <= 0 || e.howlUsed) return false;
    return num(p.round) >= HOWL_ROUND;
}

/* Лечение — доля МАКСИМАЛЬНОГО HP, только живым волкам и Лютоволкам.
   Выше максимума не переливается. */
function planHowl(enemies) {
    return (enemies || [])
        .filter(function (e) { return e && num(e.currentHP) > 0
            && (e.key === 'wild_wolf' || e.key === 'direwolf'); })
        .map(function (e) {
            var heal = ceilGame(num(e.maxHP) * HOWL_HEAL);
            var hp = Math.min(num(e.maxHP), num(e.currentHP) + heal);
            return { id: e.id, heal: hp - num(e.currentHP), facts: { currentHP: hp } };
        });
}

/* --- Зелье врага (решения автора 29.09.2026) ---------------------------
   СКОЛЬКО ЗЕЛИЙ — из состава боя: автор жмёт «+зелье» на враге в бою этой
   сложности, сколько нажал — столько хилок (поле potions у сложности сцены
   в data-chapters.js: { rat_king: 2 }).

   КОМУ — по одному на врага этого вида, по кругу (решение автора 30.09):
   три крысы и два зелья — по одному у первой и второй; одинокий босс и
   два зелья — оба у него.

   СКОЛЬКО ЛЕЧИТ — число у вида врага (potionHeal в data-enemies.js),
   у каждого своё; выше максимума не переливается.

   КОГДА — здоровье НИЖЕ четверти максимума. Пьёт и бьёт тем же ходом,
   как доп действие у игрока; за ход — одно зелье. */
var ENEMY_POTION_BELOW = 0.25;

/* list — ключи врагов на поле по порядку (planSpawn().list),
   potions — { ключ: сколько }. Ответ — сколько зелий у каждого по порядку. */
function distributeEnemyPotions(list, potions) {
    var total = {}, seen = {};
    (list || []).forEach(function (k) { total[k] = (total[k] || 0) + 1; });
    return (list || []).map(function (k) {
        var p = Math.max(0, Math.floor(num((potions || {})[k])));
        var i = seen[k] || 0;
        seen[k] = i + 1;
        return Math.floor(p / total[k]) + (i < p % total[k] ? 1 : 0);
    });
}

function shouldEnemyDrink(enemy) {
    var e = enemy || {};
    var hp = num(e.currentHP), max = num(e.maxHP);
    if (hp <= 0 || max <= 0) return false;
    if (num(e.potions) <= 0 || num(e.potionHeal) <= 0) return false;
    return hp < max * ENEMY_POTION_BELOW;
}

/* Пьёт — факты для записи; не пьёт — null. */
function planEnemyPotion(enemy) {
    if (!shouldEnemyDrink(enemy)) return null;
    var hp = Math.min(num(enemy.maxHP), hpAfterDamage(enemy.currentHP, -ceilGame(num(enemy.potionHeal))));
    return { heal: hpAfterDamage(hp, enemy.currentHP),
             facts: { currentHP: hp, potions: num(enemy.potions) - 1 } };
}

/* --- Воскрешение жреца ------------------------------------------------- */
/* Врождённое, раз в игровой день, стоит ВЕРЫ (25/50/75/100 — столько же
   процентов здоровья), маны не стоит. Держится на факте: игроку пишется
   день последнего использования. */

/* ══════════════════════════════════════════════════════════════════════
   СПОСОБНОСТИ «РАЗ В ДЕНЬ» — ОДНА ФУНКЦИЯ НА ВСЕХ

   БОЛЯЧКА, ради которой она заведена. Проверки писались как
       num(who.xxxDay) !== num(world.day)
   и на нулевом дне ломались все разом: поля «когда использовал» ещё нет,
   num(undefined) даёт НОЛЬ, а мир стартует с day: 0. Ноль равен нулю —
   значит движок считал способность уже потраченной.

   На деле это значило, что в первых двух боях главы (канализация, до
   первой ночёвки) не работало НИЧЕГО: воин не мог встать Вторым дыханием,
   лучник выстрелить дважды, жрец воскресить, маг помедитировать. Ровно
   там, где это нужнее всего.

   Теперь «никогда не использовал» и «использовал в нулевой день» — разные
   вещи: отсутствие поля проверяется отдельно от его значения.
   ══════════════════════════════════════════════════════════════════════ */
function usedToday(who, field, world) {
    var v = (who || {})[field];
    if (v === undefined || v === null) return false;   /* ни разу не использовал */
    return num(v) === num((world || {}).day);
}

/* То же самое, но НА БОЙ, а не на день. Отметка хранит номер боя, в котором
   способность потратили, и сгорает, как только начался следующий. Так же
   живёт Бадун (hasHangover) — образец один, чтобы «раз в бой» везде
   означало одно и то же. */
function usedThisBattle(who, field, world) {
    var v = (who || {})[field];
    if (v === undefined || v === null) return false;
    return num(v) === num((world || {}).battleNo);
}

/* ══════════════════════════════════════════════════════════════════════
   УРОВЕНЬ НАЁМНИКА

   Считается СРЕДНИЙ по партии на момент призыва — по всем, включая лежащих
   без сознания: наёмник приходит к отряду, а не к тем, кто устоял.

   Раньше уровень брался только с ползунка мастера. Ползунок остался ручным
   перебивом: мало ли нужно, чтобы Спук затащил, или наоборот мастер не
   захочет помогать партии. Но по умолчанию считает движок.

   Наёмники в счёт не идут — иначе призванный вторым равнялся бы на первого,
   и уровень поплыл бы сам собой.
   ══════════════════════════════════════════════════════════════════════ */
/* Есть ли у героя предмет — в СУМКЕ или НАДЕТЫЙ.
   Раньше свежевание искало нож только в инвентаре. Пока нож был квестовым,
   этого хватало. Теперь его можно надеть в левую руку ради сборки
   разбойника — и надетый уходил из сумки в слот. Получалось обидное:
   надел нож, чтобы стать разбойником, и потерял возможность снять трофей. */
function hasItem(player, key) {
    var p = player || {};
    var inv = Array.isArray(p.inv) ? p.inv : [];
    if (inv.indexOf(key) !== -1) return true;
    var slots = p.slots || {};
    for (var s in slots) if (slots[s] === key) return true;
    return false;
}

function mercLevel(players) {
    var list = (players || []).filter(function (p) {
        return p && !p.mercenary && num(p.level) > 0;
    });
    if (!list.length) return 1;
    var sum = list.reduce(function (s, p) { return s + num(p.level); }, 0);
    return Math.max(1, Math.round(sum / list.length));
}

/* Может ли жрец воскресить. level — уровень здоровья в процентах; без него
   спрашиваем «хоть какой-нибудь»: хватает ли Веры на меньший. */
function canRevive(priest, world, level) {
    if (!priest || priest.cls !== 'priest') return false;
    if (usedToday(priest, 'reviveUsedDay', world)) return false;
    var lv = level === undefined ? REVIVE_LEVELS[0] : num(level);
    if (REVIVE_LEVELS.indexOf(lv) < 0) return false;
    return num(priest.power) >= lv;
}
function whyCantRevive(priest, world, level) {
    if (!priest || priest.cls !== 'priest') return 'Воскрешает только жрец';
    if (usedToday(priest, 'reviveUsedDay', world)) return 'Сегодня уже воскрешали';
    var lv = level === undefined ? REVIVE_LEVELS[0] : num(level);
    if (num(priest.power) < lv) return 'Веры не хватает: нужно ' + lv;
    return '';
}
/* Уровни, на которые хватает Веры сейчас, — для кнопок. */
function reviveLevels(priest, world) {
    return REVIVE_LEVELS.filter(function (lv) { return canRevive(priest, world, lv); });
}
function planRevive(target, priest, world, level) {
    var lv = level === undefined ? REVIVE_LEVELS[0] : num(level);
    var hp = Math.max(1, ceilGame(num(target.maxHP) * lv / 100));
    return {
        target: { hp: hp },
        priest: { power: clamp(num((priest || {}).power) - lv, 0, POWER_MAX),
                  reviveUsedDay: num((world || {}).day) },
        level: lv, cost: lv
    };
}

/* Активен ли произвольный эффект из списка фактов. */
function isEffectActive(e, round) {
    if (!e) return false;
    if (e.duration === 'battle' || e.duration === 'while' || e.duration === 'permanent') return true;
    if (e.duration === 'turns') return num(e.turnsLeft)>0;
    if (e.duration === 0) return false;
    var dur = num(e.duration) || 1;
    return num(e.setRound) + dur - 1 >= num(round);
}

/* Число значков в строке ограничивает интерфейс, не список действующих эффектов. */

function deriveEnemyEffects(enemy, world) {
    var round = num(world.round) || 1;
    var buffs = [], debuffs = [];


    /* Присутствие разбойника: у каждой цели свой счёт, и он в ХОДАХ САМОГО
       ВРАГА. Показываем остаток стаков — он же и есть срок. */
    /* Песня барда против врагов (Колкая подъёбочка, бывший Похоронный
       марш) висит и на враге. */
    var esong = songAffects(enemy) ? songEffect(enemy, round, num(world.battleNo)) : null;
    if (esong) (esong.modifiers.atk >= 0 ? buffs : debuffs).push(esong);

    var markedBy = [], markLeft = 0;
    Object.keys(world.players || {}).forEach(function (id) {
        var owner = world.players[id];
        if (!hunterMarkActive(owner, world, enemy.id)) return;
        markedBy.push(owner.name || id);
        markLeft = Math.max(markLeft, num(owner.hunterMark.until) - round + 1);
    });
    if (markedBy.length) debuffs.push({ id: 'hunterMark', icon: EFFECT_ICONS.hunterMark, counter: markLeft,
        tooltip: 'Метка охотника: ' + markedBy.join(', ') + '. Владельцу +2 к броску атаки из лука по этой цели.' });

    var fl = frostLeft(enemy);
    if (fl > 0) {
        debuffs.push({ id: 'frostbite', icon: EFFECT_ICONS.frostbite, counter: fl,
                       tooltip: 'Обморожение: не двигается до конца своего хода. Может бить рядом или стрелять. Огонь снимает эффект.' });
    }
    var sl = controlLeft(enemy, 'stun'), hl = controlLeft(enemy, 'hamstring'), rl = controlReadyLeft(enemy);
    if (sl > 0) debuffs.push({ id: 'stun', icon: '', counter: sl,
        tooltip: 'Оглушение: не действует. Любой полученный урон снимает эффект.' });
    if (isDisoriented(enemy)) debuffs.push({ id: 'disorientation', icon: '', counter: controlLeft(enemy, 'disorientation'),
        tooltip: 'Дезориентация: пропустит следующий свой ход. Любой последующий полученный урон снимает эффект.' });
    if (hl > 0) debuffs.push({ id: 'hamstring', icon: EFFECT_ICONS.hamstring, counter: hl,
        tooltip: 'Подкошен — Далеко не уйдёшь! Не двигается до конца своего хода. Урон не снимает эффект.' });
    if (rl > 0) buffs.push({ id: 'controlReady', icon: EFFECT_ICONS.ready, counter: rl,
        tooltip: 'Повышенная готовность — Больше не попадусь! Защита от повторного контроля: ' + rl + ' своих хода.' });
    var bl = burnLeft(enemy);
    if (bl > 0 && num(enemy.currentHP) > 0) {
        debuffs.push({ id: 'burn', icon: EFFECT_ICONS.burn, counter: bl,
            tooltip: 'Горение: ' + Math.ceil(num(enemy.burn.damage)) + ' урона в начале своего хода' });
    }
    var fu = furyLeft(enemy);
    if (fu > 0) {
        buffs.push({ id: 'fury', icon: EFFECT_ICONS.fury, counter: fu,
                     tooltip: 'Ярость бандитов: +' + FURY_BONUS + ' к атаке и защите',
                     modifiers: { atk: FURY_BONUS, def: FURY_BONUS } });
    }

    var left = presenceStacks(enemy);
    if (left > 0) {
        debuffs.push({
            id: 'presence', icon: EFFECT_ICONS.presence, counter: left,
            tooltip: 'Присутствие разбойника (' + left + ')',
            ownerId: enemy.presence.by
        });
    }

    /* «Уже перехвачен» — активен, только пока цель врага та же, на которой
       была попытка. Смена таргета гасит его без единой записи в базу. */
    if (enemy.interceptAttemptedForTarget &&
        enemy.interceptAttemptedForTarget === enemy.aggroTargetId) {
        debuffs.push({ id: 'intercepted', icon: EFFECT_ICONS.intercept, tooltip: 'Уже перехвачен' });
    }

    /* Постоянный баф босса — без срока, пока он жив. */
    var aura = BOSS_AURAS[enemy.key];
    if (aura) buffs.push(aura);

    (enemy.effects || []).forEach(function (e) {
        if (!isEffectActive(e, round)) return;
        (e.kind === 'buff' ? buffs : debuffs).push(e);
    });

    return { buffs: buffs, debuffs: debuffs };
}

/* ==========================================================================
   ПОПРАВКА К БРОСКАМ ВРАГА

   Складывает `modifiers` со ВСЕХ его активных эффектов. Сегодня это Клич
   главаря (+2 к атаке и защите), песня барда против врагов — Колкая
   подъёбочка, бывший Похоронный марш (-2 к атаке и защите), и постоянные ауры
   боссов (Король +1 к атаке, Гигант +1 к защите); завтра будет что-то
   ещё, и переписывать вызовы не придётся.

   Почему складывание живёт здесь, а не в дашборде. Раньше deriveEnemyEffects
   честно выдавал modifiers, и их не читал НИКТО: слово modifiers не
   встречалось в дашборде ни разу. Клич главаря ставил факт, рисовал иконку и
   не менял ни одного числа; марш барда - половина классового навыка - не
   менял тоже. Проверка на ярость при этом была зелёной, потому что звала
   движок напрямую, минуя дашборд.

   Значение в единицах БРОСКА: прибавляется к кубику, как и всё прочее.
   Возвращает { atk, def }, врага не мутирует.
   ========================================================================== */

function enemyRollModifier(enemy, world) {
    var eff = deriveEnemyEffects(enemy || {}, world || {});
    var out = { atk: 0, def: 0 };
    eff.buffs.concat(eff.debuffs).forEach(function (e) {
        var m = (e && e.modifiers) || {};
        out.atk += num(m.atk);
        out.def += num(m.def);
    });
    return out;
}

function derivePlayerEffects(player, world) {
    var round = num(world.round) || 1;
    var buffs = [], debuffs = [];
    if (infectionActive(player,world)) debuffs.push({id:'infected_wound',kind:'debuff',category:'infection',
        name:'Гнойная рана',icon:EFFECT_ICONS.infected_wound,duration:'turns',counter:num(player.infectedWound.left),
        tooltip:'Гнойная рана: −1 HP в начале собственного хода. Обычное лечение не снимает. После окончания или конца боя — одна проверка болезни.',modifiers:{}});
    if (sicknessActive(player,world)) {
        var penalty = ceilGame(num(player.normalMaxHP) * 0.1), days = num(player.sickness.untilDay)-num(world.day);
        debuffs.push({id:'sickness',kind:'debuff',category:'disease',name:'Болезнь',icon:EFFECT_ICONS.sickness,duration:'days',counter:days,
            tooltip:'Болезнь: максимум HP −10%' + (penalty ? ' (−'+penalty+' HP)' : '')
                + '. Лечение ограничено сниженным максимумом. Сон и обычное лечение не снимают болезнь.',modifiers:{}});
    }
    if (deepWoundActive(player, world)) debuffs.push({ id:'deep_wound', kind:'debuff', category:'physical',
        name:'Глубокая рана', icon:EFFECT_ICONS.deep_wound, duration:'turns', counter:num(player.deepWound.left),
        tooltip:'Глубокая рана: −1 HP в начале собственного хода. Снимается успешным магическим лечением HP или лечебным зельем; Второе дыхание её не снимает.', modifiers:{} });

    /* Песня барда. Своим она в бафы, врагам в дебафы — знак поправки уже
       заложен в самой песне, разбираться тут не нужно. Гаснет сама по
       номеру раунда: снимать нечего, значит нечего и забыть снять. */
    if (player.cls === 'bard') buffs.push({ id:'hell_flex', kind:'buff', name:'Адский флекс', duration:'permanent', icon:'assets/gear/spells/devils_groove.png',
        tooltip:'Адский флекс: обычное музыкальное попадание с шансом ' + (HELL_FLEX_CHANCE * 100) + '% дезориентирует врага на следующий собственный ход. Последующий урон снимает эффект. Нужен инструмент; заклинания не вызывают срабатывание.', modifiers:{} });
    var background=inspiringProtection(world);
    if(background.active){
        buffs.push({id:'inspiring_riff',kind:'buff',name:'Бодрящий фон',icon:SONGS.inspiring_riff.icon,counter:background.left,
            tooltip:'Бодрящий фон: защита от контроля '+background.chance+'%; бессрочные дебаффы подавлены',modifiers:{}});
        debuffs=debuffs.concat(fieldAuras(Object.values(world.enemies||{}),world));
    }
    var fortuneCount = fortuneCharges(player, world).length;
    if (fortuneCount) buffs.push({ id: 'fortune', name: 'Госпожа Фортуна', kind: 'buff', counter: fortuneCount,
        tooltip: 'Госпожа Фортуна: ' + fortuneCount + ' заряд(а). Следующую выбранную атаку или лечение с броском можно перебросить один раз; второй результат обязателен. Ответные удары и защита заряд сохраняют.', modifiers:{} });
    var song = songEffect(player, round, num(world.battleNo));
    if (song) (song.modifiers.atk >= 0 ? buffs : debuffs).push(song);

    /* МОЛИТВА — ЗНАЧКОМ. Раньше она работала, но не показывалась вовсе:
       игрок и Ведущий видели лишь выросшие числа, не понимая откуда. Цифра на
       значке — сколько раундов ещё держится. Числа прибавки берём из того же
       правила, что считает её в бою. */
    var мол = activePrayer(player, world);
    if (мол) {
        var пр = PRAYERS[мол.id], б = prayerBonus(player, world, 100, 100);
        var что = [];
        if (б.def) что.push('+' + б.def + ' к защите');
        if (пр.hpPct) что.push('+' + (пр.hpPct * (((player.prayer || {}).self === false) ? 1 : PRAYER_SELF_MULT)) + '% здоровья');
        if (пр.intPct) что.push('+' + (пр.intPct * (((player.prayer || {}).self === false) ? 1 : PRAYER_SELF_MULT)) + '% интеллекта');
        buffs.push({ id: 'prayer', kind: 'buff', icon: EFFECT_ICONS[мол.id],
            counter: мол.left,        /* экраны читают `counter` — как у прочих значков */
            tooltip: пр.name + ((player.prayer || {}).self === false ? '' : ' (на себя, вдвое)')
                   + ': ' + что.join(', ') + ' · ещё ' + мол.left + ' р.',
            modifiers: {} });
    }

    /* Один значок обороны для всех экранов; counter — оставшиеся срабатывания. */
    if (shieldActive({ shieldRound: num(player.shieldRound),
                       shieldUsedRound: num(player.shieldUsedRound), shieldCharges: player.shieldCharges,
                       shieldBattleNo: player.shieldBattleNo, battleNo: world.battleNo,
                       round: round })) {
        buffs.push({
            id: 'shield', kind: 'buff', duration: 'battle', counter: shieldChargesLeft(player),
            name: 'Глухая оборона', icon: EFFECT_ICONS.shield,
            tooltip: 'Глухая оборона: +' + shieldDefBonus(player) + ' к броску защиты · осталось ' + shieldChargesLeft(player) + ' из 4 защит. Атака завершает стойку и запускает откат; дополнительные действия доступны.',
            modifiers: { def: shieldDefBonus(player) }
        });
    }

    /* Скрытность разбойника: активна, пока он ни у кого не в таргете
       (раздел 7). Тоже чистое вычисление по текущему состоянию врагов. */
    if (player.isRogue) {
        var enemies = world.enemies || {};
        var targeted = Object.keys(enemies).some(function (id) {
            var e = enemies[id];
            return e && num(e.currentHP) > 0 && e.aggroTargetId === player.id;
        });
        if (!targeted) buffs.push({ id: 'stealth', icon: EFFECT_ICONS.stealth, tooltip: 'Скрытность' });
    }

    /* Окружение: четверо БЛИЖНИХ и больше — минус к броску ЗАЩИТЫ (решение
       автора 26.09.2026: бьют со всех сторон). Дальние в счёт не идут — они
       стоят в стороне. Сам минус кладёт defenseModifier: защита считается
       там, а не слоями броска; здесь — иконка и подпись. */
    if (isSurrounded(player.id, world.enemies)) {
        debuffs.push({
            id: 'surrounded', kind: 'debuff', duration: 'while',
            icon: EFFECT_ICONS.surrounded, tooltip: 'Окружён: −1 к защите',
            modifiers: { def: SURROUND_DEF }
        });
    }

    /* «Уже перехвачен» — зеркало врагового (раздел 6, случай А). Игрок прорвался
       к дальнему врагу, повторно его на этом пути не перехватывают. Активен, пока
       цель та же: сменил цель — дебаф погас сам, снимать нечего. */
    if (player.interceptAttemptedForTarget &&
        player.interceptAttemptedForTarget === player.targetId) {
        debuffs.push({ id: 'intercepted', icon: EFFECT_ICONS.intercept, tooltip: 'Уже перехвачен' });
    }

    (player.effects || []).concat(deriveDrunkEffects(player, world)).forEach(function (e) {
        if (!isEffectActive(e, round)) return;
        (e.kind === 'buff' ? buffs : debuffs).push(e);
    });

    debuffs=debuffs.map(function(e){return suppressInspiringEffect(e,world);});
    CONTROL_KEYS.forEach(function(k){var left=controlLeft(player,k);if(left>0)debuffs.push({id:k,kind:'debuff',icon:EFFECT_ICONS[k]||'',counter:left,tooltip:({stun:'Оглушение: не может действовать; полученный урон снимает эффект.',frostbite:'Обморожение: не может перемещаться; огонь снимает эффект.',hamstring:'Подкошен: не может перемещаться; урон не снимает эффект.',disorientation:'Дезориентация: пропустит свой ход; последующий урон снимает эффект.'})[k]||k});});
    return { buffs: buffs, debuffs: debuffs };
}

/* ══════════════════════════════════════════════════════════════════════
   ДОПОЛНИТЕЛЬНОЕ ДЕЙСТВИЕ

   Одно на раунд, и оно ОБЩЕЕ: зелье, передача вещи, переодевание в бою —
   всё делит один слот. Выпил — передать уже нельзя, передал — выпить
   нельзя. Алкоголь по-прежнему бесплатный: его пьют по ходу дела.

   ПРОПУСКА УДАРА ПОСЛЕ ДОП ДЕЙСТВИЯ БОЛЬШЕ НЕТ (решение автора 28.09.2026:
   «нигде такого нет, не будем выдумывать»). Раньше первый удар после хода
   героя, потратившего доп действие, проходил без защиты. Теперь доп
   действие стоит только слота на раунд, защищается герой всегда.

   ВСЁ СЧИТАЕТСЯ ОТ НОМЕРА РАУНДА, а не флагами. Со сменой раунда слот
   освобождается сам: номер просто перестаёт совпадать.
   ══════════════════════════════════════════════════════════════════════ */

var SKIPS_AFTER_EXTRA = 0;         /* пропуска удара нет — решение автора 28.09.2026 */

/* Доступно ли доп действие прямо сейчас. Это же читает жёлтая точка на
   карточке героя — в клиенте и на стриме. */
function hasExtraAction(player, world) {
    return num((player || {}).extraActionRound) !== (num((world || {}).round) || 1);
}

/* Почему нельзя. Молчит, когда можно. */
function whyNoExtraAction(player, world) {
    return hasExtraAction(player, world)
        ? '' : 'Дополнительное действие в этом раунде уже потрачено';
}

/* Факты для записи: доп действие потрачено в этом раунде. `defAfterExtra`
   остался от снятого правила пропуска удара — пишется нулём, ни на что не
   влияет. */
function planExtraAction(world) {
    return { extraActionRound: num((world || {}).round) || 1, defAfterExtra: 0 };
}

/* Может ли игрок защищаться от удара — всегда: пропуск удара после доп
   действия снят (решение автора 28.09.2026). Функции оставлены, их зовут
   клиент, дашборд и стример. */
function canDefend(player, world) {
    return true;
}

/* Сколько ударов будет пропущено без защиты — ни одного. */
function skipsLeft(player, world) {
    return 0;
}

/* Виден ли игрок как цель для врагов (скрытный разбойник вне таргетов — нет). */
function isTargetable(player, world) {
    var eff = derivePlayerEffects(player, world);
    return !eff.buffs.some(function (b) { return b.id === 'stealth'; });
}

/* ==========================================================================
   8.5 ПЬЯНСТВО И БАДУН  (mechanics-planned, п.3)

   Ступень хранится ФАКТОМ: player.drunk = 0..5 (0/20/40/60/80/100%).
   Сам эффект не хранится — считается из ступени, поэтому «залипнуть» не может.

   Бадун — отдельный дебаф, не остаточное опьянение. Ставится, если лёг спать
   на 60% и выше (бард — на 80% и выше, см. hangoverThreshold). Не
   стакается: он один. Висит на ПЕРВЫЙ бой нового дня и снимается его
   концом — или раньше, первой выпитой бутылкой (drinkClearsHangover).

   Держится тоже на факте: игроку пишется номер боя, на котором Бадун
   поставлен (hangoverAfterBattle), а в мире растёт счётчик world.battleNo.
   Совпали — Бадун активен. Бой кончился, счётчик вырос — погас сам.
   Снимать нечего, значит нечего и забыть снять.
   ========================================================================== */

var DRUNK_MAX = 5;
/* С КАКОЙ СТУПЕНИ УТРОМ БАДУН. У всех — с 60%, у барда — с 80%: он пьёт по
   ремеслу и держится крепче. Решение автора. */
var HANGOVER_FROM_STEP      = 3;     /* лёг на 60%+ — утром Бадун */
var HANGOVER_FROM_STEP_BARD = 4;     /* бард — с 80% */
function hangoverThreshold(player) {
    return (player || {}).cls === 'bard' ? HANGOVER_FROM_STEP_BARD : HANGOVER_FROM_STEP;
}

/* Ступени: штраф к броску (атака И защита), насколько ниже порог крита,
   прибавка к силе крита, шанс попасть в союзника. Таблица из гайда. */
/* ПЕРВАЯ ступень порог крита НЕ двигает — она даёт только силу удара.
   Крит начинает приближаться с 40%: 19 → 18 → 16 → 14 → 12. */
var DRUNK_STEPS = [
    { pct: 0,   atk: 0,  critChance: 0, critPower: 0,    ally: 0    },
    { pct: 20,  atk: 0,  critChance: 0, critPower: 0.10, ally: 0    },
    { pct: 40,  atk: 0,  critChance: 1, critPower: 0.20, ally: 0    },
    { pct: 60,  atk: -1, critChance: 3, critPower: 0.75, ally: 0.02 },
    { pct: 80,  atk: -2, critChance: 5, critPower: 1.25, ally: 0.05 },
    { pct: 100, atk: -3, critChance: 7, critPower: 2.00, ally: 0.15 }
];

function drunkStep(player) {
    var s = Math.floor(num((player || {}).drunk));
    return s < 0 ? 0 : (s > DRUNK_MAX ? DRUNK_MAX : s);
}
function drunkPercent(player) { return DRUNK_STEPS[drunkStep(player)].pct; }

/* Бадун активен, пока номер боя не сменился. */
function hasHangover(player, world) {
    var mark = (player || {}).hangoverAfterBattle;
    if (mark === null || mark === undefined) return false;
    return num(mark) === num((world || {}).battleNo);
}

/* Готовые эффекты в том же виде, что и записанные в player.effects:
   их складывает слой 4, отдельных формул нигде не появляется. */
function deriveDrunkEffects(player, world) {
    var out = [];
    var st = drunkStep(player);
    if (st > 0) {
        var d = DRUNK_STEPS[st];
        /* ОПЬЯНЕНИЕ — НЕ ДЕБАФ, А СОСТОЯНИЕ. У него своя бутылка со шкалой,
           по которой видно и градус, и что он даёт. Кружком в ряду дебафов
           оно только путало: там висела иконка БАДУНА, то есть чужая
           картинка от совсем другого эффекта.

           Оставляем его в списке для дашборда и стримера (им нужно знать
           поправки), но помечаем hidden — клиент такие не рисует: у него
           для этого есть бутылка. */
        out.push({
            id: 'drunk', kind: 'debuff', duration: 'battle', hidden: true,
            name: 'Опьянение', icon: EFFECT_ICONS.drunk || EFFECT_ICONS.hangover,
            tooltip: 'Опьянение ' + d.pct + '%',
            modifiers: { atk: d.atk, def: d.atk, critChance: d.critChance, critPower: d.critPower }
        });
    }
    if (hasHangover(player, world)) {
        out.push({
            id: 'hangover', kind: 'debuff', duration: 'battle',
            name: 'Бадун', icon: EFFECT_ICONS.hangover,
            tooltip: 'Бадун',
            modifiers: { atk: -1, def: -1 }
        });
    }
    return out;
}

/* Поправка к броску ЗАЩИТЫ. Отдельной функцией, потому что защита считается
   не через слои, а порогами — передавать надо готовым числом. */
function defenseParts(player, world) {
    var p=player||{}, w=world||{}, out=[];
    function add(label,value) { if(num(value))out.push({label:label,value:num(value)}); }
    add('Снаряжение и Стойкость',p.def);
    deriveDrunkEffects(p,w).forEach(function(e){add(e.name||e.tooltip||e.id,(e.modifiers||{}).def);});
    add('Божья защита',prayerBonus(p,w,0,0).def);
    var song=songEffect(p,num(w.round)||1,num(w.battleNo));
    if(song)add('Песня',song.modifiers.def);
    if(p.id && isSurrounded(p.id,w.enemies) && !inspiringProtection(w).active)add('Окружение',SURROUND_DEF);
    if(shieldActive(Object.assign({},p,{battleNo:w.battleNo})))add('Глухая оборона',shieldDefBonus(p));
    return out;
}
function defenseModifier(player, world) {
    return defenseParts(player,world).reduce(function(sum,p){return sum+p.value;},0);
}

/* Шанс попасть в своего.

   БАРД ЧИТАЕТ ЛЕСТНИЦУ СО СДВИГОМ НА СТУПЕНЬ, а не имеет своей таблицы.
   Он привычный: пьёт по работе, и пьяным машет аккуратнее прочих.

   Раньше здесь стоял только обнулённый низ: до 80% бард не задевал никого,
   а на 80% и 100% брал ОБЩИЕ числа — 5% и 15%. Автор назвал для него 2% и
   5%, и это ровно общая лестница ступенью ниже: на 60% там 2%, на 80% — 5%.

   Поэтому таблицы у барда нет — есть сдвиг. Своя таблица разошлась бы с
   общей при первой же правке: поправят 15% у всех, а у барда останется
   старое, и заметить это можно будет только за столом. */
function allyHitChance(player) {
    var st = drunkStep(player);
    if ((player || {}).cls === 'bard') st = Math.max(0, st - 1);
    return DRUNK_STEPS[st].ally;
}
function rollsIntoAlly(player, rng) {
    var c = allyHitChance(player);
    return c > 0 && rng() < c;
}

/* Переходы. Возвращают ФАКТЫ для записи, ничего не мутируют. */
function drunkAfterBattle(player) {
    return { drunk: Math.max(0, drunkStep(player) - 1) };
}
function drunkAfterSleep(player, world) {
    var st = drunkStep(player);
    return {
        drunk: 0,
        hangoverAfterBattle: st >= hangoverThreshold(player) ? num((world || {}).battleNo) : null
    };
}
/* ══════════════════════════════════════════════════════════════════════
   КАЖДЫЙ БОЙ НАЧИНАЕТСЯ С НУЛЯ — правило автора.

   Все бафы и дебафы обнуляются. Исключение ОДНО — Бадун: он висит на первый
   бой нового дня и снимается его концом (или первой выпитой бутылкой).

   Раньше каждый путь конца боя чистил своё, и чистил не всё: песня, щит и
   молитва оживали в следующей драке, потому что держались на номере раунда,
   а раунды в каждом бою идут с единицы.

   Список живёт ЗДЕСЬ, одним местом. Значения — нейтральные, а не null: база
   не хранит null, и стёртое поле телефон прочитал бы как «не пришло» и
   оставил бы у себя старое.

   НЕ ТРОГАЕМ: здоровье, ману, золото, опыт, сумку, снаряжение, Веру и
   Аркану, Настроение барда, опьянение (на ступень его роняет начало боя —
   drunkAfterBattle, до нуля снимает сон), дневные отметки навыков и сам
   Бадун. Ярость на старте боя считает своё правило. */
var BATTLE_RESET = {
    song: false, prayer: false, effects: false,
    deepWound:false, woundHitReceipt:false, woundTickReceipt:false,
    infectedWound:false, infectionUsedBattle:-1, infectionHitReceipt:false, infectionEndReceipt:false,
    inspiringSong:false,inspiringUsedBattle:-1,stun:false,frostbite:false,hamstring:false,disorientation:false,
    fortuneCharges: false, fortuneGrant: false, pendingFortuneAttack: false,
    shieldRound: 0, shieldUsedRound: 0, shieldBattleNo: 0, shieldCharges: 0,
    extraActionRound: 0, defAfterExtra: 0, mainActionRound: 0,
    shotsLeft: 0, sneakNextHit: false,
    doubleShotBattle: -1, doubleShotRound: 0, pendingDoubleShot: false,
    hunterMark: false, hunterMarkBattle: -1, hunterMarkRound: 0,
    safeRetreatBattle: -1, pendingRetreat: false,
    sneakHitBattle: -1, sneakHitRound: 0,
    hamstringBattle: -1, hamstringRound: 0, hamstringRollId: '',
    targetId: '', interceptAttemptedForTarget: '',
    pendingDefense: false, pendingIntercept: false,
    pendingBreakawayAttack: false, breakawayResult: false
};
function battleResetFacts() {
    var o = {};
    Object.keys(BATTLE_RESET).forEach(function (k) { o[k] = BATTLE_RESET[k]; });
    return o;
}

/* Между боями: доля НЕДОСТАЮЩИХ ресурсов, округление вверх.
   Нулевые HP не поднимаем. Потолки передаются без закончившихся бафов. */
function battleRecoveryRate(completed) {
    return num(completed) === 1 ? 0.5 : num(completed) === 2 ? 0.25 : 0;
}
function planBattleRecovery(player, vitals, rate) {
    var p = player || {}, v = vitals || {};
    var hp = Math.max(0, Math.min(num(p.hp), num(v.maxHP)));
    var mp = Math.max(0, Math.min(num(p.mp), num(v.maxMP)));
    var share = rate === 0.5 || rate === 0.25 ? rate : 0;
    return { hp: hp > 0 ? hp + ceilGame((num(v.maxHP) - hp) * share) : 0,
             mp: hp > 0 ? mp + ceilGame((num(v.maxMP) - mp) * share) : mp };
}
function planGroupEscape(player) {
    var p = player || {}, hp = Math.max(0, num(p.hp)), facts = {};
    if (hp <= 0) return facts;
    facts.hp = Math.max(1, hp - ceilGame(hp * 0.2));
    if (p.cls === 'bard') facts.resource = num(p.resource) > 0 ? Math.max(1, num(p.resource) - 10) : 0;
    return facts;
}

/* Снять Бадун досрочно. ПЕРВАЯ ВЫПИТАЯ БУТЫЛКА снимает его у любого героя —
   в бою, до боя и вне боя (решение автора 29.09.2026). */
function clearHangover() { return { hangoverAfterBattle: null }; }
function drinkClearsHangover(player, world, item) {
    return !!(item && item.effect === 'booze' && hasHangover(player, world));
}

/* ==========================================================================
   8.7 ОБЩАК И БАНК

   Общак — касса партии. Личные кошельки остаются: скидываются в общак
   добровольно, тратит из него только мастер.

   Банк: 14% в НЕДЕЛЮ (решение автора 26.09.2026, было 7%) на КАЖДЫЙ счёт —
   общий и личные. Начисляются ЦЕЛЫМИ неделями — неполная не считается
   вовсе. Положил в понедельник, снял в субботу — получил ноль. Считается из фактов —
   сколько лежит и с какого дня, — а не хранится «сколько накапало»:
   иначе число пришлось бы кому-то не забыть обновить.

   НЕДЕЛЯ СЧИТАЕТСЯ С НАЧАЛА (решение автора 26.09.2026). Процент за неделю
   — с того, что лежало на её начало (weekBase). Доложил посреди недели —
   докладка приносит со следующей: положил 10, на пятый день ещё 10 — за
   эту неделю процент с 10, за следующую с 20. Доложил в первый день
   недели — это и есть начало, работает сразу. Снял — неделя начинается
   заново с остатка, со дня снятия.
   ========================================================================== */

var BANK_RATE_PER_WEEK = 0.14;
var BANK_WEEK_DAYS     = 7;

/* Сколько целых недель пролежало. Неполная неделя не считается. */
function bankWeeksPassed(sinceDay, today) {
    var d = num(today) - num(sinceDay);
    if (d < 0) d = 0;
    return Math.floor(d / BANK_WEEK_DAYS);
}

/* Сколько лежало на начало недели. У старых счетов поля нет — у них
   работают все деньги, как было. Больше, чем на счёте, не бывает. */
function bankWeekBase(acc) {
    var a = acc || {};
    var b = (a.weekBase === undefined || a.weekBase === null) ? num(a.bank) : num(a.weekBase);
    return Math.max(0, Math.min(b, num(a.bank)));
}

/* Сколько процентов накапало на вклад к этому дню. Округление ВНИЗ:
   банк не выдаёт долей монеты. base — сколько лежало на начало первой
   недели; не задан — работает всё. Со второй недели работает всё. */
function bankInterest(amount, sinceDay, today, base) {
    var weeks = bankWeeksPassed(sinceDay, today);
    if (weeks < 1 || num(amount) <= 0) return 0;
    var total = num(amount);
    var b = (base === undefined || base === null) ? total : Math.max(0, Math.min(num(base), total));
    for (var i = 0; i < weeks; i++) {
        total += ceilGame(b * BANK_RATE_PER_WEEK);
        b = total;
    }
    return total - num(amount);
}

/* Счёт на сегодня: проценты за целые недели, метка на начало текущей
   недели, и сколько лежит на её начало. Всегда отдаёт состояние — нужно
   перед вкладом и снятием, иначе докладка попала бы в прошлые недели. */
function bankRoll(acc, today) {
    var a = acc || {};
    var weeks = bankWeeksPassed(a.bankDay, today);
    var base = bankWeekBase(a);
    var gain = bankInterest(a.bank, a.bankDay, today, base);
    var bank = num(a.bank) + gain;
    return {
        bank: bank,
        earned: num(a.earned) + gain,
        /* Двигаем метку на целые недели, остаток дня не теряется. */
        bankDay: num(a.bankDay) + weeks * BANK_WEEK_DAYS,
        weekBase: weeks >= 1 ? bank : base
    };
}

/* Факты для записи после начисления. Вернёт null, если писать нечего:
   неделя не прошла, счёт пуст, или не накапало и на начало новой недели
   лежит то же самое. */
function bankAccrue(vault, today) {
    vault = vault || {};
    if (bankWeeksPassed(vault.bankDay, today) < 1 || num(vault.bank) <= 0) return null;
    var f = bankRoll(vault, today);
    if (f.bank === num(vault.bank) && f.weekBase === bankWeekBase(vault)) return null;
    return f;
}

/* ВКЛАД И СНЯТИЕ — решение автора 26.09.2026.

   Счета два вида: ОБЩИЙ (лежит при общаке: vault.bank) и ЛИЧНЫЕ у каждого
   героя. Счёт — { bank, bankDay, earned }, одна форма на оба, поэтому и
   правило одно. Сначала начисляются проценты за целые недели, потом
   операция. Пустой счёт начинает отсчёт недель с сегодняшнего дня.

   Класть и снимать — только пока у Ведущего открыт банк (whyCantBank).
   Кто что может, решает экран: на общий игрок кладёт только своё, а
   общак ↔ банк двигает только банкир — Ведущий. */
function bankDeposit(acc, amount, today) {
    var x = Math.floor(num(amount));
    if (x <= 0) return null;
    var f = bankRoll(acc, today);
    /* Пустой счёт: неделя начинается со вклада, и работает весь вклад. */
    if (f.bank <= 0) return { bank: x, earned: f.earned, bankDay: num(today), weekBase: x };
    /* Неделя началась сегодня — докладка тоже «на начало». Иначе ждёт
       следующей недели. */
    return { bank: f.bank + x, earned: f.earned, bankDay: f.bankDay,
             weekBase: f.weekBase + (f.bankDay === num(today) ? x : 0) };
}
function bankWithdraw(acc, amount, today) {
    var x = Math.floor(num(amount));
    if (x <= 0) return null;
    var f = bankRoll(acc, today);
    if (x > f.bank) return null;
    /* Снял — неделя начинается заново, с остатка и со дня снятия. */
    return { bank: f.bank - x, earned: f.earned, bankDay: num(today), weekBase: f.bank - x };
}
function whyCantBank(bank) {
    return (bank && bank.open) ? ''
        : 'Банк закрыт — класть и снимать можно, когда Ведущий откроет банк';
}

/* ══════════════════════════════════════════════════════════════════════
   БОЙ БЕЗ ОРУЖИЯ

   Кулаком бьют все, но по-разному:
     воин            — от СИЛЫ, он к этому и приспособлен
     лучник, разбойник — от ЛОВКОСТИ
     маг, жрец, бард — от силы тоже, а её у них почти нет: выходит щекотка.
       Это не отдельное правило, а следствие их телосложения.

   БАРД — единственное исключение: без инструмента он не воюет вовсе.
   Петь нечем, а кулаками он не умеет. Отсюда и цена лютни мёртвого барда
   в пять монет: это не оружие, а пропуск к своему классу.
   ══════════════════════════════════════════════════════════════════════ */

var UNARMED_STAT = { warrior: 'str', archer: 'agi', rogue: 'agi',
                     mage: 'str', priest: 'str', bard: 'str' };

function isUnarmed(who) {
    return !String((who || {}).mainhand || '') && !String((who || {}).offhand || '');
}

/* Барду без инструмента драться нечем — ни ударить, ни спеть. */
function canFightUnarmed(who) {
    return (who || {}).cls !== 'bard';
}

/* Урон голыми руками: половина от стата, минимум 1. */
function unarmedDamage(who, total) {
    if (!canFightUnarmed(who)) return 0;
    var key = UNARMED_STAT[(who || {}).cls] || 'str';
    return Math.max(1, ceilGame(num((total || {})[key]) / 2));
}

/* ЧЕМ ГЕРОЙ БЬЁТ: 'armed' — оружием, 'bare' — кулаком, 'none' — никак.

   Бард воюет ИНСТРУМЕНТОМ, а инструмент — в правой руке: нет его там —
   не воюет вовсе, что бы ни лежало в левой. Остальные без оружия бьют
   кулаком, когда пусты ОБЕ руки (isUnarmed).

   Рук в описании нет вовсе — 'armed': старые зовущие рук не передают, и
   поведение для них не меняется. */
function armedState(who) {
    var w = who || {};
    if (!('mainhand' in w) && !('offhand' in w)) return 'armed';
    if (w.cls === 'bard' && !String(w.mainhand || '')) return 'none';
    if (isUnarmed(w)) return canFightUnarmed(w) ? 'bare' : 'none';
    return 'armed';
}

/* Почему удар невозможен — для интерфейса. Молчит, когда можно. Текст тот
   же, что у песни: у барда без инструмента одна беда на оба случая. */
var NO_INSTRUMENT = 'Вы видели мои руки? Они созданы для музыки и любви, а не для мордобоя';
function whyCantAttack(who) {
    if (who && who.cls==='priest' && getRole(who)==='back' && hasKeyword(keysOf(who.mainhand),WEAPON_KEYS.frontal))
        return 'Сначала вступите в ближний бой';
    return armedState(who) === 'none' ? NO_INSTRUMENT : '';
}

/* ══════════════════════════════════════════════════════════════════════
   МОЛИТВЫ ЖРЕЦА

   Жрец молится В БОЮ и превращает себя (или союзника) в танка или в мага.
   Молитва перед боем до драки не доживает: начало боя её сбрасывает
   (BATTLE_RESET), а срок меряется раундами. Платит Верой — той же шкалой,
   что копится отдельно от лечения.

   ОДНА ЗА РАЗ. Держать обе нельзя: выбор и есть смысл механики. На десятом
   уровне автор обещал классовый подарок — две молитвы разом; пока этого
   правила нет, и придумывать его здесь нечего.

   ПРОЦЕНТЫ СЧИТАЮТСЯ ОТ МАКСИМУМА, а не от текущего: от полной банки со
   всем снаряжением. Округление вниз — как везде в движке.

   ЧТО БЫВАЕТ, КОГДА МОЛИТВА СПАДАЕТ. Потолок возвращается, а НАБРАННОЕ
   остаётся: было 15 из 20, под молитвой стало 15 из 23, вылечился до 18 —
   после спада будет 18 из 20. Это поблажка жрецу, маленькое лечение за
   деньги, и она нарочная.

   Единственный случай, который автор не назвал: если под молитвой набрал
   ВЫШЕ прежнего потолка. Тогда прижимаем к нему — иначе здоровье окажется
   больше максимума, а такого в игре быть не должно. */

/* ЛЕЧЕНИЕ ДОЛЕЙ, А НЕ ЧИСЛОМ.

   «Прикосновение лекаря» лечило на 6 плюс интеллект — то есть к десятому
   уровню поднимало меньше десятой части здоровья и переставало что-либо
   значить. Теперь лечит долю от ПОЛНОЙ банки цели: и на первом уровне, и на
   двадцатом одинаково весомо.

   Доля лежит в самом заклинании (`healPct`), а не здесь: заведёте вторую
   лечащую книгу — у неё будет своя. Округление вниз, как везде. */
function spellHeal(spell, targetMaxHP, fallback) {
    var pct = num((spell || {}).healPct);
    if (pct > 0) return Math.max(1, ceilGame(num(targetMaxHP) * pct / 100));
    return num(fallback);
}

/* Врождённое лечение жреца: не предмет, не занимает слот магии.
   Иконку и анимацию автор добавит отдельно; effectId уже различает лечения. */
var PRIEST_HEALING_RAY = {
    key:'priest_healing_ray', name:'Исцеляющий луч', subtype:'heal', innate:true,
    manaCost:8, healPct:30, holy:true, effectId:'healing_ray'
};
function planSpellHeal(spell, target, maxHP, hit, fallback) {
    var hp = num((target || {}).hp);
    var amount = hit && hp > 0 ? Math.max(0, Math.min(num(maxHP) - hp,
        spellHeal(spell, maxHP, fallback))) : 0;
    return { hp:hp + amount, amount:amount };
}

/* Физическая рана — отдельная категория, не контроль и не заражение.
   Случайная величина бросается вызывающим один раз, вне callback транзакции. */
function deepWoundActive(player, world) {
    var wound = (player || {}).deepWound;
    return !!wound && num(wound.left) > 0 && num(wound.battleNo) === num((world || {}).battleNo);
}
function planDeepWoundHit(player, enemy, damage, world, ownTurnId, chance) {
    if (!enemy || ['wild_wolf','direwolf'].indexOf(enemy.key) < 0 || num(damage) <= 0 || !(chance < 0.1)) return null;
    return { deepWound:{ left:3, battleNo:num(world.battleNo), skipTurn:ownTurnId || '' },
        repeated:deepWoundActive(player, world) };
}
function planDeepWoundTick(player, world, ownTurnId) {
    if (!ownTurnId || num((player || {}).hp) <= 0 || !deepWoundActive(player, world)
        || player.deepWound.skipTurn === ownTurnId || (player.woundTickReceipt || {}).id === ownTurnId) return null;
    var left = Math.max(0, num(player.deepWound.left) - 1);
    return { hp:Math.max(0, num(player.hp) - 1),
        deepWound:left ? Object.assign({}, player.deepWound, {left:left}) : false };
}
function woundTurnPending(player, world) {
    var head = ((world || {}).queue || [])[0], receipt = (player || {}).woundTickReceipt;
    if (!head || head.type !== 'player') return false;
    var id = head.ownTurnId || head.turnId;
    return !!planWoundTick(player, world, id) || !!(id && receipt && receipt.id === id && receipt.phase === 'pending');
}
function physicalHealFacts(player) {
    return (player || {}).deepWound ? {deepWound:false} : {};
}

function sicknessActive(player,world) {
    return !!(player || {}).sickness && num(player.sickness.untilDay)>num((world || {}).day);
}
function sicknessMaxHP(normalMaxHP,player,world) {
    var max=Math.max(0,num(normalMaxHP));
    return sicknessActive(player,world) ? Math.max(0,max-ceilGame(max*0.1)) : max;
}
function sicknessVitals(vitals,player,world) {
    var normal=num(vitals.maxHP), max=sicknessMaxHP(normal,player,world);
    return Object.assign({},vitals,{normalMaxHP:normal,maxHP:max,sicknessPenalty:normal-max});
}
/* Скрытая постоянная особенность воина «Иммунитет» влияет только на этот шанс. */
function infectionDiseaseChance(player) { return (player || {}).cls==='warrior' ? 0.25 : 0.5; }
function infectionActive(player,world) {
    var wound=(player || {}).infectedWound;
    return !!wound && num(wound.left)>0 && num(wound.battleNo)===num((world || {}).battleNo);
}
function planInfectionHit(player,enemy,damage,world,ownTurnId,chance,id) {
    var p=player || {};
    if (!enemy || enemy.key!=='rat_king' || num(damage)<=0 || !(chance<0.15)
        || num(p.infectionUsedBattle)===num(world.battleNo) && p.infectionUsedBattle!=null
        || p.infectedWound || sicknessActive(p,world)) return null;
    return {infectedWound:{id:id,left:5,battleNo:num(world.battleNo),skipTurn:ownTurnId || ''},infectionUsedBattle:num(world.battleNo)};
}
function planInfectionEnd(player,world,chance) {
    if (!infectionActive(player,world)) return null;
    var diseased=sicknessActive(player,world) || chance<infectionDiseaseChance(player);
    var facts={infectedWound:false};
    if (diseased && !sicknessActive(player,world)) facts.sickness={id:player.infectedWound.id,untilDay:num(world.day)+3};
    return {facts:facts,diseased:diseased,id:player.infectedWound.id};
}
/* Оба урона одного начала хода записываются вместе; квитанция общая. */
function planWoundTick(player,world,ownTurnId) {
    var p=player || {}, deep=planDeepWoundTick(p,world,ownTurnId);
    var infection=!!ownTurnId && num(p.hp)>0 && infectionActive(p,world)
        && p.infectedWound.skipTurn!==ownTurnId && (p.woundTickReceipt || {}).id!==ownTurnId;
    if (!deep && !infection) return null;
    var damage=(deep ? 1 : 0)+(infection ? 1 : 0), facts={hp:Math.max(0,num(p.hp)-damage)};
    if (deep) facts.deepWound=deep.deepWound;
    var left=infection ? Math.max(0,num(p.infectedWound.left)-1) : 0;
    if (infection) facts.infectedWound=left ? Object.assign({},p.infectedWound,{left:left}) : false;
    return {facts:facts,damage:damage,deepTick:!!deep,infectedTick:infection,infectedLeft:left,infectionEnded:infection && !left};
}
/* Только наложенные эффекты. Дневные/боевые лимиты и откаты не сбрасываются. */
function resurrectionCleanse() {
    return {effects:[],prayer:false,song:false,inspiringSong:false,fortuneCharges:false,
        deepWound:false,infectedWound:false,sickness:false,woundHitReceipt:false,woundTickReceipt:false,
        infectionHitReceipt:false,infectionEndReceipt:false,sicknessEndReceipt:false,
        burn:false,stun:false,frostbite:false,hamstring:false,disorientation:false,controlReady:false,
        shieldCharges:0,hunterMark:false,sneakNextHit:false,drunk:0,hangoverAfterBattle:null};
}

var PRAYER_COST   = 25;   /* Веры за молитву */
var PRAYER_ROUNDS = 5;    /* сколько держится */

/* НА СЕБЯ — ВДВОЕ. Жрец молится и за союзников, но на себя молитва ложится
   крепче. Решение автора «попробуем ×2, посмотрим в живых тестах, не
   перебор ли» — поэтому одно число, и менять его здесь. */
var PRAYER_SELF_MULT = 2;

var PRAYERS = {
    god_protection: { name: 'Божья защита',  hpPct: 15, def: 1, intPct: 0 },
    god_wisdom:     { name: 'Божья мудрость', hpPct: 0,  def: 0, intPct: 15 }
};

/* Активна ли молитва прямо сейчас. Держится на факте `prayer` с номером
   раунда: со сменой раунда она гаснет сама, сбрасывать нечего. */
function activePrayer(player, world) {
    var f = (player || {}).prayer;
    if (!f || !PRAYERS[f.id]) return null;
    var прошло = (num((world || {}).round) || 1) - num(f.round);
    if (прошло < 0 || прошло >= PRAYER_ROUNDS) return null;
    return { id: f.id, left: PRAYER_ROUNDS - прошло };
}

function canPray(player, world) {
    if (!player || player.cls !== 'priest') return false;
    if (num(player.power) < PRAYER_COST) return false;
    return !activePrayer(player, world);          /* одна за раз */
}

function whyCantPray(player, world) {
    if (!player || player.cls !== 'priest') return 'Молитвы читает только жрец';
    if (activePrayer(player, world)) {
        var a = activePrayer(player, world);
        return 'Уже читается «' + PRAYERS[a.id].name + '» — ещё ' + a.left + ' раунда';
    }
    if (num(player.power) < PRAYER_COST)
        return 'Веры не хватает: нужно ' + PRAYER_COST;
    return '';
}

/* Факты для записи: какая молитва и с какого раунда, плюс остаток Веры. */
/* Факты молитвы. `self` — молится на себя: тогда прибавка вдвое. Молитва
   ложится ФАКТОМ НА ЦЕЛЬ — у союзника своя, у жреца своя, — а Вера
   списывается у жреца. Поэтому план отдаёт два куска. */
function planPrayer(id, player, world, self) {
    if (!PRAYERS[id]) return null;
    var свою = self !== false;
    return {
        prayer: { id: id, round: num((world || {}).round) || 1, self: свою },
        power: clamp(num((player || {}).power) - PRAYER_COST, 0, POWER_MAX)
    };
}

/* Прибавки от молитвы. Считаются ОТ МАКСИМУМА: HP от полной банки,
   интеллект от итогового со снаряжением. Вниз. */
function prayerBonus(player, world, maxHP, totalInt) {
    var a = activePrayer(player, world);
    if (!a) return { hp: 0, def: 0, int: 0 };
    var pr = PRAYERS[a.id];
    var k = (((player || {}).prayer || {}).self === false) ? 1 : PRAYER_SELF_MULT;
    return {
        hp:  ceilGame(num(maxHP)    * num(pr.hpPct)  * k / 100),
        int: ceilGame(num(totalInt) * num(pr.intPct) * k / 100),
        def: num(pr.def) * k
    };
}

/* Только наложение, не пересчёт экрана: защита заполняет новую прибавку
   HP, если до молитвы здоровье было полным. Раненого молитва не лечит. */
function planPrayerTarget(prayer, target, world, baseMaxHP) {
    var base = Math.max(0, num(baseMaxHP));
    var before=sicknessMaxHP(base,target,world), hp = Math.min(num((target || {}).hp), before);
    var maxHP = sicknessMaxHP(base + prayerBonus({ prayer:prayer }, world, base, 0).hp,target,world);
    if (prayer.id === 'god_protection' && before > 0 && hp === before) hp = maxHP;
    return { prayer:prayer, hp:hp, maxHP:maxHP };
}

/* Прижать здоровье и ману к потолку. Зовётся, когда молитва спала: набранное
   остаётся, но выше максимума быть не может. */
function clampToMax(cur, max) { return Math.min(num(cur), num(max)); }

/* ══════════════════════════════════════════════════════════════════════
   ЗВАНИЯ ПО УРОВНЯМ

   Пока это ТОЛЬКО НАДПИСЬ: ничего не даёт и ни на что не влияет. Автор
   назвал четыре рубежа — 5, 10, 15 и 20. Ниже пятого звания нет вовсе, и
   пустая строка честнее, чем выдуманное «новичок».

   Живёт в движке, а не в трёх местах разметки: звание показывают клиент,
   дашборд и стример, и разойтись они не должны. Появится за звание хоть
   одна прибавка — она ляжет сюда же, к своему рубежу.
   ══════════════════════════════════════════════════════════════════════ */

var TITLES = [
    { from: 20, name: 'Машина для убийства' },
    { from: 15, name: 'Опытный воин' },
    { from: 10, name: 'Бродяга' },
    { from:  5, name: 'Храбрый малый' }
];

/* Звание на этом уровне. Ниже пятого — пусто. */
function titleFor(level) {
    var lvl = num(level);
    for (var i = 0; i < TITLES.length; i++) {
        if (lvl >= TITLES[i].from) return TITLES[i].name;
    }
    return '';
}

/* Сколько уровней до следующего звания и как оно называется. Нужно, чтобы
   подсказка говорила «до Бродяги ещё три», а не молчала. */
function nextTitle(level) {
    var lvl = num(level);
    var best = null;
    for (var i = 0; i < TITLES.length; i++) {
        if (TITLES[i].from > lvl && (!best || TITLES[i].from < best.from)) best = TITLES[i];
    }
    return best ? { name: best.name, inLevels: best.from - lvl } : null;
}

/* ══════════════════════════════════════════════════════════════════════
   ДВОЙНОЙ ВЫСТРЕЛ ЛУЧНИКА

   Одна цель: один общий бросок на две стрелы. Две цели: два броска.
   Цели фиксируются до первого броска; вся связка — одно основное действие.
   Откат пять раундов. pendingDoubleShot хранит стадию и принятые броски;
   shotsLeft остаётся совместимым счётчиком для старых сохранений.

   ══════════════════════════════════════════════════════════════════════
   БЕЗ ПАЛЕВА — РАЗБОЙНИК

   Удар, который НЕ трогает Присутствие: не вешает стак на чистую цель и
   не раскрывает разбойника при повторном ударе по помеченной.

   Обычно второй удар по той же цели выдаёт его с головой (см. раздел
   Присутствия). Здесь этого не происходит — стаки остаются как были.
   ══════════════════════════════════════════════════════════════════════ */

var DOUBLE_SHOT_SHOTS = 2;    /* сколько выстрелов даёт навык */

/* Откат считается по раунду и номеру боя: 1 → 6 → 11; новый бой сбрасывает. */
var DOUBLE_SHOT_COOLDOWN = 5, HUNTER_MARK_COOLDOWN = 5, HUNTER_MARK_ROUNDS = 4, HUNTER_MARK_BONUS = 2;
function isBowArcher(who) {
    return !!who && who.cls === 'archer' && !isRogue(who)
        && hasKeyword(keysOf(who.mainhand), WEAPON_KEYS.ranged);
}
function canDoubleShot(who, world) { return !whyCantDoubleShot(who, world); }

function whyCantDoubleShot(who, world) {
    if (!who || who.cls !== 'archer') return 'Двойной выстрел есть только у лучника';
    if (isRogue(who)) return 'С двумя кинжалами вы уже разбойник';
    if (!isBowArcher(who)) return 'Нужен лук';
    if (isStunned(who) || isFrozen(who)) return 'Контроль не позволяет выстрелить';
    if (doubleShotPending(who.pendingDoubleShot) || shotsLeft(who)) return 'Сначала завершите подготовленный двойной выстрел';
    var left = skillCooldownLeft(who, world, 'doubleShot', DOUBLE_SHOT_COOLDOWN);
    if (left) return 'Двойной выстрел: осталось раундов до готовности — ' + left;
    return '';
}

/* Факты: номер боя и сколько выстрелов осталось. Первый тратится сразу. */
function planDoubleShot(world) {
    return Object.assign(skillCooldownFacts(world, 'doubleShot'), { shotsLeft: DOUBLE_SHOT_SHOTS });
}

/* Одна связка — один id. Разные броски имеют разные rollId; общий бросок
   повторно не считается даже при изменении бафов между стрелами. */
function doubleShotPending(op) { return !!op && op.phase !== 'done'; }
function doubleShotRollIndex(op) { return op.targets.length === 1 ? 0 : num(op.arrow); }
function doubleShotTarget(op) { return op.targets[Math.min(num(op.arrow), op.targets.length - 1)]; }
function doubleShotRollId(op) { return op.id + '-roll-' + doubleShotRollIndex(op)
    + (op.fortune && op.fortune.rerolled && op.fortune.mode === 'virtual' ? '-reroll' : ''); }
function doubleShotFortuneEligible(op) {
    return doubleShotPending(op) && !op.fortuneUsed && (num(op.arrow) === 0
        || (num(op.arrow) === 1 && op.targets.length === 2));
}
function planDoubleShotSequence(world, turn, targets, id) {
    if (!id || !Array.isArray(targets) || targets.length < 1 || targets.length > 2
        || targets.some(function (t) { return !t; })
        || (targets.length === 2 && targets[0] === targets[1])) return null;
    return { id:id, targets:targets.slice(), battleNo:num(world.battleNo),
        round:num(world.round) || 1, turnId:turn.turnId || null,
        diceMode:world.diceMode === 'd20' ? 'd20' : 'd10',
        phase:'rolling', arrow:0, seq:0, rolls:{}, spent:false, fortuneUsed:false };
}
function nextDoubleShotArrow(op) {
    var arrow = num(op.arrow) + 1;
    return Object.assign({}, op, { arrow:arrow, defense:null, preview:null,
        /* У второй отдельной стрелы свой выбор. Общая пара сохраняет один результат. */
        fortune:op.targets.length === 1 ? op.fortune || null : null,
        previewShown:op.targets.length === 1 ? op.previewShown || null : null,
        phase:arrow >= DOUBLE_SHOT_SHOTS ? 'finishing' : op.targets.length === 1 ? 'resolving' : 'rolling' });
}

/* Метка хранится у владельца: одна цель, цена и откат записываются одной
   транзакцией игрока. Другой лучник имеет собственную независимую метку. */
function hunterMarkActive(who, world, targetId) {
    var mark = (who || {}).hunterMark; world = world || {};
    return !!mark && !!targetId && mark.targetId === targetId
        && num(mark.battleNo) === num(world.battleNo)
        && num(mark.until) >= (num(world.round) || 1);
}
function whyCantHunterMark(who, world) {
    who = who || {}; world = world || {};
    if (!isBowArcher(who)) return 'Метка охотника доступна лучнику с луком';
    if (num(who.hp) <= 0) return 'Вы без сознания';
    if (num(who.extraActionRound) === (num(world.round) || 1)) return 'Дополнительное действие уже потрачено';
    var left = skillCooldownLeft(who, world, 'hunterMark', HUNTER_MARK_COOLDOWN);
    return left ? 'Метка охотника: осталось раундов до готовности — ' + left : '';
}
function canHunterMark(who, world) { return !whyCantHunterMark(who, world); }
function planHunterMark(world, targetId) {
    world = world || {};
    return Object.assign(skillCooldownFacts(world, 'hunterMark'), {
        hunterMark: { targetId: targetId, battleNo: num(world.battleNo),
            until: (num(world.round) || 1) + HUNTER_MARK_ROUNDS - 1 },
        extraActionRound: num(world.round) || 1
    });
}

/* Остались ли выстрелы. По нему интерфейс решает, открывать ли окно
   броска ещё раз. */
function shotsLeft(who) { return Math.max(0, num((who || {}).shotsLeft)); }

/* Выстрел сделан — списываем один. */
function afterShot(who) {
    var left = Math.max(0, shotsLeft(who) - 1);
    return { shotsLeft: left };
}

/* --- Без палева ------------------------------------------------------- */

var SNEAK_HIT_COOLDOWN = 5, HAMSTRING_COOLDOWN = 3;
function skillCooldownLeft(who, world, key, duration) {
    who = who || {}; world = world || {};
    if (who[key + 'Battle'] == null || num(who[key + 'Battle']) !== num(world.battleNo)
        || num(who[key + 'Round']) <= 0) return 0;
    return Math.max(0, num(who[key + 'Round']) + duration - (num(world.round) || 1));
}
function skillCooldownFacts(world, key) {
    var out = {}; world = world || {};
    out[key + 'Battle'] = num(world.battleNo);
    out[key + 'Round'] = num(world.round) || 1;
    return out;
}
function canSneakHit(who, world) {
    if (!who || !isRogue(who)) return false;
    return !who.sneakNextHit && !skillCooldownLeft(who, world, 'sneakHit', SNEAK_HIT_COOLDOWN);
}

function whyCantSneakHit(who, world) {
    if (!who || who.cls !== 'archer') return 'Это умение разбойника';
    if (!isRogue(who)) return 'Нужны ДВА кинжала — иначе вы просто лучник';
    if (who.sneakNextHit) return 'Следующий обычный удар уже подготовлен';
    var left = skillCooldownLeft(who, world, 'sneakHit', SNEAK_HIT_COOLDOWN);
    if (left) return 'Без палева: осталось раундов до готовности — ' + left;
    return '';
}

function planSneakHit(world) {
    return Object.assign(skillCooldownFacts(world, 'sneakHit'), { sneakNextHit: true });
}

/* Проверяем общую невидимость, а не видимость для отдельной цели. */
function whyCantHamstring(who, world) {
    who = who || {}; world = world || {};
    if (!isRogue(who)) return 'Нужны два кинжала';
    if (num(who.hp) <= 0) return 'Вы без сознания';
    if (num(who.mainActionRound) === (num(world.round) || 1)) return 'Главное действие уже потрачено';
    var left = skillCooldownLeft(who, world, 'hamstring', HAMSTRING_COOLDOWN);
    if (left) return 'Подрезать сухожилие: осталось раундов до готовности — ' + left;
    if (!derivePlayerEffects(Object.assign({}, who, { isRogue: true }), world).buffs
        .some(function (b) { return b.id === 'stealth'; })) return 'Нужна невидимость';
    return '';
}
function canHamstring(who, world) { return !whyCantHamstring(who, world); }
function planHamstring(world, rollId) {
    return Object.assign(skillCooldownFacts(world, 'hamstring'), { hamstringRollId: rollId || '' });
}
function hamstringAttackRecorded(who, request) {
    return !!(who && request && request.hamstring && request.rollId
        && who.hamstringRollId === request.rollId
        && num(who.hamstringBattle) === num(request.battleNo)
        && num(who.hamstringRound) === num(request.round));
}
function applyHamstring(enemy, hit, damage) {
    if (!hit || !(num(damage) > 0) || !enemyAlive(enemy)) return null;
    return applyEnemyControl(enemy, 'hamstring', 1, true);
}

/* Идёт ли сейчас удар без палева. */
function isSneakHit(who) { return !!(who || {}).sneakNextHit; }

/* Присутствие после удара БЕЗ ПАЛЕВА: не меняется вовсе. Ни новых стаков
   на чистой цели, ни раскрытия на помеченной. */
/* Подпись та же, что у resolvePresence — их вызывают в одном месте, и
   разной формой ответа легко ошибиться. */
function resolvePresenceSneaky(p) {
    return { changed: false, revealed: false, facts: {}, sneaky: true };
}

/* ══════════════════════════════════════════════════════════════════════
   ВТОРОЕ ДЫХАНИЕ ВОИНА

   Раз в игровой день воин поднимается САМ с четвертью HP за 5 ярости.

   Отличие от воскрешения жреца: жрец поднимает ДРУГОГО и живым, а воин
   себя и уже павшим. Значит проверять надо в момент, когда он упал, а не
   когда жмёт кнопку: у мёртвого хода нет.

   Ярость при этом должна была накопиться ДО падения — после смерти она
   не растёт. Отсюда и цена: пять очков, которые воин уже заработал в этом
   бою, а не отложил заранее. */

/* ======================================================================
   ОКРУЖЕНИЕ И УСИЛЕННЫЙ УДАР ВОИНА
   Считаются ТОЛЬКО ближние враги. Лучник, взявший воина в таргет, стоит
   в стороне: он не мешает воину замахнуться и не попадает под вихрь.
   ====================================================================== */

/* Здоровье врага. В дашборде поле currentHP, в симуляторе hp — читаем оба
   одним местом, чтобы правило не зависело от того, кто его позвал. */
function enemyHP(enemy) {
    var e = enemy || {};
    return num(e.currentHP !== undefined ? e.currentHP : e.hp);
}
function enemyAlive(enemy) { return enemyHP(enemy) > 0; }

/* Ближний ли враг. Одно определение на весь движок — им же пользуется
   выбор цели, чтобы «ближний» не начал означать разное в разных местах. */
function isMeleeEnemy(enemy) {
    var e = enemy || {};
    return !(e.role === 'back' || e.isRanged);
}

/* Число мест — фактический контакт, а не желание/агро. */
function meleeAttackerIds(heroId, enemies) {
    return Object.keys(enemies || {}).filter(function(id){return heroInMeleeWith(enemies[id],heroId);});
}
function meleeAttackersOn(heroId, enemies) { return meleeAttackerIds(heroId,enemies).length; }
function priestContactFacts(heroId, player, enemies) {
    return player && player.cls==='priest' && num(player.hp)>0 && meleeAttackersOn(heroId,enemies)>0
        ? {position:'front',role:'front'} : {};
}
function contactPlayerPositions(players, enemies) {
    var out=Object.assign({},players || {});
    Object.keys(out).forEach(function(id){var facts=priestContactFacts(id,out[id],enemies);
        if(facts.position && (out[id].position!=='front' || out[id].role!=='front'))out[id]=Object.assign({},out[id],facts);
    });
    return out;
}
function canEngageMelee(heroId, enemies, enemyId) {
    return meleeAttackerIds(heroId,enemies).filter(function(id){return id!==enemyId;}).length<SURROUND_CAP;
}
function contactFacts(enemyId, targetId, enemies) {
    var enemy=(enemies || {})[enemyId];
    if(!enemy || !enemyAlive(enemy))return null;
    if(!isMeleeEnemy(enemy))return {meleeContactId:null,hasEngagedTarget:true,meleeWaitingFor:null};
    if(!targetId || !canEngageMelee(targetId,enemies,enemyId))return null;
    return {meleeContactId:targetId,hasEngagedTarget:true,meleeWaitingFor:null};
}
/* Последний предохранитель для любых записей агро/мести/раскрытия. */
function cappedEnemyFacts(enemyId, facts, enemies) {
    var out=Object.assign({},facts || {}), e=(enemies || {})[enemyId];
    if(!e)return out;
    if(out.meleeContactId && isMeleeEnemy(Object.assign({},e,out)) &&
        !canEngageMelee(out.meleeContactId,enemies,enemyId)) {
        out.meleeWaitingFor=out.meleeContactId;
        out.meleeContactId=e.meleeContactId || null;
        out.hasEngagedTarget=!!out.meleeContactId;
    }
    return out;
}
/* Старые записи могли уже содержать переполнение. Стабильно оставить
   первые четыре контакта, остальных перевести в ожидание без смены агро. */
function normalizeMeleeContacts(enemies) {
    var out={}, counts={};
    Object.keys(enemies || {}).sort().forEach(function(id){
        var e=Object.assign({},enemies[id]), target=e.meleeContactId ||
            (e.meleeContactId===undefined && e.hasEngagedTarget===true ? e.aggroTargetId : null);
        if(!enemyAlive(e) || !isMeleeEnemy(e))target=null;
        if(target && (counts[target] || 0)>=SURROUND_CAP) {
            e.meleeWaitingFor=e.aggroTargetId || target;target=null;
        }
        if(target || e.meleeContactId || e.hasEngagedTarget || e.meleeWaitingFor){e.meleeContactId=target || null;e.hasEngagedTarget=!!target;}
        if(target)counts[target]=(counts[target] || 0)+1;
        out[id]=e;
    });
    return out;
}

function isSurrounded(heroId, enemies) {
    return meleeAttackersOn(heroId, enemies) >= SURROUND_CAP;
}

/* Усиленный удар. Возвращает ПЛАН: по кому бить, с каким множителем и что
   написать. Ничего не мутирует и ярость не тратит — это дело зовущего.

   ОДНОРУЧНОМУ ТОЖЕ ЕСТЬ СМЫСЛ ОКАПЫВАТЬСЯ. Раньше он бил только по одной
   цели, и стоять в окружении было незачем: чем больше врагов вокруг, тем
   хуже, и никакой награды.

   Правило простое, без выделенной цели в размахе:
     одноручное, один враг   ×1.5 в цель
     одноручное, окружили    ×1   по ВСЕМ, кто держит
     двуручное, один враг    ×2   в цель
     двуручное, окружили     ×1.5 по ВСЕМ, кто держит

   ВЫБИРАЕТ ИГРОК, А НЕ ДВИЖОК. Раньше вид удара решался сам, по числу
   врагов: окружили двое — значит размах, и мнения воина никто не спрашивал.
   А смысл выбирать есть: добить раненого в цель бывает важнее, чем задеть
   всех по разу.

   Поле `mode` — 'single' или 'sweep'. Не передали — считаем по-старому, от
   числа врагов: так живут симулятор и дашборд, которые за игрока не решают.

   Размах ПО ОДНОМУ врагу смысла не имеет: бить всё равно некого, кроме
   него. Просьбу исполняем как удар в цель, а не отдаём пустой список. */
function planPowerStrike(p) {
    var who = p.who || {};
    var ids = meleeAttackerIds(p.heroId, p.enemies);
    /* Цель по умолчанию — та, по которой воин и так бил. */
    var single = p.targetId || ids[0] || null;

    /* Чего хочет игрок. Без просьбы — прежнее правило по числу врагов. */
    var хочет = p.mode === 'single' || p.mode === 'sweep' ? p.mode
              : (ids.length >= 2 ? 'sweep' : 'single');
    /* Размахнуться не по кому — бьём в цель. */
    if (хочет === 'sweep' && ids.length < 2) хочет = 'single';

    if (!p.twoHanded) {
        if (хочет === 'sweep') {
            /* По ВСЕМ одинаково, без выделенной цели: он бьёт с размаху. */
            return { kind: 'sweep', mult: POWER_ONE_SWEEP, targetIds: ids,
                     label: 'Круговой удар', cost: POWER_STRIKE_COST };
        }
        return { kind: 'single', mult: POWER_ONE_HAND, targetIds: single ? [single] : [],
                 label: 'Мощный удар', cost: POWER_STRIKE_COST };
    }
    if (хочет === 'sweep') {
        return { kind: 'sweep', mult: POWER_TWO_SWEEP, targetIds: ids,
                 label: 'Размашистый удар', cost: POWER_STRIKE_COST };
    }
    return { kind: 'single', mult: POWER_TWO_SINGLE, targetIds: single ? [single] : [],
             label: 'Мощный удар', cost: POWER_STRIKE_COST };
}

/* Что игроку вообще предлагать. Интерфейс не должен сам догадываться, когда
   размах доступен: правило одно и живёт здесь.

   `sweep` — только когда держат двое и больше. `cost` одинаков для обоих:
   платят за замах, а не за число целей. */
function powerStrikeOptions(p) {
    var ids = meleeAttackerIds(p.heroId, p.enemies);
    var two = !!p.twoHanded;
    return {
        canSweep: ids.length >= 2,
        held: ids.length,
        single: { mult: two ? POWER_TWO_SINGLE : POWER_ONE_HAND, label: 'В цель' },
        sweep:  { mult: two ? POWER_TWO_SWEEP  : POWER_ONE_SWEEP, label: 'С размаха' },
        cost: POWER_STRIKE_COST
    };
}

/* Применение усиленного удара к УЖЕ посчитанному итогу — как усиление
   Арканой: удваивается результат, а не база. Возвращает факты, ничего
   не мутирует. Ярость списывает зовущий по полю spend. */
function applyPowerStrike(damage, mult) {
    /* Множитель идёт через Number, мимо num(). Когда num() был parseInt,
       num(1.5) давал единицу, и полуторный удар молча превращался в
       обычный. Теперь num() — parseFloat и дробь не режет, но множитель
       по-прежнему читается отдельно: мусор и ноль здесь значат «×1», а не
       «×0». Урон — целый, его через num можно. */
    var k = Number(mult);
    if (!isFinite(k) || k <= 0) k = 1;
    return Math.max(0, ceilGame(num(damage) * k));
}
/* Множитель для ОДНОЙ цели: одноручным полтора, двуручным вдвое.
   Размашистый удар считает planPowerStrike — у него свой множитель. */
function powerStrikeMult(twoHanded) {
    return twoHanded ? POWER_TWO_SINGLE : POWER_ONE_HAND;
}

/* РАЗМАШИСТЫЙ УДАР по нескольким целям.
   Одна атака воина — один бросок атаки, он уже посчитан зовущим и приходит
   готовым уроном. А защиту каждый враг кидает СВОЮ: один и тот же замах
   один парирует, другой ловит критом. Ведущий жмёт один раз, а разбирается
   движок — иначе на четырёх врагов вышло бы четыре окна защиты.

   Возвращает строку на каждого — из неё интерфейс рисует одну карточку.
   Ничего не мутирует: HP пишет зовущий по полю left. */
function resolveSweep(p) {
    var rng = p.rng || Math.random;
    var mode = p.mode || 'd20';
    var dmg = Math.max(0, exactDamage(p));
    return (p.targets || []).map(function (tg) {
        /* rollDice возвращает ОБЪЕКТ {total, dice} — в порог идёт total,
           а сами кубики показываем на карточке. */
        var cast = rollDice(mode, rng);
        var roll = cast.total;
        var def = resolveDefense({
            roll: roll, defMod: num(tg.defMod), damage: dmg,
            difficulty: p.difficulty, canDefend: tg.canDefend
        });
        var was = enemyHP(tg);
        var left = hpAfterDamage(was, def.damageTaken);
        return {
            id: tg.id, name: tg.name,
            roll: roll, dice: cast.dice, outcome: def.outcome, label: def.label,
            damage: def.damageTaken, reduced: def.reduced,
            hpWas: was, left: left, dead: left <= 0
        };
    });
}

/* Короткая сводка для подписи под карточкой. */
function sweepSummary(rows) {
    var list = rows || [];
    return {
        targets: list.length,
        total: list.reduce(function (s, r) { return s + num(r.damage); }, 0),
        killed: list.filter(function (r) { return r.dead; }).length,
        parried: list.filter(function (r) { return r.outcome === 'parry'; }).length
    };
}

function canPowerStrike(who) {
    if ((who || {}).cls !== 'warrior') return false;
    return num((who || {}).resource) >= POWER_STRIKE_COST;
}
function whyCantPowerStrike(who) {
    if ((who || {}).cls !== 'warrior') return 'Усиленный удар только у воина';
    if (num((who || {}).resource) < POWER_STRIKE_COST) return 'Не хватает Ярости';
    return null;
}

var SURROUND_CAP     = 4;      /* больше четырёх БЛИЖНИХ на одного не лезет */
/* ОКРУЖЁН — МИНУС К ЗАЩИТЕ (решение автора 26.09.2026): бьют со всех
   сторон, и защита страдает. Раньше был минус к атаке. */
var SURROUND_DEF     = -1;     /* дебаф «Окружён»: поправка к броску защиты */
var POWER_STRIKE_COST = 5;     /* ярости за усиленный удар */
var POWER_ONE_HAND   = 1.5;    /* одноручным по своей цели — полтора */
var POWER_ONE_SWEEP  = 1;      /* и по одному по остальным, кто держит */
var POWER_TWO_SINGLE = 2;      /* двуручным по одной цели — вдвое */
var POWER_TWO_SWEEP  = 1.5;    /* двуручным по всем окружившим — полтора */

var SECOND_WIND_HP   = 0.25;   /* доля от МАКСИМАЛЬНОГО HP */
var SECOND_WIND_COST = 5;      /* ярости */

function canSecondWind(who, world) {
    if (!who || who.cls !== 'warrior') return false;
    if (num(who.hp) > 0) return false;                 /* пока жив — незачем */
    if (num(who.resource) < SECOND_WIND_COST) return false;
    return !usedToday(who, 'secondWindDay', world);
}

function whyCantSecondWind(who, world) {
    if (!who || who.cls !== 'warrior') return 'Второе дыхание есть только у воина';
    if (num(who.hp) > 0) return 'Пока вы на ногах, оно не нужно';
    if (usedToday(who, 'secondWindDay', world))
        return 'Сегодня уже вставали';
    if (num(who.resource) < SECOND_WIND_COST)
        return 'Не хватает ярости — её надо было накопить до падения';
    return '';
}

/* Факты подъёма: сколько HP, сколько ярости осталось, какой сегодня день. */
function planSecondWind(who, world) {
    var hp = Math.max(1, ceilGame(num(who.maxHP) * SECOND_WIND_HP));
    return {
        hp: hp,
        resource: Math.max(0, num(who.resource) - SECOND_WIND_COST),
        secondWindDay: num((world || {}).day)
    };
}

/* ══════════════════════════════════════════════════════════════════════
   МЕДИТАЦИЯ МАГА

   Пропускает ход и возвращает ПОЛОВИНУ маны. Раз в игровой день.

   Плата ходом — это и есть цена: маг стоит целый раунд без атаки, а
   партия дерётся вчетвером. Поэтому и ограничение днём, а не боем.

   Держится на факте `meditateUsedDay`, как воскрешение жреца: снимать
   нечего, само истечёт с новым днём. */

var MEDITATE_SHARE = 0.5;     /* доля от МАКСИМУМА маны */

function canMeditate(who, world) {
    if (!who || who.cls !== 'mage') return false;
    if (usedToday(who, 'meditateUsedDay', world)) return false;
    /* Полная шкала — медитировать незачем, только ход потеряешь. */
    return num(who.mp) < num(who.maxMP);
}

function whyCantMeditate(who, world) {
    if (!who || who.cls !== 'mage') return 'Медитировать умеет только маг';
    if (usedToday(who, 'meditateUsedDay', world))
        return 'Сегодня уже медитировали';
    if (num(who.mp) >= num(who.maxMP)) return 'Мана и так полна';
    return '';
}

/* Факты медитации: сколько маны стало и какой сегодня день.
   Выше максимума не переливается. */
function planMeditate(who, world) {
    var gain = ceilGame(num(who.maxMP) * MEDITATE_SHARE);
    return {
        mp: Math.min(num(who.maxMP), num(who.mp) + gain),
        meditateUsedDay: num((world || {}).day),
        skipsTurn: true                       /* ход потрачен целиком */
    };
}

/* ══════════════════════════════════════════════════════════════════════
   ПЕСНИ БАРДА

   Два умения с самого начала, обе стоят Настроения, поются ДОП ДЕЙСТВИЕМ
   (спел — и бей) и держатся ДВА раунда (SONG_ROUNDS):

     Качевый риф       — всем своим +2 к броску атаки
     Колкая подъёбочка — всем врагам −2 к броску атаки
                         (ключ funeral_march, бывший Похоронный марш)

   Срок меряем раундами, а не ходами врага: песня звучит на весь раунд, а
   не догоняет каждого по очереди. Это отличает её от Присутствия и
   обморожения, где срок висит на конкретном враге.

   Барду нужен ИНСТРУМЕНТ: без него он не поёт, как и не дерётся.
   ══════════════════════════════════════════════════════════════════════ */

var SONG_COST   = 5;      /* Настроения за песню */
var SONG_ROUNDS = 2;      /* держится ДВА раунда. Два поставили, когда песня
                             ещё стоила целого хода: за один раунд она его
                             не окупала — бард пел вместо того, чтобы бить,
                             и партия с ним побеждала РЕЖЕ. Теперь песня —
                             доп действие (спел — и бей), срок остался. */
var SONG_BONUS  = 2;      /* своим +2 к броску */
var SONG_MALUS  = 2;      /* врагам −2 к броску */

var SONGS = {
    inspiring_riff: {name:'Бодрящий фон',target:'allies',icon:'assets/gear/spells/inspiring_riff_buff.png'},
    groovy_riff:  { name: 'Качевый риф',      target: 'allies',
                    atk:  SONG_BONUS, def: SONG_BONUS, icon: 'assets/gear/spells/groovy_riff.png' },
    funeral_march:{ name: 'Колкая подъёбочка', target: 'enemies',
                    atk: -SONG_MALUS, def: -SONG_MALUS, icon: 'assets/gear/spells/diss_track.png' }
};

/* ══════════════════════════════════════════════════════════════════════
   ИСПОЛНЕНИЕ ПЕСНИ — БРОСОК, А НЕ АВТОМАТ

   Раньше песня всегда ложилась целиком: нажал — получил. Ни промаха, ни
   крита, в отличие от обычной атаки. Теперь бард КИДАЕТ, и от броска
   зависит, сколько от песни достанется:

     мимо нот              промах, песня не ложится вовсе
     криво сыграл          половина, но мелодия узнаваема
     отличное исполнение   полная величина
     виртуозное            крит: столько же сверху, сколько даёт крит

   Порог крита тот же, что у обычного броска героя; пороги промаха и
   половины — свои, ниже боевых (см. SONG_MISS и SONG_HALF). Крит
   считается ОТ ТОЙ ЖЕ силы крита, что и в бою.
   ══════════════════════════════════════════════════════════════════════ */

/* Пороги исполнения. У бафов и дебафов они СВОИ, ниже боевых, и намеренно:
   провалить баф обиднее, чем промахнуться мечом. Мечом махнёшь ещё раз в
   следующем раунде, а песня стоит действия и пяти Настроения — терять
   всё это на кубике было слишком дорого.

   Было 8 и 13, стало 4 и 8: промах теперь редкость, а не рутина. (Боевые
   пороги — 7 и 11, T.graze и T.hit.)
   Эти же пороги возьмут будущие заклинания-бафы, когда появятся. */
var SONG_MISS = 4;      /* ниже — мимо нот */
var SONG_HALF = 8;      /* ниже — криво, но узнаваемо */

/* Фортуна: заряды привязаны к бою и выдающему барду. Использованные
   квитанции храним до конца боя: повтор доставки не возвращает заряд. */
function fortuneCharges(who, world) {
    var all = (who || {}).fortuneCharges || {};
    return Object.keys(all).filter(function (id) {
        return all[id] && !all[id].spent && num(all[id].battleNo) === num((world || {}).battleNo);
    }).sort();
}
function fortunePending(op) { return !!op && op.phase !== 'done'; }
/* Только выбранная игроком атака/лечение с броском. Защита, песни,
   перехваты, удары вслед и способности без броска заряд сохраняют. */
function fortuneActionEligible(kind, targetType, spell) {
    return kind === 'attack' && (targetType === 'enemy' && (!spell || spell.subtype === 'attack')
        || targetType === 'player' && !!spell && spell.subtype === 'heal');
}
function whyCantFortune(who, world) {
    var w = who || {}, env = world || {};
    if (w.cls !== 'bard') return 'Петь умеет только бард';
    if (!String(w.mainhand || (w.slots || {}).mainhand || '')) return 'Нужен музыкальный инструмент';
    if (num(w.hp) <= 0 || isStunned(w) || isFrozen(w)) return 'Нельзя действовать под контролем или после смерти';
    if (num(w.resource) < 1) return 'Нужно хотя бы 1 настроение';
    if (usedToday(w, 'fortuneUsedDay', env)) return 'Уже исполнено сегодня';
    if (!env.battleOpen && !(env.queue || []).length) return 'Фортуна действует в текущем бою';
    if (num(w.mainActionRound) === (num(env.round) || 1)) return 'Основное действие потрачено';
    if (fortunePending(w.pendingFortuneAttack) || doubleShotPending(w.pendingDoubleShot)
        || retreatPending(w.pendingRetreat) || w.pendingApproach) return 'Сначала завершите начатое действие';
    return '';
}
function planFortuneGrant(who, world, targetId, id, turn) {
    if (whyCantFortune(who, world) || !targetId || !id) return null;
    return { mainActionRound:num(world.round) || 1, fortuneUsedDay:num(world.day),
        fortuneGrant:Object.assign({}, turn || {}, { id:id, targetId:targetId, phase:'pending',
            battleNo:num(world.battleNo), day:num(world.day) }) };
}
function startFortuneChoice(who, world, input, virtual) {
    var charge = fortuneCharges(who, world)[0];
    if (!charge) return null;
    return { chargeId:charge, mode:virtual ? 'virtual' : 'manual', stage:'choice',
        first:input, current:input, rerolled:false };
}
function rerollFortune(choice, input) {
    if (!choice || choice.stage !== 'choice' || choice.mode !== 'virtual' || choice.rerolled) return null;
    return Object.assign({}, choice, { current:input, rerolled:true });
}
function acceptFortune(who, world, choice, manualReroll, keepUnused) {
    if (!choice || choice.stage !== 'choice' || fortuneCharges(who, world).indexOf(choice.chargeId) < 0) return null;
    var charges = Object.assign({}, who.fortuneCharges);
    var rerolled = choice.mode === 'manual' ? !!manualReroll : !!choice.rerolled;
    /* Двойной выстрел: принятие без переброса оставляет заряд для второй
       стрелы или следующего действия. Остальные умения сохраняют своё правило. */
    if (!keepUnused || rerolled) charges[choice.chargeId] = Object.assign({}, charges[choice.chargeId], { spent:true });
    return { fortuneCharges:charges, choice:Object.assign({}, choice, { stage:'accepted',
        rerolled:rerolled }) };
}
function fortuneRollId(op) {
    return op.fortune && op.fortune.rerolled && op.fortune.mode === 'virtual' ? op.id + '-reroll' : op.id;
}
/* Один расчёт предварительного и окончательного результата. Снимок attack
   сохраняется ДО показа числа: цель, оружие и усиления между попытками те же. */
function fortuneAttackPlan(attack, raw, who, world) {
    var a = attack, p = who || {}, c = a.choice || {}, sp = a.spell;
    if(heroActionControlled(p,world || {}))return null;
    var hands=Object.assign({},p,p.slots || {});
    if(!sp && whyCantAttack(hands))return null;
    if(!sp && a.input.target.kind==='enemy' && isMeleeAttack(hands) &&
        isMeleeEnemy((world.enemies || {})[a.targetId]) &&
        !canEngageMelee(a.playerId,world.enemies || {},a.targetId))return null;
    var result = resolveRoll(Object.assign({}, a.input, { roll:raw, world:a.world }));
    var facts = { mainActionRound:num(world.round) || 1 };
    if (a.input.target.kind === 'enemy' && shieldActive(Object.assign({},p,{battleNo:world.battleNo}))) {
        if (!a.endShieldConfirmed) return null;
        Object.assign(facts,planShieldAttack(p,world));
    }
    if (!(sp && sp.subtype === 'heal' && a.input.target.kind === 'player')) facts.targetId = a.targetId;
    var resource = num(p.resource), power = num(p.power);
    if (sp && resourceCost(sp.manaCost)) {
        var key = a.resourceKind === 'mana' ? 'mp' : 'resource';
        if (num(p[key]) < resourceCost(sp.manaCost)) return null;
        facts[key] = num(p[key]) - resourceCost(sp.manaCost);
        if (key === 'resource') resource = facts[key];
    }
    if (a.resourceKind === 'mood') facts.resource = moodAfterAttack(resource);
    if (c.skill === 'hamstring') {
        if (!canHamstring(Object.assign({},hands,{id:a.playerId}),world)) return null;
        result.hamstring = true;
        Object.assign(facts, planHamstring(world, a.id));
    }
    result.sneaky = !sp && !result.hamstring && a.input.attacker.isRogue && !!a.sneaky;
    if (result.sneaky) facts.sneakNextHit = false;
    if (c.power) {
        if (!canPowerStrike({ cls:a.input.attacker.cls, resource:resource })) return null;
        var ps = a.powerPlan || planPowerStrike({ who:{ cls:a.input.attacker.cls }, twoHanded:a.twoHanded,
            mode:c.power, heroId:a.playerId, enemies:a.enemies, targetId:a.targetId });
        scaleDamage(result, ps.mult);
        result.powerKind = ps.kind;
        facts.resource = resource - POWER_STRIKE_COST;
    }
    if (c.empower) {
        if (!canUseEmpower(a.input.attacker.cls) || !canEmpower(power, c.empower)) return null;
        var ep = planEmpower(a.powerBefore, c.empower);
        if (power < ep.spent) return null;
        scaleDamage(result, ep.multiplier);
        result.empowered = ep.spent;
        power -= ep.spent;
    }
    if (a.input.attacker.cls === 'mage') facts.power = powerAfterCast(power, sp && sp.manaCost,
        a.input.attacker.total.int, !!(sp && sp.cantrip));
    else if (a.input.attacker.cls === 'priest') facts.power = faithAfterCast(power, sp);
    return { result:result, facts:facts };
}

function songOutcome(total, critThreshold) {
    var t = num(total);
    if (t >= num(critThreshold || 20)) return 'virtuoso';
    if (t >= SONG_HALF) return 'clean';
    if (t >= SONG_MISS) return 'sloppy';
    return 'miss';
}

var SONG_LABEL = {
    miss:     'Мимо нот',
    sloppy:   'Криво сыграл, но мелодия узнаваема',
    clean:    'Отличное исполнение',
    virtuoso: 'Виртуозное исполнение'
};

/* Во сколько раз ложится песня. Крит добавляет столько же, сколько в бою. */
function songPower(outcome, critPower) {
    if (outcome === 'miss') return 0;
    if (outcome === 'sloppy') return 0.5;
    if (outcome === 'virtuoso') return 1 + (num(critPower) || 0.5);
    return 1;
}

/* Итоговая поправка песни: базовая величина, умноженная на исполнение.
   Округляем ОТ НУЛЯ, чтобы половина от -2 осталась -1, а не нулём. */
function songEffectSize(base, outcome, critPower) {
    var k = songPower(outcome, critPower);
    var v = num(base) * k;
    return v > 0 ? ceilGame(v) : -ceilGame(-v);
}

/* Может ли бард спеть: класс, инструмент, Настроение. */
/* Бодрящий фон хранится на исполнителе, отдельно от короткого риффа. */
var INSPIRING_COST = 10, INSPIRING_ROUNDS = 3;
function heroControlStamps(p, world) {
    var out=[];
    CONTROL_KEYS.forEach(function(k){if(controlLeft(p,k)>0)out.push(k+':'+(p[k].instanceId||p[k].setTurn||0));});
    (p.effects||[]).forEach(function(e){
        if(!['while','permanent'].includes(e.duration) && (e.control===true || e.preventsActions===true || CONTROL_KEYS.indexOf(e.id)>=0) && isEffectActive(e,num(world.round)))
            out.push(e.id+':'+(e.instanceId||e.setTurn||e.setRound||0));
    });
    return out;
}
function heroActionControlled(p, world) {
    return isStunned(p) || isFrozen(p) || isDisoriented(p) || (p.effects||[]).some(function(e){
        return (e.preventsActions===true || ['stun','frostbite','disorientation'].indexOf(e.id)>=0) && isEffectActive(e,num(world.round)) && !suppressInspiringEffect(e,world).suppressed;
    });
}
function inspiringActive(p, world) {
    var s=p&&p.inspiringSong,w=world||{};
    if(!s || num(p.hp)<=0 || num(s.battleNo)!==num(w.battleNo) || num(s.until)<num(w.round))return false;
    var original=s.controlStamps||[];
    return !heroControlStamps(p,w).some(function(x){return original.indexOf(x)<0;});
}
function inspiringProtection(world) {
    var w=world||{},sources=[],chance=0,left=0;
    Object.keys(w.players||{}).forEach(function(id){
        var p=w.players[id];if(!inspiringActive(p,w))return;
        sources.push(id);chance=Math.max(chance,num(p.inspiringSong.chance));
        left=Math.max(left,num(p.inspiringSong.until)-num(w.round)+1);
    });
    return {active:sources.length>0,sources:sources,chance:chance,left:left};
}
function whyCantInspiring(p,world) {
    if(!p || p.cls!=='bard')return 'Петь умеет только бард';
    if(num(p.hp)<=0 || heroActionControlled(p,world))return 'Контроль или потеря сознания не позволяют исполнить песню';
    if(p.nightLock)return 'Сначала завершите ночёвку';
    if(!String(p.mainhand||(p.slots||{}).mainhand||''))return 'Нужен музыкальный инструмент';
    if(num(p.resource)<INSPIRING_COST)return 'Нужно 10 Настроения';
    if(usedThisBattle(p,'inspiringUsedBattle',world))return 'Бодрящий фон уже использован в этом бою';
    if(!hasExtraAction(p,world))return 'Дополнительное действие уже потрачено';
    return '';
}
function planInspiring(p,world,total,critThreshold,id) {
    if(whyCantInspiring(p,world))return null;
    var outcome=songOutcome(total,critThreshold),chance=outcome==='virtuoso'?75:outcome==='clean'?50:outcome==='sloppy'?25:0;
    return {outcome:outcome,chance:chance,relief:chance===75?2:chance?1:0,
        facts:{resource:num(p.resource)-INSPIRING_COST,extraActionRound:num(world.round),
            inspiringUsedBattle:num(world.battleNo),inspiringSong:chance?{id:id,chance:chance,
                until:num(world.round)+INSPIRING_ROUNDS-1,battleNo:num(world.battleNo)}:null}};
}
function shortenHeroControl(p,world,amount) {
    var facts={};
    CONTROL_KEYS.forEach(function(k){
        if(controlLeft(p,k)<=0)return;
        var end=controlUntil(p[k])-amount;
        facts[k]=end<=completedEnemyTurns(p)?null:Object.assign({},p[k],{untilTurn:end});
    });
    if(p.effects)facts.effects=p.effects.map(function(e){
        if(!(e.control===true || CONTROL_KEYS.indexOf(e.id)>=0) || !isEffectActive(e,num(world.round)))return e;
        if(e.duration==='turns')return Object.assign({},e,{turnsLeft:Math.max(0,num(e.turnsLeft)-amount)});
        if(typeof e.duration==='number')return Object.assign({},e,{duration:Math.max(0,num(e.duration)-amount)});
        return e;
    }).filter(function(e){return e.duration==='turns'?num(e.turnsLeft)>0:e.duration!==0;});
    return facts;
}
function suppressInspiringEffect(e,world) {
    if(!e || e.kind!=='debuff' || !['while','permanent'].includes(e.duration) || !inspiringProtection(world).active)return e;
    return Object.assign({},e,{suppressed:true,modifiers:{},tooltip:(e.tooltip||e.name||e.id)+' · Подавлено: Бодрящий фон'});
}
function planHeroControl(p,world,key,turns,eventId,roll) {
    if(!p || num(p.hp)<=0 || CONTROL_KEYS.indexOf(key)<0 || !eventId || !(num(turns)>0))return null;
    if((p.controlChecks||{})[eventId])return null;
    var protection=inspiringProtection(world),blocked=num(roll)<protection.chance;
    var facts={controlChecks:Object.assign({},p.controlChecks)};
    facts.controlChecks[eventId]={blocked:blocked,roll:num(roll),chance:protection.chance,key:key,interrupted:!blocked && inspiringActive(p,world)};
    if(!blocked){facts[key]={setTurn:num(p.turnNo),untilTurn:num(p.turnNo)+num(turns),instanceId:eventId};facts.inspiringSong=null;}
    return {facts:facts,blocked:blocked};
}
function canSing(who, song) {
    if (!who || who.cls !== 'bard') return false;
    if (!SONGS[song]) return false;
    if (!String(who.mainhand || '')) return false;      /* нечем играть */
    return num(who.resource) >= (song==='inspiring_riff'?INSPIRING_COST:SONG_COST);
}

/* Почему нельзя — коротким текстом для интерфейса. */
function whyCantSing(who, song) {
    if (!who || who.cls !== 'bard') return 'Петь умеет только бард';
    if (!SONGS[song]) return 'Такой песни нет';
    if (!String(who.mainhand || ''))
        return 'Вы видели мои руки? Они созданы для музыки и любви, а не для мордобоя';
    if (num(who.resource) < (song==='inspiring_riff'?INSPIRING_COST:SONG_COST)) return 'Не хватает Настроения';
    return '';
}

/* Факты песни: кому и до какого раунда. Пишутся тем, на кого она легла. */
/* Факт спетой песни. ВЕЛИЧИНА КЛАДЁТСЯ СЮДА: она зависит от броска на
   исполнение, а не от самой песни. Без неё крит и кривая игра ничего не
   меняли — songModifier брал базовое значение, и виртуоз давал столько же,
   сколько промах.

   Ноль величины — песня не легла: факт не ставим вовсе. */
function planSong(song, round, size, battleNo) {
    var s = SONGS[song];
    if (!s) return null;
    var v = (size === undefined) ? num(s.atk) : num(size);
    if (!v) return { target: s.target, facts: null };
    return { target: s.target,
             /* until — ПОСЛЕДНИЙ раунд, когда песня ещё звучит, поэтому
                минус один: раунд исполнения уже входит в SONG_ROUNDS.
                Без этого песня жила на раунд дольше правила — счётчик
                показывал 3 при SONG_ROUNDS = 2. */
             /* Номер боя пишем рядом: без него песня переживала конец
                драки и оживала в первом раунде следующей. */
             facts: { song: { id: song, until: num(round) + SONG_ROUNDS - 1,
                              size: v, battleNo: num(battleNo) } } };
}

/* ЗВЕРЬ НЕ ПОНИМАЕТ РЕЧИ.

   Демотивирующая песня — это насмешка словами. Волк, крыса и прочая
   нечисть слов не разбирают, значит и обидеться не могут: песня звучит,
   действие и Настроение тратятся, а эффекта нет.

   На своих это не распространяется: подбадривающая песня действует на всю
   партию, там речь понимают все.

   Правило живёт ЗДЕСЬ, а не в клиенте: его должны одинаково понимать и
   телефон, и дашборд, и симулятор. */
function songAffects(enemy) {
    return !!(enemy && enemy.human !== false);
}
function songDeafTargets(enemies) {
    var out = [];
    for (var id in (enemies || {})) {
        if (!songAffects(enemies[id])) out.push(id);
    }
    return out;
}

/* Действует ли песня прямо сейчас.

   ПЕСНЯ ПРИВЯЗАНА И К БОЮ, а не только к раунду. Раунды в каждом бою
   начинаются заново, и песня, спетая в третьем раунде прошлой драки,
   оживала в первом раунде следующей: значок висел, прибавка работала.

   Номер боя пишется вместе с песней. У старых записей поля нет — их
   считаем действующими по-прежнему, только по раунду: читающая сторона
   обязана переживать отсутствие новых полей. */
function songActive(who, round, battleNo) {
    var sg = (who || {}).song;
    if (!sg || !SONGS[sg.id]) return false;
    if (sg.battleNo !== undefined && battleNo !== undefined
        && num(sg.battleNo) !== num(battleNo)) return false;
    return num(sg.until) >= num(round);
}

/* Поправка к броску от песни. Плюс своим, минус врагам — знак уже
   заложен в самой песне, отдельного правила не нужно. */
/* Поправка от песни — СЫГРАННАЯ, а не базовая. У старых записей поля size
   нет, для них берём базовую: правило совместимости, читающая сторона
   обязана переживать отсутствие новых полей. */
function songModifier(who, round, battleNo) {
    if (!songActive(who, round, battleNo)) return 0;
    var f = who.song;
    return f.size !== undefined ? num(f.size) : num(SONGS[f.id].atk);
}

/* Эффект для показа: иконка, подпись, сколько осталось. */
/* Значок песни в строке эффектов. Показываем СЫГРАННУЮ величину и сколько
   раундов осталось: раньше подпись врала — при кривом исполнении она всё
   равно обещала полную прибавку. */
function songEffect(who, round, battleNo) {
    if (!songActive(who, round, battleNo)) return null;
    var s = SONGS[who.song.id], left = num(who.song.until) - num(round) + 1;
    var size = songModifier(who, round, battleNo);
    return { id: 'song', kind: size > 0 ? 'buff' : 'debuff',
             name: s.name, icon: s.icon, counter: left,
             tooltip: s.name + ': ' + (size > 0 ? '+' : '') + size
                      + ' к броскам атаки и защиты, осталось раундов ' + left,
             modifiers: { atk: size, def: size } };
}

/* ==========================================================================
   9. МЕСТЬ  (раздел 5)
   Возвращает ТОЛЬКО факты для записи во врага. Никаких «сбросить чужой флаг».
   ========================================================================== */

/* ══════════════════════════════════════════════════════════════════════
   РАЗРЫВ БЛИЖНЕГО БОЯ

   Бросить противника, с которым уже дерёшься, теперь стоит удара вслед.

   ОТДЕЛЬНОГО БРОСКА «СРАБОТАЛ ЛИ ПЕРЕХВАТ» НЕТ. Уходящего бьют обычной
   атакой, и она сама решает: ПОПАЛ — ЗНАЧИТ НЕ ПУСТИЛ. Так правило не
   заводит второй расчёт рядом с уже существующим.

   ЖЕЛАНИЕ И ЦЕЛЬ — РАЗНЫЕ ВЕЩИ. Раньше Месть сразу переписывала
   `aggroTargetId`, и враг оказывался на тыловике ещё до того, как его
   попытались удержать. Теперь желание живёт отдельным полем
   `retargetIntent`, а фактическая цель меняется ТОЛЬКО после промаха
   удерживающей атаки.

   ЩИТ НЕ СОЗДАЁТ ПОВОДА УЙТИ. Сначала нужна обычная причина сорваться в
   тыл — мало HP у дальнего или Месть за серию. Глухая оборона лишь делает
   уход вероятнее: бить в поднятый щит (+6 к защите воина) никому не
   хочется.
   ══════════════════════════════════════════════════════════════════════ */

var RETARGET_CHANCE          = 0.50;   /* обычная цель */
var RETARGET_CHANCE_SHIELDED = 0.75;   /* цель под Глухой обороной */

function retargetChance(p) {
    return ((p || {}).currentTargetShielded || (p || {}).targetMarked)
        ? RETARGET_CHANCE_SHIELDED
        : RETARGET_CHANCE;
}

/* Чистое решение: уходить или остаться. Бросок передаётся снаружи, чтобы
   проверки могли его подменить, а не гадать на случайности. */
function decideRetarget(p) {
    var chance = retargetChance(p);
    var rng = (p && p.rng) || Math.random;
    var r = rng();
    /* БРОСОК ВИДИМЫМ ЧИСЛОМ, 1–100. Ведущему и зрителю нужно «выпало 65 при
       шансе 75 — уходит», а не голое «да» или «нет». Уходит, когда выпало
       НЕ БОЛЬШЕ шанса: так «65 при 75» читается само, без пояснений.

       Число выводится из того же броска, что и решение, — разойтись им не с
       чего: r < chance ровно тогда, когда floor(r·100)+1 ≤ chance·100. */
    return { chance: chance, leave: r < chance, roll: Math.floor(r * 100) + 1 };
}

/* Обёртка над Местью. Сама Месть НЕ ТРОНУТА: она по-прежнему решает, есть
   ли повод сорваться, и считает серию попаданий. Меняется только одно —
   что происходит после успеха.

   Переводим в НАМЕРЕНИЕ лишь тогда, когда всё это разом:
     враг ближний и уже связан с живой целью;
     уйти хочет к ДАЛЬНЕМУ (роль back, а не класс — таблица ролей одна);
     новая цель не та же самая.
   Во всех прочих случаях отдаём старые факты как были. */
function planRevengeRetarget(p) {
    if (isMeleeEnemy(p.enemy) && isRooted(p.enemy)) {
        /* Факт физического подхода добавит enemyHitTargetFacts: роль front
           сама по себе не доказывает контакт (жрец со щитом тоже колдует). */
        return { changed: false, instant: false, facts: {} };
    }
    var base = resolveRevenge(p);
    if (!base.changed || !base.instant) return base;
    /* МГНОВЕННЫЙ перевод цели, который НЕ станет намерением ниже, гасит
       прежнее намерение: враг уже ушёл, куда ему велели, и рваться к старому
       тыловику ему незачем. Промах дальника сюда не доходит — base.changed
       тогда ложь, и старое валидное намерение остаётся. */
    var мгновенно = function (b) {
        if (b && b.facts && b.facts.aggroTargetId !== undefined) b.facts.retargetIntent = null;
        return b;
    };

    var enemy = p.enemy || {};
    var текущая = enemy.aggroTargetId;
    if (!текущая || текущая === p.attackerId) return мгновенно(base);
    if (!p.currentTargetAlive) return мгновенно(base);       /* держать некого */
    if (!isMeleeEnemy(enemy)) return мгновенно(base);        /* дальний ни от кого не отрывается */
    if (p.attackerRole !== 'back') return мгновенно(base);   /* срыв в тыл, а не куда попало */

    /* Мгновенной смены цели быть не должно — только желание. Серию и прочие
       факты Мести сохраняем: их считает она, и считать заново нельзя. */
    var facts = {};
    Object.keys(base.facts || {}).forEach(function (k) {
        if (k !== 'aggroTargetId' && k !== 'aggroReason') facts[k] = base.facts[k];
    });
    facts.retargetIntent = {
        targetId: p.attackerId,
        reason: base.reason,
        kind: 'revenge',
        setRound: num(p.round)
    };
    return { changed: true, instant: false, intent: true, reason: base.reason,
             announce: base.announce, anger: !!base.anger,
             streakNeeded: base.streakNeeded, facts: facts };
}

/* ЕСТЬ ЛИ ОТ КОГО ОТРЫВАТЬСЯ.

   Одно правило на обе стороны: и когда уходит враг, и когда уходит игрок.
   Решение уходить принимается по-разному — врагу бросают 50/75, за игрока
   решил сам игрок, — но ДАЛЬШЕ всё одинаково: прежний противник получает
   попытку удержать, и его бросок решает.

   Разрыва НЕТ, когда:
     уходит дальний — он ни с кем не связан, он и так в тылу (роль, не класс);
     уход заклинанием — маг не подходил вплотную;
     прежней цели нет или она мертва — держать некому, переход бесплатный;
     цель не меняется;
     цель сменили НЕ решением уходящего.

   Последнее — про принудительный перевод: массовое агро воина, Присутствие
   разбойника, старый перехват на подходе. Там боец не выбирал, и наказывать
   его не за что. Отличаем по ПРИЧИНЕ: она и так пишется рядом с целью, а
   отдельный флаг «ушёл сам» однажды забыли бы поставить. */

var FORCED_AGGRO_MARKS = ['Присутствие', 'МАСС АГР', 'Перехвачен', 'Удержан'];

function isForcedChange(reason) {
    var r = String(reason || '');
    if (!r) return false;
    for (var i = 0; i < FORCED_AGGRO_MARKS.length; i++) {
        if (r.indexOf(FORCED_AGGRO_MARKS[i]) !== -1) return true;
    }
    return false;
}

/* Отход в тыл — отдельное действие, не смена цели перед атакой. Агро
   недостаточно: удар вслед получает только враг с фактическим контактом. */
function hasRetreatSkill(who) {
    who = who || {};
    return isBowArcher(who) || who.cls === 'mage'
        || who.cls === 'priest';
}
function retreatHolders(enemies, playerId) {
    return (enemies || []).filter(function (e) {
        return enemyAlive(e) && isMeleeEnemy(e) && enemyInMeleeContact(e, playerId);
    });
}
function canRetreatReaction(enemy, playerId) {
    return retreatHolders([enemy], playerId).length > 0 && canEnemyAttackTarget(enemy, playerId);
}
function safeRetreatAvailable(who, world) {
    return isBowArcher(who) && (who.safeRetreatBattle == null
        || Number(who.safeRetreatBattle) !== num((world || {}).battleNo));
}
function retreatPending(op) {
    return !!op && ['queued', 'active', 'finishing'].indexOf(op.phase) >= 0;
}
function whyCantRetreat(who, world) {
    who = who || {}; world = world || {};
    if (!hasRetreatSkill(who)) return 'Отступление доступно лучнику с луком, магу и жрецу';
    if (num(who.hp) <= 0) return 'Вы без сознания';
    if (isStunned(who) || isRooted(who)) return 'Контроль не позволяет отступить';
    var head = (world.queue || [])[0];
    if (!head || head.type !== 'player' || head.id !== who.id) return 'Сейчас не ваш ход';
    if (retreatPending(who.pendingRetreat)) return 'Дождитесь завершения отступления';
    if (who.cls==='priest') {
        if (num(who.mainActionRound)===(num(world.round)||1)) return 'Главное действие уже потрачено';
    } else if (!hasExtraAction(who, world)) return whyNoExtraAction(who, world);
    if (!retreatHolders(Object.keys(world.enemies || {}).map(function (id) {
        return Object.assign({}, world.enemies[id], { id: id });
    }), who.id).length && !(who.cls==='priest' && getRole(who)==='front')) return 'Вас никто не держит в ближнем бою';
    return '';
}
/* Вступление в передний ряд использует прежнее сближение: расходует главное
   действие; неиспользованное допдействие остаётся после успешного перехода.
   Удержание/успешный перехват завершает ход, как при подходе для атаки. */
function whyCantAdvance(who, world, targetId) {
    var p=who || {}, w=world || {}, e=(w.enemies || {})[targetId];
    if(p.cls!=='priest')return 'Выбор позиции доступен жрецу';
    if(num(p.hp)<=0)return 'Вы без сознания';
    if(isStunned(p)||isRooted(p))return 'Контроль не позволяет двигаться';
    var head=(w.queue || [])[0];
    if(!head || head.type!=='player' || head.id!==p.id)return 'Сейчас не ваш ход';
    if(num(p.mainActionRound)===(num(w.round)||1))return 'Главное действие уже потрачено';
    if(retreatPending(p.pendingRetreat))return 'Дождитесь завершения движения';
    if(!e || !enemyAlive(e))return 'Выберите живого противника';
    if(isMeleeEnemy(e) && !canEngageMelee(p.id,w.enemies,targetId) && !heroInMeleeWith(e,p.id))
        return 'Рядом с вами уже четыре противника';
    return '';
}
function isMeleeAttack(who, spell) {
    if(spell)return false;
    var p=who || {}, mh=p.mainhand || (p.slots || {}).mainhand || '';
    return hasKeyword(keysOf(mh),WEAPON_KEYS.frontal.concat(WEAPON_KEYS.stealth))
        || (!mh && p.cls==='warrior');
}
function planRetreat(who, world) {
    var facts = who.cls==='priest' ? {mainActionRound:num((world || {}).round)||1,shotsLeft:0} : planExtraAction(world);
    if (safeRetreatAvailable(who, world)) facts.safeRetreatBattle = num((world || {}).battleNo);
    return facts;
}
function canBreakaway(p) {
    var o = p || {};
    if (o.action === 'spell' || o.newTargetInContact) return false; /* смена цели рядом — не отход */
    if (o.moverRole === 'back') return false;        /* дальний ни от кого не уходит */
    if (!o.oldTargetId) return false;                /* не с кем было драться */
    if (!o.oldTargetAlive) return false;             /* переход бесплатный */
    if (!o.newTargetId || o.newTargetId === o.oldTargetId) return false;
    if (isForcedChange(o.reason)) return false;      /* увели силой, а не сам */
    return true;
}

/* Почему разрыва нет. Нужно подсказке Ведущему: «переход бесплатный, потому
   что старая цель мертва» понятнее, чем молчание. */
function whyNoBreakaway(p) {
    var o = p || {};
    if (o.action === 'spell') return 'Заклинание бой не разрывает';
    if (o.newTargetInContact) return 'Новая цель уже рядом';
    if (o.moverRole === 'back') return 'Дальний ни с кем не связан';
    if (!o.oldTargetId) return 'Прежнего противника не было';
    if (!o.oldTargetAlive) return 'Прежняя цель мертва — переход бесплатный';
    if (!o.newTargetId || o.newTargetId === o.oldTargetId) return 'Цель та же';
    if (isForcedChange(o.reason)) return 'Внимание перевели силой, а не сам';
    return '';
}

/* Удерживающая атака состоялась. Факты по её исходу.

   ПОПАЛ — ЗНАЧИТ НЕ ПУСТИЛ, и graze тоже попадание. Удержание решается ДО
   броска защиты врага: спарировал он урон или нет, побег всё равно сорван. */
function resolveBreakaway(p) {
    var hit = !!(p || {}).hit;
    if (hit) {
        return { held: true, facts: { retargetIntent: null,
                                      aggroReason: '⚔️ Удержан в ближнем бою' } };
    }
    var intent = (p || {}).intent || {};
    return { held: false, facts: { retargetIntent: null,
                                   aggroTargetId: intent.targetId || null,
                                   aggroReason: intent.reason || '💢 Вырвался' } };
}

function resolveRevenge(p) {
    var enemy = p.enemy || {};
    var instant = function (reason) {
        return { changed: true, instant: true, reason: reason,
                 facts: { aggroTargetId: p.attackerId, aggroReason: reason, rangedHitStreak: null } };
    };

    /* Животные — любой удар перетягивает мгновенно, без условий. */
    if (enemy.human === false) return instant('💢 Месть (животное)');

    /* Фронт — мгновенно всегда. */
    if (p.attackerRole === 'front') return instant('💢 Месть за удар');

    /* Промах дальнего/скрытного обнуляет серию. */
    if (!p.hit) return { changed: true, instant: false, reason: null, facts: { rangedHitStreak: null } };

    /* Враг сам дальний — мгновенно. */
    if (!isMeleeEnemy(enemy)) return instant('💢 Месть (дальний по дальнему)');

    /* Тыловик при смерти — срывается сразу, и босс тоже. Добить того, кто
       еле стоит, понятнее любого броска.

       ЕСЛИ ПРОЦЕНТ НЕ ПЕРЕДАЛИ — считаем целым. num(undefined) даёт ноль, и
       без этой оговорки любой зовущий, забывший поле, получал бы врага,
       который бросается добивать здорового. */
    var hpPct = p.attackerHpPercent === undefined || p.attackerHpPercent === null
        ? 100 : num(p.attackerHpPercent);
    if (hpPct < REVENGE_LOW_HP) {
        var low = instant('💢 Чует кровь — идёт добивать!');
        low.announce = true;
        return low;
    }

    /* Иначе нужна СЕРИЯ попаданий подряд — ЗЛОСТЬ: 3 обычному врагу,
       5 боссу. anger — чтобы экраны сказали «зол и решает атаковать». */
    var need = revengeStreakNeeded({
        meleeEnemies: p.meleeEnemies, frontHeroes: p.frontHeroes,
        isBoss: !!(enemy.isUnique || p.isBoss)
    });
    var streak = enemy.rangedHitStreak;
    var count = (streak && streak.playerId === p.attackerId) ? num(streak.count) + 1 : 1;
    if (count >= need) {
        var res = instant('😠 Злость (' + need + ' подряд)');
        res.announce = true;   // раздел 5: показывать КАЖДЫЙ раз
        res.anger = true;
        res.streakNeeded = need;
        return res;
    }
    return { changed: true, instant: false, reason: null, streakNeeded: need,
             facts: { rangedHitStreak: { playerId: p.attackerId, count: count } } };
}

/* СТРОКА ДЛЯ ЭКРАНОВ, когда враг сорвался в тыл. Одна на телефон и дашборд,
   чтобы зритель читал одно и то же, откуда бы ни пришёл удар. Злость —
   слова автора: «враг такой-то зол и решает атаковать такого-то». */
function revengeNotice(plan, enemyName, heroName) {
    if (!plan || !plan.announce) return '';
    return plan.anger
        ? '😠 ' + enemyName + ' зол и решает атаковать героя ' + heroName
        : '💢 ' + enemyName + ' чует кровь — идёт добивать ' + heroName + '!';
}

/* ==========================================================================
   10. ПРИСУТСТВИЕ РАЗБОЙНИКА  (раздел 7)
   ========================================================================== */

/* Сколько стаков ещё висит. Считается, не хранится: врагу пишется счётчик
   ЕГО СОБСТВЕННЫХ ходов (turnNo), Присутствие помнит, на каком ходу его
   повесили. Разница — сколько прошло.

   Отсюда само собой получается нужное поведение: повесили ДО хода врага —
   он сходит в этом же раунде и потеряет стак сразу; повесили ПОСЛЕ его хода —
   до конца раунда висят все три. Никаких флагов и никакого «не забыть снять».

   attackerId необязателен: без него отвечаем «сколько висит вообще»,
   с ним — «сколько висит от ЭТОГО разбойника». */
function presenceStacks(enemy, attackerId) {
    var pr = enemy && enemy.presence;
    if (!pr || !pr.by) return 0;
    if (attackerId && pr.by !== attackerId) return 0;
    var passed = num(enemy.turnNo) - num(pr.setTurn);
    if (passed < 0) passed = 0;
    var left = PRESENCE_STACKS - passed;
    return left > 0 ? left : 0;
}

/* Кого раскрытие ставит на разбойника: ВСЕ враги, на ком висит его
   Присутствие, а не только тот, кого он ударил вторым. */
function presenceRevealTargets(enemies, attackerId) {
    return (enemies || [])
        .filter(function (e) { return presenceStacks(e, attackerId) > 0; })
        .map(function (e) { return e.id; });
}

function resolvePresence(p) {
    if (!p.hit) return { changed: false, revealed: false, facts: {} };
    var enemy = p.enemy || {};
    var mark = { by: p.attackerId, stacks: PRESENCE_STACKS, setTurn: num(enemy.turnNo) };

    /* Первый удар вешает сразу четыре стака и не раскрывает. */
    if (presenceStacks(enemy, p.attackerId) <= 0) {
        return { changed: true, revealed: false, facts: { presence: mark } };
    }

    /* Второй удар по ТОЙ ЖЕ цели, пока стаки висят, — разбойник обнаружен.
       Присутствие при этом снимается: прятаться больше не за чем, а
       оставленная метка означала бы «он всё ещё скрыт». */
    return {
        changed: true, revealed: true,
        facts: {
            presence: null,
            aggroTargetId: p.attackerId,
            aggroReason: '👻 Присутствие раскрыто!',
            retargetIntent: null            /* увели силой — прежнее намерение гаснет */
        }
    };
}

/* Удар ДРУГОГО игрока сбивает ОДИН стак, а не всё Присутствие сразу.
   Снимать всё было бы слишком щедро к разбойнику: любой союзник обнулял бы
   ему счётчик. Теперь стаки надо пережидать.

   Стак снимается сдвигом метки: остаток = 3 − (ходы врага − setTurn),
   значит setTurn на единицу назад — это минус один стак. Никакого второго
   счётчика заводить не надо. Дошло до нуля — метка убирается совсем. */
function presenceOnOtherHit(enemy, attackerId) {
    var pr = enemy && enemy.presence;
    if (!pr || !pr.by || pr.by === attackerId) return {};
    if (presenceStacks(enemy) <= 1) return { presence: null };
    return { presence: { by: pr.by, stacks: pr.stacks, setTurn: num(pr.setTurn) - 1 } };
}

/* Старое имя оставлено: его зовёт дашборд, и ломать вызов незачем. */
function clearPresenceIfOther(enemy, attackerId) {
    return presenceOnOtherHit(enemy, attackerId);
}

/* ==========================================================================
   11. ПЕРЕХВАТ  (раздел 6)
   ========================================================================== */

/* Кто вообще проверяется: случайная половина живых ближних врагов.
   Вниз на easy/normal, вверх на hard. */
function pickInterceptors(p) {
    var living = (p.enemies || []).filter(function (e) {
        var alive = (e.alive !== undefined) ? !!e.alive : num(e.currentHP) > 0;
        return alive && canEnemyMove(e) && (e.role === 'front' || (e.role === undefined && !e.isRanged));
    });
    if (living.length === 0) return [];
    var half = p.difficulty === 'hard' ? Math.ceil(living.length / 2) : Math.floor(living.length / 2);
    var take = Math.max(1, half);
    var rng = p.rng || Math.random;
    var shuffled = living.slice().sort(function () { return rng() - 0.5; });
    return shuffled.slice(0, take);
}

/* Каждый отобранный кидает СВОЙ шанс успеть наперерез. Успевшие бьют —
   каждый своей обычной атакой (resolveIntercept ниже). Суммы атак больше
   нет: раньше успевшие били одним общим ударом, и перехват игрока уходил
   в пустоту — дашборд такую защиту не ждал. */
function rollIntercepts(p) {
    var rng = p.rng || Math.random;
    var chance = (p.chance === undefined) ? INTERCEPT_CHANCE : p.chance;
    var ok = [], fail = [];
    (p.candidates || []).forEach(function (e) {
        if (rng() < chance) ok.push(e); else fail.push(e);
    });
    return { succeeded: ok, failed: fail };
}

/* Проверяем ли перехват вообще: не было ли уже попытки по текущей цели. */
function shouldCheckIntercept(enemy) {
    if (!enemy) return true;
    return !(enemy.interceptAttemptedForTarget &&
             enemy.interceptAttemptedForTarget === enemy.aggroTargetId);
}

/* Факт попытки: пишем, ПО КОМУ она была, а не «был перехвачен: да». */
function markInterceptAttempt(targetId) {
    return { interceptAttemptedForTarget: targetId };
}

/* БЕЖИТ ЛИ КТО-ТО МИМО СТРОЯ. Бежит только БЛИЖНИЙ и только к ДАЛЬНЕЙ
   цели: стрелку бежать некуда, он бьёт с места. Заклинание — тоже не бег,
   как и при разрыве боя. Одно правило на обе стороны: и для нашего фронта,
   идущего к вражескому стрелку, и для врага, идущего к нашему тылу.

   ВЫРВАЛСЯ ИЗ БЛИЖНЕГО БОЯ — ПЕРЕХВАТА НЕТ (решение автора 26.09.2026).
   Связанного боем держит его противник ударом вслед: попал — остался,
   промахнулся — всё, убежал. Перехватывают только того, кто ни с кем не
   дрался и бежит сквозь строй. Иначе тот же противник бил бы его дважды:
   вслед и на подходе. */
function interceptApplies(p) {
    var o = p || {};
    if (o.action === 'spell') return false;
    if (o.brokeAway) return false;
    return o.moverRole === 'front' && o.targetRole === 'back';
}

/* ИТОГ ПЕРЕХВАТА — решение автора 26.09.2026.

   Кто успел наперерез, бьёт бегущего ОБЫЧНОЙ атакой — каждый, по очереди.
   От каждого попадания бегущий защищается как обычно. Отдельного броска
   «удержал ли» нет: ПОПАЛ — ЗНАЧИТ ОСТАНОВИЛ, и задевший удар тоже
   попадание; урон — какой выпал. Прежняя проверка «11+» без урона убрана.

   Попали несколько — целью бегущего становится ПОСЛЕДНИЙ из попавших.
   Попал хоть один — ход бегущего сгорел. Никто не попал — добежал и бьёт
   свою цель как обычно. Удар перехватчика — реакция: его ход не тратится.

   strikes: [{ id, hit }] в том порядке, в каком били. facts — для
   врага-бегущего: цель сменилась силой, желание сорваться гаснет. */
var INTERCEPT_REASON = '⚡ Перехвачен на подходе';
function resolveIntercept(p) {
    var by = '';
    ((p && p.strikes) || []).forEach(function (s) {
        if (s && s.hit && s.id) by = String(s.id);
    });
    if (!by) return { stopped: false, byId: '', facts: {} };
    return { stopped: true, byId: by,
             facts: { aggroTargetId: by, aggroReason: INTERCEPT_REASON,
                      hasEngagedTarget: false, retargetIntent: null } };
}

/* ==========================================================================
   11.5 КОГО БЬЁТ ВРАГ  (раздел 4)
   Правило живёт здесь, а не в дашборде: иначе телефон и дашборд снова начнут
   по-разному понимать, кто доступен для удара.
   ========================================================================== */

/* candidates: [{ id, alive, role, stealth }]. stealth — разбойник, которого
   никто не держит в таргете; в пул целей он не попадает. */
function pickEnemyTarget(p) {
    var enemy = p.enemy || {};
    if (isEnemyDisabled(enemy)) return null;
    var rng = p.rng || Math.random;
    var pool = (p.candidates || []).filter(function (c) { return c.alive && !c.stealth; });
    if (!pool.length) return null;

    /* 1. Уже выбранная цель, пока она жива и доступна. */
    var kept = pool.filter(function (c) { return c.id === enemy.aggroTargetId; })[0];
    if (isMeleeEnemy(enemy) && isRooted(enemy)) {
        return kept && enemyInMeleeContact(enemy, kept.id) && canEngageMelee(kept.id,p.enemies || {},p.enemyId || enemy.id) ? { id: kept.id, reason: 'ближняя цель рядом' } : null;
    }
    if (kept && (!isMeleeEnemy(enemy) || canEngageMelee(kept.id,p.enemies || {},p.enemyId || enemy.id)))
        return { id: kept.id, reason: 'держит цель' };

    /* 2. Место рядом с героем не бесконечно: больше SURROUND_CAP БЛИЖНИХ
       вокруг одного не помещается. Дальние толпы не создают и кап не
       чувствуют — они стоят в стороне.
       Зовущий может не передавать enemies: тогда правило молчит, как раньше. */
    var melee = isMeleeEnemy(enemy);
    var free = pool;
    if (melee && p.enemies) {
        var notFull = pool.filter(function (c) {
            return canEngageMelee(c.id, p.enemies, p.enemyId || enemy.id);
        });
        if (!notFull.length) return null;
        free = notFull;
    }

    /* 3. Фронт закрывает тыл — но только пока во фронте есть СВОБОДНОЕ место.
       Забит фронт — тыл открылся, и лучник с магом встречают гостей. Это и
       есть цена партии, где танк один. */
    var front = free.filter(function (c) { return c.role === 'front'; });
    var list = front.length ? front : free;
    var pick = list[Math.floor(rng() * list.length)];
    var reason = front.length ? 'ближний бой'
               : (free.length < pool.length ? 'фронт забит — прорыв в тыл'
                                            : 'фронта нет — прорыв в тыл');
    return { id: pick.id, reason: reason };
}

/* Атака врага считается теми же порогами, что и у игроков. Базовый урон —
   поле atk из бестиария. */
function resolveEnemyAttack(p) {
    /* ОБОРОНА БОЛЬШЕ НЕ РОНЯЕТ БРОСОК ВРАГА. Она прибавляется к броску
       ЗАЩИТЫ того, кто окопался, — там её видно на карточке и там её ждёт
       игрок. Здесь не трогаем ничего: враг бьёт как бьёт. */
    var roll = num(p.roll);
    var atk = num((p.enemy || {}).atk);
    var outcome, mult;
    if (roll >= T.crit) { outcome = 'crit'; mult = MULT.crit; }
    else if (roll >= T.hit) { outcome = 'hit'; mult = MULT.hit; }
    else if (roll >= T.graze) { outcome = 'graze'; mult = MULT.graze; }
    else { outcome = 'miss'; mult = MULT.miss; }
    return { roll: roll, outcome: outcome, mult: mult, hit: outcome !== 'miss',
             damage: Math.max(0, ceilGame(atk * mult)), damageExact:Math.max(0,atk*mult),
             halfDamage: Math.max(0, ceilGame(atk * MULT.graze)) };
}

/* Порядок хода: больше инициативы — раньше. Равные — как пришли. */
/* ОЧЕРЕДЬ БОЯ.

   Раньше здесь была одна сортировка по поправке инициативы — и БРОСКА НЕ
   БЫЛО ВОВСЕ. У четырёх одинаковых волков поправка одинаковая, поэтому они
   каждый раунд шли подряд, в одном и том же порядке, а «перебросить
   инициативу» ничего не меняло: сортировка устойчивая, вход тот же — выход
   тот же.

   Теперь каждый участник КИДАЕТ: d20 плюс своя поправка. Бросок приходит
   снаружи (rng), чтобы прогон повторялся с тем же зерном.

   Равные суммы разводит поправка, а совсем равные — сам бросок: две
   одинаковые крысы всё равно встанут в разном порядке, и это правильно. */
function buildQueue(entries, rng) {
    var roll = typeof rng === 'function' ? rng : Math.random;
    return (entries || []).slice()
        .map(function (e) {
            var d20 = 1 + Math.floor(roll() * 20);
            var out = {};
            for (var k in e) out[k] = e[k];
            out.roll = d20;
            out.total = d20 + num(e.init);
            return out;
        })
        .sort(function (a, b) {
            if (b.total !== a.total) return b.total - a.total;
            if (num(b.init) !== num(a.init)) return num(b.init) - num(a.init);
            return b.roll - a.roll;
        });
}

/* ==========================================================================
   11.7 ПОСЛЕДНИЙ ВРАГ И СТАЯ  (раздел 13)
   ========================================================================== */

var PACK = { leader: 'direwolf', member: 'wild_wolf' };

function isPackMember(e) {
    return (e && e.key) === PACK.member || /дикий волк/i.test((e && e.name) || '');
}
function isPackLeader(e) {
    return (e && e.key) === PACK.leader || /лютоволк/i.test((e && e.name) || '');
}

/* Что делает враг, оставшись один. Боссы дерутся до конца. */
function evaluateLastStand(p) {
    var enemy = p.enemy || {};
    var others = (p.aliveEnemies || []).filter(function (e) { return e.id !== p.enemyId; });
    if (enemy.isUnique) return { action: 'fight' };
    if (others.length) return { action: 'fight' };
    if (isPackMember(enemy)) {
        return (p.rng || Math.random)() < 0.5
            ? { action: 'flee', reason: enemy.name + ' остался один и удирает в лес' }
            : { action: 'fight' };
    }
    var rng = p.rng || Math.random;
    return rng() < 0.5
        ? { action: 'confused', reason: enemy.name + ' остался один и растерялся — теряет ход' }
        : { action: 'fight' };
}

/* План без мутации: на живом столе факты и выход из очереди сохраняются
   атомарно. В симуляторе применяется тот же план. При повторном вызове
   в том же раунде RNG не вызывается: переброс инициативы не даёт попытку. */
function planWolfMorale(p) {
    p = p || {};
    var enemies = p.enemies || [], battleNo = num(p.battleNo), round = Math.max(1, num(p.round));
    var hp = function(e) { return num(e.currentHP == null ? e.hp : e.currentHP); };
    var alive = enemies.filter(function(e) { return hp(e) > 0 && e.alive !== false; });
    var leaderDead = isPackLeader(p.deadEnemy) || enemies.some(function(e) { return isPackLeader(e) && hp(e) <= 0; });
    var updates = [], checks = [], runaways = [];
    alive.forEach(function(e) {
        if (!isPackMember(e) || e.isUnique) return;
        var fallen = leaderDead || e.packLeaderFallenBattle != null && num(e.packLeaderFallenBattle) === battleNo;
        var facts = {};
        if (fallen && (e.packLeaderFallenBattle == null || num(e.packLeaderFallenBattle) !== battleNo)) facts.packLeaderFallenBattle = battleNo;
        var stamp = e.wolfMorale;
        if ((fallen || alive.length === 1) && canEnemyMove(e)
            && !(stamp && num(stamp.battleNo) === battleNo && num(stamp.round) >= round)) {
            var roll = (p.rng || Math.random)(e.id);
            facts.wolfMorale = { battleNo:battleNo, round:round, roll:roll, flee:roll < 0.5 };
            checks.push({id:e.id,name:e.name || 'Дикий Волк',flee:roll < 0.5,reason:fallen ? 'вожак погиб' : 'остался один'});
            if (roll < 0.5) runaways.push(e.id);
        }
        if (Object.keys(facts).length) updates.push({id:e.id,facts:facts});
    });
    return {updates:updates,checks:checks,runaways:runaways};
}

/* Совместимость с внешними инструментами: тоже 50%, не гарантированный побег. */
function packScatter(p) {
    if (!isPackLeader(p.deadEnemy)) return [];
    var enemies = (p.aliveEnemies || []).map(function(e) { return Object.assign({currentHP:1},e); });
    var ids = planWolfMorale(Object.assign({},p,{enemies:enemies})).runaways;
    return (p.aliveEnemies || []).filter(function(e) { return ids.indexOf(e.id) >= 0; });
}

/* ==========================================================================
   11.8 УМНЫЙ СПАВН  (масштабирование сцены под размер партии)
   Боссы всегда по одному. Миньоны добираются по кругу до нужного числа.
   Сверх потолка не выпускаем — вместо этого усиливаем оставшихся.
   ========================================================================== */

/* ПОТОЛОК НА ПОЛЕ — СКОЛЬКО ВРАГОВ НА ОДНОГО ИГРОКА.
   Не правило баланса, а читаемость боя: очередь из двенадцати — это
   двенадцать ожиданий чужого хода за раунд.

   Плоский потолок (было 7, дальше 12) давал ровно семерых с ТРЁХ до ШЕСТИ
   игроков: разница между тройкой и пятёркой не появлялась на поле вовсе,
   она уходила в невидимую прибавку к статам. А на седьмом игроке был обрыв
   сразу с 7 до 12.

   Теперь потолок считается от числа игроков, и доля падает с ростом стола:
       до 4 игроков — вдвое   (2->4, 3->6, 4->8)
       5 -> ×1.8 = 9    6 -> ×1.7 = 10    7 -> ×1.6 = 11    8 -> ×1.5 = 12
   Растёт плавно от 4 до 12, без ступеньки и без обрыва.

   ОБЩАЯ МАССА ВРАГОВ ОТ ЭТОГО НЕ МЕНЯЕТСЯ: всё, что не поместилось,
   сворачивается в прибавку к статам оставшимся (buffRatio). Меньше тел —
   каждое плотнее и злее. Поэтому потолок правит читаемость, а не сложность.

   Сцена может выставить и меньше: это ПОТОЛОК, а не цель. Двенадцать
   бандитов в комнате у графа — не бой, а митинг, и такие сцены пишутся
   руками по смыслу. */
var SPAWN_PER_PLAYER_CAP = { 5: 1.8, 6: 1.7, 7: 1.6, 8: 1.5 };
var SPAWN_PER_PLAYER_MAX = 2;      /* до четырёх игроков включительно — вдвое */
var SPAWN_PER_PLAYER_MIN = 1.5;    /* за восемью столами дальше не режем */

function spawnCapRatio(playerCount) {
    var n = Math.max(1, num(playerCount));
    if (SPAWN_PER_PLAYER_CAP[n]) return SPAWN_PER_PLAYER_CAP[n];
    return n < 5 ? SPAWN_PER_PLAYER_MAX : SPAWN_PER_PLAYER_MIN;
}

/* Верхняя граница количества, не округление HP/урона. */
function spawnCap(playerCount) {
    var n = Math.max(1, num(playerCount));
    return Math.max(1, Math.floor(n * spawnCapRatio(n)));
}

/* СКОЛЬКО ВРАГОВ ЗА СТОЛ. Раньше стояли ступени 1.0 / 1.5 / 2.0, и внутри
   ступени разницы не было вовсе: трое и пятеро получали поровну.

   Теперь прямая: каждые ДВА лишних игрока добавляют полмножителя.
       2 -> 1.0    4 -> 1.5    6 -> 2.0    8 -> 2.5
   Важное свойство: у четвёрки и шестёрки множитель НЕ изменился (1.5 и 2.0),
   поэтому все замеры баланса, снятые на партии из четверых, остались в силе.
   Ниже 1 игрока не считаем — пусть будет как за одного. */
var SPAWN_BASE = 0.5;
var SPAWN_PER_PLAYER = 0.25;

function spawnMultiplier(playerCount) {
    var n = Math.max(1, num(playerCount));
    return SPAWN_BASE + SPAWN_PER_PLAYER * n;
}

/* p: { base: ['fat_rat', ...], isUnique: { fat_rat: false, ... }, playerCount } */
function planSpawn(p) {
    var base = (p.base || []).slice();
    var uniq = p.isUnique || {};
    var mult = spawnMultiplier(p.playerCount);
    var bosses = base.filter(function (k) { return !!uniq[k]; });
    var minions = base.filter(function (k) { return !uniq[k]; });

    var target = Math.ceil(base.length * mult);
    var list = bosses.slice();
    var slots = target - list.length;
    if (minions.length && slots > 0) {
        for (var i = 0; i < slots; i++) list.push(minions[i % minions.length]);
    }

    var ratio = 1.0, elite = false;
    var cap = spawnCap(p.playerCount);
    if (list.length > cap) {
        ratio = list.length / cap;
        list = list.slice(0, cap);
        elite = true;
    }
    return { list: list, buffRatio: ratio, elite: elite, multiplier: mult };
}

/* Усиление статов при срабатывании капа. */
function buffEnemy(base, ratio) {
    if (!(ratio > 1)) return base;
    var hp = ceilGame(num(base.maxHP || base.hp) * ratio);
    return Object.assign({}, base, { hp: hp, maxHP: hp, atk: ceilGame(num(base.atk) * ratio) });
}

/* ==========================================================================
   11.9 СВЕЖЕВАНИЕ И ЛУТ  (раздел 13)
   ========================================================================== */

var SKIN_THRESHOLD = { perfect: 10, ok: 5 };

/* Бросок + ловкость/5. Три исхода: идеальный трофей, обычный, порез. */
function resolveSkinning(p) {
    var roll = num(p.roll);
    var bonus = Math.floor(num(p.agi) / 5);
    var total = roll + bonus;
    var outcome = total >= SKIN_THRESHOLD.perfect ? 'perfect'
                : (total >= SKIN_THRESHOLD.ok ? 'ok' : 'injury');
    return {
        roll: roll, bonus: bonus, total: total, outcome: outcome,
        label: outcome === 'perfect' ? 'ОТРЕЗАЛ РОВНО' : (outcome === 'ok' ? 'ОТРЕЗАЛ ПЛОХО' : 'ПОРАНИЛСЯ'),
        injury: outcome === 'injury' ? 1 : 0
    };
}

/* Трофей определяется ВИДОМ зверя, а не номером сцены: одна крыса даёт хвост
   в любой главе, и новые сцены не требуют правки кода. */
/* ТРОФЕИ — ТОЛЬКО С БОССОВ. Правило автора: хвост и ухо режут с Короля
   крыс и Вожака, а не с каждого пацюка. Здесь стояли и обычный Нажористый
   Пацюк, и Дикий волк — и после любой крысиной драки игра предлагала
   свежевать тушу, с которой трофея нет. Старая сборка свежевание давала
   тоже лишь в сценах с боссами. */
var TROPHY_BY_KIND = {
    rat_king:  { ok: 'rat_tail',  perfect: 'rat_tail_perfect' },
    direwolf:  { ok: 'wolf_ear',  perfect: 'wolf_ear_perfect' }
};
function trophyFor(enemyKey, outcome) {
    var row = TROPHY_BY_KIND[enemyKey];
    if (!row || outcome === 'injury') return null;
    return row[outcome] || null;
}
function isSkinnable(enemy) {
    return !!TROPHY_BY_KIND[(enemy && enemy.key) || ''];
}

/* Лут масштабируется размером партии, как и спавн. */
/* ЛУТ идёт по ТОМУ ЖЕ множителю, что и враги. Раньше у него были свои
   пороги (1 / 2 / 3 на 3 / 4-6 / 7+), и они не совпадали со спавном:
   вчетвером враги росли в полтора раза, а добыча вдвое — играть вчетвером
   было просто выгоднее. Теперь причина одна и множитель один. */
function lootMultiplier(playerCount) {
    return spawnMultiplier(playerCount);
}
/* ЗОЛОТО С ДОБЫЧИ: «столько-то на рыло», умноженное на сложность.
   База своя у каждого боя (Король 2, Альфа 3, Граф 4), коэффициент свой у
   каждой сложности (лёгкая 1, средняя 1.5, тяжёлая 2). Раньше здесь стояла
   вшитая двойка на всё: с крыс и с главаря падало поровну, а сложность на
   деньги не влияла вовсе.

   goldMult идёт через Number, а не через num. Когда num() был parseInt,
   коэффициент 1.5 превращался в единицу молча, без единой красной
   проверки. Сейчас num() — parseFloat и дробь не режет, но отдельное
   чтение оставлено: мусор и ноль здесь значат «×1», а не «×0».

   ЧИСЛО ИГРОКОВ СЧИТАЕТ ВЫЗЫВАЮЩИЙ, и наёмников в нём быть не должно:
   иначе призванный Спук и сумму раздувает, и вещей добавляет. */
function planLoot(p) {
    var base = p.base || { gear: 1, jewel: 0, potion: 1 };
    var mult = lootMultiplier(p.playerCount);
    var perHead = p.goldPerHead === undefined ? 2 : num(p.goldPerHead);
    var gm = Number(p.goldMult);
    if (!isFinite(gm) || gm <= 0) gm = 1;
    return {
        gear: Math.ceil(num(base.gear) * mult),
        jewelry: Math.ceil(num(base.jewel) * mult),
        consumable: Math.ceil(num(base.potion) * mult),
        gold: ceilGame(perHead * num(p.playerCount) * gm),
        multiplier: mult
    };
}

/* ==========================================================================
   11.5 ОПЫТ ЗА БОЙ

   Награда НЕ ДЕЛИТСЯ. `reward` — это сколько получит КАЖДЫЙ, независимо от
   того, двое за столом или восьмеро. Раньше дашборд делил пул на число
   доживших, и партия из шестерых росла втрое медленнее партии из двоих —
   при том, что боёв в главе одинаково.

   Отключка опыта не лишает. Это настолка: герой не погибает, а теряет
   сознание, и вечер он всё равно отыграл. Отсюда и церковь (она уже есть,
   см. planChurchRevive): поднимать павшего за деньги имеет смысл только
   если он не отстаёт по уровню от остальных.

   Наёмник в списке не участвует: его уровень ставит мастер ползунком.

   Правило живёт здесь, а не в дашборде, ровно по той причине, по которой
   разъехались когда-то пороги перехвата 0.5 и 0.3.
   ========================================================================== */

/* ══════════════════════════════════════════════════════════════════════
   ИМЕННАЯ ДОБЫЧА

   У вещи может быть хозяин: поле `dropsFrom` с ключом врага. Такая вещь
   НЕ участвует в случайном розыгрыше и падает только с него.

   Зачем правило. Папочкина Старая Лютня помечена isLoot и проходила в общий
   пул снаряжения: двадцать позиций, пять процентов с каждого выпавшего
   предмета. Сюжетная вещь, которую «отобрали разбойники и она возвращается
   с главаря», могла найтись в первой крысиной норе.

   Что решает движок: КОМУ положено выпасть. Что лежит в данных: с кого.
   Разделение намеренное — заведёте новую сюжетную вещь, кода не тронете.
   ══════════════════════════════════════════════════════════════════════ */

/* Вещи, которые обязаны выпасть с этих поверженных. Без повторов. */
function namedDrops(p) {
    p = p || {};
    var slain = {};
    (p.slainKeys || []).forEach(function (k) { if (k) slain[k] = true; });
    var items = p.items || {};
    var out = [];
    Object.keys(items).forEach(function (key) {
        var from = (items[key] || {}).dropsFrom;
        if (from && slain[from] && out.indexOf(key) < 0) out.push(key);
    });
    return out;
}

/* Годится ли вещь для СЛУЧАЙНОГО розыгрыша. У кого есть хозяин — нет. */
function isRandomLoot(item) {
    return !!(item && item.isLoot && !item.dropsFrom);
}

/* ══════════════════════════════════════════════════════════════════════
   ЗАКАЛКА ВРАГОВ ПО СЛОЖНОСТИ

   Здоровье врага одно на все сложности — оно лежит в data-enemies.js. А
   различать лёгкую и тяжёлую одним лишь числом врагов не выходит: тяжёлая
   получалась всего в полтора раза злее лёгкой, и обе проходились на 100%.

   Поэтому у сцены появились МНОЖИТЕЛИ ЗАКАЛКИ: во сколько раз крепче и злее
   враги ИМЕННО на этой сложности.

       hpMult   — здоровье. Покупает сложность ВРЕМЕНЕМ: толще враг —
                  дольше ковырять. Замер: у Короля ×1.25 роняет победы
                  с 88% до 53%, но растягивает бой с 14 до 19 раундов.
       atkMult  — атака. Покупает сложность РИСКОМ: бой не длиннее, а
                  опаснее. Замер: у Альфы та же сложность выходит за
                  11 раундов вместо 16.7.

   Крутить надо оба: одно здоровье растягивает вечер, одна атака бьёт
   слишком резко (у крыс ×1.25 роняет победы с 93% сразу до 18%).

   Отличие от buffEnemy: тот усиливает за БОЛЬШУЮ ПАРТИЮ и правит всё
   разом одним числом. Здесь другая причина и раздельные ручки.

   ДОБАВИТЬ НОВЫЙ МНОЖИТЕЛЬ — одна строка в SCENE_MULTS и одна в applyMults.
   Нет поля — множитель 1, и всё работает как раньше: старые главы и старые
   коды мастера ничего не замечают.
   ══════════════════════════════════════════════════════════════════════ */

/* Какие множители закалки понимает сцена. Ключ в данных -> что он трогает. */
var SCENE_MULTS = { hpMult: 'hp', atkMult: 'atk' };

/* Читает один множитель. Мусор, ноль и минус означают «не задан» = 1. */
function sceneMult(cfg, key) {
    var m = Number((cfg || {})[key]);
    return (m > 0 && isFinite(m)) ? m : 1;
}
function sceneHPMult(cfg)  { return sceneMult(cfg, 'hpMult'); }
function sceneAtkMult(cfg) { return sceneMult(cfg, 'atkMult'); }

/* Все множители сцены одним объектом — его удобно передавать дальше. */
function sceneMults(cfg) {
    var out = {};
    for (var key in SCENE_MULTS) out[SCENE_MULTS[key]] = sceneMult(cfg, key);
    return out;
}

/* Возвращает НОВОГО врага, исходный не трогает.
   Второй аргумент принимает и число (тогда это старый hpMult — так зовут
   прежние вызовы), и объект { hp, atk } из sceneMults(). */
function toughenEnemy(enemy, mult) {
    var e = enemy || {};
    var k = (mult && typeof mult === 'object')
        ? { hp: sceneMult({ hpMult: mult.hp }, 'hpMult'),
            atk: sceneMult({ atkMult: mult.atk }, 'atkMult') }
        : { hp: sceneMult({ hpMult: mult }, 'hpMult'), atk: 1 };

    var hp = Math.max(1, ceilGame(num(e.hp) * k.hp));
    var maxHP = Math.max(1, ceilGame(num(e.maxHP != null ? e.maxHP : e.hp) * k.hp));
    var out = {};
    for (var key in e) out[key] = e[key];
    out.hp = hp;
    out.maxHP = maxHP;
    if (e.currentHP !== undefined) out.currentHP = hp;
    /* Атака: ноль остаётся нулём — безоружного закалка не вооружает. */
    if (num(e.atk) > 0) out.atk = Math.max(1, ceilGame(num(e.atk) * k.atk));
    return out;
}

/* ══════════════════════════════════════════════════════════════════════
   АРКАНА МАГА И ВЕРА ЖРЕЦА

   Шкала у обоих одна и та же — 0..100 (POWER_MAX), одно поле power.
   Разница в том, откуда она берётся и на что идёт: Арканой маг усиливает
   заклинания, Вера жреца идёт на молитвы и воскрешение (подробно ниже).

   АРКАНА копится сама, как кешбэк (решение автора 29.09.2026): за
   заклинание 10 и ещё 2 за каждую ступень интеллекта, за ФОКУС (книга
   фокусов мага) — 5 и 1 за ступень. Только с ПЛАТНОГО по мане каста:
   бесплатное действие ничего не даёт — иначе шкала набивалась бы ударами
   палкой. Не сбрасывается никогда: ни между боями, ни между днями.

   ВЕРА жреца копится отдельно; лечение, боевые и святые заклинания
   её не возвращают (faithAfterCast). Тратится
   Вера на молитвы, воскрешение и обмен на ману — заклинания жрец ею НЕ усиливает:
   усиление — фишка мага (решение автора 29.09.2026).

   ТРАТА — ВЫБОР ИГРОКА, а не автомат. Три кнопки: снять 50 и усилить в
   полтора раза, снять сотню и удвоить, или «Текущая» — снять всё, что
   есть, и усилить ровно на столько (15 → +15%, 73 → +73%).

   ЧТО ИМЕННО УСИЛЯЕТСЯ: ИТОГ. Не базовый урон, а то число, что получилось
   ПОСЛЕ всех бонусов, крита и прочего. Поэтому усиление применяется
   последним и ничего не знает про слои до себя.
   ══════════════════════════════════════════════════════════════════════ */

var POWER_MAX        = 100;   /* полная шкала */
var POWER_PER_CAST   = 10;    /* Аркана за заклинание, база (было 20) */
var POWER_PER_STEP   = 2;     /* +2 за ступень ИНТЕЛЛЕКТА мага */
var CANTRIP_PER_CAST = 5;     /* Аркана за фокус, база */
var CANTRIP_PER_STEP = 1;     /* +1 за ступень интеллекта */
var POWER_STEPS      = [50, 100];   /* кнопки «50%» и «100%» */
var EMPOWER_CURRENT  = 'current';   /* кнопка «Текущая» — всё, что есть */
var EMPOWER_CLASSES  = ['mage'];    /* усиливает заклинания только маг */

/* Кешбэк за каст. Растёт от интеллекта: умный маг копит усиление быстрее.
   cantrip — это фокус: у него своя, меньшая ставка. */
function powerCashback(int, cantrip) {
    return cantrip ? CANTRIP_PER_CAST + statSteps(int) * CANTRIP_PER_STEP
                   : POWER_PER_CAST + statSteps(int) * POWER_PER_STEP;
}

/* Шкала после каста. Растёт ТОЛЬКО с платного по мане, выше сотни не идёт. */
function powerAfterCast(current, manaCost, int, cantrip) {
    if (num(manaCost) <= 0) return clamp(num(current), 0, POWER_MAX);
    return clamp(num(current) + powerCashback(int, cantrip), 0, POWER_MAX);
}

/* Кто вообще усиливает заклинания Арканой. */
function canUseEmpower(cls) { return EMPOWER_CLASSES.indexOf(cls) >= 0; }

/* Можно ли снять столько. Ступени — 50 и 100, и ещё «Текущая»: она берёт
   всё, что есть на шкале, лишь бы там было больше нуля. */
function canEmpower(current, step) {
    if (step === EMPOWER_CURRENT) return num(current) > 0;
    if (POWER_STEPS.indexOf(num(step)) < 0) return false;
    return num(current) >= num(step);
}

/* Во сколько раз вырастет ИТОГ и сколько останется на шкале.
   50 -> в полтора раза, 100 -> вдвое, «Текущая» 15 -> в 1,15 раза. */
function planEmpower(current, step) {
    if (!canEmpower(current, step)) return null;
    var spent = step === EMPOWER_CURRENT ? clamp(num(current), 0, POWER_MAX) : num(step);
    return {
        multiplier: 1 + spent / 100,
        left: clamp(num(current) - spent, 0, POWER_MAX),
        spent: spent
    };
}

/* Усиление ИТОГА. Зовётся ПОСЛЕДНИМ, поверх всего посчитанного. Для
   «Текущей» нужна сама шкала (current): от неё зависит множитель. */
function applyEmpower(value, step, current) {
    var plan = planEmpower(step === EMPOWER_CURRENT ? current : POWER_MAX, step);
    if (!plan) return num(value);
    return ceilGame(num(value) * plan.multiplier);
}

/* Лечение и святые заклинания больше не возвращают Веру (03.10.2026).
   Совместимый вход оставлен для обычного каста, Фортуны и симулятора. */
var HOLY_FAITH_CASHBACK = 0;
function faithAfterCast(current, spell) {
    return clamp(num(current), 0, POWER_MAX);
}

/* Начисление и квитанция сохраняются вместе в узле жреца. Повторы
   доставки не дают Веру снова, даже после её расходования. */
function planFaithAward(player, event) {
    var p = player || {}, e = event || {}, claims = p.faithAwards || {};
    var amount = e.kind === 'kill' ? 10 : (e.kind === 'morning' || e.kind === 'miracle') ? 25 : 0;
    if (p.cls !== 'priest' || !e.id || !amount || Object.prototype.hasOwnProperty.call(claims, e.id)) return null;
    if (e.kind === 'morning' && (num(e.day) <= 0 || num(e.day) <= num(p.faithMorningDay))) return null;
    var old = clamp(num(p.power), 0, POWER_MAX), power = clamp(old + amount, 0, POWER_MAX);
    var receipt = { gain:power - old, total:power };
    var facts = { power:power, faithAwards:Object.assign({}, claims) };
    facts.faithAwards[e.id] = receipt;
    if (e.kind === 'morning') facts.faithMorningDay = num(e.day);
    return { facts:facts, gain:receipt.gain };
}
function faithKillFacts(enemy, after, actor, id) {
    if (!enemy || !after || after.currentHP == null || num(enemy.currentHP) <= 0 || num(after.currentHP) > 0
        || !actor || actor.cls !== 'priest' || !actor.id || !id || enemy.faithKill) return {};
    return { faithKill:{ id:id, kind:'kill', targets:[actor.id] } };
}
function faithMiracleEligible(attack, hp) {
    return !!attack && attack.outcome === 'miss' && num(hp) > 0 && num(attack.halfDamage) >= num(hp);
}

/* Вера → мана: целые MP, одно округление цены для всей порции. */
/* floor здесь ограничивает покупку доступной Верой: ceil дал бы отрицательную Веру. */
function faithManaOptions(who) {
    var p = who || {}, maxMP = Math.max(0, Math.floor(num(p.maxMP)));
    var missing = Math.max(0, Math.floor(maxMP - num(p.mp)));
    var power = clamp(Math.floor(num(p.power)), 0, POWER_MAX);
    return { maxMP:maxMP, missing:missing, power:power,
        maxMana:Math.min(missing, Math.floor(maxMP * power / POWER_MAX)) };
}
function faithManaCost(mana, maxMP) {
    return num(maxMP) > 0 ? ceilGame(POWER_MAX * num(mana) / num(maxMP)) : 0;
}
function whyCantFaithMana(who, world, via) {
    var p = who || {}, env = world || {}, o = faithManaOptions(p);
    if (p.cls !== 'priest') return 'Обмен Веры доступен только жрецу';
    if (num(p.hp) <= 0 || isStunned(p)) return 'Нельзя действовать после смерти или под оглушением';
    if (fortunePending(p.pendingFortuneAttack) || p.fortuneGrant && p.fortuneGrant.phase === 'pending'
        || doubleShotPending(p.pendingDoubleShot) || retreatPending(p.pendingRetreat) || p.pendingApproach
        || p.pendingDefense || p.pendingIntercept || p.pendingBreakawayAttack
        || p.faithManaReceipt && p.faithManaReceipt.phase === 'pending') return 'Сначала завершите начатое действие';
    if (!o.maxMP) return 'Максимальная мана равна нулю';
    if (!o.missing) return 'Мана уже полная';
    if (!o.maxMana) return 'Веры не хватает даже на 1 ману';
    if (via !== 'preview' && (env.battleOpen || (env.queue || []).length)) {
        if (via === 'main') {
            if (num(p.mainActionRound) === (num(env.round) || 1)) return 'Основное действие уже потрачено';
        } else if (!hasExtraAction(p, env)) return whyNoExtraAction(p, env);
    }
    return '';
}
function planFaithMana(who, world, mana, via) {
    if (via !== 'extra' && via !== 'main') return null;
    if (whyCantFaithMana(who, world, via)) return null;
    var o = faithManaOptions(who), amount = Number(mana);
    if (!Number.isInteger(amount) || amount <= 0 || amount > o.maxMana) return null;
    var cost = faithManaCost(amount, o.maxMP);
    var facts = { mp:num(who.mp) + amount, power:o.power - cost };
    if ((world || {}).battleOpen || ((world || {}).queue || []).length)
        Object.assign(facts, via === 'main' ? { mainActionRound:num(world.round) || 1 } : planExtraAction(world));
    return { mana:amount, cost:cost, facts:facts };
}

/* Ступени, доступные при такой шкале — для кнопок в интерфейсе. */
function empowerSteps(current) {
    return POWER_STEPS.filter(function (st) { return canEmpower(current, st); });
}

/* ══════════════════════════════════════════════════════════════════════
   ЦЕРКОВЬ

   Поднимает павшего за деньги ОБЩАКА (всегда) и возвращает ПОЛНОЕ
   здоровье — этим она и отличается от воскрешения жреца, которое даёт
   25–100% за Веру и работает в бою. Цена приходит снаружи: в каждом
   городе своя церковь со своей.
   ══════════════════════════════════════════════════════════════════════ */

/* ПОЖЕРТВОВАНИЕ. Два вида: скромное и щедрое. Сколько стоит и сколько
   даёт — приходит СНАРУЖИ, из описания церкви: в каждом городе свой храм со
   своими ценами. Движок отвечает только на «хватает ли» и «что станет».

   КТО ПЛАТИТ — решает зовущий: по умолчанию карман жреца, галочкой —
   общак. Аргумент `vault` здесь — просто кошелёк { gold }, чей угодно.
   Текст отказа whyCantDonate не называет кошелёк — чей он, дописывает
   дашборд: «(в общаке)» или «(у жреца)».

   Вера выше сотни не растёт: пожертвовал при полной шкале — деньги ушли бы
   впустую, поэтому такой платёж не проходит вовсе. */
/* ══════════════════════════════════════════════════════════════════════
   ТАВЕРНА

   Устроена как церковь: цены лежат в baza/data-taverns.js, у каждого города
   свои, а движок отвечает только на «хватает ли» и «что станет».

   КТО ПЛАТИТ. Здесь платит либо сам герой, либо общак — решает кнопка в
   окне, и у игрока, и у Ведущего. В церкви так же устроено пожертвование
   (карман жреца или общак галочкой), а воскрешение там всегда за общак:
   поднять павшего дело партии. Поэтому кошелёк приходит числом, а не
   объектом: правилу всё равно, чей он.
   ══════════════════════════════════════════════════════════════════════ */

/* Хватает ли на покупку. Одна проверка на напитки и припасы: разница между
   ними только в цене и в том, что кладётся в сумку. */
function canBuyAtTavern(purse, price) {
    return num(price) > 0 && num(purse) >= num(price);
}
function whyCantBuyAtTavern(purse, price, fromVault) {
    if (num(price) <= 0) return 'Этого здесь не наливают';
    if (num(purse) < num(price)) {
        return (fromVault ? 'В общаке не хватает: нужно ' : 'Не хватает золота: нужно ')
             + num(price);
    }
    return '';
}

/* КОМНАТА. Спят ВСЕГДА ВСЕ: поодиночке ночевать в таверне незачем, а кто в
   поле — тот на припасах. Поэтому считаем на всю партию сразу.

   Цена идёт С ЧЕЛОВЕКА, и наёмники в счёт не входят — они спят где придётся
   и денег партии не стоят. Тот же принцип, что у спавна врагов. */
function roomCost(price, sleepers) {
    return Math.max(0, num(price)) * Math.max(0, num(sleepers));
}
function canRentRoom(purse, price, sleepers) {
    if (num(sleepers) <= 0) return false;
    return num(purse) >= roomCost(price, sleepers);
}
function whyCantRentRoom(purse, price, sleepers, fromVault) {
    if (num(sleepers) <= 0) return 'Ночевать некому';
    var надо = roomCost(price, sleepers);
    if (num(purse) < надо) {
        return (fromVault ? 'В общаке не хватает: нужно ' : 'Не хватает золота: нужно ') + надо;
    }
    return '';
}

/* Сон живого героя: полные HP/MP; у дежурного каждую шкалу считаем отдельно.
   До 75% включительно — 75% максимума, выше — половина недостающего.
   Погибшего ночёвка не воскрешает. День меняет вызывающий код. */
function planSleep(who, guard) {
    var p = who || {}, hp = p.hp == null ? num(p.maxHP) : num(p.hp);
    function rest(value, maximum) {
        var max = Math.max(0, num(maximum)), cur = Math.max(0, Math.min(num(value), max));
        return ceilGame(!guard ? max : cur <= max * 0.75 ? max * 0.75 : cur + (max - cur) * 0.5);
    }
    if (hp <= 0) return { hp:0, mp:Math.max(0, num(p.mp)), drunk:num(p.drunk) };
    return { hp:rest(hp, p.maxHP), mp:rest(p.mp, p.maxMP), drunk:0 };
}
function planNightRest(player, vitals, guard, battleNo) {
    var p = player || {}, v = vitals || {};
    if (num(p.hp) <= 0) return {};
    var sleep = drunkAfterSleep(p, { battleNo:battleNo });
    return Object.assign(battleResetFacts(), planSleep(Object.assign({}, p, v), guard), sleep,
        { maxHP:num(v.maxHP), maxMP:num(v.maxMP) },
        v.resourceKind === 'mood' ? { resource:moodAfterSleep(v.maxResource, sleep.hangoverAfterBattle != null) } : {});
}

/* ══════════════════════════════════════════════════════════════════════
   ЦЕРКОВЬ — ПОЖЕРТВОВАНИЯ
   ══════════════════════════════════════════════════════════════════════ */
function canDonate(vault, faith, price, gain) {
    if (num((vault || {}).gold) < num(price)) return false;
    if (num(gain) <= 0) return false;
    return num(faith) < POWER_MAX;              /* полную шкалу не доливают */
}
function whyCantDonate(vault, faith, price, gain) {
    if (num(gain) <= 0) return 'Это пожертвование ничего не даёт';
    if (num(faith) >= POWER_MAX) return 'Вера и так полна — деньги пропадут зря';
    /* Кошелёк чей угодно — поэтому без «в общаке»: чей он, дописывает
       зовущий (дашборд — «(в общаке)» или «(у жреца)»). Раньше тут стояло
       «В общаке не хватает», даже когда платил жрец (аудит 26.09, Г12). */
    if (num((vault || {}).gold) < num(price))
        return 'Не хватает золота: нужно ' + num(price);
    return '';
}
function planDonation(vault, faith, price, gain) {
    if (!canDonate(vault, faith, price, gain)) return null;
    return {
        faith: clamp(num(faith) + num(gain), 0, POWER_MAX),
        vault: { gold: num((vault || {}).gold) - num(price) },
        paid: num(price)
    };
}

/* ══════════════════════════════════════════════════════════════════════
   ПОКУПКА

   Правило жило ТОЛЬКО в дашборде, а в клиенте кнопка «Купить» была без
   обработчика вовсе: нажималась и ничего не делала. Теперь правило одно на
   обе стороны — иначе они разойдутся при первой же правке цены.

   Платить можно из кармана или из общака: в клиенте карман, в дашборде
   мастер выбирает галочкой.
   ══════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════
   НАЁМ НАЁМНИКА — РАЗ В НЕДЕЛЮ

   Со слов автора: нанимают раз в неделю, то есть примерно раз в главу.
   Игроки приберегают его на самый тяжёлый бой, и он их выручает — за это и
   платят.

   В коде ограничения НЕ БЫЛО: день найма записывался в `hiredDay` и нигде
   не читался. Мастер мог звать наёмника хоть каждый бой, а замеры баланса
   считались для партии, которой на деле не бывает.

   Неделя = 7 дней. Нанят на пятый — следующий раз с двенадцатого.
   ══════════════════════════════════════════════════════════════════════ */

var MERC_COOLDOWN = 7;

/* НОЛЬ — ЭТО ДЕНЬ, А НЕ «НИКОГДА» (аудит А5). Мир стартует с нулевого дня,
   и наём в этот день писал hiredDay: 0 — а проверка принимала ноль за «ни
   разу не нанимали»: до первой ночёвки неделя не работала вовсе. Та же
   болячка, что уже чинили в usedToday. «Никогда» — это пусто. */
function canHireMerc(hiredDay, today) {
    if (hiredDay === undefined || hiredDay === null || hiredDay === '') return true;
    return num(today) - num(hiredDay) >= MERC_COOLDOWN;
}
function whyCantHireMerc(hiredDay, today) {
    if (canHireMerc(hiredDay, today)) return '';
    var left = MERC_COOLDOWN - (num(today) - num(hiredDay));
    return 'Наёмник отдыхает: ещё ' + left + ' дн.';
}

/* ПЕРЕЗАРЯДКА РЕЛИКВИИ — сколько дней ещё ждать. Одна функция и для
   счётчика на иконке, и для проверки при нажатии (раздел 11).

   Та же болячка, что у наёмника: применил в нулевой день — отметка 0
   читалась как «ни разу», и реликвия не перезаряжалась вовсе. «Никогда» —
   это пусто, ноль — обычный день. */
function relicDaysLeft(p) {
    var o = p || {};
    var cd = num(o.cooldownDays);
    if (!cd) return 0;
    if (o.usedDay === undefined || o.usedDay === null || o.usedDay === '') return 0;
    return Math.max(0, cd - (num(o.day) - num(o.usedDay)));
}

/* Откат принадлежит реликвии, а не месту на поясе. Старые отметки
   переводим по прежним слотам ДО переодевания; день 0 тоже действителен. */
function relicCooldowns(player) {
    var p=player || {}, out={}, slots=p.slots || {};
    Object.keys(p.relicUsedDay || {}).forEach(function(k){
        var v=p.relicUsedDay[k], key=/^relic[12]$/.test(k)?slots[k]:k;
        if(!key || v===null || v==='' || !Number.isSafeInteger(v))return;
        out[key]=out[key]===undefined?v:Math.max(out[key],v);
    });
    return out;
}
function relicCooldownLeft(player, key, item, day) {
    return relicDaysLeft({cooldownDays:(item || {}).cooldownDays,
        usedDay:relicCooldowns(player)[key],day:day});
}

/* Политика Спука выбирает намерение, а не считает отдельную боёвку.
   Уже дерётся — не меняет контакт ради бонуса. Из тени сначала выбирает
   непомеченную цель; повторный удар скрывает «Без палева», если готово. */
function planSpookTurn(player, world) {
    var p=player || {}, w=world || {}, slots=w.items?legalHeroSlots(p,w.items):(p.slots || {}), who=Object.assign({},p,slots);
    if(num(p.hp)<=0 || !isRogue(who))return {kind:'wait',reason:'Нет двух кинжалов или герой погиб'};
    if(num(p.mainActionRound)===(num(w.round)||1))return {kind:'wait',reason:'Основное действие потрачено'};
    if(heroActionControlled(p,w))return {kind:'wait',reason:'Действию мешает контроль'};
    var rows=Object.keys(w.enemies || {}).map(function(id){return {id:id,e:w.enemies[id]};})
        .filter(function(x){return enemyAlive(x.e);});
    var held=rows.filter(function(x){return heroInMeleeWith(x.e,p.id);});
    var stealth=derivePlayerEffects(Object.assign({},p,{isRogue:true}),w).buffs
        .some(function(b){return b.id==='stealth';});
    var pool=(held.length?held:rows).filter(function(x){
        return !isMeleeEnemy(x.e) || canEngageMelee(p.id,w.enemies,x.id);
    });
    pool.sort(function(a,b){
        var ap=!!(stealth && a.e.presence && a.e.presence.by===p.id && presenceStacks(a.e)>0);
        var bp=!!(stealth && b.e.presence && b.e.presence.by===p.id && presenceStacks(b.e)>0);
        return Number(ap)-Number(bp) || Number(b.id===p.targetId)-Number(a.id===p.targetId)
            || num(a.e.currentHP)-num(b.e.currentHP) || a.id.localeCompare(b.id);
    });
    var target=pool[0];
    if(!target)return {kind:'wait',reason:'Нет доступной цели для ближнего удара'};
    var marked=target.e.presence && target.e.presence.by===p.id && presenceStacks(target.e)>0;
    var sneak=stealth && !!marked && (p.sneakNextHit || canSneakHit(who,w));
    var ham=!sneak && !p.sneakNextHit && !marked && canEnemyMove(target.e)
        && canHamstring(who,w);
    return {kind:'attack',targetId:target.id,skill:ham?'hamstring':null,
        prepareSneak:!!(sneak && !p.sneakNextHit)};
}

/* НАЁМНИК — НА ОДИН БОЙ (решение автора 26.09.2026): бой кончился — ушёл.
   Какой бой его, помнит метка mercBattleNo на карточке: призвали посреди
   идущего боя — этот; до боя — следующий, его ставит начало боя. Уходит
   тот, чей бой закрывается. Призванный после победы, пока бой ещё не
   закрыт, меткой не обзаводится и ждёт следующего боя. */
function mercBattleMark(world, fightGoing) {
    var w = world || {};
    return (w.battleOpen && fightGoing) ? num(w.battleNo) : null;
}
function mercLeavesWith(merc, closingBattleNo) {
    var m = merc || {};
    if (!m.mercenary) return false;
    if (m.mercBattleNo === undefined || m.mercBattleNo === null) return false;
    return num(m.mercBattleNo) === num(closingBattleNo);
}

/* ══════════════════════════════════════════════════════════════════════
   ЛАВКИ — решение автора 26.09.2026

   Купить и продать с телефона можно только в лавке, открытой у Ведущего.
   У лавки свой ассортимент (пусто — всё), наценка и цена скупки. ШатерОчка
   продаёт всё и скупает всё за полцены.
   ══════════════════════════════════════════════════════════════════════ */
var SELL_RATE = 0.5;                     /* скупка по умолчанию — полцены */

function shopSells(shop, key) {
    var list = (shop || {}).items;
    return !list || !list.length || list.indexOf(key) !== -1;
}
function shopPrice(shop, item) {
    var m = Number((shop || {}).markup);
    if (!isFinite(m) || m <= 0) m = 1;
    return Math.max(1, ceilGame(num((item || {}).cost) * m));
}
function shopBuysBack(shop, key) {
    var s = shop || {};
    return s.buysAll !== false || shopSells(s, key);
}
function buybackPrice(shop, item) {
    var r = Number((shop || {}).sellRate);
    if (!isFinite(r) || r < 0) r = SELL_RATE;
    return ceilGame(num((item || {}).cost) * r);
}
/* Почему нельзя продать — или пусто, если можно. */
function whyCantSell(shop, key, item) {
    if (!shop || !shop.open) return 'Продать можно только в лавке — попросите Ведущего открыть магазин';
    if (!item) return 'Такой вещи нет';
    if (!shopBuysBack(shop, key)) return 'Эта лавка такое не берёт';
    if (buybackPrice(shop, item) <= 0) return 'Это ничего не стоит';
    return '';
}

function canBuy(item, purse) {
    if (!item || item.slot==='relic' || num(item.cost) <= 0) return false;
    return num(purse) >= num(item.cost);
}
function whyCantBuy(item, purse) {
    if (!item) return 'Товар не выбран';
    if (item.slot==='relic') return 'Реликвии выдаёт ведущий';
    if (num(item.cost) <= 0) return 'Это не продаётся';
    if (num(purse) < num(item.cost)) return 'Не хватает золота: нужно ' + num(item.cost);
    return '';
}
/* Что станет после покупки. Сумку возвращаем НОВЫМ списком, исходный не
   трогаем: молчаливая правка чужого массива — источник призрачных ошибок. */
function planBuy(key, item, purse, bag) {
    if (!canBuy(item, purse)) return null;
    var inv = (bag || []).slice();
    inv.push(key);
    return { gold: num(purse) - num(item.cost), inv: inv, paid: num(item.cost) };
}

function canChurchRevive(target, vault, price) {
    if (!target || num(target.hp) > 0) return false;      /* живого не поднять */
    return num((vault || {}).gold) >= num(price);
}
function whyCantChurchCure(player, world, purse, price) {
    if (!player) return 'Выберите героя';
    if (num(player.hp) <= 0) return 'Погибшему герою нужно воскрешение';
    if (!sicknessActive(player, world)) return 'У героя нет болезни';
    if (!Number.isFinite(price) || price < 0) return 'Цена лечения не назначена';
    if (num((purse || {}).gold) < price) return 'Недостаточно золота: нужно ' + price;
    return '';
}
function planChurchCure(player, world, purse, price, normalMaxHP) {
    if (whyCantChurchCure(player, world, purse, price)) return null;
    return { facts: { sickness:false, sicknessEndReceipt:false,
        maxHP:num(normalMaxHP), hp:Math.min(num(player.hp),num(normalMaxHP)) }, paid:price };
}
function whyCantChurchRevive(target, vault, price) {
    if (!target) return 'Некого поднимать';
    if (num(target.hp) > 0) return 'Этот герой в сознании';
    if (num((vault || {}).gold) < num(price))
        return 'Не хватает золота: нужно ' + num(price);
    return '';
}
function planChurchRevive(target, vault, price) {
    if (!canChurchRevive(target, vault, price)) return null;
    return {
        target: { hp: num(target.maxHP) },                /* полное здоровье */
        vault:  { gold: num((vault || {}).gold) - num(price) },
        paid: num(price)
    };
}

/* ══════════════════════════════════════════════════════════════════════
   ЗАСАДА — бой вне сценария главы (решение автора 26.09.2026)

   Ведущий сам выбирает врагов, бой идёт на той картинке, что сейчас на
   стриме. Награда и опыт — СЛУЧАЙНЫЕ, но сопоставимые с боями этой главы,
   примерно за каждого врага: сколько в среднем дал ОДИН враг в её боях на
   этой сложности и за этот стол, столько и за каждого врага засады, плюс-
   минус AMBUSH_SPREAD.

   reference: [{ xp, gold, enemies }] — бои главы; enemies — сколько врагов
   вышло бы на этот стол. count — врагов в засаде.
   ══════════════════════════════════════════════════════════════════════ */
var AMBUSH_ID = 'ambush';
var AMBUSH_SPREAD = 0.2;

function planAmbushReward(p) {
    var o = p || {};
    var rng = o.rng || Math.random;
    var count = Math.max(0, Math.floor(num(o.count)));
    var refs = (o.reference || []).filter(function (r) { return r && num(r.enemies) > 0; });
    if (!count || !refs.length) return { xp: 0, gold: 0, xpPerEnemy: 0, goldPerEnemy: 0 };
    var avg = function (f) {
        return refs.reduce(function (s, r) { return s + f(r); }, 0) / refs.length;
    };
    var xpPer = avg(function (r) { return num(r.xp) / num(r.enemies); });
    var goldPer = avg(function (r) { return num(r.gold) / num(r.enemies); });
    var разброс = function () { return 1 + (rng() * 2 - 1) * AMBUSH_SPREAD; };
    return {
        xp: Math.max(1, ceilGame(xpPer * count * разброс())),
        gold: Math.max(0, ceilGame(goldPer * count * разброс())),
        xpPerEnemy: xpPer, goldPerEnemy: goldPer
    };
}

function planXP(p) {
    p = p || {};
    var reward = Math.max(0, Math.floor(num(p.reward)));
    var list = (p.party || []).filter(function (m) { return m && !m.mercenary; });
    var each = list.map(function (m) {
        var was = num(m.xp);
        return { id: m.id, xp: was + reward, gained: reward, downed: !!m.downed };
    });
    return {
        perPlayer: reward,
        count: each.length,
        total: reward * each.length,   /* сколько роздано всего — для журнала */
        each: each
    };
}

/* ==========================================================================
   12. РЕСУРСЫ КЛАССОВ  (раздел 7)
   ========================================================================== */

/* Воин выходит в бой с ТРЕМЯ очками ярости (правило ниже, у
   rageOnBattleStart) и дальше зарабатывает её сам.

   История: сначала на старте была пятёрка, потом её убрали до пустой шкалы
   в расчёте, что «Поднять щит» вытянет первые раунды. Замер при пустой
   шкале БЕЗ щита: тяжёлая проседала на 7-16 пунктов и четыре клетки из
   пяти уходили ниже коридора. Сейчас старт — три, в каждом бою (см.
   ниже). */
var RAGE_ON_START = 3;

/* СТАРТОВАЯ ЯРОСТЬ — ВСЕГДА ТРИ (решение автора 28.09.2026).

   Каждый новый бой воин начинает с тремя зарядами, что бы ни было на шкале
   после прошлого. Раньше набранное за день переносилось в следующий бой
   (кончил с десятью — начал с десятью), и воин входил в драку полным;
   автор этот перенос отменил.

   Три, а не ноль: замер показывал, что тяжёлая на пустой шкале проседала
   на 7–16 пунктов. (Здесь стояло «с пустой шкалой щит не поднять» —
   неверно: щит ярости не стоит.)

   Прежние аргументы (что было на шкале, день прошлого боя, сегодняшний
   день) оставлены в подписи, чтобы не ломать вызовы, но на итог больше не
   влияют. Потолок шкалы по-прежнему режет. */
function rageOnBattleStart(carried, lastDay, today, maxRage) {
    var base = RAGE_ON_START;
    return maxRage === undefined ? base : clamp(base, 0, num(maxRage));
}

/* Ярость копится ТОЛЬКО от побоев: по воину попали и прошёл урон -> +1.
   Свой удар ярости больше НЕ даёт — воин звереет, когда его бьют, а не
   когда он бьёт. Парирование не даёт даже если часть урона просочилась:
   отбил удар — злиться не с чего.

   Потолка на прирост за раунд нет: больше четырёх врагов на воина не
   пускает кап на цель, значит больше +4 за раунд он и не получит.

   Четвёртый аргумент — годится ли событие. Для защиты его удобно считать
   через rageGainsOnDefense(). */
function rageAfter(current, maxRage, event, success) {
    var counts = (event === 'was_hit');
    var gain = (counts && success !== false) ? 1 : 0;
    return clamp(num(current) + gain, 0, num(maxRage));
}
/* Глухая оборона: главное действие, без ярости; четыре заряда за активацию.
   Не истекает с раундом. Своя атака прекращает стойку после подтверждения. После четвёртого
   срабатывания в раунде N повторная активация доступна с N+4.
   Новый бой сбрасывает остаток и откат через battleResetFacts. */
/* ЩИТ ЗАВИСИТ ОТ ТОГО, ЧЕМ ВОИН ДЕРЖИТ УДАР.

   Со щитом в левой руке он закрывается всерьёз — +6 к своей защите. С
   двуручным оружием закрываться нечем, он уходит в глухую стойку — +3, и
   это осознанный размен: терпишь слабее, зато бьёшь сильнее. Одноручное
   без щита прикрыть нечем совсем — всего +2.

   Константы ниже хранят числа СО ЗНАКОМ МИНУС — от старого правила «минус
   врагу»; shieldDefBonus переворачивает знак. */
var SHIELD_PENALTY      = -2;   /* одноручное без щита */
var SHIELD_WITH_SHIELD  = -6;   /* со щитом в левой руке */
var SHIELD_TWO_HANDED   = -3;   /* с двуручным оружием */

function shieldPenalty(p) {
    if ((p || {}).hasShield)  return SHIELD_WITH_SHIELD;
    if ((p || {}).twoHanded)  return SHIELD_TWO_HANDED;
    return SHIELD_PENALTY;
}

/* ПРИБАВКА К СВОЕЙ ЗАЩИТЕ, А НЕ МИНУС ЧУЖОЙ АТАКЕ.

   Считалось это наоборот: щит ронял бросок ВРАГА. Арифметически то же
   самое, а за столом непонятно — игрок кидает защиту, видит свои 14 и не
   видит, куда делась оборона. На карточке её тоже не показать: она жила у
   противника.

   Теперь оборона прибавляется к броску защиты того, кто окопался. Та же
   таблица, тот же знак наоборот. */
function shieldDefBonus(p) { return -shieldPenalty(p); }
var SHIELD_COOLDOWN = 3;    /* столько раундов пауза после четвёртого срабатывания */

var SHIELD_CHARGES = 4;
/* Старый активный щит без счётчика получает четыре срабатывания.
   Явный ноль — израсходован; раунд и бой сохраняют прежнюю совместимость. */
function shieldChargesLeft(p) {
    var o = p || {};
    if (num(o.shieldRound) <= 0 || num(o.shieldUsedRound) > 0) return 0;
    return o.shieldCharges == null ? SHIELD_CHARGES
        : Math.max(0, Math.min(SHIELD_CHARGES, Math.floor(num(o.shieldCharges))));
}
function shieldActive(p) {
    var o = p || {};
    if (!shieldChargesLeft(o)) return false;
    if (o.shieldBattleNo !== undefined && o.battleNo !== undefined
        && num(o.shieldBattleNo) !== num(o.battleNo)) return false;
    return true;
}

function canRaiseShield(p) {
    if ((p || {}).cls !== 'warrior') return false;
    if (shieldActive(p)) return false;            /* уже стоишь под щитом */
    var потрачен = num((p || {}).shieldUsedRound);
    if (!потрачен) return true;
    return num((p || {}).round) >= потрачен + SHIELD_COOLDOWN + 1;
}

/* Сколько раундов ещё ждать. Ноль — можно прямо сейчас. */
function shieldCooldownLeft(p) {
    var потрачен = num((p || {}).shieldUsedRound);
    if (!потрачен) return 0;
    return Math.max(0, потрачен + SHIELD_COOLDOWN + 1 - num((p || {}).round));
}

/* Вызывать только при разрешении защиты, даже при полном парировании.
   Полный промах врага и собственные действия воина заряд не расходуют.
   Вызывающий сохраняет план вместе с уроном, один раз на заявку защиты. */
function planShieldHit(round, player) {
    if (!shieldActive(player)) return {};
    var left = shieldChargesLeft(player) - 1;
    return left > 0 ? { shieldCharges: left }
        : { shieldCharges: 0, shieldUsedRound: num(round) || 1, shieldRound: 0 };
}
function planShieldAttack(player, world) {
    return shieldActive(Object.assign({},player,{battleNo:num((world||{}).battleNo)}))
        ? {shieldCharges:0,shieldRound:0,shieldUsedRound:num((world||{}).round)||1} : {};
}
function planShield(round, battleNo) {
    return { shieldRound: num(round) || 1, shieldUsedRound: 0,
             shieldBattleNo: num(battleNo), shieldCharges: SHIELD_CHARGES };
}

/* Сколько врагов в очереди ходит после воина. Раньше по нему гасили кнопку
   щита последнему в круге; запрет снят (см. whyCantRaiseShield) — оборона
   доживает до четырёх срабатываний. Считалка оставлена для подсказки и проверок. Живость
   врагов она не смотрит — только порядок в очереди. */
function shieldWouldCover(queue, warriorId) {
    var list = queue || [], после = false, n = 0;
    for (var i = 0; i < list.length; i++) {
        if (!list[i]) continue;
        if (после && list[i].type === 'enemy') n++;
        if (list[i].id === warriorId) после = true;
    }
    return n;
}

function whyCantRaiseShield(p, queue) {
    if ((p || {}).cls !== 'warrior') return 'Щит есть только у воина';
    if (shieldActive(p)) return 'Вы уже под щитом';
    var ждать = shieldCooldownLeft(p);
    if (ждать > 0) return 'Щит будет готов через ' + ждать + ' р.';
    /* ЗАПРЕТ «после вас никто не ходит» СНЯТ. Он существовал потому, что
       оборона жила один раунд и в конце круга пропадала зря. Теперь она
       доживает до четырёх срабатываний, в каком бы раунде он ни прилетел. */
    return '';
}

/* ЯРОСТЬ КАПАЕТ ЗА ПРОПУЩЕННЫЙ УРОН, А НЕ ЗА УДАВШУЮСЯ ЗАЩИТУ.

   Имя досталось от старого правила и читается наоборот — переименовывать не
   стали: его знают клиент, дашборд и проверки, и менять имя вместе со
   смыслом значит потерять что-нибудь по дороге. Считать надо по этой
   строке, а не по названию.

   Почему так: воин злится, когда его бьют. Дай ярость за успешную защиту —
   и выгоднее станет подставляться. Парирование исключено нарочно: там удар
   отбит целиком, злиться не на что. */
function rageGainsOnDefense(outcome, damageTaken) {
    return num(damageTaken) > 0 && outcome !== 'parry';
}

/* Настроение барда: смерть врага поднимает, полученный удар роняет. */
function moodOnEnemyDeath(current, maxMood) {
    return Math.min(num(maxMood), num(current) + MOOD_PER_ENEMY_DEATH);
}
function moodOnHitTaken(current) {
    return Math.max(0, num(current) - MOOD_LOST_WHEN_HIT);
}
/* Крит союзника заводит барда. Редкое событие — потому и всего +1. */
function moodOnAllyCrit(current, maxMood) {
    return Math.min(num(maxMood), num(current) + MOOD_PER_ALLY_CRIT);
}
/* НАСТРОЕНИЕ ПОСЛЕ НОЧЁВКИ (решение автора 29.09.2026). Между боями оно
   хранится как есть, а новый день бард начинает с половиной шкалы — после
   привала и после сна в таверне. Проснулся с Бадуном — пусто.
   Прежнее «после боя поднять до половины» (moodAfterBattle) убрано: его
   никто не звал, а правило теперь обратное — между боями не трогаем. */
var MOOD_AFTER_SLEEP = 0.5;
function moodAfterSleep(maxMood, hangover) {
    return hangover ? 0 : ceilGame(num(maxMood) * MOOD_AFTER_SLEEP);
}
/* Атака барда тратит Настроение. Ниже нуля не уходит. */
function moodAfterAttack(current) {
    return Math.max(0, num(current) - MOOD_PER_ATTACK);
}
/* Сколько Настроения даёт выпитое. Шкала есть ТОЛЬКО у барда: пьёт он сам —
   забирает всё, пьёт союзник — барду половина, округление вверх. Сам союзник
   получает только опьянение, Настроения у него нет вовсе. */
function moodFromDrink(item, byBard) {
    var m = num((item || {}).mood);
    if (m <= 0) return 0;
    return byBard ? m : ceilGame(m * MOOD_ALLY_SHARE);
}
function moodAfterDrink(current, maxMood, item, byBard) {
    return Math.min(num(maxMood), num(current) + moodFromDrink(item, byBard));
}

/* ПОПРАВКА БАРДА НА ПУСТОМ НАСТРОЕНИИ. Одно число, одно место: его берут и
   правила боя, и подсказка в клиенте. */
var BARD_EMPTY_MOOD = -1;

/* Бард на нуле Настроения БЬЁТ — просто хуже, с поправкой BARD_EMPTY_MOOD.

   Раньше отсюда возвращалось «не может», и на пустой шкале бард выбывал из
   боя целиком: ни удара, ни песни, только защита. Игрок сидел и смотрел,
   пока кто-нибудь не нальёт. Песни по-прежнему стоят Настроения — их
   стережёт canSing, это другое правило. */
function canBardAct(player) {
    return true;
}

/* Зелья, алкоголь, квестовые вещи и переодевание делят допдействие.
   Если оно занято, интерфейс может предложить оплату основным действием.

   Имя прежнее (`consumesSecondAction`) оставлено нарочно: его знают клиент,
   дашборд, симулятор и проверки. Менять правило и имя разом — верный способ
   что-нибудь потерять по дороге. */
function consumesSecondAction(item) {
    if (!item) return false;
    return item.type === 'consumable' || item.type === 'quest' || item.type === 'gear';
}

/* ==========================================================================
   13. ЭКСПОРТ
   ========================================================================== */

global.CombatRules = {
    ceilGame:ceilGame,
    VERSION: VERSION,
    T: T, MULT: MULT, DEF_THRESHOLD: DEF_THRESHOLD, DEF_POWER: DEF_POWER,
    INTERCEPT_CHANCE: INTERCEPT_CHANCE, PRESENCE_STACKS: PRESENCE_STACKS,
    presenceStacks: presenceStacks, presenceRevealTargets: presenceRevealTargets,
    turnsLeft: turnsLeft, frostLeft: frostLeft, isFrozen: isFrozen,
    controlLeft: controlLeft, controlReadyLeft: controlReadyLeft, isStunned: isStunned, isRooted: isRooted,
    HELL_FLEX_CHANCE: HELL_FLEX_CHANCE, hellFlexEligible: hellFlexEligible,
    hellFlexReceipt: hellFlexReceipt, planHellFlex: planHellFlex,
    isDisoriented: isDisoriented, isEnemyDisabled: isEnemyDisabled,
    applyStun: applyStun, applyEnemyControl: applyEnemyControl, finishEnemyTurn: finishEnemyTurn,
    damageEnemy: damageEnemy, canEnemyMove: canEnemyMove, canEnemyAttackTarget: canEnemyAttackTarget,
    enemyInMeleeContact: enemyInMeleeContact, heroInMeleeWith:heroInMeleeWith, enemyHitTargetFacts: enemyHitTargetFacts,
    burnLeft: burnLeft, applyBurn: applyBurn, planBurnTick: planBurnTick, hpAfterDamage: hpAfterDamage,
    BURN_TURNS: BURN_TURNS, BURN_RATE: BURN_RATE,
    applyFrostbite: applyFrostbite, furyLeft: furyLeft, shouldRoarFury: shouldRoarFury,
    planFury: planFury, howlWarns: howlWarns, shouldHowl: shouldHowl, planHowl: planHowl,
    planFearHowl: planFearHowl,
    ENEMY_POTION_BELOW: ENEMY_POTION_BELOW, distributeEnemyPotions: distributeEnemyPotions,
    shouldEnemyDrink: shouldEnemyDrink, planEnemyPotion: planEnemyPotion,
    canRevive: canRevive, planRevive: planRevive, whyCantRevive: whyCantRevive,
    reviveLevels: reviveLevels, REVIVE_LEVELS: REVIVE_LEVELS,
    FROST_TURNS: FROST_TURNS, FURY_TURNS: FURY_TURNS, FURY_BONUS: FURY_BONUS,
    FURY_ROUND: FURY_ROUND,
    HOWL_WARN: HOWL_WARN, HOWL_ROUND: HOWL_ROUND, HOWL_HEAL: HOWL_HEAL,
    REVIVE_HP: REVIVE_HP,
    presenceOnOtherHit: presenceOnOtherHit,
    REVENGE_STREAK: REVENGE_STREAK, REVENGE_STREAK_BOSS: REVENGE_STREAK_BOSS,
    REVENGE_LOW_HP: REVENGE_LOW_HP, LINE_PRESSURE: LINE_PRESSURE,
    RETARGET_CHANCE: RETARGET_CHANCE, RETARGET_CHANCE_SHIELDED: RETARGET_CHANCE_SHIELDED,
    retargetChance: retargetChance, decideRetarget: decideRetarget,
    canBreakaway: canBreakaway, whyNoBreakaway: whyNoBreakaway,
    whyCantAdvance:whyCantAdvance, isMeleeAttack:isMeleeAttack, hasRetreatSkill: hasRetreatSkill, retreatHolders: retreatHolders,
    canRetreatReaction: canRetreatReaction, safeRetreatAvailable: safeRetreatAvailable,
    retreatPending: retreatPending, whyCantRetreat: whyCantRetreat, planRetreat: planRetreat,
    isForcedChange: isForcedChange,
    planRevengeRetarget: planRevengeRetarget, resolveBreakaway: resolveBreakaway,
    linePressure: linePressure, revengeStreakNeeded: revengeStreakNeeded,
    revengeNotice: revengeNotice,
    CLASS_TABLE: CLASS_TABLE, GEAR_FOLDERS: GEAR_FOLDERS, STATS: STATS,
    WEAPON_KEYS: WEAPON_KEYS, EFFECT_ICONS: EFFECT_ICONS,
    RAGE_BASE: RAGE_BASE, RAGE_PER_STEP: RAGE_PER_STEP,
    SURROUND_CAP: SURROUND_CAP, SURROUND_DEF: SURROUND_DEF,
    POWER_STRIKE_COST: POWER_STRIKE_COST,
    POWER_ONE_SWEEP: POWER_ONE_SWEEP, POWER_ONE_HAND: POWER_ONE_HAND,
    POWER_ONE_HAND: POWER_ONE_HAND, POWER_TWO_SINGLE: POWER_TWO_SINGLE,
    POWER_TWO_SWEEP: POWER_TWO_SWEEP,
    enemyHP: enemyHP, enemyAlive: enemyAlive,
    isMeleeEnemy: isMeleeEnemy, meleeAttackersOn: meleeAttackersOn,
    meleeAttackerIds: meleeAttackerIds, canEngageMelee: canEngageMelee,
    isSurrounded: isSurrounded, planPowerStrike: planPowerStrike,
    powerStrikeOptions: powerStrikeOptions,
    canPowerStrike: canPowerStrike, whyCantPowerStrike: whyCantPowerStrike,
    applyPowerStrike: applyPowerStrike, powerStrikeMult: powerStrikeMult,
    resolveSweep: resolveSweep, sweepSummary: sweepSummary,
    MOOD_BASE: MOOD_BASE, MOOD_PER_STEP: MOOD_PER_STEP,
    STAT_FLOOR: STAT_FLOOR,

    rollDice: rollDice, diceMin: diceMin, parseRollInput: parseRollInput,
    getRole: getRole, roleIcon: roleIcon, isRogue: isRogue, hasDualDaggers: hasDualDaggers,
    canEquip: canEquip, equipmentKind:equipmentKind, legalHeroSlots:legalHeroSlots,
    heroEquipmentVitals:heroEquipmentVitals, equipmentVitalsFacts:equipmentVitalsFacts,
    changeEquipmentFacts:changeEquipmentFacts, sameEquipmentSlots:sameEquipmentSlots,
    HP_FORMULA_VERSION:HP_FORMULA_VERSION, RACE_BONUSES:RACE_BONUSES,
    heroStats:heroStats, strengthMaxHP:strengthMaxHP, upgradeHeroState:upgradeHeroState, upgradeHeroTree:upgradeHeroTree,
    contactFacts:contactFacts, cappedEnemyFacts:cappedEnemyFacts, normalizeMeleeContacts:normalizeMeleeContacts,
    priestContactFacts:priestContactFacts,contactPlayerPositions:contactPlayerPositions,
    computeStats: computeStats, computeVitals: computeVitals, steadfastDefense: steadfastDefense, computeCombatValues: computeCombatValues,
    resolveRoll: resolveRoll, exactDamage:exactDamage, scaleDamage:scaleDamage, resourceCost:resourceCost, resolveDefense: resolveDefense,
    deriveEnemyEffects: deriveEnemyEffects, derivePlayerEffects: derivePlayerEffects,
    isEffectActive: isEffectActive, canDefend: canDefend, isTargetable: isTargetable,
    hasExtraAction: hasExtraAction, whyNoExtraAction: whyNoExtraAction,
    planExtraAction: planExtraAction, skipsLeft: skipsLeft,
    SKIPS_AFTER_EXTRA: SKIPS_AFTER_EXTRA,
    statSteps: statSteps, STAT_STEP: STAT_STEP,
    isUnarmed: isUnarmed, canFightUnarmed: canFightUnarmed,
    unarmedDamage: unarmedDamage, UNARMED_STAT: UNARMED_STAT,
    armedState: armedState, whyCantAttack: whyCantAttack,
    DRUNK_STEPS: DRUNK_STEPS, DRUNK_MAX: DRUNK_MAX, HANGOVER_FROM_STEP: HANGOVER_FROM_STEP,
    HANGOVER_FROM_STEP_BARD: HANGOVER_FROM_STEP_BARD, hangoverThreshold: hangoverThreshold,
    drunkStep: drunkStep, drunkPercent: drunkPercent, hasHangover: hasHangover,
    deriveDrunkEffects: deriveDrunkEffects, defenseModifier: defenseModifier, defenseParts:defenseParts,
    allyHitChance: allyHitChance, rollsIntoAlly: rollsIntoAlly,
    drunkAfterBattle: drunkAfterBattle, drunkAfterSleep: drunkAfterSleep,
    clearHangover: clearHangover, drinkClearsHangover: drinkClearsHangover, battleResetFacts: battleResetFacts, BATTLE_RESET: BATTLE_RESET,
    battleRecoveryRate:battleRecoveryRate, planBattleRecovery:planBattleRecovery, planGroupEscape:planGroupEscape,
    resolveRevenge: resolveRevenge,
    resolveSkinning: resolveSkinning, trophyFor: trophyFor, isSkinnable: isSkinnable,
    planLoot: planLoot, lootMultiplier: lootMultiplier, SKIN_THRESHOLD: SKIN_THRESHOLD,
    planXP: planXP, enemyRollModifier: enemyRollModifier,
    AMBUSH_ID: AMBUSH_ID, AMBUSH_SPREAD: AMBUSH_SPREAD, planAmbushReward: planAmbushReward,
    relicDaysLeft: relicDaysLeft, relicCooldowns:relicCooldowns, relicCooldownLeft:relicCooldownLeft,
    planSpookTurn:planSpookTurn, mercBattleMark: mercBattleMark, mercLeavesWith: mercLeavesWith,
    SELL_RATE: SELL_RATE, shopSells: shopSells, shopPrice: shopPrice, shopBuysBack: shopBuysBack,
    buybackPrice: buybackPrice, whyCantSell: whyCantSell,
    namedDrops: namedDrops, isRandomLoot: isRandomLoot,
    POWER_MAX: POWER_MAX, POWER_PER_CAST: POWER_PER_CAST, POWER_STEPS: POWER_STEPS,
    POWER_PER_STEP: POWER_PER_STEP, powerCashback: powerCashback,
    powerAfterCast: powerAfterCast, canEmpower: canEmpower, planEmpower: planEmpower,
    applyEmpower: applyEmpower, empowerSteps: empowerSteps,
    canUseEmpower: canUseEmpower, EMPOWER_CURRENT: EMPOWER_CURRENT, EMPOWER_CLASSES: EMPOWER_CLASSES,
    CANTRIP_PER_CAST: CANTRIP_PER_CAST, CANTRIP_PER_STEP: CANTRIP_PER_STEP,
    faithAfterCast: faithAfterCast, HOLY_FAITH_CASHBACK: HOLY_FAITH_CASHBACK,
    planFaithAward:planFaithAward, faithKillFacts:faithKillFacts, faithMiracleEligible:faithMiracleEligible,
    faithManaOptions:faithManaOptions, faithManaCost:faithManaCost,
    whyCantFaithMana:whyCantFaithMana, planFaithMana:planFaithMana,
    canDonate: canDonate, whyCantDonate: whyCantDonate, planDonation: planDonation,
    canBuyAtTavern: canBuyAtTavern, whyCantBuyAtTavern: whyCantBuyAtTavern,
    roomCost: roomCost, canRentRoom: canRentRoom, whyCantRentRoom: whyCantRentRoom,
    planSleep: planSleep, planNightRest:planNightRest,
    canBuy: canBuy, whyCantBuy: whyCantBuy, planBuy: planBuy,
    canHireMerc: canHireMerc, whyCantHireMerc: whyCantHireMerc,
    MERC_COOLDOWN: MERC_COOLDOWN,
    canChurchRevive: canChurchRevive, whyCantChurchRevive: whyCantChurchRevive,
    whyCantChurchCure: whyCantChurchCure, planChurchCure: planChurchCure,
    planChurchRevive: planChurchRevive,
    sceneHPMult: sceneHPMult, sceneAtkMult: sceneAtkMult,
    sceneMult: sceneMult, sceneMults: sceneMults, SCENE_MULTS: SCENE_MULTS,
    toughenEnemy: toughenEnemy,
    fieldAuras: fieldAuras, BOSS_AURAS: BOSS_AURAS, FEAR_AURA: FEAR_AURA,
    planSpawn: planSpawn, spawnMultiplier: spawnMultiplier, buffEnemy: buffEnemy,
    spawnCap: spawnCap, spawnCapRatio: spawnCapRatio,
    SPAWN_PER_PLAYER_CAP: SPAWN_PER_PLAYER_CAP,
    evaluateLastStand: evaluateLastStand, packScatter: packScatter, planWolfMorale: planWolfMorale,
    isPackMember: isPackMember,
    isPackMember: isPackMember, isPackLeader: isPackLeader,
    pickEnemyTarget: pickEnemyTarget, resolveEnemyAttack: resolveEnemyAttack, buildQueue: buildQueue,
    SHIELD_PENALTY: SHIELD_PENALTY, SHIELD_COOLDOWN: SHIELD_COOLDOWN,
    SHIELD_WITH_SHIELD: SHIELD_WITH_SHIELD, SHIELD_TWO_HANDED: SHIELD_TWO_HANDED,
    shieldPenalty: shieldPenalty, shieldDefBonus: shieldDefBonus,
    canRaiseShield: canRaiseShield, shieldCooldownLeft: shieldCooldownLeft,
    SHIELD_CHARGES: SHIELD_CHARGES, shieldChargesLeft: shieldChargesLeft,
    shieldActive: shieldActive, planShieldHit: planShieldHit, planShieldAttack:planShieldAttack, planShield: planShield, shieldWouldCover: shieldWouldCover,
    whyCantRaiseShield: whyCantRaiseShield,
    resolvePresence: resolvePresence, clearPresenceIfOther: clearPresenceIfOther,
    pickInterceptors: pickInterceptors, rollIntercepts: rollIntercepts,
    shouldCheckIntercept: shouldCheckIntercept, markInterceptAttempt: markInterceptAttempt,
    interceptApplies: interceptApplies, resolveIntercept: resolveIntercept,
    INTERCEPT_REASON: INTERCEPT_REASON,
    bankInterest: bankInterest, bankAccrue: bankAccrue, bankWeeksPassed: bankWeeksPassed,
    BANK_RATE_PER_WEEK: BANK_RATE_PER_WEEK, BANK_WEEK_DAYS: BANK_WEEK_DAYS,
    bankDeposit: bankDeposit, bankWithdraw: bankWithdraw, whyCantBank: whyCantBank,
    bankWeekBase: bankWeekBase, bankRoll: bankRoll,
    RAGE_ON_START: RAGE_ON_START,
    rageOnBattleStart: rageOnBattleStart, rageAfter: rageAfter,
    moodAfterSleep: moodAfterSleep, MOOD_AFTER_SLEEP: MOOD_AFTER_SLEEP,
    moodAfterAttack: moodAfterAttack, moodFromDrink: moodFromDrink,
    moodOnEnemyDeath: moodOnEnemyDeath, moodOnHitTaken: moodOnHitTaken,
    moodOnAllyCrit: moodOnAllyCrit, rageGainsOnDefense: rageGainsOnDefense,
    fortuneCharges:fortuneCharges, fortunePending:fortunePending, fortuneActionEligible:fortuneActionEligible, whyCantFortune:whyCantFortune,
    planFortuneGrant:planFortuneGrant, startFortuneChoice:startFortuneChoice, rerollFortune:rerollFortune,
    acceptFortune:acceptFortune, fortuneRollId:fortuneRollId, fortuneAttackPlan:fortuneAttackPlan,
    SONGS: SONGS, SONG_COST: SONG_COST, SONG_ROUNDS: SONG_ROUNDS,
    canDoubleShot: canDoubleShot, whyCantDoubleShot: whyCantDoubleShot,
    planDoubleShot: planDoubleShot,
    doubleShotPending: doubleShotPending, planDoubleShotSequence: planDoubleShotSequence,
    doubleShotRollIndex: doubleShotRollIndex, doubleShotTarget: doubleShotTarget,
    doubleShotRollId: doubleShotRollId, doubleShotFortuneEligible: doubleShotFortuneEligible,
    nextDoubleShotArrow: nextDoubleShotArrow, shotsLeft: shotsLeft, afterShot: afterShot,
    DOUBLE_SHOT_SHOTS: DOUBLE_SHOT_SHOTS,
    DOUBLE_SHOT_COOLDOWN: DOUBLE_SHOT_COOLDOWN, isBowArcher: isBowArcher,
    HUNTER_MARK_COOLDOWN: HUNTER_MARK_COOLDOWN, HUNTER_MARK_ROUNDS: HUNTER_MARK_ROUNDS,
    HUNTER_MARK_BONUS: HUNTER_MARK_BONUS, hunterMarkActive: hunterMarkActive,
    canHunterMark: canHunterMark, whyCantHunterMark: whyCantHunterMark, planHunterMark: planHunterMark,
    canSneakHit: canSneakHit, whyCantSneakHit: whyCantSneakHit,
    planSneakHit: planSneakHit, isSneakHit: isSneakHit,
    SNEAK_HIT_COOLDOWN: SNEAK_HIT_COOLDOWN, HAMSTRING_COOLDOWN: HAMSTRING_COOLDOWN,
    skillCooldownLeft: skillCooldownLeft,
    canHamstring: canHamstring, whyCantHamstring: whyCantHamstring,
    planHamstring: planHamstring, hamstringAttackRecorded: hamstringAttackRecorded,
    applyHamstring: applyHamstring,
    resolvePresenceSneaky: resolvePresenceSneaky,
    usedToday: usedToday, usedThisBattle: usedThisBattle,
    TITLES: TITLES, titleFor: titleFor, nextTitle: nextTitle,
    spellHeal: spellHeal, planSpellHeal: planSpellHeal,
    deepWoundActive:deepWoundActive, planDeepWoundHit:planDeepWoundHit, planDeepWoundTick:planDeepWoundTick,
    woundTurnPending:woundTurnPending, physicalHealFacts:physicalHealFacts,
    sicknessActive:sicknessActive,sicknessMaxHP:sicknessMaxHP,sicknessVitals:sicknessVitals,
    infectionActive:infectionActive,infectionDiseaseChance:infectionDiseaseChance,planInfectionHit:planInfectionHit,
    planInfectionEnd:planInfectionEnd,planWoundTick:planWoundTick,resurrectionCleanse:resurrectionCleanse,
    PRIEST_HEALING_RAY: PRIEST_HEALING_RAY,
    PRAYERS: PRAYERS, PRAYER_COST: PRAYER_COST, PRAYER_ROUNDS: PRAYER_ROUNDS,
    PRAYER_SELF_MULT: PRAYER_SELF_MULT,
    activePrayer: activePrayer, canPray: canPray, whyCantPray: whyCantPray,
    planPrayer: planPrayer, prayerBonus: prayerBonus, planPrayerTarget: planPrayerTarget, clampToMax: clampToMax, mercLevel: mercLevel, hasItem: hasItem,
    canSecondWind: canSecondWind, whyCantSecondWind: whyCantSecondWind,
    planSecondWind: planSecondWind, SECOND_WIND_HP: SECOND_WIND_HP,
    SECOND_WIND_COST: SECOND_WIND_COST,
    canMeditate: canMeditate, whyCantMeditate: whyCantMeditate,
    planMeditate: planMeditate, MEDITATE_SHARE: MEDITATE_SHARE,
    canSing: canSing, whyCantSing: whyCantSing, planSong: planSong,
    INSPIRING_COST:INSPIRING_COST, INSPIRING_ROUNDS:INSPIRING_ROUNDS, inspiringActive:inspiringActive,
    inspiringProtection:inspiringProtection, whyCantInspiring:whyCantInspiring, planInspiring:planInspiring,
    shortenHeroControl:shortenHeroControl, suppressInspiringEffect:suppressInspiringEffect, planHeroControl:planHeroControl,
    heroControlStamps:heroControlStamps, heroActionControlled:heroActionControlled,
    songAffects: songAffects, songDeafTargets: songDeafTargets,
    songOutcome: songOutcome, songPower: songPower, songEffectSize: songEffectSize,
    SONG_LABEL: SONG_LABEL, SONG_MISS: SONG_MISS, SONG_HALF: SONG_HALF,
    songActive: songActive, songModifier: songModifier, songEffect: songEffect,
    MOOD_PER_ALLY_CRIT: MOOD_PER_ALLY_CRIT,
    MOOD_PER_ENEMY_DEATH: MOOD_PER_ENEMY_DEATH, MOOD_LOST_WHEN_HIT: MOOD_LOST_WHEN_HIT,
    moodAfterDrink: moodAfterDrink, canBardAct: canBardAct,
    BARD_EMPTY_MOOD: BARD_EMPTY_MOOD,
    consumesSecondAction: consumesSecondAction,
    /* MOOD_BASE и MOOD_PER_STEP вынесены выше — второй раз не надо. */
    MOOD_PER_ATTACK: MOOD_PER_ATTACK, MOOD_ALLY_SHARE: MOOD_ALLY_SHARE
};

})(typeof window !== 'undefined' ? window : globalThis);


/* Built from baza/data-items.js */
// ═══════════════════════════════════════════════════════════
// БАЗА ДАННЫХ: ПРЕДМЕТЫ
// ═══════════════════════════════════════════════════════════
// Собрано редактором items-editor.html.
// Подключается ПОСЛЕ baza/assets.js — оттуда берётся GITHUB_URL.
//
// stats двигают характеристики, а через них — всё, что от них считается:
// HP и ману очко в очко, ступени статов (10, 15, 20…), инициативу и крит.
// atk и def прибавляются к броскам напрямую.
// ═══════════════════════════════════════════════════════════

    window.masterItemsDB = {
        rusty_sword: { name: "Ржавый Меч", type: "gear", slot: "mainhand", classes: ['warrior','priest'], equipmentKind: 'weapon', cost: 7, isLoot: true, icon: GITHUB_URL + "assets/gear/warrior/mainhand/rusty_sword.png", stats: {}, atk: 1, def: 0, desc: "+1 Шанс Атаки" },
        rusty_axe: { name: "Ржавый Топор", type: "gear", slot: "mainhand", classes: ['warrior','priest'], equipmentKind: 'weapon', cost: 7, isLoot: true, icon: GITHUB_URL + "assets/gear/warrior/mainhand/rusty_axe.png", stats: {}, atk: 1, def: 0, desc: "+1 Шанс Атаки" },
        rusty_double_hands_axe: { name: "Ржавый Двуручный Топор", type: "gear", slot: "mainhand", isTwoHanded: true, classes: ['warrior'], equipmentKind: 'weapon', cost: 10, isLoot: true, icon: GITHUB_URL + "assets/gear/warrior/mainhand/rusty_double_hands_axe.png", stats: {str: 1}, atk: 1, def: 0, desc: "+1 Атака, +1 Сила (2-Руч)" },
        rusty_dagger: { name: "Ржавый Кинжал", type: "gear", slot: "mainhand", classes: ['archer'], equipmentKind: 'dagger', cost: 6, isLoot: true, icon: GITHUB_URL + "assets/gear/archer/mainhand/rusty_dagger.png", stats: {}, atk: 1, def: 0, desc: "+1 Шанс Атаки" },
        short_bow: { name: "Короткий Лук", type: "gear", slot: "mainhand", classes: ['archer'], equipmentKind: 'bow', cost: 12, isLoot: true, isTwoHanded: true, icon: GITHUB_URL + "assets/gear/archer/mainhand/short_bow.png", stats: {agi: 1}, atk: 1, def: 0, desc: "+1 Атака, +1 Ловк (2-Руч)" },
        stick_staff: { name: "Посох из Палки", type: "gear", slot: "mainhand", classes: ['mage'], equipmentKind: 'staff', cost: 10, isLoot: true, isTwoHanded: true, icon: GITHUB_URL + "assets/gear/mage/mainhand/stick_staff.png", stats: {int: 1}, atk: 1, def: 0, desc: "+1 Атака, +1 Инт (2-Руч)" },
        ambrosia_wand: { name: "Палочка (Амброзия)", type: "gear", slot: "mainhand", classes: ['mage','priest'], equipmentKind: 'wand', cost: 6, isLoot: true, icon: GITHUB_URL + "assets/gear/mage/mainhand/ambrosia_wand.png", stats: {}, atk: 1, def: 0, desc: "+1 Шанс Атаки" },
        wooden_shield: { name: "Деревянный Щит", type: "gear", slot: "offhand", classes: ['warrior','priest'], equipmentKind: 'shield', cost: 5, isLoot: true, icon: GITHUB_URL + "assets/gear/offhand/wooden_shield.png", stats: {}, atk: 0, def: 1, desc: "+1 Шанс Защиты" },
        dried_frog: { name: "Сушеная Лягушка", type: "gear", slot: "offhand", classes: ['mage','priest'], equipmentKind: 'focus', cost: 5, isLoot: true, icon: GITHUB_URL + "assets/gear/offhand/dried_frog.png", stats: {int: 1}, atk: 0, def: 0, desc: "+1 Интеллект" },
        rusty_dagger_off: { name: "Кинжал (Левый)", type: "gear", slot: "offhand", classes: ['archer'], equipmentKind: 'dagger', cost: 6, isLoot: true, icon: GITHUB_URL + "assets/gear/archer/mainhand/rusty_dagger.png", stats: {}, atk: 1, def: 0, desc: "+1 Атаки (Dual)" },
        rusty_helmet: { name: "Ржавый Шлем", type: "gear", slot: "head", classes: ['warrior'], cost: 6, isLoot: true, icon: GITHUB_URL + "assets/gear/warrior/head/rusty_helmet.png", stats: {str: 1}, atk: 0, def: 0, desc: "+1 Сила" },
        leather_hood: { name: "Кож. Капюшон", type: "gear", slot: "head", classes: ['archer'], cost: 6, isLoot: true, icon: GITHUB_URL + "assets/gear/archer/head/leather_hood.png", stats: {agi: 1}, atk: 0, def: 0, desc: "+1 Ловкость" },
        linen_hat: { name: "Льняная Шляпа", type: "gear", slot: "head", classes: ['mage','priest'], cost: 6, isLoot: true, icon: GITHUB_URL + "assets/gear/mage/head/linen_hat.png", stats: {int: 1}, atk: 0, def: 0, desc: "+1 Интеллект" },
        chainmail: { name: "Ржавый Латный Доспех", type: "gear", slot: "chest", classes: ['warrior'], cost: 10, isLoot: true, icon: GITHUB_URL + "assets/gear/warrior/chest/rusty_plate_armor_man.png", icons: { male: GITHUB_URL + "assets/gear/warrior/chest/rusty_plate_armor_man.png", female: GITHUB_URL + "assets/gear/warrior/chest/rusty_plate_armor_chainmail_woman.png" }, stats: {str: 1}, atk: 0, def: 0, desc: "+1 Сила" },
        leather_jacket: { name: "Кожанка", type: "gear", slot: "chest", classes: ['archer'], cost: 10, isLoot: true, icon: GITHUB_URL + "assets/gear/archer/chest/leather_jacket.png", stats: {agi: 1}, atk: 0, def: 0, desc: "+1 Ловкость" },
        old_robe: { name: "Старая Роба", type: "gear", slot: "chest", classes: ['mage','priest'], cost: 10, isLoot: true, icon: GITHUB_URL + "assets/gear/mage/chest/old_robe.png", stats: {int: 1}, atk: 0, def: 0, desc: "+1 Интеллект" },
        iron_boots: { name: "Железные Сапоги", type: "gear", slot: "feet", classes: ['warrior'], cost: 6, isLoot: true, icon: GITHUB_URL + "assets/gear/warrior/feet/iron_boots.png", stats: {str: 1}, atk: 0, def: 0, desc: "+1 Сила" },
        leather_boots: { name: "Легкие Сапоги", type: "gear", slot: "feet", classes: ['archer'], cost: 6, isLoot: true, icon: GITHUB_URL + "assets/gear/archer/feet/leather_boots.png", stats: {agi: 1}, atk: 0, def: 0, desc: "+1 Ловкость" },
        worn_shoes: { name: "Понош. Туфли", type: "gear", slot: "feet", classes: ['mage','priest'], cost: 6, isLoot: true, icon: GITHUB_URL + "assets/gear/mage/feet/worn_shoes.png", stats: {int: 1}, atk: 0, def: 0, desc: "+1 Интеллект" },
        /* Огненный шар: ключ scroll_fire сохранён для уже купленных томов.
           Огненная и ледяная стрелы доступны отдельно в книге фокусов. */
        scroll_fire: { name: "Том: Огненный Шар", type: "gear", subtype: "attack", slot: "magic", classes: ['mage'], cost: 25, manaCost: 17, spellDamage: 10, damageType: 'fire', burns: true, icon: GITHUB_URL + "assets/gear/spells/fireball.png", stats: {}, atk: 0, def: 0, desc: "Огненный урон 10+ИНТ (17 MP). Горение: 10% итогового урона, округлённые вверх, в начале двух следующих собственных ходов врага" },
        scroll_aggro: { name: "Свиток: Агр", type: "gear", subtype: "utility", slot: "magic", classes: ['warrior'], cost: 25, manaCost: 5, icon: GITHUB_URL + "assets/gear/spells/aggro.png", stats: {}, atk: 0, def: 0, desc: "Агр Врагов (5 ярости)" },
        dead_bards_lute: { name: "Лютня Мёртвого Барда", type: "gear", slot: "mainhand", classes: ['bard'], cost: 5, isTwoHanded: true, icon: GITHUB_URL + "assets/gear/bard/mainhand/dead_bards_lute.png", stats: {}, atk: 1, def: 0, desc: "Инструмент конечно гавно, но звуки издаёт. Барду без инструмента воевать нечем" },
        daddy_old_lute: { name: "Папочкина Старая Лютня", type: "gear", slot: "mainhand", classes: ['bard'], cost: 0, isLoot: true, /* ИМЕННОЙ ДРОП: падает ТОЛЬКО с главаря. Без этого поля лютня проходила в общий пул и могла выпасть с крысы в первом же бою — а по сюжету её отобрали разбойники. */ dropsFrom: "bandit_leader", isTwoHanded: true, icon: GITHUB_URL + "assets/gear/bard/mainhand/daddy_old_lute.png", stats: {cha: 1}, atk: 1, def: 0, desc: "Отобрана разбойниками в начале пути. Возвращается с их главаря" },
        someone_hat: { name: "Чья-то Шляпа", type: "gear", slot: "head", classes: ['bard'], cost: 6, icon: GITHUB_URL + "assets/gear/bard/head/someone_hat.png", stats: {cha: 1}, atk: 0, def: 0, desc: "+1 Харизма" },
        old_gypsy_shirt: { name: "Старая Цыганская Рубаха", type: "gear", slot: "chest", classes: ['bard'], cost: 10, icon: GITHUB_URL + "assets/gear/bard/chest/old_gypsy_shirt.png", stats: {cha: 1}, atk: 0, def: 0, desc: "+1 харизма" },
        favorite_belt: { name: "Любимый Пояс", type: "gear", slot: "belt", classes: ['bard'], cost: 6, icon: GITHUB_URL + "assets/gear/bard/belt/favorite_belt.png", stats: {cha: 1}, atk: 0, def: 0, desc: "+1 Харизма" },
        grandmother_bracers: { name: "Бабушкины Наручи", type: "gear", slot: "gloves", classes: ['bard'], cost: 5, icon: GITHUB_URL + "assets/gear/bard/gloves/grandmother_bracers.png", stats: {cha: 1}, atk: 0, def: 0, desc: "+1 харизма" },
        pawnshop_winklepickers: { name: "Ломбардные Остроносы", type: "gear", slot: "feet", classes: ['bard'], cost: 6, icon: GITHUB_URL + "assets/gear/bard/feet/pawnshop_winklepickers.png", stats: {cha: 1}, atk: 0, def: 0, desc: "+1 Харизма" },
        leather_belt: { name: "Кожаный Пояс", type: "gear", slot: "belt", classes: ['archer'], cost: 6, icon: GITHUB_URL + "assets/gear/archer/belt/leather_belt.png", stats: {agi: 1}, atk: 0, def: 0, desc: "+1 Ловкость" },
        leather_gloves: { name: "Кожаные Перчатки", type: "gear", slot: "gloves", classes: ['archer'], cost: 5, icon: GITHUB_URL + "assets/gear/archer/gloves/leather_gloves.png", stats: {agi: 1}, atk: 0, def: 0, desc: "+1 Ловкость" },
        iron_belt: { name: "Железный Пояс", type: "gear", slot: "belt", classes: ['warrior'], cost: 6, icon: GITHUB_URL + "assets/gear/warrior/belt/iron_belt.png", stats: {str: 1}, atk: 0, def: 0, desc: "+1 Сила" },
        old_plated_gloves: { name: "Старые Латные Перчатки", type: "gear", slot: "gloves", classes: ['warrior'], cost: 5, icon: GITHUB_URL + "assets/gear/warrior/gloves/old_plated_gloves.png", stats: {str: 1}, atk: 0, def: 0, desc: "+1 Сила" },
        old_belt: { name: "Ветхий Пояс", type: "gear", slot: "belt", classes: ['mage','priest'], cost: 6, icon: GITHUB_URL + "assets/gear/mage/belt/old_belt.png", stats: {int: 1}, atk: 0, def: 0, desc: "+1 Интеллект" },
        old_gloves: { name: "Ветхие Перчатки", type: "gear", slot: "gloves", classes: ['mage','priest'], cost: 5, icon: GITHUB_URL + "assets/gear/mage/gloves/old_gloves.png", stats: {int: 1}, atk: 0, def: 0, desc: "+1 Интеллект" },
        book_heal: { name: "Царский подхил", type: "gear", subtype: "heal", slot: "magic", classes: ['priest'], cost: 25, manaCost: 12, icon: GITHUB_URL + "assets/gear/spells/royal_top_up.png", stats: {}, atk: 0, def: 0, healPct: 50, holy: true, effectId: "royal_heal", desc: "Многоразовый свиток. Лечит 50% максимального HP живой цели (12 MP), главное действие и бросок. Веры не даёт" },
        /* ВОСКРЕШЕНИЕ ЗА ВЕРУ (решение автора 29.09.2026): 25/50/75/100% HP за
           столько же Веры, маны не стоит, раз в день. Правило — в движке. */
        book_revive: { name: "Воскрешение", type: "gear", subtype: "revive", slot: "magic", classes: ['priest'], cost: 0, manaCost: 0, icon: GITHUB_URL + "assets/gear/spells/resurection.png", stats: {}, atk: 0, def: 0, desc: "Поднять павшего с 25/50/75/100% HP за столько же Веры. Раз в день" },
        /* ФОКУСЫ МАГА — мелкие дешёвые заклинания из КНИГИ ФОКУСОВ (решение
           автора 29.09.2026). В слоты не надеваются (slot: 'cantrip'): маг
           берёт их из книги, как жрец молитвы. level — с какого уровня фокус
           в книге. Аркана за фокус меньше, чем за заклинание (движок). */
        trick_spark: { name: "Огненная Стрела", type: "gear", subtype: "attack", slot: "cantrip", cantrip: true, level: 1, classes: ['mage'], cost: 0, manaCost: 5, spellDamage: 3, damageType: 'fire', icon: GITHUB_URL + "assets/gear/spells/fireball.png", stats: {}, atk: 0, def: 0, desc: "Фокус: огненный урон 3+ИНТ (5 MP)" },
        trick_icebolt: { name: "Ледяная Стрела", type: "gear", subtype: "attack", slot: "cantrip", cantrip: true, level: 1, classes: ['mage'], cost: 0, manaCost: 5, spellDamage: 1, freezes: true, icon: GITHUB_URL + "assets/gear/spells/icebolt.png", stats: {}, atk: 0, def: 0, desc: "Фокус: урон 1+ИНТ (5 MP). Обездвиживает до конца ближайшего своего хода. Атаки рядом и стрельба доступны; огонь снимает эффект" },
        hunting_knife: { name: "Охотничий Нож", type: "gear", slot: "offhand", classes: ['all'], cost: 3, icon: GITHUB_URL + "assets/icons/hunt_knife_icon.png", stats: {}, atk: 0, def: 0, desc: "Трофеи. В левой руке с кинжалом — превращает лучника в разбойника" },
        /* ФАКЕЛ СВЕТИТ. Признак isLight искали все трое — клиент, дашборд и
           симулятор, — а в базе его не было ни у одного предмета. Описание
           обещало «+2 атаки в темноте», движок это правило умел, но включить
           его было нечем: игрок покупал факел и не получал ничего. */
        /* ЛЕВАЯ РУКА ОТКРЫТА ВСЕМ, КРОМЕ ЩИТА.

           Правило автора: кинжал, факел и магическую мелочь может взять
           любой герой — надо оно ему или нет, дело его. А щит тяжёлый, и
           носят его только воин с жрецом.

           Кинжал (Левый) и Лягушка раньше стояли по классам и были
           единственными запертыми. Открывать их безопасно: разбойником
           чужой класс от этого не станет — isRogue прямо требует лучника,
           это правило в движке, а не в списке предметов.

           Правая рука остаётся классовой: там оружие, и оно у каждого своё. */
        torch: { name: "Факел", type: "gear", slot: "offhand", classes: ['all'], cost: 2, isLight: true, icon: GITHUB_URL + "assets/gear/offhand/torch.png", stats: {}, atk: 0, def: 0, desc: "+2 Атаки в темноте" },
        rope: { name: "Веревка", type: "quest", classes: ['all'], cost: 2, icon: GITHUB_URL + "assets/icons/rope_icon.png", stats: {}, atk: 0, def: 0, desc: "Спуск в ямы" },
        crowbar: { name: "Лом", type: "quest", classes: ['all'], cost: 2, icon: GITHUB_URL + "assets/items/crowbar.png", stats: {}, atk: 0, def: 0, desc: "Взлом" },
        ship_ticket: { name: "Билет на Корабль", type: "quest", classes: ['all'], cost: 20, icon: GITHUB_URL + "assets/items/ticket.png", stats: {}, atk: 0, def: 0, desc: "Пропуск в Акт 2" },
        potion_hp: { name: "Зелье Жизни", type: "consumable", classes: ['all'], cost: 6, isLoot: true, effect: "heal", val: 10, icon: GITHUB_URL + "assets/gear/poison/small_health.png", stats: {}, atk: 0, def: 0, desc: "Восст. 10 HP" },
        potion_mp: { name: "Зелье Маны", type: "consumable", classes: ['all'], cost: 6, isLoot: true, effect: "mana", val: 10, icon: GITHUB_URL + "assets/gear/poison/small_mana.png", stats: {}, atk: 0, def: 0, desc: "Восст. 10 MP" },
        dragon_egg_tincture: { name: "Настойка из яиц Дракона", type: "consumable", classes: ['all'], cost: 3, isLoot: true, effect: "booze", mood: 5, drunkSteps: 1, icon: GITHUB_URL + "assets/icons/dragon_egg_liqueu.png", stats: {}, atk: 0, def: 0, desc: "С запахом настоящих яиц. +20% опьянения, +5 Настроения барду" },
        rat_tail: { name: "Хвост Пацюка", type: "quest", classes: ['all'], cost: 2, isLoot: true, icon: GITHUB_URL + "assets/icons/rat_tail_icon.png", stats: {}, atk: 0, def: 0, desc: "Трофей (2м)" },
        rat_tail_perfect: { name: "Хвост (ИДЕАЛ)", type: "quest", classes: ['all'], cost: 5, isLoot: true, icon: GITHUB_URL + "assets/icons/rat_tail_icon.png", stats: {}, atk: 0, def: 0, desc: "Трофей (5м)" },
        wolf_ear: { name: "Ухо Волка", type: "quest", classes: ['all'], cost: 2, isLoot: true, icon: GITHUB_URL + "assets/icons/wolf_ear_icon.png", stats: {}, atk: 0, def: 0, desc: "Трофей (2м)" },
        wolf_ear_perfect: { name: "Ухо (ИДЕАЛ)", type: "quest", classes: ['all'], cost: 5, isLoot: true, icon: GITHUB_URL + "assets/icons/wolf_ear_icon.png", stats: {}, atk: 0, def: 0, desc: "Трофей (5м)" },
        rubber_ball: { name: "Резиновый Мяч", type: "quest", classes: ['all'], cost: 0, isLoot: true, icon: GITHUB_URL + "assets/icons/spook_ball.png", stats: {}, atk: 0, def: 0, desc: "Игрушка Мистера Спука" },
        copper_ring_atk: { name: "Медное Кольцо", type: "gear", slot: "ring", classes: ['all'], cost: 10, isLoot: true, icon: GITHUB_URL + "assets/gear/rings/copper_ring.png", stats: {}, atk: 1, def: 0, desc: "+1 Шанс Атаки" },
        copper_amulet_def: { name: "Медное Ожерелье", type: "gear", slot: "amulet", classes: ['all'], cost: 10, isLoot: true, icon: GITHUB_URL + "assets/gear/neck/copper_amulet.png", stats: {critChance: 1}, atk: 0, def: 0, desc: "-1 к порогу крита" },
        green_ring_agi: { name: "Кольцо Зеленый Глаз", type: "gear", slot: "ring", classes: ['all'], cost: 10, isLoot: true, icon: GITHUB_URL + "assets/gear/rings/green_ring_agi.png", stats: {agi: 1}, atk: 0, def: 0, desc: "+1 Ловкость" },
        blue_amulet_int: { name: "Амулет Синяя Слеза", type: "gear", slot: "amulet", classes: ['all'], cost: 10, isLoot: true, icon: GITHUB_URL + "assets/gear/neck/blue_amulet_int.png", stats: {critPower: 0.15}, atk: 0, def: 0, desc: "+0.15 к силе крита" },
        knuckle_ring: { name: "Перстень-Кастет", type: "gear", slot: "ring", classes: ['all'], cost: 10, isLoot: true, icon: GITHUB_URL + "assets/gear/rings/knuckle_ring.png", stats: {str: 1}, atk: 0, def: 0, desc: "+1 Сила" },
        purple_amulet: { name: "Фиолетовый Кулон", type: "gear", slot: "amulet", classes: ['all'], cost: 10, isLoot: true, icon: GITHUB_URL + "assets/gear/neck/purple_amulet.png", stats: {init: 1}, atk: 0, def: 0, desc: "+1 Инициатива" },
        rock: { name: "Камень", type: "junk", classes: [], cost: 0, icon: GITHUB_URL + "assets/items/rock.png", stats: {}, atk: 0, def: 0, desc: "Бесполезно" },
        provision: { name: "Припасы", type: "consumable", classes: ['all'], cost: 4, isLoot: true, effect: "provision", icon: GITHUB_URL + "assets/icons/supplies.png", stats: {}, atk: 0, def: 0, desc: "Порция еды на привал" },
        relic_spook: { name: "Мистер Спук", type: "gear", slot: "relic", classes: ['all'], cost: 0, cooldownDays: 7, companion: 'spook', icon: GITHUB_URL + "assets/gear/relic/relic_spook.png", stats: {}, atk: 0, def: 0, desc: "Зовёт Спука на один бой. Перезарядка 7 игровых дней. Выдаёт ведущий" }
    };


/* Built from baza/data-enemies.js */
// ═══════════════════════════════════════════════════════════
// БАЗА ДАННЫХ: ВРАГИ
// ═══════════════════════════════════════════════════════════
// Подключается дашбордом через <script> ДО основного кода.
// Использует глобальный GITHUB_URL (объявлен в baza/assets.js — подключать после него).
// Каждый враг: id: { name, hp, maxHP, atk, init, human, img, icon }
// potionHeal — сколько HP лечит зелье этого врага (число задаёт автор в
//   редакторе баланса). Нет числа — зелье не лечит. Сколько зелий у врага в
//   бою — поле potions у сложности сцены в data-chapters.js.
// ═══════════════════════════════════════════════════════════
// БАЛАНС (пересчёт под партию 4): HP и атаки боссов снижены,
// чтобы Глава 1 была проходимой. Сложность регулируется
// составом врагов в data-chapters.js (easy/normal/hard).
//   Крыса        12->11
//   Король крыс   38->34, atk 5->4
//   Волк          18->16
//   Лютоволк      50->42, atk 6->5
//   Бандит        28->22
//   Лучник        20->17, atk 5->4
//   Главарь       76->55, atk 7->5
// ═══════════════════════════════════════════════════════════

    window.enemiesDB = {
        fat_rat: { name: "Нажористый Пацюк", hp: 11, maxHP: 11, atk: 3, init: 0, human: false, img: GITHUB_URL + "assets/enemy/fat_rat.png", icon: GITHUB_URL + "assets/icons/fat_rat_icon.png" },
        rat_king: { name: "Царский Пацюк", hp: 34, maxHP: 34, atk: 4, init: 1, human: false, isUnique: true, img: GITHUB_URL + "assets/enemy/rat_king.png", icon: GITHUB_URL + "assets/icons/rat_king_icon.png" },
        wild_wolf: { name: "Дикий Волк", hp: 16, maxHP: 16, atk: 4, init: 3, human: false, img: GITHUB_URL + "assets/enemy/wolf.png", icon: GITHUB_URL + "assets/icons/wolf_icon.png" },
        direwolf: { name: "Лютоволк", hp: 42, maxHP: 42, atk: 5, init: 4, human: false, isUnique: true, img: GITHUB_URL + "assets/enemy/alfa_wolf.png", icon: GITHUB_URL + "assets/icons/alfawolf_icon.png" },
        bandit: { name: "Бандит", hp: 22, maxHP: 22, atk: 4, init: 1, human: true, img: GITHUB_URL + "assets/enemy/bandit.png", icon: GITHUB_URL + "assets/icons/bandit_icon.png" },
        bandit_archer: { name: "Лучник Бандитов", hp: 17, maxHP: 17, atk: 4, init: 2, human: true, isRanged: true, img: GITHUB_URL + "assets/enemy/bandit_archer.png", icon: GITHUB_URL + "assets/icons/archer_bandit_icon.png" },
        bandit_leader: { name: "Главарь", hp: 55, maxHP: 55, atk: 5, init: 3, human: true, isUnique: true, img: GITHUB_URL + "assets/enemy/bandit_boss.png", icon: GITHUB_URL + "assets/icons/bossbandit_icon.png" }
    };

    /* ═══════════════════════════════════════════════════════════════════
       СПОСОБНОСТИ ВРАГОВ — для брифинга Ведущего.

       Правила живут в combat-rules.js, здесь только ОПИСАНИЕ: что, когда
       и как выглядит. Дашборд показывает это при выборе боевой сцены,
       чтобы мастер знал, чего ждать, и сам решал, говорить игрокам или нет.
       ═══════════════════════════════════════════════════════════════════ */
    window.enemySkillsDB = {
        wild_wolf: [{
            name: 'Мораль стаи', icon: GITHUB_URL + 'assets/icons/wolf_icon.png',
            when: 'после гибели вожака либо когда остался последним врагом',
            what: 'Каждый обычный волк проверяет 50% побега. Оставшиеся повторяют проверку в каждом новом раунде.',
            note: 'Без погибшего вожака проверяет только последний обычный волк. Переброс инициативы и переподключение не дают дополнительную попытку. Контроль, запрещающий движение, откладывает проверку до возможности двигаться.'
        }, {
            name: 'Глубокая рана', icon: GITHUB_URL + 'assets/gear/spells/deep_wound.png',
            when: '10% после попадания с положительным итоговым уроном',
            what: '1 HP в начале трёх следующих собственных ходов героя.',
            note: 'Повторный успех обновляет срок до трёх ходов, урон не складывается. Магическое лечение HP и лечебное зелье снимают рану; Второе дыхание не снимает. Конец боя отменяет оставшиеся тики.'
        }],
        /* Правила боссов — в общем движке; устрашение требует отдельного воя. */
        bandit_leader: [{
            name: 'Гигант',
            icon: GITHUB_URL + 'assets/icons/bossbandit_icon.png',
            when: 'весь бой, пока жив',
            what: 'Главарю +1 к броску защиты.',
            note: 'Постоянная аура, отдельного хода не тратит.'
        }, {
            name: 'Клич главаря',
            icon: GITHUB_URL + 'assets/gear/spells/banditos_fury.png',
            when: 'с 5-го раунда, один раз за бой',
            what: 'Всем живым врагам на поле, включая себя: +2 к броску атаки и защиты на 2 их хода.',
            note: 'Мёртвый главарь не кричит — успеете снять его раньше, клича не будет.'
        }],
        direwolf: [{
            name: 'Глубокая рана', icon: GITHUB_URL + 'assets/gear/spells/deep_wound.png',
            when: '10% после попадания с положительным итоговым уроном',
            what: '1 HP в начале трёх следующих собственных ходов героя.',
            note: 'Повторный успех обновляет срок до трёх ходов, урон не складывается. Снимается магическим лечением HP, лечебным зельем или концом боя; Второе дыхание сохраняет рану.'
        }, {
            name: 'Вой альфы',
            icon: GITHUB_URL + 'assets/gear/spells/wolf_howl.png',
            when: 'предупреждение на 3-м раунде, вой на 5-м, один раз за бой',
            what: 'Лечит только живых волков и Лютоволков, включая себя: 20% от МАКСИМАЛЬНОГО здоровья, округление вверх.',
            note: 'Между предупреждением и воем два раунда — успеть добить или развести урон.'
        }, {
            name: 'Аура устрашения',
            icon: GITHUB_URL + 'assets/icons/alfawolf_icon.png',
            when: 'с 3-го собственного хода, один раз за бой вместо атаки',
            what: 'Каждому герою −1 к броску атаки.',
            note: 'До смерти источника или конца боя. Стан, Адский флекс и Бодрящий фон временно подавляют штраф; обморожение не подавляет. Запрещающий действие контроль откладывает вой до разрешённого хода.'
        }],
        rat_king: [{
            name: 'Гнойная рана', icon: GITHUB_URL + 'assets/gear/spells/infected_wound.png',
            when: '15% после попадания с положительным итоговым уроном; не чаще одного заражения на героя за бой',
            what: 'По 1 HP в начале пяти следующих собственных ходов. В конце — проверка болезни: воин 25%, остальные 50%.',
            note: 'Конец боя отменяет оставшиеся тики и сразу проверяет болезнь. Болезнь: −10% максимума HP на три игровых дня; обычный хил не снимает заражение или болезнь. Воскрешение очищает их без проверки болезни.'
        }, {
            name: 'Король',
            icon: GITHUB_URL + 'assets/icons/rat_king_icon.png',
            when: 'весь бой, пока жив',
            what: 'Царскому Пацюку +1 к броску атаки.',
            note: 'Постоянная аура, отдельного хода не тратит.'
        }]
    };

    /* Способности врага для брифинга. Нет — пустой список, а не падение. */
    window.enemySkills = function (key) {
        return (window.enemySkillsDB && window.enemySkillsDB[key]) || [];
    };


/* Built from baza/data-chapters.js */
// ═══════════════════════════════════════════════════════════
// БАЗА ДАННЫХ: ГЛАВЫ, СЦЕНЫ И РАЗВИЛКИ
// ═══════════════════════════════════════════════════════════
// Подключается ДО основного кода. Пути строит от GITHUB_URL (baza/assets.js).
//
// ГЛАВНОЕ ПРАВИЛО: ветвление живёт ЗДЕСЬ, а не в коде. Добавить главу или
// переставить развилку можно, не трогая дашборд. Иначе сюжет размажется по
// трём файлам ровно так же, как когда-то размазались правила боя.
//
// Поля сцены:
//   id        — ключ, по нему идут связи
//   name      — как видит мастер
//   kind      — тип: 'story' рассказ, 'battle' бой, 'shop' торговля,
//               'rest' отдых, 'bank' банк. Определяет значок:
//               боевые — мечи, торговля и банк — монета
//   img       — фон дашборду (статика)
//   stream_file — фон зрителям (может быть видео)
//   configs   — враги по сложности. Есть configs — сцена боевая
//   next[]    — куда можно пойти дальше: { to, label }
//               Несколько вариантов = РАЗВИЛКА, мастер выбирает по решению
//               игроков. Пусто = конец ветки
//   gm_text   — подсказка мастеру: что происходит и на что смотреть
//
// Поле главы shops — лавки, которые есть в этой главе (ключи из
// data-shops.js). Ведущий выбирает из них в меню магазина.
// Поле главы bank — банк главы { name, art }: его картинка встаёт на стрим,
// пока у Ведущего открыт банк.
// Поле сложности боя potions — зелья врагов в ЭТОМ бою на ЭТОЙ сложности:
// { rat_king: 2 } — сколько раз автор нажал «+зелье» в редакторе баланса.
// Раздаются по одному на врага вида по кругу; сколько лечит — potionHeal
// у врага в data-enemies.js. Пьёт ниже 25% HP и бьёт тем же ходом.
// ═══════════════════════════════════════════════════════════
// БАЛАНС (под партию 4):
//   easy   — справится любой (дети), максимум 1 зелье
//   normal — челлендж: нужны магия, хилки, 1-2 ночёвки
//   hard   — думать над каждым ходом (задроты), ~80%+ побед
//            только при сне перед боем, идеальном свежевании
//            и обмене хилками.
// ═══════════════════════════════════════════════════════════

    window.chaptersDB = {
        'chapter1': {
            name: "Глава 1: Старый Гривенсбург",
            start: 'sc_intro',
            shops: ['shater'],
            bank: { name: "🏦 Банк Гривенсбурга", art: 'assets/chapters/chapter_1/bank.jpg' },
            scenarios: [

                // ── ЗАВЯЗКА ────────────────────────────────────────────
                { id: 'sc_intro', name: "Интро", kind: 'story',
                  img: 'assets/chapters/chapter_1/intro.jpg',
                  stream_file: 'assets/chapters/chapter_1/intro.jpg',
                  gm_text: "Похищена принцесса Шкурлета. Король обещает награду, авантюристы стягиваются в столицу — Старый Гривенсбург. Вести как пересказ мультфильма, с обращением к игрокам.",
                  next: [{ to: 'sc_first_town', label: 'Прибытие в портовый город' }] },

                { id: 'sc_first_town', name: "1. Портовый город", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_1_first_town.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_1_first_town.jpg',
                  gm_text: "Панорама города. Только герои собрались идти — на них нападают.",
                  next: [{ to: 'sc_robbery', label: 'На нас напали' }] },

                { id: 'sc_robbery', name: "2. Ограбление", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_2_first_banditos.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_2_first_banditos.jpg',
                  gm_text: "Бандиты отбирают снаряжение и деньги. Осталось 10 монет, спрятанных в трусах. ЭТО ОБЪЯСНЕНИЕ стартовой бедности, боя здесь нет. Те же бандиты всплывут в финале у Графа — снаряжение вернётся.",
                  next: [{ to: 'sc_dragons_eggs', label: 'Идём дальше по городу' }] },

                { id: 'sc_dragons_eggs', name: "3. Драконьи яйца", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_3_dragons_egs.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_3_dragons_egs.jpg',
                  gm_text: "Проходная сцена по дороге к порту.",
                  next: [{ to: 'sc_pirat_k', label: 'К капитану' }] },

                { id: 'sc_pirat_k', name: "4. Капитан Адрестанец", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_4_pirat_K.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_4_pirat_K.jpg',
                  gm_text: "Судно «Адрестия». Билет 30 монет с человека. Отплывёт, только когда наберётся вся партия. Нагнать драмы: вторая глава будет в море и связана с ним.",
                  next: [{ to: 'sc_taverna', label: 'Расстроенные идём в таверну' }] },

                { id: 'sc_taverna', name: "5. Таверна снаружи", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_5_taverna.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_5_taverna.jpg',
                  next: [{ to: 'sc_bar', label: 'Заходим внутрь' }] },

                { id: 'sc_bar', name: "6. Знакомство в баре", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_6_bar.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_6_bar.jpg',
                  gm_text: "ЗДЕСЬ игроки знакомятся: кто они, откуда. Обсуждаем цену билета и решаем идти вместе.",
                  next: [{ to: 'sc_friendship', label: 'Выходим полные авантюризма' }] },

                { id: 'sc_friendship', name: "7. Начало дружбы", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_9_start_friendship.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_9_start_friendship.jpg',
                  next: [{ to: 'sc_desk', label: 'К доске объявлений' }] },

                // ── РАЗВИЛКА 1: доска объявлений ───────────────────────
                { id: 'sc_desk', name: "8. Доска объявлений ⭐РАЗВИЛКА", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_7_desk.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_7_desk.jpg',
                  gm_text: "ТРИ ЗАКАЗА: гигантские крысы (просто), волки в лесу (опасно), пропавшая жена Графа Рафаэля (награда 20 монет). Пройти надо всё — это порядок, а не выбор навсегда. Логично начать с крыс.",
                  next: [
                      { to: 'sc_shaterochka', label: '🐀 Крысы — сначала за снаряжением' },
                      { to: 'sc_graf_rafael', label: '👰 К Графу за пропавшей женой' },
                      { to: 'sc_dark_wood',   label: '🐺 Сразу в лес к волкам' },
                      { to: 'sc_bank',        label: '🏦 Заглянуть в банк' }
                  ] },

                /* БАНК — заведение, как лавка, таверна и церковь (картинка
                   автора). Сама сцена — фон; класть и снимать игроки могут,
                   пока Ведущий открыл меню банка (кнопка 🏦 БАНК). */
                { id: 'sc_bank', name: "8б. Банк Гривенсбурга 🪙", kind: 'bank',
                  img: 'assets/chapters/chapter_1/bank.jpg',
                  stream_file: 'assets/chapters/chapter_1/bank.jpg',
                  gm_text: "Банк: вклад 14% в неделю, начисляется целыми неделями. Счета общий и личные. Откройте меню банка кнопкой 🏦 БАНК — картинка встанет на стрим сама, и игроки смогут класть и снимать со своих телефонов. Общак ↔ банк двигаете вы.",
                  next: [{ to: 'sc_desk', label: '↩ Снова к доске объявлений' }] },

                { id: 'sc_shaterochka', name: "9. ШатерОчка 🪙", kind: 'shop',
                  img: 'assets/chapters/chapter_1/scene_8_shaterochka.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_8_shaterochka.jpg',
                  gm_text: "Кот-торговец в полукостюме-полуплатье. «Лучшее оружие до самого Гривенсбурга!» ЗДЕСЬ покупают снаряжение. Подсказать про факел (бонус в темноте), верёвку (пригодится) и нож для трофеев.",
                  next: [{ to: 'sc_guards', label: 'К стражникам за дорогой' }] },

                // ── ВЕТКА КРЫС ────────────────────────────────────────
                { id: 'sc_guards', name: "10. Стражники", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_10_guards.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_10_guards.jpg',
                  gm_text: "Смеются: «Никто этот заказ не берёт — там грязно и воняет. А вы полезете?»",
                  next: [{ to: 'sc_tunnel', label: 'Лезем в канализацию' }] },

                { id: 'sc_tunnel', name: "11. Тоннель", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_11_tunel.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_11_tunel.jpg',
                  isDark: true,
                  gm_text: "Описать вонь: помои затекают за край обуви, шлёпает на пятке. ПОДСКАЗКА ЗАКАДРОВЫМ ГОЛОСОМ: у кого факел — бонус к атаке в темноте.",
                  next: [{ to: 'sc1_rats', label: 'Слышим писк' }] },

                { id: 'sc1_rats', name: "12. Крысиный патруль", kind: 'battle',
                  img: 'assets/chapters/chapter_1/battle_sewerage_dh.jpg',
                  stream_file: 'assets/streamer/chapter_1/fights/rats_fight.mp4',
                  stream_still: 'assets/chapters/chapter_1/scene_12_battle_sewerage_16_9.jpg',
                  isDark: true,
                  gm_text: "Первый бой, лёгкий. Последний пацюк убегает — за ним слышно рычание.",
                  configs: {
                      easy: { xp: 30, enemies: ['fat_rat', 'fat_rat'] },
                      normal: { hpMult: 1.6198, xp: 80, enemies: ['fat_rat', 'fat_rat', 'fat_rat', 'fat_rat', 'fat_rat'] },
                      hard: { hpMult: 1.7, xp: 125, enemies: ['fat_rat', 'fat_rat', 'fat_rat', 'fat_rat', 'fat_rat', 'fat_rat'] }
                  },
                  next: [
                      { to: 'sc2_king',   label: '➡ Идём за ним дальше' },
                      { to: 'sc_rest_tavern', label: '🛏 Отступить и выспаться' }
                  ] },

                { id: 'sc2_king', name: "13. Король Нечистот", kind: 'battle',
                  img: 'assets/chapters/chapter_1/battle_sewerage_boss_dh.jpg',
                  stream_file: 'assets/streamer/chapter_1/fights/King_rat.mp4',
                  stream_still: 'assets/chapters/chapter_1/scene_13_battle_sewerage_boss_16_9.jpg',
                  isDark: true,
                  gm_text: "Тронный зал из мусора, старый стул вместо трона. ПОСЛЕ БОЯ: в мусоре годные вещи (лут). У кого нож — мини-игра на трофей, хвост пацюка.",
                  configs: {
                      easy: { xp: 45, enemies: ['rat_king'] },
                      normal: { atkMult: 1.15, hpMult: 1.95, xp: 115, enemies: ['rat_king', 'fat_rat', 'fat_rat'] },
                      hard: { hpMult: 1.215, xp: 175, enemies: ['rat_king', 'fat_rat', 'fat_rat', 'fat_rat', 'fat_rat', 'fat_rat'] }
                  },
                  next: [{ to: 'sc_first_reward', label: 'Выходим наверх' }] },

                { id: 'sc_first_reward', name: "14. Первая награда", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_14_first_reward.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_14_first_reward.jpg',
                  gm_text: "Стражники ржут ещё громче: «Идите помойтесь, иначе с вами никто говорить не станет». Держите 15 монет. НОВАЯ МЕХАНИКА: таверна — сон, мытьё, восстановление сил и маны за 2 золотых.",
                  next: [{ to: 'sc_rest_tavern', label: '🛏 Ночуем в таверне' }] },

                { id: 'sc_rest_tavern', name: "15. Ночёвка 🪙", kind: 'rest',
                  img: 'assets/chapters/chapter_1/scene_6_bar.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_6_bar.jpg',
                  gm_text: "2 золотых с человека. Восстанавливает HP и ману, снимает опьянение целиком. Кто лёг на 60% и выше (бард — на 80%), утром получает Бадун на первый бой. Наступает новый день.",
                  next: [{ to: 'sc_shop_pedlar', label: 'Утром к тележке торговца' }] },

                /* ВТОРАЯ ЛАВКА. До неё магазин в главе был ОДИН — сцена 9,
                   до всех боёв, когда у героев по 10 монет в трусах. Хватало
                   ровно на оружие, а остальные шестьдесят монет за главу
                   тратить было негде: следующая возможность купить что-либо
                   не наступала до самого корабля.
                   Здесь на руках уже около 26: пора одеваться. */
                { id: 'sc_shop_pedlar', name: "15б. Кот с тележкой 🪙", kind: 'shop',
                  img: 'assets/chapters/chapter_1/scene_8_shaterochka.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_8_shaterochka.jpg',
                  gm_text: "Тот самый кот-торговец приехал в город с тележкой. ЗДЕСЬ ВТОРАЯ ЗАКУПКА: после Короля Нечистот на руках уже около 26 монет. Самое время на одежду — шлем, пояс, перчатки. Напомнить, что в лесу темно и зелья лишними не будут.",
                  next: [{ to: 'sc_desk', label: '↩ Снова к доске объявлений' }] },

                // ── ВЕТКА ГРАФА ───────────────────────────────────────
                { id: 'sc_graf_rafael', name: "16. Граф Рафаэль", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_15_graf_rafael.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_15_graf_rafael.jpg',
                  gm_text: "Пожилой, полулысый, бородавки, неприятный. За спиной ухоженная осёдланная бурёнка. Дом в упадке. Говорит: жена ушла в лес в красном платье и шапочке и не вернулась. Награда за квест — 20 монет, ОЗВУЧИТЬ СРАЗУ.",
                  next: [{ to: 'sc_dark_wood', label: 'Идём в лес искать' }] },

                { id: 'sc_dark_wood', name: "17. Тёмный лес", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_16_dark_wood.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_16_dark_wood.jpg',
                  isDark: true,
                  gm_text: "Плутали до вечера. У старого охотничьего домика стая волков грызёт что-то в красном.",
                  next: [{ to: 'sc3_wolves', label: 'Нападаем' }] },

                { id: 'sc3_wolves', name: "18. Павшие в лесу", kind: 'battle',
                  img: 'assets/chapters/chapter_1/battle_dark_forrest_dh.jpg',
                  stream_file: 'assets/streamer/chapter_1/fights/forest_fight.mp4',
                  stream_still: 'assets/chapters/chapter_1/scene_17_battle_dark_forrest_16_9.jpg',
                  isDark: true,
                  gm_text: "КОММЕНТАРИИ В БОЙ: смеркается, волки сливаются с лесом — хорошо тому, кто взял факел. КОГДА ОСТАЁТСЯ ОДИН волк, он воет и зовёт подмогу во главе с лютоволком.",
                  configs: {
                      easy: { xp: 45, enemies: ['wild_wolf', 'wild_wolf', 'wild_wolf'] },
                      normal: { atkMult: 1.425, hpMult: 1.71, xp: 115, enemies: ['wild_wolf', 'wild_wolf', 'wild_wolf', 'wild_wolf'] },
                      hard: { atkMult: 1.575, hpMult: 1.125, xp: 175, enemies: ['wild_wolf', 'wild_wolf', 'wild_wolf', 'wild_wolf', 'wild_wolf'] }
                  },
                  next: [{ to: 'sc4_alpha', label: 'На вой прибегает лютоволк' }] },

                { id: 'sc4_alpha', name: "19. Альфа-Хищник", kind: 'battle',
                  img: 'assets/chapters/chapter_1/battle_dark_forrest_dh.jpg',
                  stream_file: 'assets/streamer/chapter_1/fights/forest_fight.mp4',
                  stream_still: 'assets/chapters/chapter_1/scene_18_battle_dark_forrest_16_9.jpg',
                  isDark: true,
                  gm_text: "Огромный серый волк с седой гривой и синим светом из глаз. ВО РТУ ЧТО-ТО ЦВЕТНОЕ — это мячик Спука. Самый сложный бой главы. ПОСЛЕ: трофей ухо волка, а внутри туши — вещи съеденных воинов, кольца и амулеты.",
                  configs: {
                      easy: { xp: 55, enemies: ['direwolf', 'wild_wolf'] },
                      normal: { atkMult: 1.33, xp: 145, enemies: ['direwolf', 'wild_wolf', 'wild_wolf', 'wild_wolf', 'wild_wolf'] },
                      hard: { atkMult: 1.37, hpMult: 1.22, xp: 225, enemies: ['direwolf', 'wild_wolf', 'wild_wolf', 'wild_wolf', 'wild_wolf'] }
                  },
                  next: [{ to: 'sc_second_reward', label: 'Осматриваем труп в красном' }] },

                { id: 'sc_second_reward', name: "20. Вторая награда", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_19_second_reward.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_19_second_reward.jpg',
                  gm_text: "Труп оказался СКЕЛЕТОМ лет пятидесяти: натянуто красное платье, в кости напихано мясо в тряпках. Умные поймут — их послали в ловушку. Дать игрокам подумать.",
                  next: [
                      { to: 'sc_relic_ball', label: '🎾 Нашли яркий мячик' },
                      { to: 'sc_back_to_graf', label: '↩ Утром идём к Графу' }
                  ] },

                // ── ЛИНИЯ СПУКА ───────────────────────────────────────
                { id: 'sc_relic_ball', name: "21. Мячик 🎾", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_22_frist_relic.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_22_frist_relic.jpg',
                  gm_text: "Реликвия. Тёмная фигура в капюшоне стоит на КАЖДОЙ городской картинке в тени — если игроки заметят и подойдут, начнётся линия Спука.",
                  next: [{ to: 'sc_who_are_you', label: 'Подходим к фигуре в капюшоне' }] },

                { id: 'sc_who_are_you', name: "22. Кто вы, мистер?", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_20_whoyou_are_mister_spook.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_20_whoyou_are_mister_spook.jpg',
                  gm_text: "«Это неважно. Я ходил по лесу и потерял очень важную вещь». Если мячик уже найден — отдают сразу; если нет, он сам спросит потом.",
                  next: [{ to: 'sc_mister_spook', label: 'Отдаём мячик' }] },

                { id: 'sc_mister_spook', name: "23. Мистер Спук 🤝", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_21_mister_spook.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_21_mister_spook.jpg',
                  gm_text: "Снимает капюшон — зверолюд корги. Мячик от любимого хозяина, которого он пережил: зверолюди живут дольше людей. Заигрался в лесу, услышал волков и убежал. ОТКРЫВАЕТ НАЁМНИКА: реликвия зовёт Спука в бой раз в 7 дней.",
                  next: [{ to: 'sc_back_to_graf', label: '↩ К Графу' }] },

                // ── ДВОР ГРАФА: РАЗВИЛКА 2 ────────────────────────────
                { id: 'sc_back_to_graf', name: "24. Снова к Графу", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_23_back_to_graf.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_23_back_to_graf.jpg',
                  gm_text: "Растерянный Граф делает вид, что не понимает, о чём речь, и выпихивает на улицу.",
                  next: [{ to: 'sc_shop_graf', label: 'У ворот стоит знакомая тележка' }] },

                /* ТРЕТЬЯ ЛАВКА — последняя перед финальным боем. На руках уже
                   около 57 монет: пора доодеться и взять заклинание.
                   ЗДЕСЬ РАЗВИЛКА КОШЕЛЬКА: маг и жрец берут магию за 25 и
                   остаются полуодетыми, остальные добирают броню. Так и
                   задумано — на билет 30 монет хватит всем, но у мага с
                   жрецом не останется на грудь и ноги. */
                { id: 'sc_shop_graf', name: "24б. Тележка у ворот 🪙", kind: 'shop',
                  img: 'assets/chapters/chapter_1/scene_8_shaterochka.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_8_shaterochka.jpg',
                  gm_text: "Кот-торговец успел раньше вас и торгует прямо у ворот поместья. ПОСЛЕДНЯЯ ЗАКУПКА ПЕРЕД ФИНАЛОМ: на руках около 57 монет. Магу и жрецу пора брать заклинание за 25 — тогда на броню им уже не хватит, и это нормально. Предупредить, что билет на корабль стоит 30 с человека: спускать всё до монеты не стоит.",
                  next: [{ to: 'sc_backyard', label: 'Выходим во двор' }] },

                { id: 'sc_backyard', name: "25. Двор ⭐РАЗВИЛКА", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_24_backyard.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_24_backyard.jpg',
                  gm_text: "Во дворе пахнет падалью. ЖДАТЬ, предложат ли игроки осмотреться сами. ТРИ МЕСТА: теплица, амбар, колодец. ⚠ ТОЛЬКО ДВЕ ПОПЫТКИ В ДЕНЬ — на третью мастер отправляет спать. Правильный ответ — колодец.",
                  next: [
                      { to: 'sc_veranda', label: '🌱 Теплица (пусто)' },
                      { to: 'sc_barn',    label: '🏚 Амбар (пусто)' },
                      { to: 'sc_well',    label: '🕳 Колодец (ВЕРНО)' }
                  ] },

                { id: 'sc_veranda', name: "26. Теплица", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_25_veranda.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_25_veranda.jpg',
                  gm_text: "Полдня впустую: Граф залил отраву, передохли кроты и всё живое. Сам пытался в садоводы.",
                  next: [{ to: 'sc_backyard', label: '↩ Обратно во двор' }] },

                { id: 'sc_barn', name: "27. Амбар", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_26_barn.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_26_barn.jpg',
                  gm_text: "Полдня впустую: забрела старая собака и умерла. Вот и вся падаль.",
                  next: [{ to: 'sc_backyard', label: '↩ Обратно во двор' }] },

                { id: 'sc_well', name: "28. Колодец", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_27_well.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_27_well.jpg',
                  gm_text: "Кто-то должен спуститься. ЕСТЬ ВЕРЁВКА — спускается легко (можно сбегать купить, ещё не поздно). НЕТ — прыгает и кидает кубик: 10+ норм, меньше — подворачивает ногу, −3 HP на следующий бой. Внизу труп молодой девушки и ровно 5 монет — верёвка окупилась.",
                  next: [{ to: 'sc_surprise', label: 'Поднимаем тело' }] },

                // ── ФИНАЛ: РАЗВИЛКА 3 ─────────────────────────────────
                { id: 'sc_surprise', name: "29. Сюрприз ⭐РАЗВИЛКА", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_28_surprise.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_28_surprise.jpg',
                  gm_text: "Возвращаемся к Графу с находкой. «Ребята, давайте договоримся — по 25 монет каждому». Награда за квест была 20. ГЛАВНЫЙ ВЫБОР ГЛАВЫ.",
                  next: [
                      { to: 'sc_bribe',   label: '💰 Берём взятку и молчим' },
                      { to: 'sc_threats', label: '⚔ Сдаём Графа страже' }
                  ] },

                { id: 'sc_bribe', name: "30. Взятка", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_33_bribe.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_33_bribe.jpg',
                  gm_text: "Взяли по 25 и сказали страже, что её сгрызли волки. За информацию ещё по 5. Квест вышел в ноль. Боя с бандитами НЕ БУДЕТ — и снаряжение, отобранное в начале, не вернётся.",
                  next: [{ to: 'sc_pirat_final', label: 'К капитану' }] },

                { id: 'sc_threats', name: "31. Угрозы", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_29_threats.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_29_threats.jpg',
                  gm_text: "Граф орёт — из соседней комнаты выходят бандиты во главе с отбитым здоровяком с дубиной. ЭТО ТЕ САМЫЕ, что ограбили партию в начале. Пламенная речь о том, как герои облажались с выбором.",
                  next: [{ to: 'sc5_bandits', label: 'Начинается бой' }] },

                { id: 'sc5_bandits', name: "32. Разборка у Графа", kind: 'battle',
                  img: 'assets/chapters/chapter_1/battle_graff_dh.jpg',
                  stream_file: 'assets/streamer/chapter_1/fights/Graf_fight.mp4',
                  stream_still: 'assets/chapters/chapter_1/scene_30_banditos_fight.jpg',
                  gm_text: "ГЛАВАРЬ КРИЧИТ на 5-м раунде: своим +2 к атаке и защите на 2 хода. ПОСЛЕ БОЯ: лут щедрый — деньги каждому и ВЕРНУВШЕЕСЯ снаряжение, отобранное в начале главы.",
                  configs: {
                      easy: { xp: 75, enemies: ['bandit_leader', 'bandit'] },
                      normal: { atkMult: 1.425, hpMult: 1.0925, xp: 195, enemies: ['bandit_leader', 'bandit', 'bandit_archer', 'bandit_archer', 'bandit_archer', 'bandit_archer'] },
                      hard: { atkMult: 1.5, hpMult: 1.03, xp: 300, enemies: ['bandit_leader', 'bandit', 'bandit', 'bandit_archer', 'bandit_archer', 'bandit'] }
                  },
                  next: [{ to: 'sc_mercy', label: 'Тащим Графа страже' }] },

                { id: 'sc_mercy', name: "33. Пощада", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_31_mercy.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_31_mercy.jpg',
                  next: [{ to: 'sc_arrest', label: 'Сдаём стражникам' }] },

                { id: 'sc_arrest', name: "34. Арест", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_32_arest.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_32_arest.jpg',
                  gm_text: "Убитый главарь оказался в розыске по всей стране — по 10 монет каждому за его голову. Игроки откладывают на билет и докупают снаряжение.",
                  next: [{ to: 'sc_pirat_final', label: 'Утром к капитану' }] },

                { id: 'sc_pirat_final', name: "35. Капитан снова", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_34_pirat_K.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_34_pirat_K.jpg',
                  gm_text: "Трубка, чёрный попугай с красными глазами, тёмная аура. Видит, что герои чистые и похожи на людей. Билет 30 монет. НАГНАТЬ ЗАГАДОЧНОСТИ: вторая глава будет в море и связана с ним.",
                  next: [{ to: 'sc_all_aboard', label: 'Поднимаемся на борт' }] },

                { id: 'sc_all_aboard', name: "36. Все на борт", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_35_all_aboard_the_ship.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_35_all_aboard_the_ship.jpg',
                  next: [{ to: 'sc_sailing', label: 'Отплытие' }] },

                { id: 'sc_sailing', name: "37. Отплытие — КОНЕЦ ГЛАВЫ", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_36_sailing.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_36_sailing.jpg',
                  gm_text: "Конец первой главы. ЗДЕСЬ бросить намёк на большой сюжет — что-то, что аукнется во второй главе.",
                  next: [] }
            ]
        }
    };


/* Built from baza/encounter-balance.js */
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


/* Built from tools/sim-lab.js */
/* ============================================================================
   СЧЁТЧИК БОЯ РЕДАКТОРА БАЛАНСА (Lab)

   Один бой от начала до конца и серия боёв для редактора автора
   (grivensburg-balance-editor.html). Интерфейс редактора зовёт Lab.hero,
   Lab.spawn, Lab.battle и прочее — набор тот же, что был у счётчика внутри
   его файла (версия 0.7), поэтому редактор работает без переделки.

   ОТКУДА ПРАВИЛА. Своих формул здесь нет: каждое число боя — из движка
   (baza/combat-rules.js), а ПОРЯДОК шагов повторяет живую игру — телефон
   (tools/app.js) и дашборд (tools/server2-app.js). Где было расхождение с
   игрой, правда за игрой (сверено 29.09.2026):
     - инициатива бросается КАЖДЫЙ раунд (дашборд, doRollInitiative);
     - защиту от удара бросают только люди и только от удара оружием; зверь
       и заклинание получают весь урон (дашборд, canDefend: !зверь);
     - щит воина — прибавка +6/+3/+2 к СВОЕЙ защите через defenseModifier,
       держится четыре защиты; полный промах врага заряд не тратит,
       собственная атака (включая реакцию) снимает стойку;
     - доп действие ОДНО на раунд: зелье, песня, молитва; выпивка тоже расходует доп действие;
       защищаться можно всегда (решение автора 28.09.2026);
     - молитвы — движка (PRAYERS, planPrayer, prayerBonus): 25 Веры, пять
       раундов, на себя вдвое; одна за раз;
     - воскрешение 25/50/75/100% за столько же Веры, без маны, раз в день;
     - лечение книгой — доля полной банки цели (spellHeal);
     - Аркана: кешбэк за заклинание и фокус, усиление 50/100/«Текущая» —
       только у мага; лечение и другие касты жреца Веры не дают;
     - перехват на подходе: каждый успевший бьёт обычной атакой, попал —
       остановил; разрыв ближнего боя: срыв 50%/75% и удар вслед.

   ПОЛИТИКА — КАК ИГРАЕТ ПАРТИЯ. Это не правила игры, а выдумка счётчика:
   когда пить зелье, кого бить, когда поднимать щит. Её задают ручки
   редактора (cfg) и уровень игры:
     'basic'  — только удары оружием, без навыков и расходников (лёгкая);
     'casual' — все механики, но не идеально: каждое необязательное решение
                принимается с шансом CASUAL_USE (средняя, поправка автора
                29.09.2026 — «не каждый раз и не в лучший момент»);
     'auto'   — все механики, как только есть повод (сложная).

   ГЕНЕРАТОР ПРИХОДИТ СНАРУЖИ — зерном (cfg.seed) или функцией (cfg.rng).
   Ни одного Math.random: иначе бой не повторить.

   Файл — обычный скрипт, без import/export: так он работает и в странице
   редактора, и в его фоновом потоке (Worker), и в node для проверок.
   ============================================================================ */
(function (g) {
'use strict';

var R = g.CombatRules, ITEMS = g.masterItemsDB, ENEMIES = g.enemiesDB;
var n = function (v) { return Number(v) || 0; };
var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

var VERSION = 'FIX14-5p-2026-10-10 · engine-1.6.3';

/* Доля решений, которые партия «средней игры» всё-таки принимает. Политика,
   не правило: автор может сдвинуть, когда посмотрит на замеры. */
var CASUAL_USE = 0.5;

var DAILY_SKILLS = {
    warrior: { secondWindDay: 'Второе дыхание' },
    priest:  { reviveUsedDay: 'Воскрешение' },
    mage:    { meditateUsedDay: 'Медитация' },
    archer:  {},
    bard: { fortuneUsedDay: 'Госпожа Фортуна' }
};

/* Молитвы редактора называются коротко, в движке — полным ключом. */
var PRAYER_KEY = { protection: 'god_protection', wisdom: 'god_wisdom' };
var PRAYERS = {
    protection: { id: 'god_protection', name: R.PRAYERS.god_protection.name, cost: R.PRAYER_COST },
    wisdom:     { id: 'god_wisdom',     name: R.PRAYERS.god_wisdom.name,     cost: R.PRAYER_COST }
};

var slots = ['mainhand', 'offhand', 'head', 'chest', 'gloves', 'belt', 'feet', 'amulet',
             'ring', 'ring2', 'magic1', 'magic2', 'magic3', 'magic4'];
var slotNames = { mainhand: 'Правая рука', offhand: 'Левая рука', head: 'Голова', chest: 'Тело',
    gloves: 'Перчатки', belt: 'Пояс', feet: 'Обувь', amulet: 'Амулет', ring: 'Кольцо 1',
    ring2: 'Кольцо 2', magic1: 'Книга 1', magic2: 'Книга 2', magic3: 'Книга 3 · ур. 5',
    magic4: 'Книга 4 · ур. 10' };

/* Бои главы с составами по сложностям — их и меряет редактор. */
var scenes = g.chaptersDB.chapter1.scenarios.filter(function (x) { return x.configs; });

/* Дни главы: крысы с королём — первый, волки с Альфой — второй, бандиты —
   третий. От дня зависят умения «раз в день». */
function sceneDay(sceneId) {
    var i = scenes.findIndex(function (s) { return s.id === sceneId; });
    return i < 0 ? 1 : i < 2 ? 1 : i < 4 ? 2 : 3;
}

/* Двуручное оружие занимает обе руки — как на телефоне (normalizeSlots):
   исключений нет. */
function offhandAllowed(s) { return !(ITEMS[(s || {}).mainhand] || {}).isTwoHanded; }
function slotFits(it, slot) {
    var type = slot.indexOf('magic') === 0 ? 'magic' : slot === 'ring2' ? 'ring' : slot;
    return it.slot === type || (slot === 'offhand' && it.slot === 'mainhand' && !it.isTwoHanded);
}

function rng(seed) {
    var s = seed | 0;
    return function () {
        s = s + 0x6D2B79F5 | 0;
        var t = Math.imul(s ^ s >>> 15, 1 | s);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

/* Самый сильный фокус мага на этом уровне — из базы вещей (метка cantrip).
   Книга фокусов у мага всегда при себе, в слот её не надевают. */
function bestTrick(level) {
    return Object.keys(ITEMS).filter(function (k) {
        var it = ITEMS[k];
        return it && it.cantrip && (it.classes || []).indexOf('mage') >= 0 && n(it.level || 1) <= level;
    }).sort(function (a, b) { return n(ITEMS[b].spellDamage) - n(ITEMS[a].spellDamage); })[0] || '';
}

/* ── Проверка героя ───────────────────────────────────────────────────── */
function validate(p) {
    if (!R.CLASS_TABLE[p.cls]) throw Error('Неизвестный класс: ' + p.cls);
    if (!Number.isInteger(p.level) || p.level < 1 || p.level > 20) throw Error('Уровень должен быть от 1 до 20.');
    [['potions', 20], ['manaPotions', 20], ['booze', 10], ['drunk', 5], ['power', 100], ['resource', 100]]
        .forEach(function (pair) {
            var v = p[pair[0]];
            if (v != null && (!Number.isInteger(v) || v < 0 || v > pair[1]))
                throw Error('Ресурс ' + pair[0] + ': целое от 0 до ' + pair[1] + '.');
        });
    [['hpShare', .01], ['mpShare', 0]].forEach(function (pair) {
        var v = p[pair[0]];
        if (v != null && (!Number.isFinite(v) || v < pair[1] || v > 1))
            throw Error('Начальная шкала ' + pair[0] + ' выходит за допустимый диапазон.');
    });
    Object.keys(DAILY_SKILLS).forEach(function (c) {
        Object.keys(DAILY_SKILLS[c]).forEach(function (f) {
            if (p[f] != null && (!Number.isInteger(p[f]) || p[f] < 1 || p[f] > 9999))
                throw Error('Неверный день использования умения.');
        });
    });
    var s = p.slots || {};
    Object.keys(s).forEach(function (slot) {
        var key = s[slot];
        if (!key) return;
        var it = ITEMS[key];
        if (!it || slots.indexOf(slot) < 0) throw Error('Неизвестный предмет или слот: ' + key);
        if (!slotFits(it, slot) || !R.canEquip(it, p.cls, slot)) throw Error((p.name || p.cls) + ': недоступен ' + it.name);
        if ((slot === 'magic3' && p.level < 5) || (slot === 'magic4' && p.level < 10)) throw Error('Слот книги ещё закрыт.');
        if (it.subtype === 'revive') throw Error('Воскрешение — умение жреца, в слот его не кладут.');
    });
    if (s.offhand && !offhandAllowed(s)) throw Error('Двуручное оружие занимает обе руки.');
    if(p.position!=null && !['front','back'].includes(p.position))throw Error('Неизвестная позиция жреца');
    if (p.prayerPlan != null && ['both', 'protection', 'wisdom', 'off'].indexOf(p.prayerPlan) < 0)
        throw Error('Неизвестная тактика молитв.');
    return true;
}

/* Старые сохранения: воскрешение и «молитвенник» были предметами — теперь
   это умения жреца. Из слотов их убираем, остальное не трогаем. */
function normalizeHero(p) {
    var out = Object.assign({}, p, { slots: R.legalHeroSlots(p,ITEMS) });
    Object.keys(out.slots).forEach(function (slot) {
        var k = out.slots[slot];
        if (k === 'book_revive' || k === 'prayer_book' || !ITEMS[k]) delete out.slots[slot];
    });
    if (out.slots.offhand && !offhandAllowed(out.slots)) delete out.slots.offhand;
    if (out.cls === 'priest') { out.position=R.getRole(Object.assign({},out,out.slots)); out.protectionTarget = 'self'; out.wisdomTarget = 'self'; }
    return out;
}
/* Поля старых правил (запрет защиты после зелья, молитвы на партию) больше
   ничего не значат — убираем, чтобы подпись условий не зависела от них. */
function normalizeConfig(cfg) {
    var out = Object.assign({}, cfg, { party: (cfg.party || []).map(normalizeHero) });
    delete out.secondaryDefenseRule; delete out.potionDefenseLoss;
    delete out.prayerScope; delete out.prayerVitals;
    return out;
}

/* ── Снаряжение — как на телефоне (collectGear) ───────────────────────── */
function collectGear(heroSlots) {
    var gear = { str: 0, agi: 0, int: 0, cha: 0, atk: 0, def: 0, luck: 0, init: 0, critChance: 0, critPower: 0 };
    var light = false, cost = 0;
    ['mainhand', 'offhand', 'head', 'chest', 'gloves', 'belt', 'feet', 'amulet', 'ring', 'ring2']
        .forEach(function (slot) {
            var it = ITEMS[(heroSlots || {})[slot]];
            if (!it) return;
            var st = it.stats || {};
            ['str', 'agi', 'int', 'cha', 'init', 'luck', 'critChance', 'critPower']
                .forEach(function (k) { gear[k] += n(st[k]); });
            gear.atk += n(it.atk) + n(st.atk);
            gear.def += n(it.def) + n(st.def);
            gear.luck += n(it.luck);
            if (it.isLight) light = true;
        });
    Object.keys(heroSlots || {}).forEach(function (slot) {
        var it = ITEMS[heroSlots[slot]];
        if (it) cost += n(it.cost);
    });
    return { gear: gear, hasLight: light, cost: cost };
}

/* Статы, шкалы и боевые числа с учётом молитвы — как derive() на телефоне:
   интеллект молитвы подмешивается ДО шкал, здоровье — к потолку. */
function refreshStats(h, world) {
    var базоваяHP = R.computeVitals({ cls: h.cls, total: h.baseStats.total }).maxHP;
    var b = R.prayerBonus({ prayer: h.prayer }, world, базоваяHP, n(h.baseStats.total.int));
    var total = b.int ? Object.assign({}, h.baseStats.total, { int: n(h.baseStats.total.int) + b.int })
                      : h.baseStats.total;
    h.stats = Object.assign({}, h.baseStats, { total: total });
    h.vitals = R.computeVitals({ cls: h.cls, total: total });
    h.vitals.maxHP += b.hp;
    h.vitals=R.sicknessVitals(h.vitals,h,world);
    h.maxHP = h.vitals.maxHP;
    h.combat = R.computeCombatValues({ cls: h.cls, level: h.level, total: total, gear: h.gear,
        isRogue: h.isRogue, dualDaggers: R.hasDualDaggers(h.who), isDark: h.isDark, hasLight: h.hasLight });
    /* Заполнение защиты — только при наложении (planPrayerTarget).
       Пересчёт/окончание молитвы лишь ограничивает HP обычным потолком. */
    h.hp = Math.min(h.hp, h.maxHP);
    h.mp = Math.min(h.mp, h.vitals.maxMP);
}

/* ── Герой ────────────────────────────────────────────────────────────── */
function hero(p, isDark, index) {
    p = normalizeHero(p);
    validate(p);
    var cg = collectGear(p.slots || {});
    var who = { cls: p.cls, position:p.position, mainhand: (p.slots || {}).mainhand, offhand: (p.slots || {}).offhand };
    var stats = R.computeStats({ cls: p.cls, level: p.level, race:p.race, raceBonus:p.raceBonus, gearStats: cg.gear });
    var vitals = R.computeVitals({ cls: p.cls, total: stats.total });
    if(p.cls==='priest')who.position=R.getRole(who);
    var rogue = R.isRogue(who);
    var combat = R.computeCombatValues({ cls: p.cls, level: p.level, total: stats.total, gear: cg.gear,
        isRogue: rogue, dualDaggers: R.hasDualDaggers(who), isDark: !!isDark, hasLight: cg.hasLight });
    /* Стартовый ресурс: задан руками — как задан; иначе Настроение утром
       половина шкалы (29.09.2026), Ярость — старт боя по движку. */
    var resource = p.resource == null
        ? (vitals.resourceKind === 'mood' ? R.moodAfterSleep(vitals.maxResource, false)
           : vitals.resourceKind === 'rage' ? R.rageOnBattleStart() : 0)
        : n(p.resource);
    var h = {
        id: p.id || 'h' + (index || 0), name: p.name || R.CLASS_TABLE[p.cls].name, cls: p.cls,
        level: p.level, hpFormulaVersion:R.HP_FORMULA_VERSION, allowPriestRetreat:!!p.allowPriestRetreat, position:p.cls==='priest' ? R.getRole(who) : null, slots: Object.assign({}, p.slots), mercenary: !!p.mercenary, companionKey:p.companionKey || '',
        who: who, stats: stats, baseStats: stats, vitals: vitals, combat: combat,
        role: R.getRole(who), isRogue: rogue, cost: cg.cost, gear: cg.gear,
        hasLight: cg.hasLight, isDark: !!isDark,
        hp: Math.max(1, R.ceilGame(vitals.maxHP * clamp(n(p.hpShare == null ? 1 : p.hpShare), .01, 1))),
        maxHP: vitals.maxHP,
        mp: R.ceilGame(vitals.maxMP * clamp(n(p.mpShare == null ? 1 : p.mpShare), 0, 1)),
        resource: clamp(resource, 0, vitals.maxResource),
        power: clamp(n(p.power), 0, 100),
        potions: clamp(n(p.potions), 0, 20), manaPotions: clamp(n(p.manaPotions), 0, 20),
        booze: clamp(n(p.booze), 0, 10), drunk: clamp(n(p.drunk), 0, 5),
        prayerPlan: p.prayerPlan == null ? 'both' : p.prayerPlan,
        trickAuto: !p.trickKey,
        trickKey: p.cls === 'mage' ? (ITEMS[p.trickKey] && ITEMS[p.trickKey].cantrip
            && (ITEMS[p.trickKey].classes || []).indexOf('mage') >= 0
            && n(ITEMS[p.trickKey].level || 1) <= p.level ? p.trickKey : bestTrick(p.level)) : '',
        prayer: null, song: null, alive: true, turnNo: 0, sickness:p.sickness || false,
        shieldRound: 0, shieldUsedRound: 0, shieldBattleNo: 0, shieldCharges: 0,
        extraActionRound: 0, hangoverAfterBattle: null
    };
    Object.keys(DAILY_SKILLS).forEach(function (c) {
        Object.keys(DAILY_SKILLS[c]).forEach(function (f) { if (p[f] != null) h[f] = p[f]; });
    });
    return h;
}

/* Состояние между отдельными боями. Это не сохранение живого лобби.
   Производные статы пересчитываются из исходной экипировки; конечные HP,
   MP, расходники и дневные отметки передаются без долей и округлений. */
var CARRY_FIELDS = ['hp','mp','power','resource','potions','manaPotions','booze','drunk',
    'position','sickness','hangoverAfterBattle','secondWindDay','reviveUsedDay',
    'meditateUsedDay','sneakHitDay','fortuneUsedDay'];
function continuationHero(h) {
    var out = {id:h.id,cls:h.cls};
    CARRY_FIELDS.forEach(function(k){if(h[k]!=null)out[k]=JSON.parse(JSON.stringify(h[k]));});
    return out;
}
function applyContinuation(h, saved, world, rate) {
    if (!saved || saved.id!==h.id || saved.cls!==h.cls) throw Error('Состав связки изменился между боями.');
    CARRY_FIELDS.forEach(function(k){if(saved[k]!=null)h[k]=JSON.parse(JSON.stringify(saved[k]));});
    Object.assign(h,R.battleResetFacts());
    h.alive=h.hp>0;h.who.position=h.position;h.role=R.getRole(Object.assign({},h,h.slots));
    if (!R.sicknessActive(h,world)) h.sickness=false;
    refreshStats(h,world);
    Object.assign(h,R.planBattleRecovery(h,h.vitals,rate),R.drunkAfterBattle(h));
    if(h.cls==='warrior' && h.alive)h.resource=R.rageOnBattleStart(h.resource,null,world.day,h.vitals.maxResource);
    return h;
}

/* ── Враги ────────────────────────────────────────────────────────────── */
/* Состав боя. Редактор передаёт СВОЙ список (encounter: вид, число, HP,
   урон — уже итоговые за одного врага). Без списка — как расставляет игра:
   planSpawn по числу игроков, усиление buffEnemy и закалка сцены.

   Строка списка может нести и то, что автор правит в бестиарии редактора
   (30.09.2026): имя, инициативу, признаки, сколько лечит зелье (heal), и
   зелья этого боя (potions — сколько нажато «+зелье»). Чего в строке нет —
   берётся из базы врагов игры. Нового врага, которого в игре ещё нет,
   строка описывает целиком.

   Зелья раздаются по одному на врага вида по кругу — тем же правилом
   движка, что и в живой игре (distributeEnemyPotions). */
function spawn(cfg) {
    var scene = scenes.find(function (s) { return s.id === cfg.sceneId; });
    if (!scene) throw Error('Неизвестное поле боя.');
    var spec = scene.configs[cfg.difficulty];
    if (!spec) throw Error('Неизвестная сложность.');
    var players = (cfg.party || []).filter(function (p) { return !p.mercenary; }).length;
    if (!players) throw Error('Нужен хотя бы один игрок.');
    var make = function (src, key, i, hp, atk) {
        return { id: 'e' + i, key: key, name: src.name + ' ' + (i + 1), hp: hp, maxHP: hp, atk: atk,
                 init: n(src.init), human: src.human !== false, isRanged: !!src.isRanged,
                 isUnique: !!src.isUnique, role: src.isRanged ? 'back' : 'front',
                 potionHeal: Math.max(0, R.ceilGame(n(src.potionHeal))), potions: 0,
                 alive: true, turnNo: 0, aggroTargetId: null };
    };
    /* Зелья по составу: сколько на вид — поровну по кругу, правило движка. */
    var givePotions = function (list, potions) {
        R.distributeEnemyPotions(list.map(function (e) { return e.key; }), potions)
            .forEach(function (p, i) { list[i].potions = p; });
        return list;
    };
    if (cfg.encounter) {
        var list = [], seen = {}, potions = {};
        cfg.encounter.forEach(function (row) {
            var src = ENEMIES[row.key] || {};
            /* Поля строки поверх базы игры. */
            var info = {
                name: row.name != null ? row.name : src.name,
                init: row.init != null ? row.init : src.init,
                human: row.human != null ? row.human : src.human,
                isRanged: row.isRanged != null ? row.isRanged : src.isRanged,
                isUnique: row.isUnique != null ? row.isUnique : src.isUnique,
                potionHeal: row.heal != null ? row.heal : src.potionHeal
            };
            if (typeof info.name !== 'string' || !info.name || info.name.length > 60
                || !Number.isInteger(row.count) || row.count < 0 || row.count > 20
                || !Number.isInteger(row.hp) || row.hp < 1 || !Number.isInteger(row.atk) || row.atk < 0
                || !Number.isInteger(n(info.init)) || n(info.init) < -10 || n(info.init) > 20
                || (row.potions != null && (!Number.isInteger(row.potions) || row.potions < 0 || row.potions > 20))
                || (row.heal != null && (!Number.isInteger(row.heal) || row.heal < 0 || row.heal > 5000)))
                throw Error('Неверная строка врагов: ' + row.key);
            if (seen[row.key] || (info.isUnique && row.count > 1)) throw Error('Вид врага повторяется или босс не один.');
            seen[row.key] = true;
            potions[row.key] = n(row.potions);
            for (var k = 0; k < row.count; k++) list.push(make(info, row.key, list.length, row.hp, row.atk));
        });
        if (!list.length) throw Error('В бою нет ни одного врага.');
        return { scene: scene, spec: spec, enemies: givePotions(list, potions), players: players,
                 plan: { list: list.map(function (e) { return e.key; }), buffRatio: 1, elite: false, explicit: true } };
    }
    var fixed = g.GrivensburgSessionBalance?.plan(spec,players,cfg.diceMode);
    if(fixed) {
        var fixedEnemies=fixed.list.map(function(key,i){
            var src=g.GrivensburgSessionBalance.enemy(spec,fixed,key);
            return make(src,key,i,src.maxHP,src.atk);
        });
        return {scene:scene,spec:spec,enemies:givePotions(fixedEnemies,g.GrivensburgSessionBalance.potionTotals(spec,fixed)),plan:fixed,players:players};
    }
    var isUnique = {};
    Object.keys(ENEMIES).forEach(function (k) { isUnique[k] = !!ENEMIES[k].isUnique; });
    var plan = R.planSpawn({ base: spec.enemies, isUnique: isUnique, playerCount: players });
    var mult = { hp: R.sceneHPMult(spec) * n(cfg.hpMult == null ? 1 : cfg.hpMult),
                 atk: R.sceneAtkMult(spec) * n(cfg.atkMult == null ? 1 : cfg.atkMult) };
    var enemies = plan.list.map(function (key, i) {
        var src = ENEMIES[key];
        var t = R.toughenEnemy(R.buffEnemy({ hp: src.hp, maxHP: src.maxHP, atk: src.atk }, plan.buffRatio), mult);
        return make(src, key, i, t.maxHP, t.atk);
    });
    return { scene: scene, spec: spec, enemies: givePotions(enemies, spec.potions), plan: plan, players: players };
}

/* Итоговый состав строки редактора: вид, число, HP и урон одного врага. */
function encounterFor(cfg) {
    var sp = spawn(Object.assign({}, cfg, { encounter: null }));
    var rows = [];
    sp.enemies.forEach(function (e) {
        var r = rows.find(function (x) { return x.key === e.key; });
        if (!r) rows.push(r = { key: e.key, count: 0, hp: e.maxHP, atk: e.atk });
        r.count++;
        /* Зелья вида — сумма розданных, то есть сколько нажато «+зелье». */
        if (e.potions) r.potions = n(r.potions) + e.potions;
    });
    return rows;
}

/* ══════════════════════════════════════════════════════════════════════
   ОДИН БОЙ
   ══════════════════════════════════════════════════════════════════════ */
function battle(cfg) {
    if (!cfg.party || !cfg.party.length || cfg.party.length > 10) throw Error('Допустимо от 1 до 10 участников.');
    if (['d10', 'd20'].indexOf(cfg.diceMode) < 0) throw Error('Режим кубов: 2d10 или d20.');
    var style = cfg.playStyle == null ? 'auto' : cfg.playStyle;
    if (['auto', 'casual', 'basic'].indexOf(style) < 0) throw Error('Неизвестная тактика партии.');
    if (cfg.rng == null && (!Number.isInteger(cfg.seed) || cfg.seed < 0 || cfg.seed > 4294967295))
        throw Error('Зерно должно быть целым от 0 до 4 294 967 295.');
    if (cfg.maxRounds != null && (!Number.isInteger(cfg.maxRounds) || cfg.maxRounds < 1 || cfg.maxRounds > 200))
        throw Error('Лимит раундов: целое от 1 до 200.');
    ['potionThreshold', 'healThreshold', 'shieldThreshold'].forEach(function (k) {
        if (cfg[k] != null && (!Number.isFinite(cfg[k]) || cfg[k] < 0 || cfg[k] > 1)) throw Error('Порог HP должен быть от 0 до 100%.');
    });
    if (cfg.day != null && (!Number.isInteger(cfg.day) || cfg.day < 1 || cfg.day > 9999)) throw Error('День: целое от 1 до 9999.');

    var random = cfg.rng || rng(cfg.seed);
    var roll = function () { return R.rollDice(cfg.diceMode, random).total; };
    var difficulty = cfg.difficulty;
    var sp = spawn(cfg);
    // Randomize only which ordinary bandit receives the one assigned potion.
    if(cfg.randomBanditPotion || sp.plan.balanced5) {
        var bandits=sp.enemies.filter(e=>e.key==='bandit');
        if(bandits.length && bandits.reduce((n,e)=>n+e.potions,0)===1) {
            bandits.forEach(e=>e.potions=0); bandits[Math.floor(random()*bandits.length)].potions=1;
        }
    }
    var world = { day: cfg.day == null ? sceneDay(cfg.sceneId) : cfg.day,
                  battleNo: scenes.findIndex(function (s) { return s.id === cfg.sceneId; }) + 1,
                  round: 1, difficulty: difficulty, isDark: cfg.dark == null ? !!sp.scene.isDark : !!cfg.dark };
    var party = cfg.party.map(function (p, i) { return hero(p, world.isDark, i); });
    party.forEach(function(h){if(!R.sicknessActive(h,world))h.sickness=false;refreshStats(h,world);});
    if(cfg.continuation){
        if(cfg.continuation.day!==world.day || cfg.continuation.party?.length!==party.length)
            throw Error('Связка требует тот же день и тот же состав.');
        var rate=cfg.transitionRecovery===0 ? 0 : R.battleRecoveryRate(cfg.continuation.completed);
        party.forEach(function(h){applyContinuation(h,cfg.continuation.party.find(function(x){return x.id===h.id;}),world,rate);});
    }
    var enemies = sp.enemies;
    var ids = {};
    party.forEach(function (h) { if (ids[h.id]) throw Error('Повторяются ID героев.'); ids[h.id] = true; });

    /* Уровень игры партии. */
    var active = style !== 'basic';                 /* расходники, лечение, заклинания */
    var skills = active && cfg.skills !== false;    /* навыки и умения классов */
    var maybe = function () { return style !== 'casual' || random() < CASUAL_USE; };

    var round = 0, actions = 0;
    var ownHeroTurn = null;
    var trace = [];
    var stat = { damage: 0, taken: 0, healing: 0, potions: 0, manaPotions: 0, downs: 0, casts: 0,
        cantrips: 0, songs: 0, riffs: 0, disses: 0, prayerProtection: 0, prayerWisdom: 0, shields: 0,
        revives: 0, intercepts: 0, heroesIntercepted: 0, breakaways: 0, breakawaysHeld: 0,
        freezes: 0, sweeps: 0, doubleShots: 0, hunterMarks: 0, drinks: 0, prayers: 0, faithSpent: 0, faithRevive: 0,
        faithMana: 0, faithManaRestored: 0, faithManaSpent: 0,
        prayerHP: 0, prayerMP: 0, abilities: 0, howls: 0, fury: 0, firstKillRound: 0, tailRounds: 0,
        heroAttacks: 0, zeroDamageAttacks: 0, liveTurns: 0, powerStrikes: 0, secondWinds: 0,
        sneakHits: 0, hamstrings: 0, hamstringHits: 0, presenceMarks: 0, presenceReveals: 0, empower50: 0, empower100: 0,
        empowerCurrent: 0, arcanaSpent: 0, meditations: 0, allyHits: 0, fled: 0, confused: 0,
        enemyPotions: 0, enemyPotionHP: 0, guards: 0, declinedReactions: 0,
        fortunes: 0, fortuneRerolls: 0, inspiringSongs: 0, flexes: 0,
        retreats: 0, safeRetreats: 0, retreatsStopped: 0 };
    var per = {};
    party.forEach(function (h) { per[h.id] = { id: h.id, name: h.name, damage: 0, taken: 0, healing: 0, downs: 0, potions: 0 }; });

    var ah = function () { return party.filter(function (h) { return h.alive; }); };
    var ae = function () { return enemies.filter(function (e) { return e.alive; }); };
    /* Враги словарём, в том виде, как их держит игра (currentHP). */
    var emap = function () {
        var o = {};
        ae().forEach(function (e) { o[e.id] = Object.assign({}, e, { currentHP: e.hp }); });
        return o;
    };
    var w = function () { return Object.assign({}, world, { round: round, enemies: emap(),players:Object.fromEntries(party.map(h=>[h.id,h])) }); };
    var snap = function () {
        return {
            heroes: party.map(function (h) {
                var мол = R.activePrayer({ prayer: h.prayer }, w());
                return { id: h.id, name: h.name, cls: h.cls, hp: h.hp, maxHP: h.maxHP, mp: h.mp,
                    maxMP: h.vitals.maxMP, resource: h.resource, power: h.power, def: h.combat.def,
                    int: h.stats.total.int, alive: h.alive, deepWound:h.deepWound || false, infectedWound:h.infectedWound || false, sickness:h.sickness || false,
                    position:h.position,shieldCharges:shieldUp(h)?h.shieldCharges:0,
                    inspiring:!!R.inspiringActive(h,w()),
                    prayers: мол ? [{ id: мол.id, name: R.PRAYERS[мол.id].name, turnsLeft: мол.left }] : [],
                    defensePenalty: '' };
            }),
            enemies: enemies.map(function (e) {
                return { id: e.id, name: e.name, hp: e.hp, maxHP: e.maxHP, alive: e.alive, target: e.aggroTargetId,
                    contact:e.meleeContactId || null,isRanged:e.isRanged,rooted:R.isRooted(e),
                    disoriented:R.isDisoriented(e),ready:R.controlReadyLeft(e) };
            })
        };
    };
    var event = function (type, text, detail) {
        if (!cfg.trace) return;
        trace.push(Object.assign({ round: round, action: actions, type: type, text: text }, detail || {}, { state: snap() }));
    };

    /* Факты героя для движка — те же поля, что пишет телефон. */
    var facts = function (h) {
        return { id: h.id, cls: h.cls, isRogue: h.isRogue, def: h.combat.def, drunk: h.drunk, deepWound:h.deepWound || false,
            infectedWound:h.infectedWound || false,sickness:h.sickness || false,normalMaxHP:h.vitals.normalMaxHP,
            hangoverAfterBattle: h.hangoverAfterBattle, song: h.song, prayer: h.prayer,
            shieldRound: h.shieldRound, shieldUsedRound: h.shieldUsedRound, shieldCharges: h.shieldCharges, shieldBattleNo: h.shieldBattleNo,
            hasShield: n((ITEMS[h.slots.offhand] || {}).def) > 0,
            twoHanded: !!(ITEMS[h.slots.mainhand] || {}).isTwoHanded,
            extraActionRound: h.extraActionRound, targetId: h.targetId,
            interceptAttemptedForTarget: h.interceptAttemptedForTarget };
    };
    var effects = function (h) {
        var e = R.derivePlayerEffects(facts(h), w());
        return R.fieldAuras(ae(),w()).concat(e.buffs || [], e.debuffs || []);
    };
    var stealth = function (h) {
        var e = R.derivePlayerEffects(facts(h), w());
        return (e.buffs || []).some(function (b) { return b.id === 'stealth'; });
    };
    var shieldUp = function (h) {
        return R.shieldActive({ shieldRound: h.shieldRound, shieldUsedRound: h.shieldUsedRound, shieldCharges: h.shieldCharges,
            shieldBattleNo: h.shieldBattleNo, battleNo: world.battleNo, round: round });
    };
    /* Контекст удара — как resolveOwnAttack на телефоне. */
    var context = function (h, t, spell, raw) {
        return { roll: raw, mode: cfg.diceMode, action: spell ? 'spell' : 'phys',
            spell: { power: n(spell && spell.power), spellDamage: n(spell && spell.spellDamage),
                     freezeRounds: n(spell && spell.freezeRounds) },
            attacker: { cls: h.cls, level: h.level, role: h.role, isRogue: h.isRogue,
                mainStat: h.stats.mainStat, total: h.stats.total, combat: h.combat,
                mainhand: h.slots.mainhand || '', offhand: h.slots.offhand || '',
                hunterMark: h.hunterMark,
                resource: h.vitals.resourceKind === 'mood' ? h.resource : 1,
                drunk: h.drunk, effects: effects(h) },
            target: spell && spell.subtype === 'heal' ? { kind:'player', id:t.id }
                : { kind: 'enemy', id: t.id, role: t.role, human: t.human !== false }, world: w() };
    };

    function bardGain(kind) {
        ah().filter(function (h) { return h.vitals.resourceKind === 'mood'; }).forEach(function (h) {
            h.resource = kind === 'kill' ? R.moodOnEnemyDeath(h.resource, h.vitals.maxResource)
                                         : R.moodOnAllyCrit(h.resource, h.vitals.maxResource);
        });
    }
    var faithSequence = 0;
    function faithGain(h, kind, id) {
        var plan = R.planFaithAward(h, { kind:kind, id:id });
        if (!plan) return;
        Object.assign(h, plan.facts);
        event('faith', h.name + ': +' + plan.gain + ' Веры', { actor:h.id, kind:kind, amount:plan.gain });
    }
    function wolfMorale(deadEnemy) {
        if (cfg.lastStand === false) return;
        var plan=R.planWolfMorale({enemies:enemies,deadEnemy:deadEnemy,round:round,battleNo:world.battleNo,rng:random});
        plan.updates.forEach(function(row){var e=enemies.find(function(x){return x.id===row.id;});Object.assign(e,row.facts);});
        plan.checks.forEach(function(row){
            if(row.flee){var e=enemies.find(function(x){return x.id===row.id;});e.alive=false;e.hp=0;stat.fled++;}
            event(row.flee?'flee':'morale',row.name+': '+row.reason+', проверка 50% — '+(row.flee?'сбежал':'продолжает бой'),{actor:row.id});
        });
    }
    function death(e, sourceId) {
        if (!e.alive || e.hp > 0) return;
        if (!stat.firstKillRound) stat.firstKillRound = round;
        e.hp = 0; e.alive = false;
        bardGain('kill');
        var killer = party.find(function (h) { return h.id === sourceId; });
        if (killer) faithGain(killer, 'kill', 'kill-' + e.id);
        event('death', e.name + ' повержен');
        wolfMorale(e);
    }
    /* Урон по герою: ярость, Настроение, падение, Второе дыхание (оно
       срабатывает само — это не решение игрока). */
    function hurt(h, d, source, periodic) {
        var actual = Math.min(h.hp, d.damageTaken);
        h.hp = Math.max(0, h.hp - d.damageTaken);
        stat.taken += actual; per[h.id].taken += actual;
        if (!periodic && h.vitals.resourceKind === 'rage')
            h.resource = R.rageAfter(h.resource, h.vitals.maxResource, 'was_hit', R.rageGainsOnDefense(d.outcome, d.damageTaken));
        if (!periodic && h.vitals.resourceKind === 'mood' && d.damageTaken > 0) h.resource = R.moodOnHitTaken(h.resource);
        if (h.hp <= 0 && h.alive) {
            stat.downs++; per[h.id].downs++;
            if(per[h.id].firstDownRound == null) {
                per[h.id].firstDownRound=round;
                per[h.id].downBeforeFirstTurn=!h.hasTakenTurn;
            }
            if (R.canSecondWind(Object.assign({}, h, { hp: 0 }), world)) {
                Object.assign(h, R.planSecondWind({ maxHP: h.maxHP, resource: h.resource }, world));
                stat.secondWinds++;
                event('revive', h.name + ': Второе дыхание, ' + h.hp + ' HP');
            } else {
                h.alive = false;
                event('death', h.name + ' падает: ' + source);
            }
        }
    }
    /* Защита героя — как applyDefense дашборда: поправка целиком из движка
       (снаряжение, опьянение, молитва, «Окружён», щит). */
    function defendHero(h, damage, hit) {
        if (!hit) return { damageTaken: 0, outcome: 'none', label: 'Промах — защита не нужна', raw: null, mod: 0 };
        var raw = roll(), mod = R.defenseModifier(facts(h), w());
        var d = R.resolveDefense({ roll: raw, defMod: mod, damage: damage, difficulty: difficulty, canDefend: true });
        return Object.assign({}, d, { raw: raw, mod: mod });
    }
    /* Защита врага: люди бросают защиту от оружия; зверь и заклинание —
       весь урон (дашборд, canDefend: !зверь; телефон считает магию сам). */
    function defendEnemy(e, damage, spell) {
        var canDefend = cfg.enemyDefense === 'all' || (e.human !== false && !spell);
        var raw = canDefend ? roll() : null;
        var mod = R.enemyRollModifier(e, w()).def;
        var d = R.resolveDefense({ roll: raw, defMod: mod, damage: damage, difficulty: difficulty, canDefend: canDefend });
        return Object.assign({}, d, { raw: raw, mod: canDefend ? mod : 0 });
    }
    /* Удар врага по герою — как attackChosenTarget дашборда. Заряд обороны тратится
       только при попадании; защита — на момент удара. */
    function enemyStrike(e, h, source) {
        Object.assign(h,R.priestContactFacts(h.id,h,emap()));
        h.who.position=h.position; h.role=R.getRole(Object.assign({},h,h.slots),w());
        if (!R.canEnemyAttackTarget(e, h.id) || (R.isMeleeEnemy(e) && !R.canEngageMelee(h.id,emap(),e.id))) return false;
        var mod = R.enemyRollModifier(e, w()).atk, raw = roll();
        var atk = R.resolveEnemyAttack({ roll: raw + mod, enemy: e });
        if (R.faithMiracleEligible(atk, h.hp)) {
            var faithId = 'miracle-' + (++faithSequence);
            ah().forEach(function (priest) { faithGain(priest, 'miracle', faithId); });
        }
        if(source && atk.hit){var contact=R.contactFacts(e.id,h.id,emap());if(!contact)return false;Object.assign(e,contact);}
        var был = shieldUp(h);
        var d = defendHero(h, R.exactDamage(atk), atk.hit);
        if (был && atk.hit) Object.assign(h, R.planShieldHit(round, { ...h, battleNo:world.battleNo }));
        var wound = R.planDeepWoundHit(h,e,d.damageTaken,world,ownHeroTurn && ownHeroTurn.id===h.id ? ownHeroTurn.key : '',
            d.damageTaken>0 && ['wild_wolf','direwolf'].indexOf(e.key)>=0 ? random() : 1);
        if (wound) {
            h.deepWound=wound.deepWound;
            event('wound',h.name + ': ' + (wound.repeated ? 'Вы получили новую рану! ' : '') + 'Глубокая рана на 3 собственных хода', {target:h.id,actor:e.id});
        }
        var infection=R.planInfectionHit(h,e,d.damageTaken,world,ownHeroTurn && ownHeroTurn.id===h.id ? ownHeroTurn.key : '',
            d.damageTaken>0 && e.key==='rat_king' ? random() : 1,'sim-infection-'+h.id+'-'+actions);
        if (infection) {Object.assign(h,infection);event('infection',h.name+': Гнойная рана на 5 собственных ходов',{target:h.id});}
        hurt(h, d, source || e.name);
        event('enemy', e.name + ' → ' + h.name + ': ' + (atk.hit ? d.damageTaken + ' урона' : 'промах')
            + (был && atk.hit ? ' · заряд обороны использован' : ''),
            { actor: e.id, target: h.id, raw: raw, total: raw + mod, outcome: atk.outcome, defense: d });
        return atk.hit;
    }

    /* ── Решения партии (политика) ─────────────────────────────────── */
    function target(h) {
        var pool = ae();
        if (!active) return pool[Math.floor(random() * pool.length)];
        var marked = pool.find(function (e) { return R.hunterMarkActive(h, w(), e.id); });
        if (marked && R.isBowArcher(Object.assign({}, h, h.slots))) return marked;
        if (h.isRogue && skills) {
            var unseen = pool.filter(function (e) { return R.presenceStacks(e, h.id) <= 0; });
            if (unseen.length) pool = unseen;
        }
        // Обычный ближний удар направляем в того, кто уже рядом. Для
        // явного приоритета босса разрешён подход с риском удержания.
        if (R.isMeleeAttack(Object.assign({}, h, h.slots), null) && cfg.target !== 'boss') {
            var touching = pool.filter(function (e) { return R.heroInMeleeWith(e, h.id); });
            if (touching.length) pool = touching;
        }
        var byHP = function (a, b) { return a.hp - b.hp; };
        if (cfg.target === 'role') {
            var preferred = pool.filter(function (e) { return h.role === 'front' ? e.role === 'front' : e.role === 'back'; });
            return (preferred.length ? preferred : pool).slice().sort(byHP)[0];
        }
        if (cfg.target === 'boss') return pool.slice().sort(function (a, b) { return Number(b.isUnique) - Number(a.isUnique) || a.hp - b.hp; })[0];
        if (cfg.target === 'ranged') return pool.slice().sort(function (a, b) { return Number(b.isRanged) - Number(a.isRanged) || a.hp - b.hp; })[0];
        return pool.slice().sort(byHP)[0];
    }
    /* Усиление Арканой: только маг. Тратит, когда удар без него не добьёт
       цель: вся шкала, если её хватает на ×2, иначе ступень поменьше. */
    function empowerChoice(h, t, spell) {
        if (!skills || !R.canUseEmpower(h.cls) || !maybe()) return 0;
        var base = n(spell.spellDamage) + n(h.stats.total.int);
        if (t.hp <= base) return 0;
        var steps = R.empowerSteps(h.power);
        if (steps.indexOf(100) >= 0 && t.hp > base * 1.5) return 100;
        if (steps.indexOf(50) >= 0) return 50;
        if (h.power >= 20 && R.canEmpower(h.power, R.EMPOWER_CURRENT)) return R.EMPOWER_CURRENT;
        return 0;
    }
    function strikeChoice(h, e) {
        if (!skills || !R.canPowerStrike({ cls: h.cls, resource: h.resource }) || cfg.strike === 'off' || !maybe()) return null;
        var two = !!(ITEMS[h.slots.mainhand] || {}).isTwoHanded;
        var held = R.meleeAttackerIds(h.id, emap());
        var predicted = R.resolveRoll(context(h, e, null, 11)).damage;
        var finish = e.hp <= predicted * (two ? 2 : 1.5);
        var mode = cfg.strike === 'single' ? 'single' : cfg.strike === 'sweep' ? 'sweep'
            : held.length >= 2 && !(finish && (e.isUnique || held.length === 2)) ? 'sweep' : 'single';
        return R.planPowerStrike({ who: h, twoHanded: two, mode: mode, heroId: h.id, enemies: emap(), targetId: e.id });
    }
    function shieldThreats(h, queue, qi) {
        var later = queue.slice(qi + 1).filter(function (x) { return x.side === 'enemy'; })
            .map(function (x) { return enemies.find(function (e) { return e.id === x.id; }); })
            .filter(function (e) { return e && e.alive && R.canEnemyAttackTarget(e, h.id); });
        var front = ah().filter(function (x) { return x.role === 'front'; }).length;
        // Стойка переносится через раунды. Последний в очереди воин
        // оценивает уже находящихся рядом врагов на следующий раунд.
        var pool = later.length ? later : ae();
        return pool.filter(function (e) { return R.heroInMeleeWith(e, h.id) || e.aggroTargetId === h.id
            || (!e.aggroTargetId && front === 1 && !e.isRanged); });
    }
    function shouldShield(h, queue, qi) {
        if (!skills || h.cls !== 'warrior' || ah().length < 2) return false;
        var up = shieldUp(h);
        if (!up && !R.canRaiseShield(Object.assign({}, h, { battleNo:world.battleNo, round:round }))) return false;
        var threats = shieldThreats(h, queue, qi);
        if (!threats.length) return false;
        var incoming = threats.reduce(function (s, e) { return s + e.atk; }, 0) * .55;
        var t = target(h), expected = t ? R.resolveRoll(context(h, t, null, 11)).damage : 0;
        if (ae().length === 1 && t.hp <= expected) return false;
        if (up) return threats.length >= 2
            && (h.hp / h.maxHP < n(cfg.shieldThreshold == null ? .65 : cfg.shieldThreshold) || incoming >= h.hp * .45)
            && maybe();
        return ((h.hp / h.maxHP < n(cfg.shieldThreshold == null ? .65 : cfg.shieldThreshold) && threats.length >= 2)
                || incoming >= h.hp * .7) && maybe();
    }
    function reactionAllowed(h) {
        if (!shieldUp(h)) return true;
        var holders = R.meleeAttackerIds(h.id, emap());
        if (skills && ah().length > 1 && (holders.length >= 2 || h.hp / h.maxHP < .5)) {
            stat.declinedReactions++;
            event('guard', h.name + ': сохраняет Глухую оборону, отказывается от ответного удара', {actor:h.id});
            return false;
        }
        Object.assign(h, R.planShieldAttack(h, w()));
        event('shield-exit', h.name + ': ответная атака снимает Глухую оборону', {actor:h.id});
        return true;
    }
    function fortuneTarget() {
        var candidates = ah().filter(function (x) { return !R.fortuneCharges(x, w()).length && !shieldUp(x); });
        var score = function (x) {
            var main = n(x.stats.total[x.stats.mainStat]);
            var book = Object.values(x.slots).map(function (k) { return ITEMS[k]; })
                .find(function (it) { return it && it.subtype === 'attack' && x.mp >= R.resourceCost(it.manaCost); });
            if (book) return (n(book.spellDamage) + n(x.stats.total.int)) * (x.power >= 100 ? 2 : x.power >= 50 ? 1.5 : 1);
            var patient=ah().slice().sort(function(a,b){return a.hp/a.maxHP-b.hp/b.maxHP;})[0];
            if(x.cls==='priest' && x.mp>=R.PRIEST_HEALING_RAY.manaCost && patient
                    && patient.hp/patient.maxHP<n(cfg.healThreshold==null?.65:cfg.healThreshold))
                return Math.min(patient.maxHP-patient.hp,patient.maxHP*.5);
            if (R.canDoubleShot(Object.assign({}, x, x.slots), w())) return main * 2;
            if (R.canPowerStrike(x)) return main * ((ITEMS[x.slots.mainhand] || {}).isTwoHanded ? 2 : 1.5);
            return 0;
        };
        candidates.sort(function (a,b) { return score(b) - score(a); });
        return candidates.length && score(candidates[0]) > 0 ? candidates[0] : null;
    }
    function tryRetreat(h) {
        if (!skills || !extraFree(h) || !R.hasRetreatSkill(Object.assign({},h,h.slots))) return false;
        if (h.cls === 'priest' && h.position === 'front' && !h.allowPriestRetreat) return false; // отдельный тест тыловой тактики
        var holders = R.retreatHolders(ae(), h.id);
        if (!holders.length) return false;
        var safe = R.safeRetreatAvailable(Object.assign({},h,h.slots), w());
        if (!safe && (h.hp / h.maxHP >= .5 || !maybe())) return false;
        var rw = Object.assign({}, w(), {queue:[{type:'player',id:h.id}]});
        if (R.whyCantRetreat(Object.assign({},h,h.slots), rw)) return false;
        Object.assign(h, R.planRetreat(Object.assign({},h,h.slots), rw));
        stat.retreats++; if (safe) stat.safeRetreats++;
        var stopped = false;
        if (!safe) holders.forEach(function (e) {
            if (h.alive && R.canRetreatReaction(e,h.id) && enemyStrike(e,h,'отступление')) stopped=true;
        });
        if (stopped || !h.alive) {
            stat.retreatsStopped++;
            event('retreat', h.name + ': отступление сорвано, главное действие потеряно', {actor:h.id});
            return true;
        }
        holders.forEach(function(e) {
            e.meleeContactId=null; e.hasEngagedTarget=false; e.aggroTargetId=null;
            e.retargetIntent=null; e.interceptAttemptedForTarget=null;
        });
        if(h.cls==='priest'){h.position='back';h.who.position='back';h.role='back';}
        event('retreat', h.name + (safe ? ': безопасно сменил позицию' : ': успешно отступил'), {actor:h.id,safe:safe});
        return false;
    }

    /* Доп действие — одно на раунд (движок, hasExtraAction). */
    var extraFree = function (h) { return R.hasExtraAction({ extraActionRound: h.extraActionRound }, w()); };
    var spendExtra = function (h) { h.extraActionRound = round; };

    /* Что делает удар по врагу: Присутствие разбойника, Месть и желание
       сорваться в тыл — как дашборд после защиты врага. */
    function damageEnemy(e, amount, type) {
        var facts = R.damageEnemy(Object.assign({}, e, { currentHP: e.hp }), amount, type);
        e.hp = facts.currentHP;
        delete facts.currentHP;
        Object.assign(e, facts);
    }
    function hitFacts(h, e, hit, sneak, spell) {
        if (!e.alive) return;
        if (hit) Object.assign(e, R.clearPresenceIfOther(e, h.id));
        if (h.isRogue) {
            var revealed = R.presenceRevealTargets(ae(), h.id);
            var out = sneak ? R.resolvePresenceSneaky({ attackerId: h.id, hit: hit, round: round, enemy: e })
                            : R.resolvePresence({ attackerId: h.id, hit: hit, round: round, enemy: e });
            Object.assign(e, R.cappedEnemyFacts(e.id,R.enemyHitTargetFacts(e, out.facts, h.id, R.isMeleeAttack(Object.assign({},h,h.slots),spell), hit),emap()));
            if (out.changed && !out.revealed) { stat.presenceMarks++; event('presence', h.name + ': Присутствие → ' + e.name); }
            if (out.revealed) {
                stat.presenceReveals++;
                event('presence', h.name + ' раскрыт');
                revealed.forEach(function (id) {
                    var x = enemies.find(function (y) { return y.id === id; });
                    if (x) Object.assign(x, { presence: null, aggroTargetId: h.id });
                });
            }
            return;
        }
        var старая = party.find(function (x) { return x.id === e.aggroTargetId && x.alive; });
        var rev = R.planRevengeRetarget({ currentTargetAlive: !!старая, round: round,
            attackerId: h.id, attackerRole: h.role, hit: hit,
            attackerHpPercent: h.maxHP ? h.hp / h.maxHP * 100 : 100,
            meleeEnemies: ae().filter(R.isMeleeEnemy).length,
            frontHeroes: ah().filter(function (x) { return x.role === 'front'; }).length,
            enemy: e });
        Object.assign(e, R.cappedEnemyFacts(e.id,R.enemyHitTargetFacts(e, rev.facts, h.id, R.isMeleeAttack(Object.assign({},h,h.slots),spell), hit),emap()));
    }

    function fortuneRoll(h, ctx, raw, res, keepUnused) {
        var f = R.startFortuneChoice(h, w(), { rawTotal:raw, faces:[raw] }, true);
        if (!f) return { raw:raw, result:res };
        // Процентное лечение при любом успехе одинаковое: перебрасываем только провал.
        if (res.outcome === 'miss' || (ctx.target.kind !== 'player' && res.outcome === 'graze')) {
            var dice = R.rollDice(cfg.diceMode, random);
            f = R.rerollFortune(f, { rawTotal:dice.total, faces:dice.dice || [dice.total] });
            raw = f.current.rawTotal; res = R.resolveRoll(Object.assign({}, ctx, { roll:raw }));
        }
        h.fortuneCharges = R.acceptFortune(h, w(), f, false, keepUnused).fortuneCharges;
        if(f.rerolled)stat.fortuneRerolls++;
        event('fortune-roll', h.name + (f.rerolled ? ': переброс Фортуны' : ': принял первый бросок'),
            { actor:h.id, first:f.first.rawTotal, raw:raw, rerolled:f.rerolled, healing:ctx.target.kind === 'player' });
        return { raw:raw, result:res, rerolled:f.rerolled };
    }
    /* ── Удар героя по врагу ───────────────────────────────────────── */
    function attack(h, e, spell, sneak, hamstring, prepared, fortuneAllowed, comboFortune) {
        if (!e || !e.alive || !h.alive) return;
        if(!spell && R.whyCantAttack(Object.assign({},h,h.slots))) {
            if(h.cls!=='priest' || h.position!=='back')return;
            var advanceWorld=Object.assign({},w(),{queue:[{type:'player',id:h.id}]});
            if(R.whyCantAdvance(Object.assign({},h,h.slots),advanceWorld,e.id))return;
            // Existing approach below resolves reactions before attack; the row changes after success.
        }
        var melee=R.isMeleeAttack(Object.assign({},h,h.slots),spell);
        if(melee && R.isMeleeEnemy(e) && !R.canEngageMelee(h.id,emap(),e.id))return;
        Object.assign(h,R.planShieldAttack(h,{...world,round}));
        var holders=R.retreatHolders(ae(),h.id),shared=R.heroInMeleeWith(e,h.id);
        if(melee && holders.length && !shared) {
            var held=false;
            holders.forEach(function(x){if(h.alive && enemyStrike(x,h,'движение'))held=true;});
            if(held || !h.alive){if(h.cls==='priest'){h.position='front';h.who.position='front';h.role='front';}return;}
            holders.forEach(function(x){x.meleeContactId=null;x.hasEngagedTarget=false;});
        }
        h.targetId = e.id;
        /* Перехват на подходе: наш ближний бежит к их стрелку (случай А). */
        if (cfg.intercepts !== false && melee && !shared
            && R.interceptApplies({ moverRole: h.cls==='priest'?'front':h.role, targetRole: e.role, action: spell ? 'spell' : 'attack' })
            && R.shouldCheckIntercept({ aggroTargetId: e.id, interceptAttemptedForTarget: h.interceptAttemptedForTarget })) {
            h.interceptAttemptedForTarget = e.id;
            var стража = ae().filter(function (x) { return x.id !== e.id && R.canEngageMelee(h.id,emap(),x.id); });
            var out = R.rollIntercepts({ rng: random,
                candidates: R.pickInterceptors({ enemies: стража, difficulty: difficulty, rng: random }) });
            var strikes = [];
            for (var i = 0; i < out.succeeded.length && h.alive; i++)
                strikes.push({ id: out.succeeded[i].id, hit: enemyStrike(out.succeeded[i], h, 'перехват') });
            var итог = R.resolveIntercept({ strikes: strikes });
            if (итог.stopped) {
                stat.heroesIntercepted++;
                if(h.cls==='priest'){h.position='front';h.who.position='front';h.role='front';}
                event('intercept', h.name + ' перехвачен на подходе к ' + e.name + ' — ход потерян');
                return;
            }
            if (!h.alive) return;
        }
        if(melee && h.cls==='priest' && h.position==='back') {
            var contact=R.contactFacts(e.id,h.id,emap());if(!contact)return;
            Object.assign(e,contact);h.position='front';h.who.position='front';h.role='front';
            Object.assign(h,R.planRetreat(h,w()));
            event('position',h.name+': вступил в ближний бой · главное действие потрачено',{actor:h.id,position:'front'});
            return;
        }
        if (hamstring) {
            if (!R.canHamstring(Object.assign({}, h, h.slots), w())) return;
            Object.assign(h, R.planHamstring(w())); stat.hamstrings++;
        }
        var empower = spell ? empowerChoice(h, e, spell) : 0;
        var powerPlan = !spell ? strikeChoice(h, e) : null;
        var raw = prepared ? prepared.raw : roll(), res = prepared ? Object.assign({}, prepared.result) : R.resolveRoll(context(h, e, spell, raw));
        if (fortuneAllowed !== false && !(prepared && prepared.fortuneApplied) && R.fortuneCharges(h, w()).length) {
            var choice = fortuneRoll(h, context(h, e, spell, raw), raw, res, !!comboFortune);
            if (comboFortune && choice.rerolled) comboFortune.used = true;
            raw = choice.raw; res = choice.result;
            if (prepared) { prepared.raw = raw; prepared.result = Object.assign({}, res); prepared.fortuneApplied = true; }
        }
        if (h.vitals.resourceKind === 'mood') h.resource = R.moodAfterAttack(h.resource);
        /* Усиленный удар — поверх итога, Ярость списывается и при промахе:
           замах сделан (телефон, doAttack). */
        var power = null;
        if (powerPlan) {
            power = powerPlan;
            h.resource = Math.max(0, h.resource - R.POWER_STRIKE_COST);
            R.scaleDamage(res, power.mult);
            if (power.kind !== 'sweep') stat.powerStrikes++;
        }
        if (spell) {
            h.mp -= R.resourceCost(spell.manaCost);
            stat.casts++;
            if (spell.cantrip) stat.cantrips++;
            if (empower) {
                var plan = R.planEmpower(h.power, empower);
                R.scaleDamage(res, plan.multiplier);
                stat[empower === R.EMPOWER_CURRENT ? 'empowerCurrent' : 'empower' + empower]++;
                stat.arcanaSpent += plan.spent;
                h.power = plan.left;
                event('empower', h.name + ': усиление Арканой ×' + plan.multiplier);
            }
            h.power = h.cls === 'priest' ? R.faithAfterCast(h.power, spell)
                : R.powerAfterCast(h.power, spell.manaCost, h.stats.total.int, !!spell.cantrip);
        }
        if (res.outcome === 'crit' && !(prepared && prepared.critRewarded)) {
            bardGain('crit'); if (prepared) prepared.critRewarded = true;
        }
        stat.heroAttacks++;
        /* Размах: защиту за каждую цель бросает движок (resolveSweep) — как
           applySweep дашборда. */
        if (power && power.kind === 'sweep' && res.hit) {
            var list = power.targetIds.map(function (id) { return enemies.find(function (x) { return x.id === id; }); })
                .filter(function (x) { return x && x.alive; });
            if (list.length > 1) {
                stat.sweeps++;
                R.resolveSweep({ damage: res.damage, damageExact:R.exactDamage(res), difficulty: difficulty, mode: cfg.diceMode, rng: random,
                    targets: list.map(function (x) { return { id: x.id, name: x.name, currentHP: x.hp,
                        defMod: R.enemyRollModifier(x, w()).def, canDefend: x.human !== false }; }) })
                    .forEach(function (row) {
                        var t = enemies.find(function (x) { return x.id === row.id; });
                        var actual = Math.min(t.hp, row.damage);
                        damageEnemy(t, row.damage, 'physical');
                        stat.damage += actual; per[h.id].damage += actual;
                        if (!row.damage) stat.zeroDamageAttacks++;
                        event('attack', h.name + ' → ' + t.name + ': ' + row.damage + ' урона · с размаха',
                            { actor: h.id, target: t.id, raw: raw, total: res.total, outcome: res.outcome, damage: row.damage });
                        death(t, h.id);
                        hitFacts(h, t, row.damage > 0, false);
                    });
                return;
            }
            /* Махнуть не по кому — удар всё равно нанесён и идёт обычным
               путём (дашборд: rollEnemyDefense после неудачного applySweep). */
        }
        var d = res.hit ? defendEnemy(e, R.exactDamage(res), spell) : { damageTaken: 0, label: 'Промах', raw: null };
        if (!d.damageTaken) stat.zeroDamageAttacks++;
        var actual = Math.min(e.hp, d.damageTaken);
        damageEnemy(e, d.damageTaken, spell && spell.damageType || 'physical');
        if (hamstring) {
            var ham = R.applyHamstring(Object.assign({}, e, { currentHP: e.hp }), res.hit, d.damageTaken);
            if (ham) { Object.assign(e, ham); stat.hamstringHits++; }
        }
        stat.damage += actual; per[h.id].damage += actual;
        if (R.hellFlexEligible(h, res.hit && d.damageTaken > 0, spell) && e.hp > 0) {
            var flex = R.planHellFlex(Object.assign({}, e, { currentHP:e.hp }), h.id + '-' + round + '-' + stat.heroAttacks, random());
            if (flex) Object.assign(e, flex);
            if (flex && flex.disorientation) { stat.flexes++; event('hell-flex', h.name + ': Адский флекс → ' + e.name, { actor:h.id, target:e.id }); }
        }
        if (spell && spell.freezes && res.hit && e.hp > 0) {
            var frost = R.applyFrostbite(e, true);
            if (frost) { Object.assign(e, frost); stat.freezes++; }
        }
        if (spell && spell.burns && e.hp > 0)
            Object.assign(e, R.applyBurn(Object.assign({}, e, { currentHP: e.hp }), d.damageTaken, res.hit, h.id));
        event('attack', h.name + ' → ' + e.name + ': ' + d.damageTaken + ' урона'
            + (spell ? ' · ' + spell.name : power ? ' · ' + (power.label || 'усиленный') : hamstring ? ' · Подрезать сухожилие' : sneak ? ' · Без палева' : ''),
            { actor: h.id, target: e.id, raw: raw, total: res.total, outcome: res.outcome, damage: d.damageTaken,
              defense: d, parts: res.parts });
        death(e, h.id);
        hitFacts(h, e, d.damageTaken > 0, sneak, spell);
    }

    /* ── Ход героя ─────────────────────────────────────────────────── */
    function heroTurn(h, queue, qi) {
        if(R.heroActionControlled(h,w())) {
            event('control',h.name+': действие запрещено контролем',{actor:h.id});
            h.mainActionRound=round;return;
        }
        Object.assign(h,R.priestContactFacts(h.id,h,emap()));
        h.who.position=h.position; h.role=R.getRole(Object.assign({},h,h.slots),w());
        if(h.mercenary && h.companionKey==='spook') {
            var spookPlan=R.planSpookTurn(h,w());
            event('spook-plan',h.name+': '+JSON.stringify(spookPlan),{actor:h.id});
            if(spookPlan.kind==='attack') {
                if(spookPlan.prepareSneak)Object.assign(h,R.planSneakHit(w()));
                var sneaky=!!h.sneakNextHit;
                if(sneaky)stat.sneakHits++;
                attack(h,enemies.find(e=>e.id===spookPlan.targetId),null,sneaky,spookPlan.skill==='hamstring',null,false);
                if(sneaky)h.sneakNextHit=false;
            }
            h.mainActionRound=round; return;
        }
        /* Молитва спала — потолки вернулись. */
        if (h.prayer && !R.activePrayer({ prayer: h.prayer }, w())) {
            h.prayer = null; refreshStats(h, w());
            event('prayer_end', h.name + ': молитва закончилась', { actor: h.id });
        }
        var books = Object.keys(h.slots).map(function (k) { return ITEMS[h.slots[k]]; })
            .filter(function (it) { return it && it.slot === 'magic'; });
        if (skills && h.cls === 'priest') books.push(R.PRIEST_HEALING_RAY);
        var castable = books.filter(function (it) { return ['attack', 'heal', 'utility'].indexOf(it.subtype) >= 0; });
        var trick = h.trickKey ? ITEMS[h.trickKey] : null;
        var costs = castable.map(function (x) { return R.resourceCost(x.manaCost); });
        if (trick) costs.push(R.resourceCost(trick.manaCost));
        var minCost = costs.length ? Math.min.apply(null, costs) : Infinity;
        if (tryRetreat(h)) return;
        var blessed = skills && h.cls === 'bard' && cfg.fortune !== false ? fortuneTarget() : null;
        var reserveFortune = blessed && !R.whyCantFortune(h, Object.assign({},w(),{battleOpen:true}));

        /* ── ДОП ДЕЙСТВИЕ (одно на раунд) ── */
        if (active && extraFree(h) && h.potions > 0
            && h.hp / h.maxHP < n(cfg.potionThreshold == null ? .35 : cfg.potionThreshold) && maybe()) {
            var heal = Math.min(n((ITEMS.potion_hp || {}).val), h.maxHP - h.hp);
            h.hp += heal; h.potions--; stat.potions++; per[h.id].potions++; spendExtra(h);
            if (h.deepWound) { Object.assign(h,R.physicalHealFacts(h)); event('wound_clear',h.name + ': зелье сняло глубокую рану'); }
            event('potion', h.name + ' пьёт зелье: +' + heal + ' HP');
        }
        if (active && extraFree(h) && h.manaPotions > 0 && h.mp < minCost && h.mp < h.vitals.maxMP && maybe()) {
            var gain = Math.min(n((ITEMS.potion_mp || {}).val), h.vitals.maxMP - h.mp);
            h.mp += gain; h.manaPotions--; stat.manaPotions++; spendExtra(h);
            event('potion', h.name + ' пьёт ману: +' + gain + ' MP');
        }
        /* FIX10: выпивка расходует общее дополнительное действие. */
        if (active && extraFree(h) && h.vitals.resourceKind === 'mood' && h.booze > 0 && h.resource < R.SONG_COST && h.drunk < R.DRUNK_MAX) {
            var it = ITEMS.dragon_egg_tincture || { mood: 5, drunkSteps: 1, effect: 'booze' };
            h.resource = R.moodAfterDrink(h.resource, h.vitals.maxResource, it, true);
            h.drunk = Math.min(R.DRUNK_MAX, h.drunk + n(it.drunkSteps));
            if (R.drinkClearsHangover(h, world, it)) Object.assign(h, R.clearHangover());
            h.booze--; stat.drinks++; spendExtra(h);
            event('potion', h.name + ' выпивает: Настроение ' + h.resource);
        }
        var needsBackground = R.fieldAuras(ae(), w()).some(function(e) { return e.kind==='debuff' && !e.suppressed; })
            || ah().some(function(x) { return R.heroControlStamps(x,w()).length > 0; });
        if(skills && h.cls==='bard' && (cfg.song==='background' || (cfg.song==='auto' && needsBackground))
                && extraFree(h) && R.inspiringProtection(w()).active===false && maybe()){
            var bw=w(),bp=R.planInspiring(h,bw,roll()+h.combat.atk,h.combat.critThreshold,'sim-bg-'+h.id);
            if(bp){
                if(bp.relief)party.filter(x=>x.hp>0).forEach(x=>Object.assign(x,R.shortenHeroControl(x,bw,bp.relief)));
                Object.assign(h,bp.facts);if(h.inspiringSong)h.inspiringSong.controlStamps=R.heroControlStamps(h,bw);
                stat.songs++;stat.inspiringSongs++;event('song',h.name+': Бодрящий фон · '+R.SONG_LABEL[bp.outcome],{actor:h.id,chance:bp.chance});
            }
        }
        /* Песня — доп действие: спел и бей. */
        if (skills && h.cls === 'bard' && cfg.song !== 'off' && cfg.song !== 'background' && extraFree(h)) {
            var звучит = R.songActive(h, round) || ae().some(function (e) { return R.songActive(e, round); });
            var song = cfg.song === 'riff' ? 'groovy_riff' : cfg.song === 'diss' ? 'funeral_march'
                : ae().filter(R.songAffects).length >= 2 ? 'funeral_march' : 'groovy_riff';
            if (!звучит && !R.inspiringActive(h,w()) && (!reserveFortune || h.resource > R.SONG_COST)
                && R.canSing({ cls: h.cls, mainhand: h.slots.mainhand, resource: h.resource }, song) && maybe()) {
                var sraw = roll(), outcome = R.songOutcome(sraw + h.combat.atk, h.combat.critThreshold);
                var size = R.songEffectSize(R.SONGS[song].atk, outcome, h.combat.critPower);
                var plan = R.planSong(song, round, size, world.battleNo);
                h.resource -= R.SONG_COST; spendExtra(h);
                stat.songs++; stat[song === 'groovy_riff' ? 'riffs' : 'disses']++;
                if (plan && plan.facts) (plan.target === 'allies' ? ah() : ae().filter(R.songAffects))
                    .forEach(function (x) { x.song = Object.assign({}, plan.facts.song); });
                event('song', h.name + ': ' + R.SONGS[song].name + ' · ' + R.SONG_LABEL[outcome]
                    + ' · ' + (size > 0 ? '+' : '') + size, { actor: h.id, raw: sraw, total: sraw + h.combat.atk });
            }
        }
        /* Молитва — доп действие: на себя вдвое. */
        if (skills && h.cls === 'priest' && h.prayerPlan !== 'off' && extraFree(h)
            && !(party.some(function(x){return !x.alive && !x.mercenary;}) && h.power >= 25)
            && R.canPray({ cls: h.cls, power: h.power, prayer: h.prayer }, w()) && maybe()) {
            var id = h.prayerPlan === 'wisdom' ? 'wisdom'
                : h.prayerPlan === 'protection' ? 'protection'
                : (h.lastPrayer === 'protection' ? 'wisdom' : 'protection');
            var pp = R.planPrayer(PRAYER_KEY[id], { power: h.power }, w(), true);
            var hp0 = h.maxHP, mp0 = h.vitals.maxMP;
            Object.assign(h, R.planPrayerTarget(pp.prayer, h, w(), hp0));
            h.power = pp.power; h.lastPrayer = id;
            refreshStats(h, w()); spendExtra(h);
            stat.prayers++; stat[id === 'protection' ? 'prayerProtection' : 'prayerWisdom']++;
            stat.faithSpent += R.PRAYER_COST;
            stat.prayerHP += h.maxHP - hp0; stat.prayerMP += h.vitals.maxMP - mp0;
            event('prayer', h.name + ': ' + PRAYERS[id].name + ' на себя · −' + R.PRAYER_COST + ' Веры', { actor: h.id });
        }

        if (skills && h.cls === 'priest' && extraFree(h) && h.mp < minCost && maybe()) {
            var fmWho = Object.assign({}, h, { maxMP:h.vitals.maxMP });
            var fmOptions = R.faithManaOptions(fmWho);
            var fm = R.planFaithMana(fmWho, Object.assign({}, w(), { battleOpen:true }),
                Math.min(fmOptions.maxMana, minCost - h.mp), 'extra');
            if (fm) {
                Object.assign(h, fm.facts);
                stat.faithMana++; stat.faithManaRestored += fm.mana;
                stat.faithManaSpent += fm.cost; stat.faithSpent += fm.cost;
                event('faith-mana', h.name + ': +' + fm.mana + ' маны за ' + fm.cost + ' Веры',
                    { actor:h.id, mana:fm.mana, cost:fm.cost, maxMP:fmWho.maxMP });
            }
        }

        if (skills && extraFree(h) && R.canHunterMark(Object.assign({}, h, h.slots), w()) && maybe()) {
            var markTarget = target(h);
            if (markTarget) {
                Object.assign(h, R.planHunterMark(w(), markTarget.id));
                stat.hunterMarks++;
                event('hunterMark', h.name + ' отмечает ' + markTarget.name + ' на 4 раунда', { actor: h.id, target: markTarget.id });
            }
        }

        /* ── ГЛАВНОЕ ДЕЙСТВИЕ ── */
        if (blessed && skills && cfg.fortune !== false && h.cls === 'bard'
            && !R.whyCantFortune(h, Object.assign({}, w(), { battleOpen:true })) && maybe()) {
            var id = 'fortune-' + h.id + '-' + world.day;
            var grant = R.planFortuneGrant(h, Object.assign({}, w(), { battleOpen:true }), blessed.id, id, {});
            Object.assign(h, grant);
            blessed.fortuneCharges = Object.assign({}, blessed.fortuneCharges);
            blessed.fortuneCharges[id] = { by:h.id, battleNo:world.battleNo, spent:false };
            stat.fortunes++;
            event('fortune-cast', h.name + ' исполнил Фортуну для ' + blessed.name, { actor:h.id, target:blessed.id });
            return;
        }
        var fallen = party.find(function (x) { return !x.alive && !x.mercenary; });
        if (skills && fallen && h.cls === 'priest') {
            var уровень = R.reviveLevels({ cls: h.cls, power: h.power, reviveUsedDay: h.reviveUsedDay }, world).pop();
            if (уровень && maybe()) {
                Object.assign(fallen,R.resurrectionCleanse());refreshStats(fallen,w());
                var rp = R.planRevive({ maxHP: fallen.maxHP }, { power: h.power }, world, уровень);
                fallen.hp = rp.target.hp; fallen.alive = true;
                h.power = rp.priest.power; h.reviveUsedDay = rp.priest.reviveUsedDay;
                stat.revives++; stat.faithSpent += rp.cost; stat.faithRevive += rp.cost;
                event('revive', h.name + ' воскрешает ' + fallen.name + ': ' + rp.level + '% — ' + fallen.hp + ' HP за ' + rp.cost + ' Веры');
                return;
            }
        }
        var healBook = books.filter(function (x) { return x.subtype === 'heal' && h.mp >= R.resourceCost(x.manaCost); })
            .sort(function (a, b) { return n(b.healPct) - n(a.healPct); })[0];
        var patient = ah().slice().sort(function (a, b) { return a.hp / a.maxHP - b.hp / b.maxHP; })[0];
        var efficientHeal=books.filter(function(x){return x.subtype==='heal' && h.mp>=R.resourceCost(x.manaCost)
                && n(x.healPct)/100>=1-patient.hp/patient.maxHP;})
            .sort(function(a,b){return R.resourceCost(a.manaCost)-R.resourceCost(b.manaCost);})[0];
        if(efficientHeal)healBook=efficientHeal;
        if (active && healBook && h.mp >= R.resourceCost(healBook.manaCost)
            && patient.hp / patient.maxHP < n(cfg.healThreshold == null ? .65 : cfg.healThreshold) && maybe()) {
            var healRaw = roll(), healContext = context(h, patient, healBook, healRaw);
            var healResult = fortuneRoll(h, healContext, healRaw, R.resolveRoll(healContext)).result;
            var amount = R.planSpellHeal(healBook, patient, patient.maxHP, healResult.hit, healResult.damage).amount;
            h.mp -= R.resourceCost(healBook.manaCost);
            h.power = h.cls === 'priest' ? R.faithAfterCast(h.power, healBook)
                : R.powerAfterCast(h.power, healBook.manaCost, h.stats.total.int, false);
            patient.hp += amount; stat.healing += amount; per[h.id].healing += amount; stat.casts++;
            if (healResult.hit && patient.deepWound) { Object.assign(patient,R.physicalHealFacts(patient)); event('wound_clear',patient.name + ': магическое лечение сняло глубокую рану'); }
            event('heal', h.name + ' лечит ' + patient.name + ': +' + amount + ' HP',
                { actor:h.id, target:patient.id, amount:amount, outcome:healResult.outcome,
                    effectId:healBook.effectId, manaCost:healBook.manaCost });
            return;
        }
        if (skills && h.cls === 'mage' && Number.isFinite(minCost) && h.mp < minCost
            && R.canMeditate({ cls: h.cls, mp: h.mp, maxMP: h.vitals.maxMP, meditateUsedDay: h.meditateUsedDay }, world) && maybe()) {
            Object.assign(h, R.planMeditate({ mp: h.mp, maxMP: h.vitals.maxMP }, world));
            stat.meditations++;
            event('resource', h.name + ' медитирует: ' + h.mp + ' MP');
            return;
        }
        if (shouldShield(h, queue, qi)) {
            if(shieldUp(h)) { stat.guards++; event('guard',h.name+': сохраняет Глухую оборону',{actor:h.id}); }
            else { Object.assign(h, R.planShield(round, world.battleNo)); stat.shields++;
                event('shield', h.name + ' поднимает щит: +' + R.shieldDefBonus(facts(h)) + ' к защите на 4 срабатывания'); }
            return;
        }
        var aggro = books.find(function (x) { return x.subtype === 'utility'; });
        if (skills && aggro && h.cls === 'warrior' && h.resource >= R.resourceCost(aggro.manaCost)
            && ae().some(function (e) { var t = party.find(function (x) { return x.id === e.aggroTargetId; }); return t && t.role === 'back'; })
            && maybe()) {
            var araw = roll(), ares = R.resolveRoll(context(h, target(h), aggro, araw));
            h.resource -= R.resourceCost(aggro.manaCost);
            if (ares.hit) ae().forEach(function (e) { e.aggroTargetId = h.id; e.aggroReason = 'МАСС АГР'; e.retargetIntent = null; });
            event('aggro', h.name + ' использует Агр: ' + (ares.hit ? 'враги переключаются' : 'промах'), { raw: araw, total: ares.total });
            return;
        }
        /* Пьяный может попасть по своему — шанс считает движок. */
        if (R.rollsIntoAlly({ cls: h.cls, drunk: h.drunk }, random) && ah().length > 1) {
            var mates = ah().filter(function (x) { return x.id !== h.id; });
            var victim = mates[Math.floor(random() * mates.length)];
            var fraw = roll(), fres = R.resolveRoll(Object.assign(context(h, victim, null, fraw),
                { target: { kind: 'ally', role: victim.role, human: true } }));
            var fd = defendHero(victim, R.exactDamage(fres), fres.hit);
            hurt(victim, fd, 'удар союзника');
            if (h.vitals.resourceKind === 'mood') h.resource = R.moodAfterAttack(h.resource);
            stat.allyHits++;
            event('friendly', h.name + ' попадает по ' + victim.name + ': ' + fd.damageTaken, { raw: fraw, total: fres.total, defense: fd });
            return;
        }
        /* Удар: заклинание, фокус или оружие. */
        var spell = active ? books.find(function (it) { return it.subtype === 'attack' && h.mp >= R.resourceCost(it.manaCost); }) : null;
        if (!spell && active && trick && h.mp >= R.resourceCost(trick.manaCost)) spell = trick;
        if (!books.some(function(it){return it.subtype==='attack' && h.mp>=R.resourceCost(it.manaCost);})
                && spell && h.trickAuto && skills && h.cls==='mage') {
            var ice=ITEMS.trick_icebolt, frostTarget=target(h);
            if(ice && h.mp>=R.resourceCost(ice.manaCost) && frostTarget && !frostTarget.isRanged
                    && !frostTarget.meleeContactId && !R.isRooted(frostTarget)
                    && (!frostTarget.human || R.controlReadyLeft(frostTarget)===0)) spell=ice;
        }
        var count = 1, comboTargets = null, sharedShot = null;
        if (!spell && skills && R.canDoubleShot(Object.assign({}, h, h.slots), w()) && maybe()) {
            Object.assign(h, R.planDoubleShot(w()));
            var first = target(h), other = ae().find(function (x) { return x.id !== first.id; });
            var predicted=R.resolveRoll(context(h,first,null,11)).damage;
            comboTargets = other && first.hp <= predicted ? [first,other] : [first,first];
            count = R.DOUBLE_SHOT_SHOTS; stat.doubleShots++;
            if (comboTargets[0] === comboTargets[1]) {
                var sharedRaw = roll();
                sharedShot = { raw:sharedRaw, result:R.resolveRoll(context(h, first, null, sharedRaw)) };
            }
            event('double-shot', h.name + ': ' + (sharedShot ? 'одна цель, общий бросок' : 'две цели, отдельные броски'),
                { targets:comboTargets.map(function (x) { return x.id; }), shared:!!sharedShot });
        }
        var comboFortune = comboTargets ? { used:false } : null;
        for (var shot = 0; shot < count && h.alive && ae().length; shot++) {
            var chosen = comboTargets ? comboTargets[shot] : target(h), sneak = false;
            if (!chosen || !chosen.alive) { if (h.shotsLeft) h.shotsLeft = R.afterShot(h).shotsLeft; continue; }
            var hamstring = !spell && skills && R.canHamstring(Object.assign({}, h, h.slots), w()) && maybe();
            if (!spell && !hamstring && skills && R.presenceStacks(chosen, h.id) > 0
                && R.canSneakHit(Object.assign({}, h, h.slots), w())
                && maybe()) {
                Object.assign(h, R.planSneakHit(w()));
                sneak = true; stat.sneakHits++;
            }
            attack(h, chosen, spell, sneak, hamstring, sharedShot, !comboFortune || !comboFortune.used, comboFortune);
            if (sneak) h.sneakNextHit = false;
            if (h.shotsLeft) h.shotsLeft = R.afterShot({ shotsLeft: h.shotsLeft }).shotsLeft;
        }
    }

    /* ── Разрыв ближнего боя: враг хочет в тыл (handleRetargetIntent) ── */
    function retarget(e) {
        var intent = e.retargetIntent;
        if (!intent || !intent.targetId) return null;
        var новая = party.find(function (x) { return x.id === intent.targetId && x.alive; });
        var старая = party.find(function (x) { return x.id === e.aggroTargetId && x.alive; });
        if (!новая) { e.retargetIntent = null; return null; }
        if(R.isMeleeEnemy(e) && !R.canEngageMelee(новая.id,emap(),e.id))return null;
        if (!старая) {
            Object.assign(e, { retargetIntent: null, aggroTargetId: новая.id, aggroReason: intent.reason || '💢 Сорвался в тыл' });
            return { id: новая.id, brokeAway: false };
        }
        var решение = R.decideRetarget({ currentTargetShielded: shieldUp(старая),
            targetMarked: R.hunterMarkActive(новая, w(), e.id), rng: random });
        if (!решение.leave) { e.retargetIntent = null; return null; }
        stat.breakaways++;
        /* Удар вслед — обычная атака держащего; попал — не пустил. */
        /* Удар вслед — реакция: ни ресурса, ни хода не тратит (телефон). */
        var raw = reactionAllowed(старая) ? roll() : null,
            res = raw==null ? {hit:false} : R.resolveRoll(context(старая, e, null, raw));
        var итог = R.resolveBreakaway({ hit: res.hit, intent: { targetId: новая.id, reason: intent.reason } });
        Object.assign(e, итог.facts);
        if (итог.held) {
            stat.breakawaysHeld++;
            var d = defendEnemy(e, R.exactDamage(res), null);
            var actual = Math.min(e.hp, d.damageTaken);
            damageEnemy(e, d.damageTaken, 'physical');
            stat.damage += actual; per[старая.id].damage += actual;
            event('breakaway', старая.name + ' удержал ' + e.name + ' ударом вслед: ' + d.damageTaken + ' урона — ход потерян',
                { raw: raw, total: res.total, defense: d });
            death(e, старая.id);
            return { held: true };
        }
        event('breakaway', e.name + ' вырвался от ' + старая.name + ' к ' + новая.name, { raw: raw, total: res.total });
        return { id: новая.id, brokeAway: true };
    }

    /* ── Ход врага (enemyTurn + attackChosenTarget дашборда) ─────────── */
    function enemyTurn(e) {
        wolfMorale(); if (!e.alive) return;
        var burn = R.planBurnTick(Object.assign({}, e, { currentHP: e.hp }));
        e.turnNo++; e.turnActive = true;
        if (burn) {
            Object.assign(e, burn.facts);
            e.hp = burn.facts.currentHP; delete e.currentHP;
            if ('burn' in burn.facts) e.burn = burn.facts.burn;
            stat.damage += burn.damage;
            if (per[burn.sourceId]) per[burn.sourceId].damage += burn.damage;
            event('burn', e.name + ': горение наносит ' + burn.damage + ' урона',
                { actor: burn.sourceId, target: e.id, damage: burn.damage });
            death(e, burn.sourceId);
            if (!e.alive) return;
        }
        if (R.isEnemyDisabled(e)) {
            event(R.isDisoriented(e) ? 'disorientation' : 'stun', e.name + ' пропускает ход: '
                + (R.isDisoriented(e) ? 'дезориентация' : 'оглушение'), { actor:e.id }); return;
        }
        /* Зелье — доп действие врага, как в живой игре: ниже четверти HP
           пьёт и ходит дальше тем же ходом. Правило и число — движка. */
        var зелье = R.planEnemyPotion(Object.assign({}, e, { currentHP: e.hp }));
        if (зелье) {
            e.hp = зелье.facts.currentHP; e.potions = зелье.facts.potions;
            stat.enemyPotions++; stat.enemyPotionHP += зелье.heal;
            event('enemy-potion', e.name + ' пьёт зелье: +' + зелье.heal + ' HP', { actor: e.id });
        }
        var asEnemy = Object.assign({}, e, { currentHP: e.hp });
        var fearHowl = R.planFearHowl(asEnemy, e.id, w().battleNo);
        if (fearHowl) {
            Object.assign(e, fearHowl); stat.abilities++;
            event('fear-howl', e.name + ': Аура устрашения', { actor:e.id, ownTurn:e.turnNo });
            return;
        }
        if (R.shouldRoarFury({ enemy: asEnemy, round: round })) {
            e.furyUsed = true; stat.abilities++; stat.fury++;
            R.planFury({ enemies: ae().map(function (x) { return Object.assign({}, x, { currentHP: x.hp }); }) })
                .forEach(function (f) { Object.assign(enemies.find(function (x) { return x.id === f.id; }), f.facts); });
            event('ability', e.name + ': Клич главаря', { actor: e.id });
            return;
        }
        if (R.shouldHowl({ enemy: asEnemy, round: round })) {
            e.howlUsed = true; stat.abilities++; stat.howls++;
            R.planHowl(ae().map(function (x) { return Object.assign({}, x, { currentHP: x.hp }); })).forEach(function (p) {
                var t = enemies.find(function (x) { return x.id === p.id; });
                var fresh = n((p.facts || {}).currentHP);
                if (t && fresh > 0) t.hp = Math.min(t.maxHP, fresh);
            });
            event('ability', e.name + ': Вой альфы лечит стаю', { actor: e.id });
            return;
        }
        if (cfg.lastStand !== false && !R.isPackMember(e) && R.canEnemyMove(e)) {
            var st = R.evaluateLastStand({ enemy: e, enemyId: e.id, aliveEnemies: ae(), rng: random });
            if (st.action === 'flee') { e.hp = 0; e.alive = false; stat.fled++; event('flee', e.name + ' убегает'); return; }
            if (st.action === 'confused') { stat.confused++; event('skip', e.name + ' растерялся'); return; }
        }
        var разрыв = R.canEnemyMove(e) ? retarget(e) : null;
        if (разрыв && разрыв.held) return;
        var pickId, brokeAway = false;
        if (разрыв && разрыв.id) { pickId = разрыв.id; brokeAway = разрыв.brokeAway; }
        else {
            var pick = R.pickEnemyTarget({ enemy: e, rng: random, enemies: emap(),
                candidates: party.map(function (h) { return { id: h.id, alive: h.alive, role: h.role, stealth: h.alive && stealth(h) }; }) });
            if (!pick) { e.meleeWaitingFor=e.aggroTargetId || 'any';event('melee-wait', e.name + ': нет свободной доступной цели', {actor:e.id}); return; }
            pickId = pick.id;
        }
        var h = party.find(function (x) { return x.id === pickId; });
        if(R.isMeleeEnemy(e)&&!R.canEngageMelee(pickId,emap(),e.id)){e.meleeWaitingFor=pickId;event('melee-wait',e.name+': нет места',{actor:e.id});return;}
        /* Перехват на подходе: враг бежит к нашему тылу (случай Б). */
        if (cfg.intercepts !== false && R.canEnemyMove(e) && !R.enemyInMeleeContact(e, pickId)
            && R.interceptApplies({ moverRole: e.role, targetRole: h.role, action: 'attack', brokeAway: brokeAway })
            && R.shouldCheckIntercept({ aggroTargetId: pickId, interceptAttemptedForTarget: e.interceptAttemptedForTarget })) {
            var guards = ah().filter(function (x) { return x.role === 'front' && x.id !== pickId && R.canEngageMelee(x.id,emap(),e.id); })
                .map(function (x) { return { id: x.id, role: 'front', alive: true }; });
            if (guards.length) {
                Object.assign(e, R.markInterceptAttempt(pickId));
                var out = R.rollIntercepts({ rng: random, candidates: R.pickInterceptors({ enemies: guards, difficulty: difficulty, rng: random }) });
                var strikes = [];
                for (var i = 0; i < out.succeeded.length && e.alive; i++) {
                    var g2 = party.find(function (x) { return x.id === out.succeeded[i].id; });
                    if (!g2 || !g2.alive) continue;
                    if (!reactionAllowed(g2)) continue;
                    var raw = roll(), res = R.resolveRoll(context(g2, e, null, raw));
                    strikes.push({ id: g2.id, hit: !!res.hit });
                    if (!res.hit) continue;
                    var d = defendEnemy(e, R.exactDamage(res), null);
                    var actual = Math.min(e.hp, d.damageTaken);
                    damageEnemy(e, d.damageTaken, 'physical');
                    stat.damage += actual; per[g2.id].damage += actual;
                    event('intercept', g2.name + ' бьёт ' + e.name + ' на подходе: ' + d.damageTaken, { raw: raw, total: res.total, defense: d });
                    death(e, g2.id);
                }
                if (!e.alive) return;
                var итог = R.resolveIntercept({ strikes: strikes });
                if (итог.stopped) {
                    Object.assign(e, R.cappedEnemyFacts(e.id,Object.assign({},итог.facts,{meleeContactId:итог.byId}),emap())); stat.intercepts++;
                    event('intercept', e.name + ' остановлен на подходе');
                    return;
                }
            }
        }
        e.aggroTargetId = pickId;
        var contact=R.contactFacts(e.id,pickId,emap());if(!contact){e.meleeWaitingFor=pickId;event('melee-wait',e.name+': нет места',{actor:e.id});return;}Object.assign(e,contact);
        enemyStrike(e, h);
    }

    /* ══ Раунды ══ */
    event('start', 'День ' + world.day + ' · начало боя');
    var limit = clamp(n(cfg.maxRounds || 60), 1, 200);
    for (round = 1; round <= limit; round++) {
        if (!ah().length || !ae().length) { round--; break; }
        world.round = round;
        wolfMorale();
        if (!ae().length) break;
        if (ae().length === 1) stat.tailRounds++;
        /* Инициатива — каждый раунд заново, как у Ведущего. */
        var queue = R.buildQueue(ah().map(function (h) { return { id: h.id, side: 'hero', init: h.combat.init }; })
            .concat(ae().map(function (e) { return { id: e.id, side: 'enemy', init: e.init }; })), random);
        event('round', 'Раунд ' + round, { queue: queue.map(function (x) { return x.id; }) });
        for (var qi = 0; qi < queue.length; qi++) {
            if (!ah().length || !ae().length) break;
            var slot = queue[qi];
            actions++;
            if (slot.side === 'hero') {
                var h = party.find(function (x) { return x.id === slot.id; });
                if (!h || !h.alive) continue;
                stat.liveTurns++;
                h.hasTakenTurn=true; ownHeroTurn={id:h.id,key:'hero-'+h.id+'-'+round};
                try {
                    var woundTick=R.planWoundTick(h,world,ownHeroTurn.key);
                    if (woundTick) {
                        var end=woundTick.infectionEnded ? R.planInfectionEnd(h,world,random()) : null, beforeHP=h.hp;
                        if(woundTick.deepTick)h.deepWound=woundTick.facts.deepWound;
                        if(woundTick.infectedTick)h.infectedWound=woundTick.facts.infectedWound;
                        if(end){Object.assign(h,end.facts);refreshStats(h,w());h.hp=beforeHP;}
                        h.woundTickReceipt={id:ownHeroTurn.key,phase:'done'};
                        hurt(h,{damageTaken:woundTick.damage,outcome:'wound'},'Ранения',true);h.hp=Math.min(h.hp,h.maxHP);
                        if(woundTick.deepTick)event('wound_tick',h.name + ': Глубокая рана −1 HP' + (h.deepWound ? '' : ' · рана закончилась'),{target:h.id});
                        if(woundTick.infectedTick)event('infection_tick',h.name+': Гнойная рана −1 HP',{target:h.id});
                        if(end)event('infection_end',h.name+': '+(end.diseased?'Болезнь на 3 игровых дня':'Болезнь не развилась'),{target:h.id});
                    }
                    if(h.alive) heroTurn(h, queue, qi);
                } finally { h.turnNo++; Object.assign(h,R.finishEnemyTurn(h)); ownHeroTurn=null; }
            } else {
                var e = enemies.find(function (x) { return x.id === slot.id; });
                if (!e || !e.alive) continue;
                stat.liveTurns++;
                try { enemyTurn(e); } finally { Object.assign(e, R.finishEnemyTurn(e)); }
            }
        }
    }
    round = Math.min(round, limit);
    var won = !ae().length && ah().length > 0, lost = !ah().length;
    party.forEach(function(h) { if(h.deepWound) { h.deepWound=false; event('wound_clear',h.name + ': рана снята в конце боя'); } });
    party.forEach(function(h){
        if(!R.infectionActive(h,world))return;
        var end=R.planInfectionEnd(h,world,random());Object.assign(h,end.facts);refreshStats(h,w());
        event('infection_end',h.name+': конец боя; '+(end.diseased?'Болезнь на 3 игровых дня':'Болезнь не развилась'),{target:h.id});
    });
    event('end', won ? 'Партия победила' : lost ? 'Партия проиграла' : 'Достигнут лимит раундов');
    var daily = [];
    Object.keys(DAILY_SKILLS).forEach(function (c) { daily = daily.concat(Object.keys(DAILY_SKILLS[c])); });
    return {
        seed: cfg.seed, day: world.day, won: won, lost: lost, unfinished: !won && !lost, rounds: round, actions: actions,
        stats: stat,
        per: Object.keys(per).map(function (k) { return per[k]; }),
        heroes: party.map(function (h) {
            var o = { id: h.id, name: h.name, hp: h.hp, maxHP: h.maxHP, mp: h.mp, maxMP: h.vitals.maxMP,
                      power: h.power, resource: h.resource, alive: h.alive, sickness:h.sickness || false };
            daily.forEach(function (k) { if (h[k] != null) o[k] = h[k]; });
            return o;
        }),
        continuation:{day:world.day,completed:n(cfg.continuation?.completed ?? cfg.completedBefore)+1,
            party:party.map(continuationHero)},
        trace: trace
    };
}

/* ── Итоги серии ──────────────────────────────────────────────────────── */
function wilson(w, total) {
    if (!total) return [0, 1];
    var z = 1.959963984540054, p = w / total, d = 1 + z * z / total;
    var c = (p + z * z / 2 / total) / d, h = z * Math.sqrt(p * (1 - p) / total + z * z / 4 / total / total) / d;
    return [Math.max(0, c - h), Math.min(1, c + h)];
}

g.Lab = { VERSION: VERSION, CASUAL_USE: CASUAL_USE, normalizeHero: normalizeHero, normalizeConfig: normalizeConfig,
    sceneDay: sceneDay, DAILY_SKILLS: DAILY_SKILLS, R: R, ITEMS: ITEMS, ENEMIES: ENEMIES, scenes: scenes,
    slots: slots, slotNames: slotNames, rng: rng, validate: validate, hero: hero, spawn: spawn,
    encounterFor: encounterFor, battle: battle, wilson: wilson, PRAYERS: PRAYERS, slotFits: slotFits,
    offhandAllowed: offhandAllowed, bestTrick: bestTrick,
    continuationHero:continuationHero,applyContinuation:applyContinuation };
})(typeof window !== 'undefined' ? window : globalThis);

