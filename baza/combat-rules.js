/* ============================================================================
   ГРИВЕНСБУРГ — БОЕВОЙ ДВИЖОК  v1.0
   ----------------------------------------------------------------------------
   ОБЩИЙ ФАЙЛ ДЛЯ client.html И server.html. Копий больше нет — правится здесь.
   После любой правки открыть engine-test.html и убедиться, что всё зелёное.
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

var VERSION = 'engine-1.3';   /* 1.3 — способности врагов: обморожение, ярость, вой; воскрешение */

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

   Порог серии зависит от того, как держат линию (см. revengeStreakNeeded):
   двое танков на троих врагов — срываются редко, один на пятерых — сразу. */
var REVENGE_STREAK     = 2;     /* базовая серия попаданий для срыва */
var REVENGE_STREAK_BOSS = 3;    /* боссу всегда на одно попадание больше */
var REVENGE_LOW_HP     = 30;    /* % HP тыловика, ниже — срыв мгновенный */

/* Давление на линию = врагов на фронте / бойцов фронта. Чем плотнее
   насели, тем легче прорваться в тыл. */
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
    var base = REVENGE_STREAK;
    if (p && p.meleeEnemies !== undefined && p.frontHeroes !== undefined) {
        var press = linePressure(p.meleeEnemies, p.frontHeroes);
        for (var i = 0; i < LINE_PRESSURE.length; i++) {
            if (press <= LINE_PRESSURE[i].upTo) { base = LINE_PRESSURE[i].streak; break; }
        }
    }
    /* Босс упрямее: ему всегда на одно попадание больше, но не меньше двух. */
    if (p && p.isBoss) base = Math.max(2, base + (REVENGE_STREAK_BOSS - REVENGE_STREAK));
    return base;
}
var PRESENCE_STACKS    = 3;     /* раздел 7: удар вешает сразу 3 стака,
                                   спадают по одному за ХОД САМОГО ВРАГА,
                                   а не за раунд */
var RAGE_BASE          = 10;    /* шкала Ярости воина: база */
var RAGE_PER_STEP      = 2;     /* +2 за каждую ступень СИЛЫ (пороги 10,15,20) */
/* Стартовая ярость и правила её роста живут ниже, в разделе 12
   (rageOnBattleStart, rageAfter). Здесь только размер шкалы. */
var MOOD_BASE          = 15;    /* стартовая шкала Настроения барда */
/* Шкала растёт за каждую ступень харизмы (statSteps: пороги 10, 15, 20). */
var MOOD_PER_STEP      = 2;     /* +2 к шкале за ступень ХАРИЗМЫ (пороги 10,15,20) */
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
    archer:  { name: 'Лучник', main: 'agi', resource: 'mana', base: { str: 2, agi: 5, int: 3, cha: 0 } },
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
    priest:  ['mage'],
    bard:    ['bard', 'archer']   /* TODO: своей папки у барда пока нет */
};

var STATS = ['str', 'agi', 'int', 'cha'];

/* ==========================================================================
   2. МЕЛОЧЬ
   ========================================================================== */

function num(v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }
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

/* ==========================================================================
   3. РОЛЬ  (раздел 4)
   ЕДИНСТВЕННАЯ реализация на весь проект. Иконка роли берётся отсюда же,
   чтобы иконка и правило не могли разойтись (болячка №3).
   ========================================================================== */

