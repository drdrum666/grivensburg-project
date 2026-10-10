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

        /* Новый стример начинает с intro. Новая сцена выбирает и перемешивает
           свою подборку; повтор снимка сцены трек не перезапускает. */
        /* Фоновая музыка. Имена строго нумерованные, поэтому списки
           СОБИРАЮТСЯ СЧЁТЧИКОМ, а не переписываются руками: добавили
           ambient_21.mp3 — поменяли одно число, и он играет.

           Мирные сцены крутят ВСЮ папку ambient: и ambient_*, и intro_*.
           А вот сама сцена интро берёт ТОЛЬКО intro_* — она задаёт тон
           всей главе, и случайная таверна там не к месту. */
        /* Список автора от 10.10: ambient 1–15, intro 1–2,
           battle 1–4 и 6–8. Пятого боевого файла в папке нет. */
        counts: { ambient: 15, intro: 2 },
        battleTracks: [1,2,3,4,6,7,8],
        inspiringTracks: [1,2,3,4,5],

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
        if (kind === 'battle') return window.musicDB.battleTracks.map(function(n){return window.soundUrl('battle/battle_'+n+'.mp3');});
        /* Интро — только свои треки. */
        if (kind === 'intro') { add('ambient/', 'intro', c.intro); return out; }
        /* Мирные сцены — вся папка ambient целиком. */
        add('ambient/', 'ambient', c.ambient);
        add('ambient/', 'intro', c.intro);
        return out;
    };

    window.inspiringMusicList = function(){
        return window.musicDB.inspiringTracks.map(function(n){return window.soundUrl('spels/bard/groovy_riff/inspiring_riff/inspiring_riff_'+n+'.mp3');});
    };

    /* Фоновый трек наугад. kind: 'peace' | 'battle' | 'intro'. */
    window.resolveAmbient = function (kind, rng) {
        var list = window.ambientList(kind);
        if (!list.length) return '';
        return list[Math.floor((rng || Math.random)() * list.length)];
    };

    /* Какая музыка нужна сцене. Интро — только у самой первой картинки
       главы: она задаёт тон, и случайная таверна там не к месту.

       БЕЗ ВЫБРАННОЙ СЦЕНЫ — ТОЖЕ ИНТРО. Раньше здесь стояло 'peace', и
       вечер начинался со случайного трека из мирной папки: в ней десять
       ambient против двух intro, то есть пять раз из шести играла таверна,
       пока мастер ещё не открыл ни одной сцены. Завязка звучала как
       середина вечера. Интро играет, пока мастер не выбрал, что показывать. */
    window.sceneMusicKind = function (scene) {
        if (!scene) return 'intro';
        if (scene.id === 'sc_intro' || /intro/.test(scene.img || '')) return 'intro';
        return scene.configs ? 'battle' : 'peace';
    };

