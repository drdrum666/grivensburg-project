/* dice-controller.js — контроллер кубиков стримера.

   Этот файл растёт по частям. Сейчас в нём ПЕРЕЛЁТ В ЦЕНТР — решение автора:

     кубик (или пара) докатывается куда хочет, лишь бы нужная цифра была
     видна; затем за одну секунду плавно прилетает в центр экрана, где
     цифра уже смотрит на зрителя и стоит прямо.

   Это отдельная фаза ПОСЛЕ физической остановки, а не скрытая поправка во
   время качения: пока кубик катится, физика его не двигает и не доворачивает.

   Чистая часть, без страницы и сети: по конечным позам физики строит план
   перелёта и отдаёт позу на любой момент. Поэтому проверяется без браузера.

   Обычный скрипт, не модуль: игра открывается и двойным кликом (file://). */
(function (root) {
'use strict';

/* Та же кривая, что у лаборатории (smooth): мягкий старт и мягкая посадка. */
function smooth(t) { t = Math.min(1, Math.max(0, t)); return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a, b, t) { return a + (b - a) * t; }

/* Сферическая интерполяция кватернионов [x,y,z,w] по кратчайшему пути. */
function slerp(a, b, t) {
    let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    let bb = b;
    if (d < 0) { d = -d; bb = b.map(function (v) { return -v; }); }
    if (d > 0.9995) {
        const r = a.map(function (v, i) { return v + (bb[i] - v) * t; });
        const n = Math.hypot(r[0], r[1], r[2], r[3]);
        return r.map(function (v) { return v / n; });
    }
    const th = Math.acos(d), s = Math.sin(th);
    const ka = Math.sin((1 - t) * th) / s, kb = Math.sin(t * th) / s;
    return a.map(function (v, i) { return v * ka + bb[i] * kb; });
}

/* ПЛАН ПЕРЕЛЁТА.
     poses   — конечные позы физики [{x, y, h, air, scale, q}], по одной на кубик;
     targets — кватернион «цифра ровно к зрителю и прямо» для каждого кубика;
     centers — где кубик окажется в итоге (по умолчанию центр; пара — рядом);
     scale   — итоговый масштаб (ТЗ: 150 %);
     seconds — длительность (решение автора: одна секунда). */
function planFlight(opts) {
    const poses = opts.poses, n = poses.length;
    const centers = opts.centers || (n === 2
        ? [{ x: -(opts.pairGap || 0.75), y: 0 }, { x: (opts.pairGap || 0.75), y: 0 }]
        : [{ x: 0, y: 0 }]);
    return {
        seconds: opts.seconds || 1,
        scale: opts.scale || 1.5,
        from: poses.map(function (p) {
            return { x: p.x, y: p.y, h: p.h || 0, air: p.air || 0, scale: p.scale || 1, q: p.q.slice() };
        }),
        to: poses.map(function (p, i) {
            return { x: centers[i].x, y: centers[i].y, h: 0, air: 0, scale: opts.scale || 1.5,
                     q: opts.targets[i].slice() };
        })
    };
}

/* Поза на момент t секунд от начала перелёта. После конца — итоговая. */
function flightAt(plan, t) {
    const k = smooth(t / plan.seconds);
    return plan.from.map(function (a, i) {
        const b = plan.to[i];
        return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), h: lerp(a.h, b.h, k),
                 air: lerp(a.air, b.air, k), scale: lerp(a.scale, b.scale, k),
                 q: slerp(a.q, b.q, k) };
    });
}

/* ══════════════════════════════════════════════════════════════════════
   ЯДРО КОНТРОЛЛЕРА: шкурки, жизнь броска, позы.

   Страницу не трогает само: рамки, сообщения, часы и случайность подаются
   снаружи (env). В браузере их даёт attachToPage ниже; в проверках —
   поддельные. Так ядро проверяется без браузера целиком.

   ЖИЗНЬ БРОСКА (rollId):
     idle → rolling (start) → stopping (resolve) → flight (кубик лёг,
     секунда полёта в центр) → hold (показ) → idle (скрыть).
   Команды с чужим rollId отбрасываются: поздний ответ старого броска не
   тронет новый. Новый start при живом броске прежний снимает.

   ПОЗА → ПИКСЕЛИ — как renderPose лаборатории:
     D20:  unit = min(W·0.40, H·0.43)
     пара: unit = min(W·0.1104, H·0.36), и к x добавляется сдвиг
           pairPlacement — каждый D10 считается в своём кадре.
     x = (p.x + сдвиг)·unit, y = (p.y − p.h)·unit от центра, radius = unit·0.43·scale.
   ══════════════════════════════════════════════════════════════════════ */
