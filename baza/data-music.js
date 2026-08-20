// ═══════════════════════════════════════════════════════════
// БАЗА ДАННЫХ: МУЗЫКА И ОЗВУЧКА
// ═══════════════════════════════════════════════════════════
// Подключается ПОСЛЕ baza/assets.js.
//
// Почему список, а не «играть всё из папки». Страница не может спросить у
// диска, что лежит в папке, — ни с файла, ни с сайта. Поэтому имена
// перечислены здесь.
//
// Чтобы добавить трек, НЕ трогая код: положите файл по образцу
// battle_01.mp3, battle_02.mp3 … — перебор найдёт его сам (см. probeTracks).
// Свои имена — только через этот список.
//
// ВАЖНО: в именах джинглов есть ПРОБЕЛЫ и СКОБКИ. В браузере такие пути
// обязаны кодироваться, иначе файл не найдётся. Этим занимается soundUrl().
// ═══════════════════════════════════════════════════════════

    window.musicDB = {
        base: 'sounds/',

        /* Фоновая музыка. Мирный трек идёт нон-стоп и не сбивается сменой
           сцены; боевой включается только в бою. */
        /* Фоновая музыка. Имена строго нумерованные, поэтому списки
           СОБИРАЮТСЯ СЧЁТЧИКОМ, а не переписываются руками: добавили
           ambient_21.mp3 — поменяли одно число, и он играет.

           Мирные сцены крутят ВСЮ папку ambient: и ambient_*, и intro_*.
           А вот сама сцена интро берёт ТОЛЬКО intro_* — она задаёт тон
           всей главе, и случайная таверна там не к месту. */
        counts: { ambient: 20, intro: 10, battle: 12 },

        /* Озвучка умений. Ключ — умение, дальше раса. Пол пока не разделён:
           если появится подпапка male/female, resolveSpellSound возьмёт её. */
        spells: {
            groovy_riff: {
                dir: 'spels/bard/groovy_riff/',
                races: {
                    drow: ['jopi_v_ruki (1).mp3','jopi_v_ruki (2).mp3','jopi_v_ruki (3).mp3',
                           'jopi_v_ruki (4).mp3','jopi_v_ruki (5).mp3',
                           'mag_ebash (1).mp3','mag_ebash (2).mp3','mag_ebash (3).mp3','mag_ebash (4).mp3',
                           'suchkam_trash (1).mp3','suchkam_trash (2).mp3','suchkam_trash (3).mp3',
                           'v_kuraj (1).mp3','v_kuraj (2).mp3','v_kuraj (3).mp3','v_kuraj (4).mp3','v_kuraj (5).mp3',
                           'v_mordu (1).mp3','v_mordu (2).mp3','v_mordu (3).mp3','v_mordu (4).mp3'],
                    elf:  ['jopi_v_ruki (1).mp3','jopi_v_ruki (6).mp3','jopi_v_ruki (7).mp3','jopi_v_ruki (8).mp3',
                           'jopi_v_ruki (9).mp3','jopi_v_ruki (10).mp3','jopi_v_ruki (11).mp3','jopi_v_ruki (12).mp3',
                           'mag_ebash (1).mp3','mag_ebash (2).mp3',
                           'suchkam_trash (1).mp3','suchkam_trash (2).mp3','suchkam_trash (3).mp3','suchkam_trash (4).mp3',
                           'vkuraj (1).mp3','vkuraj (2).mp3','vkuraj (3).mp3','vkuraj (4).mp3',
                           'voin_v_boi (1).mp3','voin_v_boi (2).mp3','voin_v_boi (3).mp3'],
                    human:['jopi_v_ruki (1).mp3','jopi_v_ruki (2).mp3','jopi_v_ruki (3).mp3','jopi_v_ruki (4).mp3',
                           'mag_ebash (1).mp3','mag_ebash (2).mp3','mag_ebash (3).mp3','mag_ebash (4).mp3',
                           'suchkam trash (1).mp3','suchkam trash (2).mp3','suchkam trash (3).mp3',
                           'suchkam trash (4).mp3','suchkam trash (5).mp3','suchkam trash (6).mp3',
                           'v_kuraj (1).mp3','v_kuraj (2).mp3','v_kuraj (3).mp3','v_kuraj (4).mp3','v_kuraj (5).mp3',
                           'voin_v_boi (1).mp3','voin_v_boi (2).mp3','voin_v_boi (3).mp3','voin_v_boi (4).mp3']
                }
            }
        },

        /* Дроу поют по-эльфийски, орков пока нет — берут человека.
           Ровно та же подмена, что у иконок настроения. */
        raceFallback: { drow: 'drow', orc: 'human', elf: 'elf', human: 'human' }
    };

    /* Пробелы и скобки в путях обязаны кодироваться. */
    window.soundUrl = function (rel) {
        var base = (window.GITHUB_URL || '') + window.musicDB.base;
        return base + String(rel).split('/').map(encodeURIComponent).join('/');
    };

    /* Случайная озвучка умения для расы и пола.
       Если появится подпапка пола — она возьмётся автоматически, а пока
       общий набор на расу. Файла нет — вернём пустую строку, тишина
       лучше ошибки. */
    window.resolveSpellSound = function (spell, race, gender, rng) {
        var db = window.musicDB.spells[spell];
        if (!db) return '';
        var r = window.musicDB.raceFallback[race] || 'human';
        var list = db.races[r] || db.races.human || [];
        if (!list.length) return '';
        var pick = list[Math.floor((rng || Math.random)() * list.length)];
        /* Пол ищем подпапкой: spels/bard/groovy_riff/elf/female/файл */
        var sub = gender === 'female' ? 'female/' : (gender === 'male' ? 'male/' : '');
        return { withGender: window.soundUrl(db.dir + r + '/' + sub + pick),
                 plain:      window.soundUrl(db.dir + r + '/' + pick) };
    };

    /* Списки фоновых треков. Собираются из счётчиков — руками ничего
       перечислять не нужно. */
    window.ambientList = function (kind) {
        var c = window.musicDB.counts, out = [];
        function add(dir, name, n) {
            for (var i = 1; i <= n; i++) out.push(window.soundUrl(dir + name + '_' + i + '.mp3'));
        }
        if (kind === 'battle') { add('battle/', 'battle', c.battle); return out; }
        /* Интро — только свои треки. */
        if (kind === 'intro') { add('ambient/', 'intro', c.intro); return out; }
        /* Мирные сцены — вся папка ambient целиком. */
        add('ambient/', 'ambient', c.ambient);
        add('ambient/', 'intro', c.intro);
        return out;
    };

    /* Фоновый трек наугад. kind: 'peace' | 'battle' | 'intro'. */
    window.resolveAmbient = function (kind, rng) {
        var list = window.ambientList(kind);
        if (!list.length) return '';
        return list[Math.floor((rng || Math.random)() * list.length)];
    };

    /* Какая музыка нужна сцене. Интро — только у самой первой картинки
       главы: она задаёт тон, и случайная таверна там не к месту. */
    window.sceneMusicKind = function (scene) {
        if (!scene) return 'peace';
        if (scene.id === 'sc_intro' || /intro/.test(scene.img || '')) return 'intro';
        return scene.configs ? 'battle' : 'peace';
    };

