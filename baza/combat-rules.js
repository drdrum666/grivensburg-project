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
    bard:    ['bard', 'archer']   /* TODO: своей папки у барда пока нет */
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

/* Рост статов. Числа расписаны внутри функции, у самого цикла — здесь их
   намеренно НЕТ, чтобы не было второго места, которое надо не забыть
   поправить. Тут стояло «главный +1 за уровень, остальные +1 каждые три»:
   правило отменено, а подпись пережила его и врала читающему. */
function computeStats(p) {
    var cls = CLASS_TABLE[p.cls] ? p.cls : 'warrior';
    var tbl = CLASS_TABLE[cls];
    var race = p.raceBonus || {};
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

/* HP: 10 + сила×2 у ВСЕХ классов, жрецу прибавки за интеллект нет.
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
    var maxHP = 10 + num(t.str) * 2;
    var maxMP = num(t.int) * 2;

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
    ready:     'assets/gear/spells/ready.png',
    hamstring: 'assets/gear/spells/immobilized.png',
    hunterMark: 'assets/gear/spells/target.png',
    burn:      'assets/gear/spells/burn.png',
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

   В отличие от Клича главаря и Воя альфы, эти НЕ включаются по раунду и не
   кончаются: босс живёт с ними весь бой. Срока нет, счётчика ходов нет —
   значит и гасить нечего.

   Король (Царский Пацюк)  +1 к своему броску атаки
   Гигант (Главарь)        +1 к своей защите
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
var FEAR_AURA = { id: 'fear', kind: 'debuff', duration:'while', name: 'Аура устрашения',
                  icon: EFFECT_ICONS.fear, tooltip: 'Аура устрашения: -1 к броску',
                  modifiers: { atk: -1 } };

/* Ауры, которые поле боя накладывает на КАЖДОГО игрока.
   Считается от живых врагов: издох Лютоволк — аура ушла сама, без единой
   записи в базу. Так же устроено «Уже перехвачен»: факты, а не вёрстка. */
function fieldAuras(enemies, world) {
    var alive = (enemies || []).filter(function (e) {
        return e && enemyAlive(e);
    });
    var out = [];
    if (alive.some(function (e) { return e.key === FEAR_SOURCE; })) out.push(suppressInspiringEffect(FEAR_AURA,world));
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

var FROST_TURNS  = 1;      /* обездвиживание до конца ближайшего своего хода */
var BURN_TURNS   = 2;
var BURN_RATE    = 0.10;
var FURY_TURNS   = 2;      /* ярость бандитов: два хода */
var FURY_BONUS   = 2;      /* +2 к броску атаки И защиты */
var FURY_ROUND   = 5;      /* на каком раунде кричит главарь */
var HOWL_WARN    = 3;      /* на каком раунде появляется предупреждение */
var HOWL_ROUND   = 5;      /* когда воет */
var HOWL_HEAL    = 0.20;   /* доля МАКСИМАЛЬНОГО HP */
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
        damage: Math.ceil(num(damage) * BURN_RATE),
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
    var hp = Math.min(num(enemy.maxHP), hpAfterDamage(enemy.currentHP, -Math.floor(num(enemy.potionHeal))));
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
    var hp = Math.max(1, Math.floor(num(target.maxHP) * lv / 100));
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

function limitEffects(list) { return list.slice(0, 5); }

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

    return { buffs: limitEffects(buffs), debuffs: limitEffects(debuffs) };
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

    /* Песня барда. Своим она в бафы, врагам в дебафы — знак поправки уже
       заложен в самой песне, разбираться тут не нужно. Гаснет сама по
       номеру раунда: снимать нечего, значит нечего и забыть снять. */
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
            tooltip: 'Глухая оборона: +' + shieldDefBonus(player) + ' к броску защиты · осталось ' + shieldChargesLeft(player) + ' из 4 срабатываний',
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

    /* ДОП ДЕЙСТВИЕ ПОТРАЧЕНО — живёт ровно один раунд. Защиту оно больше
       не отнимает (решение автора 28.09.2026): подпись говорит только, что
       слот занят. */
    if (num(player.extraActionRound) === round) {
        debuffs.push({ id: 'extra_used', icon: null,
            tooltip: 'Доп действие потрачено в этом раунде' });
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
    CONTROL_KEYS.forEach(function(k){var left=controlLeft(player,k);if(left>0)debuffs.push({id:k,kind:'debuff',icon:EFFECT_ICONS[k]||'',counter:left,tooltip:k+': осталось своих ходов '+left});});
    return { buffs: limitEffects(buffs), debuffs: limitEffects(debuffs) };
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

    /* ГЛУХАЯ ОБОРОНА — ПРИБАВКА К ЗАЩИТЕ, И ЖИВЁТ ЗДЕСЬ.

       Щит переделали из «−6 врагу» в «+6 к своей защите», но в эту сумму его
       не добавили. Врагу он мешать перестал, а в защиту не попал — и не
       давал ровно ничего. Проверка молчала: она сама подставляла прибавку в
       бросок и проверяла арифметику, а не то, доходит ли прибавка сюда.

       Считаем здесь, а не у зовущего: иначе телефон и дашборд опять
       сложат по-разному. */
    var p = player || {};
    /* БОЖЬЯ ЗАЩИТА — тоже прибавка к защите, и тоже здесь. Жила только на
       телефоне: дашборд, который и считает бросок защиты, её не видел, и
       +1 от молитвы у Ведущего не работал вовсе. Та же болезнь, что была
       со щитом. */
    mod += prayerBonus(p, world, 0, 0).def;
    var song = songEffect(p, num((world || {}).round) || 1, num((world || {}).battleNo));
    if (song) mod += num(song.modifiers.def);
    /* ОКРУЖЁН — минус к защите. Кого окружили, узнаём по id героя и врагам
       мира: зовущий обязан передать id, иначе окружения не видно. */
    if (p.id && isSurrounded(p.id, (world || {}).enemies) && !inspiringProtection(world).active) mod += SURROUND_DEF;
    if (shieldActive({ shieldRound: p.shieldRound, shieldUsedRound: p.shieldUsedRound, shieldCharges: p.shieldCharges,
                       shieldBattleNo: p.shieldBattleNo,
                       battleNo: (world || {}).battleNo, round: (world || {}).round })) {
        mod += shieldDefBonus({ hasShield: p.hasShield, twoHanded: p.twoHanded });
    }
    return mod;
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

/* Между боями: доля НЕДОСТАЮЩИХ ресурсов, округление вниз.
   Нулевые HP не поднимаем. Потолки передаются без закончившихся бафов. */
function battleRecoveryRate(completed) {
    return num(completed) === 1 ? 0.5 : num(completed) === 2 ? 0.25 : 0;
}
function planBattleRecovery(player, vitals, rate) {
    var p = player || {}, v = vitals || {};
    var hp = Math.max(0, Math.min(num(p.hp), num(v.maxHP)));
    var mp = Math.max(0, Math.min(num(p.mp), num(v.maxMP)));
    var share = rate === 0.5 || rate === 0.25 ? rate : 0;
    return { hp: hp > 0 ? hp + Math.floor((num(v.maxHP) - hp) * share) : 0,
             mp: hp > 0 ? mp + Math.floor((num(v.maxMP) - mp) * share) : mp };
}
function planGroupEscape(player) {
    var p = player || {}, hp = Math.max(0, num(p.hp)), facts = {};
    if (hp <= 0) return facts;
    facts.hp = Math.max(1, hp - Math.floor(hp * 0.2));
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
        total += Math.floor(b * BANK_RATE_PER_WEEK);
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
    return Math.max(1, Math.floor(num((total || {})[key]) / 2));
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
    if (pct > 0) return Math.max(1, Math.floor(num(targetMaxHP) * pct / 100));
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
        hp:  Math.floor(num(maxHP)    * num(pr.hpPct)  * k / 100),
        int: Math.floor(num(totalInt) * num(pr.intPct) * k / 100),
        def: num(pr.def) * k
    };
}

/* Только наложение, не пересчёт экрана: защита заполняет новую прибавку
   HP, если до молитвы здоровье было полным. Раненого молитва не лечит. */
function planPrayerTarget(prayer, target, world, baseMaxHP) {
    var base = Math.max(0, num(baseMaxHP));
    var hp = Math.min(num((target || {}).hp), base);
    var maxHP = base + prayerBonus({ prayer:prayer }, world, base, 0).hp;
    if (prayer.id === 'god_protection' && base > 0 && hp === base) hp = maxHP;
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
    + (num(op.arrow) === 0 && op.fortune && op.fortune.rerolled && op.fortune.mode === 'virtual' ? '-reroll' : ''); }
function doubleShotFortuneEligible(op) {
    return doubleShotPending(op) && !op.fortuneUsed && num(op.arrow) === 0 && doubleShotRollIndex(op) === 0;
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

   Два умения с самого начала, обе стоят Настроения, поются ДОП ДЕЙСТВИЕМ
   (спел — и бей) и держатся ДВА раунда (SONG_ROUNDS):

     Заводной рифф     — всем своим +2 к броску атаки
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
    inspiring_riff: {name:'Бодрящий фон',target:'allies',icon:'assets/gear/spells/inspiring_riff.png'},
    groovy_riff:  { name: 'Заводной рифф',   target: 'allies',
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
function acceptFortune(who, world, choice, manualReroll) {
    if (!choice || choice.stage !== 'choice' || fortuneCharges(who, world).indexOf(choice.chargeId) < 0) return null;
    var charges = Object.assign({}, who.fortuneCharges);
    charges[choice.chargeId] = Object.assign({}, charges[choice.chargeId], { spent:true });
    return { fortuneCharges:charges, choice:Object.assign({}, choice, { stage:'accepted',
        rerolled:choice.mode === 'manual' ? !!manualReroll : !!choice.rerolled }) };
}
function fortuneRollId(op) {
    return op.fortune && op.fortune.rerolled && op.fortune.mode === 'virtual' ? op.id + '-reroll' : op.id;
}
/* Один расчёт предварительного и окончательного результата. Снимок attack
   сохраняется ДО показа числа: цель, оружие и усиления между попытками те же. */
function fortuneAttackPlan(attack, raw, who, world) {
    var a = attack, p = who || {}, c = a.choice || {}, sp = a.spell;
    var result = resolveRoll(Object.assign({}, a.input, { roll:raw, world:a.world }));
    var facts = { mainActionRound:num(world.round) || 1 };
    if (!(sp && sp.subtype === 'heal' && a.input.target.kind === 'player')) facts.targetId = a.targetId;
    var resource = num(p.resource), power = num(p.power);
    if (sp && num(sp.manaCost)) {
        var key = a.resourceKind === 'mana' ? 'mp' : 'resource';
        if (num(p[key]) < num(sp.manaCost)) return null;
        facts[key] = num(p[key]) - num(sp.manaCost);
        if (key === 'resource') resource = facts[key];
    }
    if (a.resourceKind === 'mood') facts.resource = moodAfterAttack(resource);
    if (c.skill === 'hamstring') {
        result.hamstring = true;
        Object.assign(facts, planHamstring(world, a.id));
    }
    result.sneaky = !sp && !result.hamstring && a.input.attacker.isRogue && !!a.sneaky;
    if (result.sneaky) facts.sneakNextHit = false;
    if (c.power) {
        if (!canPowerStrike({ cls:a.input.attacker.cls, resource:resource })) return null;
        var ps = a.powerPlan || planPowerStrike({ who:{ cls:a.input.attacker.cls }, twoHanded:a.twoHanded,
            mode:c.power, heroId:a.playerId, enemies:a.enemies, targetId:a.targetId });
        result.damage = applyPowerStrike(result.damage, ps.mult);
        result.powerKind = ps.kind;
        facts.resource = resource - POWER_STRIKE_COST;
    }
    if (c.empower) {
        if (!canUseEmpower(a.input.attacker.cls) || !canEmpower(power, c.empower)) return null;
        var ep = planEmpower(a.powerBefore, c.empower);
        if (power < ep.spent) return null;
        result.damage = applyEmpower(result.damage, c.empower, a.powerBefore);
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
    return v > 0 ? Math.ceil(v) : Math.floor(v);
}

/* Может ли бард спеть: класс, инструмент, Настроение. */
/* Бодрящий фон хранится на исполнителе, отдельно от короткого риффа. */
var INSPIRING_COST = 10, INSPIRING_ROUNDS = 3;
function heroControlStamps(p, world) {
    var out=[];
    CONTROL_KEYS.forEach(function(k){if(controlLeft(p,k)>0)out.push(k+':'+(p[k].instanceId||p[k].setTurn||0));});
    (p.effects||[]).forEach(function(e){
        if(!['while','permanent'].includes(e.duration) && (e.control===true || CONTROL_KEYS.indexOf(e.id)>=0) && isEffectActive(e,num(world.round)))
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
        || (who.cls === 'priest' && !hasKeyword(keysOf(who.offhand), ['shield']));
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
    if (!hasRetreatSkill(who)) return 'Отступление доступно лучнику с луком, магу и жрецу без щита';
    if (num(who.hp) <= 0) return 'Вы без сознания';
    if (isStunned(who) || isRooted(who)) return 'Контроль не позволяет отступить';
    var head = (world.queue || [])[0];
    if (!head || head.type !== 'player' || head.id !== who.id) return 'Сейчас не ваш ход';
    if (retreatPending(who.pendingRetreat)) return 'Дождитесь завершения отступления';
    if (!hasExtraAction(who, world)) return whyNoExtraAction(who, world);
    if (!retreatHolders(Object.keys(world.enemies || {}).map(function (id) {
        return Object.assign({}, world.enemies[id], { id: id });
    }), who.id).length) return 'Вас никто не держит в ближнем бою';
    return '';
}
function planRetreat(who, world) {
    var facts = planExtraAction(world);
    if (safeRetreatAvailable(who, world)) facts.safeRetreatBattle = num((world || {}).battleNo);
    return facts;
}
function canBreakaway(p) {
    var o = p || {};
    if (o.action === 'spell') return false;          /* каст не разрывает бой */
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
        return kept && enemyInMeleeContact(enemy, kept.id) ? { id: kept.id, reason: 'ближняя цель рядом' } : null;
    }
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
             damage: Math.max(0, Math.floor(atk * mult)),
             halfDamage: Math.max(0, Math.floor(atk * MULT.graze)) };
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
var SPAWN_PER_PLAYER_MAX = 2;      /* до четырёх игроков включительно — вдвое */
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
    return Math.round(num(value) * plan.multiplier);
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
function faithManaOptions(who) {
    var p = who || {}, maxMP = Math.max(0, Math.floor(num(p.maxMP)));
    var missing = Math.max(0, Math.floor(maxMP - num(p.mp)));
    var power = clamp(Math.floor(num(p.power)), 0, POWER_MAX);
    return { maxMP:maxMP, missing:missing, power:power,
        maxMana:Math.min(missing, Math.floor(maxMP * power / POWER_MAX)) };
}
function faithManaCost(mana, maxMP) {
    return num(maxMP) > 0 ? Math.ceil(POWER_MAX * num(mana) / num(maxMP)) : 0;
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
        return Math.floor(!guard ? max : cur <= max * 0.75 ? max * 0.75 : cur + (max - cur) * 0.5);
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
    return Math.max(1, Math.round(num((item || {}).cost) * m));
}
function shopBuysBack(shop, key) {
    var s = shop || {};
    return s.buysAll !== false || shopSells(s, key);
}
function buybackPrice(shop, item) {
    var r = Number((shop || {}).sellRate);
    if (!isFinite(r) || r < 0) r = SELL_RATE;
    return Math.floor(num((item || {}).cost) * r);
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
        xp: Math.max(1, Math.round(xpPer * count * разброс())),
        gold: Math.max(0, Math.round(goldPer * count * разброс())),
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
   Не истекает с раундом и не снимается собственным ударом. После четвёртого
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
    return hangover ? 0 : Math.floor(num(maxMood) * MOOD_AFTER_SLEEP);
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

/* Тратит ли предмет ДОП ДЕЙСТВИЕ. Зелья, квестовые вещи и переодевание —
   да, и все они делят один слот на раунд. Алкоголь особый: его пьют по
   ходу дела, действия он не стоит.

   Имя прежнее (`consumesSecondAction`) оставлено нарочно: его знают клиент,
   дашборд, симулятор и проверки. Менять правило и имя разом — верный способ
   что-нибудь потерять по дороге. */
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
    controlLeft: controlLeft, controlReadyLeft: controlReadyLeft, isStunned: isStunned, isRooted: isRooted,
    HELL_FLEX_CHANCE: HELL_FLEX_CHANCE, hellFlexEligible: hellFlexEligible,
    hellFlexReceipt: hellFlexReceipt, planHellFlex: planHellFlex,
    isDisoriented: isDisoriented, isEnemyDisabled: isEnemyDisabled,
    applyStun: applyStun, applyEnemyControl: applyEnemyControl, finishEnemyTurn: finishEnemyTurn,
    damageEnemy: damageEnemy, canEnemyMove: canEnemyMove, canEnemyAttackTarget: canEnemyAttackTarget,
    enemyInMeleeContact: enemyInMeleeContact, enemyHitTargetFacts: enemyHitTargetFacts,
    burnLeft: burnLeft, applyBurn: applyBurn, planBurnTick: planBurnTick, hpAfterDamage: hpAfterDamage,
    BURN_TURNS: BURN_TURNS, BURN_RATE: BURN_RATE,
    applyFrostbite: applyFrostbite, furyLeft: furyLeft, shouldRoarFury: shouldRoarFury,
    planFury: planFury, howlWarns: howlWarns, shouldHowl: shouldHowl, planHowl: planHowl,
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
    hasRetreatSkill: hasRetreatSkill, retreatHolders: retreatHolders,
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
    canEquip: canEquip,
    computeStats: computeStats, computeVitals: computeVitals, steadfastDefense: steadfastDefense, computeCombatValues: computeCombatValues,
    resolveRoll: resolveRoll, resolveDefense: resolveDefense,
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
    deriveDrunkEffects: deriveDrunkEffects, defenseModifier: defenseModifier,
    allyHitChance: allyHitChance, rollsIntoAlly: rollsIntoAlly,
    drunkAfterBattle: drunkAfterBattle, drunkAfterSleep: drunkAfterSleep,
    clearHangover: clearHangover, drinkClearsHangover: drinkClearsHangover, battleResetFacts: battleResetFacts, BATTLE_RESET: BATTLE_RESET,
    battleRecoveryRate:battleRecoveryRate, planBattleRecovery:planBattleRecovery, planGroupEscape:planGroupEscape,
    resolveRevenge: resolveRevenge,
    resolveSkinning: resolveSkinning, trophyFor: trophyFor, isSkinnable: isSkinnable,
    planLoot: planLoot, lootMultiplier: lootMultiplier, SKIN_THRESHOLD: SKIN_THRESHOLD,
    planXP: planXP, enemyRollModifier: enemyRollModifier,
    AMBUSH_ID: AMBUSH_ID, AMBUSH_SPREAD: AMBUSH_SPREAD, planAmbushReward: planAmbushReward,
    relicDaysLeft: relicDaysLeft, mercBattleMark: mercBattleMark, mercLeavesWith: mercLeavesWith,
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
    SHIELD_PENALTY: SHIELD_PENALTY, SHIELD_COOLDOWN: SHIELD_COOLDOWN,
    SHIELD_WITH_SHIELD: SHIELD_WITH_SHIELD, SHIELD_TWO_HANDED: SHIELD_TWO_HANDED,
    shieldPenalty: shieldPenalty, shieldDefBonus: shieldDefBonus,
    canRaiseShield: canRaiseShield, shieldCooldownLeft: shieldCooldownLeft,
    SHIELD_CHARGES: SHIELD_CHARGES, shieldChargesLeft: shieldChargesLeft,
    shieldActive: shieldActive, planShieldHit: planShieldHit, planShield: planShield, shieldWouldCover: shieldWouldCover,
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
