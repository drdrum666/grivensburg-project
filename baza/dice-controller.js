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
     секунда полёта в центр) → hold (показ) → exiting (уход) → idle.
   Команды с чужим rollId отбрасываются: поздний ответ старого броска не
   тронет новый. Новый start ждёт ухода прежнего броска.

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

/* Грани проверяем до передачи физике: полный набор, конечные единичные
   векторы и направление верха в плоскости грани. */
function validFaces(faces, die) {
    if (!Array.isArray(faces) || faces.length !== die) return false;
    const values = new Set();
    return faces.every(f => {
        if (!f || !Number.isInteger(f.value) || f.value < 1 || f.value > die || values.has(f.value)) return false;
        values.add(f.value);
        const vector = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite)
            && Math.abs(Math.hypot(...v) - 1) < 0.02;
        return vector(f.normal) && vector(f.up)
            && Math.abs(f.normal.reduce((sum, v, i) => sum + v * f.up[i], 0)) < 0.02;
    });
}
function sameFaces(a, b) {
    return a.every(f => {
        const g = b.find(x => x.value === f.value);
        return g && ['normal', 'up'].every(k => f[k].every((v, i) => Math.abs(v - g[k][i]) < 1e-5));
    });
}

/* Настройки общие для дашборда и стримера; физика получает снимок на бросок. */
const DICE_MODES = ['orbit', 'top', 'bounce', 'sweep'];
/* СЛУЧАЙНЫЙ ПОЛЁТ — ПО УМОЛЧАНИЮ (решение автора 28.09.2026). Режим полёта
   выбирает Ведущий, у D20 и пары свой; «Случайно» — каждый бросок берёт
   один из четырёх наугад. Не выбран режим вовсе — тоже «Случайно»: раньше
   было «Орбита», и все броски летели одинаково. Прежнее общее поле `mode`
   (его писала кнопка включения 3D) больше не читается. */
const RANDOM_MODE = 'random';
function modeChoice(config, die) {
    const m = ((config || {}).modes || {})[die];
    return DICE_MODES.includes(m) || m === RANDOM_MODE ? m : RANDOM_MODE;
}
/* Скорости хранятся у выбранного пункта: у «Случайно» свои. Заданы — ими
   летит любой выпавший режим; нет — берутся скорости выпавшего режима.
   choicePrefs — то, что показывает и правит дашборд для выбранного пункта. */
function optionsFor(config, die, selectedMode, rng) {
    const c = config || {}, choice = selectedMode || modeChoice(c, die);
    const chosen = DICE_MODES.includes(choice) ? choice
        : DICE_MODES[Math.min(DICE_MODES.length - 1, Math.floor((rng || Math.random)() * DICE_MODES.length))];
    const все = c.prefs || {}, свои = все[die + '-' + choice];
    const p = свои || все[die + '-' + chosen] || {};
    const clamp = (v, fallback, min, max) => Number.isFinite(Number(v)) && v !== '' && v != null
        ? Math.max(min, Math.min(max, Number(v))) : fallback;
    const читать = q => ({ tempo: clamp(q.tempo, 1, .25, 2.5), rotation: clamp(q.rotation, 1, .15, 3),
        completion: clamp(q.completion, 1.3, 1, 3) });
    return { mode: chosen, choice, prefs: { [die + '-' + chosen]: читать(p) }, choicePrefs: читать(свои || {}) };
}
/* ЛЁГКАЯ ШКУРКА — КУБИКИ ПО УМОЛЧАНИЮ (решение автора 28.09.2026).

   Старый плоский кубик стримера убран. Кубики на стриме теперь всегда
   этой системы: выключены «Кубики 3D» — стоит лёгкая шкурка, включены —
   выбранная Ведущим (ледяной дракон или своя). Лёгкая — шкурка автора
   «красное золото» (28.09.2026): dice/d20_red_gold_light.html и
   dice/d10_red_gold_light.html, протокол тот же, что у ледяных, модель и
   текстуры облегчены (1,4 и 1,0 МБ против 4,3). Нет файла — шкурка не
   ответит, и стример идёт без кубиков, надписью «бросает…» и карточкой.
   Версия — из самой шкурки (SKIN.version): новая версия файла не
   подменяется старой из кеша браузера. */
