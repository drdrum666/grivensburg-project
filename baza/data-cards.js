// ═══════════════════════════════════════════════════════════
// БАЗА ДАННЫХ: КАРТОЧКИ ИСХОДОВ
// ═══════════════════════════════════════════════════════════
// Подключается ПОСЛЕ baza/assets.js (нужен GITHUB_URL).
//
// Зачем файл. Из браузера с диска список файлов в папке не прочитать,
// поэтому количество вариантов надо где-то записать. Нарисовали барду ещё
// два промаха — поправили ОДНО ЧИСЛО здесь, код не трогали.
//
// Как ложится на движок:
//   crit  -> crit    (КРИТ)
//   hit   -> full    (ПОПАЛ)
//   graze -> half    (ЗАЦЕПИЛ, скользящий)
//   miss  -> miss    (ПРОМАХ)
//   parry -> одна картинка на всех, папки не имеет
//
// prefix отдельно от dir НАМЕРЕННО: папка называется warrior, а файлы внутри
// могут остаться card_war_*. Разъезд имени папки и имени файла — вещь
// обычная, и держать его надо в данных, а не в склейке строк по коду.
// ═══════════════════════════════════════════════════════════

    window.cardsDB = {
        base:  'assets/cards_def_attack/',
        parry: 'full_block.png',          /* парирование — одна на всех */

        /* Сколько ВАРИАНТОВ каждого исхода лежит в папке. */
        classes: {
            warrior: { dir: 'warrior', prefix: 'card_warrior', crit: 3, full: 2, half: 1, miss: 1 },
            archer:  { dir: 'archer',  prefix: 'card_archer', crit: 2, full: 2, half: 2, miss: 4 },
            rogue:   { dir: 'rogue',   prefix: 'card_rogue',  crit: 2, full: 1, half: 2, miss: 3 },
            mage:    { dir: 'mage',    prefix: 'card_mage',   crit: 2, full: 2, half: 1, miss: 2 },
            /* Жрец берёт у мага. Бард пока тоже — своих ещё не нарисовано. */
            priest:  { sameAs: 'mage' },
            bard:    { sameAs: 'mage' }
        }
    };

    /* Разбойник — это лучник с двумя кинжалами, отдельного класса нет.
       Поэтому папка выбирается по РОЛИ, а не по cls. */
    window.cardSetFor = function (cls, isRogue) {
        var key = isRogue ? 'rogue' : cls;
        var set = window.cardsDB.classes[key] || window.cardsDB.classes[cls];
        if (set && set.sameAs) set = window.cardsDB.classes[set.sameAs];
        return set || window.cardsDB.classes.warrior;
    };

    /* Исход движка -> имя в файлах. */
    window.CARD_BY_OUTCOME = { crit: 'crit', hit: 'full', graze: 'half', miss: 'miss' };

    /* Случайная карточка. rng обязателен аргументом — как и в движке, иначе
       выбор не проверить. Вернёт '' если вариантов нет: пусть лучше не будет
       картинки, чем битая ссылка. */
    window.resolveCard = function (p) {
        p = p || {};
        var db = window.cardsDB;
        var rng = p.rng || Math.random;

        if (p.outcome === 'parry') return (window.GITHUB_URL || '') + db.base + db.parry;

        var kind = window.CARD_BY_OUTCOME[p.outcome];
        if (!kind) return '';
        var set = window.cardSetFor(p.cls, p.isRogue);
        var count = set[kind] || 0;
        if (count < 1) return '';

        var n = 1 + Math.floor(rng() * count);
        return (window.GITHUB_URL || '') + db.base + set.dir + '/'
             + set.prefix + '_' + kind + '_' + n + '.png';
    };

    /* Все варианты разом — для предзагрузки и для проверки, что файлы на месте. */
    window.allCards = function () {
        var db = window.cardsDB, out = [(window.GITHUB_URL || '') + db.base + db.parry];
        Object.keys(db.classes).forEach(function (k) {
            var set = db.classes[k];
            if (set.sameAs) return;
            ['crit', 'full', 'half', 'miss'].forEach(function (kind) {
                for (var i = 1; i <= (set[kind] || 0); i++) {
                    out.push((window.GITHUB_URL || '') + db.base + set.dir + '/'
                           + set.prefix + '_' + kind + '_' + i + '.png');
                }
            });
        });
        return out;
    };
