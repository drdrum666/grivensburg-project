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
        /* Числа СВЕРЕНЫ с репозиторием, а не взяты с потолка: раньше стояло
           20/10/12, файлов на деле 10/2/4 — и две трети запросов уходили в
           404. Молча: браузер не находит трек и просто не играет.
           Добавите файл — поправьте одно число здесь. */
        counts: { ambient: 10, intro: 2, battle: 4 },

        /* Озвучка умений. Ключ — умение, дальше раса. Пол пока не разделён:
           если появится подпапка male/female, resolveSpellSound возьмёт её. */
        spells: {
            groovy_riff: {
                dir: 'spels/bard/groovy_riff/',
                races: {
                    /* Имена СПИСАНЫ с репозитория, а не выдуманы. Пробел перед
                       скобкой автор убрал — но не везде, см. human ниже. */
                    drow: ['jopi_v_ruki(1).mp3','jopi_v_ruki(2).mp3','jopi_v_ruki(3).mp3',
                           'jopi_v_ruki(4).mp3','jopi_v_ruki(5).mp3',
                           'mag_ebash(1).mp3','mag_ebash(2).mp3','mag_ebash(3).mp3','mag_ebash(4).mp3',
                           'suchkam_trash(1).mp3','suchkam_trash(2).mp3','suchkam_trash(3).mp3',
                           'v_kuraj(1).mp3','v_kuraj(2).mp3','v_kuraj(3).mp3','v_kuraj(4).mp3','v_kuraj(5).mp3',
                           'v_mordu(1).mp3','v_mordu(2).mp3','v_mordu(3).mp3','v_mordu(4).mp3'],
                    /* У эльфа vkuraj БЕЗ подчёркивания — так лежит в папке. */
                    elf:  ['jopi_v_ruki(1).mp3','jopi_v_ruki(6).mp3','jopi_v_ruki(7).mp3','jopi_v_ruki(8).mp3',
                           'jopi_v_ruki(9).mp3','jopi_v_ruki(10).mp3','jopi_v_ruki(11).mp3','jopi_v_ruki(12).mp3',
                           'mag_ebash(1).mp3','mag_ebash(2).mp3',
                           'suchkam_trash(1).mp3','suchkam_trash(2).mp3','suchkam_trash(3).mp3','suchkam_trash(4).mp3',
                           'vkuraj(1).mp3','vkuraj(2).mp3','vkuraj(3).mp3','vkuraj(4).mp3',
                           'voin_v_boi(1).mp3','voin_v_boi(2).mp3','voin_v_boi(3).mp3'],
                    /* У человека «suchkam trash» ЧЕРЕЗ ПРОБЕЛ, а у пятого и
                       шестого ещё и пробел перед скобкой. Пути кодирует soundUrl. */
                    human:['jopi_v_ruki(1).mp3','jopi_v_ruki(2).mp3','jopi_v_ruki(3).mp3','jopi_v_ruki(4).mp3',
                           'mag_ebash(1).mp3','mag_ebash(2).mp3','mag_ebash(3).mp3','mag_ebash(4).mp3',
                           'suchkam trash(1).mp3','suchkam trash(2).mp3','suchkam trash(3).mp3',
                           'suchkam trash(4).mp3','suchkam trash (5).mp3','suchkam trash (6).mp3',
                           'v_kuraj(1).mp3','v_kuraj(2).mp3','v_kuraj(3).mp3','v_kuraj(4).mp3','v_kuraj(5).mp3',
                           'voin_v_boi(1).mp3','voin_v_boi(2).mp3','voin_v_boi(3).mp3','voin_v_boi(4).mp3']
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

/* ══════════════════════════════════════════════════════════════════════
   ПУЛЬТ МАСТЕРА И ПРИЁМНИК СТРИМЕРА

   Звук идёт ИЗ СТРИМЕРА — он на телевизоре, его слышит стол. У мастера
   пульт: играть, стоп, следующий, предыдущий, перемешать, громкость.
   У зрителей одна кнопка «выключить», и она ЛОКАЛЬНАЯ — в базу не пишется,
   иначе один зритель заглушил бы всех.

   Раньше плеер жил у мастера и играл из его ноутбука, а в контракте данных
   стояло «что играет, в базу НЕ пишется». Это правило изменено осознанно:
   без записи стример не узнает, что включить.

   ЖЕЛЕЗНОЕ ПРАВИЛО 7 НЕ НАРУШЕНО. Стример по-прежнему ничего не решает:
   мастер присылает ГОТОВЫЙ адрес трека, стример его проигрывает. Выбор
   следующего, перемешивание и громкость считаются на стороне мастера.
   ══════════════════════════════════════════════════════════════════════ */

/* Пульт: держит список и номер трека, наружу отдаёт что писать в базу.
   Сам ничего не проигрывает — у мастера тихо. */
    window.makeMusicRemote = function (opts) {
        opts = opts || {};
        var send = opts.send || function () {};
        var R = { kind: null, list: [], idx: -1, playing: false,
                  volume: opts.volume == null ? 0.6 : opts.volume };

        function publish() {
            send({
                track: R.playing ? (R.list[R.idx] || '') : '',
                kind: R.kind || 'peace',
                playing: !!R.playing,
                volume: R.volume,
                /* Метка защищает от повторного срабатывания при переподписке —
                   тот же приём, что у lastDrink и relicCall. */
                at: Date.now()
            });
            /* Сменился трек — переводим будильник. Объявлена ниже, до первого
               вызова publish она уже существует. */
            if (typeof rearm === 'function') rearm();
        }
        function fill(kind) { R.list = window.ambientList(kind) || []; }

        R.setScene = function (kind) {
            /* Тот же вид — НЕ трогаем: мирный трек идёт через смену сцен и
               не должен дёргаться, мастер щёлкает сцены часто. */
            if (kind === R.kind && R.playing) return;
            R.kind = kind;
            fill(kind);
            if (!R.list.length) { R.playing = false; publish(); return; }
            R.idx = Math.floor((opts.rng || Math.random)() * R.list.length);
            R.playing = true;
            publish();
        };
        R.play = function () {
            if (!R.list.length) fill(R.kind || 'peace');
            if (!R.list.length) return;
            if (R.idx < 0) R.idx = 0;
            R.playing = true; publish();
        };
        R.stop    = function () { R.playing = false; publish(); };
        R.next    = function () { if (!R.list.length) return;
                                  R.idx = (R.idx + 1) % R.list.length;
                                  R.playing = true; publish(); };
        R.prev    = function () { if (!R.list.length) return;
                                  R.idx = (R.idx - 1 + R.list.length) % R.list.length;
                                  R.playing = true; publish(); };
        R.shuffle = function () { if (R.list.length < 2) return;
                                  var i = R.idx;
                                  while (i === R.idx) i = Math.floor((opts.rng || Math.random)() * R.list.length);
                                  R.idx = i; R.playing = true; publish(); };
        R.setVolume = function (v) {
            R.volume = Math.max(0, Math.min(1, Number(v) || 0));
            publish();
        };
        /* Кончился трек у стримера — мастер даёт следующий.
           Зовётся из ЧАСОВ НИЖЕ, а не стримером: по железному правилу 7
           стример в базу не пишет и ничего не выбирает, он только исполняет
           присланный адрес. Значит сообщить «доиграл» он не может, и длину
           трека мастер узнаёт сам. */
        R.ended = function () { R.next(); };

        /* ═══ САМОПЕРЕЛИСТЫВАНИЕ ═══════════════════════════════════════
           Плейлист не крутился: играл один трек, пока не ткнёшь. Провод
           между концом трека и `next()` отсутствовал целиком — у приёмника
           был крючок `onEnded`, у мастера метод `ended`, а между ними
           ничего.

           Соединить их напрямую нельзя: это заставило бы стример писать в
           базу. Поэтому мастер СПРАШИВАЕТ У ФАЙЛА ЕГО ДЛИНУ (метаданные,
           без проигрывания) и заводит будильник. Звук при этом идёт только
           у стримера, как и раньше.

           Часы всегда одни: каждая публикация гасит предыдущий будильник.
           Иначе после пяти нажатий «Дальше» тикало бы пять таймеров и
           плейлист прыгал через трек.

           `opts.measure` подменяем в проверках — иначе прогон ждал бы
           настоящий mp3 и настоящие минуты. */
        var timer = null;
        var measure = opts.measure || function (track, cb) {
            if (typeof Audio === 'undefined') return;
            var probe = new Audio();
            probe.preload = 'metadata';
            probe.onloadedmetadata = function () { cb(probe.duration); };
            probe.onerror = function () { cb(0); };   /* нет файла — не тикаем */
            probe.src = track;
        };
        function rearm() {
            if (timer) { clearTimeout(timer); timer = null; }
            if (!R.playing) return;
            var track = R.list[R.idx];
            if (!track) return;
            measure(track, function (sec) {
                if (!(sec > 0) || !R.playing) return;
                /* Ждём чуть дольше самого трека: у стримера ещё плавное
                   затухание на 600 мс, и обрывать его на полуслове незачем. */
                if (timer) clearTimeout(timer);
                timer = setTimeout(function () { R.ended(); }, sec * 1000 + 700);
            });
        }
        R.stopClock = function () { if (timer) { clearTimeout(timer); timer = null; } };
        R.state = function () {
            return { kind: R.kind, playing: R.playing, volume: R.volume,
                     track: R.list[R.idx] || '', count: R.list.length };
        };
        return R;
    };

/* Приёмник: играет ровно то, что прислал мастер. Ничего не выбирает. */
    window.makeMusicSink = function (opts) {
        opts = opts || {};
        var A = opts.Audio || (typeof Audio !== 'undefined' ? Audio : null);
        if (!A) return null;
        var S = { audio: null, track: '', muted: false, volume: 0.6 };

        function level() { return S.muted ? 0 : S.volume; }
        function stopNow() {
            if (!S.audio) return;
            clearInterval(S.audio.__fade);
            if (S.audio.pause) S.audio.pause();
            S.audio = null;
        }
        function fade(target, ms) {
            var a = S.audio; if (!a) return;
            var from = a.volume, steps = Math.max(1, Math.round(ms / 50)), i = 0;
            clearInterval(a.__fade);
            a.__fade = setInterval(function () {
                i++; a.volume = Math.max(0, Math.min(1, from + (target - from) * i / steps));
                if (i >= steps) clearInterval(a.__fade);
            }, 50);
        }
        S.apply = function (st) {
            st = st || {};
            if (st.volume != null) S.volume = Math.max(0, Math.min(1, Number(st.volume) || 0));
            if (!st.playing || !st.track) { stopNow(); S.track = ''; return; }
            if (st.track === S.track && S.audio) { fade(level(), 200); return; }
            stopNow();
            S.track = st.track;
            S.audio = new A(st.track);
            S.audio.volume = 0;
            /* Браузер не пускает звук без нажатия и ОТКАЗЫВАЕТ МОЛЧА: play()
               возвращает отклонённое обещание, а на экране ничего. Ловим и
               говорим наружу — иначе «музыка не играет» без единой подсказки.
               Заодно запоминаем трек, чтобы включить его при первом нажатии. */
            /* Файла нет — браузер молчит и просто не играет. Ловим и
               говорим наружу: «музыка не работает» без причины хуже всего.
               Так ловится и опечатка в имени, и отсутствующая папка. */
            S.audio.onerror = function () {
                S.lastError = 'не найден: ' + String(st.track).split('/').slice(-2).join('/');
                if (opts.onError) opts.onError(S.lastError);
            };
            var p = S.audio.play && S.audio.play();
            if (p && p.catch) p.catch(function () {
                S.blocked = true;
                if (opts.onBlocked) opts.onBlocked();
            });
            fade(level(), 600);
            S.audio.onended = function () { if (opts.onEnded) opts.onEnded(); };
        };
        /* Глушилка ЗРИТЕЛЯ — только здесь, в базу не идёт. */
        S.setMuted = function (on) { S.muted = !!on; fade(level(), 300); };
        /* Разблокировка по первому нажатию: повторяем то, что уже прислано. */
        S.unblock = function () {
            if (!S.blocked || !S.audio) return;
            S.blocked = false;
            var p = S.audio.play && S.audio.play();
            if (p && p.catch) p.catch(function () { S.blocked = true; });
        };
        S.state = function () { return { track: S.track, muted: S.muted,
                                         playing: !!S.audio, volume: S.volume,
                                         blocked: !!S.blocked }; };
        return S;
    };