/* ══════════════════════════════════════════════════════════════════════
   ПРОИГРЫВАТЕЛЬ

   Живёт ОТДЕЛЬНО от сцены и знает лишь одно: бой сейчас или нет.
   Мирный трек идёт нон-стоп и не сбивается сменой сцены — иначе музыка
   дёргалась бы весь вечер, ведь мастер щёлкает сцены часто.

   Переход мирный ↔ боевой плавный: один затухает, другой набирает.
   Под звуки боя музыка не выключается, а приглушается и возвращается.
   ══════════════════════════════════════════════════════════════════════ */

    window.makeMusicPlayer = function (opts) {
        opts = opts || {};
        var A = opts.Audio || (typeof Audio !== 'undefined' ? Audio : null);
        if (!A) return null;                       /* нет звука — молча живём без него */

        function num(v) { return Number(v) || 0; }

        var P = { kind: null, track: null, muted: false, ducked: false,
                  volume: opts.volume == null ? 0.6 : opts.volume,
                  list: [], idx: -1, audio: null };

        function fade(target, ms, done) {
            var a = P.audio;
            if (!a) { if (done) done(); return; }
            var from = a.volume, steps = Math.max(1, Math.round(ms / 50)), i = 0;
            clearInterval(a.__fade);
            a.__fade = setInterval(function () {
                i++;
                a.volume = Math.max(0, Math.min(1, from + (target - from) * i / steps));
                if (i >= steps) { clearInterval(a.__fade); if (done) done(); }
            }, 50);
        }
        function level() { return P.muted ? 0 : (P.ducked ? P.volume * 0.25 : P.volume); }

        function stopNow() {
            if (!P.audio) return;
            clearInterval(P.audio.__fade);
            P.audio.pause && P.audio.pause();
            P.audio = null;
        }
        function playFile(url) {
            if (!url) return;
            stopNow();
            P.audio = new A(url);
            P.audio.volume = 0;
            P.audio.play && P.audio.play();
            P.track = url;
            fade(level(), 600);
            /* Кончился — включаем следующий, чтобы не наступала тишина. */
            P.audio.onended = function () { P.next(); };
        }
        function fill(kind) { P.list = window.ambientList(kind); P.idx = -1; }

        P.setScene = function (kind) {
            /* Тот же вид — НЕ трогаем: мирный трек идёт через смену сцен. */
            if (kind === P.kind && P.audio) return;
            P.kind = kind;
            fill(kind);
            if (!P.list.length) { stopNow(); return; }
            P.idx = Math.floor(Math.random() * P.list.length);
            playFile(P.list[P.idx]);
        };
        P.play = function () { if (!P.audio && P.list.length) playFile(P.list[Math.max(0, P.idx)]); };
        P.stop = function () { fade(0, 400, stopNow); };
        P.next = function () {
            if (!P.list.length) return;
            P.idx = (P.idx + 1) % P.list.length;
            playFile(P.list[P.idx]);
        };
        P.prev = function () {
            if (!P.list.length) return;
            P.idx = (P.idx - 1 + P.list.length) % P.list.length;
            playFile(P.list[P.idx]);
        };
        P.shuffle = function () {
            if (P.list.length < 2) return;
            var i = P.idx;
            while (i === P.idx) i = Math.floor(Math.random() * P.list.length);
            P.idx = i; playFile(P.list[i]);
        };
        P.setMuted = function (on) { P.muted = !!on; fade(level(), 300); };
        P.setVolume = function (v) {
            P.volume = Math.max(0, Math.min(1, Number(v) || 0));
            fade(level(), 200);
        };
        /* Приглушение под звуки: тише за полсекунды и так же обратно. */
        P.duck = function (ms) {
            P.ducked = true; fade(level(), 400);
            clearTimeout(P.__unduck);
            P.__unduck = setTimeout(function () {
                P.ducked = false; fade(level(), 600);
            }, Math.max(300, num(ms) || 3000));
        };
        P.state = function () {
            return { kind: P.kind, playing: !!P.audio, muted: P.muted,
                     ducked: P.ducked, track: P.track, count: P.list.length };
        };
        return P;
    };