/* D20 — чуть крупнее одного D10, а не «скала» во весь экран (просьба
   автора 27.09.2026): было ~2,2 радиуса D10, стало ~1,2. Раскладка та же. */
const D20_SIZE = 0.55;
function toPixels(p, die, W, H, shift) {
    const pair = die === 10;
    const unit = Math.min(W * (pair ? 0.1104 : 0.40), H * (pair ? 0.36 : 0.43));
    return { x: (p.x + (shift || 0)) * unit, y: (p.y - (p.h || 0)) * unit,
             radius: unit * 0.43 * (p.scale || 1) * (pair ? 1 : D20_SIZE), q: p.q.slice() };
}

function createCore(env) {
    const hold = env.hold === undefined ? 2 : env.hold;
    /* Сколько секунд бросок ждёт грани от шкурки. Дольше — шкурки нет
       (файла нет на гитхабе, сеть, под этим именем лежит не шкурка). */
    const skinWait = env.skinWait === undefined ? 8 : env.skinWait;
    const frames = {};           /* die → [{ win, post, remove, faces, live }] */
    let roll = null;             /* текущий бросок */
    let token = null;

    function emit(ev) { if (env.onEvent) env.onEvent(ev); }

    /* Рамки — один раз на тип кубика: D20 — одна, пара D10 — две одного файла. */
    function ensureFrames(die) {
        if (frames[die]) return frames[die];
        if (!token) token = env.token();
        const n = die === 10 ? 2 : 1;
        frames[die] = [];
        for (let i = 0; i < n; i++) {
            const f = env.makeFrame(env.skins[die]);
            frames[die].push({ win: f.win, post: f.post, remove: f.remove, faces: null, live: false });
        }
        return frames[die];
    }

    /* Сообщение от шкурки. Принимаем только от СВОИХ рамок и протокол 1. */
    function onMessage(e) {
        const d = e && e.data;
        if (!d || d.protocol !== 1 || typeof d.type !== 'string') return;
        let fr = null, die = null;
        Object.keys(frames).forEach(k => frames[k].forEach(f => { if (f.win === e.source) { fr = f; die = Number(k); } }));
        if (!fr) return;
        if (d.type === 'gb:dice:ready') {
            if (!Array.isArray(d.faces) || !d.faces.length) return;
            fr.faces = d.faces;
            if (!fr.live) { fr.post({ type: 'gb:dice:init', protocol: 1, sessionToken: token }); fr.live = true; }
            if (roll && roll.die === die && roll.physics) roll.physics.setFaces(die, d.faces);
            emit({ type: 'skin-ready', die });
        }
    }

    function facesOf(die) {
        const f = (frames[die] || []).find(x => x.faces);
        return f ? f.faces : null;
    }
    function ready(die) { return !!(frames[die] && frames[die].every(f => f.live && f.faces)); }

    function sendPoses(poses) {
        const list = frames[roll.die] || [];
        poses.forEach((p, i) => {
            const f = list[i];
            if (!f || !f.live) return;
            f.post({ type: 'gb:dice:pose', protocol: 1, sessionToken: token, rollId: roll.id,
                     instances: [Object.assign({ id: 'a', visible: true }, p)] });
        });
    }
    function hideAll() {
        Object.keys(frames).forEach(k => frames[k].forEach(f => {
            if (f.live) f.post({ type: 'gb:dice:hide', protocol: 1, sessionToken: token });
        }));
    }
    function setPhase(ph) { roll.phase = ph; emit({ type: 'phase', rollId: roll.id, phase: ph }); }

    /* ── Команды ── */
    function start(cmd) {
        if (roll) cancel({ rollId: roll.id });
        const die = cmd.die === 10 ? 10 : 20;
        ensureFrames(die);
        const faces = facesOf(die);
        const P = env.createPhysics({ faces: faces ? { [die]: faces } : {},
                                      stage: { width: env.width(), height: env.height() } });
        P.setDie(die); P.setMode(cmd.mode || 'orbit');
        roll = { id: cmd.rollId, die, physics: P, phase: 'rolling', values: null,
                 flight: null, t: 0 };
        if (faces) P.start();
        else roll.waitingFaces = true;            /* начнём, как шкурка пришлёт грани */
        setPhase('rolling');
        return true;
    }
    function resolve(cmd) {
        if (!roll || cmd.rollId !== roll.id || roll.phase !== 'rolling') return false;
        const parsed = env.parse(cmd.input, roll.die === 10 ? '2d10' : 'd20');
        if (!parsed) return false;
        /* Шкурка ещё не прислала грани — физика не запущена, останавливать
           нечего. Число запоминаем: применим, как только кубик полетит. */
        if (roll.waitingFaces) { roll.pending = parsed.faces; return true; }
        if (!roll.physics.resolve(parsed.faces.join(' '))) return false;
        roll.values = parsed.faces;
        setPhase('stopping');
        return true;
    }
    function cancel(cmd) {
        if (!roll || (cmd && cmd.rollId !== roll.id)) return false;
        const id = roll.id;
        roll = null;
        hideAll();
        emit({ type: 'phase', rollId: id, phase: 'idle' });
        return true;
    }

    /* ── Кадр ── */
    function displayed() {
        const P = roll.physics;
        const a = P.getPose();
        if (roll.die !== 10) return [a];
        const b = P.secondState ? P.second(() => P.getPose()) : null;
        if (!b) return [a];
        const sh = P.pairPlacement(a, b);
        return [Object.assign({}, a, { x: a.x + sh[0] }), Object.assign({}, b, { x: b.x + sh[1] })];
    }
    function tick(dt) {
        if (!roll) return;
        const P = roll.physics;
        if (roll.waitingFaces) {
            const faces = facesOf(roll.die);
            if (!faces) {
                /* Ждать вечно нельзя: стример держит свою очередь, пока кубик
                   не вернулся в idle, — без шкурки встал бы весь показ.
                   Сдаёмся и говорим странице: пусть идёт старым кубиком. */
                roll.waitedFaces = (roll.waitedFaces || 0) + dt;
                if (roll.waitedFaces >= skinWait) {
                    const id = roll.id, die = roll.die;
                    cancel({ rollId: id });
                    emit({ type: 'skin-missing', rollId: id, die });
                }
                return;
            }
            P.setFaces(roll.die, faces); P.start(); roll.waitingFaces = false;
            roll.flownSince = 0;
        }
        /* Число пришло до граней — даём кубику полсекунды полёта и кладём. */
        if (roll.pending && roll.phase === 'rolling') {
            roll.flownSince += dt;
            if (roll.flownSince >= 0.5 && P.resolve(roll.pending.join(' '))) {
                roll.values = roll.pending; roll.pending = null; setPhase('stopping');
            }
        }
        const W = env.width(), H = env.height();
        if (roll.phase === 'rolling' || roll.phase === 'stopping') {
            P.advance(dt);
            if (roll.phase === 'stopping' && P.phase() === 'done') {
                const poses = displayed();
                roll.flight = planFlight({ poses, targets: roll.values.map(v => P.faceQuaternion(v)) });
                roll.t = 0;
                setPhase('flight');
            } else {
                sendPoses(displayed().map(p => toPixels(p, roll.die, W, H, 0)));
                return;
            }
        }
        if (roll.phase === 'flight' || roll.phase === 'hold') {
            roll.t += dt;
            const poses = flightAt(roll.flight, roll.t);
            sendPoses(poses.map(p => toPixels(p, roll.die, W, H, 0)));
            if (roll.phase === 'flight' && roll.t >= roll.flight.seconds) {
                setPhase('hold');
                emit({ type: 'shown', rollId: roll.id, values: roll.values.slice() });
            }
            if (roll.phase === 'hold' && roll.t >= roll.flight.seconds + hold) cancel({ rollId: roll.id });
        }
    }

    function dispose() {
        roll = null;
        Object.keys(frames).forEach(k => frames[k].forEach(f => {
            if (f.live) f.post({ type: 'gb:dice:dispose', protocol: 1, sessionToken: token });
            f.remove();
        }));
        Object.keys(frames).forEach(k => delete frames[k]);
    }

    return { start, resolve, cancel, tick, dispose, onMessage, ready, ensureFrames,
             get phase() { return roll ? roll.phase : 'idle'; },
             get rollId() { return roll ? roll.id : null; },
             frameCount() { return Object.keys(frames).reduce((s, k) => s + frames[k].length, 0); } };
}