const LIGHT_SKIN_VERSION = '1.0.6';
function effectiveConfig(config) {
    const c = config || {};
    if (c.enabled) return c;
    return Object.assign({}, c, { skins: { 20: { id: 'light' }, 10: { id: 'light' } } });
}
function skinUrl(config, die, base) {
    const skin = ((config || {}).skins || {})[die] || {};
    const path = skin.id === 'custom' ? String(skin.url || '').trim()
               : skin.id === 'light' ? 'dice/d' + die + '_red_gold_light.html'
               : 'dice/d' + die + '_ice_anim.html';
    if (!path || /^(?!https?:|file:)[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//'))
        throw new Error('Нужен адрес HTML-шкурки: https, localhost или путь к файлу');
    const url = /^(https?:|file:)/i.test(path) ? path : (base || '') + path;
    const hash = url.indexOf('#'), head = hash < 0 ? url : url.slice(0, hash), tail = hash < 0 ? '' : url.slice(hash);
    const ver = skin.id === 'custom' ? (skin.version || '1.0.2') : skin.id === 'light' ? LIGHT_SKIN_VERSION : '1.0.2';
    return head + (head.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(ver) + tail;
}
function qmul(a, b) {
    return [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1], a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
        a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3], a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
}
function angularVelocity(a, b, dt) {
    let q = qmul(b, [-a[0], -a[1], -a[2], a[3]]);
    if (q[3] < 0) q = q.map(v => -v);
    const len = Math.hypot(...q.slice(0, 3));
    return len < 1e-8 || !dt ? [0, 0, 0] : q.slice(0, 3).map(v => v * 2 * Math.atan2(len, q[3]) / len / dt);
}
/* Уход начинается из последнего показанного кадра. Кубики сохраняют
   касательную скорости; пара расходится влево/вправо, вращение связано с путём. */
function planExit(poses, previous, dt, width) {
    return poses.map((p, i) => {
        const old = previous && previous[i], vx = old && dt > 0 ? (p.x-old.x)/dt : 0,
            vy = old && dt > 0 ? (p.y-old.y)/dt : 0;
        const side = poses.length === 2 ? (i ? 1 : -1) : (vx < -.01 ? -1 : vx > .01 ? 1 : p.x < 0 ? -1 : 1);
        const endX = side * (width / 2 + p.radius * 2 + 40), seconds = 1.05;
        return { from: { ...p, q: p.q.slice() }, current: { ...p, q: p.q.slice() }, vx, vy, endX, seconds,
            omega: old ? angularVelocity(old.q, p.q, dt) : [0,0,0], t: 0 };
    });
}
function advanceExit(plans, dt) {
    const groundS = .23/.74, groundC = Math.sqrt(1-groundS*groundS);
    return plans.map(p => {
        const elapsed = Math.min(dt, p.seconds-p.t); p.t = Math.min(p.seconds, p.t+dt);
        const u = p.t/p.seconds, u2=u*u, u3=u2*u;
        const h00=2*u3-3*u2+1, h10=u3-2*u2+u, h01=-2*u3+3*u2, h11=u3-u2;
        const endV = (p.endX-p.from.x)*1.5/p.seconds;
        const x=h00*p.from.x+h10*p.seconds*p.vx+h01*p.endX+h11*p.seconds*endV;
        const y=p.from.y+h10*p.seconds*p.vy;
        const dx=x-p.current.x, dz=-(y-p.current.y)/groundS;
        const travel=[groundC*dz, groundS*dx, -groundC*dx];
        const blend = Math.hypot(...p.omega) < 1e-6 ? 1 : smooth(p.t/.22);
        const turn=travel.map((v,i)=>v/Math.max(1,p.from.radius)*blend+p.omega[i]*elapsed*(1-blend));
        const angle=Math.hypot(...turn), k=angle<1e-9 ? 0 : Math.sin(angle/2)/angle;
        let q=qmul([turn[0]*k,turn[1]*k,turn[2]*k,Math.cos(angle/2)],p.current.q);
        const len=Math.hypot(...q); q=q.map(v=>v/len);
        p.current={x,y,radius:p.from.radius,q}; return p.current;
    });
}

const SKIN_LOAD_LIMIT = 60;    /* секунд на скачивание шкурки сверх ожидания ответа */
function createCore(env) {
    const hold = env.hold === undefined ? 2 : env.hold;
    const skinWait = env.skinWait === undefined ? 8 : env.skinWait;
    const frames = {}, failures = {};
    let roll = null, pendingRolls = [], token = null, disposed = false;
    function emit(ev) { if (env.onEvent) env.onEvent(ev); }
    function ready(die) {
        const list = frames[die];
        return !failures[die] && !!list && list.length === (die === 10 ? 2 : 1)
            && list.every(f => f.live && f.faces);
    }
    function report(die) {
        const list = frames[die] || [];
        emit({ type: 'skin-status', die, state: failures[die] ? 'error' : ready(die) ? 'ready' : 'loading',
            ready: list.filter(f => f.live).length, total: die === 10 ? 2 : 1,
            message: failures[die] || '' });
    }
    function hideAll() {
        Object.values(frames).forEach(list => list.forEach(f => {
            try { f.post({ type: 'gb:dice:hide', protocol: 1, sessionToken: token }); } catch (e) {}
        }));
    }
    function releaseRoll() {
        const old = roll; roll = null;
        if (old && old.physics && old.physics.reset) { try { old.physics.reset(); } catch (e) {} }
        return old;
    }
    function removeFrames(die) {
        const list = frames[die] || [];
        delete frames[die];
        list.forEach(f => {
            try { f.post({ type: 'gb:dice:dispose', protocol: 1, sessionToken: token }); } catch (e) {}
            try { f.remove(); } catch (e) {}
        });
    }
    function failSkin(die, message) {
        if (disposed || failures[die]) return;
        failures[die] = String(message || 'Ошибка кубика');
        pendingRolls = pendingRolls.filter(cmd => cmd.die !== die);
        if (roll && roll.die === die) finishRoll();
        removeFrames(die);
        report(die);
    }
    function guarded(die, fn) {
        try { return fn(); }
        catch (e) { failSkin(die, 'Физика или отрисовка: ' + (e.message || e)); return false; }
    }
    function ensureFrames(die) {
        if (disposed || failures[die]) return [];
        if (frames[die]) return frames[die];
        return guarded(die, () => {
            if (!token) token = env.token();
            frames[die] = [];
            for (let i = 0; i < (die === 10 ? 2 : 1); i++) {
                const f = env.makeFrame(env.skins[die]);
                frames[die].push({ win: f.win, origin: f.origin, post: f.post, remove: f.remove, isLoading:f.isLoading,
                    faces: null, live: false, waited: 0 });
                if (f.onError) f.onError(e => failSkin(die, 'Не загрузилась шкурка' + (e?.message ? ': ' + e.message : '')));
            }
            report(die);
            return frames[die];
        }) || [];
    }
    function onMessage(e) {
        if (disposed) return;
        const d = e && e.data;
        let fr = null, die = null;
        Object.keys(frames).forEach(k => frames[k].forEach(f => {
            if (f.win === e.source) { fr = f; die = Number(k); }
        }));
        if (!fr || (fr.origin && e.origin !== fr.origin)) return;
        if (!d || typeof d.type !== 'string' || !d.type.startsWith('gb:dice:')) return;
        if (d.protocol !== 1) { failSkin(die, 'Неподдерживаемый протокол шкурки'); return; }
        if (d.sessionToken != null && d.sessionToken !== token) return;
        if (d.type === 'gb:dice:error') { failSkin(die, String(d.message || 'Ошибка WebGL').slice(0, 200)); return; }
        if (d.type !== 'gb:dice:ready') return;
        if (!d.capabilities || d.capabilities.die !== die || d.capabilities.instances !== 1
            || !validFaces(d.faces, die)) { failSkin(die, 'Неверная таблица граней или тип кубика'); return; }
        const other = frames[die].find(f => f.faces);
        if (other && !sameFaces(other.faces, d.faces)) { failSkin(die, 'У пары D10 различаются грани'); return; }
        guarded(die, () => {
            if (fr.live) return;
            fr.faces = d.faces.map(f => ({ value: f.value, normal: f.normal.slice(), up: f.up.slice() }));
            fr.live = true;
            fr.post({ type: 'gb:dice:init', protocol: 1, sessionToken: token });
            report(die);
        });
    }
    function facesOf(die) { return ready(die) ? frames[die][0].faces : null; }
    function sendPoses(poses) {
        roll.previousPixels = roll.lastPixels;
        roll.lastPixels = poses.map(p => ({ ...p, q: p.q.slice() }));
        if (!ready(roll.die) || poses.length !== (roll.die === 10 ? 2 : 1))
            throw new Error('Не готов полный комплект кубиков');
        poses.forEach((p, i) => {
            if (![p.x, p.y, p.radius].every(Number.isFinite) || p.radius <= 0
                || !Array.isArray(p.q) || p.q.length !== 4 || !p.q.every(Number.isFinite))
                throw new Error('Некорректная поза кубика');
            frames[roll.die][i].post({ type: 'gb:dice:pose', protocol: 1, sessionToken: token,
                rollId: roll.id, instances: [Object.assign({ id: 'a', visible: true }, p)] });
        });
    }
    function setPhase(ph) { roll.phase = ph; emit({ type: 'phase', rollId: roll.id, phase: ph }); }
    function start(cmd) {
        if (disposed || !cmd || !cmd.rollId) return false;
        if ((roll && roll.id === cmd.rollId) || pendingRolls.some(p => p.rollId === cmd.rollId)) return true;
        if (roll) {
            pendingRolls.push({ ...cmd, prefs: JSON.parse(JSON.stringify(cmd.prefs || {})) });
            if (roll.phase === 'rolling' && !roll.pending) beginExit();
            return true;
        }
        const die = cmd.die === 10 ? 10 : 20;
        ensureFrames(die);
        if (failures[die]) return false;
        return guarded(die, () => {
            const faces = facesOf(die);
            const P = env.createPhysics({ faces: faces ? { [die]: faces } : {},
                stage: { width: env.width(), height: env.height() }, prefs: JSON.parse(JSON.stringify(cmd.prefs || {})) });
            roll = { id: cmd.rollId, die, physics: P, phase: 'rolling', values: null,
                flight: null, t: 0, waitingFaces: !faces };
            P.setDie(die); P.setMode(cmd.mode || 'orbit');
            if (faces && P.start() === false) throw new Error('Не удалось запустить физику');
            setPhase('rolling');
            return true;
        });
    }
    function resolve(cmd) {
        const pending = pendingRolls.find(p => p.rollId === cmd.rollId);
        if (pending) {
            if (!env.parse(cmd.input, pending.die === 10 ? '2d10' : 'd20')) return false;
            pending.input = cmd.input; return true;
        }
        if (!roll || cmd.rollId !== roll.id || roll.phase !== 'rolling') return false;
        return guarded(roll.die, () => {
            const parsed = env.parse(cmd.input, roll.die === 10 ? '2d10' : 'd20');
            if (!parsed) return false;
            if (roll.waitingFaces) { roll.pending = parsed.faces; return true; }
            if (!roll.physics.resolve(parsed.faces.join(' '))) throw new Error('Физика не приняла результат');
            roll.values = parsed.faces;
            setPhase('stopping');
            return true;
        });
    }
    function finishRoll() {
        const old = releaseRoll();
        hideAll();
        if (old) emit({ type: 'phase', rollId: old.id, phase: 'idle' });
        while (!roll && pendingRolls.length && !disposed) {
            const next = pendingRolls.shift();
            if (start(next) && next.input != null) resolve({ rollId:next.rollId, input:next.input });
        }
    }
    function beginExit() {
        if (!roll || roll.phase === 'exiting') return;
        if (!roll.lastPixels) { finishRoll(); return; }
        roll.exit = planExit(roll.lastPixels, roll.previousPixels, roll.lastDt, env.width());
        setPhase('exiting');
    }
    function cancel(cmd) {
        const i = cmd ? pendingRolls.findIndex(p => p.rollId === cmd.rollId) : -1;
        if (i >= 0) { pendingRolls.splice(i, 1); return true; }
        if (!roll || (cmd && cmd.rollId !== roll.id)) return false;
        beginExit();
        return true;
    }
    function cancelAll() { pendingRolls = []; if (roll) beginExit(); }
    function hasRoll(id) { return !!id && (roll?.id === id || pendingRolls.some(p => p.rollId === id)); }
    function displayed() {
        const P = roll.physics, a = P.getPose();
        if (roll.die !== 10) return [a];
        const b = P.secondState ? P.second(() => P.getPose()) : null;
        if (!b) throw new Error('Физика не создала второй D10');
        const sh = P.pairPlacement(a, b);
        return [Object.assign({}, a, { x: a.x + sh[0] }), Object.assign({}, b, { x: b.x + sh[1] })];
    }
    function tick(dt) {
        if (disposed) return;
        /* ЖДЁМ ОТВЕТА ПОСЛЕ ЗАГРУЗКИ, А НЕ С ПЕРВОЙ СЕКУНДЫ. Ледяная шкурка
           весит 4 МБ, их три — при открытии стримера файлом (file://) они
           качаются напрямую, и восемь секунд уходили на скачивание. Шкурка
           не успевала ответить, стример сдавался до следующего включения:
           «вчера грузилась, сегодня нет», а «Тест» ничего не показывал.
           Теперь восемь секунд — на ответ уже загруженной шкурки; на саму
           загрузку — отдельный предел, чтобы не ждать вечно. */
        Object.keys(frames).forEach(k => {
            const сдалась = frames[k].find(f => {
                if (f.live) return false;
                f.waited += dt;
                if (!f.isLoading?.()) f.answerWait = (f.answerWait || 0) + dt;
                return (f.answerWait || 0) >= skinWait || f.waited >= skinWait + SKIN_LOAD_LIMIT;
            });
            if (сдалась) failSkin(Number(k), (сдалась.answerWait || 0) >= skinWait
                ? 'Шкурка не ответила за ' + skinWait + ' секунд'
                : 'Шкурка не загрузилась за ' + (skinWait + SKIN_LOAD_LIMIT) + ' секунд');
        });
        if (!roll) return;
        guarded(roll.die, () => advanceRoll(dt));
    }
    function advanceRoll(dt) {
        roll.lastDt = dt;
        if (roll.phase === 'exiting') {
            sendPoses(advanceExit(roll.exit, dt));
            if (roll.exit.every(p => p.t >= p.seconds)) finishRoll();
            return;
        }
        const P = roll.physics;
        if (roll.waitingFaces) {
            const faces = facesOf(roll.die);
            if (!faces) return;
            P.setFaces(roll.die, faces);
            if (P.start() === false) throw new Error('Не удалось запустить физику');
            roll.waitingFaces = false; roll.flownSince = 0;
        }
        if (roll.pending && roll.phase === 'rolling') {
            roll.flownSince += dt;
            if (roll.flownSince >= 0.5) {
                if (!P.resolve(roll.pending.join(' '))) throw new Error('Физика не приняла отложенный результат');
                roll.values = roll.pending; roll.pending = null; setPhase('stopping');
            }
        }
        const W = env.width(), H = env.height();
        if (roll.phase === 'rolling' || roll.phase === 'stopping') {
            P.advance(dt);
            if (roll.phase === 'stopping' && P.phase() === 'done') {
                roll.flight = planFlight({ poses: displayed(), targets: roll.values.map(v => P.faceQuaternion(v)) });
                roll.t = 0; setPhase('flight');
            } else {
                sendPoses(displayed().map(p => toPixels(p, roll.die, W, H, 0)));
                return;
            }
        }
        if (roll.phase === 'flight' || roll.phase === 'hold') {
            roll.t += dt;
            sendPoses(flightAt(roll.flight, roll.t).map(p => toPixels(p, roll.die, W, H, 0)));
            if (roll.phase === 'flight' && roll.t >= roll.flight.seconds) {
                setPhase('hold'); emit({ type: 'shown', rollId: roll.id, values: roll.values.slice() });
            }
            if (roll.phase === 'hold' && roll.t >= roll.flight.seconds + hold) beginExit();
        }
    }
    function dispose() {
        if (disposed) return;
        disposed = true; pendingRolls = []; releaseRoll();
        Object.keys(frames).forEach(removeFrames);
    }
    return { start, resolve, cancel, cancelAll, hasRoll, tick, dispose, onMessage, ready, ensureFrames,
        get phase() { return roll ? roll.phase : 'idle'; },
        get rollId() { return roll ? roll.id : null; },
        get pendingRollId() { return pendingRolls[0]?.rollId || null; },
        get pendingRollIds() { return pendingRolls.map(p => p.rollId); },
        get needsTick() { return !!roll || Object.values(frames).some(list => list.some(f => !f.live)); },
        frameCount() { return Object.values(frames).reduce((sum, list) => sum + list.length, 0); } };
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

/* Кешируем самостоятельный HTML шкурки с его встроенными ресурсами.
   Адрес вместе с ?v= — ключ; старую версию вместо новой не подставляем.
   file:// сохраняет прежнюю прямую загрузку. */
function createSkinStore(win, report) {
    const entries = new Map();
    const enabled = !!(win.isSecureContext && /^https?:$/.test(win.location?.protocol || '')
        && win.caches && win.fetch && win.URL?.createObjectURL);
    function acquire(url) {
        if (!enabled) return { cached:false, promise:Promise.resolve(url), release() {} };
        const key = new URL(url, win.document.baseURI); key.hash = '';
        if (!/^https?:$/.test(key.protocol)) return { cached:false, promise:Promise.resolve(url), release() {} };
        const id = key.href;
        let entry = entries.get(id);
        if (!entry) {
            entry = { refs:0, blob:null, abort:new win.AbortController() };
            entries.set(id, entry);
            entry.promise = (async () => {
                let cache = null, response = null;
                try { cache = await win.caches.open('grivensburg-dice-html-v1'); response = await cache.match(id); }
                catch (e) { report('unavailable', id, 'Постоянный кеш недоступен: ' + e.message); }
                const hit = !!response;
                const timer = win.setTimeout(() => entry.abort.abort(), 20000);
                try {
                    if (!response) response = await win.fetch(id, { signal:entry.abort.signal, cache:'no-cache', credentials:'omit' });
                    if (!response.ok) throw new Error('HTTP ' + response.status);
                    const html = await response.clone().text();
                    if (!/gb:dice:ready/.test(html)) throw new Error('Файл не является совместимой HTML-шкуркой');
                    if (!hit && cache) {
                        try {
                            await cache.put(id, response);
                            const keys = await cache.keys();
                            for (const old of keys.slice(0, Math.max(0, keys.length - 6))) await cache.delete(old);
                        } catch (e) { report('unavailable', id, 'Не удалось сохранить кеш: ' + e.message); }
                    }
                    if (!entry.refs) throw new Error('Подготовка отменена');
                    const href = id.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
                    const base = '<base href="' + href + '">';
                    const text = /<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i, m => m + base) : base + html;
                    entry.blob = win.URL.createObjectURL(new win.Blob([text], {type:'text/html'}));
                    report(hit ? 'cached' : 'downloaded', id, '');
                    return entry.blob;
                } finally { win.clearTimeout(timer); }
            })();
        }
        entry.refs++;
        let released = false;
        return { cached:true, promise:entry.promise, release() {
            if (released) return; released = true;
            if (--entry.refs) return;
            entry.abort.abort();
            if (entry.blob) win.URL.revokeObjectURL(entry.blob);
            entries.delete(id);
        } };
    }
    return { acquire, enabled };
}

function attachToPage(opts) {
    const win = opts.window || root, doc = opts.document || win.document;
    const box = opts.container;
    const store = createSkinStore(win, (state, url, message) => {
        if (opts.onEvent) opts.onEvent({type:'cache-status', state, url, message});
    });
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
            const source = store.acquire(url);
            let removed = false, loading = true, error = null;
            /* Кешированный HTML не получает доступ к родительской странице. */
            if (source.cached) f.setAttribute('sandbox', 'allow-scripts');
            else {
                /* Прямая загрузка: «грузится», пока рамка не загрузила файл. */
                f.addEventListener('load', () => { loading = false; });
                f.src = url;
            }
            f.style.visibility = 'hidden';
            f.setAttribute('aria-hidden', 'true');
            f.setAttribute('tabindex', '-1');
            f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;'
                            + 'background:transparent;pointer-events:none;visibility:hidden;';
            box.appendChild(f);
            const куда = source.cached ? '*' : targetOriginOf(url, doc.baseURI || (win.location && win.location.href));
            if (source.cached) source.promise.then(src => {
                if (!removed) { loading = false; f.src = src; }
            }).catch(e => { loading = false; if (!removed && error) error(e); });
            return {
                win: f.contentWindow, origin: куда === '*' ? 'null' : куда,
                isLoading: () => loading,
                onError: function (fn) { error = fn; f.addEventListener('error', fn); },
                post: function (m) {
                    f.style.visibility = m.type === 'gb:dice:pose' ? 'visible' : 'hidden';
                    f.contentWindow.postMessage(m, куда);
                },
                remove: function () { removed = true; source.release(); if (f.parentNode) f.parentNode.removeChild(f); }
            };
        },
        onEvent: opts.onEvent
    });
    const слушать = function (e) { core.onMessage(e); wake(); };
    win.addEventListener('message', слушать);
    let last = null, raf = null, живой = true;
    function wake() { if (живой && raf === null) { last = null; raf = win.requestAnimationFrame(loop); } }
    function loop(ts) {
        raf = null;
        if (!живой) return;
        const dt = last === null ? 0 : Math.min(0.1, (ts - last) / 1000);
        last = ts;
        core.tick(dt);
        if (core.needsTick) raf = win.requestAnimationFrame(loop);
    }
    return {
        start: cmd => { const r = core.start(cmd); wake(); return r; },
        resolve: cmd => { const r = core.resolve(cmd); wake(); return r; },
        cancel: cmd => { const r = core.cancel(cmd); wake(); return r; },
        cancelAll: () => { core.cancelAll(); wake(); }, hasRoll: core.hasRoll,
        ensureFrames: die => { const r = core.ensureFrames(die); wake(); return r; }, ready: core.ready,
        get phase() { return core.phase; }, get rollId() { return core.rollId; },
        get pendingRollId() { return core.pendingRollId; },
        get pendingRollIds() { return core.pendingRollIds; },
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
root.DiceController.validFaces = validFaces;
root.DiceController.optionsFor = optionsFor;
root.DiceController.modeChoice = modeChoice;
root.DiceController.DICE_MODES = DICE_MODES.slice();
root.DiceController.skinUrl = skinUrl;
root.DiceController.effectiveConfig = effectiveConfig;
root.DiceController.planExit = planExit;
root.DiceController.advanceExit = advanceExit;
root.DiceController.createSkinStore = createSkinStore;
})(typeof window !== 'undefined' ? window : globalThis);