/* ПРИГЛУШЕНИЕ ПОД ДЖИНГЛ — ОДНО ЧИСЛО НА ВСЕХ.

   Вдвое тише ТЕКУЩЕГО положения ползунка, а не до жёсткой половины:
   громкость задаёт мастер, и приглушение обязано считаться от неё. Поставил
   40% — под джинглом станет 20%.

   Число стоит здесь одно, потому что глушить умеют двое: плеер и приёмник.
   Раньше приглушение было только у плеера и до четверти; приёмник, который
   и играет на телевизоре, не умел глушить вовсе. Разведи их по разным
   числам — и звук на стриме разойдётся со звуком на пульте, а поймать это
   можно только ухом. */
    var DUCK_LEVEL = 0.5;
    window.MUSIC_DUCK_LEVEL = DUCK_LEVEL;   /* наружу — для проверок */

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
        function level() { return P.muted ? 0 : (P.ducked ? P.volume * DUCK_LEVEL : P.volume); }

        function stopNow() {
            if (!P.audio) return;
            clearInterval(P.audio.__fade);
            P.audio.pause && P.audio.pause();
            P.audio = null;
        }
        function playFile(url) {
            if (!url) return;
            stopNow();
            var a = P.audio = new A(url);
            a.volume = 0;
            P.track = url;
            /* Кончился — включаем следующий, чтобы не наступала тишина. */
            a.onended = function () { P.next(); };

            /* НАРАСТАНИЕ ТОЛЬКО ПОСЛЕ ТОГО, КАК ЗВУК ПОШЁЛ.

               Браузер не даёт играть до первого клика по странице: play()
               отклоняется, музыки нет. А нарастание раньше запускалось
               сразу и за 600 мс выкручивало громкость на рабочую. Потом
               пользователь щёлкал по чему угодно, заблокированный звук
               стартовал — и стартовал СРАЗУ НА ПОЛНОЙ, без нарастания.
               Со стороны: музыки нет, нет, и вдруг она орёт.

               Теперь ждём подтверждения от самого браузера. Не пустил —
               ждём первого касания страницы и пробуем снова, всё так же
               с нуля. */
            function пошло() { fade(level(), 600); }
            function неПустили() {
                a.volume = 0;
                if (P.__ждём) return;
                P.__ждём = true;
                var повтор = function () {
                    P.__ждём = false;
                    ['click', 'keydown', 'touchstart'].forEach(function (e) {
                        try { window.removeEventListener(e, повтор); } catch (x) {}
                    });
                    if (P.audio !== a) return;   /* трек уже сменили */
                    var p2 = a.play && a.play();
                    if (p2 && p2.then) p2.then(пошло, function () {}); else пошло();
                };
                ['click', 'keydown', 'touchstart'].forEach(function (e) {
                    try { window.addEventListener(e, повтор, { once: false }); } catch (x) {}
                });
            }
            var p = a.play && a.play();
            if (p && p.then) p.then(пошло, неПустили); else пошло();
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
        /* Приглушение под звуки: тише за 400 мс, обратно за 600.

           `ms` — это ПОТОЛОК, а не срок. Держать приглушение ровно столько,
           сколько звучит джингл, умеет только тот, кто его играет: он один
           знает, когда звук кончился, и зовёт `unduck`. Потолок нужен на
           случай, когда конца не будет вовсе — файла нет, вкладку свернули,
           браузер не пустил звук. Без него музыка осталась бы тихой до
           конца вечера, и причину искали бы долго. */
        P.duck = function (ms) {
            P.ducked = true; fade(level(), 400);
            clearTimeout(P.__unduck);
            P.__unduck = setTimeout(function () { P.unduck(); },
                                    Math.max(300, num(ms) || 3000));
        };
        P.unduck = function () {
            clearTimeout(P.__unduck);
            if (!P.ducked) return;
            P.ducked = false; fade(level(), 600);
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

   Стример по-прежнему не пишет в базу. При открытии локально играет intro;
   после новой команды принимает готовые адреса от пульта мастера.
   ══════════════════════════════════════════════════════════════════════ */

/* Пульт: держит список и номер трека, наружу отдаёт что писать в базу.
   Сам ничего не проигрывает — у мастера тихо. */
    window.makeMusicRemote = function (opts) {
        opts = opts || {};
        var now = opts.now || Date.now, send = opts.send || function () {};
        var R = {kind:null,list:[],idx:-1,playing:false,commandId:'',sceneKey:'',
            volume:opts.volume == null ? 0.6 : opts.volume,position:0,startedAt:now(),overlay:null};
        var commandNo=0,timer=null,clockVersion=0,lastOverlayTrack='';
        function command(){R.commandId=now()+':'+(++commandNo);}
        function shuffle(list,previous){
            list=list.slice();
            for(var i=list.length-1;i>0;i--){var j=Math.floor((opts.rng||Math.random)()*(i+1)),t=list[i];list[i]=list[j];list[j]=t;}
            if(list.length>1 && list[0]===previous){var t=list[0];list[0]=list[1];list[1]=t;}
            return list;
        }
        function fill(kind){R.list=shuffle(window.ambientList(kind)||[]);}
        function offset(clock,running){return Math.max(0,Number(clock.position)||0)+(running?Math.max(0,now()-clock.startedAt)/1000:0);}
        function freeze(){
            R.position=offset(R,R.playing&&!R.overlay);R.startedAt=now();
            if(R.overlay){R.overlay.position=offset(R.overlay,R.playing);R.overlay.startedAt=now();}
        }
        function publish(resetClock){
            send({track:R.playing?(R.list[R.idx]||''):'',kind:R.kind||'peace',playing:!!R.playing,
                volume:R.volume,commandId:R.commandId,sceneKey:R.sceneKey,position:R.position,startedAt:R.startedAt,
                overlay:R.overlay?Object.assign({},R.overlay,{track:R.overlay.list[R.overlay.idx]}):false,at:now()});
            if(resetClock!==false)rearm();
        }
        var measure=opts.measure||function(track,cb){
            if(typeof Audio==='undefined')return;
            var probe=new Audio();probe.preload='metadata';
            probe.onloadedmetadata=function(){cb(probe.duration);};probe.onerror=function(){cb(0);};probe.src=track;
        };
        function rearm(){
            var version=++clockVersion;if(timer){clearTimeout(timer);timer=null;}
            if(!R.playing)return;
            var clock=R.overlay||R,track=clock.list[clock.idx];if(!track)return;
            measure(track,function(sec){
                if(version!==clockVersion||!(sec>0)||!R.playing)return;
                if(timer)clearTimeout(timer);
                timer=setTimeout(function(){R.ended();},Math.max(0,sec-offset(clock,true))*1000+700);
            });
        }
        function resetTrack(){var c=R.overlay||R;c.position=0;c.startedAt=now();}
        R.setScene=function(kind,sceneKey){
            sceneKey=sceneKey||'';
            if(kind===R.kind&&sceneKey===R.sceneKey&&R.playing)return;
            R.sceneKey=sceneKey;command();R.kind=kind;fill(kind);R.idx=0;
            R.position=0;R.startedAt=now();R.playing=!!R.list.length;publish();
        };
        R.play=function(){
            if(!R.list.length)fill(R.kind||'peace');if(!R.list.length)return;
            if(R.idx<0)R.idx=0;freeze();command();R.playing=true;publish();
        };
        R.stop=function(){freeze();command();R.playing=false;publish();};
        R.next=function(){var c=R.overlay||R;if(!c.list.length)return;command();c.idx=(c.idx+1)%c.list.length;resetTrack();R.playing=true;publish();};
        R.prev=function(){var c=R.overlay||R;if(!c.list.length)return;command();c.idx=(c.idx-1+c.list.length)%c.list.length;resetTrack();R.playing=true;publish();};
        R.shuffle=function(){var c=R.overlay||R;if(c.list.length<2)return;command();c.idx=(c.idx+1+Math.floor((opts.rng||Math.random)()*(c.list.length-1)))%c.list.length;resetTrack();R.playing=true;publish();};
        R.setVolume=function(v){R.volume=Math.max(0,Math.min(1,Number(v)||0));publish(false);};
        R.ended=function(){
            if(!R.playing)return;
            if(R.overlay?.finishing){R.setOverlay(false,{force:true});return;}var c=R.overlay||R;if(!c.list.length)return;
            var previous=c.list[c.idx];c.idx++;
            if(c.idx>=c.list.length){c.list=shuffle(c.list,previous);c.idx=0;}
            resetTrack();publish();
        };
        /* Пульт выбирает порядок один раз для всех экранов. Пока идёт фон,
           часы обычной песни заморожены вместе с позицией воспроизведения. */
        R.setOverlay=function(active,options){
            options=options||{};
            if(active&&R.overlay?.finishing){R.overlay.finishing=false;publish();return;}
            if(!active&&R.overlay&&!options.force){
                if(R.overlay.finishing)return;
                if(options.finishTrack){R.overlay.finishing=true;publish();return;}
            }
            if(!!active===!!R.overlay)return;
            freeze();
            if(active){
                var list=shuffle(window.inspiringMusicList(),lastOverlayTrack);if(!list.length)return;
                R.overlay={id:'riff-'+now()+'-'+(++commandNo),list:list,idx:0,position:0,startedAt:now()};
            }else{lastOverlayTrack=R.overlay.list[R.overlay.idx];R.overlay=null;R.startedAt=now();}
            publish();
        };
        R.restore=function(st){
            st=st||{};R.kind=st.kind||'peace';R.sceneKey=st.sceneKey||'';R.volume=st.volume==null?.6:Math.max(0,Math.min(1,Number(st.volume)||0));
            R.playing=!!st.playing;R.commandId=st.commandId||'';fill(R.kind);R.idx=R.list.indexOf(st.track);
            if(R.idx<0&&st.track){R.list.unshift(st.track);R.idx=0;}if(R.idx<0)R.idx=0;
            R.position=Math.max(0,Number(st.position)||0);R.startedAt=Number(st.startedAt)||now();
            R.overlay=st.overlay&&Array.isArray(st.overlay.list)&&st.overlay.list[st.overlay.idx]?JSON.parse(JSON.stringify(st.overlay)):null;
            rearm();
        };
        R.stopClock=function(){clockVersion++;if(timer){clearTimeout(timer);timer=null;}};
        R.state=function(){var c=R.overlay||R;return {kind:R.overlay?'inspiring':R.kind,playing:R.playing,volume:R.volume,track:c.list[c.idx]||'',count:c.list.length,overlay:!!R.overlay};};
        return R;
    };

/* Новый стример всегда начинает с intro. Первый снимок комнаты — история,
   а не новое нажатие мастера. Автопереход старого пульта его не перебивает.
   Новая сцена или явная команда пульта передаёт управление мастеру.
   Здесь только локальный звук: никаких записей из стримера в базу. */
    window.makeStreamMusic = function (opts) {
        var sink = opts.sink, first = true, opening = !opts.resume, commandId = '';
        var list = window.ambientList('intro'), idx = 0, volume = 0.6;
        if (opening && list.length) sink.apply({ playing: true, track: list[0], volume: volume });
        return {
            apply: function (st) {
                st = st || {};
                var id = st.commandId || '';
                if (first) { first = false; commandId = id; }
                else if (id && id !== commandId) { opening = false; commandId = id; }
                if (st.overlay) opening = false;
                if (!opening) { sink.apply(st); return; }
                if (st.volume != null) volume = st.volume;
                if (list.length) sink.apply({ playing: true, track: list[idx], volume: volume });
            },
            ended: function () {
                if (!opening || !list.length) return;
                idx = (idx + 1) % list.length;
                sink.apply({ playing: true, track: list[idx], volume: volume });
            }
        };
    };

/* Приёмник: играет ровно то, что прислал мастер. Ничего не выбирает. */
    window.makeMusicSink = function (opts) {
        opts = opts || {};
        var A = opts.Audio || (typeof Audio !== 'undefined' ? Audio : null);
        if (!A) return null;
        var S = { audio: null, track: '', muted: false, ducked: false, volume: 0.6, localVolume:1 };

        function level() {
            if (S.muted) return 0;
            return S.volume * S.localVolume * (S.ducked ? DUCK_LEVEL : 1);
        }
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
        function tryPlay(a) {
            if (!a || !a.play) return Promise.resolve(false);
            var result;
            try { result = a.play(); } catch (err) { result = Promise.reject(err); }
            return Promise.resolve(result).then(function () {
                if (S.audio !== a) return false;
                S.blocked = false;
                return true;
            }, function () {
                if (S.audio !== a) return false;
                S.blocked = true;
                if (opts.onBlocked) opts.onBlocked();
                return false;
            });
        }
        S.apply = function (st) {
            st = st || {};
            if (st.volume != null) S.volume = Math.max(0, Math.min(1, Number(st.volume) || 0));
            if (!st.playing || !st.track) { stopNow(); S.track = ''; return; }
            if (st.track === S.track && S.audio && !S.ended) { fade(level(), 200); return; }
            stopNow();
            S.track = st.track;
            S.ended = false;
            S.audio = new A(st.track);
            S.audio.volume = 0;
            var currentAudio=S.audio;
            currentAudio.onloadedmetadata=function(){
                if(S.audio!==currentAudio&&savedAudio!==currentAudio)return;
                var at=Math.max(0,Number(st.position)||0)+(!st.overlay&&st.startedAt?Math.max(0,Date.now()-st.startedAt)/1000:0);
                try{if(at>0)currentAudio.currentTime=Number.isFinite(currentAudio.duration)?Math.min(at,Math.max(0,currentAudio.duration-.05)):at;}catch(e){}
            };
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
            tryPlay(S.audio);
            fade(level(), 600);
            S.audio.onended = function () { S.ended = true; if (opts.onEnded) opts.onEnded(); };
        };
        /* Нормальная дорожка сохраняет сам Audio и его позицию. При смене
           мелодий рифа она не возобновляется даже на короткий момент. */
        var applyNormal=S.apply,normalState=null,savedAudio=null,savedTrack='',overlayWant='',overlayPlaying=false,overlayVersion=0,candidate=null;
        function dispose(a){if(a){clearInterval(a.__fade);a.pause();}}
        function restoreNormal(){
            if(candidate){dispose(candidate);candidate=null;}
            if(overlayPlaying)dispose(S.audio);
            overlayPlaying=false;
            if(savedAudio){
                S.audio=savedAudio;S.track=savedTrack;S.ended=false;savedAudio=null;
                if(normalState&&normalState.track===S.track&&normalState.playing){tryPlay(S.audio);fade(level(),400);return;}
            }
            applyNormal(normalState||{});
        }
        S.apply=function(st){
            normalState=Object.assign({},st||{});
            if(st&&st.volume!=null)S.volume=Math.max(0,Math.min(1,Number(st.volume)||0));
            if(!overlayPlaying)applyNormal(st);
            else if(S.audio){if(st&&st.playing)tryPlay(S.audio);else S.audio.pause();fade(level(),200);}
            if(st&&Object.prototype.hasOwnProperty.call(st,'overlay'))S.setOverlay(st.overlay?.track||'',st.overlay?st.overlay.id+':'+st.overlay.idx:'',st.overlay||null);
        };
        S.setOverlay=function(url,key,clock){
            url=String(url||'');var wanted=url+'|'+(key||'');if(wanted===overlayWant){if(overlayPlaying&&S.audio){S.audio.loop=!(clock&&clock.finishing);S.audio.onended=function(){if(clock?.finishing&&opts.onEnded)opts.onEnded();};}return;}
            overlayWant=wanted;var version=++overlayVersion;
            if(candidate){dispose(candidate);candidate=null;}
            if(!url){if(overlayPlaying)restoreNormal();return;}
            var a=candidate=new A(url);a.loop=!(clock&&clock.finishing);a.volume=0;
            a.onended=function(){if(S.audio===a&&clock?.finishing&&opts.onEnded)opts.onEnded();};
            a.onerror=function(){
                if(version!==overlayVersion)return;
                if(overlayPlaying)restoreNormal();else{dispose(a);candidate=null;}
                if(opts.onError)opts.onError('не найдена мелодия рифа: '+url.split('/').pop());
            };
            a.oncanplay=function(){
                if(version!==overlayVersion||candidate!==a)return;
                var old=S.audio;
                if(!overlayPlaying){savedAudio=old;savedTrack=S.track;}
                candidate=null;S.audio=a;S.track=url;S.ended=false;overlayPlaying=true;
                if(clock){
                    var at=Math.max(0,Number(clock.position)||0)+(normalState?.playing&&clock.startedAt?Math.max(0,Date.now()-clock.startedAt)/1000:0);
                    try{a.currentTime=Number.isFinite(a.duration)?Math.min(at,Math.max(0,a.duration-.05)):at;}catch(e){}
                }
                dispose(old);
                /* Пауза/громкость ведущего и личная громкость зрителя
                   действуют и во время рифа. Первый клик разблокирует его. */
                if(!normalState||normalState.playing)tryPlay(a);
                fade(level(),400);
            };
            if(a.load)a.load();
        };

        /* Глушилка ЗРИТЕЛЯ — только здесь, в базу не идёт. */
        S.setLocalVolume = function(v){S.localVolume=Math.max(0,Math.min(1,Number(v)||0));fade(level(),150);};
        S.setMuted = function (on) { S.muted = !!on; fade(level(), 300); };

        /* ПРИГЛУШЕНИЕ ПОД ДЖИНГЛ. Музыка не выключается, а становится вдвое
           тише и плавно возвращается, когда джингл отзвучал.

           Держится столько, сколько звучит сам джингл: его проигрыватель
           зовёт `unduck` по своему концу. `ms` — только потолок на случай,
           когда конца не будет (файла нет, браузер не пустил звук, вкладку
           свернули). Без потолка музыка осталась бы тихой навсегда.

           Приглушение переживает смену трека нарочно: новый трек берёт
           громкость через тот же `level()`, иначе музыка выскочила бы на
           полную прямо посреди песни барда. */
        S.duck = function (ms) {
            S.ducked = true; fade(level(), 400);
            clearTimeout(S.__unduck);
            S.__unduck = setTimeout(function () { S.unduck(); },
                                    Math.max(300, Number(ms) || 8000));
        };
        S.unduck = function () {
            clearTimeout(S.__unduck);
            if (!S.ducked) return;
            S.ducked = false; fade(level(), 600);
        };
        /* Разблокировка по первому нажатию: повторяем то, что уже прислано. */
        S.unblock = function () {
            if (!S.audio) return Promise.resolve(false);
            return tryPlay(S.audio);
        };
        S.state = function () { return { track: S.track, muted: S.muted,
                                         ducked: S.ducked, localVolume:S.localVolume, effectiveVolume:level(),
                                         playing: !!S.audio, volume: S.volume,
                                         blocked: !!S.blocked }; };
        return S;
    };