/* ══════════════════════════════════════════════════════════════════════
   СВЯЗЬ СО СТРАНИЦЕЙ СТРИМЕРА.

   Создаёт рамки шкурок в контейнере (один раз на тип кубика — см. ядро),
   слушает сообщения, крутит цикл кадров. Токен сессии — крепкий случайный
   (crypto.getRandomValues), не Math.random.

   Адрес для postMessage: у шкурки по https — её собственный источник; у
   file:// источник 'null', и тогда '*'. Защита при этом держится на том, что
   шкурка принимает команды только от родителя и только с токеном.
   ══════════════════════════════════════════════════════════════════════ */
function targetOriginOf(url, base) {
    try {
        const u = new URL(url, base);
        return (u.protocol === 'https:' || u.protocol === 'http:') ? u.origin : '*';
    } catch (e) { return '*'; }
}

function attachToPage(opts) {
    const win = opts.window || root, doc = opts.document || win.document;
    const box = opts.container;
    const core = createCore({
        skins: opts.skins, hold: opts.hold, skinWait: opts.skinWait,
        width: function () { return box.clientWidth || win.innerWidth || 1920; },
        height: function () { return box.clientHeight || win.innerHeight || 1080; },
        token: function () {
            const a = new Uint8Array(16);
            (win.crypto || root.crypto).getRandomValues(a);
            return Array.from(a, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
        },
        parse: function (s, m) { return win.CombatRules.parseRollInput(s, m); },
        createPhysics: function (o) { return win.DicePhysics.create(o); },
        makeFrame: function (url) {
            const f = doc.createElement('iframe');
            f.src = url;
            f.setAttribute('aria-hidden', 'true');
            f.setAttribute('tabindex', '-1');
            f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;'
                            + 'background:transparent;pointer-events:none;';
            box.appendChild(f);
            const куда = targetOriginOf(url, doc.baseURI || (win.location && win.location.href));
            return {
                win: f.contentWindow,
                post: function (m) { try { f.contentWindow.postMessage(m, куда); } catch (e) {} },
                remove: function () { if (f.parentNode) f.parentNode.removeChild(f); }
            };
        },
        onEvent: opts.onEvent
    });
    const слушать = function (e) { core.onMessage(e); };
    win.addEventListener('message', слушать);
    let last = null, raf = null, живой = true;
    function loop(ts) {
        if (!живой) return;
        const dt = last === null ? 0 : Math.min(0.1, (ts - last) / 1000);
        last = ts;
        core.tick(dt);
        raf = win.requestAnimationFrame(loop);
    }
    raf = win.requestAnimationFrame(loop);
    return {
        start: core.start, resolve: core.resolve, cancel: core.cancel,
        ensureFrames: core.ensureFrames, ready: core.ready,
        get phase() { return core.phase; }, get rollId() { return core.rollId; },
        dispose: function () {
            живой = false;
            if (raf !== null && win.cancelAnimationFrame) win.cancelAnimationFrame(raf);
            win.removeEventListener('message', слушать);
            core.dispose();
        }
    };
}

root.DiceController = root.DiceController || {};
root.DiceController.attachToPage = attachToPage;
root.DiceController.targetOriginOf = targetOriginOf;
root.DiceController.planFlight = planFlight;
root.DiceController.flightAt = flightAt;
root.DiceController.toPixels = toPixels;
root.DiceController.createCore = createCore;
})(typeof window !== 'undefined' ? window : globalThis);
