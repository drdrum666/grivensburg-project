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
            },
            /* Сверено со списком файлов в репозитории, а не на глаз. */
            orc: {
                warrior_female: 2, warrior_male: 2,
                mage_female: 2
            }
        },

        /* КАКИЕ КЛАССЫ РАСЕ НЕ ПОЛОЖЕНЫ.
           Не «картинки не нарисованы», а решение по миру: у орков нет ни
           жрецов, ни бардов. Поэтому запрет живёт здесь, рядом с расами, а
           не в списке готовых портретов — дорисованные картинки его не снимут.
           Чего в таблице нет — разрешено всё. */
        forbidden: {
            orc: ['priest', 'bard']
        },

        /* Пока заполнена одна раса. Для остальных портретов ещё нет —
           показываем ПУСТО, а не чужое лицо: дырка на экране честнее и сразу
           видно, что дорисовать. */
        /* Расы, у которых портреты РЕАЛЬНО залиты. Чего тут нет — показывается
           пусто, а не чужое лицо: дырка честнее подмены и сразу видно, что
           дорисовать. Орк добавлен: папка assets/heroes/client/orc в
           репозитории есть. Эльфа и человека там пока НЕТ. */
        ready: ['drow', 'orc'],

        /* Назначения, для которых картинки РЕАЛЬНО залиты. Чего тут нет —
           подменяется папкой client (см. heroArt). */
        has: ['client']
    };

    /* Какая папка соответствует классу на КАРТИНКЕ. */
    window.heroArtClass = function (cls, isRogue) {
        if (isRogue) return 'rogue';
        return window.heroesDB.artClasses.indexOf(cls) >= 0 ? cls : 'warrior';
    };

    /* Доступен ли класс этой расе. Разбойник — это лучник, поэтому
       спрашиваем по настоящему классу, а не по картинке. */
    window.classAllowed = function (cls, race) {
        var db = window.heroesDB;
        var no = (db.forbidden || {})[race] || [];
        return no.indexOf(cls) < 0;
    };

    /* Классы, доступные расе — для отрисовки выбора. */
    window.classesForRace = function (race, all) {
        var list = all || ['warrior', 'archer', 'mage', 'priest', 'bard'];
        return list.filter(function (c) { return window.classAllowed(c, race); });
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

        /* ОТКАТ НА ПАПКУ КЛИЕНТА. Крупных портретов для стримера, пьяных и
           видов со спины пока не нарисовано — папок просто нет, и стример
           показывал пустоту. Пока их нет, берём мелкий портрет из client:
           он хуже по качеству, но лучше дырки. Появится своя папка —
           добавьте её в `has` ниже, и откат перестанет срабатывать. */
        if (db.has.indexOf(where) < 0) where = 'client';

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
