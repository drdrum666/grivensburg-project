// ═══════════════════════════════════════════════════════════
// БАЗА ДАННЫХ: ПОРТРЕТЫ ГЕРОЕВ
// ═══════════════════════════════════════════════════════════
// Подключается ПОСЛЕ baza/assets.js.
//
// Раскладка на диске:
//   assets/heroes/{назначение}/{раса}/{класс}_{пол}_{раса}_base_{номер}.png
//
// Назначения:
//   client   — карточка в телефоне
//   streamer — экран зрителей (самая большая папка)
//   drunk    — пьяная версия для зрителей
//   back     — вид со спины, под будущие сцены
//   side     — вид сбоку, туда же
//
// Вариант выбирает ИГРОК при создании персонажа и он больше не меняется,
// поэтому номер хранится фактом у игрока (`portrait`), а не бросается
// заново при каждой перерисовке — иначе портрет прыгал бы на экране.
//
// РАЗБОЙНИК. Отдельного класса нет: это лучник, надевший ДВА кинжала.
// Один кинжал ничего не меняет — ни аватарку, ни инициативу, ни механику.
// Поэтому папку выбираем по РОЛИ (isRogue), а не по cls.
// ═══════════════════════════════════════════════════════════

    window.heroesDB = {
        base:  'assets/heroes/',
        races: ['human', 'orc', 'drow', 'elf'],
        /* Классы для КАРТИНОК. Разбойник тут есть, хотя в движке он не класс. */
        artClasses: ['warrior', 'archer', 'rogue', 'mage', 'priest', 'bard'],

        /* Сколько вариантов нарисовано. Чего нет в таблице — считаем за один.
           Нарисовали второго барда — поправили ОДНО число. */
        variants: {
            drow: {
                warrior_female: 2, warrior_male: 2,
                mage_female: 2,
                priest_female: 2
            }
        },

        /* Пока заполнена одна раса. Для остальных портретов ещё нет —
           показываем ПУСТО, а не чужое лицо: дырка на экране честнее и сразу
           видно, что дорисовать. */
        ready: ['drow']
    };

    /* Какая папка соответствует классу на КАРТИНКЕ. */
    window.heroArtClass = function (cls, isRogue) {
        if (isRogue) return 'rogue';
        return window.heroesDB.artClasses.indexOf(cls) >= 0 ? cls : 'warrior';
    };

    /* Сколько вариантов у этого героя. */
    window.heroVariants = function (cls, gender, race, isRogue) {
        var db = window.heroesDB;
        if (db.ready.indexOf(race) < 0) return 0;          /* раса ещё не нарисована */
        var byRace = db.variants[race] || {};
        var key = window.heroArtClass(cls, isRogue) + '_' + (gender || 'male');
        return byRace[key] || 1;
    };

    /* Путь к портрету. Вернёт '' — значит картинки нет, показывать нечего. */
    window.heroArt = function (p) {
        p = p || {};
        var db = window.heroesDB;
        var where = p.where || 'client';
        var race = p.race || 'human';
        var gender = p.gender || 'male';
        var cls = window.heroArtClass(p.cls, p.isRogue);

        var count = window.heroVariants(p.cls, gender, race, p.isRogue);
        if (count < 1) return '';

        var n = Math.floor(Number(p.variant) || 1);
        if (n < 1 || n > count) n = 1;                     /* вариант удалили — берём первый */

        return (window.GITHUB_URL || '') + db.base + where + '/' + race + '/'
             + cls + '_' + gender + '_' + race + '_base_' + n + '.png';
    };

    /* Все варианты героя — для выбора при создании персонажа. */
    window.heroVariantList = function (p) {
        p = p || {};
        var out = [], count = window.heroVariants(p.cls, p.gender, p.race, p.isRogue);
        for (var i = 1; i <= count; i++) {
            out.push({ n: i, src: window.heroArt({ cls: p.cls, gender: p.gender, race: p.race,
                                                   isRogue: p.isRogue, where: p.where || 'client',
                                                   variant: i }) });
        }
        return out;
    };