function getRole(who) {
    var cls = who.cls;
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

function canEquip(item, cls) {
    if (!item) return false;

    /* Доступно всем: расходники, квестовое, левая рука, бижутерия, пояс,
       перчатки, реликвии. */
    if (item.type === 'consumable' || item.type === 'quest') return true;
    if (item.slot === 'offhand' || item.slot === 'ring' || item.slot === 'amulet') return true;
    if (item.slot === 'belt' || item.slot === 'gloves' || item.slot === 'relic') return true;

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

/* ==========================================================================
   5. ХАРАКТЕРИСТИКИ  (раздел 8)
   ========================================================================== */

/* Рост: главный стат +1 за уровень, остальные +1 каждые 3 уровня. */
function computeStats(p) {
    var cls = CLASS_TABLE[p.cls] ? p.cls : 'warrior';
    var tbl = CLASS_TABLE[cls];
    var race = p.raceBonus || {};
    var gear = p.gearStats || {};
    var lvl = Math.max(1, num(p.level));
    var mainGrowth = lvl - 1;
    var sideGrowth = Math.floor(lvl / 3);

    var base = {}, total = {};
    STATS.forEach(function (s) {
        base[s] = num(tbl.base[s]) + num(race[s]) + (tbl.main === s ? mainGrowth : sideGrowth);
        total[s] = base[s] + num(gear[s]);
    });
    return { base: base, gear: gear, total: total, mainStat: tbl.main };
}

/* HP: 10 + сила*2 для всех, жрецу дополнительно + интеллект (раздел 7). */
/* ══════════════════════════════════════════════════════════════════════
   ПОРОГИ СТАТОВ: каждые ПОЛНЫЕ 10 пунктов дают бонус.

   Считаем от ИТОГОВОГО стата — значит порог можно добрать снаряжением, а не
   только уровнем. Раньше похожий бонус был привязан к уровню персонажа, и
   вещи на него не влияли вовсе.

   Проценты берутся от БАЗЫ (без бонуса) и округляются вниз: 10% от 30 HP —
   это 3, а не 3.7.
      сила     +10% HP за каждые 10
      интеллект +10% маны за каждые 10  (жрецу вместо этого +5% HP и +5% маны)
      ловкость +1 инициативы за каждые 10, у ЛУЧНИКА ещё и −1 к порогу крита
      харизма  +5 к шкале Настроения за каждые 10 (бард)

   Стартовые бонусы никому не выдаются: пять пунктов на старте порога не
   набирают. Исключение только классовое — лучник сразу имеет +1 инициативы,
   а разбойник сразу −1 к порогу крита. Это НЕ от статов, а за класс. */
var STAT_STEP = 5;
var STAT_FLOOR = 10;
/* Первые десять пунктов не дают НИЧЕГО, дальше ступень каждые пять:
   пороги на 10, 15, 20, 25. Раньше считались полные десятки — пороги
   стояли на 10, 20, 30, и рост выходил слишком быстрым: снаряжение даёт
   по +5 статов, и к десятому уровню всё удваивалось.
   Классовые бонусы воина и жреца — floor((стат-5)/5) — жили по этому
   правилу с самого начала, теперь пороги статов с ними сошлись. */
function statSteps(v) {
    var n = num(v);
    return n < STAT_FLOOR ? 0 : Math.floor((n - STAT_FLOOR) / STAT_STEP) + 1;
}

function computeVitals(p) {
    var cls = CLASS_TABLE[p.cls] ? p.cls : 'warrior';
    var t = p.total || { str: 0, agi: 0, int: 0, cha: 0 };

    var baseHP = 10 + num(t.str) * 2 + (cls === 'priest' ? num(t.int) : 0);
    var manaMult = cls === 'mage' ? 3 : (cls === 'priest' ? 2 : 1);
    var baseMP = num(t.int) * manaMult;

    /* Пороги статов. У жреца интеллект работает иначе: он льёт и в HP, и в
       ману, но вдвое слабее — интеллект у него и так двойной ресурс. */
    var hpBonus = Math.floor(baseHP * 0.10 * statSteps(t.str));
    var mpBonus = Math.floor(baseMP * 0.10 * statSteps(t.int));
    if (cls === 'priest') {
        hpBonus += Math.floor(baseHP * 0.05 * statSteps(t.int));
        mpBonus = Math.floor(baseMP * 0.05 * statSteps(t.int));
    }

    var maxHP = baseHP + hpBonus;
    var maxMP = baseMP + mpBonus;

    /* Шкалы ресурсов растут от своего стата одинаково: +2 за ступень.
       Ярость — от силы, Настроение — от харизмы. Раньше ярость была
       жёсткой константой с пометкой «формула не согласована». */
    var kind = CLASS_TABLE[cls].resource;
    var maxResource = kind === 'rage' ? (RAGE_BASE + statSteps(t.str) * RAGE_PER_STEP)
                    : kind === 'mood' ? (MOOD_BASE + statSteps(t.cha) * MOOD_PER_STEP)
                    : maxMP;
    return { maxHP: maxHP, maxMP: maxMP, resourceKind: kind, maxResource: maxResource,
             /* для интерфейса: сколько добавили пороги */
             hpBonus: hpBonus, mpBonus: mpBonus };
}

/* Производные боевые числа. Порог крита СНИЖАЕТСЯ шансом крита (раздел 8). */
function computeCombatValues(p) {
    var cls = CLASS_TABLE[p.cls] ? p.cls : 'warrior';
    var t = p.total || {};
    var gear = p.gear || {};
    var lvl = Math.max(1, num(p.level));
    var classAtk = 0, classDef = 0;

    if (cls === 'warrior') { classAtk = Math.max(0, Math.floor((num(t.str) - 5) / 5)); classDef = classAtk; }
    else if (cls === 'archer') { classAtk = Math.floor(num(t.agi) / 5); }
    else if (cls === 'mage') { classAtk = Math.max(0, Math.floor((num(t.int) - 5) / 5)); }
    else if (cls === 'priest') { classAtk = Math.max(0, Math.floor((num(t.int) - 5) / 5)); classDef = classAtk; }
    else if (cls === 'bard') { classAtk = Math.max(0, Math.floor((num(t.cha) - 5) / 5)); }

    var rogue = !!p.isRogue;
    /* Разбойник — это лучник С ДВУМЯ КИНЖАЛАМИ, отдельного класса нет. */
    var dualRogue = rogue && !!p.dualDaggers;

    /* Порог крита. Классовый −1 разбойнику даётся СРАЗУ за два кинжала.
       Дальше он растёт только от ЛОВКОСТИ: каждые 10 пунктов ещё −1.
       Раньше здесь был прирост за уровень персонажа — он не зависел ни от
       вещей, ни от двух кинжалов, и лучник с одним кинжалом получал его
       просто так. */
    var critChance = num(gear.critChance)
        + (dualRogue ? 1 : 0)
        + (cls === 'archer' ? statSteps(t.agi) : 0);

    /* Лучник получает +1 к инициативе с первого уровня — это его классовый
       бонус. Взял два кинжала: бонус УХОДИТ, взамен −1 к порогу крита.
       В этом и размен: стрелок ходит раньше, разбойник бьёт больнее. */
    /* Инициатива: каждые 10 ловкости дают +1 ВСЕМ классам.
       Лучнику сверх того классовый +1 с первого уровня — и он УХОДИТ,
       когда лучник берёт второй кинжал и становится разбойником. */
    var init = statSteps(t.agi) + num(gear.init)
        + (cls === 'archer' && !dualRogue ? 1 : 0);

    var lightBonus = (p.isDark && p.hasLight) ? 2 : 0;

    return {
        atk: num(gear.atk) + classAtk + lightBonus,
        def: num(gear.def) + classDef,
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

    /* Базовый урон: физика — главный стат, магия — 6 + интеллект. */
    if (ctx.action === 'spell') {
        acc.baseDamage = 6 + num(a.total.int);
        part(acc, 'base', 'Урон магии (6+инт)', acc.baseDamage);
    } else {
        acc.baseDamage = num(a.total[a.mainStat]);
        part(acc, 'base', 'Урон (главный стат)', acc.baseDamage);
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
    if (role === 'back') part(acc, 'role', 'Атака с дистанции');
    return acc;
}

/* --- Слой 3: КЛАСС ------------------------------------------------------ */
function layerClass(acc, ctx) {
    var a = ctx.attacker;
    if (a.cls === 'warrior') flag(acc, 'rage_on_hit');
    if (a.cls === 'bard') { flag(acc, 'ranged_music'); part(acc, 'class', 'Сила музыки (дальняя)'); }
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
    return acc;
}

var LAYERS = [layerBase, layerRole, layerClass, layerEffects];

/* --- Итог --------------------------------------------------------------- */
function finalize(acc) {
    var outcome, mult;
    if (acc.total >= acc.critThreshold) { outcome = 'crit';  mult = MULT.crit + acc.critPower; }
    else if (acc.total >= T.hit)        { outcome = 'hit';   mult = MULT.hit; }
    else if (acc.total >= T.graze)      { outcome = 'graze'; mult = MULT.graze; }
    else                                { outcome = 'miss';  mult = MULT.miss; }

    var dmg = Math.floor((acc.baseDamage + acc.damageBonus) * mult);
    return {
        raw: acc.raw,
        total: acc.total,
        critThreshold: acc.critThreshold,
        outcome: outcome,
        mult: mult,
        damage: Math.max(0, dmg),
        hit: outcome !== 'miss',
        flags: acc.flags,
        parts: acc.parts
    };
}

/* Единственная точка расчёта атаки. */
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
    var dmg = Math.max(0, num(p.damage));
    if (p.canDefend === false) {
        return { outcome: 'none', label: 'Защита невозможна', reduced: 0, damageTaken: dmg };
    }
    /* defMod — поправка от опьянения и Бадуна, считается defenseModifier(). */
    var roll = num(p.roll) + num(p.defMod), cut = 0, outcome = 'fail', label = 'Полный урон';
    if (roll >= DEF_THRESHOLD.parry) { cut = power.parry; outcome = 'parry'; label = 'Парирование'; }
    else if (roll >= DEF_THRESHOLD.block) { cut = power.block; outcome = 'block'; label = 'Блок'; }
    var taken = Math.max(0, Math.floor(dmg * (1 - cut)));
    return { outcome: outcome, label: label, cutPercent: Math.round(cut * 100), reduced: dmg - taken, damageTaken: taken };
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
    frostbite: 'assets/gear/spells/frostbite.png',
    hangover:  'assets/gear/spells/hangover .png',
    fury:      'assets/gear/spells/banditos_fury.png',
    howl:      'assets/gear/spells/wolf_howl.png',
    king:      'assets/icons/rat_king_icon.png',
    giant:     'assets/icons/bossbandit_icon.png',
    fear:      'assets/icons/alfawolf_icon.png',
    surrounded: 'assets/gear/spells/surrounded.png'
};

/* ══════════════════════════════════════════════════════════════════════
   ПОСТОЯННЫЕ БАФЫ БОССОВ

   В отличие от Клича главаря и Воя альфы, эти НЕ включаются по раунду и не
   кончаются: босс живёт с ними весь бой. Срока нет, счётчика ходов нет —
   значит и гасить нечего.

   Король (Царский Пацюк)  +1 к своему броску атаки
   Гигант (Главарь)        +2 к своей защите
   Аура устрашения (Лютоволк) -1 к броску ВСЕХ ИГРОКОВ, пока он жив

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
var FEAR_AURA = { id: 'fear', kind: 'debuff', name: 'Аура устрашения',
                  icon: EFFECT_ICONS.fear, tooltip: 'Аура устрашения: -1 к броску',
                  modifiers: { atk: -1 } };

/* Ауры, которые поле боя накладывает на КАЖДОГО игрока.
   Считается от живых врагов: издох Лютоволк — аура ушла сама, без единой
   записи в базу. Так же устроено «Уже перехвачен»: факты, а не вёрстка. */
function fieldAuras(enemies) {
    var alive = (enemies || []).filter(function (e) {
        return e && enemyAlive(e);
    });
    var out = [];
    if (alive.some(function (e) { return e.key === FEAR_SOURCE; })) out.push(FEAR_AURA);
    return out;
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

var FROST_TURNS  = 1;      /* обморожение: пропуск одного своего хода */
var FURY_TURNS   = 2;      /* ярость бандитов: два хода */
var FURY_BONUS   = 2;      /* +2 к броску атаки И защиты */
var FURY_ROUND   = 5;      /* на каком раунде кричит главарь */
var HOWL_WARN    = 3;      /* на каком раунде появляется предупреждение */
var HOWL_ROUND   = 5;      /* когда воет */
var HOWL_HEAL    = 0.20;   /* доля МАКСИМАЛЬНОГО HP */
var ICEBOLT_INT  = 2;      /* урон ледяного шипа: интеллект + 2 */
var REVIVE_HP    = 0.25;   /* воскрешение поднимает с четвертью HP */
var REVIVE_MANA  = 10;

/* Общий счёт срока по ходам врага. */
function turnsLeft(enemy, mark, total) {
    if (!mark) return 0;
    var passed = num((enemy || {}).turnNo) - num(mark.setTurn);
    if (passed < 0) passed = 0;
    var left = num(total) - passed;
    return left > 0 ? left : 0;
}

/* --- Обморожение: враг пропускает свой ход ---------------------------- */
function frostLeft(enemy) { return turnsLeft(enemy, (enemy || {}).frostbite, FROST_TURNS); }
function isFrozen(enemy)  { return frostLeft(enemy) > 0; }

/* Факты для записи. Вешается ТОЛЬКО при попадании — промах не морозит. */
function applyFrostbite(enemy, hit) {
    if (!hit) return null;
    return { frostbite: { setTurn: num((enemy || {}).turnNo) } };
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

/* --- Вой альфы: предупреждение на 3-м, лечение на 5-м ------------------ */
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

/* Лечение — доля МАКСИМАЛЬНОГО HP, всем живым своим и себе.
   Выше максимума не переливается. */
function planHowl(enemies) {
    return (enemies || [])
        .filter(function (e) { return num(e.currentHP) > 0; })
        .map(function (e) {
            var heal = Math.floor(num(e.maxHP) * HOWL_HEAL);
            var hp = Math.min(num(e.maxHP), num(e.currentHP) + heal);
            return { id: e.id, heal: hp - num(e.currentHP), facts: { currentHP: hp } };
        });
}

/* --- Воскрешение жреца ------------------------------------------------- */
/* Врождённое, раз в игровой день, стоит маны. Держится на факте:
   игроку пишется день последнего использования. */

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

function canRevive(priest, world) {
    if (!priest || priest.cls !== 'priest') return false;
    if (num(priest.mp) < REVIVE_MANA) return false;
    return !usedToday(priest, 'reviveUsedDay', world);
}
function planRevive(target, priest, world) {
    var hp = Math.max(1, Math.floor(num(target.maxHP) * REVIVE_HP));
    return {
        target: { hp: hp },
        priest: { mp: Math.max(0, num(priest.mp) - REVIVE_MANA),
                  reviveUsedDay: num((world || {}).day) }
    };
}

/* Активен ли произвольный эффект из списка фактов. */
function isEffectActive(e, round) {
    if (!e) return false;
    if (e.duration === 'battle') return true;
    var dur = num(e.duration) || 1;
    return num(e.setRound) + dur - 1 >= num(round);
}

function limitEffects(list) { return list.slice(0, 5); }

function deriveEnemyEffects(enemy, world) {
    var round = num(world.round) || 1;
    var buffs = [], debuffs = [];

    /* Присутствие разбойника: у каждой цели свой счёт, и он в ХОДАХ САМОГО
       ВРАГА. Показываем остаток стаков — он же и есть срок. */
    /* Похоронный марш барда висит и на враге. */
    var esong = songEffect(enemy, round);
    if (esong) (esong.modifiers.atk >= 0 ? buffs : debuffs).push(esong);

    var fl = frostLeft(enemy);
    if (fl > 0) {
        debuffs.push({ id: 'frostbite', icon: EFFECT_ICONS.frostbite, counter: fl,
                       tooltip: 'Обморожение: пропускает ход' });
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

    return { buffs: limitEffects(buffs), debuffs: limitEffects(debuffs) };
}

/* ==========================================================================
   ПОПРАВКА К БРОСКАМ ВРАГА

   Складывает `modifiers` со ВСЕХ его активных эффектов. Сегодня это Клич
   главаря (+2 к атаке и защите) и Похоронный марш барда (-2 к атаке);
   завтра будет что-то ещё, и переписывать вызовы не придётся.

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

    /* Песня барда. Своим она в бафы, врагам в дебафы — знак поправки уже
       заложен в самой песне, разбираться тут не нужно. Гаснет сама по
       номеру раунда: снимать нечего, значит нечего и забыть снять. */
    var song = songEffect(player, round);
    if (song) (song.modifiers.atk >= 0 ? buffs : debuffs).push(song);

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

    /* Окружение: четверо БЛИЖНИХ и больше — минус к броску атаки.
       Дальние в счёт не идут, они воину замахнуться не мешают. */
    if (isSurrounded(player.id, world.enemies)) {
        debuffs.push({
            id: 'surrounded', kind: 'debuff', duration: 'while',
            icon: EFFECT_ICONS.surrounded, tooltip: 'Окружён',
            modifiers: { atk: SURROUND_ATK }
        });
    }

    /* Штраф за передачу предмета — живёт ровно один раунд (раздел 13). */
    if (num(player.noDefendRound) === round) {
        debuffs.push({ id: 'no_defend', icon: null, tooltip: 'Нельзя защищаться в этом раунде' });
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

    return { buffs: limitEffects(buffs), debuffs: limitEffects(debuffs) };
}

/* Может ли игрок защищаться прямо сейчас. */
function canDefend(player, world) {
    return num(player.noDefendRound) !== (num(world.round) || 1);
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
   на 80% и выше. Не стакается: он один. Висит на ПЕРВЫЙ бой нового дня и
   снимается его концом.

   Держится тоже на факте: игроку пишется номер боя, на котором Бадун
   поставлен (hangoverAfterBattle), а в мире растёт счётчик world.battleNo.
   Совпали — Бадун активен. Бой кончился, счётчик вырос — погас сам.
   Снимать нечего, значит нечего и забыть снять.
   ========================================================================== */

var DRUNK_MAX = 5;
var HANGOVER_FROM_STEP = 4;          /* лёг на 80%+ — утром Бадун */

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
        out.push({
            id: 'drunk', kind: 'debuff', duration: 'battle',
            tooltip: 'Опьянение ' + d.pct + '%',
            modifiers: { atk: d.atk, def: d.atk, critChance: d.critChance, critPower: d.critPower }
        });
    }
    if (hasHangover(player, world)) {
        out.push({
            id: 'hangover', kind: 'debuff', duration: 'battle',
            tooltip: 'Бадун',
            modifiers: { atk: -1, def: -1 }
        });
    }
    return out;
}

/* Поправка к броску ЗАЩИТЫ. Отдельной функцией, потому что защита считается
   не через слои, а порогами — передавать надо готовым числом. */
function defenseModifier(player, world) {
    /* Защита от снаряжения и класса. Раньше это число считалось в
       computeCombatValues и не читалось НИГДЕ: щит с «+1 Шанс Защиты» и
       классовая защита воина и жреца молчали. Врагам их защита работала
       через enemyRollModifier — игрокам не работала ничего.
       Зовущий передаёт готовое combat.def полем def. */
    var mod = num((player || {}).def);
    deriveDrunkEffects(player, world).forEach(function (e) {
        mod += num((e.modifiers || {}).def);
    });
    return mod;
}

/* Шанс попасть в своего. Бард привычный — у него начинается только с 80%. */
function allyHitChance(player) {
    var st = drunkStep(player);
    if ((player || {}).cls === 'bard' && st < HANGOVER_FROM_STEP) return 0;
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
        hangoverAfterBattle: st >= HANGOVER_FROM_STEP ? num((world || {}).battleNo) : null
    };
}
/* Заглушка под будущий баф барда: снять Бадун досрочно. */
function clearHangover() { return { hangoverAfterBattle: null }; }

/* ==========================================================================
   8.7 ОБЩАК И БАНК

   Общак — касса партии. Личные кошельки остаются: скидываются в общак
   добровольно, тратит из него только мастер.

   Банк: 5% в НЕДЕЛЮ, начисляются целыми неделями. Считается из фактов —
   сколько лежит и с какого дня, — а не хранится «сколько накапало»:
   иначе число пришлось бы кому-то не забыть обновить.
   ========================================================================== */

var BANK_RATE_PER_WEEK = 0.05;
var BANK_WEEK_DAYS     = 7;

/* Сколько целых недель пролежало. Неполная неделя не считается. */
function bankWeeksPassed(sinceDay, today) {
    var d = num(today) - num(sinceDay);
    if (d < 0) d = 0;
    return Math.floor(d / BANK_WEEK_DAYS);
}

/* Сколько процентов накапало на вклад к этому дню. Округление ВНИЗ:
   банк не выдаёт долей монеты. */
function bankInterest(amount, sinceDay, today) {
    var weeks = bankWeeksPassed(sinceDay, today);
    if (weeks < 1 || num(amount) <= 0) return 0;
    var total = num(amount);
    for (var i = 0; i < weeks; i++) total += Math.floor(total * BANK_RATE_PER_WEEK);
    return total - num(amount);
}

/* Факты для записи после начисления. Вернёт null, если начислять нечего —
   тогда и писать в базу не надо. */
function bankAccrue(vault, today) {
    vault = vault || {};
    var gain = bankInterest(vault.bank, vault.bankDay, today);
    if (gain <= 0) return null;
    var weeks = bankWeeksPassed(vault.bankDay, today);
    return {
        bank: num(vault.bank) + gain,
        earned: num(vault.earned) + gain,
        /* Двигаем метку на целые недели, остаток дня не теряется. */
        bankDay: num(vault.bankDay) + weeks * BANK_WEEK_DAYS
    };
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
    return Math.max(1, Math.floor(num((total || {})[key]) / 2));
}

/* ══════════════════════════════════════════════════════════════════════
   ДВОЙНОЙ ВЫСТРЕЛ ЛУЧНИКА

   Раз в игровой день лучник стреляет ДВАЖДЫ подряд. Цель выбирается
   заново перед каждым выстрелом — можно бить и туда, и сюда.

   Нарочно НЕ делаем отдельную механику: это просто два обычных выстрела.
   Движок считает каждый как всегда, а всё новое — на экране: первая цифра
   застывает, пока летит вторая. Так и правил меньше, и ломаться нечему.

   Держится на двух фактах: день последнего использования и сколько
   выстрелов осталось. Второй сгорает с концом боя, а не копится.

   ══════════════════════════════════════════════════════════════════════
   БЕЗ ПАЛЕВА — РАЗБОЙНИК

   Удар, который НЕ трогает Присутствие: не вешает стак на чистую цель и
   не раскрывает разбойника при повторном ударе по помеченной.

   Обычно второй удар по той же цели выдаёт его с головой (см. раздел
   Присутствия). Здесь этого не происходит — стаки остаются как были.
   ══════════════════════════════════════════════════════════════════════ */

var DOUBLE_SHOT_SHOTS = 2;    /* сколько выстрелов даёт навык */

function canDoubleShot(who, world) {
    if (!who || who.cls !== 'archer') return false;
    if (isRogue(who)) return false;              /* разбойник стреляет иначе */
    return !usedToday(who, 'doubleShotDay', world);
}

function whyCantDoubleShot(who, world) {
    if (!who || who.cls !== 'archer') return 'Двойной выстрел есть только у лучника';
    if (isRogue(who)) return 'С двумя кинжалами вы уже разбойник';
    if (usedToday(who, 'doubleShotDay', world)) return 'Сегодня уже стреляли дважды';
    return '';
}

/* Факты: день и сколько выстрелов осталось. Первый тратится сразу. */
function planDoubleShot(world) {
    return { doubleShotDay: num((world || {}).day), shotsLeft: DOUBLE_SHOT_SHOTS };
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

function canSneakHit(who, world) {
    if (!who || !isRogue(who)) return false;
    return !usedToday(who, 'sneakHitDay', world);
}

function whyCantSneakHit(who, world) {
    if (!who || who.cls !== 'archer') return 'Это умение разбойника';
    if (!isRogue(who)) return 'Нужны ДВА кинжала — иначе вы просто лучник';
    if (usedToday(who, 'sneakHitDay', world)) return 'Сегодня уже били без палева';
    return '';
}

function planSneakHit(world) {
    return { sneakHitDay: num((world || {}).day), sneakNextHit: true };
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

/* Сколько БЛИЖНИХ врагов держат этого героя. Живые и нацеленные на него. */
function meleeAttackersOn(heroId, enemies) {
    var map = enemies || {};
    return Object.keys(map).filter(function (id) {
        var e = map[id];
        return e && enemyAlive(e) && e.aggroTargetId === heroId && isMeleeEnemy(e);
    }).length;
}

/* Список их идентификаторов — по нему бьёт размашистый удар. */
function meleeAttackerIds(heroId, enemies) {
    var map = enemies || {};
    return Object.keys(map).filter(function (id) {
        var e = map[id];
        return e && enemyAlive(e) && e.aggroTargetId === heroId && isMeleeEnemy(e);
    });
}

/* Свободно ли место рядом с героем. Дальние в счёт не идут. */
function canEngageMelee(heroId, enemies) {
    return meleeAttackersOn(heroId, enemies) < SURROUND_CAP;
}

function isSurrounded(heroId, enemies) {
    return meleeAttackersOn(heroId, enemies) >= SURROUND_CAP;
}

/* Усиленный удар. Возвращает ПЛАН: по кому бить, с каким множителем и что
   написать. Ничего не мутирует и ярость не тратит — это дело зовущего.
   Правило: одноручным всегда полтора по одной цели. Двуручным вдвое по
   одной, либо полтора по ВСЕМ ближним, кто держит воина. */
function planPowerStrike(p) {
    var who = p.who || {};
    var ids = meleeAttackerIds(p.heroId, p.enemies);
    /* Цель по умолчанию — та, по которой воин и так бил. */
    var single = p.targetId || ids[0] || null;

    if (!p.twoHanded) {
        return { kind: 'single', mult: POWER_ONE_HAND, targetIds: single ? [single] : [],
                 label: 'Мощный удар', cost: POWER_STRIKE_COST };
    }
    if (ids.length >= 2) {
        return { kind: 'sweep', mult: POWER_TWO_SWEEP, targetIds: ids,
                 label: 'Размашистый удар', cost: POWER_STRIKE_COST };
    }
    return { kind: 'single', mult: POWER_TWO_SINGLE, targetIds: single ? [single] : [],
             label: 'Мощный удар', cost: POWER_STRIKE_COST };
}

/* Применение усиленного удара к УЖЕ посчитанному итогу — как усиление
   Арканой: удваивается результат, а не база. Возвращает факты, ничего
   не мутирует. Ярость списывает зовущий по полю spend. */
function applyPowerStrike(damage, mult) {
    /* ВНИМАНИЕ: num() здесь — это parseInt, он режет дробное. Множитель
       через него пропускать НЕЛЬЗЯ: num(1.5) даёт единицу, и полуторный
       удар молча превращается в обычный. Урон — целый, его через num можно.
       Так же сделано в applyEmpower: множитель идёт мимо num. */
    var k = Number(mult);
    if (!isFinite(k) || k <= 0) k = 1;
    return Math.max(0, Math.round(num(damage) * k));
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
    var dmg = Math.max(0, num(p.damage));
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
        var left = Math.max(0, was - def.damageTaken);
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
var SURROUND_ATK     = -1;     /* дебаф «Окружён»: поправка к броску атаки */
var POWER_STRIKE_COST = 5;     /* ярости за усиленный удар */
var POWER_ONE_HAND   = 1.5;    /* одноручным — всегда полтора */
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
    var hp = Math.max(1, Math.floor(num(who.maxHP) * SECOND_WIND_HP));
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
    var gain = Math.floor(num(who.maxMP) * MEDITATE_SHARE);
    return {
        mp: Math.min(num(who.maxMP), num(who.mp) + gain),
        meditateUsedDay: num((world || {}).day),
        skipsTurn: true                       /* ход потрачен целиком */
    };
}

/* ══════════════════════════════════════════════════════════════════════
   ПЕСНИ БАРДА

   Два умения с самого начала, обе стоят Настроения и держатся ОДИН ход:

     Заводной рифф   — всем своим +2 к броску атаки
     Похоронный марш — всем врагам −2 к броску атаки

   Срок в ОДИН ход, поэтому меряем раундом, а не ходами врага: песня
   звучит на весь раунд, а не догоняет каждого по очереди. Это отличает
   её от Присутствия и обморожения, где срок висит на конкретном враге.

   Барду нужен ИНСТРУМЕНТ: без него он не поёт, как и не дерётся.
   ══════════════════════════════════════════════════════════════════════ */

var SONG_COST   = 5;      /* Настроения за песню */
var SONG_ROUNDS = 2;      /* держится ДВА раунда: песня стоит целого хода,
                             и за один раунд она его не окупала — бард пел
                             вместо того, чтобы бить, и партия с ним
                             побеждала РЕЖЕ. За два раунда пропущенный ход
                             окупается, и между песнями бард успевает бить. */
var SONG_BONUS  = 2;      /* своим +2 к броску */
var SONG_MALUS  = 2;      /* врагам −2 к броску */

var SONGS = {
    groovy_riff:  { name: 'Заводной рифф',   target: 'allies',
                    atk:  SONG_BONUS, icon: 'assets/gear/spells/groovy_riff.png' },
    funeral_march:{ name: 'Колкая подъёбочка', target: 'enemies',
                    atk: -SONG_MALUS, icon: 'assets/gear/spells/diss_track.png' }
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

   Пороги те же, что у обычного броска, — чтобы игрок не учил вторую
   таблицу. Крит считается ОТ ТОЙ ЖЕ силы крита, что и в бою.
   ══════════════════════════════════════════════════════════════════════ */

/* Пороги исполнения. У бафов и дебафов они СВОИ, ниже боевых, и намеренно:
   провалить баф обиднее, чем промахнуться мечом. Мечом махнёшь ещё раз в
   следующем раунде, а песня стоит целого хода и пяти Настроения — терять
   всё это на кубике было слишком дорого.

   Было 8 и 13 (как в бою), стало 4 и 8: промах теперь редкость, а не рутина.
   Эти же пороги возьмут будущие заклинания-бафы, когда появятся. */
var SONG_MISS = 4;      /* ниже — мимо нот */
var SONG_HALF = 8;      /* ниже — криво, но узнаваемо */

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
    return v > 0 ? Math.ceil(v) : Math.floor(v);
}

/* Может ли бард спеть: класс, инструмент, Настроение. */
function canSing(who, song) {
    if (!who || who.cls !== 'bard') return false;
    if (!SONGS[song]) return false;
    if (!String(who.mainhand || '')) return false;      /* нечем играть */
    return num(who.resource) >= SONG_COST;
}

/* Почему нельзя — коротким текстом для интерфейса. */
function whyCantSing(who, song) {
    if (!who || who.cls !== 'bard') return 'Петь умеет только бард';
    if (!SONGS[song]) return 'Такой песни нет';
    if (!String(who.mainhand || ''))
        return 'Вы видели мои руки? Они созданы для музыки и любви, а не для мордобоя';
    if (num(who.resource) < SONG_COST) return 'Не хватает Настроения';
    return '';
}

/* Факты песни: кому и до какого раунда. Пишутся тем, на кого она легла. */
/* Факт спетой песни. ВЕЛИЧИНА КЛАДЁТСЯ СЮДА: она зависит от броска на
   исполнение, а не от самой песни. Без неё крит и кривая игра ничего не
   меняли — songModifier брал базовое значение, и виртуоз давал столько же,
   сколько промах.

   Ноль величины — песня не легла: факт не ставим вовсе. */
function planSong(song, round, size) {
    var s = SONGS[song];
    if (!s) return null;
    var v = (size === undefined) ? num(s.atk) : num(size);
    if (!v) return { target: s.target, facts: null };
    return { target: s.target,
             /* until — ПОСЛЕДНИЙ раунд, когда песня ещё звучит, поэтому
                минус один: раунд исполнения уже входит в SONG_ROUNDS.
                Без этого песня жила на раунд дольше правила — счётчик
                показывал 3 при SONG_ROUNDS = 2. */
             facts: { song: { id: song, until: num(round) + SONG_ROUNDS - 1, size: v } } };
}

/* Действует ли песня на этом раунде. */
function songActive(who, round) {
    var sg = (who || {}).song;
    return !!(sg && SONGS[sg.id] && num(sg.until) >= num(round));
}

/* Поправка к броску от песни. Плюс своим, минус врагам — знак уже
   заложен в самой песне, отдельного правила не нужно. */
/* Поправка от песни — СЫГРАННАЯ, а не базовая. У старых записей поля size
   нет, для них берём базовую: правило совместимости, читающая сторона
   обязана переживать отсутствие новых полей. */
function songModifier(who, round) {
    if (!songActive(who, round)) return 0;
    var f = who.song;
    return f.size !== undefined ? num(f.size) : num(SONGS[f.id].atk);
}

/* Эффект для показа: иконка, подпись, сколько осталось. */
/* Значок песни в строке эффектов. Показываем СЫГРАННУЮ величину и сколько
   раундов осталось: раньше подпись врала — при кривом исполнении она всё
   равно обещала полную прибавку. */
function songEffect(who, round) {
    if (!songActive(who, round)) return null;
    var s = SONGS[who.song.id], left = num(who.song.until) - num(round) + 1;
    var size = songModifier(who, round);
    return { id: 'song', kind: size > 0 ? 'buff' : 'debuff',
             name: s.name, icon: s.icon, counter: left,
             tooltip: s.name + ': ' + (size > 0 ? '+' : '') + size
                      + ' к броску, осталось раундов ' + left,
             modifiers: { atk: size } };
}

/* ==========================================================================
   9. МЕСТЬ  (раздел 5)
   Возвращает ТОЛЬКО факты для записи во врага. Никаких «сбросить чужой флаг».
   ========================================================================== */

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

    /* Иначе нужна СЕРИЯ попаданий подряд. Сколько именно — зависит от того,
       как держат линию: забитый фронт прорывают с первого выстрела. */
    var need = revengeStreakNeeded({
        meleeEnemies: p.meleeEnemies, frontHeroes: p.frontHeroes,
        isBoss: !!(enemy.isUnique || p.isBoss)
    });
    var streak = enemy.rangedHitStreak;
    var count = (streak && streak.playerId === p.attackerId) ? num(streak.count) + 1 : 1;
    if (count >= need) {
        var res = instant('💢 Взбешён и идёт на тыловика! (' + need + ' подряд)');
        res.announce = true;   // раздел 5: показывать КАЖДЫЙ раз
        res.streakNeeded = need;
        return res;
    }
    return { changed: true, instant: false, reason: null, streakNeeded: need,
             facts: { rangedHitStreak: { playerId: p.attackerId, count: count } } };
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

    /* Первый удар вешает сразу три стака и не раскрывает. */
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
            aggroReason: '👻 Присутствие раскрыто!'
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
        return alive && (e.role === 'front' || (e.role === undefined && !e.isRanged));
    });
    if (living.length === 0) return [];
    var half = p.difficulty === 'hard' ? Math.ceil(living.length / 2) : Math.floor(living.length / 2);
    var take = Math.max(1, half);
    var rng = p.rng || Math.random;
    var shuffled = living.slice().sort(function () { return rng() - 0.5; });
    return shuffled.slice(0, take);
}

/* Каждый отобранный кидает СВОЙ шанс. Все успешные бьют. */
function rollIntercepts(p) {
    var rng = p.rng || Math.random;
    var chance = (p.chance === undefined) ? INTERCEPT_CHANCE : p.chance;
    var ok = [], fail = [];
    (p.candidates || []).forEach(function (e) {
        if (rng() < chance) ok.push(e); else fail.push(e);
    });
    return {
        succeeded: ok,
        failed: fail,
        combinedAtk: ok.reduce(function (s, e) { return s + num(e.atk); }, 0)
    };
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

/* ==========================================================================
   11.5 КОГО БЬЁТ ВРАГ  (раздел 4)
   Правило живёт здесь, а не в дашборде: иначе телефон и дашборд снова начнут
   по-разному понимать, кто доступен для удара.
   ========================================================================== */

/* candidates: [{ id, alive, role, stealth }]. stealth — разбойник, которого
   никто не держит в таргете; в пул целей он не попадает. */
function pickEnemyTarget(p) {
    var enemy = p.enemy || {};
    var rng = p.rng || Math.random;
    var pool = (p.candidates || []).filter(function (c) { return c.alive && !c.stealth; });
    if (!pool.length) return null;

    /* 1. Уже выбранная цель, пока она жива и доступна. */
    var kept = pool.filter(function (c) { return c.id === enemy.aggroTargetId; })[0];
    if (kept) return { id: kept.id, reason: 'держит цель' };

    /* 2. Место рядом с героем не бесконечно: больше SURROUND_CAP БЛИЖНИХ
       вокруг одного не помещается. Дальние толпы не создают и кап не
       чувствуют — они стоят в стороне.
       Зовущий может не передавать enemies: тогда правило молчит, как раньше. */
    var melee = isMeleeEnemy(enemy);
    var free = pool;
    if (melee && p.enemies) {
        var notFull = pool.filter(function (c) {
            return canEngageMelee(c.id, p.enemies);
        });
        /* Если места нет вообще нигде — драться всё равно надо, иначе враг
           зависнет. Тогда кап отступает, но это край, а не норма. */
        if (notFull.length) free = notFull;
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
    var roll = num(p.roll);
    var atk = num((p.enemy || {}).atk);
    var outcome, mult;
    if (roll >= T.crit) { outcome = 'crit'; mult = MULT.crit; }
    else if (roll >= T.hit) { outcome = 'hit'; mult = MULT.hit; }
    else if (roll >= T.graze) { outcome = 'graze'; mult = MULT.graze; }
    else { outcome = 'miss'; mult = MULT.miss; }
    return { roll: roll, outcome: outcome, mult: mult, hit: outcome !== 'miss',
             damage: Math.max(0, Math.floor(atk * mult)) };
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
        return { action: 'flee', reason: enemy.name + ' остался один и удирает в лес' };
    }
    var rng = p.rng || Math.random;
    return rng() < 0.5
        ? { action: 'confused', reason: enemy.name + ' остался один и растерялся — теряет ход' }
        : { action: 'fight' };
}

/* Смерть вожака ломает мораль стаи: рядовые волки разбегаются. */
function packScatter(p) {
    if (!isPackLeader(p.deadEnemy)) return [];
    return (p.aliveEnemies || []).filter(isPackMember);
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
var SPAWN_PER_PLAYER_MAX = 2;      /* до пяти игроков — вдвое */
var SPAWN_PER_PLAYER_MIN = 1.5;    /* за восемью столами дальше не режем */

function spawnCapRatio(playerCount) {
    var n = Math.max(1, num(playerCount));
    if (SPAWN_PER_PLAYER_CAP[n]) return SPAWN_PER_PLAYER_CAP[n];
    return n < 5 ? SPAWN_PER_PLAYER_MAX : SPAWN_PER_PLAYER_MIN;
}

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
    var hp = Math.floor(num(base.maxHP || base.hp) * ratio);
    return Object.assign({}, base, { hp: hp, maxHP: hp, atk: Math.floor(num(base.atk) * ratio) });
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
var TROPHY_BY_KIND = {
    fat_rat:   { ok: 'rat_tail',  perfect: 'rat_tail_perfect' },
    rat_king:  { ok: 'rat_tail',  perfect: 'rat_tail_perfect' },
    wild_wolf: { ok: 'wolf_ear',  perfect: 'wolf_ear_perfect' },
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

   ОСТОРОЖНО С `num()`. Коэффициент 1.5 через него пропускать НЕЛЬЗЯ —
   parseInt даст единицу, и полуторный множитель исчезнет молча, без единой
   красной проверки. Поэтому goldMult идёт через Number, а не через num.

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
        gold: Math.round(perHead * num(p.playerCount) * gm),
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
   сознание, и вечер он всё равно отыграл. Отсюда и рельсы под будущую
   церковь: поднимать павшего за деньги имеет смысл только если он не
   отстаёт по уровню от остальных.

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

    var hp = Math.max(1, Math.round(num(e.hp) * k.hp));
    var maxHP = Math.max(1, Math.round(num(e.maxHP != null ? e.maxHP : e.hp) * k.hp));
    var out = {};
    for (var key in e) out[key] = e[key];
    out.hp = hp;
    out.maxHP = maxHP;
    if (e.currentHP !== undefined) out.currentHP = hp;
    /* Атака: ноль остаётся нулём — безоружного закалка не вооружает. */
    if (num(e.atk) > 0) out.atk = Math.max(1, Math.round(num(e.atk) * k.atk));
    return out;
}

/* ══════════════════════════════════════════════════════════════════════
   АРКАНА МАГА И ВЕРА ЖРЕЦА

   Устроены ОДИНАКОВО, поэтому и считаются одним кодом: шкала 0..100,
   которую тратят, чтобы усилить заклинание. Разница только в том, откуда
   она берётся.

   АРКАНА копится сама, как кешбэк: 20 за каждый ПЛАТНЫЙ по мане каст.
   Бесплатное действие ничего не даёт — иначе шкала набивалась бы ударами
   палкой. Не сбрасывается никогда: ни между боями, ни между днями. Копится,
   пока маг её не потратит.

   ВЕРА не копится сама — её жертвуют в церкви. Механика та же, источник
   другой: помолился, заплатил, шкала наполнилась.

   ТРАТА — ВЫБОР ИГРОКА, а не автомат. Можно снять 50 и усилить вполовину,
   можно снять всю сотню и удвоить. Отсюда две кнопки под заклинанием, и
   каждая доступна лишь когда на шкале хватает.

   ЧТО ИМЕННО УСИЛЯЕТСЯ: ИТОГ. Не базовый урон, а то число, что получилось
   ПОСЛЕ всех бонусов, крита и прочего. Поэтому усиление применяется
   последним и ничего не знает про слои до себя.
   ══════════════════════════════════════════════════════════════════════ */

var POWER_MAX      = 100;   /* полная шкала */
var POWER_PER_CAST = 20;    /* кешбэк за платный по мане каст, база */
var POWER_PER_STEP = 2;     /* +2 к кешбэку за ступень ИНТЕЛЛЕКТА мага */
var POWER_STEPS    = [50, 100];   /* сколько можно снять за раз */

/* Кешбэк за каст. Растёт от интеллекта: умный маг копит усиление быстрее.
   Третий аргумент — интеллект; без него ведёт себя как раньше. */
function powerCashback(int) {
    return POWER_PER_CAST + statSteps(int) * POWER_PER_STEP;
}

/* Шкала после каста. Растёт ТОЛЬКО с платного по мане, выше сотни не идёт. */
function powerAfterCast(current, manaCost, int) {
    if (num(manaCost) <= 0) return clamp(num(current), 0, POWER_MAX);
    return clamp(num(current) + powerCashback(int), 0, POWER_MAX);
}

/* Можно ли снять столько. Ступень обязана быть из списка: «усилю на 37»
   не бывает, иначе кнопок стало бы бесконечно много. */
function canEmpower(current, step) {
    if (POWER_STEPS.indexOf(num(step)) < 0) return false;
    return num(current) >= num(step);
}

/* Во сколько раз вырастет ИТОГ и сколько останется на шкале.
   50 -> в полтора раза, 100 -> вдвое. */
function planEmpower(current, step) {
    if (!canEmpower(current, step)) return null;
    return {
        multiplier: 1 + num(step) / 100,
        left: clamp(num(current) - num(step), 0, POWER_MAX),
        spent: num(step)
    };
}

/* Усиление ИТОГА. Зовётся ПОСЛЕДНИМ, поверх всего посчитанного. */
function applyEmpower(value, step) {
    var plan = planEmpower(POWER_MAX, step);      /* проверка ступени */
    if (!plan) return num(value);
    return Math.round(num(value) * plan.multiplier);
}

/* Ступени, доступные при такой шкале — для кнопок в интерфейсе. */
function empowerSteps(current) {
    return POWER_STEPS.filter(function (st) { return canEmpower(current, st); });
}

/* ══════════════════════════════════════════════════════════════════════
   ЦЕРКОВЬ

   Поднимает павшего за деньги ОБЩАКА и возвращает ПОЛНОЕ здоровье — этим
   она и отличается от воскрешения жреца, которое даёт четверть и работает
   в бою. Цена приходит снаружи: в каждом городе своя церковь со своей.
   ══════════════════════════════════════════════════════════════════════ */

/* ПОЖЕРТВОВАНИЕ. Два вида: скромное и щедрое. Сколько стоит и сколько
   даёт — приходит СНАРУЖИ, из описания церкви: в каждом городе свой храм со
   своими ценами. Движок отвечает только на «хватает ли» и «что станет».

   Вера выше сотни не растёт: пожертвовал при полной шкале — деньги ушли бы
   впустую, поэтому такой платёж не проходит вовсе. */
function canDonate(vault, faith, price, gain) {
    if (num((vault || {}).gold) < num(price)) return false;
    if (num(gain) <= 0) return false;
    return num(faith) < POWER_MAX;              /* полную шкалу не доливают */
}
function whyCantDonate(vault, faith, price, gain) {
    if (num(gain) <= 0) return 'Это пожертвование ничего не даёт';
    if (num(faith) >= POWER_MAX) return 'Вера и так полна — деньги пропадут зря';
    if (num((vault || {}).gold) < num(price))
        return 'В общаке не хватает: нужно ' + num(price);
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

function canHireMerc(hiredDay, today) {
    if (!num(hiredDay)) return true;              /* ни разу не нанимали */
    return num(today) - num(hiredDay) >= MERC_COOLDOWN;
}
function whyCantHireMerc(hiredDay, today) {
    if (canHireMerc(hiredDay, today)) return '';
    var left = MERC_COOLDOWN - (num(today) - num(hiredDay));
    return 'Наёмник отдыхает: ещё ' + left + ' дн.';
}

function canBuy(item, purse) {
    if (!item || num(item.cost) <= 0) return false;
    return num(purse) >= num(item.cost);
}
function whyCantBuy(item, purse) {
    if (!item) return 'Товар не выбран';
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
function whyCantChurchRevive(target, vault, price) {
    if (!target) return 'Некого поднимать';
    if (num(target.hp) > 0) return 'Этот герой в сознании';
    if (num((vault || {}).gold) < num(price))
        return 'В общаке не хватает: нужно ' + num(price);
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

/* Воин выходит в бой с ОДНИМ зарядом — ровно на Второе дыхание или на один
   усиленный удар. Это и есть выбор: потратил на удар в первом раунде —
   под четырьмя врагами упадёшь на третьем и можешь не встать.
   Раньше шкала начиналась с нуля, и оба навыка стоимостью 5 были недоступны
   в тех боях, ради которых придуманы: воин падал раньше, чем копил. */
var RAGE_ON_START = 5;
function rageOnBattleStart() { return RAGE_ON_START; }

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
function moodAfterBattle(current, maxMood) {
    return Math.max(num(current), Math.floor(num(maxMood) * 0.5));  /* раздел 7: до 50% */
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
    return byBard ? m : Math.ceil(m * MOOD_ALLY_SHARE);
}
function moodAfterDrink(current, maxMood, item, byBard) {
    return Math.min(num(maxMood), num(current) + moodFromDrink(item, byBard));
}

/* На нуле Настроения бард не играет и не бьёт — только защищается. */
function canBardAct(player) {
    if ((player || {}).cls !== 'bard') return true;
    return num((player || {}).resource) > 0;
}

/* Второе действие раунда — это ЛИБО защита, ЛИБО зелье/передача предмета.
   Алкоголь особый: он действие не тратит, пить можно всегда. */
function consumesSecondAction(item) {
    if (!item) return false;
    if (item.effect === 'booze') return false;
    return item.type === 'consumable' || item.type === 'quest' || item.type === 'gear';
}

/* ==========================================================================
   13. ЭКСПОРТ
   ========================================================================== */

global.CombatRules = {
    VERSION: VERSION,
    T: T, MULT: MULT, DEF_THRESHOLD: DEF_THRESHOLD, DEF_POWER: DEF_POWER,
    INTERCEPT_CHANCE: INTERCEPT_CHANCE, PRESENCE_STACKS: PRESENCE_STACKS,
    presenceStacks: presenceStacks, presenceRevealTargets: presenceRevealTargets,
    turnsLeft: turnsLeft, frostLeft: frostLeft, isFrozen: isFrozen,
    applyFrostbite: applyFrostbite, furyLeft: furyLeft, shouldRoarFury: shouldRoarFury,
    planFury: planFury, howlWarns: howlWarns, shouldHowl: shouldHowl, planHowl: planHowl,
    canRevive: canRevive, planRevive: planRevive,
    FROST_TURNS: FROST_TURNS, FURY_TURNS: FURY_TURNS, FURY_BONUS: FURY_BONUS,
    FURY_ROUND: FURY_ROUND,
    HOWL_WARN: HOWL_WARN, HOWL_ROUND: HOWL_ROUND, HOWL_HEAL: HOWL_HEAL,
    ICEBOLT_INT: ICEBOLT_INT, REVIVE_HP: REVIVE_HP, REVIVE_MANA: REVIVE_MANA,
    presenceOnOtherHit: presenceOnOtherHit,
    REVENGE_STREAK: REVENGE_STREAK, REVENGE_STREAK_BOSS: REVENGE_STREAK_BOSS,
    REVENGE_LOW_HP: REVENGE_LOW_HP, LINE_PRESSURE: LINE_PRESSURE,
    linePressure: linePressure, revengeStreakNeeded: revengeStreakNeeded,
    CLASS_TABLE: CLASS_TABLE, GEAR_FOLDERS: GEAR_FOLDERS, STATS: STATS,
    WEAPON_KEYS: WEAPON_KEYS, EFFECT_ICONS: EFFECT_ICONS,
    RAGE_BASE: RAGE_BASE, RAGE_PER_STEP: RAGE_PER_STEP,
    SURROUND_CAP: SURROUND_CAP, SURROUND_ATK: SURROUND_ATK,
    POWER_STRIKE_COST: POWER_STRIKE_COST,
    POWER_ONE_HAND: POWER_ONE_HAND, POWER_TWO_SINGLE: POWER_TWO_SINGLE,
    POWER_TWO_SWEEP: POWER_TWO_SWEEP,
    enemyHP: enemyHP, enemyAlive: enemyAlive,
    isMeleeEnemy: isMeleeEnemy, meleeAttackersOn: meleeAttackersOn,
    meleeAttackerIds: meleeAttackerIds, canEngageMelee: canEngageMelee,
    isSurrounded: isSurrounded, planPowerStrike: planPowerStrike,
    canPowerStrike: canPowerStrike, whyCantPowerStrike: whyCantPowerStrike,
    applyPowerStrike: applyPowerStrike, powerStrikeMult: powerStrikeMult,
    resolveSweep: resolveSweep, sweepSummary: sweepSummary,
    MOOD_BASE: MOOD_BASE, MOOD_PER_STEP: MOOD_PER_STEP,
    STAT_FLOOR: STAT_FLOOR,

    rollDice: rollDice, diceMin: diceMin,
    getRole: getRole, roleIcon: roleIcon, isRogue: isRogue, hasDualDaggers: hasDualDaggers,
    canEquip: canEquip,
    computeStats: computeStats, computeVitals: computeVitals, computeCombatValues: computeCombatValues,
    resolveRoll: resolveRoll, resolveDefense: resolveDefense,
    deriveEnemyEffects: deriveEnemyEffects, derivePlayerEffects: derivePlayerEffects,
    isEffectActive: isEffectActive, canDefend: canDefend, isTargetable: isTargetable,
    statSteps: statSteps, STAT_STEP: STAT_STEP,
    isUnarmed: isUnarmed, canFightUnarmed: canFightUnarmed,
    unarmedDamage: unarmedDamage, UNARMED_STAT: UNARMED_STAT,
    DRUNK_STEPS: DRUNK_STEPS, DRUNK_MAX: DRUNK_MAX, HANGOVER_FROM_STEP: HANGOVER_FROM_STEP,
    drunkStep: drunkStep, drunkPercent: drunkPercent, hasHangover: hasHangover,
    deriveDrunkEffects: deriveDrunkEffects, defenseModifier: defenseModifier,
    allyHitChance: allyHitChance, rollsIntoAlly: rollsIntoAlly,
    drunkAfterBattle: drunkAfterBattle, drunkAfterSleep: drunkAfterSleep,
    clearHangover: clearHangover,
    resolveRevenge: resolveRevenge,
    resolveSkinning: resolveSkinning, trophyFor: trophyFor, isSkinnable: isSkinnable,
    planLoot: planLoot, lootMultiplier: lootMultiplier, SKIN_THRESHOLD: SKIN_THRESHOLD,
    planXP: planXP, enemyRollModifier: enemyRollModifier,
    namedDrops: namedDrops, isRandomLoot: isRandomLoot,
    POWER_MAX: POWER_MAX, POWER_PER_CAST: POWER_PER_CAST, POWER_STEPS: POWER_STEPS,
    POWER_PER_STEP: POWER_PER_STEP, powerCashback: powerCashback,
    powerAfterCast: powerAfterCast, canEmpower: canEmpower, planEmpower: planEmpower,
    applyEmpower: applyEmpower, empowerSteps: empowerSteps,
    canDonate: canDonate, whyCantDonate: whyCantDonate, planDonation: planDonation,
    canBuy: canBuy, whyCantBuy: whyCantBuy, planBuy: planBuy,
    canHireMerc: canHireMerc, whyCantHireMerc: whyCantHireMerc,
    MERC_COOLDOWN: MERC_COOLDOWN,
    canChurchRevive: canChurchRevive, whyCantChurchRevive: whyCantChurchRevive,
    planChurchRevive: planChurchRevive,
    sceneHPMult: sceneHPMult, sceneAtkMult: sceneAtkMult,
    sceneMult: sceneMult, sceneMults: sceneMults, SCENE_MULTS: SCENE_MULTS,
    toughenEnemy: toughenEnemy,
    fieldAuras: fieldAuras, BOSS_AURAS: BOSS_AURAS, FEAR_AURA: FEAR_AURA,
    planSpawn: planSpawn, spawnMultiplier: spawnMultiplier, buffEnemy: buffEnemy,
    spawnCap: spawnCap, spawnCapRatio: spawnCapRatio,
    SPAWN_PER_PLAYER_CAP: SPAWN_PER_PLAYER_CAP,
    evaluateLastStand: evaluateLastStand, packScatter: packScatter,
    isPackMember: isPackMember, isPackLeader: isPackLeader,
    pickEnemyTarget: pickEnemyTarget, resolveEnemyAttack: resolveEnemyAttack, buildQueue: buildQueue,
    resolvePresence: resolvePresence, clearPresenceIfOther: clearPresenceIfOther,
    pickInterceptors: pickInterceptors, rollIntercepts: rollIntercepts,
    shouldCheckIntercept: shouldCheckIntercept, markInterceptAttempt: markInterceptAttempt,
    bankInterest: bankInterest, bankAccrue: bankAccrue, bankWeeksPassed: bankWeeksPassed,
    BANK_RATE_PER_WEEK: BANK_RATE_PER_WEEK, BANK_WEEK_DAYS: BANK_WEEK_DAYS,
    rageOnBattleStart: rageOnBattleStart, rageAfter: rageAfter, moodAfterBattle: moodAfterBattle,
    moodAfterAttack: moodAfterAttack, moodFromDrink: moodFromDrink,
    moodOnEnemyDeath: moodOnEnemyDeath, moodOnHitTaken: moodOnHitTaken,
    moodOnAllyCrit: moodOnAllyCrit, rageGainsOnDefense: rageGainsOnDefense,
    SONGS: SONGS, SONG_COST: SONG_COST, SONG_ROUNDS: SONG_ROUNDS,
    canDoubleShot: canDoubleShot, whyCantDoubleShot: whyCantDoubleShot,
    planDoubleShot: planDoubleShot, shotsLeft: shotsLeft, afterShot: afterShot,
    DOUBLE_SHOT_SHOTS: DOUBLE_SHOT_SHOTS,
    canSneakHit: canSneakHit, whyCantSneakHit: whyCantSneakHit,
    planSneakHit: planSneakHit, isSneakHit: isSneakHit,
    resolvePresenceSneaky: resolvePresenceSneaky,
    usedToday: usedToday, mercLevel: mercLevel, hasItem: hasItem,
    canSecondWind: canSecondWind, whyCantSecondWind: whyCantSecondWind,
    planSecondWind: planSecondWind, SECOND_WIND_HP: SECOND_WIND_HP,
    SECOND_WIND_COST: SECOND_WIND_COST,
    canMeditate: canMeditate, whyCantMeditate: whyCantMeditate,
    planMeditate: planMeditate, MEDITATE_SHARE: MEDITATE_SHARE,
    canSing: canSing, whyCantSing: whyCantSing, planSong: planSong,
    songOutcome: songOutcome, songPower: songPower, songEffectSize: songEffectSize,
    SONG_LABEL: SONG_LABEL, SONG_MISS: SONG_MISS, SONG_HALF: SONG_HALF,
    songActive: songActive, songModifier: songModifier, songEffect: songEffect,
    MOOD_PER_ALLY_CRIT: MOOD_PER_ALLY_CRIT,
    MOOD_PER_ENEMY_DEATH: MOOD_PER_ENEMY_DEATH, MOOD_LOST_WHEN_HIT: MOOD_LOST_WHEN_HIT,
    moodAfterDrink: moodAfterDrink, canBardAct: canBardAct,
    consumesSecondAction: consumesSecondAction,
    MOOD_BASE: MOOD_BASE, MOOD_PER_STEP: MOOD_PER_STEP,
    MOOD_PER_ATTACK: MOOD_PER_ATTACK, MOOD_ALLY_SHARE: MOOD_ALLY_SHARE
};

})(typeof window !== 'undefined' ? window : globalThis);
