/* Production adapter for approved laboratory 2.9.0 / closeup 01.
   This module is read-only: no database, gameplay RNG or resource mutations. */
(function(global){'use strict';
function create(options){
 const host=options.host,layer=document.createElement('div');layer.className='gvfx-stage';host.append(layer);
 const worldEl=document.createElement('div');worldEl.className='gvfx-world';layer.append(worldEl);
 const front=document.createElement('canvas'),back=document.createElement('canvas');
 front.className='gvfx-front';back.className='gvfx-back';worldEl.append(back,front);
 let active=null,SupportEffects=null,Divine=null,raf=0,finish=null,generation=0,last=0;
 const VFX={ready:false},controls=new Map(),weapons=new Map();
 const DuelDemo={get kind(){return active?.closeup?active.fx:null},orbit(){if(!active?.closeup||active.fx!=='sweep')return null;const r=R(active.actor);return{cx:r.cx,cy:r.cy,rx:W*.28,ry:H*.33}},contact(){}};
 const Lab={mode:'heroes',activeEnemy:null,enemyWeapon:'sword',tab(){}};
 function labActor(){return active?.actor;}
 function setupLab(){}
 function control(id){
  if(id==='stage')return layer;if(id==='world')return worldEl;if(id==='fx')return front;if(id==='backFx')return back;
  if(!controls.has(id)){const el=document.createElement('span');el.value=({priestWeapon:'wand',mageWeapon:'staff',instrument:'lute_dead',sweepCount:'4'})[id]||'';el.checked=id==='shakeOn';controls.set(id,el)}
  return controls.get(id);
 }
 function asset(path){const file=String(path).split('/').pop().replace(/\.png$/i,'.webp');return options.assetUrl('assets/vfx/'+file);}
 function perTargetOutcome(id,fallback){return active?.targets?.find(t=>t.id===id)?.outcome||fallback;}

'use strict';

/* Offline assets are resolved relative to tools/vfx-lab.html.
   The game adapter must supply its own asset registry when porting. */
let BASE = '../assets/';
function findBase(done) { BASE = '../assets/'; done(); }
const IMG = {}, MISSING = [];
function img(key, path) {
 const im=new Image();im.src=asset(path);IMG[key]=im;return im;
}
function showBase() {}

/* Оружие автора (assets/vfx/, 01.10). hx — ось рукояти по ширине
   картинки (0…1); edge — где лезвие: 'right' — только справа (топоры:
   бить надо этой стороной), 'both' — с обеих сторон (мечи, секира).
   Одинаковое по роли оружие чередуется наугад. На листе автора два
   длинных меча стояли остриём вниз — вырезаны перевёрнутыми (остриём
   вверх, как все). */
const ARMS = {
    sword1: [{ key: 'sword_short', hx: .497, edge: 'both', kind: 'sword' }],
    sword2: [{ key: 'sword_skull', hx: .489, edge: 'both', kind: 'sword' }, { key: 'sword_blue', hx: .508, edge: 'both', kind: 'sword' }],
    axe1:   [{ key: 'axe_red', hx: .35, edge: 'right', kind: 'axe' }, { key: 'axe_blue', hx: .27, edge: 'right', kind: 'axe' }],
    axe2:   [{ key: 'axe_double', hx: .42, edge: 'both', kind: 'axe' }]
};
/* Посох мага — большой, жезл жреца — с топорик (решение автора 01.10).
   tip — где на картинке светится навершие. */
const STAFF = {
    staff: { key: 'staff_purple', hx: .356, tip: [.376, .171], k: .98 },
    wand:  { key: 'staff_fire',   hx: .5,   tip: [.48, .09],   k: .58 }
};
/* Лук без тетивы: тетиву рисует код между концами плеч. Доли картинки. */
const BOW = { key: 'bow', grip: [.353, .5], top: [.265, .012], bot: [.221, .985], rest: .243 };
/* Магические стрелы: где остриё и куда смотрит картинка (градусы). */
const MAGIC = { fire_arrow: { fwd: 166.7, tip: [.023, .741] }, ice_arrow: { fwd: 168.3, tip: [.024, .729] } };

const HEROES = [], ENEMIES = [];

/* ══════════════════════════════════════════════════════════════════════
   СЦЕНА
   ══════════════════════════════════════════════════════════════════════ */
const $ = control;
const stage = $('stage'), world = $('world'), fx = $('fx'), ctx = fx.getContext('2d');
let DPR = 1, W = 0, H = 0;
const cardStore = {}; const cards = new Proxy(cardStore,{get:(o,k)=>o[k] || (/^(h_|e[1-5]$)/.test(String(k))?o[active?.actor]:undefined)});          /* id → { el, canvas, ctx, decals:[], hp, max, hero } */
let targetId = 'e3', healId = 'h_war';

function buildCards() {}
function pickTarget(id) {
    targetId = id;
    Object.values(cards).forEach(c => c.el.classList.toggle('target', c.el.id === id));
    if (stage.classList.contains('focus')) resize();
}
function pickHero(id) {
    healId = id;
    Object.values(cards).forEach(c => c.el.classList.toggle('pick', c.el.id === id));
}
function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = world.offsetWidth; H = world.offsetHeight;
    fx.width = W * DPR; fx.height = H * DPR;
    Object.values(cards).forEach(c => {
        c.canvas.width = c.el.offsetWidth * DPR; c.canvas.height = c.el.offsetHeight * DPR;
        c.dirty = true;
    });
    resizeLayers();
}
/* Прямоугольник карточки в координатах сцены — по раскладке, а не по
   экрану: тряска сцены иначе сдвигала бы цели эффектов. */
function R(id) {
 const c=cards[id];if(!c)return {x:0,y:0,w:0,h:0,cx:0,cy:0};const r=c.rect;return {...r,cx:r.x+r.w/2,cy:r.y+r.h/2};
}

/* ══════════════════════════════════════════════════════════════════════
   ВРЕМЯ: общий бег со скоростью, «стоп-кадр» на крите, планировщик
   ══════════════════════════════════════════════════════════════════════ */
let speed = 1, clock = 0, hitstop = 0;
const tasks = [];
function after(ms, fn) { tasks.push({ at: clock + ms, fn }); }
const rnd = (a, b) => a + Math.random() * (b - a);
const pickOne = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = {
    in: t => t * t, out: t => 1 - (1 - t) * (1 - t), inOut: t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
    back: t => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
};
function anim(el, frames, ms, opts = {}) {
    return el.animate(frames, Object.assign({ duration: ms / speed, easing: 'ease-out' }, opts));
}

/* ── Тряска экрана ───────────────────────────────────────────────────── */
let shakeAmp = 0;
function shake(a) { if ($('shakeOn').checked) shakeAmp = Math.max(shakeAmp, a); }

/* ══════════════════════════════════════════════════════════════════════
   СПРАЙТЫ: мягкие светящиеся точки заранее, по цвету
   ══════════════════════════════════════════════════════════════════════ */
const glowCache = {};
function glow(r, g, b) {
    const k = r + ',' + g + ',' + b;
    if (glowCache[k]) return glowCache[k];
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${r},${g},${b},1)`);
    gr.addColorStop(.35, `rgba(${r},${g},${b},.55)`);
    gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    return (glowCache[k] = c);
}
const FIRE = [[255, 250, 225], [255, 228, 130], [255, 185, 70], [255, 130, 35], [235, 80, 20], [170, 40, 12], [90, 20, 8]];
function fireSprite(t) { const c = FIRE[Math.min(FIRE.length - 1, Math.floor(t * FIRE.length))]; return glow(c[0], c[1], c[2]); }
const smokeSprite = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(70,64,58,.55)'); gr.addColorStop(1, 'rgba(70,64,58,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return c;
})();
const shadowSprite = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(18,8,28,.9)'); gr.addColorStop(.6, 'rgba(30,12,45,.45)'); gr.addColorStop(1, 'rgba(30,12,45,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return c;
})();

/* ══════════════════════════════════════════════════════════════════════
   ЧАСТИЦЫ — всё мелкое: огонь, дым, искры, кровь, осколки, ноты
   ══════════════════════════════════════════════════════════════════════ */
const parts = [];
function part(o) {
    parts.push(Object.assign({ x: 0, y: 0, vx: 0, vy: 0, ay: 0, drag: 0, life: 1, age: 0, size: 6, grow: 0,
        rot: 0, vr: 0, alpha: 1, kind: 'glow', col: [255, 255, 255] }, o));
}
function drawParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.age += dt;
        if (p.age >= p.life) { parts.splice(i, 1); continue; }
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k; p.vy = p.vy * k + p.ay * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.size += p.grow * dt; p.rot += p.vr * dt;
        const t = p.age / p.life, a = p.alpha * (1 - t);
        if (p.size <= 0) continue;
        ctx.globalAlpha = clamp(a, 0, 1);
        switch (p.kind) {
        case 'glow':
            ctx.globalCompositeOperation = 'lighter';
            ctx.drawImage(glow(p.col[0], p.col[1], p.col[2]), p.x - p.size, p.y - p.size, p.size * 2, p.size * 2); break;
        case 'fire':
            ctx.globalCompositeOperation = 'lighter';
            ctx.drawImage(fireSprite(t), p.x - p.size, p.y - p.size, p.size * 2, p.size * 2); break;
        case 'flame': {
            /* Язык огня: вытянутый вверх, колышется; низ — у места горения. */
            ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = clamp(Math.sin(Math.PI * Math.min(1, t * 1.6)) * p.alpha, 0, 1);
            const fw = p.size * (1 - t * .4), fh = p.size * 2.8 * (1 - t * .3), sway = Math.sin(p.age * 14 + p.ph) * p.size * .25;
            ctx.save(); ctx.translate(p.x, p.y); ctx.transform(1, 0, sway / Math.max(1, fh), 1, 0, 0);
            ctx.drawImage(fireSprite(t * .8), -fw, -fh * 1.6, fw * 2, fh * 2);
            ctx.drawImage(fireSprite(.05 + t * .5), -fw * .5, -fh * 1.1, fw, fh * 1.2);
            ctx.restore(); break;
        }
        case 'mist': {
            ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = p.alpha * Math.sin(Math.PI * t);
            const drift = Math.sin(p.age * 3 + p.ph) * p.size * .35;
            ctx.drawImage(glow(173, 223, 248), p.x - p.size * 1.8 + drift, p.y - p.size * .6, p.size * 3.6, p.size * 1.2); break;
        }
        case 'smoke':
            ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = clamp(p.alpha * Math.sin(Math.PI * t), 0, 1);
            ctx.drawImage(smokeSprite, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2); break;
        case 'shadow':
            ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = clamp(p.alpha * Math.sin(Math.PI * t), 0, 1);
            ctx.drawImage(shadowSprite, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2); break;
        case 'streak': {
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = `rgb(${p.col})`; ctx.lineWidth = p.size; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * .035, p.y - p.vy * .035); ctx.stroke(); break;
        }
        case 'drop': {
            ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = clamp(p.alpha * (1 - t * t), 0, 1);
            const sp = Math.hypot(p.vx, p.vy), ang = Math.atan2(p.vy, p.vx);
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang);
            ctx.fillStyle = p.color || '#7d0c0c';
            ctx.beginPath(); ctx.ellipse(0, 0, p.size * (1 + Math.min(2.5, sp / 300)), p.size, 0, 0, Math.PI * 2); ctx.fill();
            ctx.restore(); break;
        }
        case 'shard': {
            ctx.globalCompositeOperation = 'source-over';
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
            ctx.fillStyle = p.fill || 'rgba(200,235,255,.85)'; ctx.strokeStyle = p.stroke || 'rgba(255,255,255,.9)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(0, -p.size); ctx.lineTo(p.size * .45, 0); ctx.lineTo(0, p.size * .8); ctx.lineTo(-p.size * .4, 0); ctx.closePath();
            ctx.fill(); ctx.stroke(); ctx.restore(); break;
        }
        case 'text': {
            ctx.globalCompositeOperation = 'source-over';
            const sc = p.pop ? 1 + .6 * Math.max(0, 1 - p.age / .18) : 1;
            ctx.save(); ctx.translate(p.x, p.y); ctx.scale(sc, sc);
            ctx.font = `900 ${p.size}px Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.lineWidth = Math.max(3, p.size / 7); ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(p.text, 0, 0);
            ctx.fillStyle = p.color || '#fff'; ctx.fillText(p.text, 0, 0); ctx.restore(); break;
        }
        case 'note': {
            ctx.globalCompositeOperation = 'lighter';
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
            /* Свечение — готовым пятном, а не shadowBlur: тот на тексте очень
               дорогой, и бард ронял кадры. */
            ctx.drawImage(glow(p.col[0], p.col[1], p.col[2]), -p.size * .9, -p.size * .9, p.size * 1.8, p.size * 1.8);
            ctx.font = `700 ${p.size}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = `rgb(${p.col})`; ctx.fillText(p.text, 0, 0); ctx.restore(); break;
        }
        }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}

/* ══════════════════════════════════════════════════════════════════════
   ОБЪЕКТЫ — то, у чего своя траектория: летящий снаряд, взмах оружия,
   воткнутый меч, волна, рука из тени. update(dt) → false = закончился.
   ══════════════════════════════════════════════════════════════════════ */
const objs = [];
function drawObjs(dt) {
    for (let i = objs.length - 1; i >= 0; i--) {
        const o = objs[i];
        o.age = (o.age || 0) + dt;
        ctx.save();
        const alive = o.update(dt);
        ctx.restore();
        if (alive === false) objs.splice(i, 1);
    }
}

/* ══════════════════════════════════════════════════════════════════════
   СЛЕДЫ НА КАРТОЧКЕ — рисуются на её собственном холсте поверх картинки:
   порез, кровь, копоть, иней, трещина. Карточка трясётся — следы с ней.
   ══════════════════════════════════════════════════════════════════════ */
function decal(id, d) { cards[id].canvas.style.display = "block"; d.age = 0; cards[id].decals.push(d); cards[id].dirty = true; return d; }
function drawDecals(dt) {
    for (const c of Object.values(cards)) {
        if (!c.decals.length && !c.dirty) continue;
        const x = c.ctx, w = c.canvas.width / DPR, h = c.canvas.height / DPR;
        x.setTransform(DPR, 0, 0, DPR, 0, 0);
        x.clearRect(0, 0, w, h);
        for (let i = c.decals.length - 1; i >= 0; i--) {
            const d = c.decals[i];
            d.age += dt;
            if (d.life && d.age >= d.life) { c.decals.splice(i, 1); continue; }
            x.save(); d.draw(x, w, h, d.age); x.restore();
        }
        if (!c.decals.length) c.canvas.width = c.canvas.width;
        c.canvas.style.display = c.decals.length ? "block" : "none";
        c.dirty = false;
    }
}
/* Угасание в конце жизни следа. */
const fadeOut = (d, tail = 1) => d.life ? clamp((d.life - d.age) / tail, 0, 1) : 1;

/* Порез: сперва раскалённая нить, потом тёмно-красная рана. */
let slashDecal;
/* Брызги крови с потёками вниз. */
let bloodDecal; // Implemented once in blood-drips.js.

/* Кровь на крите (автор 01.10): большая клякса с рваным краем, брызги по
   направлению удара и длинные потёки до низа карточки. */
let bloodCrit; // Implemented once in blood-drips.js.

/* Трещина от топора: ломаные лучи от точки удара. */
let crackDecal;
/* Копоть и тлеющие угли: края и место попадания темнеют, угли мерцают. */
/* Горит burnFor секунд (автор 01.10: 5 с): копоть расползается от места
   попадания к краям, угли мерцают, край тлеет; потом копоть гаснет. */

/* Иней: кристаллы растут ветками от точки (или от краёв), голубая дымка. */

/* Вспышка цветом по карточке. */
function flashDecal(id, col, ms = 260, peak = .7) {
    return decal(id, { life: ms / 1000, draw(x, w, h, a) {
        x.globalCompositeOperation = 'lighter'; x.globalAlpha = peak * (1 - a / this.life); x.fillStyle = col; x.fillRect(0, 0, w, h);
    }});
}

/* ══════════════════════════════════════════════════════════════════════
   ОБЩЕЕ ДЛЯ ПОПАДАНИЙ
   ══════════════════════════════════════════════════════════════════════ */
function outcome() { return active?.outcome||'hit'; }
function dmgFor(out) { return active?.damage||0; }
function hurt(id, dmg) { impact(id); }
function heal(id, v) { impact(id); }
function label(id, text, color, size = 34, pop = true, dy = 0) {
    const r = R(id);
    part({ kind: 'text', text, color, size, pop, x: r.cx, y: r.y + r.h * (.3 + dy), vy: -38, life: 1.3 });
}
/* n — который удар подряд (парные, вихрь): надписи ниже, не друг на друге. */
function sayDamage(id, out, dmg, n = 0) { impact(id); }
/* Кровь во все стороны от точки удара — частицы на сцене и след на карте. */
function bloodBurst(id, gx, gy, dirx, diry, amount = 1, withDecal = true) {
    for (let i = 0; i < 26 * amount; i++) {
        const sp = rnd(120, 520) * amount, a = Math.atan2(diry, dirx) + rnd(-.7, .7);
        part({ kind: 'drop', x: gx, y: gy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rnd(0, 120), ay: 900, drag: 1.2,
            size: rnd(1.6, 3.8), life: rnd(.4, .9), color: pickOne(['#8e0e0e', '#6d0808', '#a51616']) });
    }
    if (!withDecal) return;
    const r = R(id);
    bloodDecal(id, (gx - r.x) / r.w, (gy - r.y) / r.h, dirx, diry, amount);
}
function sparks(gx, gy, n = 22, col = [255, 220, 140], speed = 420) {
    for (let i = 0; i < n; i++) {
        const a = rnd(0, Math.PI * 2), sp = rnd(.3, 1) * speed;
        part({ kind: 'streak', x: gx, y: gy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: 700, drag: 2, size: rnd(1.2, 2.4), life: rnd(.25, .5), col });
    }
    part({ kind: 'glow', x: gx, y: gy, size: 46, life: .22, col: [255, 240, 200] });
}
/* Карточка отзывается на удар. */
function knock(id, kind, amp = 1) {
    const el = cards[id].el;
    if (kind === 'shake') anim(el, [{ transform: 'translate(0,0)' }, { transform: `translate(${-9 * amp}px,${3 * amp}px) rotate(${-1.5 * amp}deg)` },
        { transform: `translate(${8 * amp}px,${-2 * amp}px) rotate(${1.2 * amp}deg)` }, { transform: `translate(${-4 * amp}px,0)` }, { transform: 'translate(0,0)' }], 340);
    if (kind === 'jolt') anim(el, [{ transform: 'translateY(0)' }, { transform: `translateY(${16 * amp}px) scale(.97)` }, { transform: 'translateY(0)' }], 380, { easing: 'cubic-bezier(.2,1.6,.4,1)' });
    if (kind === 'dodge') anim(el, [{ transform: 'translateX(0)' }, { transform: `translateX(${amp * 34}px) rotate(${amp * 4}deg)` }, { transform: 'translateX(0)' }], 480, { easing: 'ease-in-out' });
    if (kind === 'side') anim(el, [{ transform: 'translateX(0)' }, { transform: `translateX(${amp * 14}px) rotate(${amp * 2}deg)` }, { transform: 'translateX(0)' }], 260);
    if (kind === 'buzz') { const f = []; for (let i = 0; i < 14; i++) f.push({ transform: `translate(${rnd(-4, 4) * amp}px,${rnd(-3, 3) * amp}px) scale(${1 + .015 * amp * Math.sin(i)})` }); f.push({ transform: 'none' }); anim(el, f, 700, { easing: 'linear' }); }
    if (kind === 'lift') anim(el, [{ transform: 'translateY(0)' }, { transform: 'translateY(-10px)' }, { transform: 'translateY(0)' }], 300);
}
function hitstopFor(ms) { hitstop = Math.max(hitstop, ms / 1000); }
/* Красная вспышка по краям экрана — на крите. */
let vignette = 0;
function drawVignette(dt) {
    if (vignette <= 0) return;
    vignette = Math.max(0, vignette - dt * 2.2);
    const g = ctx.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, W * .7);
    g.addColorStop(0, 'rgba(160,0,0,0)'); g.addColorStop(1, `rgba(200,10,10,${.55 * vignette})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

/* ══════════════════════════════════════════════════════════════════════
   ОРУЖИЕ В РУКЕ: взмах вокруг рукояти со светящимся следом
   ══════════════════════════════════════════════════════════════════════ */
/* w — оружие из ARMS: картинка «клинок вверх», рукоять внизу, hx — ось
   рукояти по ширине картинки. Взмах вокруг кулака (низ рукояти).
   ЛЕЗВИЕ ВЕДЁТ. Поворот по часовой стрелке ведёт правой стороной
   картинки, против — левой. У топора лезвие справа, поэтому против
   часовой он зеркалится — иначе бьёт обухом (так было 30.09).
   Щит/парирование: stopAt — где оружие встало, hold — сколько стоит. */
function swing({ w, pivot, len, from, to, ms, contactAt = .55, onContact, stopAt = null, hold = 0, bounce = false, trail = [255, 245, 225], easing = ease.inOut, fadeMs = 180 }) {
    const im = IMG[w.key], hist = [];
    let fired = false;
    const flip = w.edge === 'right' && to < from;
    const iw = w.physical?.width || len * (im.naturalWidth || 200) / (im.naturalHeight || 600);
    const holdT = hold / ms, Tend = stopAt != null ? 1 + holdT : 1;
    const trailFrom = w.kind === 'axe' ? .62 : .5;
    const o = { meta: { key: w.key, edge: w.edge, from, to, flip }, update(dt) {
        const T = this.age * 1000 / ms;
        let p = clamp(T, 0, 1);
        if (stopAt != null && T > stopAt) {
            if (T <= stopAt + holdT) p = stopAt;
            else p = bounce ? stopAt - clamp(T - stopAt - holdT, 0, 1) * 1.4 : stopAt;
        }
        const e = easing(clamp(p, 0, 1));
        const ang = from + (to - from) * e;
        if (!fired && T >= contactAt) { fired = true; onContact && onContact(this.tipAt(ang)); }
        const alpha = T > Tend ? clamp(1 - (T - Tend) * ms / fadeMs, 0, 1) : 1;
        if (alpha <= 0) return false;
        /* След: хранит последние положения клинка (у топора — головы). */
        const s = Math.sin(ang), c = Math.cos(ang);
        hist.push({ bx: pivot.x + s * len * trailFrom, by: pivot.y - c * len * trailFrom, tx: pivot.x + s * len * .98, ty: pivot.y - c * len * .98 });
        if (hist.length > 9) hist.shift();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 1; i < hist.length; i++) {
            const a0 = hist[i - 1], a1 = hist[i];
            ctx.globalAlpha = (i / hist.length) * .38 * alpha;
            ctx.fillStyle = `rgb(${trail})`;
            ctx.beginPath(); ctx.moveTo(a0.bx, a0.by); ctx.lineTo(a0.tx, a0.ty); ctx.lineTo(a1.tx, a1.ty); ctx.lineTo(a1.bx, a1.by); ctx.closePath(); ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = alpha;
        ctx.translate(pivot.x, pivot.y); ctx.rotate(ang); if (flip) ctx.scale(-1, 1);
        ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 12;
        if (im.complete && im.naturalWidth) ctx.drawImage(im, -w.hx * iw, -len, iw, len);
        /* Для проверки — как нарисовано на деле: угол и зеркало. */
        const M = ctx.getTransform(); this.meta.ang = ang; this.meta.drawnFlip = M.a * M.d - M.b * M.c < 0;
        return true;
    }, tipAt(ang) { return headAt(w, pivot, len, iw, ang, flip); } };
    objs.push(o);
    return o;
}
/* Точка удара: у меча — клинок на 0,72 длины, у топора — середина
   лезвия (голова, сдвиг к лезвию). */
function headAt(w, pivot, len, iw, ang, flip) {
    const lx = w.edge === 'right' ? (.82 - w.hx) * iw * (flip ? -1 : 1) : 0, ly = -len * (w.kind === 'axe' ? .8 : .72);
    return { x: pivot.x + lx * Math.cos(ang) - ly * Math.sin(ang), y: pivot.y + lx * Math.sin(ang) + ly * Math.cos(ang), ang };
}
/* Щит, выросший перед карточкой, — для блока. Встаёт на карточке ближе
   к месту удара, за ним — голубой круг-оберег, чтобы блок читался сразу. */
function shieldPop(id, gx, gy, size) {
    const r = R(id);
    gx = clamp(gx, r.x + r.w * .23, r.x + r.w * .77); gy = clamp(gy, r.y + r.h * .25, r.y + r.h * .75);
    const gear=defenseWeapon(id,true),pose=global.EquipmentGeometry.pose(gear,r);size=pose.height;
    const im=IMG[gear.key],w=pose.width;
    ring(gx, gy, size * .75, [140, 200, 255], 380, 4);
    objs.push({ update() {
        const a = this.age, life = .9; if (a > life) return false;
        const s0 = a < .1 ? ease.back(a / .1) : 1, al = a > life - .25 ? (life - a) / .25 : 1;
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .55 * al;
        ctx.drawImage(glow(120, 190, 255), gx - size * .75 * s0, gy - size * .75 * s0, size * 1.5 * s0, size * 1.5 * s0);
        return true;
    }});
    objs.push({ update(dt) {
        const a = this.age, life = .9;
        if (a > life) return false;
        const s = a < .1 ? ease.back(a / .1) : 1, al = a > life - .25 ? (life - a) / .25 : 1;
        const jolt = a > .12 && a < .3 ? Math.sin((a - .12) * 60) * 5 * (1 - (a - .12) / .18) : 0;
        ctx.globalAlpha = al; ctx.translate(gx + jolt, gy); ctx.rotate(-.15); ctx.scale(s, s);
        ctx.shadowColor = 'rgba(120,190,255,.9)'; ctx.shadowBlur = 22;
        if (im.complete && im.naturalWidth) ctx.drawImage(im, -w / 2, -size / 2, w, size);
        return true;
    }});
}

/* Laboratory audio: selected local file, approved synthesized example,
   or silence. SFX.play(key, options) is the sound-service integration seam. */
const SFX = (() => {
    let ac = null, out = null, an = null, master = .7;
    const on = () => !options.muted?.();
    function A() {
        if (!ac) {
            ac = new (window.AudioContext || window.webkitAudioContext)();
            const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
            out = ac.createGain(); out.gain.value = master*(options.volume?.()??1);
            an = ac.createAnalyser(); an.fftSize = 2048;
            out.connect(comp); comp.connect(ac.destination); comp.connect(an);
        }
        if (ac.state === 'suspended') ac.resume();
        return ac;
    }
    const cache = {};
    function noise(sec) {
        const a = A(), k = 'n' + sec; if (cache[k]) return cache[k];
        const b = a.createBuffer(1, Math.floor(a.sampleRate * sec), a.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        return (cache[k] = b);
    }
    /* Щипок струны (Карплус–Стронг): лютня. */
    function pluck(freq, sec = 1.2, damp = .996) {
        const a = A(), k = 'p' + freq + '|' + sec + '|' + damp; if (cache[k]) return cache[k];
        const sr = a.sampleRate, N = Math.max(2, Math.round(sr / freq)), b = a.createBuffer(1, Math.floor(sr * sec), sr), d = b.getChannelData(0);
        const ring = new Float32Array(N); for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
        let p = 0;
        for (let i = 0; i < d.length; i++) { const nx = (p + 1) % N; d[i] = ring[p]; ring[p] = (ring[p] + ring[nx]) * .5 * damp; p = nx; }
        return (cache[k] = b);
    }
    function env(g, t, a, peak, dec) {
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(.0002, peak), t + a);
        g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
    }
    function nz({ t = 0, dur = .2, type = 'bandpass', f0 = 1000, f1 = f0, q = 1, vol = .5, attack = .005 }) {
        const a = A(), t0 = a.currentTime + t, src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
        src.buffer = noise(Math.max(.2, Math.ceil((dur + .1) * 10) / 10)); f.type = type; f.Q.value = q;
        f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + attack + dur);
        env(g, t0, attack, vol, dur); src.connect(f); f.connect(g); g.connect(out); src.start(t0); src.stop(t0 + attack + dur + .1);
    }
    function tone({ t = 0, type = 'sine', f0 = 440, f1 = f0, dur = .3, vol = .3, attack = .003 }) {
        const a = A(), t0 = a.currentTime + t, o = a.createOscillator(), g = a.createGain();
        o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + attack + dur);
        env(g, t0, attack, vol, dur); o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + attack + dur + .05);
    }
    function buf(b, { t = 0, vol = .5, lp = 0 } = {}) {
        const a = A(), t0 = a.currentTime + t, s0 = a.createBufferSource(), g = a.createGain();
        s0.buffer = b; g.gain.value = vol; let node = s0;
        if (lp) { const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; s0.connect(f); node = f; }
        node.connect(g); g.connect(out); s0.start(t0);
    }
    const SYN = {
        sword_swing: o => nz({ dur: o.heavy ? .4 : .28, f0: o.heavy ? 300 : 600, f1: o.heavy ? 1400 : 3200, q: 1.2, vol: .45, attack: .12 }),
        sword_hit: o => {
            nz({ dur: .12, type: 'lowpass', f0: 2500, f1: 400, vol: .7 }); tone({ f0: 140, f1: 50, dur: .18, vol: .6 });
            if (o.crit) { tone({ t: .02, type: 'triangle', f0: 90, f1: 35, dur: .35, vol: .7 }); nz({ t: .1, dur: .15, type: 'lowpass', f0: 1800, f1: 300, vol: .6 }); }
        },
        axe_hit: o => { tone({ f0: 110, f1: 38, dur: .3, vol: .9 }); nz({ dur: .18, type: 'lowpass', f0: 1500, f1: 200, vol: .8 }); nz({ t: .03, dur: .25, f0: 900, q: 3, vol: .3 }); if (o.crit) tone({ t: .04, type: 'triangle', f0: 70, f1: 30, dur: .5, vol: .7 }); },
        miss: () => nz({ dur: .2, f0: 1800, f1: 5000, q: 2, vol: .25, attack: .05 }),
        fireball_fly: () => { nz({ dur: .6, type: 'lowpass', f0: 300, f1: 2200, vol: .45, attack: .08 }); tone({ type: 'sawtooth', f0: 80, f1: 160, dur: .5, vol: .06, attack: .05 }); },
        /* Взрыв без ноты в конце (01.10): гул — шумом, а не тоном. */
        fireball_boom: o => {
            const k = o.crit ? 1.4 : 1;
            nz({ dur: .5 * k, type: 'lowpass', f0: 500, f1: 60, vol: 1, attack: .004 });
            nz({ dur: .8 * k, type: 'lowpass', f0: 2500, f1: 120, vol: .9, attack: .004 });
            for (let i = 0; i < 14; i++) nz({ t: .15 + Math.random() * 1.2, dur: .02, type: 'highpass', f0: 2500 + Math.random() * 3000, vol: .08 + Math.random() * .08 });
        },
        ice_cast: () => { for (let i = 0; i < 5; i++) tone({ t: i * .04, f0: 2200 + i * 380, dur: .25, vol: .06 }); nz({ dur: .35, type: 'highpass', f0: 4000, f1: 7000, vol: .12, attack: .05 }); },
        /* Лёд разбился — без нот в конце (01.10): треск щелчками шума. */
        ice_hit: o => {
            nz({ dur: .25, type: 'highpass', f0: 2500, f1: 6000, vol: .5 });
            for (let i = 0; i < (o.crit ? 22 : 14); i++) nz({ t: Math.random() * .3, dur: .012, type: 'highpass', f0: 4000 + Math.random() * 3000, vol: .12 });
            nz({ dur: .12, type: 'lowpass', f0: 700, f1: 150, vol: .35 });
        },
        bard_song_major: () => [220,277.18,329.63,440].forEach((f,i)=>buf(pluck(f,1.8,.997),{t:i*.06,vol:.26,lp:3500})),
        bard_song_minor: () => [220,261.63,329.63,440].forEach((f,i)=>buf(pluck(f,1.8,.997),{t:i*.06,vol:.26,lp:3500})),
        lute_hit: o => {
            const chord = o.crit ? [147, 185, 220, 294, 370] : [196, 247, 294, 392];
            chord.forEach((f, i) => buf(pluck(f, 1.6, .997), { t: i * .028, vol: .45, lp: 3500 }));
            if (o.crit) tone({ t: .05, f0: 55, f1: 50, dur: .9, vol: .5 });
        },
        bard_wave: () => { tone({ type: 'sawtooth', f0: 110, f1: 104, dur: .45, vol: .12 }); tone({ f0: 55, dur: .5, vol: .4 }); },
        shadow_out: () => { nz({ dur: .6, type: 'lowpass', f0: 200, f1: 900, vol: .4, attack: .35 }); tone({ f0: 70, f1: 45, dur: .6, vol: .3, attack: .2 }); },
        drink_potion: () => {
            for (let i = 0; i < 4; i++) tone({ t: i * .11, f0: 180 + i * 40, f1: 420 + i * 60, dur: .08, vol: .35 });
            [523, 659, 784, 1047].forEach((f, i) => tone({ t: .45 + i * .08, f0: f, dur: .6, vol: .12 }));
        },
        /* Лечение (01.10): «попил водички — ах». Два глотка, шипение
           свежести, выдох с гласной «а» — всё шумом, без нот. */
        heal: () => {
            for (let i = 0; i < 2; i++) { nz({ t: i * .17, dur: .07, f0: 380, f1: 950, q: 6, vol: .35, attack: .01 }); nz({ t: i * .17 + .03, dur: .05, type: 'lowpass', f0: 600, f1: 200, vol: .3 }); }
            for (let i = 0; i < 12; i++) nz({ t: .05 + Math.random() * .4, dur: .015, type: 'highpass', f0: 5000 + Math.random() * 3000, vol: .05 });
            nz({ t: .45, dur: .6, f0: 850, f1: 700, q: 5, vol: .3, attack: .12 });
            nz({ t: .45, dur: .6, f0: 1250, f1: 1100, q: 6, vol: .18, attack: .12 });
            nz({ t: .45, dur: .5, type: 'highpass', f0: 3000, vol: .05, attack: .1 });
        }
    };
    /* Все места, где эффект звучит. Ключи игры — имя из data-sfx.js;
       свои ключи лаборатории — имя здесь. */
    const OWN = {
        bard_song_major: 'Песня барда · мажор', bard_song_minor: 'Песня барда · минор',
        sword_stuck: 'Меч воткнулся в карточку', bow_draw: 'Лук: натяжение', shadow_out: 'Разбойник выходит из тени',
        burn: 'Карточка горит (5 с)', spark: 'Искра (фокус мага)', thaw: 'Оттаял', bard_wave: 'Волна барда попала',
        staff_hit: 'Сгусток магии — маг или жрец без заклинания (в игре ключ staff_hit)'
    };
    const ORDER = ['sword_swing', 'sword_hit', 'axe_hit', 'sweep', 'sword_stuck', 'shield_block', 'parry', 'miss', 'crit', 'shield_raise', 'aggro',
        'bow_draw', 'bow_shot', 'arrow_hit', 'shadow_out', 'dagger_hit', 'magic_cast', 'fireball_fly', 'fireball_boom', 'burn', 'ice_cast', 'ice_hit',
        'spark', 'frozen', 'thaw', 'staff_hit', 'heal', 'revive', 'lute_hit', 'bard_wave', 'bard_song_major', 'bard_song_minor', 'wolf_howl', 'bandit_roar', 'drink_potion'];
    const ev = k => null;
    const slots = {};
    for (const k of ORDER) slots[k] = { key: k, name: OWN[k] || (ev(k) ? ev(k).name : k), vol: ev(k) ? ev(k).volume : 1, file: '', own: '' };
    function status(s) { return s.own ? ['file', 'свой файл'] : s.file ? ['file', 'файл'] : SYN[s.key] ? ['syn', 'синтез'] : ['none', 'ждёт файла']; }
    function render() {
        const box = $('sndList'); if (!box) return;
        let nf = 0, ns = 0, nn = 0;
        box.innerHTML = '<div style="margin:4px 0 6px">📂 — попробовать звук с диска до перезагрузки. Новые файлы в комплект не включены. Для игры сохрани ключ события и подключи свой аудиосервис.</div>';
        for (const s of Object.values(slots)) {
            const [c, t] = status(s); if (c === 'file') nf++; else if (c === 'syn') ns++; else nn++;
            const row = document.createElement('div'); row.className = 'snd';
            row.innerHTML = `<span><b>${s.key}</b><br>${s.name}</span><i class="${c}">${t}</i><button title="Послушать">▶</button><button title="Свой файл">📂</button>`;
            const [bPlay, bOwn] = row.querySelectorAll('button');
            bPlay.onclick = () => play(s.key, {});
            bOwn.onclick = () => { const f = document.createElement('input'); f.type = 'file'; f.accept = 'audio/*';
                f.onchange = () => { if (f.files[0]) { if (s.own) URL.revokeObjectURL(s.own); s.own = URL.createObjectURL(f.files[0]); render(); play(s.key, {}); } }; f.click(); };
            box.appendChild(row);
        }
        $('sndBox').querySelector('summary').textContent = `Звуки: файлов ${nf}, синтез ${ns}, ждут файла ${nn}`;
    }
    const played = [];
    function play(key, o = {}) {
        played.push(key); if (played.length > 256) played.shift();
        const s = slots[key];
        if (!s) { console.warn('звук: нет такого места', key); return; }
        if (!on()) return;
        const f = s.own || s.file;
        if (f) {
            const el = new Audio(f); el.volume = clamp(master * (options.volume?.()??1) * (s.vol == null ? 1 : s.vol), 0, 1);
            if (o.heavy) el.playbackRate = .85;
            el.play().catch(() => {}); return;
        }
        if (SYN[key]) { try { SYN[key](o); } catch (e) { console.warn('звук', key, e); } }
    }
    return {
        play, render, slots, played,
        synth: Object.keys(SYN),
        deviceVolume(v) { if(out)out.gain.value=master*v; },
        volume(v) { master = v; if (out) out.gain.value = v; },
        /* Для проверки: громкость того, что сейчас звучит (только синтез). */
        level() { if (!an) return 0; const d = new Float32Array(an.fftSize); an.getFloatTimeDomainData(d); let m = 0; for (const x of d) m = Math.max(m, Math.abs(x)); return m; }
    };
})();

const FX = {};

/* ══════════════════════════════════════════════════════════════════════
   ВОИН. Что в руках — выбор в панели: меч или топор; одна рука, парные
   или двуручное (решение автора 01.10: какое оружие — такое и бьёт).
   Одинаковое оружие чередуется наугад.
   ══════════════════════════════════════════════════════════════════════ */
function gear() { return activeGear(); }
function armsFor(g) { return selectedArms(); }
/* Fixed-handle side swing. Approved critical depth and edge alignment
   are handled by approved-crits.js; regular swings keep this geometry. */
let strikeGeom;
function strikeOne(tid, out, w, side, two, n) {
    const r = R(tid), G = strikeGeom(r, w, side, two);
    const guard = out === 'block' || out === 'parry';
    const stopAt = guard ? Math.max(.2, G.contact - .02) : null;
    SFX.play('sword_swing', { heavy: two || w.kind === 'axe' });
    if (out === 'parry') {
        const ang = G.from + (G.to - G.from) * G.easing(stopAt), P = headAt(w, G.pivot, G.len, G.iw, ang, G.flip);
        after(Math.max(0, stopAt * G.ms - 110), () => parryBlade(tid, P, ang, G.spin));
    }
    swing({ w, pivot: G.pivot, len: G.len, from: G.from, to: G.to, ms: G.ms, easing: G.easing,
        contactAt: guard ? stopAt : G.contact, stopAt, hold: out === 'parry' ? 300 : guard ? 110 : 0, bounce: guard,
        trail: out === 'crit' ? [255, 190, 150] : [230, 240, 255], fadeMs: two ? 260 : 180,
        onContact: tip => impactBlade(tid, out, tip, r, w, two, n, G.spin) });
}
/* ⚔ Удар: парные бьют с двух сторон, второе чуть позже. */

/* Итог удара клинком или топором. spin — куда шло оружие (по часовой +1). */
function impactBlade(tid, out, tip, r, w, two, n, spin) {
    const base = dmgFor(out), dmg = base ? base + (two ? 3 : 0) : 0;
    const mv = { x: spin * Math.cos(tip.ang), y: spin * Math.sin(tip.ang) };        /* куда летело лезвие */
    const px = clamp((tip.x - r.x) / r.w, .08, .92), py = clamp((tip.y - r.y) / r.h, .08, .85);
    if (out === 'hit' || out === 'crit') {
        const crit = out === 'crit';
        SFX.play(w.kind === 'axe' ? 'axe_hit' : 'sword_hit', { crit }); if (crit) SFX.play('crit');
        if (crit) { hitstopFor(130); vignette = 1; shake(16); } else if (two) { hitstopFor(60); shake(11); } else shake(6);
        if (w.kind === 'sword') {
            const L = two ? .55 : .42;
            slashDecal(tid, clamp(px - mv.x * L, .04, .96), clamp(py - mv.y * L * .7, .04, .96), clamp(px + mv.x * L * .6, .04, .96), clamp(py + mv.y * L * .5, .04, .96), two ? 8 : crit ? 7 : 5);
        } else {
            crackDecal(tid, px, py);
            for (let i = 0; i < (two ? 20 : 12); i++) part({ kind: 'shard', x: tip.x, y: tip.y, vx: rnd(-260, 260), vy: rnd(-380, -80), ay: 1100, vr: rnd(-12, 12),
                size: rnd(3, 7), life: rnd(.5, .9), fill: 'rgba(120,85,50,.95)', stroke: 'rgba(40,25,10,.9)' });
            for (let i = 0; i < 6; i++) part({ kind: 'smoke', x: tip.x + rnd(-20, 20), y: tip.y, vx: rnd(-60, 60), vy: rnd(-50, -10), size: rnd(18, 30), grow: 40, life: rnd(.6, 1), alpha: .6 });
        }
        if (crit) { bloodBurst(tid, tip.x, tip.y, mv.x, mv.y, .3, false); }
        else bloodBurst(tid, tip.x, tip.y, mv.x, mv.y, two ? 1 : .7);
        flashDecal(tid, crit ? 'rgb(255,70,40)' : 'rgb(255,120,90)', 220, crit ? .6 : .35);
        knock(tid, w.kind === 'axe' || two ? 'jolt' : 'shake', crit ? 1.6 : two ? 1.3 : 1);
        hurt(tid, dmg);
    } else if (out === 'miss') {
        SFX.play('miss');
        if (!n) knock(tid, 'dodge', spin);
        for (let i = 0; i < 7; i++) part({ kind: 'streak', x: tip.x + rnd(-20, 20), y: tip.y + rnd(-30, 30), vx: mv.x * 900, vy: mv.y * 900 + rnd(-40, 40), size: 1.2, life: .22, col: [200, 210, 220] });
    } else if (out === 'block') {
        SFX.play('shield_block');
        shieldPop(tid, tip.x, tip.y, r.h * .55);
        after(40, () => { sparks(tip.x, tip.y, 30, [255, 215, 120], 460); shake(5); knock(tid, 'side', spin); });
    } else if (out === 'parry') {
        /* Клинок о клинок: вспышка, звезда, сноп искр (дальше искрит, пока
           клинки сцеплены — это делает parryBlade). */
        SFX.play('parry');
        for (let i = 0; i < 50; i++) { const a = rnd(0, Math.PI * 2), s = rnd(200, 720); part({ kind: 'streak', x: tip.x, y: tip.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 100, ay: 900, drag: 1.4, size: rnd(1.4, 2.8), life: rnd(.25, .6), col: pickOne([[255, 235, 160], [255, 255, 230], [255, 200, 100]]) }); }
        part({ kind: 'glow', x: tip.x, y: tip.y, size: 110, life: .3, col: [255, 245, 220] });
        ring(tip.x, tip.y, r.w * .7, [255, 235, 190], 300, 3); shake(7); hitstopFor(60);
    }
    sayDamage(tid, out, dmg, n);
}
/* Встречный меч врага на парировании: выходит из карточки поперёк
   клинка героя, держит, искрит, отбрасывает. */
function parryBlade(tid, P, heroAng, spin) {
    const r=R(tid),gear=defenseWeapon(tid),pose=global.EquipmentGeometry.pose(gear,r),w={key:gear.key,hx:gear.profile.labPivot?.[0]??gear.profile.anchors?.grip?.[0]??.5,edge:gear.profile.edge},im=IMG[w.key];
    const len=pose.height,iw=pose.width;
    const eAng = heroAng - spin * 1.5, k = .68;
    const pivot = { x: P.x - Math.sin(eAng) * len * k, y: P.y + Math.cos(eAng) * len * k };
    const a0 = eAng + spin * .9, IN = .11, HOLD = .3, OUT = .22;
    objs.push({ meta: { key: w.key, edge: w.edge, parry: true }, update() {
        const t = this.age; if (t > IN + HOLD + OUT) return false;
        let ang, al = 1;
        if (t < IN) ang = a0 + (eAng - a0) * ease.out(t / IN);
        else if (t < IN + HOLD) {
            ang = eAng + Math.sin(t * 90) * .02;
            for (let i = 0; i < 3; i++) { const a = rnd(0, Math.PI * 2), s = rnd(150, 520); part({ kind: 'streak', x: P.x, y: P.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, ay: 900, drag: 1.5, size: rnd(1.2, 2.2), life: rnd(.18, .4), col: pickOne([[255, 230, 150], [255, 255, 220], [255, 190, 90]]) }); }
        } else { const u = (t - IN - HOLD) / OUT; ang = eAng + spin * .6 * ease.out(u); al = 1 - u; }
        ctx.globalAlpha = al; ctx.translate(pivot.x, pivot.y); ctx.rotate(ang);
        ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 10;
        if (im.complete && im.naturalWidth) ctx.drawImage(im, -w.hx * iw, -len, iw, len);
        return true;
    }});
}
/* Кольцо ударной волны. */
function ring(x, y, R0, col, ms = 320, width = 4) {
    objs.push({ update() {
        const t = this.age * 1000 / ms; if (t > 1) return false;
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1 - t; ctx.strokeStyle = `rgb(${col})`; ctx.lineWidth = width * (1 - t) + .5;
        ctx.beginPath(); ctx.arc(x, y, R0 * ease.out(t), 0, Math.PI * 2); ctx.stroke(); return true;
    }});
}

/* 🌀 Круговая атака: оружие воина крутится вокруг своей оси и идёт по
   карточкам врагов слева направо, задевая каждую. Парные — два, одно
   выше, другое ниже; двуручное — одно большое, медленнее. Крутится по
   часовой — лезвие топора впереди. */

function sweepHit(id, out, x, y, n, w, two) {
    const r = R(id), base = dmgFor(out), dmg = base ? base + (two ? 2 : 0) : 0, py = clamp((y - r.y) / r.h, .12, .88);
    if (out === 'hit' || out === 'crit') {
        const crit = out === 'crit';
        SFX.play(w.kind === 'axe' ? 'axe_hit' : 'sword_hit', { crit });
        slashDecal(id, .06, clamp(py - .07 + rnd(-.04, .04), .04, .96), .94, clamp(py + .07 + rnd(-.04, .04), .04, .96), two ? 7 : 5);
        if (crit) { bloodBurst(id, x, y, 1, 0, .25, false); } else bloodBurst(id, x, y, 1, 0, .6);
        knock(id, 'shake', crit ? 1.4 : .9); shake(crit ? 8 : 4); if (crit) hitstopFor(40);
        hurt(id, dmg);
    } else if (out === 'miss') { if (!n) knock(id, 'jolt', -.8); }
    else if (out === 'block') { if (!n) { SFX.play('shield_block'); shieldPop(id, x, y, r.h * .45); } sparks(x, y, 14); }
    else { if (!n) SFX.play('parry'); sparks(x, y, 30, [255, 240, 200], 540); part({ kind: 'glow', x, y, size: 80, life: .25, col: [255, 245, 220] }); }
    if (!n || out === 'hit' || out === 'crit') sayDamage(id, out, dmg, n);
}

/* 🗡 Меч воткнулся: падает остриём вниз, входит в карточку, рукоять
   торчит вверх и дрожит; что вошло в карточку — не видно. (30.09 он
   падал рукоятью вниз — исправлено.) */

/* 🛡 Глухая оборона: на карточке воина встаёт щит и чуть подрастает —
   укрепился; блик пробегает, голубой круг. */
FX.guard = () => {
    const id=active.actor,a=R(id),gear=defenseWeapon(id,true),pose=global.EquipmentGeometry.pose(gear,a),im=IMG[gear.key],size=pose.height,sw=pose.width,life=2.1;
    SFX.play('shield_raise');
    objs.push({ meta: { key: 'shield_dragon' }, update() {
        const t = this.age; if (t > life) return false;
        const q = R(id);
        let s = t < .22 ? .4 + .6 * ease.back(t / .22) : 1;
        if (t > .45) s *= 1 + .12 * ease.out(clamp((t - .45) / .25, 0, 1));
        const al = t > life - .35 ? (life - t) / .35 : 1, burst = t > .45 && t < .95 ? Math.sin((t - .45) / .5 * Math.PI) : 0;
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = al * (.3 + .5 * burst);
        ctx.drawImage(glow(120, 190, 255), q.cx - size * .8 * s, q.cy - size * .8 * s, size * 1.6 * s, size * 1.6 * s);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = al;
        ctx.save(); ctx.translate(q.cx, q.cy); ctx.scale(s, s);
        ctx.shadowColor = 'rgba(120,190,255,.9)'; ctx.shadowBlur = 18 + 20 * burst;
        if (im.complete && im.naturalWidth) ctx.drawImage(im, -sw / 2, -size / 2, sw, size);
        ctx.restore();
        if (burst > 0) {              /* блик сверху вниз наискосок */
            const k = (t - .45) / .5, bx = q.cx - sw * .5 + sw * k, by = q.cy - size * .5 + size * k;
            ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = al * burst * .8;
            ctx.drawImage(glow(255, 255, 255), bx - 18, by - 18, 36, 36);
        }
        return true;
    }});
    after(450, () => { ring(a.cx, a.cy, a.w * .9, [150, 210, 255], 380, 4); flashDecal(id, 'rgb(120,190,255)', 400, .3); label(id, '🛡 ОБОРОНА', '#9fd4ff', 17); });
};

/* ══════════════════════════════════════════════════════════════════════
   ВОЛНЫ: клич воина и главаря — устрашение (толстое рваное огненное
   кольцо и лучи), вой волка — звук (тонкие дуги пачками). Кого волна
   задела — вздрагивает, когда до него дошла.
   ══════════════════════════════════════════════════════════════════════ */
function shoutWave(fromId, { col, thick, rings = 3, targets = [], onReach }) {
    const a = R(fromId), O = { x: a.cx, y: a.y + a.h * (thick ? .45 : .3) }, maxR = W * .7, DUR = 1.1;
    knock(fromId, 'buzz', thick ? 1.3 : .8);
    for (let i = 0; i < rings; i++) after(i * 170, () => objs.push({ update() {
        const t = this.age / DUR; if (t > 1) return false;
        const rad = 25 + maxR * ease.out(t);
        ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgb(${col})`;
        if (thick) {
            ctx.beginPath();
            /* Рябь — несколько пикселей, а не доля радиуса: иначе большое
               кольцо превращается в каракули. */
            for (let k = 0; k <= 90; k++) { const an = k / 90 * Math.PI * 2, rr = rad + 5 * Math.sin(an * 11 + t * 25 + i); const X = O.x + Math.cos(an) * rr, Y = O.y + Math.sin(an) * rr; k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
            ctx.globalAlpha = (1 - t) * .22; ctx.lineWidth = 40 * (1 - t) + 6; ctx.stroke();
            ctx.globalAlpha = (1 - t) * .45; ctx.lineWidth = 12 * (1 - t) + 3; ctx.stroke();
            ctx.globalAlpha = (1 - t) * .95; ctx.lineWidth = 2.5; ctx.stroke();
        } else {
            for (let k = 0; k < 3; k++) { const rr = rad - k * 14; if (rr < 6) continue; ctx.globalAlpha = (1 - t) * (1 - k * .28) * .85; ctx.lineWidth = 3 - k * .8; ctx.beginPath(); ctx.arc(O.x, O.y, rr, 0, Math.PI * 2); ctx.stroke(); }
        }
        return true;
    }}));
    if (thick) for (let i = 0; i < 40; i++) { const an = rnd(0, Math.PI * 2), sp = rnd(500, 900); part({ kind: 'streak', x: O.x + Math.cos(an) * 30, y: O.y + Math.sin(an) * 30, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, drag: 1.2, size: rnd(1.5, 3), life: rnd(.4, .7), col }); }
    part({ kind: 'glow', x: O.x, y: O.y, size: thick ? 120 : 80, life: .35, col });
    for (const id of targets) {
        const q = R(id), d = Math.hypot(q.cx - O.x, q.cy - O.y), x = clamp((d - 25) / maxR, 0, .99), tt = 1 - Math.sqrt(1 - x);
        after(tt * DUR * 1000, () => { knock(id, 'side', Math.sign(q.cx - O.x) || 1); onReach && onReach(id); });
    }
}
/* 📣 Боевой клич воина (агр): враги вздрагивают и смотрят на него. */

/* 😡 Клич главаря: волна по героям, бандиты наливаются яростью. */

/* 🐺 Вой волка: карточка дрожит, звук расходится во все стороны. */
FX.howl = () => {
    const id = 'e2';
    SFX.play('wolf_howl'); label(id, 'ВОЙ', '#cfe4ff', 26);
    after(500, () => knock(id, 'buzz', .6));
    shoutWave(id, { col: [185, 210, 255], thick: false, rings: 5, targets: HEROES.map(h => h.id), onReach: h => label(h, '−1 атк', '#a8c2ea', 14, false, .4) });
};

/* ══════════════════════════════════════════════════════════════════════
   ЛУК: появляется на карточке лучника, тетива (код) натягивается вместе
   со стрелой, отпускается — стрела летит из лука, тетива дрожит.
   ══════════════════════════════════════════════════════════════════════ */
function drawArrow(len, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-len, 1.5); ctx.lineTo(0, 1.5); ctx.stroke();
    ctx.strokeStyle = '#7a5530'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-len, 0); ctx.lineTo(0, 0); ctx.stroke();
    ctx.strokeStyle = '#c29a66'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-len, -1.2); ctx.lineTo(-2, -1.2); ctx.stroke();
    ctx.fillStyle = '#d9dce2'; ctx.strokeStyle = '#34383e'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-4, -8); ctx.lineTo(0, 0); ctx.lineTo(-4, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c93a32'; ctx.strokeStyle = 'rgba(40,0,0,.7)';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-len + 4, 0); ctx.lineTo(-len - 12, s * 11); ctx.lineTo(-len + 22, s * 2); ctx.closePath(); ctx.fill(); ctx.stroke(); }
}
function flightPlan(p0, tid, out) {
    const r = R(tid), miss = out === 'miss';
    const p1 = miss ? { x: r.x + r.w * 1.35, y: r.y + r.h * 1.4 } : { x: r.x + r.w * rnd(.35, .65), y: r.y + r.h * rnd(.25, .5) };
    return { p1, c: { x: (p0.x + p1.x) / 2 + rnd(-40, 40), y: (p0.y + p1.y) / 2 - 50 } };
}
function bowShot(tid, outs) {
    const actorId=labActor('h_arc'),a = R(actorId), im = IMG[BOW.key], IW = weaponPoseFor('mainhand',actorId).width, IH = weaponPoseFor('mainhand',actorId).height;
    const fitted=weaponPoseFor('mainhand',actorId),L=fitted.height,s=L/IH,arrowLen=L*.6;
    const G={...fitted.grip};
    const shots = outs.map((out, i) => ({ out, plan: flightPlan(G, tid, out), nock: i ? .72 : 0, d0: i ? .74 : .2, d1: i ? .92 : .52, rel: i ? .98 : .64, fired: false }));
    shots.forEach(sh => sh.aim = Math.atan2(sh.plan.c.y - G.y, sh.plan.c.x - G.x));
    const life = shots[shots.length - 1].rel + .5;
    let lastRel = null;
    after(200, () => SFX.play('bow_draw'));
    objs.push({ meta: { key: BOW.key, bow: true }, update() {
        const t = this.age; if (t > life) return false;
        const al = t < .12 ? t / .12 : t > life - .3 ? (life - t) / .3 : 1, sc = t < .2 ? .7 + .3 * ease.back(t / .2) : 1;
        const sh = shots.find(x => !x.fired), cur = sh || shots[shots.length - 1], aim = cur.aim;
        let pull = 0;
        if (sh && t >= sh.d0) pull = t < sh.d1 ? ease.out((t - sh.d0) / (sh.d1 - sh.d0)) : 1;
        const pp = Math.min(1, pull) + (pull >= 1 ? Math.sin(t * 70) * .012 : 0);
        const vib = lastRel != null && (!sh || t < sh.d0) ? Math.sin((t - lastRel) * 95) * Math.exp(-(t - lastRel) * 13) * .35 : 0;
        const recoil = lastRel != null ? Math.exp(-(t - lastRel) * 12) * 7 : 0;
        const dir = { x: Math.cos(aim), y: Math.sin(aim) }, nr = { x: -dir.y, y: dir.x };
        const Gx = G.x - dir.x * recoil, Gy = G.y - dir.y * recoil, sq = 1 - .035 * pp;
        const P = (fx, fy) => { const lx = (fx - BOW.grip[0]) * IW * s * sc, ly = (fy - BOW.grip[1]) * IH * s * sc * sq; return { x: Gx + dir.x * lx + nr.x * ly, y: Gy + dir.y * lx + nr.y * ly }; };
        const nk = P(BOW.rest - pp * .4 * IH / IW + vib * .5, .5), top = P(BOW.top[0], BOW.top[1]), bot = P(BOW.bot[0], BOW.bot[1]);
        this.meta.aim = aim; this.meta.nock = nk; this.meta.grip = { x: Gx, y: Gy };
        if (t < .4) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - t / .4) * .7; ctx.drawImage(glow(255, 215, 140), Gx - L * .55, Gy - L * .55, L * 1.1, L * 1.1); }
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = al;
        ctx.save(); ctx.translate(Gx, Gy); ctx.rotate(aim); ctx.scale(s * sc, s * sc * sq);
        ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 8;
        if (im.complete && im.naturalWidth) ctx.drawImage(im, -BOW.grip[0] * IW, -BOW.grip[1] * IH, IW, IH);
        ctx.restore();
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(nk.x, nk.y); ctx.lineTo(bot.x, bot.y);
        ctx.strokeStyle = 'rgba(30,20,10,.7)'; ctx.lineWidth = 3; ctx.stroke();
        ctx.strokeStyle = '#efe3c4'; ctx.lineWidth = 1.4; ctx.stroke();
        if (sh && t >= sh.nock) {
            const head = { x: nk.x + dir.x * arrowLen, y: nk.y + dir.y * arrowLen };
            if (t >= sh.rel) {
                sh.fired = true; lastRel = t;
                flyArrow(head, sh.plan, tid, sh.out, arrowLen, shots.indexOf(sh)); SFX.play('bow_shot'); knock(actorId, 'lift');
            } else {
                ctx.save(); ctx.translate(head.x - dir.x * 16, head.y - dir.y * 16); ctx.rotate(aim);
                drawArrow(arrowLen - 16, al * clamp((t - sh.nock) / .08, 0, 1)); ctx.restore();
                if (sh.out === 'crit' && pull >= 1) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .6 + .4 * Math.sin(t * 30); ctx.drawImage(glow(255, 220, 120), head.x - 16, head.y - 16, 32, 32); }
            }
        }
        return true;
    }});
}
function flyArrow(p0, plan, tid, out, len, shotIndex=0) {
    const { p1, c } = plan, ms = 320;
    let done = false;
    objs.push({ update() {
        const t = clamp(this.age * 1000 / ms, 0, 1);
        const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * c.x + t * t * p1.x;
        const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * c.y + t * t * p1.y;
        const dx = 2 * (1 - t) * (c.x - p0.x) + 2 * t * (p1.x - c.x), dy = 2 * (1 - t) * (c.y - p0.y) + 2 * t * (p1.y - c.y);
        const ang = Math.atan2(dy, dx);
        if (t < 1) {
            ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .25; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(ang) * 70, y - Math.sin(ang) * 70); ctx.stroke();
            ctx.globalCompositeOperation = 'source-over';
            ctx.translate(x - Math.cos(ang) * 16, y - Math.sin(ang) * 16); ctx.rotate(ang); drawArrow(len - 16); return true;
        }
        if (!done) { done = true; arrowHit(tid, out, x, y, ang, len - 16, shotIndex); }
        return false;
    }});
}
function arrowHit(tid, out, x, y, ang, len) {
    const r = R(tid), dmg = dmgFor(out);
    if (out === 'hit' || out === 'crit') {
        SFX.play('arrow_hit'); if (out === 'crit') SFX.play('crit');
        /* Воткнулась: торчит, покачивается, остриё скрыто в карточке. */
        const life = 2.6, ex = (x - r.x) / r.w, ey = (y - r.y) / r.h;
        objs.push({ update() {
            const a = this.age; if (a > life) return false;
            const q = R(tid), wob = Math.sin(a * 42) * .07 * Math.exp(-a * 5);
            ctx.translate(q.x + ex * q.w, q.y + ey * q.h); ctx.rotate(ang + wob);
            drawArrow(len * .8, a > life - .4 ? (life - a) / .4 : 1); return true;
        }});
        if (out === 'crit') { bloodCrit(tid, clamp(ex, .1, .9), clamp(ey, .1, .9), Math.cos(ang), Math.sin(ang)); bloodBurst(tid, x, y, Math.cos(ang), Math.sin(ang), 1.3, false); }
        else bloodBurst(tid, x, y, Math.cos(ang), Math.sin(ang), .6);
        knock(tid, 'shake', out === 'crit' ? 1.3 : .7);
        if (out === 'crit') { hitstopFor(90); vignette = .8; shake(10); } else shake(3);
        hurt(tid, dmg);
    } else if (out === 'block' || out === 'parry') {
        SFX.play(out === 'block' ? 'shield_block' : 'parry');
        shieldPop(tid, x, y, r.h * .5);
        for (let i = 0; i < 9; i++) part({ kind: 'shard', x, y, vx: rnd(-220, 220), vy: rnd(-300, -60), ay: 1000, vr: rnd(-15, 15), size: rnd(3, 8),
            life: .7, fill: 'rgba(120,85,50,.95)', stroke: 'rgba(40,25,10,.9)' });
        sparks(x, y, 10);
    } else { SFX.play('miss'); knock(tid, 'dodge', -1); }
    sayDamage(tid, out, dmg);
}
FX.arrow = (tid, out = outcome()) => bowShot(tid, [out]);

/* ══════════════════════════════════════════════════════════════════════
   ПОСОХ И ЖЕЗЛ: появляется на карточке мага (посох, большой) или жреца
   (жезл, с топорик), навершие заряжается — частицы стягиваются к нему,
   вспышка, и из навершия летит заклинание (onRelease(точка)).
   Маг и жрец посохом физически не бьют (автор 01.10): без заклинания
   из навершия вылетает сгусток магии.
   ══════════════════════════════════════════════════════════════════════ */
function castFrom(heroId, kind, col, onRelease, { charge = .32, towardId = null, chargeDraw = null } = {}) {
    const S = STAFF[kind], im = IMG[S.key], a = R(heroId);
    const len = a.h * S.k, iw = len * (im.naturalWidth || 226) / (im.naturalHeight || 585);
    const base = { x: a.cx + a.w * (kind === 'wand' ? .12 : .16), y: a.y + a.h * (kind === 'wand' ? .86 : .98) };
    let tilt = 0;
    if (towardId) { const q = R(towardId); tilt = clamp((q.cx - a.cx) / 900, -.35, .35); }
    const tl = { x: (S.tip[0] - S.hx) * iw, y: -(1 - S.tip[1]) * len };
    const tipAt = ang => ({ x: base.x + tl.x * Math.cos(ang) - tl.y * Math.sin(ang), y: base.y + tl.x * Math.sin(ang) + tl.y * Math.cos(ang) });
    const show = .15, rel = show + charge, life = rel + .4;
    let fired = false;
    SFX.play('magic_cast');
    objs.push({ meta: { key: S.key, staff: kind }, update() {
        const t = this.age; if (t > life) return false;
        const kick = t > rel ? Math.sin(clamp((t - rel) / .25, 0, 1) * Math.PI) * .12 * (tilt < 0 ? -1 : 1) : 0;
        const ang = tilt + kick;
        const al = t < .1 ? t / .1 : t > life - .2 ? (life - t) / .2 : 1, sc = t < show ? .7 + .3 * ease.back(t / show) : 1;
        const rawTip = tipAt(ang);
        const tp = { x: base.x + (rawTip.x - base.x) * sc, y: base.y + (rawTip.y - base.y) * sc };
        if (t > show * .5 && t < rel) for (let i = 0; i < 2; i++) {
            const aa = rnd(0, Math.PI * 2), d = rnd(26, 50);
            part({ kind: 'glow', x: tp.x + Math.cos(aa) * d, y: tp.y + Math.sin(aa) * d, vx: -Math.cos(aa) * d * 4, vy: -Math.sin(aa) * d * 4, size: rnd(2, 4), life: .22, col });
        }
        ctx.save(); ctx.globalAlpha = al; ctx.translate(base.x, base.y); ctx.rotate(ang); ctx.scale(sc, sc);
        ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 10;
        if (im.complete && im.naturalWidth) ctx.drawImage(im, -S.hx * iw, -len, iw, len);
        ctx.restore();
        const g = t < rel ? clamp((t - show * .5) / charge, 0, 1) : clamp(1 - (t - rel) / .25, 0, 1);
        if (g > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = g * al; const R0 = 12 + 22 * g; ctx.drawImage(glow(col[0], col[1], col[2]), tp.x - R0, tp.y - R0, R0 * 2, R0 * 2); ctx.globalCompositeOperation = 'source-over'; }
        if (chargeDraw && t < rel) { ctx.save(); chargeDraw(tp, clamp((t - show) / charge, 0, 1), t); ctx.restore(); }
        this.meta.tip = tp;
        if (!fired && t >= rel) { fired = true; part({ kind: 'glow', x: tp.x, y: tp.y, size: 60, life: .25, col }); ring(tp.x, tp.y, 40, col, 260, 3); onRelease(tp); }
        return true;
    }});
}
/* Полёт по дуге: общий для заклинаний, сгустков и лечения. */
function fly({ p0, p1, ms, arc = 60, head, trail, onEnd }) {
    const c = { x: (p0.x + p1.x) / 2 + rnd(-arc, arc), y: (p0.y + p1.y) / 2 - arc };
    let done = false, last = { x: p0.x, y: p0.y };
    objs.push({ update(dt) {
        const t = clamp(this.age * 1000 / ms, 0, 1);
        const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * c.x + t * t * p1.x;
        const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * c.y + t * t * p1.y;
        const vx = (x - last.x) / Math.max(dt, 1e-3), vy = (y - last.y) / Math.max(dt, 1e-3);
        trail && trail(x, y, vx, vy, dt); last = { x, y };
        if (t < 1) { head(x, y, Math.atan2(vy, vx), this.age); return true; }
        if (!done) { done = true; onEnd && onEnd(x, y); }
        return false;
    }});
}
/* Заклинание во врага: промах пролетает мимо карточки. */
function projectile({ p0, tid, out, ms, arc = 60, head, trail, onHit, impact }) {
    const r = R(tid), miss = out === 'miss';
    const p1 = miss ? { x: r.x + r.w * 1.4, y: r.y + r.h * 1.3 } : { x: r.cx + rnd(-r.w * .1, r.w * .1), y: r.y + r.h * .42 };
    fly({ p0, p1, ms, arc, head, trail, onEnd: (x, y) => { if (impact) SFX.play(impact, { out, miss, crit: out === 'crit' }); onHit(x, y, miss); } });
}
/* Картинка огненной или ледяной стрелы автора, остриём по полёту. */
function drawMagic(key, x, y, ang, len) {
    const im = IMG[key], M = MAGIC[key];
    if (!(im && im.complete && im.naturalWidth)) return false;
    const h = len * im.naturalHeight / im.naturalWidth;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang - M.fwd * Math.PI / 180);
    ctx.drawImage(im, -M.tip[0] * len, -M.tip[1] * h, len, h); ctx.restore();
    return true;
}

/* 🔥 Огненная стрела: из посоха, попала — взрыв, карточка горит 5 с. */

/* Карточка горит 5 с (автор 01.10): языки огня по копоти, которая
   расползается от места попадания к краям, угли, дым; карточка темнеет.
   Последние полторы секунды огонь стихает, копоть потом гаснет. */

/* ❄ Ледяная стрела: из посоха, осколки и иней. */
FX.ice = (tid, out = outcome()) => castFrom('h_mag', 'staff', [140, 210, 255], tp => {
    SFX.play('ice_cast');
    const r = R(tid);
    projectile({ p0: tp, tid, out, ms: 380, arc: 30, impact: 'ice_hit',
        head(x, y, ang) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.drawImage(glow(120, 200, 255), x - 34, y - 34, 68, 68);
            ctx.globalCompositeOperation = 'source-over';
            drawMagic('ice_arrow', x, y, ang, r.w * 1.05);
        },
        trail(x, y, vx, vy) {
            for (let i = 0; i < 3; i++) part({ kind: 'glow', x: x + rnd(-5, 5), y: y + rnd(-5, 5), vx: -vx * .05 + rnd(-30, 30), vy: -vy * .05 + rnd(-30, 30), drag: 2,
                size: rnd(4, 8), life: rnd(.4, .7), col: pickOne([[190, 230, 255], [240, 250, 255], [140, 200, 255]]) });
            if (Math.random() < .4) part({ kind: 'shard', x, y, vx: rnd(-50, 50), vy: rnd(-30, 60), ay: 200, vr: rnd(-8, 8), size: rnd(2, 4), life: .6 });
        },
        onHit(x, y, miss) {
            const crit = out === 'crit', dmg = dmgFor(out);
            for (let i = 0; i < 26 * (crit ? 1.5 : 1); i++) part({ kind: 'shard', x, y, vx: rnd(-320, 320), vy: rnd(-380, 120), ay: 1000, vr: rnd(-14, 14), size: rnd(4, 10), life: rnd(.5, 1) });
            for (let i = 0; i < 24; i++) part({ kind: 'glow', x, y, vx: rnd(-160, 160), vy: rnd(-160, 160), drag: 3, size: rnd(5, 12), life: rnd(.4, .9), col: [210, 240, 255] });
            part({ kind: 'glow', x, y, size: 120, life: .25, col: [180, 225, 255] });
            ring(x, y, r.w * .8, [190, 235, 255], 300, 4);
            if (miss) { knock(tid, 'dodge', -1); sayDamage(tid, 'miss', 0); return; }
            if (out === 'block' || out === 'parry') { shieldPop(tid, x, y, r.h * .55); sayDamage(tid, out, 0); return; }
            if (crit) SFX.play('crit');
            const px = (x - r.x) / r.w, py = (y - r.y) / r.h;
            addIce(tid, crit ? 7 : 6);
            flashDecal(tid, 'rgb(170,220,255)', 260, .5);
            knock(tid, 'shake', crit ? 1.2 : .7); shake(crit ? 12 : 5); if (crit) hitstopFor(90);
            hurt(tid, dmg); sayDamage(tid, out, dmg);
        } });
}, { towardId: tid });

/* ✦ Искра: из посоха, быстрая, ломаная, с потрескиванием. */
FX.spark = (tid, out = outcome()) => castFrom('h_mag', 'staff', [255, 240, 150], tp => {
    SFX.play('spark');
    projectile({ p0: tp, tid, out, ms: 260, arc: 20,
        head(x, y) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.drawImage(glow(255, 240, 150), x - 26, y - 26, 52, 52);
            ctx.drawImage(glow(255, 255, 255), x - 9, y - 9, 18, 18);
            ctx.strokeStyle = 'rgba(255,245,190,.9)'; ctx.lineWidth = 1.4;
            for (let k = 0; k < 3; k++) {
                ctx.beginPath(); ctx.moveTo(x, y); let px = x, py = y;
                const a0 = rnd(0, Math.PI * 2);
                for (let j = 0; j < 4; j++) { px += Math.cos(a0 + rnd(-.8, .8)) * rnd(5, 11); py += Math.sin(a0 + rnd(-.8, .8)) * rnd(5, 11); ctx.lineTo(px, py); }
                ctx.stroke();
            }
        },
        trail(x, y) { part({ kind: 'glow', x, y, size: rnd(5, 9), life: .25, col: [255, 230, 140] }); if (Math.random() < .7) part({ kind: 'streak', x, y, vx: rnd(-200, 200), vy: rnd(-200, 200), size: 1, life: .2, col: [255, 250, 200] }); },
        onHit(x, y, miss) {
            const r = R(tid), dmg = Math.max(0, dmgFor(out) - 2);
            sparks(x, y, 26, [255, 245, 170], 380);
            if (!miss && out !== 'block' && out !== 'parry') {
                objs.push({ update() {
                    if (this.age > .5) return false;
                    const q = R(tid);
                    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,250,200,.9)'; ctx.lineWidth = 1.3;
                    for (let k = 0; k < 2; k++) {
                        let px = q.x + rnd(.1, .9) * q.w, py = q.y + rnd(.1, .9) * q.h; ctx.beginPath(); ctx.moveTo(px, py);
                        for (let j = 0; j < 5; j++) { px += rnd(-14, 14); py += rnd(-14, 14); ctx.lineTo(px, py); }
                        ctx.stroke();
                    }
                    return true;
                }});
                flashDecal(tid, 'rgb(255,240,160)', 200, .45); knock(tid, 'buzz', .6); hurt(tid, dmg);
            } else if (miss) knock(tid, 'dodge', 1);
            else shieldPop(tid, x, y, r.h * .5);
            sayDamage(tid, miss ? 'miss' : out, dmg);
        } });
}, { towardId: tid });

/* 🔮 Сгусток: маг или жрец без заклинания — лёгкий шарик магии,
   «пуньк» из навершия и «среньк» в карточку. */
function magicBolt(p0, tid, out, col) {
    SFX.play('staff_hit');
    projectile({ p0, tid, out, ms: 300, arc: 25,
        head(x, y, ang, t) {
            const wob = Math.sin(t * 38) * 4; x += -Math.sin(ang) * wob; y += Math.cos(ang) * wob;
            ctx.globalCompositeOperation = 'lighter';
            ctx.drawImage(glow(col[0], col[1], col[2]), x - 20, y - 20, 40, 40);
            ctx.drawImage(glow(255, 255, 255), x - 6, y - 6, 12, 12);
        },
        trail(x, y) {
            part({ kind: 'glow', x: x + rnd(-3, 3), y: y + rnd(-3, 3), size: rnd(3, 6), life: rnd(.2, .35), col });
            if (Math.random() < .35) part({ kind: 'streak', x, y, vx: rnd(-120, 120), vy: rnd(-120, 120), size: 1, life: .2, col: [255, 255, 255] });
        },
        onHit(x, y, miss) {
            const r = R(tid), crit = out === 'crit', dmg = crit ? Math.floor(rnd(6, 10)) : out === 'hit' ? Math.floor(rnd(2, 6)) : 0;
            for (let i = 0; i < 14; i++) { const a = rnd(0, Math.PI * 2), s = rnd(80, 260); part({ kind: 'glow', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 3, size: rnd(2, 5), life: rnd(.25, .5), col }); }
            part({ kind: 'glow', x, y, size: 50, life: .2, col: [255, 255, 255] });
            ring(x, y, r.w * .35, col, 240, 3);
            if (miss) { knock(tid, 'dodge', 1); sayDamage(tid, 'miss', 0); return; }
            if (out === 'block' || out === 'parry') { shieldPop(tid, x, y, r.h * .45); sayDamage(tid, out, 0); return; }
            flashDecal(tid, `rgb(${col})`, 200, .35); knock(tid, 'shake', crit ? .9 : .5); if (crit) shake(6);
            hurt(tid, dmg); sayDamage(tid, out, dmg);
        } });
}
FX.bolt = (tid, out = outcome()) => castFrom('h_mag', 'staff', [190, 120, 255], tp => magicBolt(tp, tid, out, [190, 120, 255]), { charge: .2, towardId: tid });
FX.pbolt = (tid, out = outcome()) => castFrom('h_pri', priestWeapon(), [255, 215, 120], tp => magicBolt(tp, tid, out, [255, 220, 140]), { charge: .2, towardId: tid });

/* 🧊 Обморожение: с посоха — морозный поток, иней от краёв, держится,
   пока не нажмёшь снова (тогда оттаивает). */

let syncFrostBtn;

/* ══════════════════════════════════════════════════════════════════════
   ЖРЕЦ: лечение — зелёная энергия с жезла летит к своему; воскрешение —
   луч с жезла вверх, сверху на павшего падает столп святого света.
   ══════════════════════════════════════════════════════════════════════ */

function holyPillar(id) {
    SFX.play('revive');
    const c = cards[id];
    objs.push({ meta: { pillar: id }, update() {
        const t = this.age, life = 1.6; if (t > life) return false;
        const q = R(id), wdt = q.w * 1.3, x0 = q.cx - wdt / 2, yb = (q.y + q.h) * ease.in(clamp(t / .2, 0, 1));
        const al = t > life - .45 ? (life - t) / .45 : 1, pulse = 1 + .08 * Math.sin(t * 20);
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(x0, 0, x0 + wdt, 0);
        g.addColorStop(0, 'rgba(255,200,90,0)'); g.addColorStop(.25, 'rgba(255,215,120,.35)'); g.addColorStop(.5, 'rgba(255,252,235,.95)');
        g.addColorStop(.75, 'rgba(255,215,120,.35)'); g.addColorStop(1, 'rgba(255,200,90,0)');
        ctx.globalAlpha = al; ctx.fillStyle = g;
        ctx.save(); ctx.translate(q.cx, 0); ctx.scale(pulse, 1); ctx.translate(-q.cx, 0); ctx.fillRect(x0, 0, wdt, yb); ctx.restore();
        if (t < life - .3) for (let i = 0; i < 2; i++) part({ kind: 'glow', x: q.cx + rnd(-wdt * .35, wdt * .35), y: rnd(0, yb), vy: rnd(250, 500), size: rnd(2, 4), life: .45, col: [255, 245, 200] });
        return true;
    }});
    after(200, () => {
        const q = R(id);
        ring(q.cx, q.y + q.h * .9, q.w * 1.1, [255, 225, 140], 500, 5); ring(q.cx, q.cy, q.w * .8, [255, 250, 220], 400, 3);
        for (let i = 0; i < 40; i++) part({ kind: 'glow', x: q.cx + rnd(-q.w / 2, q.w / 2), y: q.y + q.h * rnd(.6, 1), vx: rnd(-40, 40), vy: rnd(-260, -80), drag: 1, size: rnd(3, 6), life: rnd(.6, 1.2), col: pickOne([[255, 235, 170], [255, 255, 230]]) });
        flashDecal(id, 'rgb(255,245,210)', 700, .8);
        c.el.style.filter = ''; anim(c.el, [{ filter: 'grayscale(1) brightness(1.8)' }, { filter: 'none' }], 900);
        const v = active.targets.find(t=>t.id===id)?.value||0;
        impact(id);knock(id,'lift');
    });
}

/* 🎸 Бард: звуковая волна — дуги расходятся от барда к цели, ноты,
   карточка гудит как динамик. */
FX.bard = (tid, out = outcome()) => {
    const a = R(labActor('h_bar')), r = R(tid);
    const p0 = { x: a.cx, y: a.y + a.h * .7 }, p1 = { x: r.cx, y: r.y + r.h * .4 };
    const dx = p1.x - p0.x, dy = p1.y - p0.y, dist = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
    const crit = out === 'crit', miss = out === 'miss';
    const col = crit ? [255, 239, 166] : [255, 242, 184];
    const n = crit ? 7 : 5, ms = 520;
    knock('h_bar', 'lift');
    SFX.play('lute_hit', { crit });
    for (let i = 0; i < n; i++) after(i * 70, () => {
        objs.push({ update() {
            const t = this.age * 1000 / ms; if (t > 1) return false;
            const d = dist * ease.out(t) * (miss ? 1.25 : 1);
            const x = p0.x + Math.cos(ang) * d + (miss ? d * .25 : 0), y = p0.y + Math.sin(ang) * d;
            const rad = 18 + 60 * t;
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = (1 - t) * .5;
            ctx.drawImage(glow(col[0], col[1], col[2]), x - rad * .6, y - rad * .6, rad * 1.2, rad * 1.2);
            for (let k = 0; k < 3; k++) {
                const cx = x - Math.cos(ang) * k * 11, cy = y - Math.sin(ang) * k * 11, rr = rad - k * 8;
                ctx.strokeStyle = `rgb(${col})`;
                ctx.globalAlpha = (1 - t) * (1 - k * .25) * .35; ctx.lineWidth = 14 - k * 3;
                ctx.beginPath(); ctx.arc(cx, cy, rr, ang - .85, ang + .85); ctx.stroke();
                ctx.globalAlpha = (1 - t) * (1 - k * .25); ctx.lineWidth = 5 - k * 1.4;
                ctx.beginPath(); ctx.arc(cx, cy, rr, ang - .85, ang + .85); ctx.stroke();
            }
            return true;
        }});
    });
    const notes = ['♪', '♫', '♬', '♩'];
    for (let i = 0; i < (crit ? 14 : 9); i++) after(i * 45, () => {
        const t0 = rnd(.1, .4);
        part({ kind: 'note', text: pickOne(notes), x: p0.x + dx * t0 + rnd(-20, 20), y: p0.y + dy * t0 + rnd(-20, 20), vx: dx / (ms / 1000) * .8, vy: dy / (ms / 1000) * .8 - 30,
            drag: 1.2, rot: rnd(-.4, .4), vr: rnd(-2, 2), size: rnd(18, 30), life: rnd(.7, 1), col: pickOne([col, [255, 249, 220], [255, 234, 156]]) });
    });
    after(ms * .85, () => {
        if (miss) { knock(tid, 'dodge', 1); sayDamage(tid, 'miss', 0); return; }
        if (out === 'block' || out === 'parry') { ring(p1.x, p1.y, r.w * .7, [200, 220, 255], 300, 3); shieldPop(tid, p1.x, p1.y, r.h * .5); sayDamage(tid, out, 0); return; }
        const dmg = dmgFor(out);
        SFX.play('bard_wave');
        for (let i = 0; i < (crit ? 5 : 3); i++) after(i * 110, () => ring(r.cx, r.cy, r.w * (crit ? 1.1 : .8), col, 420, 4));
        knock(tid, 'buzz', crit ? 1.6 : 1);
        flashDecal(tid, `rgb(${col})`, 300, .35);
        for (let i = 0; i < 12; i++) part({ kind: 'note', text: pickOne(notes), x: r.cx, y: r.cy, vx: rnd(-220, 220), vy: rnd(-260, 40), ay: 300, rot: rnd(-.5, .5), vr: rnd(-3, 3), size: rnd(16, 26), life: rnd(.6, 1), col });
        if (crit) { shake(14); vignette = .6; hitstopFor(90); } else shake(4);
        hurt(tid, dmg); sayDamage(tid, out, dmg);
    });
};

/* 🌑 Разбойник из тени: выходит из скрытности; у бока карточки врага
   сгущается тень, из неё рука с кинжалом — рядом, никуда не летит — и
   тычет в бок карточки (автор 01.10). */

let stabHit;

/* 🧪 Зелье врага: бутылка над карточкой, наклон, зелёный вихрь, +HP. */

/* Кто без цели-врага: сами по себе или по выбранному герою. */
const NOTARGET = new Set(['guard', 'cry', 'heal', 'revive', 'howl', 'roar', 'demo', 'clear']);
function run(k, tid = targetId, o, g) {
    if (NOTARGET.has(k)) return FX[k]();
    if (k === 'strike' || k === 'sweep') return FX[k](tid, o || outcome(), g || gear());
    return o ? FX[k](tid, o) : FX[k](tid);
}

const BURN_CONTOUR = [[0.82855, 0.5], [0.82192, 0.51265], [0.81482, 0.52478], [0.81994, 0.53787], [0.82687, 0.55177], [0.82067, 0.56379], [0.82335, 0.57763], [0.83617, 0.59481], [0.83219, 0.60793], [0.83069, 0.622], [0.81827, 0.63183], [0.76433, 0.62186], [0.75082, 0.6278], [0.74839, 0.63911], [0.7441, 0.64958], [0.74666, 0.66481], [0.73677, 0.67202], [0.71856, 0.6723], [0.71709, 0.68541], [0.7073, 0.69162], [0.70638, 0.70638], [0.71057, 0.72779], [0.70768, 0.74316], [0.70291, 0.75739], [0.68937, 0.76064], [0.6812, 0.77119], [0.66375, 0.76721], [0.6504, 0.76857], [0.64554, 0.78563], [0.63755, 0.79837], [0.62787, 0.8087], [0.61399, 0.80899], [0.60177, 0.81323], [0.58615, 0.80547], [0.57335, 0.80551], [0.55741, 0.7886], [0.54291, 0.77094], [0.53093, 0.76133], [0.52033, 0.75837], [0.51008, 0.75658], [0.5, 0.75678], [0.48967, 0.76296], [0.47816, 0.77745], [0.46663, 0.78192], [0.45447, 0.78749], [0.44415, 0.78078], [0.43, 0.79156], [0.41818, 0.79012], [0.40981, 0.77758], [0.40726, 0.75138], [0.39929, 0.74313], [0.3935, 0.73102], [0.38053, 0.73448], [0.35934, 0.75117], [0.34917, 0.74614], [0.33608, 0.74533], [0.32845, 0.73612], [0.3198, 0.72858], [0.31304, 0.7189], [0.31217, 0.7032], [0.31054, 0.68946], [0.2968, 0.68783], [0.28231, 0.68593], [0.26704, 0.68365], [0.25613, 0.67718], [0.24804, 0.66835], [0.25182, 0.65208], [0.24256, 0.64417], [0.23142, 0.63685], [0.22046, 0.62887], [0.22077, 0.61566], [0.22617, 0.60102], [0.23304, 0.58674], [0.2306, 0.57598], [0.23093, 0.5646], [0.2286, 0.55398], [0.22354, 0.54379], [0.23391, 0.53149], [0.23765, 0.52065], [0.21872, 0.51105], [0.20813, 0.5], [0.20278, 0.48832], [0.18995, 0.4756], [0.19273, 0.46363], [0.17392, 0.44835], [0.17698, 0.43575], [0.18596, 0.4246], [0.1976, 0.41471], [0.17691, 0.39502], [0.17904, 0.38159], [0.17509, 0.36542], [0.1828, 0.35377], [0.1895, 0.34179], [0.22308, 0.34492], [0.24774, 0.34542], [0.25268, 0.33475], [0.25033, 0.3186], [0.24887, 0.30203], [0.2532, 0.28921], [0.25405, 0.27265], [0.26035, 0.26035], [0.27427, 0.25581], [0.28662, 0.25017], [0.30104, 0.24762], [0.32001, 0.25226], [0.32456, 0.23743], [0.32875, 0.22055], [0.3383, 0.21126], [0.3465, 0.19873], [0.36245, 0.20163], [0.37488, 0.19793], [0.38656, 0.19251], [0.39823, 0.18677], [0.41017, 0.18148], [0.42032, 0.16812], [0.43279, 0.16212], [0.44386, 0.14557], [0.45707, 0.1373], [0.47191, 0.14305], [0.48619, 0.1486], [0.5, 0.15231], [0.51356, 0.15497], [0.52759, 0.14941], [0.54068, 0.15631], [0.55252, 0.16841], [0.55803, 0.20827], [0.56571, 0.22628], [0.57338, 0.23981], [0.59118, 0.21939], [0.60516, 0.21495], [0.6242, 0.20014], [0.64055, 0.19511], [0.65567, 0.19447], [0.66872, 0.19873], [0.67542, 0.21375], [0.69272, 0.21157], [0.70015, 0.22452], [0.7113, 0.23197], [0.70975, 0.25441], [0.7149, 0.26752], [0.72499, 0.27501], [0.73658, 0.28131], [0.73831, 0.29646], [0.74236, 0.30894], [0.75354, 0.31579], [0.78777, 0.30772], [0.80121, 0.31542], [0.80892, 0.327], [0.82329, 0.33527], [0.82734, 0.3491], [0.82785, 0.3642], [0.81872, 0.38242], [0.8155, 0.39749], [0.82926, 0.40714], [0.85204, 0.41548], [0.86603, 0.42719], [0.88043, 0.43975], [0.87695, 0.45538], [0.8331, 0.47378], [0.83069, 0.48701]];
const backFx = $('backFx'), backCtx = backFx.getContext('2d');
let paused = false;
const loaded = im => !!(im && im.complete && im.naturalWidth);
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

let holeScale;
function holePoint(d, p, w, h, scale) {
    return [d.x * w + (p[0] - .5) * d.size * w * scale,
        d.y * h + (p[1] - .5) * d.size * w * scale];
}
let applyCardMask;
function thinFlame(x, px, py, size, t, opacity = 1, seed = 0) {
    x.save(); x.translate(px, py); x.globalAlpha *= opacity;
    const lean = Math.sin(t * 8 + seed) * size * .28;
    const high = size * (1.5 + .28 * Math.sin(t * 13 + seed));
    const gr = x.createLinearGradient(0, 0, lean, -high);
    gr.addColorStop(0, '#fff1a2'); gr.addColorStop(.2, '#ffbf3b');
    gr.addColorStop(.65, '#f9550a'); gr.addColorStop(1, 'rgba(180,25,0,0)');
    x.fillStyle = gr; x.beginPath(); x.moveTo(-size * .21, 0);
    x.bezierCurveTo(-size * .58, -high * .5, lean + size * .5, -high * .58, lean, -high);
    x.bezierCurveTo(lean + size * .9, -high * .3, size * .5, -high * .2, size * .2, 0);
    x.closePath(); x.fill();
    x.fillStyle = '#fff2a0'; x.beginPath(); x.moveTo(-size * .08, 0);
    x.quadraticCurveTo(-size * .12, -high * .27, lean * .4, -high * .46);
    x.quadraticCurveTo(size * .24, -high * .2, size * .12, 0); x.fill(); x.restore();
}
let burnHole;
function addIce(tid, life = 6) {
    cards[tid].ice = { age: 0, life, mist: 0, thaw: null };
    syncFrostBtn();
}
let addEdgeFire;

let drawStatuses;

// All melee weapon families enter from the same side at the card's midline.
strikeGeom = function(r, w, side, two) {
    const L = side === 'left' ? 1 : -1, len = r.h * (two ? .98 : w.kind === 'axe' ? .76 : .82);
    const im = IMG[w.key], iw = len * (im.naturalWidth || 200) / (im.naturalHeight || 600);
    const from = L * (Math.PI / 2 - .83), to = L * (Math.PI / 2 + .83), flip = w.edge === 'right' && L < 0;
    const contactAngle = L * Math.PI / 2;
    const offset = headAt(w, { x: 0, y: 0 }, len, iw, contactAngle, flip);
    const pivot = { x: r.x + r.w * (L > 0 ? .29 : .71) - offset.x, y: r.cy - offset.y };
    return { pivot, len, from, to, ms: two ? 500 : w.kind === 'axe' ? 430 : 370, easing: ease.inOut, contact: .5, iw, flip, spin: L };
};

function criticalCut(tid, weapon = ARMS.sword1[0], side = 1, life = 4.3) {
    const c = cards[tid], r = R(tid), ex = .52, ey = .44;
    if (c.cutUntil && c.cutUntil > clock) return;
    c.cutUntil = clock + life * 1000;
    decal(tid, { life, criticalCut: true, draw(x, w, h, a) {
        const alpha = smooth((life - a) / .65), g = smooth(a / .18);
        x.globalAlpha = alpha; x.lineCap = 'round';
        x.beginPath(); x.moveTo(w * .47, 0); x.lineTo(w * .5, h * .18 * g); x.lineTo(w * ex, h * ey * g);
        x.strokeStyle = '#180d0e'; x.lineWidth = w * .038; x.stroke();
        x.strokeStyle = '#650a10'; x.lineWidth = w * .017; x.stroke();
        x.beginPath(); x.moveTo(w * .45, 0); x.lineTo(w * .477, h * .2); x.lineTo(w * .498, h * ey);
        x.strokeStyle = 'rgba(234,196,159,.6)'; x.lineWidth = Math.max(.7, w * .006); x.stroke();
        for (let k = 0; k < 3; k++) {
            const xx = (ex + (k - 1) * .031) * w, yy = h * (ey - .075 * k), length = h * (.13 + .035 * k) * smooth((a - k * .2) / 1.8);
            if (length <= 0) continue;
            x.strokeStyle = '#730c12'; x.lineWidth = w * .013; x.beginPath(); x.moveTo(xx, yy); x.lineTo(xx + w * .009, yy + length); x.stroke();
            x.fillStyle = '#940d14'; x.beginPath(); x.ellipse(xx + w * .009, yy + length, w * .008, w * .014, 0, 0, Math.PI * 2); x.fill();
        }
    }});
    after(90, () => {
        const im = IMG[weapon.key];
        objs.push({ meta: { embedded: true, target: tid, key: weapon.key }, update() {
            if (this.age > life - .09) return false;
            const q = R(tid), len = q.h * .67, iw = len * (im.naturalWidth || 200) / (im.naturalHeight || 600);
            const angle = Math.PI - side * .31, insertion = .19 + .05 * smooth(this.age / .13);
            const E = { x: q.x + ex * q.w, y: q.y + ey * q.h };
            const handle = { x: E.x - Math.sin(angle) * len * (1 - insertion), y: E.y + Math.cos(angle) * len * (1 - insertion) };
            ctx.globalAlpha = smooth((life - .09 - this.age) / .65) * smooth(this.age / .09);
            ctx.translate(handle.x, handle.y); ctx.rotate(angle + Math.sin(this.age * 44) * .05 * Math.exp(-this.age * 8));
            ctx.beginPath(); ctx.rect(-iw * 2, -len * (1 - insertion), iw * 4, len * 2); ctx.clip();
            ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 8;
            if (loaded(im)) ctx.drawImage(im, -weapon.hx * iw, -len, iw, len);
            return true;
        }});
    });
}

const normalBladeImpact = impactBlade;

function sweepTargets(tid) {
    const pool = Object.keys(cards).filter(id => cards[id].hero === cards[tid].hero), count = Math.min(pool.length, +$('sweepCount').value || pool.length);
    const i = pool.indexOf(tid), start = clamp(i - Math.floor((count - 1) / 2), 0, pool.length - count);
    return pool.slice(start, start + count);
}

function drawFireCore(c, x, y, radius, time, strength = 1) {
    if (radius <= 0) return;
    c.save(); c.translate(x, y); c.globalCompositeOperation = 'lighter';
    c.globalAlpha *= .48 * strength;
    c.drawImage(glow(255, 115, 15), -radius * 2.1, -radius * 2.1, radius * 4.2, radius * 4.2);
    c.globalAlpha /= .48;
    const gr = c.createRadialGradient(-radius * .18, -radius * .18, radius * .03, 0, 0, radius);
    gr.addColorStop(0, '#fffce0'); gr.addColorStop(.26, '#fff091'); gr.addColorStop(.55, '#ffb72b'); gr.addColorStop(.82, '#f86109'); gr.addColorStop(1, 'rgba(198,38,0,0)');
    c.fillStyle = gr; c.beginPath();
    for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2, r = radius * (1 + .07 * Math.sin(a * 5 + time * 9) + .035 * Math.sin(a * 9 - time * 12));
        i ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    c.fill();
    for (let i = 0; i < 3; i++) { c.strokeStyle = i % 2 ? '#ffe579' : '#ff7516'; c.globalAlpha *= .7; c.lineWidth = radius * .13;
        c.beginPath(); c.arc(0, 0, radius * (.4 + i * .17), time * (2 + i * .3) + i * 2, time * (2 + i * .3) + i * 2 + 2.2); c.stroke(); }
    c.restore();
}
function drawFlyingBall(c, x, y, ang, radius, time, alpha = 1) {
    c.save(); c.globalAlpha = alpha; c.translate(x, y); c.rotate(ang);
    // Original artist texture points towards bottom-left; its hot core is (0.30, 0.70).
    if (loaded(IMG.fireball)) {
        c.save(); c.rotate(-Math.PI * .75);
        const size = radius * 4.25, breath = 1 + .035 * Math.sin(time * 28);
        c.scale(breath, 1 / breath); c.drawImage(IMG.fireball, -.30 * size, -.70 * size, size, size); c.restore();
    }
    for (let k = 0; k < 3; k++) {
        c.globalCompositeOperation = 'lighter'; c.globalAlpha = alpha * (.26 - k * .045);
        const len = radius * (2.6 + .32 * Math.sin(time * 20 + k)), yy = (k - 1) * radius * .35;
        c.fillStyle = k === 1 ? '#fff3a3' : '#ff7809'; c.beginPath(); c.moveTo(radius * .2, yy);
        c.bezierCurveTo(-radius, yy - radius * .6, -len * .6, Math.sin(time * 18 + k) * radius, -len, yy * .25);
        c.quadraticCurveTo(-radius, yy + radius * .6, radius * .2, yy); c.fill();
    }
    c.globalAlpha = alpha; drawFireCore(c, radius * .18, 0, radius * .55, time, .75);
    c.globalCompositeOperation = 'lighter'; c.globalAlpha = alpha * (.35 + .12 * Math.sin(time * 35));
    c.drawImage(glow(255, 247, 190), radius * .25, -radius * .55, radius * 1.1, radius * 1.1);
    c.restore();
}
FX.fireball = (tid, out = outcome()) => {
    const r = R(tid), radius = r.w * .18, flightRadius = radius * .8;
    castFrom('h_mag', 'staff', [255, 130, 32], tp => {
        SFX.play('fireball_fly');
        const miss = out === 'miss', blocked = out === 'block' || out === 'parry';
        const end = { x: miss ? r.x + r.w * 1.34 : r.cx, y: r.y + r.h * .47 };
        const dx = end.x - tp.x, dy = end.y - tp.y, ang = Math.atan2(dy, dx);
        let hit = false, emitter = 0;
        objs.push({ meta: { fireball: true, target: tid, penetrated: false }, update(dt) {
            const t = this.age / .78, p = t <= 1 ? .3 * t + .7 * t * t : 1 + (t - 1) * 1.7;
            if (t > 1.5) return false;
            const px = tp.x + dx * p, py = tp.y + dy * p;
            if (!hit && t >= 1) {
                hit = true;
                if (miss) { sayDamage(tid, out, 0); knock(tid, 'dodge', 1); }
                else if (blocked) { SFX.play('shield_block'); shieldPop(tid, end.x, end.y, r.h * .58); sparks(end.x, end.y, 14, [255, 190, 80], 260); sayDamage(tid, out, 0); return false; }
                else {
                    this.meta.penetrated = out === 'crit';
                    if (out === 'crit') burnHole(tid, .5, .47, true);
                    else { igniteCard(tid); this.meta.stopped = true; }
                    fireballImpact(tid, out === 'crit');
                    SFX.play('fireball_boom'); const dmg = dmgFor(out); hurt(tid, dmg); sayDamage(tid, out, dmg);
                    shake(out === 'crit' ? 9 : 4);
                    for (let i = 0; i < 22; i++) { const a = rnd(0, Math.PI * 2), v = rnd(30, 130);
                        part({ kind: 'fire', x: end.x, y: end.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 3, size: radius * rnd(.12, .3), grow: -5, life: rnd(.2, .4) }); }
                }
            }
            if (this.meta.stopped) return false;
            const afterImpact = hit && !miss, drawContext = afterImpact ? backCtx : ctx;
            const alpha = t < 1 ? 1 : smooth((1.5 - t) / .5);
            drawFlyingBall(drawContext, px, py, ang, flightRadius * (afterImpact ? 1 - (t - 1) * .75 : .85 + t * .15), this.age, alpha);
            if (!afterImpact) { emitter += dt; while (emitter > .018) { emitter -= .018;
                part({ kind: 'fire', x: px - Math.cos(ang) * radius * .8 + rnd(-4, 4), y: py - Math.sin(ang) * radius * .8 + rnd(-4, 4),
                    vx: -Math.cos(ang) * 28 + rnd(-12, 12), vy: -Math.sin(ang) * 28 + rnd(-14, 14), size: flightRadius * rnd(.14, .26), grow: -4, life: .33, alpha: .7 }); } }
            return true;
        }});
    }, { charge: 2.05, towardId: tid, chargeDraw(tp, p, t) {
        const rr = radius * (.09 + .72 * smooth(p));
        drawFireCore(ctx, tp.x, tp.y, rr, t);
        ctx.save(); ctx.translate(tp.x, tp.y);
        for (let k = 0; k < 4; k++) { const a = t * (2.5 + k * .18) + k * Math.PI / 2, d = rr * (1.1 + .45 * (1 - p));
            thinFlame(ctx, Math.cos(a) * d, Math.sin(a) * d, rr * .32, t, smooth(p / .2) * .75, k); }
        ctx.restore();
    }});
};

FX.fire = (tid, out = outcome()) => castFrom('h_mag', 'staff', [255, 150, 50], tp => {
    SFX.play('fireball_fly'); const r = R(tid);
    projectile({ p0: tp, tid, out, ms: 520, arc: 45,
        head(x, y, ang) { drawMagic('fire_arrow', x, y, ang, r.w * .9); },
        trail(x, y, vx, vy) { part({ kind: 'fire', x, y, vx: -vx * .045, vy: -vy * .045, size: r.w * .045, grow: -4, life: .28, alpha: .7 }); },
        onHit(x, y, miss) {
            if (miss) { sayDamage(tid, out, 0); knock(tid, 'dodge', 1); return; }
            if (out === 'block' || out === 'parry') { shieldPop(tid, x, y, r.h * .5); sayDamage(tid, out, 0); return; }
            SFX.play('fireball_boom'); addEdgeFire(tid); paperImpact(tid,true,(x-r.x)/r.w,(y-r.y)/r.h); const dmg = dmgFor(out); hurt(tid, dmg); sayDamage(tid, out, dmg);
            flashDecal(tid, 'rgb(255,120,55)', 150, .18); knock(tid, 'shake', .5);
        }
    });
}, { towardId: tid });

FX.frost = tid => { const c = cards[tid];
    if (c.ice) { c.ice.thaw = c.ice.age; SFX.play('thaw'); }
    else { addIce(tid, 0); SFX.play('frozen'); }
    syncFrostBtn();
};
syncFrostBtn = function() {
    const c = cards[targetId], on = !!(c && c.ice && c.ice.thaw === null);
    $('frostBtn').classList.toggle('on', on); $('frostBtn').textContent = on ? '🧊 Оттаять' : '🧊 Обледенение';
};

const bardSoundWave = FX.bard;
FX.bard = (tid, out = outcome()) => {
    const key = $('instrument').value, im = IMG[key], life = 1.1;
    objs.push({ meta: { instrument: key, horizontal:true }, update() {
        const t = this.age; if (t > life) return false; const r = R(labActor('h_bar'));
        const pose=weaponPoseFor(),hh=pose.height,ww=pose.width;
        const strum = t > .25 ? Math.sin((t - .25) * 18) * Math.exp(-(t - .25) * 6) * .15 : 0;
        ctx.globalAlpha = smooth(t / .13) * smooth((life - t) / .24); ctx.translate(pose.cx,pose.cy);ctx.rotate(pose.angle+strum*.6);
        ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 8;
        if (loaded(im)) ctx.drawImage(im, -ww * .5, -hh * .53, ww, hh);
        return true;
    }});
    after(270, () => bardSoundWave(tid, out));
};

let drawHood;

FX.heroPotion = () => FX.potion(healId);
FX.heroStrike = () => FX.strike(healId, outcome(), gear());
FX.heroFireball = () => FX.fireball(healId, outcome());
FX.heroIce = () => FX.ice(healId, outcome());
NOTARGET.add('heroPotion'); NOTARGET.add('heroStrike'); NOTARGET.add('heroFireball'); NOTARGET.add('heroIce');

FX.demo = () => {
    FX.clear(); $('demo').classList.add('on');
    const sequence = [
        ['strike', 'hit', { kind: 'sword', grip: 'dual' }, 2],
        ['strike', 'block', { kind: 'axe', grip: 'two' }, 2],
        ['strike', 'parry', { kind: 'sword', grip: 'one' }, 2],
        ['sweep', 'hit', { kind: 'axe', grip: 'one' }, 2.5],
        ['bard', 'hit', null, 2.5], ['potion', 'hit', null, 2],
        ['ice', 'hit', null, 7], ['fireball', 'hit', null, 10],
        ['fire', 'hit', null, 5], ['shadow', 'hit', null, 4],
        ['strike', 'crit', { kind: 'sword', grip: 'two' }, 5],
        ['heal', 'hit', null, 4.5], ['royalHeal', 'hit', null, 5.8], ['revive', 'hit', null, 6.4]
    ];
    let ms = 0;
    for (const [key, out, gear, seconds] of sequence) { after(ms, () => run(key, 'e3', out, gear)); ms += seconds * 1000; }
    after(27000,nextLabTurn);after(30000,nextLabTurn);
    after(ms, () => $('demo').classList.remove('on'));
};

const CUT_SPRITES = {
    cuts: [[280,16,201,692],[1042,101,76,534],[1672,202,266,343]]
};
let labTurn = 1;
const iceStages = [];

function atlasDraw(x, image, source, px, py, width, height) {
    if (loaded(image)) x.drawImage(image, ...source, px, py, width, height);
}

function updateTurnLabels() {
    $('turnNumber').textContent = 'Ход ' + labTurn;
    for (const c of Object.values(cards)) {
        if (!c.burnLabel) continue;
        const f = c.cardFire;
        c.burnLabel.style.display = f ? 'block' : 'none';
        c.burnLabel.textContent = f ? (f.turns ? '🔥 ' + f.turns + (f.turns === 1 ? ' ход' : ' хода') : 'Тухнет') : '';
    }
}
let nextLabTurn;

let igniteCard;
let fireballImpact;

function prepareIceStages() {
    if (iceStages.length || !loaded(IMG.ice_crust)) return;
    for (const growth of [.28, .52, .77, 1]) {
        const cv = document.createElement('canvas'); cv.width = 768; cv.height = 512;
        const g = cv.getContext('2d'); g.drawImage(IMG.ice_crust, 0, 0, cv.width, cv.height);
        if (growth < 1) {
            g.globalCompositeOperation = 'destination-in'; g.beginPath();
            g.moveTo(0, cv.height);
            for (let i = 0; i <= 80; i++) {
                const u = i / 80, edge = Math.pow(Math.abs(2 * u - 1), 1.45);
                const jag = (.018 * Math.sin(i * 1.7) + .008 * Math.cos(i * 3.3)) * (1 - growth);
                const front = .89 - growth * (.24 + .92 * edge) + jag;
                g.lineTo(u * cv.width, front * cv.height);
            }
            g.lineTo(cv.width, cv.height); g.closePath(); g.fill();
        }
        iceStages.push(cv);
    }
}

let drawCardBurn;

drawStatuses = function(dt) {
    prepareIceStages();
    for(const [id,c] of Object.entries(cards)) {
        const w=c.el.offsetWidth,h=c.el.offsetHeight,x=c.overlayCtx;
        x.setTransform(DPR,0,0,DPR,0,0);x.clearRect(0,0,c.overlay.width/DPR,c.overlay.height/DPR);x.translate(w*.25,h*.42);
        c.burns.forEach(d=>d.age+=dt);c.burns=c.burns.filter(d=>d.age<d.life);
        applyCardMask(c,w,h);
        if(w>0&&h>0)drawCardBurn(x,c,id,w,h,dt);
        const ice=c.ice;
        if(ice) {
            ice.age+=dt;
            const remaining=ice.life?ice.life-ice.age:Infinity;
            const a=ice.thaw!==null?1-smooth((ice.age-ice.thaw)/.85):ice.life?smooth(remaining/1.05):1;
            if(a<=0&&ice.age>.5){c.ice=null;syncFrostBtn();}
            else {
                const stage=Math.min(3,ice.age/.72*3),i=Math.floor(stage),mix=smooth(stage-i);
                ice.stage=i+1;
                x.save();x.globalAlpha=a;
                // All four growth stages share an identical card-space anchor.
                if(iceStages[i])x.drawImage(iceStages[i],-w*.105,h*.63,w*1.21,h*.47);
                if(i<3&&iceStages[i+1]){x.globalAlpha=a*mix;x.drawImage(iceStages[i+1],-w*.105,h*.63,w*1.21,h*.47);}
                x.restore();
                ice.mist+=dt*a;
                while(ice.mist>.07){ice.mist-=.07;const q=R(id),u=Math.random(),edge=Math.pow(Math.abs(u-.5)*2,2);
                    part({kind:'mist',owner:id,x:q.x+w*u,y:q.y+h*(.985-edge*.24),vx:rnd(-w*.06,w*.06),vy:-h*rnd(.025,.055),
                        size:w*rnd(.04,.07),grow:w*.045,life:Math.min(1.5,remaining),alpha:.24*a,ph:rnd(0,6.3)});}
            }
        }
        if(c.hoodCanvas){
            const b=c.hoodCtx;b.setTransform(DPR,0,0,DPR,0,0);b.clearRect(0,0,c.hoodCanvas.width/DPR,c.hoodCanvas.height/DPR);
            if(c.hood){c.hood.age+=dt;if(c.hood.age>=c.hood.life)c.hood=null;}
            if(c.rogueMist){c.rogueMist.age+=dt;if(c.rogueMist.age>=c.rogueMist.life||c.rogueMist.sequence!==rogueSequence)c.rogueMist=null;}
            if(c.rogueMist){b.save();b.translate(w*.25,h*.7);drawRogueMist(b,w,h,c.rogueMist);b.restore();}
            if(c.hood){b.translate(w*.25,h*.7);drawHood(b,w,h,c.hood.age,c.hood.life);}
            c.hoodCanvas.style.visibility=c.hood||c.rogueMist?'visible':'hidden';
        }
        const hasArt=!!(c.burns.length||c.cardFire||c.edgeFire||c.ice||c.impactScorches?.length);
        if(!hasArt&&c.overlayHadArt)c.overlay.width=c.overlay.width;
        c.overlay.style.visibility=hasArt?'visible':'hidden';c.overlayHadArt=hasArt;
    }
};

let drawTexturedCut;

function cutDrips(x,w,h,px,py,a,alpha,amount=1){
    x.save();x.globalAlpha=alpha;x.lineCap='round';
    for(let k=0;k<3;k++){
        const xx=(px+(k-1)*.023)*w,yy=(py-k*.024)*h;
        const len=h*(.085+.033*k)*smooth((a-k*.2)/1.65)*amount;
        if(len<=0)continue;
        x.strokeStyle='#680b13';x.lineWidth=w*(.006+k*.0015)*amount;x.beginPath();x.moveTo(xx,yy);
        x.quadraticCurveTo(xx+w*.008,yy+len*.45,xx+w*.006,yy+len);x.stroke();
        x.fillStyle='#89101a';x.beginPath();x.ellipse(xx+w*.006,yy+len,w*.0045*amount,w*.008*amount,0,0,Math.PI*2);x.fill();
    }x.restore();
}
const embeddedWeaponPrototype=criticalCut;
criticalCut=function(tid,weapon=ARMS.sword1[0],side=1,life=4.3){
    const c=cards[tid],before=new Set(c.decals);embeddedWeaponPrototype(tid,weapon,side,life);
    const d=c.decals.find(d=>d.criticalCut&&!before.has(d));
    if(d)d.draw=function(x,w,h,a){
        const alpha=smooth((life-a)/.65);
        drawTexturedCut(x,w,h,.47,-.005,.52,.44,weapon.key==='dagger',alpha,smooth(a/.18));
        cutDrips(x,w,h,.52,.44,a,alpha,1);
    };
};

const arrowDefenseHit=arrowHit;
arrowHit=function(tid,out,gx,gy,ang,len){
    if(out!=='hit'&&out!=='crit'){arrowDefenseHit(tid,out,gx,gy,ang,len);return;}
    const r=R(tid),ex=(gx-r.x)/r.w,ey=(gy-r.y)/r.h,crit=out==='crit',life=3.1,dmg=dmgFor(out);
    SFX.play('arrow_hit');if(crit)SFX.play('crit');
    decal(tid,{life,arrowPuncture:true,draw(x,w,h,a){
        const alpha=smooth((life-a)/.65),size=w*(crit?.17:.135)*.75;
        x.save();x.globalAlpha=alpha;x.translate(ex*w,ey*h);x.rotate(ang-.3);
        atlasDraw(x,IMG.cuts_atlas,CUT_SPRITES.cuts[2],-size*.52,-size*.5,size,size*1.18);x.restore();
        cutDrips(x,w,h,ex,ey+.024,a,alpha,.85);
    }});
    objs.push({meta:{embeddedArrow:true,target:tid,penetration:0},update(){
        const a=this.age;if(a>life)return false;
        const q=R(tid),depth=q.w*.125*smooth(a/.16),wob=Math.sin(a*43)*.035*Math.exp(-a*6);
        this.meta.penetration=depth;this.meta.entry={x:q.x+ex*q.w,y:q.y+ey*q.h};
        ctx.translate(q.x+ex*q.w,q.y+ey*q.h);ctx.rotate(ang+wob);
        // Entry lies at local x=0. Everything beyond it is inside the card.
        ctx.beginPath();ctx.rect(-len-100,-50,len+100,100);ctx.clip();ctx.translate(-16+depth,0);
        drawArrow(len,smooth((life-a)/.5));return true;
    }});
    bloodBurst(tid,gx,gy,Math.cos(ang),Math.sin(ang),crit?1.3:.6,false);
    knock(tid,'shake',crit?1.3:.7);if(crit){hitstopFor(90);vignette=.8;shake(10);}else shake(3);
    hurt(tid,dmg);sayDamage(tid,out,dmg);
};

stabHit=function(tid,out,gx,gy,side,n=0){
    const r=R(tid),px=(gx-r.x)/r.w,py=(gy-r.y)/r.h;
    if(out==='hit'||out==='crit'){
        SFX.play('dagger_hit');
        if(!n){
            slashDecal(tid,px-side*.04,py-.036,px+side*.04,py+.036,2.5,3);
            decal(tid,{life:3,draw(x,w,h,a){cutDrips(x,w,h,px,py+.025,a,smooth((3-a)/.7),.8);}});
            const dmg=dmgFor(out);hurt(tid,dmg);sayDamage(tid,out,dmg);
        }
        bloodBurst(tid,gx,gy,-side,.2,.2,false);knock(tid,'side',-side*.45);
    }else if(!n){
        if(out==='miss')knock(tid,'dodge',side);
        else if(out==='block')shieldPop(tid,gx,gy,r.h*.5);
        else parryBlade(tid,{x:gx,y:gy},side*Math.PI/2,side);
        SFX.play(out==='miss'?'miss':out==='block'?'shield_block':'parry');sayDamage(tid,out,0);
    }
};



const CRITICAL_ROWS = [[460,569,24],[461,568,27],[461,569,30],[461,569,33],[462,567,36],[462,567,39],[463,566,42],[464,566,45],[464,565,48],[464,563,51],[465,562,54],[466,561,57],[467,560,60],[468,559,63],[469,559,66],[470,558,69],[470,557,72],[473,555,75],[473,554,78],[474,553,81],[476,550,84],[477,549,87],[479,549,90],[480,548,93],[481,548,96],[482,547,99],[484,547,102],[485,547,105],[486,548,108],[486,547,111],[487,546,114],[488,545,117],[488,545,120],[488,544,123],[488,543,126],[488,544,129],[488,545,132],[488,546,135],[488,548,138],[488,549,141],[488,550,144],[490,551,147],[490,552,150],[491,552,153],[492,551,156],[492,552,159],[492,552,162],[492,552,165],[492,551,168],[493,550,171],[494,550,174],[494,549,177],[495,548,180],[495,547,183],[495,548,186],[496,548,189],[496,546,192],[497,545,195],[497,546,198],[497,545,201],[497,544,204],[497,544,207],[498,544,210],[498,543,213],[498,543,216],[499,543,219],[500,543,222],[499,543,225],[499,543,228],[500,543,231],[500,543,234],[500,543,237],[500,544,240],[501,544,243],[501,543,246],[502,543,249],[502,544,252],[503,544,255],[504,544,258],[505,544,261],[505,544,264],[506,544,267],[506,544,270],[507,544,273],[507,544,276],[506,544,279],[508,544,282],[508,544,285],[508,544,288],[508,544,291],[508,544,294],[507,544,297],[508,544,300],[508,543,303],[508,543,306],[508,543,309],[508,543,312],[509,543,315],[510,543,318],[510,542,321],[511,542,324],[511,542,327],[510,542,330],[510,543,333],[510,543,336],[510,543,339],[509,542,342],[509,542,345],[510,542,348],[510,542,351],[510,542,354],[511,541,357],[511,541,360],[511,541,363],[511,540,366],[511,540,369],[511,539,372],[511,538,375],[511,537,378],[512,537,381],[512,537,384],[512,537,387],[513,538,390],[513,537,393],[514,537,396],[515,537,399],[514,537,402],[514,536,405],[514,535,408],[515,534,411],[514,534,414],[513,534,417],[513,533,420],[514,533,423],[513,533,426],[513,533,429],[513,534,432],[514,534,435],[514,535,438],[514,535,441],[514,536,444],[514,536,447],[514,536,450],[515,537,453],[515,537,456],[514,537,459],[514,537,462],[514,537,465],[514,537,468],[515,536,471],[514,535,474],[515,535,477],[515,535,480],[516,535,483],[516,535,486],[516,534,489],[517,535,492],[516,535,495],[516,535,498],[517,535,501],[518,535,504],[518,535,507],[517,535,510],[518,534,513],[518,533,516],[518,534,519],[519,533,522],[520,533,525],[520,532,528],[520,532,531],[521,532,534],[522,532,537],[522,532,540],[523,531,543],[523,531,546],[524,530,549],[524,529,552],[524,528,555],[524,528,558],[524,528,561],[524,528,564],[524,528,567],[525,528,570],[526,528,573],[526,528,576],[526,526,591]];

let cutContext = null, rogueSequence = 0;

// The raster never sways or changes shape. Additive light changes its hot pixels
// most strongly; nearly black char stays dark. No individual flame tongues.
function fixedBurnTexture(x, im, px, py, w, h, alpha, seed = 0, hot = 0) {
    if (!loaded(im) || alpha <= 0) return;
    const wave = .5 + .5 * Math.sin(clock / 1000 * 3.1 + seed);
    x.save(); x.globalAlpha *= alpha;
    x.drawImage(im, px, py, w, h);
    x.globalCompositeOperation = 'lighter';
    x.globalAlpha *= .055 + .12 * wave + hot;
    x.filter = `hue-rotate(${-18 + 19 * wave}deg) saturate(1.35) brightness(1.15)`;
    x.drawImage(im, px, py, w, h);
    x.restore();
}
function tracePolygon(x, points) {
    points.forEach((p,i) => i ? x.lineTo(p[0],p[1]) : x.moveTo(p[0],p[1])); x.closePath();
}
let tearTransform;
let tearPoint;
let tearPolygon;

let clearOpenings;
let drawWeaponTear;
const embeddedPreviewWithCut=criticalCut;

FX.stuck = tid => {
    cards[tid].cutUntil=0;
    SFX.play('sword_stuck');embeddedPreviewWithCut(tid,armsFor(gear())[0]);knock(tid,'jolt',.7);
};

const drawCardStatuses=drawStatuses;

drawTexturedCut=function(x,w,h,x1,y1,x2,y2,thin,alpha=1,progress=1){
    const ax=x1*w,ay=y1*h,dx=(x2-x1)*w,dy=(y2-y1)*h,len=Math.hypot(dx,dy);
    const width=(thin?w*.032:Math.min(w*.105,len/.75*.2))*.75;
    x.save();x.globalAlpha=alpha;x.translate(ax,ay);x.rotate(Math.atan2(dy,dx)-Math.PI/2);
    x.beginPath();x.rect(-width,0,width*2,len*progress);x.clip();
    atlasDraw(x,IMG.cuts_atlas,CUT_SPRITES.cuts[thin?1:0],-width/2,0,width,len);x.restore();
};
slashDecal=function(id,x1,y1,x2,y2,width=5,life=3.2){
    if(cutContext?.critical)return;
    const mx=cutContext?.x??(x1+x2)/2,my=cutContext?.y??(y1+y2)/2,dx=(x2-x1)*.75/2,dy=(y2-y1)*.75/2;
    return decal(id,{life,texturedCut:true,thin:width<=3,center:[mx,my],scale:.75,endpoints:[mx-dx,my-dy,mx+dx,my+dy],draw(x,w,h,a){
        drawTexturedCut(x,w,h,...this.endpoints,this.thin,smooth((life-a)/.75),smooth(a/.09));
    }});
};

FX.strike=function(tid,out=outcome(),g=gear()){
    const arms=armsFor(g),dual=arms.length>1;
    arms.forEach((w,i)=>after(i*170,()=>strikeOne(tid,out,{...w,cutX:dual?(i?.57:.43):.5},i?'right':'left',g.grip==='two',i)));
};
const baseStrikeGeometry=strikeGeom;
strikeGeom=function(r,w,side,two){
    const g=baseStrikeGeometry(r,w,side,two);
    if(w.cutX!=null)g.pivot.x+=(w.cutX-(side==='left'?.29:.71))*r.w;
    return g;
};
impactBlade=function(tid,out,tip,r,w,two,n,spin){
    cutContext={x:w.cutX??.5,y:.5,critical:out==='crit'};
    try{normalBladeImpact(tid,out,tip,r,w,two,n,spin);}finally{cutContext=null;}
    if(out==='crit')criticalCut(tid,w,spin);
};

drawHood=function(x,w,h,age,life){
    if(!loaded(IMG.assassin_hood))return;
    x.save();x.globalAlpha=smooth(age/.72)*smooth((life-age)/.55);
    x.drawImage(IMG.assassin_hood,w*.06,-h*.30,w*.88,w*.88);x.restore();
};
function shadowCloud(tid,delay,life,sequence,vanishing=false){
    after(delay*1000,()=>{
        if(sequence!==rogueSequence)return;
        const knots=Array.from({length:24},(_,i)=>({x:.05+(i%4)*.3,y:-.08+Math.floor(i/4)*.20,phase:i*2.37,size:.34+(i%3)*.05}));
        objs.push({meta:{shadowFog:true,target:tid,vanishing},emit:0,update(dt){
            if(sequence!==rogueSequence||this.age>=life)return false;
            const a=this.age,q=R(tid);
            // Dense arrival becomes a thin surrounding veil before the stab.
            const reveal=vanishing?1:1-.87*smooth((a-.55)/.85);
            const alpha=smooth(a/.36)*(1-smooth((a-life+.85)/.85))*reveal;
            ctx.save();ctx.globalAlpha=alpha;
            for(const k of knots){
                const s=q.w*k.size*(1+.13*Math.sin(a*2+k.phase));
                const px=q.x+q.w*(k.x+.06*Math.sin(a*1.8+k.phase)),py=q.y+q.h*(k.y+.03*Math.cos(a*2+k.phase));
                ctx.drawImage(shadowSprite,px-s,py-s,s*2,s*2);
            }
            ctx.restore();
            this.emit+=dt*alpha;
            while(this.emit>.035){this.emit-=.035;
                part({kind:'shadow',owner:tid,x:q.x+rnd(-.06,1.06)*q.w,y:q.y+rnd(-.16,1)*q.h,
                    vx:rnd(-q.w*.1,q.w*.1),vy:-q.h*rnd(.03,.12),size:q.w*rnd(.16,.26),grow:q.w*.1,life:.8,alpha:.65*alpha});
            }
            return true;
        }});
    });
}
FX.shadow=function(tid,out=outcome()){
    const actorId=labActor('h_rog'),sequence=++rogueSequence,rog=cards[actorId].el;
    for(const c of Object.values(cards))c.hood=null;
    SFX.play('shadow_out');rog.classList.remove('stealth');rog.style.filter='';
    shadowCloud(actorId,0,1.65,sequence,true);
    shadowCloud(tid,.55,2.55,sequence,false);
    objs.push({meta:{rogueDeparture:true,target:tid},update(){
        if(sequence!==rogueSequence)return false;
        const a=this.age;
        if(a<.22)rog.style.opacity=String(.28+.72*smooth(a/.22));
        else if(a<.78)rog.style.opacity=String(1-smooth((a-.22)/.56));
        else if(a<3.25)rog.style.opacity='0';
        else rog.style.opacity=String(.28*smooth((a-3.25)/.65));
        if(a>=3.9){rog.style.opacity='';rog.classList.add('stealth');return false;}
        return true;
    }});
    after(850,()=>{if(sequence===rogueSequence)cards[tid].hood={age:0,life:2.55};});
    // Reuse the approved close dagger motion; suppress only its old abrupt
    // hood/rogue state changes. Delay attack until the hood has emerged.
    after(1250,()=>{if(sequence!==rogueSequence)return;animateDagger(tid,out,sequence);});
};
function animateDagger(tid,out,sequence){
    const side=Math.random()<.5?-1:1,dir=-side,im=IMG.dagger,stabs=out==='crit'?2:1;
    objs.push({meta:{dagger:true,target:tid,side,closeStab:true},hits:0,update(){
        if(sequence!==rogueSequence)return false;
        const a=this.age,show=.30,cycle=.46,tail=.35,life=show+stabs*cycle+tail;if(a>life)return false;
        const q=R(tid),L=weaponPoseFor().height,iw=weaponPoseFor().width;
        const n=clamp(Math.floor((a-show)/cycle),0,stabs-1),t=clamp((a-show-n*cycle)/cycle,0,1);
        let p=t<.18?-.04*smooth(t/.18):t<.52?smooth((t-.18)/.34):t<.67?1:1-smooth((t-.67)/.33);
        if(a<show||a>show+stabs*cycle)p=0;
        const alpha=smooth(a/show)*smooth((life-a)/tail),edge=side<0?q.x:q.x+q.w;
        const tipDist=q.w*(.14+.39*p),entryDist=q.w*.44,ang=side<0?.10:Math.PI-.10;
        const entry={x:edge+dir*entryDist,y:q.y+(cards[tid].hero?.376:.526)*q.h};
        if(a>=show&&t>=.52&&this.hits<=n){this.hits=n+1;stabHit(tid,out,entry.x,entry.y,side,n);}
        ctx.save();ctx.globalAlpha=alpha;ctx.translate(entry.x,entry.y);ctx.rotate(ang);
        if(out==='hit'||out==='crit'){ctx.beginPath();ctx.rect(-q.w*2,-q.h,q.w*2,q.h*2);ctx.clip();}
        const stop=(out==='block'||out==='parry')?Math.min(tipDist,entryDist-.04*q.w):tipDist;
        ctx.translate(stop-entryDist-L*.86,0);ctx.rotate(Math.PI/2);
        ctx.shadowColor='rgba(0,0,0,.6)';ctx.shadowBlur=5;
        if(loaded(im))ctx.drawImage(im,-iw/2,-L*.86,iw,L);ctx.restore();
        this.meta.entry=entry;this.meta.tip={x:edge+dir*tipDist,y:entry.y};
        this.meta.originDistance=.14*q.w;this.meta.penetration=Math.max(0,tipDist-entryDist);return true;
    }});
}
const normalDaggerHit=stabHit;
stabHit=function(tid,out,gx,gy,side,n=0){
    if(out==='crit')cutContext={critical:true};
    try{normalDaggerHit(tid,out,gx,gy,side,n);}finally{cutContext=null;}
    if(out==='crit'&&!n){criticalCut(tid,{key:'dagger'},side,3.8);SFX.play('crit');}
};

FX.cry=function(){
    SFX.play('bandit_roar');label('h_war','ПРОВОКАЦИЯ','#ff4b3a',22);
    shoutWave('h_war',{col:[235,45,30],thick:true,targets:active.targets.map(t=>t.id)});
    flashDecal('h_war','rgb(255,40,20)',700,.45);
};

// Independent clocks: the hole is closed by 3 seconds; burning consumes turns.
holeScale=d=>smooth(d.age/.22)*(1+.025*smooth(d.age/.8))*(1-smooth((d.age-2.35)/.65));
igniteCard=function(tid){
    cards[tid].cardFire={age:0,turns:2,ending:null,smoke:0,embers:0};updateTurnLabels();
};
burnHole=function(tid,px=.5,py=.47,crit=false){
    const c=cards[tid];
    if(c.burns.length>=3)c.burns.shift();
    c.burns.push({age:0,life:3,x:px,y:py,size:(crit?1.05:.94)*.5,closeAt:2.35});
    igniteCard(tid);SFX.play('burn');
};
nextLabTurn=function(){
    labTurn++;
    for(const c of Object.values(cards)){
        const f=c.cardFire;if(f&&f.turns>0&&--f.turns===0)f.ending=f.age;
    }
    updateTurnLabels();
};

// The sprites retain the approved card-space composition, including the low
// center. Only their transparent margins are mapped; the effect never slides.

// Single, paired and two-handed axes use the same readable cut art as swords.
// The whirlwind already uses slashDecal; its movement and timing are unchanged.
crackDecal=function(id,px,py,life=3.5){
    if(cutContext?.critical)return;
    const cx=cutContext?.x??px,cy=cutContext?.y??py;
    const slant=cx>.5?-1:1;
    const d=slashDecal(id,cx-.035*slant,cy-.24,cx+.035*slant,cy+.24,7,life);
    if(d)d.axeCut=true;return d;
};

// Departure still hides the rogue's own card. Arrival mist is rendered only
// into the rear hood canvas, underneath the target's opaque surface.
const sourceShadowCloud=shadowCloud;
shadowCloud=function(tid,delay,life,sequence,vanishing=false){
    if(vanishing){sourceShadowCloud(tid,delay,life,sequence,true);return;}
    after(delay*1000,()=>{if(sequence===rogueSequence)cards[tid].rogueMist={age:0,life,sequence,behind:true};});
};
function drawRogueMist(x,w,h,f){
    const a=f.age,reveal=1-.53*smooth((a-.7)/1.1),alpha=smooth(a/.38)*smooth((f.life-a)/.85)*reveal;
    x.save();x.globalAlpha=alpha*.8;
    // Fog has volume behind the hood, above the top edge and close to the sides.
    // No foreground particles are emitted for the target.
    for(let i=0;i<18;i++){
        const col=i%6,row=Math.floor(i/6),ph=i*2.37;
        const px=w*(.04+col*.18+.04*Math.sin(a*1.7+ph));
        const py=h*(-.29+row*.18+.025*Math.cos(a*2+ph));
        const s=w*(.26+.035*(i%3))*(1+.09*Math.sin(a*2.1+ph));
        x.drawImage(shadowSprite,px-s,py-s,s*2,s*2);
    }
    x.restore();
}

function priestWeapon(){return $('priestWeapon')?.value==='staff'?'staff':'wand';}

// Fire renderer is defined once in fire-renderer.js.

function paperImpact(tid,small,px=.5,py=.47,crit=false){
    const c=cards[tid];
    if(!c.impactScorches)c.impactScorches=[];
    if(c.impactScorches.length>=6)c.impactScorches.shift();
    c.impactScorches.push({age:0,life:3,small,scale:small?.5:1.5,x:px,y:py,crit});
    objs.push({meta:{fireImpact:true,target:tid,crit,small,paper:true,duration:1.65},update(){
        if(this.age>=1.65)return false;
        const q=R(tid);ApprovedFire.prepare(IMG);
        ctx.save();ctx.translate(q.x,q.y);ApprovedFire.burst(ctx,q.w,q.h,this.age,small,px,py);ctx.restore();
        return true;
    }});
}
fireballImpact=function(tid,crit){paperImpact(tid,false,.5,.47,crit);};
addEdgeFire=function(tid){cards[tid].edgeFire={age:0,life:5,patches:2,bottom:true};};
drawCardBurn=function(x,c,id,w,h,dt){
    ApprovedFire.prepare(IMG);
    c.impactScorches=(c.impactScorches||[]).filter(d=>{d.age+=dt;return d.age<d.life;});
    for(const d of c.impactScorches)ApprovedFire.scorch(x,w,h,d);
    const f=c.cardFire;
    if(f){
        f.age+=dt;
        if(f.ending!=null&&f.age-f.ending>=1.25){c.cardFire=null;c.surface.style.filter='';updateTurnLabels();}
        else{
            const alpha=smooth(f.age/.22)*(f.ending==null?1:1-smooth((f.age-f.ending)/1.25));
            c.surface.style.filter='';
            ApprovedFire.burn(x,w,h,f.age,alpha,false,alpha,f.ending??Infinity);
        }
    }
    const e=c.edgeFire;
    if(e){
        e.age+=dt;
        if(e.age>=e.life)c.edgeFire=null;
        else{
            const alpha=smooth(e.age/.22)*(1-smooth((e.age-3.8)/1.2));
            ApprovedFire.burn(x,w,h,e.age,alpha,true,1-smooth((e.age-4.35)/.65),4.2);
        }
    }
    // Only the small corner patches sit above the name/HP strip. The main
    // fire retains the lab's original layer order, just like the preview.
    const corner=c.cornerCanvas,top=c.cornerCtx;
    if(corner&&top){
        top.setTransform(DPR,0,0,DPR,0,0);top.clearRect(0,0,corner.width/DPR,corner.height/DPR);top.translate(w*.25,h*.42);
        if(c.cardFire){const b=c.cardFire,a=smooth(b.age/.22)*(b.ending==null?1:1-smooth((b.age-b.ending)/1.25));ApprovedFire.corners(top,w,h,b.age,a,false);}
        if(c.edgeFire){const b=c.edgeFire,a=smooth(b.age/.22)*(1-smooth((b.age-3.8)/1.2));ApprovedFire.corners(top,w,h,b.age,a,true);}
        clearOpenings(top,c,w,h);corner.style.visibility=c.cardFire||c.edgeFire?'visible':'hidden';
    }
    clearOpenings(x,c,w,h);
    for(const d of c.burns){const s=holeScale(d),size=w*d.size*s;
        fixedBurnTexture(x,IMG.burn_rim,d.x*w-size/2,d.y*h-size/2,size,size,Math.min(1,s*5),3);
    }
};

// One source tear is registered in three orientations. Its alpha opening and
// narrow textured rim always use the same affine transform.
tearTransform=function(d,w,h){
    const fade=smooth((d.life-d.age)/.7),grow=smooth(d.age/.2);
    let sx=w/1024*.75*fade,sy=h*.46/(591-24)*grow;
    if(d.axis==='horizontal'){
        sx=h/1024*.48*fade;sy=w*.5/(591-24)*grow;
        return {a:0,b:-sx,c:sy,d:0,tx:-24*sy,ty:h*.5+525*sx,fade};
    }
    if(d.axis==='dagger'){
        sx=w/1024*.22*fade;sy=h*(.035+.13*(d.pull??0))/(591-24)*grow;
        return {a:sx,b:0,c:0,d:sy,tx:w*d.x-525*sx,ty:h*d.y-24*sy,fade};
    }
    return {a:sx,b:0,c:0,d:sy,tx:w*.5-525*sx,ty:-24*sy,fade};
};
tearPoint=function(p,t){return [p[0]*t.a+p[1]*t.c+t.tx,p[0]*t.b+p[1]*t.d+t.ty];};
tearPolygon=function(d,w,h){
    const t=tearTransform(d,w,h),left=CRITICAL_ROWS.map(p=>[p[0],p[2]]),right=CRITICAL_ROWS.map(p=>[p[1],p[2]]).reverse();
    if(d.axis!=='dagger'){left[0]=[left[0][0],-20];right[right.length-1]=[right[right.length-1][0],-20];}
    else{left[0]=[525,24];right[right.length-1]=[525,24];}
    return left.concat(right).map(p=>tearPoint(p,t));
};

criticalCut=function(tid,weapon=ARMS.sword1[0],side=1,life=4.3){
    const c=cards[tid];
    if(c.weaponCut&&c.weaponCut.age<.5&&c.weaponCut.axis===(weapon.tearAxis||'vertical'))return;
    c.weaponCut={age:0,life,weapon:weapon.key,axis:weapon.tearAxis||'vertical'};
    c.maskKey='';c.el.classList.add('ripped');
};

const sweepImpact=sweepHit;

// The boss's call travels in a band along its own row, left and right only.
FX.roar=function(){
    const id=active.actor,targets=active.targets.map(t=>t.id),r=R(id),duration=1.1;
    SFX.play('bandit_roar');label(id,'ЯРОСТЬ!','#ff4b3a',28);knock(id,'buzz',1.3);
    for(let n=0;n<3;n++)after(n*170,()=>objs.push({meta:{allyRoar:true,targets,directions:['left','right']},update(){
        const t=this.age/duration;if(t>=1)return false;
        const q=R(id),rad=25+W*.8*ease.out(t),y=q.y+q.h*.45,fade=1-t;
        ctx.save();ctx.beginPath();ctx.rect(0,q.y+q.h*.11,W,q.h*.68);ctx.clip();ctx.globalCompositeOperation='lighter';ctx.strokeStyle='#ef4530';
        for(const side of [-1,1]){
            ctx.beginPath();
            for(let k=0;k<=36;k++){const v=k/36*2-1,yy=v*q.h*.3,xx=side*(rad-Math.abs(v)**1.7*q.w*.16+3*Math.sin(v*12+t*24+n));
                k?ctx.lineTo(q.cx+xx,y+yy):ctx.moveTo(q.cx+xx,y+yy);}
            for(const[width,alpha]of [[22,.16],[8,.40],[2.1,.9]]){ctx.lineWidth=width*fade+1;ctx.globalAlpha=alpha*fade;ctx.stroke();}
        }ctx.restore();return true;
    }}));
    for(const target of targets){const q=R(target),d=Math.abs(q.cx-r.cx),p=clamp((d-25)/(W*.8),0,.99),due=(1-Math.sqrt(1-p))*duration;
        after(due*1000,()=>{knock(target,'buzz',.5);flashDecal(target,'rgb(255,65,30)',650,.30);});}
    
};

// Critical arrows retain only the outer quarter of their full visible length.
// Small scraps sample the struck portrait, so they read as torn clothing.
function arrowScraps(tid,gx,gy,ang){
    const r=R(tid),im=cards[tid].el.querySelector('img'),iw=im.naturalWidth,ih=im.naturalHeight;
    if(!iw||!ih)return;
    const cover=Math.max(r.w/iw,r.h/ih),ox=(iw*cover-r.w)/2,oy=(ih*cover-r.h)/2;
    const ex=clamp((gx-r.x+ox)/cover,0,iw-1),ey=clamp((gy-r.y+oy)/cover,0,ih-1);
    for(let k=0;k<7;k++){
        const size=r.w*(.027+(k%3)*.009),a=ang+(k-3)*.3,v=r.w*(.5+.14*(k%3)),life=.75+(k%3)*.13;
        objs.push({meta:{arrowScrap:true,target:tid},update(){
            const t=this.age;if(t>=life)return false;
            const px=gx+Math.cos(a)*v*t,py=gy+Math.sin(a)*v*t+r.h*.48*t*t;
            const s=size*(1-.3*t/life),source=s/cover;
            ctx.save();ctx.translate(px,py);ctx.rotate(k+t*(k%2?-7:9));ctx.globalAlpha=smooth((life-t)/.27);
            ctx.beginPath();ctx.moveTo(-s*.6,-s*.4);ctx.lineTo(s*.4,-s*.65);ctx.lineTo(s*.28,s*.05);ctx.lineTo(s*.5,s*.45);ctx.lineTo(-s*.45,s*.3);ctx.closePath();
            ctx.fillStyle='#63171b';ctx.fill();ctx.clip();ctx.drawImage(im,clamp(ex-source/2,0,iw-source),clamp(ey-source/2,0,ih-source),source,source,-s*.5,-s*.5,s,s);
            ctx.restore();return true;
        }});
    }
}
const normalArrowHit=arrowHit;
arrowHit=function(tid,out,gx,gy,ang,len,shotIndex=0){
    if(out!=='crit'){normalArrowHit(tid,out,gx,gy,ang,len);return;}
    const r=R(tid),ex=(gx-r.x)/r.w,ey=(gy-r.y)/r.h,life=3.1,dmg=dmgFor(out),total=len+16;
    SFX.play('arrow_hit');SFX.play('crit');
    decal(tid,{life,arrowPuncture:true,criticalArrow:true,draw(x,w,h,a){
        const alpha=smooth((life-a)/.65),size=w*.17*.75;
        x.save();x.globalAlpha=alpha;x.translate(ex*w,ey*h);x.rotate(ang-.3);
        atlasDraw(x,IMG.cuts_atlas,CUT_SPRITES.cuts[2],-size*.52,-size*.5,size,size*1.18);x.restore();
        cutDrips(x,w,h,ex,ey+.024,a,alpha,1.35);
    }});
    objs.push({meta:{embeddedArrow:true,critical:true,target:tid,penetration:0,fullLength:total},update(){
        const a=this.age;if(a>life)return false;
        const q=R(tid),scale=q.w/r.w,L=len*scale,depth=total*scale*.75*smooth(a/.19),wob=Math.sin(a*43)*.018*Math.exp(-a*7);
        this.meta.penetration=depth;this.meta.fraction=depth/(total*scale);this.meta.entry={x:q.x+ex*q.w,y:q.y+ey*q.h};
        ctx.translate(this.meta.entry.x,this.meta.entry.y);ctx.rotate(ang+wob);
        ctx.beginPath();ctx.rect(-L-100,-50,L+100,100);ctx.clip();ctx.translate(-16*scale+depth,0);
        ctx.scale(scale,scale);drawArrow(len,smooth((life-a)/.5));return true;
    }});
    bloodBurst(tid,gx,gy,Math.cos(ang),Math.sin(ang),2,false);arrowScraps(tid,gx,gy,ang);
    knock(tid,'shake',1.3);hitstopFor(90);vignette=.8;shake(10);hurt(tid,dmg);sayDamage(tid,out,dmg,shotIndex);
};

// Critical rogue: one close thrust, half the dagger inside, then a short pull
// downward. Normal stab, rear fog and the hood's gradual arrival stay intact.
const normalDaggerAnimation=animateDagger;
animateDagger=function(tid,out,sequence){
    if(out!=='crit'){normalDaggerAnimation(tid,out,sequence);return;}
    const side=Math.random()<.5?-1:1,dir=-side,im=IMG.dagger;
    objs.push({meta:{dagger:true,target:tid,side,closeStab:true,critical:true},hit:false,bleed:0,update(dt){
        if(sequence!==rogueSequence)return false;
        const a=this.age,show=.3,inEnd=.54,pullStart=.65,pullEnd=1.30,withdraw=1.55,life=1.9;
        if(a>=life)return false;
        const q=R(tid),L=weaponPoseFor().height,iw=weaponPoseFor().width,thrust=smooth((a-show)/(inEnd-show)),pull=smooth((a-pullStart)/(pullEnd-pullStart)),back=smooth((a-withdraw)/(life-withdraw));
        const ex=side<0?.44:.56,ey=cards[tid].hero?.376:.515,entry={x:q.x+ex*q.w,y:q.y+q.h*(ey+.13*pull)},depth=L*.5*thrust*(1-back);
        if(!this.hit&&a>=inEnd){
            this.hit=true;const c=cards[tid];c.weaponCut={age:0,life:3.8,weapon:'dagger',axis:'dagger',x:ex,y:ey,pull:0,sequence};c.maskKey='';c.el.classList.add('ripped');
            SFX.play('dagger_hit');SFX.play('crit');bloodBurst(tid,entry.x,entry.y,dir,.2,.65,false);
            const dmg=dmgFor(out);hurt(tid,dmg);sayDamage(tid,out,dmg);knock(tid,'side',dir*.6);hitstopFor(45);
        }
        const cut=cards[tid].weaponCut;if(cut?.axis==='dagger'&&cut.sequence===sequence)cut.pull=pull;
        if(a>pullStart&&a<pullEnd){this.bleed+=dt;while(this.bleed>.16){this.bleed-=.16;bloodBurst(tid,entry.x,entry.y,dir*.25,.9,.11,false);}}
        const alpha=smooth(a/.2)*smooth((life-a)/.24),tip=depth-q.w*.13*(1-thrust);
        ctx.save();ctx.globalAlpha=alpha;ctx.translate(entry.x,entry.y);ctx.rotate(side<0?0:Math.PI);
        ctx.beginPath();ctx.rect(-q.w*2,-q.h,q.w*2,q.h*2);ctx.clip();
        // Original tip is y=-.86L. After rotation its point is at local +tip.
        ctx.translate(tip-L*.86,0);ctx.rotate(Math.PI/2);ctx.shadowColor='rgba(0,0,0,.6)';ctx.shadowBlur=4;
        if(loaded(im))ctx.drawImage(im,-iw/2,-L*.86,iw,L);ctx.restore();
        this.meta.entry=entry;this.meta.penetration=depth;this.meta.fraction=depth/L;this.meta.pull=pull;this.meta.phase=a<inEnd?'thrust':a<pullEnd?'pull':'withdraw';
        return true;
    }});
};

'use strict';
/* ══════════════════════════════════════════════════════════════════════
   КАДР
   ══════════════════════════════════════════════════════════════════════ */


'use strict';
// Approved lower-edge fire, smoke and impact scorch; unchanged visuals.
const ApprovedFire = (()=>{
 let ctx,ready=false;
 const IMG={},TAU=Math.PI*2,card={w:228,h:342},showSmoke=true;
 const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
 const fullFirePeriod=3.6,REFERENCE_BURN_WIDTH=.19,PAPER_CROP=[252,151,778,904];
 const fract=x=>x-Math.floor(x),hash=x=>fract(Math.sin(x*127.1+71.7)*43758.5453123);
 function off(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
 let registered=[],arrowLeft,flameMix,flameCtx,glowSprite,smokeSprite,burstSprites=[];
 const cornerPatch=off(64,40),cornerCtx=cornerPatch.getContext('2d');
 function prepare(images){
  if(ready)return true;
  const names={a:'fire_a',b:'fire_b',c:'fire_c',arrow:'arrow_burn_clean',scorch:'impact_paper'};
  if(!Object.values(names).every(k=>loaded(images[k])))return false;
  for(const[k,v]of Object.entries(names))IMG[k]=images[v];
 // Match the common lower edge. The two generated phases landed 32px higher
 // in source space; registration happens at draw-time, without altering PNGs.
 registered=[IMG.a,IMG.b,IMG.c].map((im,i)=>{
  const c=off(290,440),x=c.getContext('2d'),ox=31,oy=56;
  const bottom=i?1226:1258,sy=card.h/(bottom-120),sx=card.w/790;
  x.drawImage(im,ox-119*sx,oy+card.h-bottom*sy,1024*sx,1536*sy);
  return c;
 });
 // The cleaned PNG has no baked gray smoke. Re-register its 32px-higher lip.
 arrowLeft=off(290,440);let x=arrowLeft.getContext('2d'),sx=card.w/871,sy=card.h/(1316-120);
 x.drawImage(IMG.arrow,31-78*sx,56+card.h-1316*sy,1024*sx,1536*sy);
 flameMix=off(290,440);flameCtx=flameMix.getContext('2d');
 glowSprite=off(128,128);x=glowSprite.getContext('2d');let g=x.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,207,97,.75)');g.addColorStop(.18,'rgba(255,122,28,.4)');g.addColorStop(.55,'rgba(240,65,8,.10)');g.addColorStop(1,'rgba(220,45,4,0)');x.fillStyle=g;x.fillRect(0,0,128,128);
 smokeSprite=off(128,128);x=smokeSprite.getContext('2d');
 for(let i=0;i<9;i++){const px=64+(hash(i+4)-.5)*43,py=64+(hash(i+11)-.5)*40,r=22+hash(i+17)*25;g=x.createRadialGradient(px,py,0,px,py,r);g.addColorStop(0,'rgba(148,143,137,.14)');g.addColorStop(.42,'rgba(108,107,107,.12)');g.addColorStop(1,'rgba(65,65,68,0)');x.fillStyle=g;x.fillRect(0,0,128,128);}
 burstSprites=[[204,1008,108,243],[315,1060,106,195],[609,1022,114,229]].map(([sx,sy,sw,sh])=>{
  const c=off(96,192),b=c.getContext('2d');b.drawImage(IMG.a,sx,sy,sw,sh,0,0,96,192);
  b.globalCompositeOperation='destination-in';let m=b.createLinearGradient(0,0,96,0);m.addColorStop(0,'transparent');m.addColorStop(.18,'#fff');m.addColorStop(.78,'#fff');m.addColorStop(1,'transparent');b.fillStyle=m;b.fillRect(0,0,96,192);
  m=b.createLinearGradient(0,0,0,192);m.addColorStop(0,'transparent');m.addColorStop(.1,'#fff');m.addColorStop(.67,'#fff');m.addColorStop(1,'transparent');b.fillStyle=m;b.fillRect(0,0,96,192);return c;
 });

 ready=true;return true;
 }
function blendFire(t,period){
 const f=((t/period)%1)*3,i=Math.floor(f),p=smooth(fract(f));
 flameCtx.clearRect(0,0,290,440);flameCtx.globalCompositeOperation='lighter';flameCtx.globalAlpha=1-p;flameCtx.drawImage(registered[i],0,0);flameCtx.globalAlpha=p;flameCtx.drawImage(registered[(i+1)%3],0,0);flameCtx.globalAlpha=1;flameCtx.globalCompositeOperation='source-over';
}
function fire(c,t,period,alpha=1,surge=0,small=false){
 if(alpha<=0)return;ctx.save();ctx.translate(c.x,c.y);ctx.globalAlpha=alpha;
 // Clip just outside the original card: no wide burned-paper silhouette.
 ctx.beginPath();ctx.rect(-10,-96,c.w+20,c.h+101);ctx.clip();
 const soot=ctx.createLinearGradient(0,c.h*.72,0,c.h);soot.addColorStop(0,'rgba(30,14,6,0)');soot.addColorStop(1,`rgba(30,14,6,${small?.19:.31})`);ctx.fillStyle=soot;ctx.fillRect(0,c.h*.72,c.w,c.h*.28);
 if(small){
  drawArrowCorner(t,alpha,false);drawArrowCorner(t+.19,alpha,true);
 }else{
  blendFire(t,period);
  // Slow tip motion and a restrained 6% impact swell share one fixed root.
  const stretch=1+.06*surge;ctx.translate(0,c.h);ctx.scale(1,stretch);ctx.translate(0,-c.h);
  for(let sy=155;sy<412;sy+=3){const anchor=clamp((397-sy)/235),wave=Math.sin(t*1.8+sy*.048)*.75*anchor;
   ctx.drawImage(flameMix,0,sy,290,3,-31+wave,sy-56,290,3);
  }
  // Freeze only the narrow charred bottom lip; the fire above stays animated.
  ctx.drawImage(registered[0],0,396,290,7,-31,340,290,7);
  ctx.globalCompositeOperation='lighter';ctx.globalAlpha=alpha*(.020+.012*(.5+.5*Math.sin(t*1.7))+.055*surge);ctx.drawImage(flameMix,-31,-56);
 }
 ctx.restore();
 // Local illumination follows the brightest lower parts; no large orange veil.
 ctx.save();ctx.globalCompositeOperation='lighter';
 const points=small?[[.1,.94],[.9,.94]]:[[.035,.81],[.22,.94],[.48,.965],[.72,.94],[.965,.80]];
 for(let i=0;i<points.length;i++){const [px,py]=points[i],sz=small?49:62;
  const illumination=small?.11+.055*Math.sin(t*9+i*1.73):.075+.016*Math.sin(t*1.6+i*1.73);
  ctx.globalAlpha=alpha*(illumination+surge*.09);ctx.drawImage(glowSprite,c.x+c.w*px-sz/2,c.y+c.h*py-sz/2,sz,sz);}
 ctx.restore();
}
function drawArrowCorner(t,alpha,mirror){
 ctx.save();if(mirror){ctx.translate(card.w,0);ctx.scale(-1,1);}ctx.globalAlpha=alpha;
 // Draw the approved small corner on both sides, with barely moving tips.
 for(let sy=285;sy<408;sy+=3){const a=clamp((396-sy)/115),dx=Math.sin(t*8+sy*.05)*a*.9;ctx.drawImage(arrowLeft,0,sy,290,3,-31+dx,sy-56,290,3);}
 ctx.globalCompositeOperation='lighter';ctx.globalAlpha=alpha*(.02+.065*(.5+.5*Math.sin(t*10)));ctx.drawImage(arrowLeft,-31,-56);ctx.restore();
}
function edgeOverlap(c,t,alpha,small){
 if(alpha<=0)return;
 // Reuse the approved lower flame lip to bridge the transparent U-shaped
 // corners. It is rendered over the border/name gradient, inside a small
 // corner footprint, so a bare bronze/card corner cannot show through.
 const w=small?50:64,h=small?28:40,source=small?arrowLeft:flameMix;
 cornerCtx.clearRect(0,0,64,40);cornerCtx.globalCompositeOperation='source-over';
 cornerCtx.drawImage(source,84,366,66,34,0,0,w,h);
 cornerCtx.globalCompositeOperation='destination-in';
 const fade=cornerCtx.createLinearGradient(0,0,w,0);fade.addColorStop(0,'transparent');fade.addColorStop(.12,'#fff');fade.addColorStop(.52,'#fff');fade.addColorStop(1,'transparent');cornerCtx.fillStyle=fade;cornerCtx.fillRect(0,0,64,40);
 const vertical=cornerCtx.createLinearGradient(0,0,0,h);vertical.addColorStop(0,'transparent');vertical.addColorStop(.32,'#fff');vertical.addColorStop(.94,'#fff');vertical.addColorStop(1,'transparent');cornerCtx.fillStyle=vertical;cornerCtx.fillRect(0,0,64,40);
 cornerCtx.globalCompositeOperation='source-over';
 for(const right of [false,true]){
  ctx.save();ctx.translate(c.x+(right?c.w:0),c.y);if(right)ctx.scale(-1,1);
  ctx.globalAlpha=alpha*.86;ctx.strokeStyle='#24160f';ctx.lineWidth=5;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();ctx.moveTo(0,c.h-20);ctx.lineTo(0,c.h-8);ctx.quadraticCurveTo(0,c.h,8,c.h);ctx.lineTo(29,c.h);ctx.stroke();
  ctx.globalAlpha=alpha*.86;ctx.drawImage(cornerPatch,-4,c.h-h*.91);
  ctx.globalCompositeOperation='lighter';ctx.globalAlpha=alpha*(.028+.012*Math.sin(t*(small?9:1.7)));ctx.drawImage(cornerPatch,-4,c.h-h*.91);ctx.restore();
 }
}
function smoke(c,t,alpha=1,small=false,started=-100,end=Infinity){
 if(!showSmoke||alpha<=0)return;
 // Slow the whole fireball smoke clock together: motion, growth, rotation,
 // emission and lifetime stay consistent. Arrow timing is unchanged.
 const flow=small?1:.45;t*=flow;started*=flow;end*=flow;
 const points=small?[[.12,.95],[.88,.95]]:[[.06,.78],[.23,.94],[.49,.965],[.74,.94],[.95,.79]];
 const period=small?.33:.23,life=small?1.65:2.7;
 for(let k=Math.floor(t/period)-Math.ceil(life/period);k<=Math.floor(t/period);k++){
  const born=k*period;if(born<started||born>end)continue;
  const age=t-born;if(age<0||age>=life)continue;
  const n=((k%points.length)+points.length)%points.length,[px,py]=points[n],p=age/life,seed=k+101;
  const drift=(hash(seed)-.5)*(small?22:39)+Math.sin(age*1.7+seed)*9;
  const x=c.x+c.w*px+drift*p,y=c.y+c.h*py-age*(small?34:57);
  const s=(small?31:42)+age*(small?13:24),a=smooth(age/.22)*(1-smooth((p-.35)/.65))*alpha*(small?.7:.84);
  ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(seed)*.7+age*.13);ctx.globalAlpha=a;ctx.drawImage(smokeSprite,-s/2,-s*.58,s,s*1.17);ctx.restore();
 }
}
function embers(c,t,alpha=1,small=false,started=-100,end=Infinity){
 const step=small?.29:.32,life=1.05;
 ctx.save();ctx.globalCompositeOperation='lighter';
 for(let k=Math.floor(t/step)-8;k<=Math.floor(t/step);k++){
  const born=k*step,age=t-born;if(born<started||born>end||age<0||age>life)continue;
  let px=hash(k+36);if(small)px=px>.5?.86+px*.08:px*.14;
  const x=c.x+c.w*px+(hash(k+9)-.5)*age*27,y=c.y+c.h*(.95-.11*Math.abs(px-.5)*2)-age*(30+hash(k+2)*46);
  ctx.globalAlpha=alpha*Math.pow(1-age/life,1.5)*.6;ctx.fillStyle=k%3?'#ff9936':'#ffd38c';ctx.beginPath();ctx.ellipse(x,y,.7,.9+hash(k)*.9,-.3,0,TAU);ctx.fill();
 }ctx.restore();
}
function scorch(c,age,small,sizeScale=small?.5:1.5,samePosition=false){
 if(age<0||age>=3)return;
 const a=smooth(age/.09)*(1-smooth((age-2.2)/.8)),cooling=1-.56*smooth((age-1.45)/1.3);
 // Measure the reference mark against the card width, independent of PNG
 // transparency. Both axes use exactly 0.5x / 1.5x from that same baseline.
 const w=c.w*REFERENCE_BURN_WIDTH*sizeScale,h=w*PAPER_CROP[3]/PAPER_CROP[2];
 const px=c.x+c.w*(c.hitX??.51),py=c.y+c.h*(c.hitY??(samePosition?.47:small?.57:.47));
 ctx.save();ctx.globalAlpha=a*.94;ctx.translate(px,py);ctx.filter=`brightness(${cooling})`;ctx.drawImage(IMG.scorch,...PAPER_CROP,-w/2,-h/2,w,h);
 ctx.globalCompositeOperation='lighter';ctx.filter='none';ctx.globalAlpha=a*cooling*(.035+.016*Math.sin(age*2.4));ctx.drawImage(IMG.scorch,...PAPER_CROP,-w/2,-h/2,w,h);ctx.restore();
 if(showSmoke)for(let i=0;i<3;i++){const p=fract(age*(small?.57:.25)+i/3),sz=w*(.38+p*.45);ctx.save();ctx.globalAlpha=a*(1-p)*.42;ctx.drawImage(smokeSprite,px+(i-1)*w*.075+Math.sin(p*4+i)*w*.04-sz/2,py-p*w*.8-sz/2,sz,sz);ctx.restore();}
}
function burst(c,age,small){
 if(age<0||age>1.65)return;
 const hitx=c.x+c.w*(c.hitX??.51),hity=c.y+c.h*(c.hitY??(small?.57:.47)),flash=1-smooth(age/.30),spread=1-Math.exp(-age*5.4),max=small?38:101;
 ctx.save();ctx.translate(hitx,hity);ctx.globalCompositeOperation='lighter';
 // A brief bright flash, followed by directed flame ribbons, not round dots.
 if(flash>0){const r=(small?40:93)*(1+age*1.4);ctx.globalAlpha=flash*.94;ctx.drawImage(glowSprite,-r,-r,r*2,r*2);const g=ctx.createRadialGradient(0,0,0,0,0,r*.48);g.addColorStop(0,'rgba(255,255,224,.92)');g.addColorStop(.27,'rgba(255,221,122,.67)');g.addColorStop(1,'rgba(255,174,40,0)');ctx.fillStyle=g;ctx.fillRect(-r,-r,r*2,r*2);}
 const n=small?7:12,fade=Math.pow(1-clamp(age/(small?.65:1.12)),1.25);
 for(let i=0;i<n;i++){
  const angle=i/n*TAU+(hash(i+3)-.5)*.55,dist=max*spread*(.55+hash(i+11)*.64),length=(small?28:64)*(1-clamp(age/1.25))*(.72+hash(i+5)*.54);
  ctx.save();ctx.rotate(angle);ctx.translate(dist*.7,0);ctx.rotate(Math.PI/2+Math.sin(age*6+i)*.13);ctx.globalAlpha=fade*(.68+hash(i)*.32);
  ctx.drawImage(burstSprites[i%3],-length*.32,-length*.72,length*.64,length);ctx.restore();
 }
 ctx.restore();
 if(showSmoke&&age>.09){for(let i=0;i<7;i++){const a=i/7*TAU,rr=44*spread,s=39+age*37;ctx.save();ctx.globalAlpha=Math.pow(1-clamp(age/1.65),1.5)*.38;ctx.drawImage(smokeSprite,hitx+Math.cos(a)*rr-s/2,hity+Math.sin(a)*rr*.7-age*25-s/2,s,s);ctx.restore();}}
}

 function local(context,w,h,fn){ctx=context;ctx.save();ctx.scale(w/card.w,h/card.h);fn({x:0,y:0,...card});ctx.restore();}
 return {
  prepare,
  burn(context,w,h,age,alpha,small,smokeAlpha=alpha,ending=Infinity){
   if(!ready)return;
   local(context,w,h,c=>{
    const surge=smooth(age/.09)*(1-smooth((age-.48)/1.85));
    fire(c,age,fullFirePeriod,alpha,surge,small);
    smoke(c,age,smokeAlpha,small,0,ending);
    embers(c,age,alpha,small,0,small?4.4:ending);
   });
  },
  corners(context,w,h,age,alpha,small){if(ready)local(context,w,h,c=>{if(!small)blendFire(age,fullFirePeriod);edgeOverlap(c,age,alpha,small);});},
  scorch(context,w,h,d){if(ready)local(context,w,h,c=>scorch({...c,hitX:d.x,hitY:d.y},d.age,d.small,d.scale));},
  burst(context,w,h,age,small,px,py){if(ready)local(context,w,h,c=>burst({...c,hitX:px,hitY:py},age,small));},
  get ready(){return ready;}
 };
})();

/* Opaque outer edges measured from the existing weapon textures.
   Normalized source coordinates, <= 0.3 source-pixel simplification.
   Separate specks are excluded; the image assets are unchanged. */
const WEAPON_CONTOURS={"sword_short":[[0.4942857,0.0138889],[0.4942857,0.0157407],[0.4828571,0.0194444],[0.4828571,0.0212963],[0.4714286,0.0268519],[0.4714286,0.0305556],[0.4657143,0.0324074],[0.4657143,0.0342593],[0.4542857,0.0398148],[0.4542857,0.0435185],[0.4485714,0.0453704],[0.4485714,0.0472222],[0.4428571,0.0490741],[0.4428571,0.0509259],[0.4314286,0.0564815],[0.4314286,0.0601852],[0.4257143,0.062037],[0.4257143,0.0657407],[0.4142857,0.0712963],[0.4142857,0.075],[0.4085714,0.0768519],[0.4085714,0.0805556],[0.4028571,0.0824074],[0.4028571,0.0861111],[0.3971429,0.087963],[0.3971429,0.0916667],[0.3914286,0.0935185],[0.3914286,0.0972222],[0.38,0.1027778],[0.38,0.1064815],[0.3742857,0.1083333],[0.3742857,0.112037],[0.3685714,0.1138889],[0.3685714,0.1194444],[0.3628571,0.1212963],[0.3628571,0.125],[0.3571429,0.1268519],[0.3571429,0.1287037],[0.3628571,0.1305556],[0.3628571,0.162037],[0.3685714,0.1638889],[0.3685714,0.2027778],[0.3742857,0.2046296],[0.3742857,0.3064815],[0.38,0.3083333],[0.38,0.3546296],[0.3742857,0.3564815],[0.3742857,0.3712963],[0.38,0.3731481],[0.38,0.437963],[0.3742857,0.4398148],[0.3742857,0.5194444],[0.3685714,0.5212963],[0.3685714,0.5546296],[0.3628571,0.5564815],[0.3628571,0.5731481],[0.3571429,0.575],[0.3571429,0.5824074],[0.3514286,0.5842593],[0.3514286,0.587963],[0.34,0.5935185],[0.34,0.5972222],[0.3285714,0.6027778],[0.3285714,0.6083333],[0.34,0.612037],[0.34,0.6138889],[0.3571429,0.6194444],[0.3571429,0.6212963],[0.3628571,0.6231481],[0.1057143,0.625],[0.0771429,0.6342593],[0.0771429,0.6361111],[0.0542857,0.6435185],[0.0542857,0.6453704],[0.0485714,0.6472222],[0.0485714,0.6490741],[0.0371429,0.6546296],[0.0371429,0.6583333],[0.0428571,0.6601852],[0.0428571,0.662037],[0.0542857,0.6675926],[0.0542857,0.6694444],[0.1114286,0.687963],[0.3685714,0.6898148],[0.3742857,0.6916667],[0.3742857,0.6935185],[0.3685714,0.6953704],[0.3685714,0.7046296],[0.38,0.7083333],[0.38,0.7101852],[0.3971429,0.7138889],[0.3971429,0.7157407],[0.4028571,0.7175926],[0.4028571,0.8546296],[0.3857143,0.8583333],[0.3857143,0.8601852],[0.38,0.862037],[0.38,0.8712963],[0.3857143,0.8731481],[0.3857143,0.8768519],[0.38,0.8787037],[0.38,0.8805556],[0.3514286,0.8898148],[0.3514286,0.8916667],[0.3457143,0.8935185],[0.3457143,0.8953704],[0.3342857,0.9009259],[0.3342857,0.9046296],[0.3228571,0.9101852],[0.3228571,0.9138889],[0.3171429,0.9157407],[0.3171429,0.9175926],[0.3228571,0.9194444],[0.3228571,0.9231481],[0.3285714,0.925],[0.3285714,0.9287037],[0.3342857,0.9305556],[0.3342857,0.9324074],[0.3457143,0.937963],[0.3457143,0.9398148],[0.3628571,0.9453704],[0.3628571,0.9472222],[0.4028571,0.9601852],[0.4028571,0.962037],[0.4371429,0.9731481],[0.4771429,0.9805556],[0.4942857,0.9861111],[0.5057143,0.9861111],[0.5228571,0.9805556],[0.5342857,0.9787037],[0.5457143,0.975],[0.5742857,0.9694444],[0.5914286,0.9638889],[0.5914286,0.962037],[0.6142857,0.9546296],[0.6142857,0.9527778],[0.6371429,0.9453704],[0.6371429,0.9435185],[0.6428571,0.9416667],[0.6428571,0.9398148],[0.6542857,0.9361111],[0.6542857,0.9342593],[0.66,0.9324074],[0.66,0.9287037],[0.6657143,0.9268519],[0.6657143,0.925],[0.6714286,0.9231481],[0.6714286,0.9194444],[0.6771429,0.9175926],[0.6771429,0.9138889],[0.6714286,0.912037],[0.6714286,0.9083333],[0.6657143,0.9064815],[0.6657143,0.9046296],[0.66,0.9027778],[0.66,0.9009259],[0.6485714,0.8953704],[0.6485714,0.8935185],[0.6371429,0.8898148],[0.6371429,0.887963],[0.6085714,0.8787037],[0.6085714,0.8731481],[0.6142857,0.8712963],[0.6142857,0.862037],[0.6085714,0.8601852],[0.6085714,0.8583333],[0.5971429,0.8546296],[0.5971429,0.7157407],[0.62,0.7083333],[0.62,0.7064815],[0.6257143,0.7046296],[0.6257143,0.6953704],[0.6142857,0.6916667],[0.62,0.6898148],[0.8885714,0.687963],[0.94,0.6712963],[0.94,0.6694444],[0.9514286,0.6657407],[0.9514286,0.6638889],[0.9628571,0.6583333],[0.9628571,0.6546296],[0.9571429,0.6527778],[0.9571429,0.6509259],[0.9514286,0.6490741],[0.9514286,0.6472222],[0.9342857,0.6416667],[0.9342857,0.6398148],[0.8942857,0.6268519],[0.6314286,0.625],[0.6314286,0.6231481],[0.6428571,0.6175926],[0.6428571,0.6157407],[0.66,0.6101852],[0.66,0.6083333],[0.6657143,0.6064815],[0.6657143,0.6009259],[0.66,0.5990741],[0.66,0.5972222],[0.6542857,0.5953704],[0.6542857,0.5935185],[0.6428571,0.587963],[0.6428571,0.5824074],[0.6371429,0.5805556],[0.6371429,0.5675926],[0.6314286,0.5657407],[0.6314286,0.5527778],[0.6257143,0.5509259],[0.6257143,0.512037],[0.62,0.5101852],[0.62,0.225],[0.6257143,0.2231481],[0.6257143,0.1824074],[0.6314286,0.1805556],[0.6314286,0.1453704],[0.6371429,0.1435185],[0.6371429,0.1231481],[0.6314286,0.1212963],[0.6314286,0.1175926],[0.6257143,0.1157407],[0.6257143,0.112037],[0.62,0.1101852],[0.62,0.1064815],[0.6142857,0.1046296],[0.6142857,0.1009259],[0.6085714,0.0990741],[0.6085714,0.0953704],[0.6028571,0.0935185],[0.6028571,0.0898148],[0.5971429,0.087963],[0.5971429,0.0824074],[0.5914286,0.0805556],[0.5914286,0.0768519],[0.5857143,0.075],[0.5857143,0.0731481],[0.58,0.0712963],[0.58,0.0675926],[0.5742857,0.0657407],[0.5742857,0.062037],[0.5685714,0.0601852],[0.5685714,0.0564815],[0.5628571,0.0546296],[0.5628571,0.0527778],[0.5571429,0.0509259],[0.5571429,0.0490741],[0.5457143,0.0435185],[0.5457143,0.0398148],[0.54,0.037963],[0.54,0.0361111],[0.5342857,0.0342593],[0.5342857,0.0324074],[0.5228571,0.0268519],[0.5228571,0.0231481],[0.5171429,0.0212963],[0.5171429,0.0194444],[0.5057143,0.0157407],[0.5057143,0.0138889]],"sword_skull":[[0.484127,0.0116438],[0.478836,0.0130137],[0.478836,0.0143836],[0.468254,0.0171233],[0.468254,0.0184932],[0.462963,0.019863],[0.462963,0.0212329],[0.457672,0.0226027],[0.457672,0.0239726],[0.452381,0.0253425],[0.452381,0.0267123],[0.4470899,0.0280822],[0.4470899,0.0294521],[0.4365079,0.0335616],[0.4365079,0.0349315],[0.4312169,0.0363014],[0.4312169,0.0390411],[0.4259259,0.040411],[0.4259259,0.0417808],[0.4206349,0.0431507],[0.4206349,0.0445205],[0.4153439,0.0458904],[0.4153439,0.0472603],[0.4100529,0.0486301],[0.4100529,0.05],[0.4047619,0.0513699],[0.4047619,0.0527397],[0.3941799,0.0568493],[0.3941799,0.0582192],[0.3888889,0.059589],[0.3888889,0.0623288],[0.3783069,0.0664384],[0.3783069,0.0691781],[0.3730159,0.0705479],[0.3730159,0.0719178],[0.3677249,0.0732877],[0.3677249,0.0746575],[0.3571429,0.0787671],[0.3571429,0.080137],[0.3518519,0.0815068],[0.3518519,0.0842466],[0.3465608,0.0856164],[0.3465608,0.0869863],[0.3412698,0.0883562],[0.3412698,0.089726],[0.3306878,0.0938356],[0.3306878,0.0965753],[0.3253968,0.0979452],[0.3253968,0.1171233],[0.3306878,0.1184932],[0.3306878,0.1417808],[0.3359788,0.1431507],[0.3359788,0.2869863],[0.3412698,0.2883562],[0.3412698,0.2993151],[0.3359788,0.3006849],[0.3359788,0.3089041],[0.3412698,0.310274],[0.2407407,0.3116438],[0.2037037,0.3212329],[0.2037037,0.3226027],[0.1931217,0.3253425],[0.1931217,0.3267123],[0.1825397,0.3308219],[0.1825397,0.3321918],[0.1719577,0.3349315],[0.1719577,0.3376712],[0.1666667,0.3390411],[0.1666667,0.3417808],[0.1613757,0.3431507],[0.1613757,0.3486301],[0.1560847,0.35],[0.1560847,0.3527397],[0.1402116,0.3541096],[0.1402116,0.3554795],[0.1296296,0.359589],[0.1296296,0.3664384],[0.1243386,0.3678082],[0.1243386,0.389726],[0.1296296,0.3910959],[0.1296296,0.3979452],[0.1349206,0.3993151],[0.1349206,0.4034247],[0.1402116,0.4047945],[0.1402116,0.4089041],[0.1455026,0.410274],[0.1455026,0.4130137],[0.1507937,0.4143836],[0.1507937,0.4184932],[0.1560847,0.419863],[0.1560847,0.4226027],[0.1613757,0.4239726],[0.1613757,0.4267123],[0.1084656,0.4280822],[0.1084656,0.4308219],[0.1031746,0.4321918],[0.1031746,0.4349315],[0.0978836,0.4363014],[0.0978836,0.4390411],[0.0925926,0.440411],[0.0925926,0.4417808],[0.0873016,0.4431507],[0.0873016,0.4458904],[0.0820106,0.4472603],[0.0820106,0.4527397],[0.0343915,0.4541096],[0.0343915,0.4691781],[0.0396825,0.4705479],[0.0396825,0.4746575],[0.0449735,0.4760274],[0.0449735,0.4787671],[0.0502646,0.480137],[0.0502646,0.4828767],[0.0555556,0.4842466],[0.0555556,0.4856164],[0.0608466,0.4869863],[0.0608466,0.4883562],[0.0714286,0.4910959],[0.0714286,0.4924658],[0.0873016,0.4965753],[0.0873016,0.4979452],[0.1031746,0.5020548],[0.1031746,0.5034247],[0.1243386,0.5089041],[0.1243386,0.510274],[0.1402116,0.5143836],[0.1402116,0.5157534],[0.1507937,0.519863],[0.1507937,0.5212329],[0.0978836,0.5226027],[0.1031746,0.5239726],[0.1031746,0.5280822],[0.1084656,0.5294521],[0.1084656,0.5308219],[0.1137566,0.5321918],[0.1137566,0.5335616],[0.1190476,0.5349315],[0.1190476,0.5363014],[0.1243386,0.5376712],[0.1243386,0.5390411],[0.1349206,0.5431507],[0.1349206,0.5445205],[0.1402116,0.5458904],[0.1402116,0.5472603],[0.1507937,0.55],[0.1507937,0.5513699],[0.1666667,0.5554795],[0.1666667,0.5568493],[0.1772487,0.559589],[0.1772487,0.5609589],[0.1878307,0.5650685],[0.1878307,0.5678082],[0.1931217,0.5691781],[0.1931217,0.5719178],[0.2037037,0.5760274],[0.2037037,0.5787671],[0.2089947,0.580137],[0.2089947,0.5828767],[0.2142857,0.5842466],[0.2142857,0.5910959],[0.2195767,0.5924658],[0.2195767,0.5965753],[0.2248677,0.5979452],[0.2248677,0.6020548],[0.2301587,0.6034247],[0.2301587,0.6075342],[0.2354497,0.6089041],[0.2354497,0.6130137],[0.2407407,0.6143836],[0.2407407,0.6171233],[0.2460317,0.6184932],[0.2460317,0.6212329],[0.2513228,0.6226027],[0.2513228,0.6253425],[0.2566138,0.6267123],[0.2566138,0.6308219],[0.2619048,0.6321918],[0.2619048,0.6349315],[0.2671958,0.6363014],[0.0925926,0.6376712],[0.0925926,0.6390411],[0.0767196,0.6431507],[0.0767196,0.6445205],[0.0661376,0.6472603],[0.0661376,0.6486301],[0.0608466,0.65],[0.0608466,0.6527397],[0.0555556,0.6541096],[0.0555556,0.6582192],[0.0502646,0.659589],[0.0502646,0.6678082],[0.0555556,0.6691781],[0.0555556,0.6732877],[0.0608466,0.6746575],[0.0608466,0.6773973],[0.0661376,0.6787671],[0.0661376,0.680137],[0.0767196,0.6842466],[0.0767196,0.6856164],[0.0978836,0.6910959],[0.2936508,0.6924658],[0.3253968,0.6979452],[0.3253968,0.6993151],[0.3201058,0.7006849],[0.3253968,0.7020548],[0.3253968,0.7034247],[0.3730159,0.710274],[0.3835979,0.7130137],[0.3835979,0.7157534],[0.3783069,0.7171233],[0.3783069,0.7226027],[0.3941799,0.7267123],[0.3941799,0.7335616],[0.3888889,0.7349315],[0.3888889,0.740411],[0.3941799,0.7417808],[0.3941799,0.7431507],[0.4100529,0.7472603],[0.4100529,0.7650685],[0.4153439,0.7664384],[0.4153439,0.8815068],[0.3888889,0.8883562],[0.3888889,0.8993151],[0.3994709,0.9020548],[0.3994709,0.9061644],[0.3941799,0.9075342],[0.3941799,0.9089041],[0.3835979,0.9130137],[0.3835979,0.9143836],[0.3730159,0.9171233],[0.3730159,0.9184932],[0.3465608,0.9253425],[0.3359788,0.9267123],[0.3095238,0.9335616],[0.3148148,0.9349315],[0.3148148,0.9363014],[0.3253968,0.9390411],[0.3253968,0.940411],[0.3465608,0.9458904],[0.3465608,0.9472603],[0.3783069,0.9554795],[0.3783069,0.9568493],[0.3941799,0.9609589],[0.4100529,0.9623288],[0.4153439,0.9636986],[0.4153439,0.9650685],[0.4259259,0.9678082],[0.4259259,0.9691781],[0.4312169,0.9705479],[0.4312169,0.9719178],[0.452381,0.9773973],[0.452381,0.9787671],[0.468254,0.9828767],[0.468254,0.9842466],[0.478836,0.9869863],[0.478836,0.9883562],[0.5,0.9883562],[0.505291,0.9869863],[0.505291,0.9856164],[0.521164,0.9815068],[0.521164,0.980137],[0.547619,0.9732877],[0.547619,0.9719178],[0.5582011,0.9691781],[0.5582011,0.9678082],[0.5687831,0.9650685],[0.5687831,0.9636986],[0.5740741,0.9623288],[0.5899471,0.9609589],[0.6005291,0.9582192],[0.6005291,0.9568493],[0.6322751,0.9486301],[0.6322751,0.9472603],[0.6481481,0.9431507],[0.6481481,0.9417808],[0.6587302,0.9390411],[0.6587302,0.9376712],[0.6693122,0.9349315],[0.6693122,0.9321918],[0.6587302,0.9294521],[0.6481481,0.9280822],[0.6428571,0.9267123],[0.6428571,0.9253425],[0.6058201,0.9157534],[0.6058201,0.9143836],[0.5952381,0.9116438],[0.5952381,0.910274],[0.5846561,0.9061644],[0.5846561,0.9020548],[0.5952381,0.8993151],[0.5952381,0.8979452],[0.6005291,0.8965753],[0.6005291,0.8910959],[0.5952381,0.889726],[0.5952381,0.8883562],[0.5740741,0.8828767],[0.5740741,0.8705479],[0.5687831,0.8691781],[0.5687831,0.8664384],[0.5740741,0.8650685],[0.5740741,0.859589],[0.5687831,0.8582192],[0.5687831,0.8431507],[0.5740741,0.8417808],[0.5740741,0.7636986],[0.5793651,0.7623288],[0.5793651,0.7472603],[0.6005291,0.7417808],[0.6005291,0.7363014],[0.5952381,0.7349315],[0.5952381,0.7294521],[0.5899471,0.7280822],[0.6058201,0.7239726],[0.6058201,0.7226027],[0.6111111,0.7212329],[0.6111111,0.7116438],[0.6322751,0.7089041],[0.6481481,0.7047945],[0.6587302,0.7034247],[0.6693122,0.7006849],[0.6693122,0.6979452],[0.6746032,0.6965753],[0.7063492,0.6924658],[0.9232804,0.6910959],[0.9232804,0.689726],[0.9391534,0.6856164],[0.9391534,0.6842466],[0.9497354,0.6815068],[0.9497354,0.680137],[0.9550265,0.6787671],[0.9550265,0.6760274],[0.9603175,0.6746575],[0.9603175,0.6705479],[0.9656085,0.6691781],[0.9656085,0.6650685],[0.9708995,0.6636986],[0.9708995,0.6609589],[0.9656085,0.659589],[0.9656085,0.6541096],[0.9603175,0.6527397],[0.9603175,0.65],[0.9550265,0.6486301],[0.9550265,0.6472603],[0.9444444,0.6445205],[0.9444444,0.6431507],[0.9179894,0.6363014],[0.7275132,0.6349315],[0.7275132,0.6335616],[0.7328042,0.6321918],[0.7328042,0.6280822],[0.7380952,0.6267123],[0.7380952,0.6239726],[0.7433862,0.6226027],[0.7433862,0.619863],[0.7486772,0.6184932],[0.7486772,0.6157534],[0.7539683,0.6143836],[0.7539683,0.6116438],[0.7592593,0.610274],[0.7592593,0.6061644],[0.7645503,0.6047945],[0.7645503,0.6020548],[0.7698413,0.6006849],[0.7698413,0.5993151],[0.7751323,0.5979452],[0.7751323,0.5952055],[0.7857143,0.5910959],[0.7857143,0.5869863],[0.7910053,0.5856164],[0.7910053,0.580137],[0.7962963,0.5787671],[0.7962963,0.5773973],[0.8015873,0.5760274],[0.8015873,0.5746575],[0.8068783,0.5732877],[0.8068783,0.5719178],[0.8121693,0.5705479],[0.8121693,0.5691781],[0.8174603,0.5678082],[0.8174603,0.5664384],[0.8280423,0.5623288],[0.8280423,0.5609589],[0.8333333,0.559589],[0.8333333,0.5568493],[0.8439153,0.5527397],[0.8439153,0.55],[0.8492063,0.5486301],[0.8492063,0.5445205],[0.8544974,0.5431507],[0.8544974,0.540411],[0.8597884,0.5390411],[0.8597884,0.5349315],[0.8650794,0.5335616],[0.8650794,0.5280822],[0.8703704,0.5267123],[0.8703704,0.5034247],[0.8650794,0.5020548],[0.8650794,0.5006849],[0.8227513,0.4993151],[0.8227513,0.4965753],[0.8280423,0.4952055],[0.8280423,0.4910959],[0.8333333,0.489726],[0.8333333,0.4869863],[0.8386243,0.4856164],[0.8386243,0.4815068],[0.8439153,0.480137],[0.8439153,0.4746575],[0.8492063,0.4732877],[0.8492063,0.4636986],[0.8544974,0.4623288],[0.8544974,0.4541096],[0.8492063,0.4527397],[0.8492063,0.4431507],[0.8439153,0.4417808],[0.8439153,0.4376712],[0.8386243,0.4363014],[0.8386243,0.4335616],[0.7962963,0.4321918],[0.7962963,0.4226027],[0.7910053,0.4212329],[0.7910053,0.4157534],[0.7857143,0.4143836],[0.7857143,0.4089041],[0.7804233,0.4075342],[0.7804233,0.4034247],[0.7751323,0.4020548],[0.7751323,0.3993151],[0.7645503,0.3952055],[0.7645503,0.3924658],[0.7592593,0.3910959],[0.7592593,0.3883562],[0.7539683,0.3869863],[0.7539683,0.3856164],[0.7486772,0.3842466],[0.7486772,0.3828767],[0.7380952,0.380137],[0.7380952,0.3787671],[0.7275132,0.3760274],[0.7275132,0.3746575],[0.6428571,0.3732877],[0.6428571,0.1335616],[0.6481481,0.1321918],[0.6481481,0.0952055],[0.6428571,0.0938356],[0.6428571,0.0910959],[0.6375661,0.089726],[0.6375661,0.0883562],[0.6322751,0.0869863],[0.6322751,0.0856164],[0.6216931,0.0815068],[0.6216931,0.0787671],[0.6164021,0.0773973],[0.6164021,0.0760274],[0.6058201,0.0719178],[0.6058201,0.0691781],[0.6005291,0.0678082],[0.6005291,0.0664384],[0.5952381,0.0650685],[0.5952381,0.0636986],[0.5899471,0.0623288],[0.5899471,0.0609589],[0.5846561,0.059589],[0.5846561,0.0582192],[0.5740741,0.0541096],[0.5740741,0.0527397],[0.5687831,0.0513699],[0.5687831,0.0486301],[0.5634921,0.0472603],[0.5634921,0.0458904],[0.5582011,0.0445205],[0.5582011,0.0431507],[0.547619,0.0390411],[0.547619,0.0376712],[0.542328,0.0363014],[0.542328,0.0335616],[0.537037,0.0321918],[0.537037,0.0308219],[0.531746,0.0294521],[0.531746,0.0280822],[0.521164,0.0239726],[0.521164,0.0226027],[0.510582,0.019863],[0.510582,0.0184932],[0.505291,0.0171233],[0.505291,0.0157534],[0.494709,0.0130137],[0.494709,0.0116438]],"sword_blue":[[0.5,0.0102459],[0.5,0.011612],[0.4828571,0.0157104],[0.4828571,0.0170765],[0.4771429,0.0184426],[0.4771429,0.0198087],[0.4657143,0.022541],[0.4657143,0.0239071],[0.4542857,0.0266393],[0.4542857,0.0280055],[0.4428571,0.0307377],[0.4428571,0.0321038],[0.4371429,0.0334699],[0.4371429,0.0348361],[0.4314286,0.0362022],[0.4314286,0.0375683],[0.4257143,0.0389344],[0.4257143,0.0403005],[0.42,0.0416667],[0.42,0.0430328],[0.4085714,0.0471311],[0.4085714,0.0484973],[0.4028571,0.0498634],[0.4028571,0.0512295],[0.3914286,0.0539617],[0.3914286,0.0553279],[0.3857143,0.056694],[0.3857143,0.0580601],[0.38,0.0594262],[0.38,0.0607923],[0.3742857,0.0621585],[0.3742857,0.0635246],[0.3685714,0.0648907],[0.3685714,0.0662568],[0.3628571,0.067623],[0.3628571,0.0689891],[0.3571429,0.0703552],[0.3571429,0.0717213],[0.3457143,0.0758197],[0.3457143,0.0771858],[0.34,0.0785519],[0.34,0.0812842],[0.3342857,0.0826503],[0.3342857,0.0840164],[0.3228571,0.0881148],[0.3228571,0.090847],[0.3171429,0.0922131],[0.3171429,0.125],[0.3228571,0.1263661],[0.3228571,0.2219945],[0.3285714,0.2233607],[0.3285714,0.4269126],[0.3228571,0.4282787],[0.3228571,0.601776],[0.3171429,0.6031421],[0.3171429,0.6195355],[0.3114286,0.6209016],[0.3114286,0.6263661],[0.3,0.6304645],[0.1,0.6318306],[0.0885714,0.6345628],[0.0885714,0.635929],[0.0714286,0.6400273],[0.0714286,0.6413934],[0.0657143,0.6427596],[0.0657143,0.6441257],[0.06,0.6454918],[0.06,0.6468579],[0.0485714,0.6509563],[0.0485714,0.6536885],[0.0428571,0.6550546],[0.0428571,0.6577869],[0.0371429,0.659153],[0.0371429,0.6673497],[0.0428571,0.6687158],[0.0428571,0.6714481],[0.0485714,0.6728142],[0.0485714,0.6755464],[0.0542857,0.6769126],[0.0542857,0.6782787],[0.06,0.6796448],[0.06,0.6810109],[0.0714286,0.6851093],[0.0714286,0.6864754],[0.1057143,0.6946721],[0.34,0.6960383],[0.34,0.6974044],[0.3342857,0.6987705],[0.3342857,0.7015027],[0.3571429,0.7069672],[0.3685714,0.7083333],[0.3857143,0.7124317],[0.3857143,0.7165301],[0.3742857,0.7206284],[0.3742857,0.7247268],[0.3857143,0.727459],[0.3857143,0.7288251],[0.3971429,0.7329235],[0.3971429,0.7438525],[0.4142857,0.7479508],[0.4142857,0.7520492],[0.42,0.7534153],[0.42,0.8025956],[0.4257143,0.8039617],[0.4257143,0.885929],[0.4085714,0.8900273],[0.4085714,0.8913934],[0.4028571,0.8927596],[0.4028571,0.9009563],[0.4142857,0.9023224],[0.4142857,0.909153],[0.4085714,0.9105191],[0.4085714,0.9118852],[0.4028571,0.9132514],[0.4028571,0.9146175],[0.3914286,0.9159836],[0.3514286,0.9255464],[0.3514286,0.9269126],[0.3228571,0.9337432],[0.3228571,0.9351093],[0.3285714,0.9364754],[0.3285714,0.9378415],[0.34,0.9405738],[0.34,0.9419399],[0.3457143,0.943306],[0.3457143,0.9446721],[0.3571429,0.9474044],[0.3571429,0.9487705],[0.38,0.954235],[0.38,0.9556011],[0.4028571,0.9610656],[0.4257143,0.9624317],[0.4257143,0.9637978],[0.4314286,0.9651639],[0.4314286,0.9665301],[0.4428571,0.9706284],[0.4428571,0.9719945],[0.4542857,0.9747268],[0.4542857,0.9760929],[0.4714286,0.9801913],[0.4714286,0.9815574],[0.4942857,0.9870219],[0.4942857,0.988388],[0.5,0.9897541],[0.5171429,0.9897541],[0.5342857,0.9856557],[0.5342857,0.9842896],[0.5514286,0.9801913],[0.5514286,0.9788251],[0.5628571,0.9760929],[0.5628571,0.9747268],[0.5742857,0.9719945],[0.5742857,0.9706284],[0.5857143,0.9678962],[0.5857143,0.9665301],[0.5971429,0.9637978],[0.6142857,0.9624317],[0.6257143,0.9596995],[0.6257143,0.9583333],[0.6485714,0.9528689],[0.6485714,0.9515027],[0.6657143,0.9474044],[0.6657143,0.9460383],[0.6885714,0.9405738],[0.6885714,0.9392077],[0.7,0.9364754],[0.7,0.9337432],[0.6828571,0.9310109],[0.66,0.9255464],[0.66,0.9241803],[0.62,0.9146175],[0.62,0.9132514],[0.6142857,0.9118852],[0.6142857,0.9077869],[0.6085714,0.9064208],[0.6085714,0.9036885],[0.62,0.9009563],[0.62,0.8927596],[0.5971429,0.8845628],[0.5971429,0.7848361],[0.6028571,0.7834699],[0.6028571,0.7547814],[0.6085714,0.7534153],[0.6085714,0.7465847],[0.62,0.7438525],[0.62,0.7424863],[0.6257143,0.7411202],[0.6257143,0.7315574],[0.6314286,0.7301913],[0.6314286,0.7288251],[0.6371429,0.727459],[0.6371429,0.7260929],[0.6485714,0.7233607],[0.6485714,0.7206284],[0.6371429,0.7165301],[0.6371429,0.7124317],[0.66,0.7069672],[0.6714286,0.7056011],[0.6885714,0.7015027],[0.6885714,0.7001366],[0.6828571,0.6987705],[0.6828571,0.6960383],[0.8942857,0.6946721],[0.9228571,0.6878415],[0.9228571,0.6864754],[0.9342857,0.6837432],[0.9342857,0.682377],[0.94,0.6810109],[0.94,0.6796448],[0.9514286,0.6755464],[0.9514286,0.6714481],[0.9571429,0.670082],[0.9571429,0.6564208],[0.9514286,0.6550546],[0.9514286,0.6523224],[0.9457143,0.6509563],[0.9457143,0.648224],[0.94,0.6468579],[0.94,0.6454918],[0.9285714,0.6427596],[0.9285714,0.6413934],[0.9171429,0.6386612],[0.9171429,0.6372951],[0.8942857,0.6318306],[0.7171429,0.6304645],[0.7114286,0.6290984],[0.7114286,0.6236339],[0.7057143,0.6222678],[0.7057143,0.6031421],[0.7,0.601776],[0.7,0.4255464],[0.6942857,0.4241803],[0.6942857,0.3831967],[0.7,0.3818306],[0.7,0.3599727],[0.6942857,0.3586066],[0.6942857,0.1618852],[0.7,0.1605191],[0.7,0.1154372],[0.7057143,0.114071],[0.7057143,0.0949454],[0.7,0.0935792],[0.7,0.0922131],[0.6942857,0.090847],[0.6942857,0.0881148],[0.6885714,0.0867486],[0.6885714,0.0853825],[0.6771429,0.0812842],[0.6771429,0.0785519],[0.6714286,0.0771858],[0.6714286,0.0758197],[0.6657143,0.0744536],[0.6657143,0.0730874],[0.66,0.0717213],[0.66,0.0703552],[0.6542857,0.0689891],[0.6542857,0.067623],[0.6485714,0.0662568],[0.6485714,0.0648907],[0.6428571,0.0635246],[0.6428571,0.0621585],[0.6371429,0.0607923],[0.6371429,0.0594262],[0.6314286,0.0580601],[0.6314286,0.056694],[0.62,0.0525956],[0.62,0.0512295],[0.6142857,0.0498634],[0.6142857,0.0484973],[0.6028571,0.045765],[0.6028571,0.0443989],[0.5971429,0.0430328],[0.5971429,0.0416667],[0.5914286,0.0403005],[0.5914286,0.0389344],[0.58,0.0348361],[0.58,0.0334699],[0.5742857,0.0321038],[0.5742857,0.0307377],[0.5628571,0.0280055],[0.5628571,0.0266393],[0.5514286,0.0239071],[0.5514286,0.022541],[0.54,0.0198087],[0.54,0.0184426],[0.5342857,0.0170765],[0.5342857,0.0157104],[0.5228571,0.0129781],[0.5228571,0.011612],[0.5171429,0.0102459]],"axe_red":[[0.7573529,0.0174014],[0.752451,0.0197216],[0.752451,0.0220418],[0.7426471,0.0290023],[0.7426471,0.0336427],[0.7377451,0.0359629],[0.7377451,0.0382831],[0.7279412,0.0452436],[0.7279412,0.0475638],[0.7181373,0.0522042],[0.7181373,0.0545244],[0.7083333,0.0591647],[0.7083333,0.0614849],[0.6985294,0.0661253],[0.6985294,0.0684455],[0.6887255,0.0730858],[0.6887255,0.075406],[0.6544118,0.0916473],[0.6544118,0.0939675],[0.6446078,0.0986079],[0.629902,0.1032483],[0.2573529,0.1055684],[0.2426471,0.1078886],[0.1985294,0.1194896],[0.1740196,0.1310905],[0.1740196,0.1334107],[0.1593137,0.1403712],[0.1593137,0.1426914],[0.1544118,0.1450116],[0.1642157,0.149652],[0.1642157,0.1519722],[0.1691176,0.1542923],[0.1691176,0.1566125],[0.1789216,0.1635731],[0.1789216,0.1658933],[0.1691176,0.1682135],[0.0612745,0.1705336],[0.0563725,0.1728538],[0.0563725,0.175174],[0.0514706,0.1774942],[0.0514706,0.1798144],[0.0416667,0.1867749],[0.0416667,0.1937355],[0.0367647,0.1960557],[0.0367647,0.2076566],[0.0318627,0.2099768],[0.0318627,0.2331787],[0.0367647,0.2354988],[0.0367647,0.2517401],[0.0416667,0.2540603],[0.0416667,0.2587007],[0.0465686,0.2610209],[0.0465686,0.2656613],[0.0514706,0.2679814],[0.0514706,0.2703016],[0.0563725,0.2726218],[0.0563725,0.274942],[0.0612745,0.2772622],[0.0612745,0.2795824],[0.0710784,0.2865429],[0.0710784,0.2888631],[0.0808824,0.2935035],[0.0808824,0.2958237],[0.120098,0.3143852],[0.2279412,0.3167053],[0.2279412,0.3213457],[0.2328431,0.3236659],[0.2328431,0.3399072],[0.2377451,0.3422274],[0.2377451,0.3445476],[0.252451,0.3515081],[0.252451,0.3654292],[0.2573529,0.3677494],[0.2573529,0.3816705],[0.2622549,0.3839907],[0.2622549,0.4025522],[0.2671569,0.4048724],[0.2671569,0.4211137],[0.2720588,0.4234339],[0.2720588,0.4350348],[0.2622549,0.4419954],[0.2622549,0.4559165],[0.2671569,0.4582367],[0.2671569,0.4791183],[0.2720588,0.4814385],[0.2720588,0.4907193],[0.2965686,0.5023202],[0.2965686,0.5116009],[0.3014706,0.5139211],[0.3014706,0.5301624],[0.3063725,0.5324826],[0.3063725,0.5603248],[0.3112745,0.562645],[0.3112745,0.6299304],[0.3063725,0.6322506],[0.3063725,0.6438515],[0.2916667,0.6484919],[0.2916667,0.6531323],[0.2867647,0.6554524],[0.2867647,0.6693735],[0.2916667,0.6716937],[0.2916667,0.6786543],[0.2818627,0.6856148],[0.2818627,0.7157773],[0.2720588,0.7227378],[0.2720588,0.7459397],[0.2671569,0.7482599],[0.2671569,0.762181],[0.2622549,0.7645012],[0.2622549,0.7668213],[0.2573529,0.7691415],[0.2573529,0.7737819],[0.252451,0.7761021],[0.252451,0.7900232],[0.247549,0.7923434],[0.247549,0.7946636],[0.2426471,0.7969838],[0.2426471,0.8016241],[0.2377451,0.8039443],[0.2377451,0.8178654],[0.2328431,0.8201856],[0.2328431,0.8225058],[0.2279412,0.824826],[0.2279412,0.8294664],[0.2181373,0.8364269],[0.2181373,0.8457077],[0.2132353,0.8480278],[0.2132353,0.8526682],[0.2083333,0.8549884],[0.2083333,0.8596288],[0.2034314,0.861949],[0.2034314,0.8689095],[0.2132353,0.8758701],[0.2132353,0.8828306],[0.2083333,0.8851508],[0.2083333,0.8897912],[0.2034314,0.8921114],[0.2034314,0.8967517],[0.1985294,0.8990719],[0.1985294,0.9037123],[0.1887255,0.9106729],[0.1887255,0.9176334],[0.1838235,0.9199536],[0.1838235,0.924594],[0.1887255,0.9269142],[0.1887255,0.9315545],[0.1936275,0.9338747],[0.1936275,0.9361949],[0.1985294,0.9385151],[0.1985294,0.9408353],[0.2181373,0.950116],[0.2181373,0.9524362],[0.2426471,0.9640371],[0.252451,0.9663573],[0.2622549,0.9709977],[0.2916667,0.9779582],[0.3259804,0.9825986],[0.3848039,0.9825986],[0.4240196,0.9779582],[0.4730392,0.9640371],[0.497549,0.9524362],[0.497549,0.950116],[0.5073529,0.9431555],[0.5073529,0.9315545],[0.502451,0.9292343],[0.502451,0.912993],[0.497549,0.9106729],[0.497549,0.8921114],[0.4926471,0.8897912],[0.4926471,0.8828306],[0.497549,0.8805104],[0.497549,0.8781903],[0.5073529,0.8712297],[0.5073529,0.8549884],[0.502451,0.8526682],[0.502451,0.8341067],[0.5073529,0.8317865],[0.502451,0.8294664],[0.502451,0.8016241],[0.5073529,0.7993039],[0.5073529,0.7668213],[0.5122549,0.7645012],[0.5122549,0.7366589],[0.5073529,0.7343387],[0.5073529,0.7134571],[0.5122549,0.7111369],[0.5122549,0.6740139],[0.5171569,0.6716937],[0.5171569,0.6438515],[0.5122549,0.6415313],[0.5122549,0.636891],[0.5073529,0.6345708],[0.5073529,0.562645],[0.502451,0.5603248],[0.502451,0.525522],[0.497549,0.5232019],[0.497549,0.5092807],[0.6887255,0.5069606],[0.7328431,0.4930394],[0.7769608,0.4721578],[0.7769608,0.4698376],[0.8112745,0.4535963],[0.8112745,0.4512761],[0.8210784,0.4466357],[0.8210784,0.4443155],[0.8308824,0.4396752],[0.8308824,0.437355],[0.8406863,0.4327146],[0.8406863,0.4303944],[0.8504902,0.4257541],[0.8504902,0.4234339],[0.8553922,0.4211137],[0.8553922,0.4187935],[0.8651961,0.4141531],[0.8651961,0.4118329],[0.870098,0.4095128],[0.870098,0.4071926],[0.875,0.4048724],[0.875,0.4025522],[0.879902,0.400232],[0.879902,0.3979118],[0.8897059,0.3909513],[0.8897059,0.3886311],[0.8946078,0.3863109],[0.8946078,0.3816705],[0.9044118,0.37471],[0.9044118,0.3700696],[0.9093137,0.3677494],[0.9093137,0.363109],[0.9142157,0.3607889],[0.9142157,0.3561485],[0.9191176,0.3538283],[0.9191176,0.3491879],[0.9240196,0.3468677],[0.9240196,0.3399072],[0.9289216,0.337587],[0.9289216,0.3306265],[0.9338235,0.3283063],[0.9338235,0.3213457],[0.9387255,0.3190255],[0.9387255,0.3074246],[0.9436275,0.3051044],[0.9436275,0.2935035],[0.9485294,0.2911833],[0.9485294,0.2703016],[0.9534314,0.2679814],[0.9534314,0.2262181],[0.9485294,0.2238979],[0.9485294,0.2030162],[0.9436275,0.2006961],[0.9436275,0.1890951],[0.9387255,0.1867749],[0.9387255,0.175174],[0.9338235,0.1728538],[0.9338235,0.1658933],[0.9289216,0.1635731],[0.9289216,0.1566125],[0.9240196,0.1542923],[0.9240196,0.149652],[0.9191176,0.1473318],[0.9191176,0.1426914],[0.9142157,0.1403712],[0.9142157,0.1357309],[0.9093137,0.1334107],[0.9093137,0.1287703],[0.9044118,0.1264501],[0.9044118,0.1218097],[0.8995098,0.1194896],[0.8995098,0.1148492],[0.8897059,0.1078886],[0.8897059,0.1032483],[0.8848039,0.1009281],[0.8848039,0.0986079],[0.879902,0.0962877],[0.879902,0.0939675],[0.870098,0.087007],[0.870098,0.0846868],[0.8602941,0.0800464],[0.8602941,0.0777262],[0.8504902,0.0730858],[0.8504902,0.0707657],[0.8455882,0.0684455],[0.8455882,0.0661253],[0.8357843,0.0614849],[0.8357843,0.0591647],[0.8259804,0.0545244],[0.8259804,0.0522042],[0.8210784,0.049884],[0.8210784,0.0475638],[0.8112745,0.0429234],[0.8112745,0.0406032],[0.7965686,0.0336427],[0.7965686,0.0313225],[0.7671569,0.0174014]],"axe_blue":[[0.736715,0.0181598],[0.7270531,0.0254237],[0.7270531,0.0302663],[0.7222222,0.0326877],[0.7222222,0.0375303],[0.7173913,0.0399516],[0.7173913,0.0423729],[0.7125604,0.0447942],[0.7125604,0.0472155],[0.7077295,0.0496368],[0.7077295,0.0520581],[0.6980676,0.059322],[0.6980676,0.0617433],[0.6884058,0.066586],[0.6884058,0.0690073],[0.673913,0.0762712],[0.673913,0.0786925],[0.6642512,0.0835351],[0.6642512,0.0859564],[0.6352657,0.1004843],[0.2536232,0.1029056],[0.205314,0.1101695],[0.1859903,0.1150121],[0.1618357,0.1271186],[0.147343,0.1319613],[0.147343,0.1440678],[0.1521739,0.1464891],[0.1521739,0.1489104],[0.1618357,0.1561743],[0.0845411,0.1585956],[0.0748792,0.1634383],[0.0748792,0.1658596],[0.0700483,0.1682809],[0.0700483,0.1707022],[0.0603865,0.1779661],[0.0603865,0.1828087],[0.0555556,0.18523],[0.0555556,0.1900726],[0.0507246,0.1924939],[0.0507246,0.1997579],[0.0458937,0.2021792],[0.0458937,0.2409201],[0.0507246,0.2433414],[0.0507246,0.2530266],[0.0555556,0.2554479],[0.0555556,0.2602906],[0.0603865,0.2627119],[0.0603865,0.2699758],[0.0652174,0.2723971],[0.0652174,0.2772397],[0.0700483,0.279661],[0.0700483,0.2820823],[0.0748792,0.2845036],[0.0748792,0.2869249],[0.0845411,0.2917676],[0.0845411,0.2941889],[0.0942029,0.2990315],[0.0942029,0.3014528],[0.1666667,0.3038741],[0.1570048,0.3087167],[0.1570048,0.3184019],[0.1618357,0.3208232],[0.1618357,0.3498789],[0.1811594,0.3644068],[0.1811594,0.3837772],[0.1859903,0.3861985],[0.1859903,0.4104116],[0.1908213,0.4128329],[0.1908213,0.4636804],[0.1956522,0.4661017],[0.1956522,0.5121065],[0.1908213,0.5145278],[0.1908213,0.5169492],[0.1811594,0.5217918],[0.1811594,0.531477],[0.1763285,0.5338983],[0.1763285,0.5411622],[0.1811594,0.5435835],[0.1811594,0.5532688],[0.1859903,0.5556901],[0.1859903,0.5677966],[0.1811594,0.5702179],[0.1811594,0.6452785],[0.1763285,0.6476998],[0.1763285,0.6840194],[0.1714976,0.6864407],[0.1714976,0.7372881],[0.1666667,0.7397094],[0.1666667,0.7445521],[0.1618357,0.7469734],[0.1618357,0.751816],[0.1666667,0.7542373],[0.1666667,0.7590799],[0.1618357,0.7615012],[0.1618357,0.7905569],[0.1521739,0.7953995],[0.1521739,0.81477],[0.147343,0.8171913],[0.147343,0.8220339],[0.1425121,0.8244552],[0.1425121,0.8292978],[0.1521739,0.8365617],[0.1521739,0.8414044],[0.147343,0.8438257],[0.147343,0.8486683],[0.1425121,0.8510896],[0.1425121,0.8535109],[0.1376812,0.8559322],[0.1376812,0.8583535],[0.1280193,0.8631961],[0.1280193,0.8656174],[0.1231884,0.8680387],[0.1231884,0.87046],[0.1135266,0.8753027],[0.1135266,0.877724],[0.0990338,0.8849879],[0.0990338,0.8946731],[0.1038647,0.8970944],[0.1038647,0.8995157],[0.1135266,0.9067797],[0.1135266,0.909201],[0.147343,0.9261501],[0.147343,0.9285714],[0.1666667,0.9382567],[0.1666667,0.940678],[0.1956522,0.9552058],[0.2391304,0.9697337],[0.2584541,0.9794189],[0.2826087,0.9794189],[0.2922705,0.9745763],[0.3164251,0.9673123],[0.3357488,0.9576271],[0.3454106,0.9552058],[0.4033816,0.9261501],[0.4033816,0.9237288],[0.4178744,0.9164649],[0.4178744,0.9140436],[0.4323671,0.9067797],[0.4323671,0.9043584],[0.4371981,0.901937],[0.4371981,0.8995157],[0.4468599,0.8946731],[0.4468599,0.8898305],[0.442029,0.8874092],[0.442029,0.8849879],[0.4371981,0.8825666],[0.4371981,0.8801453],[0.4275362,0.8753027],[0.4275362,0.8728814],[0.4178744,0.8680387],[0.4178744,0.8656174],[0.4082126,0.8583535],[0.4082126,0.8535109],[0.4033816,0.8510896],[0.4033816,0.8486683],[0.3937198,0.8414044],[0.3937198,0.8389831],[0.4033816,0.8341404],[0.4033816,0.8292978],[0.4082126,0.8268765],[0.4082126,0.8244552],[0.4033816,0.8220339],[0.4033816,0.81477],[0.3985507,0.8123487],[0.3985507,0.7953995],[0.3888889,0.7905569],[0.3888889,0.7881356],[0.384058,0.7857143],[0.3937198,0.7784504],[0.3937198,0.7445521],[0.3888889,0.7421308],[0.3888889,0.7324455],[0.3937198,0.7300242],[0.3937198,0.7058111],[0.3888889,0.7033898],[0.3888889,0.6912833],[0.3937198,0.688862],[0.3937198,0.6791768],[0.3985507,0.6767554],[0.3937198,0.6743341],[0.3937198,0.6380145],[0.3888889,0.6355932],[0.3888889,0.6283293],[0.384058,0.625908],[0.384058,0.6162228],[0.3937198,0.6089588],[0.3937198,0.5726392],[0.3888889,0.5702179],[0.3888889,0.5605327],[0.384058,0.5581114],[0.615942,0.5556901],[0.6304348,0.5532688],[0.6932367,0.5363196],[0.7028986,0.531477],[0.7125604,0.5290557],[0.7270531,0.5217918],[0.736715,0.5193705],[0.8043478,0.4854722],[0.8043478,0.4830508],[0.8285024,0.4709443],[0.8285024,0.468523],[0.8429952,0.4612591],[0.8429952,0.4588378],[0.852657,0.4539952],[0.852657,0.4515738],[0.8623188,0.4467312],[0.8623188,0.4443099],[0.8719807,0.4394673],[0.8719807,0.437046],[0.8816425,0.4297821],[0.8816425,0.4273608],[0.8913043,0.4225182],[0.8913043,0.4200969],[0.8961353,0.4176755],[0.8961353,0.4152542],[0.9009662,0.4128329],[0.9009662,0.4104116],[0.910628,0.4031477],[0.910628,0.4007264],[0.9154589,0.3983051],[0.9154589,0.3934625],[0.9251208,0.3861985],[0.9251208,0.3813559],[0.9299517,0.3789346],[0.9299517,0.374092],[0.9396135,0.3668281],[0.9396135,0.3595642],[0.9444444,0.3571429],[0.9444444,0.3523002],[0.9492754,0.3498789],[0.9492754,0.3401937],[0.9541063,0.3377724],[0.9541063,0.3256659],[0.9589372,0.3232446],[0.9589372,0.311138],[0.9637681,0.3087167],[0.9637681,0.2917676],[0.968599,0.2893462],[0.968599,0.2336562],[0.9637681,0.2312349],[0.9637681,0.2142857],[0.9589372,0.2118644],[0.9589372,0.1973366],[0.9541063,0.1949153],[0.9541063,0.18523],[0.9492754,0.1828087],[0.9492754,0.1779661],[0.9444444,0.1755448],[0.9444444,0.1682809],[0.9396135,0.1658596],[0.9396135,0.1610169],[0.9347826,0.1585956],[0.9347826,0.153753],[0.9299517,0.1513317],[0.9299517,0.1464891],[0.9251208,0.1440678],[0.9251208,0.1416465],[0.9154589,0.1343826],[0.9154589,0.12954],[0.910628,0.1271186],[0.910628,0.1246973],[0.9057971,0.122276],[0.9057971,0.1198547],[0.8961353,0.1125908],[0.8961353,0.1101695],[0.8864734,0.1053269],[0.8864734,0.1029056],[0.8768116,0.0956416],[0.8768116,0.0932203],[0.8671498,0.0883777],[0.8671498,0.0859564],[0.8623188,0.0835351],[0.8623188,0.0811138],[0.852657,0.0762712],[0.852657,0.0738499],[0.8429952,0.0690073],[0.8429952,0.066586],[0.8091787,0.0496368],[0.8091787,0.0472155],[0.7512077,0.0181598]],"axe_double":[[0.42,0.0096774],[0.42,0.0122581],[0.4127273,0.016129],[0.4127273,0.0187097],[0.4054545,0.0225806],[0.4054545,0.0251613],[0.4018182,0.0264516],[0.4018182,0.0290323],[0.3981818,0.0303226],[0.3981818,0.0329032],[0.3945455,0.0341935],[0.3945455,0.0380645],[0.3909091,0.0393548],[0.3909091,0.0419355],[0.3836364,0.0458065],[0.3836364,0.0483871],[0.38,0.0496774],[0.38,0.0522581],[0.3763636,0.0535484],[0.3763636,0.056129],[0.3727273,0.0574194],[0.3727273,0.06],[0.3690909,0.0612903],[0.3690909,0.063871],[0.3654545,0.0651613],[0.3654545,0.0664516],[0.3618182,0.0677419],[0.3618182,0.0690323],[0.3545455,0.0729032],[0.3545455,0.0767742],[0.3472727,0.0806452],[0.3472727,0.0832258],[0.3436364,0.0845161],[0.3436364,0.0858065],[0.3363636,0.0896774],[0.3363636,0.0922581],[0.3327273,0.0935484],[0.3327273,0.0948387],[0.3290909,0.096129],[0.3290909,0.0974194],[0.3254545,0.0987097],[0.1618182,0.1],[0.14,0.1051613],[0.1327273,0.1077419],[0.1254545,0.1090323],[0.1072727,0.1154839],[0.1072727,0.1167742],[0.0927273,0.1219355],[0.0927273,0.1232258],[0.0818182,0.1270968],[0.0818182,0.1283871],[0.0745455,0.1309677],[0.0745455,0.1322581],[0.0672727,0.1348387],[0.0672727,0.136129],[0.0636364,0.1374194],[0.0636364,0.1387097],[0.06,0.14],[0.06,0.1412903],[0.0527273,0.1451613],[0.0527273,0.1477419],[0.0454545,0.1516129],[0.0454545,0.1541935],[0.0418182,0.1554839],[0.0418182,0.1580645],[0.0381818,0.1593548],[0.0381818,0.1619355],[0.0345455,0.1632258],[0.0345455,0.1670968],[0.0309091,0.1683871],[0.0309091,0.1722581],[0.0272727,0.1735484],[0.0272727,0.1812903],[0.0236364,0.1825806],[0.0236364,0.2070968],[0.0272727,0.2083871],[0.0272727,0.2148387],[0.0309091,0.216129],[0.0309091,0.2212903],[0.0345455,0.2225806],[0.0345455,0.2264516],[0.0381818,0.2277419],[0.0381818,0.2303226],[0.0418182,0.2316129],[0.0418182,0.2341935],[0.0454545,0.2354839],[0.0454545,0.2380645],[0.0490909,0.2393548],[0.0490909,0.2406452],[0.0527273,0.2419355],[0.0527273,0.2445161],[0.06,0.2470968],[0.06,0.2483871],[0.0636364,0.2496774],[0.0636364,0.2509677],[0.0745455,0.2548387],[0.0745455,0.256129],[0.1109091,0.2690323],[0.1181818,0.2703226],[0.3254545,0.2716129],[0.3290909,0.2729032],[0.3290909,0.2741935],[0.3363636,0.2767742],[0.3363636,0.2780645],[0.3436364,0.2819355],[0.3436364,0.2845161],[0.3472727,0.2858065],[0.3472727,0.2935484],[0.3436364,0.2948387],[0.3436364,0.3025806],[0.34,0.303871],[0.34,0.3090323],[0.3436364,0.3103226],[0.3436364,0.3116129],[0.3545455,0.3154839],[0.3545455,0.3193548],[0.3581818,0.3206452],[0.3581818,0.3335484],[0.3618182,0.3348387],[0.3618182,0.3412903],[0.3654545,0.3425806],[0.3654545,0.4870968],[0.3581818,0.4896774],[0.3581818,0.4909677],[0.3545455,0.4922581],[0.3545455,0.4948387],[0.3581818,0.496129],[0.3581818,0.5141935],[0.3545455,0.5154839],[0.3545455,0.5193548],[0.3581818,0.5206452],[0.3581818,0.5219355],[0.3654545,0.5245161],[0.3654545,0.6445161],[0.3618182,0.6458065],[0.3618182,0.6496774],[0.3581818,0.6509677],[0.3581818,0.6690323],[0.3545455,0.6703226],[0.3545455,0.6767742],[0.3581818,0.6780645],[0.3581818,0.6922581],[0.3545455,0.6935484],[0.3545455,0.696129],[0.3581818,0.6974194],[0.3581818,0.7141935],[0.3545455,0.7154839],[0.3545455,0.7283871],[0.3581818,0.7296774],[0.3581818,0.7335484],[0.3545455,0.7348387],[0.3545455,0.7490323],[0.3581818,0.7503226],[0.3581818,0.7516129],[0.3545455,0.7529032],[0.3545455,0.7722581],[0.3509091,0.7735484],[0.3509091,0.7812903],[0.3545455,0.7825806],[0.3545455,0.8419355],[0.3509091,0.8432258],[0.3509091,0.8548387],[0.3436364,0.8587097],[0.3436364,0.8754839],[0.3363636,0.8780645],[0.3363636,0.8793548],[0.3327273,0.8806452],[0.3327273,0.8870968],[0.34,0.8909677],[0.34,0.896129],[0.3363636,0.8974194],[0.3363636,0.9],[0.3290909,0.9025806],[0.3290909,0.903871],[0.3181818,0.9077419],[0.3181818,0.9090323],[0.3072727,0.9129032],[0.3072727,0.9141935],[0.2963636,0.9180645],[0.2963636,0.9219355],[0.3036364,0.9245161],[0.3036364,0.9258065],[0.3109091,0.9283871],[0.3109091,0.9296774],[0.3181818,0.9322581],[0.3181818,0.9335484],[0.3254545,0.936129],[0.3254545,0.9374194],[0.3327273,0.94],[0.3327273,0.9412903],[0.34,0.943871],[0.34,0.9451613],[0.3472727,0.9477419],[0.3472727,0.9490323],[0.3509091,0.9503226],[0.3509091,0.9516129],[0.3581818,0.9541935],[0.3581818,0.9554839],[0.3654545,0.9580645],[0.3654545,0.9593548],[0.3690909,0.9606452],[0.3690909,0.9619355],[0.3763636,0.9645161],[0.3763636,0.9658065],[0.3836364,0.9683871],[0.3836364,0.9696774],[0.3872727,0.9709677],[0.3872727,0.9722581],[0.3909091,0.9735484],[0.3909091,0.9748387],[0.3981818,0.9787097],[0.3981818,0.98],[0.4018182,0.9812903],[0.4018182,0.9825806],[0.4090909,0.9851613],[0.4090909,0.9864516],[0.4163636,0.9890323],[0.4163636,0.9903226],[0.4272727,0.9903226],[0.4272727,0.9890323],[0.4345455,0.9864516],[0.4345455,0.9851613],[0.4418182,0.9825806],[0.4418182,0.9812903],[0.4490909,0.9787097],[0.4490909,0.9774194],[0.4527273,0.976129],[0.4527273,0.9748387],[0.4563636,0.9735484],[0.4563636,0.9722581],[0.46,0.9709677],[0.46,0.9696774],[0.4672727,0.9658065],[0.4672727,0.9645161],[0.4709091,0.9632258],[0.4709091,0.9619355],[0.4781818,0.9593548],[0.4781818,0.9580645],[0.4854545,0.9554839],[0.4854545,0.9541935],[0.4927273,0.9503226],[0.4927273,0.9490323],[0.5036364,0.9451613],[0.5036364,0.943871],[0.5109091,0.9412903],[0.5109091,0.94],[0.5145455,0.9387097],[0.5145455,0.9374194],[0.5218182,0.9348387],[0.5218182,0.9335484],[0.5290909,0.9309677],[0.5290909,0.9296774],[0.5363636,0.9270968],[0.5363636,0.9258065],[0.5436364,0.9232258],[0.5436364,0.9219355],[0.5472727,0.9206452],[0.5472727,0.9193548],[0.5363636,0.9154839],[0.5363636,0.9141935],[0.5254545,0.9103226],[0.5254545,0.9090323],[0.5181818,0.9064516],[0.5181818,0.9051613],[0.5145455,0.903871],[0.5145455,0.9025806],[0.5072727,0.9],[0.5072727,0.8987097],[0.5,0.8948387],[0.5,0.8909677],[0.5072727,0.8883871],[0.5072727,0.8858065],[0.5109091,0.8845161],[0.5109091,0.8819355],[0.4963636,0.8741935],[0.4963636,0.8574194],[0.4890909,0.8535484],[0.4890909,0.8406452],[0.4854545,0.8393548],[0.4854545,0.8019355],[0.4890909,0.8006452],[0.4890909,0.7825806],[0.4854545,0.7812903],[0.4854545,0.7529032],[0.4890909,0.7516129],[0.4890909,0.736129],[0.4854545,0.7348387],[0.4854545,0.7296774],[0.4818182,0.7283871],[0.4818182,0.7245161],[0.4854545,0.7232258],[0.4854545,0.7103226],[0.4890909,0.7090323],[0.4890909,0.7064516],[0.4854545,0.7051613],[0.4854545,0.6716129],[0.4818182,0.6703226],[0.4818182,0.6651613],[0.4854545,0.663871],[0.4854545,0.6470968],[0.4818182,0.6458065],[0.4818182,0.6316129],[0.4781818,0.6303226],[0.4781818,0.5245161],[0.4854545,0.5219355],[0.4854545,0.5206452],[0.4890909,0.5193548],[0.4890909,0.4909677],[0.4854545,0.4896774],[0.4854545,0.4883871],[0.4781818,0.4845161],[0.4781818,0.4096774],[0.6054545,0.4083871],[0.6272727,0.4032258],[0.6490909,0.3993548],[0.6709091,0.3941935],[0.6781818,0.3916129],[0.6854545,0.3903226],[0.7072727,0.3825806],[0.7145455,0.3812903],[0.7290909,0.376129],[0.7363636,0.3748387],[0.8018182,0.3516129],[0.8018182,0.3503226],[0.8127273,0.3464516],[0.8127273,0.3451613],[0.8309091,0.3387097],[0.8309091,0.3374194],[0.8454545,0.3322581],[0.8454545,0.3309677],[0.8527273,0.3283871],[0.8527273,0.3270968],[0.86,0.3245161],[0.86,0.3232258],[0.8672727,0.3206452],[0.8672727,0.3193548],[0.8709091,0.3180645],[0.8709091,0.3167742],[0.8781818,0.3141935],[0.8781818,0.3129032],[0.8854545,0.3103226],[0.8854545,0.3090323],[0.8927273,0.3051613],[0.8927273,0.303871],[0.9,0.3012903],[0.9,0.3],[0.9036364,0.2987097],[0.9036364,0.2974194],[0.9072727,0.296129],[0.9072727,0.2948387],[0.9109091,0.2935484],[0.9109091,0.2922581],[0.9181818,0.2883871],[0.9181818,0.2870968],[0.9218182,0.2858065],[0.9218182,0.2832258],[0.9254545,0.2819355],[0.9254545,0.2806452],[0.9290909,0.2793548],[0.9290909,0.2767742],[0.9363636,0.2729032],[0.9363636,0.2703226],[0.9436364,0.2664516],[0.9436364,0.2625806],[0.9472727,0.2612903],[0.9472727,0.2587097],[0.9509091,0.2574194],[0.9509091,0.2548387],[0.9545455,0.2535484],[0.9545455,0.2509677],[0.9581818,0.2496774],[0.9581818,0.2445161],[0.9618182,0.2432258],[0.9618182,0.2380645],[0.9654545,0.2367742],[0.9654545,0.2316129],[0.9690909,0.2303226],[0.9690909,0.2225806],[0.9727273,0.2212903],[0.9727273,0.2109677],[0.9763636,0.2096774],[0.9763636,0.1825806],[0.9727273,0.1812903],[0.9727273,0.1722581],[0.9690909,0.1709677],[0.9690909,0.1645161],[0.9654545,0.1632258],[0.9654545,0.1567742],[0.9618182,0.1554839],[0.9618182,0.1516129],[0.9581818,0.1503226],[0.9581818,0.1477419],[0.9545455,0.1464516],[0.9545455,0.1425806],[0.9509091,0.1412903],[0.9509091,0.1387097],[0.9472727,0.1374194],[0.9472727,0.1348387],[0.94,0.1309677],[0.94,0.1283871],[0.9327273,0.1245161],[0.9327273,0.1219355],[0.9290909,0.1206452],[0.9290909,0.1193548],[0.9218182,0.1154839],[0.9218182,0.1129032],[0.9181818,0.1116129],[0.9181818,0.1103226],[0.9145455,0.1090323],[0.9145455,0.1077419],[0.9072727,0.1051613],[0.9072727,0.103871],[0.9036364,0.1025806],[0.9036364,0.1012903],[0.8963636,0.0987097],[0.8963636,0.0974194],[0.8890909,0.0948387],[0.8890909,0.0935484],[0.8818182,0.0909677],[0.8818182,0.0896774],[0.8672727,0.0845161],[0.8672727,0.0832258],[0.8454545,0.0754839],[0.8454545,0.0741935],[0.8309091,0.0690323],[0.8236364,0.0677419],[0.8054545,0.0612903],[0.7618182,0.0509677],[0.4672727,0.0496774],[0.4672727,0.0470968],[0.4636364,0.0458065],[0.4636364,0.0432258],[0.46,0.0419355],[0.46,0.0393548],[0.4563636,0.0380645],[0.4563636,0.0354839],[0.4527273,0.0341935],[0.4527273,0.0316129],[0.4490909,0.0303226],[0.4490909,0.0277419],[0.4454545,0.0264516],[0.4454545,0.023871],[0.4381818,0.02],[0.4381818,0.0174194],[0.4345455,0.016129],[0.4345455,0.0135484],[0.4272727,0.0096774]]};

/* Approved center test 4.1 for one/two-handed strikes, test 3 for dual/sweep.
   Fixed-pivot melee swings, edge-anchored tears and the original whirlwind.
   The source rim is extended past the card edge, then clipped to the frame. */
(() => {
 'use strict';
 const cap=n=>clamp(n,0,1),mix=(a,b,p)=>a+(b-a)*p;
 const inverse=e=>e<.5?Math.sqrt(e/2):1-Math.sqrt((1-e)/2);
 let sequence=0;
 const legacyPolygon=tearPolygon,legacyClear=FX.clear,legacySetup=setupLab;
 const allCuts=c=>[...(c.weaponCut?[c.weaponCut]:[]),...(c.weaponCuts||[])];
 const active=c=>allCuts(c).filter(d=>!d.edge26||d.progress>0);
 const specs=grip=>({depth:grip==='dual'?.3:grip==='two'?.7:.5,scale:grip==='dual'?.75:grip==='two'?1.3:1});

 function bladeIntersection(d,G,angle,w){
  const s=Math.sin(angle),co=Math.cos(angle),x=w*.5,arm=d.arm,outline=WEAPON_CONTOURS[arm.key];
  const transform=q=>{const lx=(q[0]-arm.hx)*G.iw*(G.flip?-1:1),ly=(q[1]-1)*G.len;
   return {x:G.pivot.x+lx*co-ly*s,y:G.pivot.y+lx*s+ly*co};};
  let y=-Infinity,previous=transform(outline[outline.length-1]);
  for(const q of outline){const next=transform(q),dx=next.x-previous.x;
   if((previous.x-x)*(next.x-x)<=0&&Math.abs(dx)>1e-8)y=Math.max(y,mix(previous.y,next.y,(x-previous.x)/dx));
   previous=next;}
  if(Number.isFinite(y))return{x,y,visibleEdge:true};
  const lx=arm.edge==='right'?(.82-arm.hx)*G.iw*(G.flip?-1:1):0,reach=(x-G.pivot.x-lx*co)/s;
  return{x,y:G.pivot.y+lx*s-reach*co,visibleEdge:false};
 }

 function timing(d,w,h){
  const cache=d.geometryCache;if(cache&&cache.w===w&&cache.h===h)return cache;
  if(d.axis==='horizontal')return d.geometryCache={w,h,begin:0,end:.16,length:w*d.depth};
  const weapon=d.arm,G=strikeGeom({x:0,y:0,w,h,cx:w/2,cy:h/2},{...weapon,cutX:d.x},d.side>0?'left':'right',d.two);
  if(d.center27){
   const angleAt=y=>{let lo=.15,hi=2.9;for(let i=0;i<44;i++){const a=(lo+hi)/2;if(bladeIntersection(d,G,a,w).y<y)lo=a;else hi=a;}return(lo+hi)/2;};
   const startAngle=angleAt(0),endAngle=angleAt(h*d.depth),beginT=inverse(cap((startAngle-G.from)/(G.to-G.from))),stopT=inverse(cap((endAngle-G.from)/(G.to-G.from)));
   return d.geometryCache={w,h,G,startAngle,endAngle,beginT,stopT,begin:beginT*G.ms/1000,end:stopT*G.ms/1000,length:h*d.depth};
  }
  const angleAtY=y=>{let lo=0,hi=2.5;for(let i=0;i<42;i++){
   const m=(lo+hi)/2,p=headAt(weapon,G.pivot,G.len,G.iw,G.spin*m,G.flip);if(p.y<y)lo=m;else hi=m;
  }return G.spin*(lo+hi)/2;};
  const startAngle=angleAtY(0),endAngle=angleAtY(h*d.depth),span=(endAngle-startAngle)*G.spin;
  const stopT=inverse(cap((endAngle-G.from)/(G.to-G.from)));
  const begin=G.ms/1000*inverse(cap((startAngle-G.from)/(G.to-G.from)));
  const head=headAt(weapon,{x:0,y:0},G.len,G.iw,0,G.flip),radius=Math.hypot(head.x,head.y);
  return d.geometryCache={w,h,G,startAngle,endAngle,span,stopT,begin,end:stopT*G.ms/1000,length:radius*span};
 }
 function progress(d,w,h,age=d.age){
  const q=timing(d,w,h);if(age<q.begin)return 0;
  if(d.axis==='horizontal')return smooth(age/.16);
  const angle=q.G.from+(q.G.to-q.G.from)*q.G.easing(clamp(age*1000/q.G.ms,0,q.stopT));
  if(d.center27)return cap(bladeIntersection(d,q.G,angle,w).y/(h*d.depth));
  return cap((angle-q.startAngle)/(q.G.spin*q.span));
 }
 function path(d,u,w,h){
  if(d.axis==='horizontal')return {x:w*d.depth*u,y:h*d.y};
  if(d.center27)return{x:w*.5,y:h*d.depth*u};
  const q=timing(d,w,h);return headAt(d.arm,q.G.pivot,q.G.len,q.G.iw,q.startAngle+q.G.spin*q.span*u,q.G.flip);
 }
 function tangent(d,u,w,h){
  const q=timing(d,w,h);if(d.axis==='horizontal')return {x:1,y:0,length:q.length};
  if(d.center27)return{x:0,y:1,length:q.length};
  const G=q.G,a=q.startAngle+G.spin*q.span*u;
  const lx=d.arm.edge==='right'?(.82-d.arm.hx)*G.iw*(G.flip?-1:1):0,ly=-G.len*(d.arm.kind==='axe'?.8:.72);
  const dx=G.spin*(-lx*Math.sin(a)-ly*Math.cos(a)),dy=G.spin*(lx*Math.cos(a)-ly*Math.sin(a)),r=Math.hypot(dx,dy);
  return {x:dx/r,y:dy/r,length:q.length};
 }
 function rowAt(u){
  const yy=24+567*u;let lo=0,hi=CRITICAL_ROWS.length-1;
  while(hi-lo>1){const m=(lo+hi)>>1;if(CRITICAL_ROWS[m][2]<=yy)lo=m;else hi=m;}
  const a=CRITICAL_ROWS[lo],b=CRITICAL_ROWS[hi],f=cap((yy-a[2])/(b[2]-a[2]));
  return [mix(a[0],b[0],f),mix(a[1],b[1],f),yy];
 }
 function sample(d,u,w,h,margin=0){
  const center=path(d,u,w,h),v=tangent(d,u,w,h),row=rowAt(u),p=progress(d,w,h);
  const heal=smooth((d.life-d.age)/.75),sx=w/1024*.75*d.scale*heal*smooth((p-u)/.065);
  const sourceCenter=d.center27?(row[0]+row[1])/2:525;
  const left=(row[0]-sourceCenter-margin)*sx,right=(row[1]-sourceCenter+margin)*sx;
  return {u,row,sourceCenter,center,v,sx,heal,left:[center.x-v.y*left,center.y+v.x*left],right:[center.x-v.y*right,center.y+v.x*right]};
 }
 function samples(d,w,h,margin=0){
  const p=progress(d,w,h);if(p<=0)return [];
  // Extend BOTH textured lips upstream. A perpendicular strip at u=0 alone
  // leaves the inner lip below the top border when the blade follows an arc.
  const us=d.center27?[-.045,-.02,0]:[-.24,-.18,-.14,-.10,-.06,-.03,0];
  for(const row of CRITICAL_ROWS){const u=(row[2]-24)/567;if(u>0&&u<p)us.push(u);}
  us.push(p);return us.map(u=>sample(d,u,w,h,margin));
 }
 function gap(d,w,h,margin=0){
  const rows=samples(d,w,h,margin);return rows.map(r=>r.left).concat(rows.slice().reverse().map(r=>r.right));
 }
 tearPolygon=function(d,w,h){return d.edge26?gap(d,w,h):legacyPolygon(d,w,h);};
 function rim(x,d,w,h){
  const rows=samples(d,w,h,18);if(rows.length<2)return;
  x.save();x.beginPath();x.rect(-3,-3,w+6,h+6);x.clip();
  x.beginPath();tracePolygon(x,rows.map(r=>r.left).concat(rows.slice().reverse().map(r=>r.right)));x.clip();
  for(let i=0;i<rows.length-1;i++){
   const r0=rows[i],r1=rows[i+1],r=sample(d,(r0.u+r1.u)/2,w,h,18);if(r.sx<.00001)continue;
   const sy=r.v.length/567,dy=r0.row[2],dh=r1.row[2]-dy+.35;
   x.save();x.transform(-r.v.y*r.sx,r.v.x*r.sx,r.v.x*sy,r.v.y*sy,
    r.center.x+r.v.y*r.sx*r.sourceCenter-r.v.x*sy*r.row[2],r.center.y-r.v.x*r.sx*r.sourceCenter-r.v.y*sy*r.row[2]);
   x.globalAlpha=r.heal;
   // Reuse the first textured source strip for the short extension above
   // the frame; never sample a negative source rectangle or new artwork.
   x.drawImage(IMG.critical_reference,430,Math.max(24,dy),180,dy<24?3:dh,430,dy,180,dh);x.restore();
  }x.restore();
 }
 applyCardMask=function(c,w,h){
  if(!w||!h){c.maskKey=null;return;}
  const cuts=active(c),key=JSON.stringify([w,h,c.burns.map(d=>[d.x,d.y,d.size,Math.round(holeScale(d)*800)]),
   cuts.map(d=>[d.id,d.axis,d.x,d.y,d.pull,d.edge26?Math.round(progress(d,w,h)*1600):Math.round(smooth(d.age/.2)*800),Math.round(smooth((d.life-d.age)/.75)*800)]),c.claw?.holes]);
  if(c.maskKey===key)return;c.maskKey=key;
  if(!c.burns.length&&!cuts.length&&!c.claw?.holes.length){c.surface.style.maskImage=c.surface.style.webkitMaskImage='';return;}
  const paths=c.burns.map(d=>BURN_CONTOUR.map(p=>holePoint(d,p,w,h,holeScale(d))));
  for(const d of cuts)paths.push(tearPolygon(d,w,h));
  for(const hole of c.claw?.holes||[])paths.push(hole.map(p=>[p[0]*w,p[1]*h]));
  const holes=paths.filter(p=>p.length).map(p=>`<path fill="black" d="M${p.map(q=>q.map(v=>v.toFixed(2)).join(',')).join('L')}Z"/>`).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><mask id="h" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}" style="mask-type:luminance"><rect width="100%" height="100%" fill="white"/>${holes}</mask><rect width="100%" height="100%" fill="white" mask="url(#h)"/></svg>`;
  c.surface.style.maskImage=c.surface.style.webkitMaskImage=`url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
 };
 clearOpenings=function(x,c,w,h){
  x.save();x.globalCompositeOperation='destination-out';x.globalAlpha=1;
  for(const d of c.burns){x.beginPath();tracePolygon(x,BURN_CONTOUR.map(p=>holePoint(d,p,w,h,holeScale(d))));x.fill();}
  for(const d of active(c)){x.beginPath();tracePolygon(x,tearPolygon(d,w,h));x.fill();}x.restore();
 };
 drawWeaponTear=function(x,c,w,h){
  const cuts=active(c);if(!cuts.length)return;
  x.save();for(const d of cuts){x.beginPath();x.rect(-w,-h,w*3,h*3);tracePolygon(x,tearPolygon(d,w,h));x.clip('evenodd');}
  x.strokeStyle=c.el.classList.contains('target')?'#e0a458':c.el.classList.contains('pick')?'#2ecc71':'#4b3923';
  x.lineWidth=c.el.classList.contains('target')?3:2;x.beginPath();x.roundRect(-1,-1,w+2,h+2,8);x.stroke();x.restore();
  for(const d of cuts){
   if(d.edge26){
    if(loaded(IMG.critical_reference))rim(x,d,w,h);
    const p=path(d,progress(d,w,h),w,h),q=timing(d,w,h);
    cutDrips(x,w,h,p.x/w,p.y/h+.008,Math.max(0,d.age-q.begin-.12),smooth((d.life-d.age)/.75),d.two?1.3:1.05);
   }else{
    const t=tearTransform(d,w,h);
    if(loaded(IMG.critical_reference)){
     const left=CRITICAL_ROWS.map(p=>[p[0]-18,p[2]]),right=CRITICAL_ROWS.map(p=>[p[1]+18,p[2]]).reverse();
     left.push([518,666]);right.unshift([535,666]);
     x.save();x.globalAlpha=t.fade;x.beginPath();tracePolygon(x,left.concat(right).map(p=>tearPoint(p,t)));x.clip();
     x.transform(t.a,t.b,t.c,t.d,t.tx,t.ty);x.drawImage(IMG.critical_reference,0,0);x.restore();
    }
    if(d.axis==='dagger')cutDrips(x,w,h,d.x,d.y+.035+.13*(d.pull??0),d.age,t.fade,1.2);
    else cutDrips(x,w,h,.5,.505,d.age,t.fade,.55);
   }
  }
 };
 drawStatuses=function(dt){
  for(const c of Object.values(cards)){
   if(c.weaponCut){c.weaponCut.age+=dt;if(c.weaponCut.age>=c.weaponCut.life)c.weaponCut=null;}
   c.weaponCuts=(c.weaponCuts||[]).filter(d=>{
    d.age+=dt;const q=timing(d,c.el.offsetWidth,c.el.offsetHeight);d.life=q.end+4.15;
    d.progress=progress(d,c.el.offsetWidth,c.el.offsetHeight);d.held=d.axis!=='horizontal'&&d.age>=q.end&&d.age<q.end+2.1;
    return d.age<d.life;
   });
   c.el.classList.toggle('ripped',active(c).length>0);
  }
  drawCardStatuses(dt);
  for(const c of Object.values(cards))if(active(c).length){
   const x=c.overlayCtx,w=c.el.offsetWidth,h=c.el.offsetHeight;if(!w||!h)continue;
   x.setTransform(DPR,0,0,DPR,0,0);x.translate(w*.25,h*.42);drawWeaponTear(x,c,w,h);clearOpenings(x,c,w,h);
   c.overlay.style.visibility='visible';c.overlayHadArt=true;
  }
 };
 function descriptor(arm,index,grip,group,axis='vertical'){
  const s=specs(grip);return {id:group+'-'+index,edge26:true,axis,age:0,life:5,arm,weapon:arm.key,index,group,
   side:index?-1:1,two:grip==='two',dual:grip==='dual',center27:axis==='vertical'&&grip!=='dual',x:grip==='dual'?(index?.57:.43):.5,
   y:grip==='dual'?(index?.57:.43):.5,...s,progress:0,held:false,holdSeconds:2.1};
 }
 function pose(d,w,h,age=d.age){
  const q=timing(d,w,h),G=q.G,T=clamp(age*1000/G.ms,0,q.stopT),angle=G.from+(G.to-G.from)*G.easing(T);
  return {angle,handle:{...G.pivot},point:d.center27?bladeIntersection(d,G,angle,w):headAt(d.arm,G.pivot,G.len,G.iw,angle,G.flip),len:G.len,iw:G.iw,flip:G.flip};
 }
 function criticalStrike(tid,arm,index,grip,group){
  const c=cards[tid];if(c.criticalGroup26!==group)return;
  const d=descriptor(arm,index,grip,group);c.weaponCuts.push(d);c.maskKey=null;
  SFX.play('sword_swing',{heavy:d.two||arm.kind==='axe'});
  objs.push({meta:{criticalStrike:true,target:tid,key:arm.key,tearId:d.id,depth:d.depth,scale:d.scale,side:d.side,holdSeconds:2.1},hit:false,bleed:0,cutBleed:0,update(dt){
   if(c.criticalGroup26!==group||!c.weaponCuts.includes(d))return false;
   const r=R(tid);if(!r.w||!r.h)return true;
   const q=timing(d,r.w,r.h),age=d.age,p=pose(d,r.w,r.h),impact=age-q.end;
   if(impact>2.46)return false;
   const entry={x:r.x+p.point.x,y:r.y+p.point.y},alpha=1-smooth((impact-2.1)/.36);
   this.meta.phase=age<q.begin?'windup':age<q.end?'cut':d.held?'stuck':'fade';
   Object.assign(this.meta,{entry,handle:{x:r.x+p.handle.x,y:r.y+p.handle.y},angle:p.angle,drawnFlip:p.flip,held:d.held,progress:d.progress});
   if(d.progress>0&&impact<0){this.cutBleed+=dt;while(this.cutBleed>.028){this.cutBleed-=.028;bloodBurst(tid,entry.x,entry.y,d.side*.25,.5,.08,false);}}
   if(!this.hit&&impact>=0){
    this.hit=true;SFX.play(arm.kind==='axe'?'axe_hit':'sword_hit',{crit:true});SFX.play('crit');SFX.play('sword_stuck');
    bloodBurst(tid,entry.x,entry.y,d.side*.38,.7,d.two?.9:.65,false);
    flashDecal(tid,'rgb(255,70,40)',220,.48);knock(tid,d.two||arm.kind==='axe'?'jolt':'shake',1.1);
    hitstopFor(d.two?110:75);shake(d.two?12:8);vignette=.8;
    const damage=dmgFor('crit')+(d.two?3:0);hurt(tid,damage);sayDamage(tid,'crit',damage,index);
   }
   if(d.held){this.bleed+=dt;while(this.bleed>.16){this.bleed-=.16;part({kind:'drop',embeddedBleed:true,owner:tid,tearId:d.id,
    x:entry.x+rnd(-.013,.013)*r.w,y:entry.y,vx:rnd(-8,8),vy:rnd(16,35),ay:r.h*1.6,size:r.w*rnd(.008,.012),life:.5,color:'#8e0e16'});}}
   ctx.save();
   const tr=getComputedStyle(c.el).transform;if(tr!=='none'){
    const m=new DOMMatrix(tr);ctx.translate(r.cx,r.cy);ctx.transform(m.a,m.b,m.c,m.d,m.e,m.f);ctx.translate(-r.cx,-r.cy);
   }
   ctx.translate(r.x,r.y);
   const trailAlpha=1-smooth(impact/.12),hist=[],trailFrom=arm.kind==='axe'?.62:.5;
   if(trailAlpha>0){
    for(let i=8;i>=0;i--){const a=age-i/60*speed;if(a<0)continue;const z=pose(d,r.w,r.h,a),s=Math.sin(z.angle),co=Math.cos(z.angle);
     hist.push([z.handle.x+s*z.len*trailFrom,z.handle.y-co*z.len*trailFrom,z.handle.x+s*z.len*.98,z.handle.y-co*z.len*.98]);}
    ctx.save();ctx.globalCompositeOperation='lighter';ctx.fillStyle='rgb(255,190,150)';
    for(let i=1;i<hist.length;i++){const a=hist[i-1],b=hist[i];ctx.globalAlpha=i/hist.length*.38*alpha*trailAlpha;
     ctx.beginPath();tracePolygon(ctx,[[a[0],a[1]],[a[2],a[3]],[b[2],b[3]],[b[0],b[1]]]);ctx.fill();}ctx.restore();
   }
   ctx.globalAlpha=alpha;
   if(d.progress>0&&d.center27){
    const k=r.h*4;ctx.beginPath();ctx.rect(-k,-k,k+p.point.x,k*2);ctx.clip();
   }else if(d.progress>0){
    const n={x:Math.sin(p.angle),y:-Math.cos(p.angle)},v={x:-n.y,y:n.x},hidden=(arm.kind==='axe'?.20:.28)*p.len*(1-smooth(d.progress/.40));
    const E={x:p.point.x+n.x*hidden,y:p.point.y+n.y*hidden},k=r.h*4;
    ctx.beginPath();tracePolygon(ctx,[[E.x+v.x*k,E.y+v.y*k],[E.x-v.x*k,E.y-v.y*k],[E.x-v.x*k-n.x*k,E.y-v.y*k-n.y*k],[E.x+v.x*k-n.x*k,E.y+v.y*k-n.y*k]]);ctx.clip();
   }
   ctx.translate(p.handle.x,p.handle.y);ctx.rotate(p.angle);if(p.flip)ctx.scale(-1,1);ctx.shadowColor='rgba(0,0,0,.6)';ctx.shadowBlur=12;
   ctx.drawImage(IMG[arm.key],-arm.hx*p.iw,-p.len,p.iw,p.len);ctx.restore();return true;
  }});
 }
 const normalStrike=FX.strike;
 FX.strike=function(tid,out=outcome(),g=gear()){
  if(out!=='crit'){normalStrike(tid,out,g);return;}
  const arms=armsFor(g),group=++sequence,c=cards[tid];c.criticalGroup26=group;
  c.weaponCuts=(c.weaponCuts||[]).filter(d=>d.axis==='horizontal');c.maskKey=null;
  arms.forEach((arm,i)=>after(i*170,()=>criticalStrike(tid,arm,i,g.grip,group)));
 };
 function horizontalCut(id,index,dual,two){
  const y=dual?(index?.57:.43):.5,life=3.2;
  return decal(id,{life,texturedCut:true,whirlwindCut:true,endpoints:[.17,y,.83,y],draw(x,w,h,a){
   const width=w*(two?.062:.044),len=w*.66;x.save();x.globalAlpha=smooth((life-a)/.7);x.translate(w*.17,h*y);x.rotate(-Math.PI/2);
   x.beginPath();x.rect(-width,0,width*2,len*smooth(a/.09));x.clip();atlasDraw(x,IMG.cuts_atlas,CUT_SPRITES.cuts[0],-width/2,0,width,len);x.restore();
  }});
 }
 function sweepContact(id,out,arms,g,group){
  const r=R(id),crit=out==='crit',two=g.grip==='two';
  // Preserve one damage event per target from the accepted full-lab orbit.
  // Suppress its old diagonal decal, then add one/two approved horizontal cuts.
  cutContext={critical:true};try{sweepImpact(id,out,r.cx,r.cy,0,arms[0],two);}finally{cutContext=null;}
  if(out!=='hit'&&!crit)return;
  arms.forEach((arm,index)=>{
   const add=()=>{const c=cards[id];if(c.sweepGroup26!==group)return;
    if(crit){const d=descriptor(arm,index,g.grip,group,'horizontal');d.progress=.00001;d.life=4.31;c.weaponCuts.push(d);c.maskKey=null;
     const tip=path(d,1,r.w,r.h);bloodBurst(id,r.x+tip.x,r.y+tip.y,1,.15,index?.42:.25,false);
    }else horizontalCut(id,index,arms.length===2,two);
   };if(index)after(170,add);else add();
  });
 }
 FX.sweep=function(tid,out=outcome(),g=gear()){
  // A row-wide attack must show every target even if a single-card close-up
  // was selected for the previous melee test.
  if(stage.classList.contains('focus')){$('focus').checked=false;stage.classList.remove('focus');resize();}
  const ids=sweepTargets(tid),arms=armsFor(g),total=DuelDemo.kind==='sweep'?(g.grip==='two'?2.55:2.25):(g.grip==='two'?1.65:1.35),group=++sequence,done=new Set();
  ids.forEach(id=>{const c=cards[id];c.sweepGroup26=group;c.weaponCuts=(c.weaponCuts||[]).filter(d=>d.axis!=='horizontal');c.el.classList.add('swept');c.maskKey=null;});
  after(total*1000+300,()=>ids.forEach(id=>{if(cards[id].sweepGroup26===group)cards[id].el.classList.remove('swept');}));
  SFX.play('sweep');SFX.play('sword_swing',{heavy:g.grip==='two'});
  objs.push({meta:{whirlwind:true,clockwise:true,targets:ids,grip:g.grip},update(){
   const t=this.age/total;if(t>1)return false;
   const rects=ids.map(R),left=Math.min(...rects.map(r=>r.x)),right=Math.max(...rects.map(r=>r.x+r.w));
   const arena=DuelDemo.orbit(),cx=arena?arena.cx:(left+right)/2,cy=arena?arena.cy:rects[0].cy,rx=arena?arena.rx:(right-left)*.48,ry=arena?arena.ry:rects[0].h*.3;
   const alpha=smooth(t/.12)*smooth((1-t)/.15),a=arena?-Math.PI*.8+t*Math.PI*2*1.2:-Math.PI/2+t*Math.PI*4;this.meta.center={x:cx,y:cy};this.meta.angle=a;
   ctx.save();ctx.translate(cx,cy);ctx.scale(1,ry/Math.max(1,rx));ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.23*alpha;
   for(let k=0;k<3;k++){ctx.strokeStyle=k===0?'#ffdb91':'#e7f1ff';ctx.lineWidth=(9-k*2)*rects[0].w/160;ctx.beginPath();ctx.arc(0,0,rx-k*3,a-1.5-k*.2,a);ctx.stroke();}ctx.restore();
   arms.forEach((weapon,i)=>{
    const angle=a+i*Math.PI,im=IMG[weapon.key],len=weapon.physical.height,iw=weapon.physical.width;
    ctx.save();ctx.globalAlpha=alpha*(.82+Math.sin(angle)*.18);ctx.translate(cx+Math.cos(angle)*(arena?rx-len*.62:rx*.48),cy+Math.sin(angle)*(arena?ry-len*.62:ry*.48));
    ctx.rotate(angle+Math.PI/2);ctx.scale(1,.8+Math.sin(angle)*.13);ctx.drawImage(im,-weapon.hx*iw,-len*.7,iw,len);ctx.restore();
   });
   ids.forEach((id,i)=>{
    let contact=.24+i/Math.max(1,ids.length-1)*.44;
    if(arena){const r=R(id),angle=Math.atan2((r.cy-cy)/ry,(r.cx-cx)/rx),tau=Math.PI*2,norm=v=>(v%tau+tau)%tau;
     contact=Math.min(...arms.map((_,j)=>norm(angle+Math.PI*.8-j*Math.PI)))/(tau*1.2);
    }
    if(t>=contact&&!done.has(id)){done.add(id);DuelDemo.contact(id);sweepContact(id,perTargetOutcome(id,out),arms,g,group);}
   });return true;
  }});
 };
 FX.double=(tid,out=outcome())=>bowShot(tid,[out,out]);
 FX.clear=function(){legacyClear();for(const c of Object.values(cards)){c.weaponCuts=[];c.criticalGroup26=c.sweepGroup26=null;c.maskKey=null;c.el.classList.remove('ripped');}};
 setupLab=function(){
  legacySetup();for(const c of Object.values(cards))c.weaponCuts=[];
  const snap=VFX.snapshot;VFX.snapshot=()=>{const s=snap();for(const[id,c]of Object.entries(cards)){
   const w=c.el.offsetWidth,h=c.el.offsetHeight;
   s.cards[id].meleeTears=c.weaponCuts.map(d=>({id:d.id,axis:d.axis,centered:!!d.center27,age:d.age,scale:d.scale,depth:d.depth,x:d.x,key:d.weapon,held:d.held,
    progress:progress(d,w,h),origin:path(d,0,w,h),tip:path(d,progress(d,w,h),w,h),finalTip:path(d,1,w,h)}));
   s.cards[id].weaponCut=active(c).length>0;
   if(c.weaponCuts.some(d=>d.axis==='horizontal'))s.cards[id].tearAxis='horizontal';
  }return s;};
  VFX.activeTears=active;VFX.tearPolygon=tearPolygon;
  VFX.approvedCrits={timing,progress,path,sample,samples,gap,pose,descriptor,allCuts,bladeIntersection};
 };
})();

/* Approved divine healing renderer and laboratory host adapter.
   Soft receiving ends, dense hand vortices and two independent rising beams.
   The already approved holyPillar() remains the incoming resurrection effect. */
(()=>{
'use strict';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),mix=(a,b,p)=>a+(b-a)*p;
const smooth=v=>{v=clamp(v);return v*v*(3-2*v);},TAU=Math.PI*2;
const rnd=n=>{const k=Math.sin(n*127.1+311.7)*43758.5453123;return k-Math.floor(k);};
const rgba=(c,a=1)=>`rgba(${c[0]},${c[1]},${c[2]},${clamp(a)})`;
const glows=new Map();
const SPELLS={beam:{charge:1,travel:.28,hold:.75,fade:.32,total:4.4,heal:18,color:[127,245,137]},
 royal:{charge:2,travel:.38,hold:1,fade:.5,total:5.8,heal:45,color:[255,222,141]},
 revive:{charge:3,travel:.42,hold:1.6,fade:.45,total:6.3,heal:50,color:[255,231,167]}};
const WEAPONS={wand:{key:'staff_fire',grip:[.50,.78],tip:[.48,.09],length:.58},staff:{key:'staff_purple',grip:[.356,.72],tip:[.376,.171],length:.98}};
const HANDS={left:[.145,.462],right:[.824,.462]};
function glow(c){const key=c.join(',');if(glows.has(key))return glows.get(key);
 const im=document.createElement('canvas');im.width=im.height=128;const x=im.getContext('2d'),g=x.createRadialGradient(64,64,0,64,64,64);
 g.addColorStop(0,rgba(c,.94));g.addColorStop(.19,rgba(c,.66));g.addColorStop(.5,rgba(c,.19));g.addColorStop(1,rgba(c,0));
 x.fillStyle=g;x.fillRect(0,0,128,128);glows.set(key,im);return im;}
function halo(x,y,r,c,alpha=1){if(r<=0||alpha<=0)return;ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=clamp(alpha);ctx.drawImage(glow(c),x-r,y-r,r*2,r*2);ctx.restore();}
function line(points,color,width,alpha=1){if(!points.length||width<=0||alpha<=0)return;ctx.save();ctx.globalAlpha=clamp(alpha);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();ctx.restore();}
function star(x,y,r,alpha=1){ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=clamp(alpha);ctx.fillStyle='#fff8d4';ctx.beginPath();ctx.moveTo(x,y-r);ctx.quadraticCurveTo(x+r*.13,y-r*.13,x+r*.58,y);ctx.quadraticCurveTo(x+r*.13,y+r*.13,x,y+r);ctx.quadraticCurveTo(x-r*.13,y+r*.13,x-r*.58,y);ctx.quadraticCurveTo(x-r*.13,y-r*.13,x,y-r);ctx.fill();ctx.restore();}
function leaf(x,y,size,angle,alpha=1){ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.globalAlpha=clamp(alpha);ctx.fillStyle='#a2ec71';ctx.strokeStyle='#e4ffba';ctx.lineWidth=Math.max(.5,size*.1);ctx.beginPath();ctx.moveTo(-size,0);ctx.quadraticCurveTo(-size*.15,-size*.9,size,0);ctx.quadraticCurveTo(-size*.15,size*.62,-size,0);ctx.fill();ctx.beginPath();ctx.moveTo(-size*.6,0);ctx.lineTo(size*.75,0);ctx.stroke();ctx.restore();}
function createRenderer(spell,weapon,targetId){
 const state={spell,weapon,target:'right',t:0,clean:false};let rects={};
 const beamLayer=document.createElement('canvas'),beamCtx=beamLayer.getContext('2d');
 function locate(){const source=R('h_pri'),target=R(targetId);state.target=target.cx<source.cx?'left':'right';rects={priest:source,left:target,right:target};}
 locate();
function hand(side){const r=rects.priest,p=HANDS[side];return{x:r.x+r.w*p[0],y:r.y+r.h*p[1]};}
function aim(){const r=rects[state.target];return{x:r.cx,y:r.y+r.h*.44};}
function weaponPose(time=state.t){return MagicFitPose('h_pri',state.weapon,{mode:'heal',targetId,time,charge:SPELLS[state.spell].charge,returnAt:timings().end});}
function timings(){const s=SPELLS[state.spell],release=s.charge,arrival=release+s.travel,land=arrival+(state.spell==='revive'?.2:0);return{release,arrival,land,end:arrival+s.hold+s.fade,total:s.total};}
function drawWeapon(p){const tm=timings(),s=SPELLS[state.spell],alpha=smooth(state.t/.16)*(1-smooth((state.t-(state.spell==='revive'?3.25:tm.end-.15))/.45));if(alpha<=0)return;
 ctx.save();ctx.globalAlpha=alpha;ctx.translate(p.base.x,p.base.y);ctx.rotate(p.angle);ctx.shadowColor='#0008';ctx.shadowBlur=8;ctx.drawImage(IMG[p.s.key],-p.s.grip[0]*p.width,-p.s.grip[1]*p.len,p.width,p.len);ctx.restore();
 if(state.t<s.charge&&state.spell!=='revive'){
  const power=smooth(state.t/s.charge);ctx.save();ctx.globalCompositeOperation='lighter';const pts=[];
  for(let j=0;j<=25;j++){const u=j/25,dx=p.tip.x-p.base.x,dy=p.tip.y-p.base.y,len=Math.hypot(dx,dy),off=Math.sin(u*TAU*1.6-state.t*4)*p.width*.10;
   pts.push({x:p.base.x+dx*u-dy/len*off,y:p.base.y+dy*u+dx/len*off});}
  line(pts,'#ffecb4',Math.max(.7,rects.priest.w*.007),power*.65);ctx.restore();
 }}
function charge(p){const s=SPELLS[state.spell],time=state.t;if(time<0||time>s.charge+.25)return;const progress=clamp(time/s.charge),fade=1-smooth((time-s.charge)/.25),w=rects.priest.w,royal=state.spell==='royal',r=w*(royal?.035+.105*progress:.024+.05*progress),pulse=1+.065*Math.sin(time*9);
 halo(p.tip.x,p.tip.y,r*3.2,[255,214,123],fade*(.22+.33*progress));halo(p.tip.x,p.tip.y,r*pulse,s.color,fade);halo(p.tip.x,p.tip.y,r*.39,[255,255,231],fade*progress);
 ctx.save();ctx.globalCompositeOperation='lighter';
 for(let j=0;j<(royal?3:2);j++){const pts=[];for(let i=0;i<=58;i++){const a=i/58*TAU,rad=r*(1.1+j*.28),spin=time*(j%2?-.8:1.1);pts.push({x:p.tip.x+Math.cos(a+spin)*rad,y:p.tip.y+Math.sin(a+spin)*rad*.48+Math.cos(a)*rad*.18});}
  line(pts,j%2?'#fff8d0':'#ffd177',Math.max(.6,w*.006),fade*(.25+.5*progress));}
 for(let i=0;i<(royal?18:10);i++){const u=(time*(royal?.8:1.2)+rnd(i+4))%1,a=rnd(i+72)*TAU+time*.6,rr=w*(.32*(1-u)+.022),x=p.tip.x+Math.cos(a)*rr,y=p.tip.y+Math.sin(a)*rr*.77;
  halo(x,y,w*.016,[255,227,163],Math.sin(u*Math.PI)*fade*.65*progress);}
 ctx.restore();
 if(!royal)for(let i=0;i<3;i++){const a=time*1.9+i*TAU/3;leaf(p.tip.x+Math.cos(a)*r*1.65,p.tip.y+Math.sin(a)*r*.7,w*.017,a,fade*progress*.75);}
}
function ring(x,y,r,age,life,color,width,ellipse=1){if(age<0||age>life)return;const p=clamp(age/life);ctx.save();ctx.globalCompositeOperation='lighter';ctx.strokeStyle=rgba(color,(1-p)*.8);ctx.lineWidth=width*(1-p*.6);ctx.beginPath();ctx.ellipse(x,y,r*(.2+.8*p),r*(.2+.8*p)*ellipse,0,0,TAU);ctx.stroke();ctx.restore();}
function number(r,text,age,color){if(age<0||age>2)return;ctx.save();ctx.globalAlpha=smooth(age/.15)*(1-smooth((age-1.3)/.7));ctx.textAlign='center';ctx.font=`700 ${Math.max(18,r.w*.14)}px Georgia,serif`;ctx.shadowColor='#10180e';ctx.shadowBlur=8;ctx.fillStyle=color;ctx.fillText(text,r.cx,r.y+r.h*.3-age*r.h*.055);ctx.restore();}
function healingArrival(){const tm=timings(),age=state.t-tm.arrival;if(age<0||age>2.5)return;const royal=state.spell==='royal',r=rects[state.target],s=SPELLS[state.spell],fade=smooth(age/.12)*(1-smooth((age-1.05)/1.3));
 halo(r.cx,r.y+r.h*.48,r.w*(royal?.85:.58),s.color,fade*(royal?.42:.25));
 ctx.save();ctx.beginPath();ctx.roundRect(r.x,r.y,r.w,r.h,7);ctx.clip();const g=ctx.createLinearGradient(0,r.y+r.h,0,r.y);g.addColorStop(0,rgba(s.color,fade*(royal?.32:.2)));g.addColorStop(.8,rgba(s.color,0));ctx.fillStyle=g;ctx.fillRect(r.x,r.y,r.w,r.h);ctx.restore();
 ring(r.cx,r.y+r.h*.5,r.w*.57,age,.85,s.color,royal?3:2);if(royal)ring(r.cx,r.y+r.h*.85,r.w*.67,age-.18,1.05,[255,241,192],2,.25);
 for(let i=0;i<(royal?25:13);i++){const delay=rnd(i+190)*.6,a=age-delay,life=1.2+rnd(i+26)*.7;if(a<0||a>life)continue;const u=a/life,x=r.x+r.w*(.1+.8*rnd(i+910))+Math.sin(u*4+i)*r.w*.04,y=r.y+r.h*(.87-u*.65),alpha=Math.sin(u*Math.PI)*.8;
  if(!royal&&i%2===0)leaf(x,y,r.w*(.017+.006*rnd(i)),i+u*1.6,alpha);else{halo(x,y,r.w*(royal?.025:.018),s.color,alpha*.65);if(royal&&i%3===0)star(x,y,r.w*.022,alpha);}}
 number(r,'+'+s.heal,age,royal?'#fff0ba':'#c3ffa3');
}

 function softRibbon(points,width,alpha=1){
  if(alpha<=0||points.length<2)return;
  ctx.save();ctx.globalCompositeOperation='lighter';
  ctx.filter=`blur(${Math.max(.6,width*.52)}px)`;line(points,'#eeb954',width*2.1,alpha*.24);
  ctx.filter=`blur(${Math.max(.45,width*.21)}px)`;line(points,'#ffe6a8',width,alpha*.53);
  ctx.filter=`blur(${Math.max(.35,width*.12)}px)`;line(points,'#fff8d8',width*.48,alpha*.48);
  ctx.restore();
 }
 function receivingMist(head,angle,age,alpha,royal,w){
  if(alpha<=0||age<0)return;const spread=smooth(age/.22),c=royal?[255,224,160]:[160,241,149];
  for(let i=0;i<19;i++){
   const u=(age*(.43+.12*rnd(i+1))+rnd(i+46))%1,side=i%2?1:-1;
   const outward=w*(.025+u*.23)*spread,across=side*w*(.025+u*.31)*spread*(.5+.5*rnd(i+8));
   const x=head.x+Math.cos(angle)*outward-Math.sin(angle)*across;
   const y=head.y+Math.sin(angle)*outward+Math.cos(angle)*across-w*u*.07;
   const r=w*(.045+u*.07)*(royal?1.15:.9),a=alpha*Math.sin(u*Math.PI)*.14;
   ctx.save();ctx.translate(x,y);ctx.rotate(angle+side*.65);ctx.scale(1.5,.72);
   halo(0,0,r,c,a);halo(-r*.27,0,r*.7,[255,231,169],a*.5);ctx.restore();
  }
 }
 function drawBeam(p){
  const s=SPELLS[state.spell],tm=timings(),age=state.t-tm.release;if(age<0||state.t>tm.end)return;
  const royal=state.spell==='royal',end=aim(),dx=end.x-p.tip.x,dy=end.y-p.tip.y,len=Math.hypot(dx,dy),angle=Math.atan2(dy,dx),front=clamp(age/s.travel);
  const fade=1-smooth((state.t-(tm.arrival+s.hold))/s.fade),w=rects.priest.w,bw=w*(royal?.085:.026),extent=len*smooth(front),pad=w*.32;
  if(extent<.01)return;
  const fw=Math.ceil((len+pad*2)*DPR),fh=Math.ceil(w*.85*DPR);
  if(beamLayer.width!==fw||beamLayer.height!==fh){beamLayer.width=fw;beamLayer.height=fh;}
  const b=beamCtx;b.setTransform(DPR,0,0,DPR,0,0);b.clearRect(0,0,fw/DPR,fh/DPR);b.translate(pad,fh/DPR/2);b.globalCompositeOperation='lighter';
  function ribbon(width,c,alpha){const g=b.createLinearGradient(0,-width/2,0,width/2);g.addColorStop(0,rgba(c,0));g.addColorStop(.35,rgba(c,.42*alpha));g.addColorStop(.5,rgba(c,alpha));g.addColorStop(.65,rgba(c,.42*alpha));g.addColorStop(1,rgba(c,0));b.fillStyle=g;b.fillRect(0,-width/2,extent,width);}
  ribbon(bw*(royal?5:8),[255,218,132],royal?.23:.20);ribbon(bw*2.6,s.color,.6);ribbon(bw,royal?[255,249,211]:[107,251,123],.98);ribbon(bw*(royal?.22:.13),royal?[255,255,236]:[194,255,184],royal?.92:.6);
  // Continue into a widening, faint fan before applying the spatial fade.
  const softLength=Math.min(extent*.7,w*.34),softStart=extent-softLength;
  b.lineCap='round';b.lineWidth=w*(royal?.009:.0055);
  for(let j=0;j<4;j++){
   b.strokeStyle=j%2?'#fff4c6':'#f5d47b';b.globalAlpha=j<2?.6:.2;b.beginPath();
   for(let k=0;k<=64;k++){const u=k/64,x=extent*u,fan=smooth((x-softStart)/Math.max(1,softLength)),a=x/Math.max(w,1)*TAU*1.7-state.t*4+j*Math.PI;
    const y=Math.sin(a)*bw*(royal?.8:1.65)*(1+fan*2)+(j-1.5)*w*.1*fan;
    k?b.lineTo(x,y):b.moveTo(x,y);
   }b.stroke();
  }
  b.globalAlpha=1;b.globalCompositeOperation='destination-in';
  const mask=b.createLinearGradient(0,0,extent,0);mask.addColorStop(0,'white');mask.addColorStop(clamp(softStart/extent,.01,.96),'white');mask.addColorStop(1,'transparent');b.fillStyle=mask;b.fillRect(-pad,-fh/DPR/2,fw/DPR,fh/DPR);
  ctx.save();ctx.translate(p.tip.x,p.tip.y);ctx.rotate(angle);ctx.globalAlpha=fade;ctx.globalCompositeOperation='lighter';ctx.drawImage(beamLayer,-pad,-fh/DPR/2,fw/DPR,fh/DPR);ctx.restore();
  const head={x:p.tip.x+dx*smooth(front),y:p.tip.y+dy*smooth(front)};
  receivingMist(head,angle,age,fade,royal,w);
  halo(p.tip.x,p.tip.y,bw*(royal?2.8:4),[255,239,181],fade*.42);
  for(let i=0;i<(royal?13:7);i++){const u=(age*(royal?.72:.92)+rnd(i+811))%1;if(u>front)continue;const a=u*TAU*1.3-state.t*2+i,off=Math.sin(a)*w*(royal?.085:.045),x=p.tip.x+dx*u-Math.sin(angle)*off,y=p.tip.y+dy*u+Math.cos(angle)*off;
   const al=fade*Math.sin(u*Math.PI)*(1-smooth((u-.7)/.3));
   if(royal)star(x,y,w*(.009+.009*rnd(i+33)),al*.85);else leaf(x,y,w*(.014+.004*rnd(i+25)),angle+a*.3,al);
  }
 }
 function palmEnergy(center,index){
  const time=state.t,w=rects.priest.w,p=smooth(time/3),fade=smooth(time/.35)*(1-smooth((time-3.12)/.7));
  if(fade<=0)return;
  const radius=w*(.07+.105*p),spin=time*1.75*(index?1:-1),width=w*(.034+.027*p);
  halo(center.x,center.y,radius*2.5,[255,217,137],fade*.3);halo(center.x,center.y,radius*.87,[255,243,199],fade*.3*p);
  for(let j=0;j<2;j++){
   const pts=[];for(let k=0;k<=68;k++){const u=k/68,a=u*TAU*1.42+spin+j*Math.PI,rr=radius*(.42+.58*u);
    pts.push({x:center.x+Math.cos(a)*rr,y:center.y+Math.sin(a)*rr*.65-(u-.5)*radius*.4});}
   softRibbon(pts,width*(j?.9:1.2),fade*(.25+.18*p));
  }
  for(let i=0;i<12;i++){const u=(time*.24+rnd(i+index*16))%1,a=spin+i*.93,rr=radius*(.72+u*.42);
   const x=center.x+Math.cos(a)*rr,y=center.y+Math.sin(a)*rr*.62;
   ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.scale(1.65,.8);halo(0,0,width*1.5,[255,229,164],fade*Math.sin(u*Math.PI)*.2);ctx.restore();}
 }
 function risingBeams(){
  const age=state.t-3;if(age<0||age>1.15)return;
  const w=rects.priest.w,front=smooth(age/.48),fade=1-smooth((age-.52)/.63),width=w*.108;
  for(let side=0;side<2;side++){
   const h=hand(side?'right':'left'),dir=side?1:-1,top=mix(h.y,-w*.36,front),pts=[],spiral=[];
   for(let i=0;i<=90;i++){const u=i/90,y=mix(h.y,top,u),rise=h.y-y,sp=rise/Math.max(1,w*.55)*TAU-state.t*1.75*dir;
    const x=h.x+dir*w*.105*u+Math.sin(u*Math.PI)*dir*w*.028;
    pts.push({x,y});spiral.push({x:x+Math.cos(sp)*width*.83,y:y+Math.sin(sp)*width*.35});}
   // Broad royal-heal core and a soft winding sleeve remain separate per palm.
   softRibbon(pts,width,fade*.95);softRibbon(spiral,width*.45,fade*.85);
   for(let i=0;i<15;i++){const u=i/14,p=pts[Math.round(u*90)],edge=Math.sin(u*Math.PI);halo(p.x,p.y,width*1.7,[255,229,161],fade*edge*.11);}
   const end=pts[pts.length-1];halo(end.x,end.y,width*1.4,[255,242,207],fade*.44);
  }
 }
 return {draw(time){state.t=time;locate();
   if(spell==='revive'){palmEnergy(hand('left'),0);palmEnergy(hand('right'),1);risingBeams();}
   else{const p=weaponPose();drawWeapon(p);charge(p);drawBeam(p);healingArrival();}
   const tm=timings();return {phase:time<tm.release?'charge':time<tm.arrival?'release':'land',hands:{left:hand('left'),right:hand('right')},hasWeapon:spell!=='revive',tip:spell==='revive'?null:weaponPose().tip,aim:aim(),timings:tm};
  },receive(time){state.t=time;locate();healingArrival();},pose(time){state.t=time;locate();return weaponPose();},drawBeamOnly(time){state.t=time;locate();drawBeam(weaponPose());},beamLayer};
 }


 Divine={createRenderer,SPELLS,WEAPONS,HANDS};
})();

const FIT_WEAPONS={wand:{key:'staff_fire',grip:[.50,.78],tip:[.48,.09]},staff:{key:'staff_purple',grip:[.356,.72],tip:[.376,.171]}};
// Preserve the approved upright artwork; replace the old low shaft pivot with its palm contact.
// The mage's accidental 0.9-degree rest rotation is explicitly reset to zero.
const FIT_LEGACY_DEFAULTS={mage:{wand:{x:.10789,y:.52673,length:.34631,angle:0},staff:{x:.09915,y:.56447,length:.64727,angle:0}},priest:{wand:{x:.0741,y:.5141,length:.35494,angle:0},staff:{x:.08577,y:.56827,length:.6506,angle:0}}};
const FIT_PALM_Y={mage:.442,priest:.452};
function migrateFitGrip(role,kind,p){
 const stock=FIT_WEAPONS[kind],approved=FIT_LEGACY_DEFAULTS[role][kind];
 const grip=[stock.grip[0],stock.grip[1]+(FIT_PALM_Y[role]-approved.y)/approved.length];
 const dy=(grip[1]-stock.grip[1])*p.length,a=p.angle*Math.PI/180;
 return{...p,x:p.x-Math.sin(a)*dy*16/9,y:p.y+Math.cos(a)*dy,grip};
}
const FIT_DEFAULTS=Object.fromEntries(Object.entries(FIT_LEGACY_DEFAULTS).map(([role,kinds])=>[role,Object.fromEntries(Object.entries(kinds).map(([kind,p])=>[kind,migrateFitGrip(role,kind,p)]))]));
const FIT_AIMING={pivot:'per-profile grip, calibrated to the visible palm',rest:'profiles preserve approved artwork placement; all default angles are 0 degrees',gripEditing:'changing grip also compensates x/y to keep resting artwork stationary',healing:{ally:'aim at recipient',self:'resting angle'},offense:{below:'resting angle',side:'tilt toward target relative to resting angle',maxSideTiltDegrees:45},charge:'follows transformed weapon tip',return:'smoothly to resting angle after release or beam end'};

const FitState={profiles:structuredClone(FIT_DEFAULTS)};
const fitClamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
function fitSmooth(v){v=fitClamp(v,0,1);return v*v*(3-2*v);}
function MagicFitPose(heroId,kind,cast=null){
 const role=heroId==='h_pri'?'priest':'mage',p=FitState.profiles[role][kind],s={...FIT_WEAPONS[kind],grip:p.grip},im=IMG[s.key],r=R(heroId),len=r.h*p.length,width=len*im.naturalWidth/im.naturalHeight,restAngle=p.angle*Math.PI/180,base={x:r.x+r.w*p.x,y:r.y+r.h*p.y},lx=(s.tip[0]-s.grip[0])*width,ly=(s.tip[1]-s.grip[1])*len;
 let offset=0,turn=0;
 if(cast&&cast.targetId&&cast.targetId!==heroId){
  const target=R(cast.targetId);
  if(cast.mode==='heal'){
   const aim={x:target.cx,y:target.y+target.h*.44};
   const desired=Math.atan2(aim.y-base.y,aim.x-base.x)-Math.atan2(ly,lx);
   // Shortest rotation to the ally, never move the grip or rescale the weapon.
   offset=Math.atan2(Math.sin(desired-restAngle),Math.cos(desired-restAngle));
  }else{
   // Compare card centres so an enemy directly below keeps the EXACT rest angle.
   offset=fitClamp(Math.atan2(target.cx-r.cx,Math.max(1,target.cy-r.cy)),-Math.PI/4,Math.PI/4);
  }
  const turnDuration=Math.min(.68,Math.max(.12,cast.charge*.7));
  turn=fitSmooth(cast.time/turnDuration)*(1-fitSmooth((cast.time-cast.returnAt)/.28));
 }
 const angle=restAngle+offset*turn;
 return{base,tip:{x:base.x+lx*Math.cos(angle)-ly*Math.sin(angle),y:base.y+lx*Math.sin(angle)+ly*Math.cos(angle)},angle,restAngle,tiltDegrees:offset*turn*180/Math.PI,len,width,s};
}
/* Only weapon placement changes: approved charge art and projectile callbacks are reused. */
castFrom=function(heroId,kind,col,onRelease,{charge=.32,towardId=null,chargeDraw=null}={}){
 heroId=labActor(heroId);const chosen=Lab.activeEnemy?(Lab.enemyWeapon==='wand'?'wand':'staff'):(heroId==='h_pri'?$('priestWeapon').value:$('mageWeapon').value),show=.15,rel=show+charge,life=rel+.4;let fired=false;
 SFX.play('magic_cast');
 objs.push({meta:{staff:chosen,fitted:true,actor:heroId},update(){
  const t=this.age;if(t>life)return false;
  const p=MagicFitPose(heroId,chosen,{mode:'attack',targetId:towardId,time:t,charge,returnAt:rel+.12}),tp=p.tip,al=t<.1?t/.1:t>life-.2?(life-t)/.2:1;
  if(t>show*.5&&t<rel)for(let i=0;i<2;i++){const aa=rnd(0,Math.PI*2),d=rnd(26,50);part({kind:'glow',x:tp.x+Math.cos(aa)*d,y:tp.y+Math.sin(aa)*d,vx:-Math.cos(aa)*d*4,vy:-Math.sin(aa)*d*4,size:rnd(2,4),life:.22,col});}
  ctx.save();ctx.globalAlpha=al;ctx.translate(p.base.x,p.base.y);ctx.rotate(p.angle);ctx.shadowColor='#0009';ctx.shadowBlur=10;ctx.drawImage(IMG[p.s.key],-p.s.grip[0]*p.width,-p.s.grip[1]*p.len,p.width,p.len);ctx.restore();
  const g=t<rel?clamp((t-show*.5)/charge,0,1):clamp(1-(t-rel)/.25,0,1);
  if(g>0){ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=g*al;const r=12+22*g;ctx.drawImage(glow(...col),tp.x-r,tp.y-r,r*2,r*2);ctx.restore();}
  if(chargeDraw&&t<rel){ctx.save();chargeDraw(tp,clamp((t-show)/charge,0,1),t);ctx.restore();}
  Object.assign(this.meta,{key:p.s.key,tip:tp,base:p.base,length:p.len,angle:p.angle,restAngle:p.restAngle,tiltDegrees:p.tiltDegrees});
  if(!fired&&t>=rel){fired=true;this.meta.releaseTip={...tp};part({kind:'glow',x:tp.x,y:tp.y,size:60,life:.25,col});ring(tp.x,tp.y,40,col,260,3);onRelease({...tp});}
  return true;
 }});
};


/* Ready for the final merge: keep flowing blood; remove stationary round splats. */
bloodDecal=function(id,px,py,dirx,diry,amount=1,life=4){
 const drips=Array.from({length:Math.ceil(3*amount)},()=>({x:px+rnd(-.08,.08),y:py+rnd(-.03,.05),len:rnd(.08,.22),r:rnd(.006,.012),dl:rnd(0,.4)}));
 return decal(id,{life,dripsOnly:true,draw(x,w,h,a){x.globalAlpha=.88*fadeOut(this,1.3);x.strokeStyle='#6a0909';x.lineCap='round';for(const d of drips){const L=d.len*ease.out(clamp((a-d.dl)/1.6,0,1));if(L<=0)continue;x.lineWidth=d.r*w;x.beginPath();x.moveTo(d.x*w,d.y*h);x.lineTo(d.x*w,(d.y+L)*h);x.stroke();}}});
};
bloodCrit=function(id,px,py,dirx,diry,life=5.5){
 const base=rnd(.1,.13),drips=Array.from({length:7},()=>{const x=px+rnd(-base,base)*.9,y=py+rnd(0,base*.6);return{x,y,len:Math.max(.05,(1-y)*rnd(.45,1)),r:rnd(.008,.016),dl:rnd(.05,.6),sp:rnd(1.6,3)};});
 return decal(id,{life,bloodCrit:true,dripsOnly:true,draw(x,w,h,a){x.globalAlpha=.9*fadeOut(this,1.5);x.strokeStyle='#5a0606';x.lineCap='round';for(const d of drips){const L=d.len*ease.out(clamp((a-d.dl)/d.sp,0,1));if(L<=0)continue;x.lineWidth=d.r*w;x.beginPath();x.moveTo(d.x*w,d.y*h);x.lineTo(d.x*w,(d.y+L)*h);x.stroke();}}});
};

/* Demo v4: the approved blade parry is shared with arrow defense.
   Bow draw, arrow flight, hits, crits and shield block remain unchanged. */
const v4FlyArrow=flyArrow,v4ArrowHit=arrowHit;
flyArrow=function(p0,plan,tid,out,len,shotIndex=0){
 if(out==='parry'){
  // Same 320ms flight; the existing parry blade reaches contact after its 110ms rise.
  const angle=Math.atan2(plan.p1.y-plan.c.y,plan.p1.x-plan.c.x),r=R(tid),ex=(plan.p1.x-r.x)/r.w,ey=(plan.p1.y-r.y)/r.h;
  after(210,()=>{const q=R(tid);parryBlade(tid,{x:q.x+ex*q.w,y:q.y+ey*q.h},angle+Math.PI/2,1);const blade=objs[objs.length-1];if(blade?.meta)blade.meta.arrowParry=true;});
 }
 return v4FlyArrow(p0,plan,tid,out,len,shotIndex);
};
arrowHit=function(tid,out,x,y,angle,len,shotIndex=0){
 if(out!=='parry')return v4ArrowHit(tid,out,x,y,angle,len,shotIndex);
 const q=R(tid),ex=(x-q.x)/q.w,ey=(y-q.y)/q.h;
 SFX.play('parry');sayDamage(tid,'parry',0,shotIndex);sparks(x,y,14,[255,238,186],350);
 part({kind:'glow',x,y,size:60,life:.18,col:[255,242,209]});shake(3);
 objs.push({meta:{arrowDeflected:true,target:tid,entry:{x,y}},update(){
  const t=this.age,life=.58;if(t>life)return false;
  const r=R(tid),u=smooth(t/.12),a=angle-u*.72-t*.7;
  // Keep the tip at the collision on frame zero, then knock the shaft away.
  ctx.translate(r.x+ex*r.w-150*t,r.y+ey*r.h-235*t+190*t*t);ctx.rotate(a);ctx.translate(-16,0);
  drawArrow(len,smooth((life-t)/.20));return true;
 }});
};

/* Approved demo 04 drawings, adapted to a card-relative renderer. No iframe or second animation loop. */
const CardEffects=(()=>{
 const TAU=Math.PI*2,clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t;
 const ease=t=>{t=clamp(t);return t*t*(3-2*t)},out=t=>1-Math.pow(1-clamp(t),3);
 const rand=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x)},rgba=(c,a)=>`rgba(${c},${clamp(a)})`;
 // The row contour is baked from cuts_atlas.png during packaging. Reading a
 // local PNG back from canvas is forbidden under normal file:// browser security.
 function create(effect,outcome='hit',deathWord='ПОМЕР',neckY=.23){
 let ctx;const card={x:0,y:0,w:260,h:462},S={effect,outcome,blood:1,numbers:false,neckX:.5,neckY},IM={hp:IMG.potion_hp,mp:IMG.potion_mp};
 const measure=document.createElement('canvas');measure.width=400;measure.height=90;const tx=measure.getContext('2d');tx.font='bold 50px Georgia,serif';const deathFontSize=50*Math.min(1,236/tx.measureText(deathWord).width);tx.font='bold '+deathFontSize+'px Georgia,serif';tx.fillText(deathWord,0,deathFontSize);const pxs=tx.getImageData(0,0,400,90).data,deathLetters=[];
 for(let px=7;px<tx.measureText(deathWord).width-3;px+=13){let y=80;while(y>5&&pxs[(y*400+px)*4+3]<150)y--;if(y>15)deathLetters.push({x:px,y})}
function roundRect(x,y,w,h,r=12){ctx.beginPath();ctx.roundRect(x,y,w,h,r)}
function line(x1,y1,x2,y2,color,width=1){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke()}
function dot(x,y,r,color){if(r<=0)return;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fillStyle=color;ctx.fill()}
function text(str,x,y,size=14,color='#dfdccb',align='center',font='system-ui'){ctx.fillStyle=color;ctx.textAlign=align;ctx.font=`${size}px ${font}`;ctx.fillText(str,x,y)}
function glow(x,y,r,col,a=1,rx=1,ry=1){ctx.save();ctx.translate(x,y);ctx.scale(rx,ry);const g=ctx.createRadialGradient(0,0,0,0,0,r);g.addColorStop(0,rgba(col,a));g.addColorStop(.35,rgba(col,a*.42));g.addColorStop(1,rgba(col,0));ctx.fillStyle=g;ctx.fillRect(-r,-r,r*2,r*2);ctx.restore()}
function star(x,y,r,col,a){ctx.save();ctx.translate(x,y);ctx.globalAlpha=clamp(a);ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(0,-r);ctx.quadraticCurveTo(r*.15,-r*.15,r,0);ctx.quadraticCurveTo(r*.15,r*.15,0,r);ctx.quadraticCurveTo(-r*.15,r*.15,-r,0);ctx.quadraticCurveTo(-r*.15,-r*.15,0,-r);ctx.fill();ctx.restore()}
function clipCard(){roundRect(card.x+3,card.y+3,card.w-6,card.h-6,10);ctx.clip()}
function tracePolygon(x,pts){pts.forEach((p,i)=>i?x.lineTo(p[0],p[1]):x.moveTo(p[0],p[1]));x.closePath();}
function potionEffect(t){const mana=S.effect==='mp',col=mana?'48,177,255':'240,45,90',bright=mana?'#c9f9ff':'#ffdae7';const nx=card.x+card.w*S.neckX,ny=card.y+card.h*S.neckY;
const intro=out(t/.38),tilt=ease((t-.38)/.42),fade=1-ease((t-2.20)/.65),ang=tilt*2.02;
const bx=nx-38,by=ny-123+(1-intro)*-19,h=152*.70,w=h*IM[S.effect].width/IM[S.effect].height,scale=.8+.2*intro;
const mouthLocal={x:0,y:-h*.273};const mx=bx-Math.sin(ang)*mouthLocal.y*scale,my=by+Math.cos(ang)*mouthLocal.y*scale;
const flow=clamp((t-.72)/.18)*(1-ease((t-1.98)/.20));
if(t>.74&&t<2.85){const arrival=clamp((t-.74)/.31);const ex=lerp(mx,nx,arrival),ey=lerp(my,ny,arrival);ctx.save();ctx.lineCap='round';const gradient=ctx.createLinearGradient(mx,my,nx,ny+4);gradient.addColorStop(0,rgba(col,.92*flow));gradient.addColorStop(.6,rgba(col,.78*flow));gradient.addColorStop(.87,rgba(col,.18*flow));gradient.addColorStop(1,rgba(col,0));ctx.strokeStyle=gradient;ctx.lineWidth=7.6;ctx.shadowColor=rgba(col,.5);ctx.shadowBlur=9;ctx.beginPath();ctx.moveTo(mx,my);ctx.bezierCurveTo(mx+6,my+26,ex-11,ey-32,ex,ey);ctx.stroke();ctx.shadowBlur=0;ctx.lineWidth=1.9;const gg=ctx.createLinearGradient(mx,my,nx,ny);gg.addColorStop(0,rgba(mana?'220,255,255':'255,205,219',flow*.95));gg.addColorStop(.75,rgba(mana?'160,237,255':'255,158,193',flow*.4));gg.addColorStop(1,'#fff0');ctx.strokeStyle=gg;ctx.stroke();ctx.restore()}
for(let i=0;i<64;i++){const born=.73+i*.023,age=t-born,dur=.32+rand(i+53)*.09;if(age<0||age>dur||born>2.18)continue;const p=age/dur,x=lerp(mx,nx,p)+(Math.sin(p*8+i)*2+rand(i)*4-2)*p,y=lerp(my,ny,p*p*.6+p*.4);const a=Math.pow(1-p,1.0)*.95;dot(x,y,(2+rand(i+1)*2.2)*(1-p*.5),rgba(col,a));if(i%4===0)star(x+3,y-1,2.5,bright,a)}
const vapour=clamp((t-1.02)/.22)*(1-ease((t-2.42)/.66));if(vapour>0){ctx.save();ctx.globalCompositeOperation='screen';glow(nx,ny+3,52,col,.25*vapour,1,.48);for(let i=0;i<28;i++){const birth=1.00+i*.047,age=t-birth,dur=.65+rand(i+99)*.25;if(age<0||age>dur)continue;const p=age/dur,side=rand(i+402)*2-1,x=nx+side*38*Math.sin(p*Math.PI*.6),y=ny+5-p*(7+rand(i+220)*11)+Math.sin(i)*3;const a=Math.sin(Math.PI*p)*.19;glow(x,y,9+15*p,col,a,1.6,.55);if(i%3===0)star(x,y,1.8+rand(i)*2,bright,Math.sin(Math.PI*p)*.8)}ctx.restore()}
if(t<3&&intro>0){ctx.save();ctx.translate(bx,by);ctx.rotate(ang);ctx.scale(scale,scale);ctx.globalAlpha=intro*fade;ctx.shadowColor=rgba(col,.35);ctx.shadowBlur=14;const im=IM[S.effect];if(t<.35)ctx.drawImage(im,-w/2,-h/2,w,h);else{const cut=.222,sy=im.height*cut;ctx.drawImage(im,0,sy,im.width,im.height-sy,-w/2,-h/2+h*cut,w,h*(1-cut));ctx.shadowBlur=0;ctx.fillStyle=mana?'#143846':'#452331';ctx.beginPath();ctx.ellipse(0,-h*.274,w*.17,h*.011,0,0,TAU);ctx.fill();ctx.strokeStyle='#b6e8f8';ctx.lineWidth=1;ctx.stroke()}ctx.restore();
if(t>.35&&t<.88){const p=clamp((t-.35)/.53);ctx.save();ctx.translate(bx-14-p*46,by-53*.70-p*44);ctx.rotate(-p*2);ctx.globalAlpha=1-p;ctx.drawImage(im,im.width*.345,im.height*.087,im.width*.31,im.height*.156,-w*.155,-h*.078,w*.31,h*.156);ctx.restore()}
if(t>2.18)for(let i=0;i<15;i++){const p=clamp((t-2.18-rand(i)*.16)/.72);if(p<=0||p>=1)continue;glow(bx+(rand(i+432)-.5)*70+p*17,by+(rand(i+72)-.5)*65-p*22,9+p*14,col,Math.sin(p*Math.PI)*.1)}}
if(S.numbers&&t>1.34){const p=clamp((t-1.34)/1.65),a=clamp(p/.13)*(1-ease((p-.6)/.4));ctx.save();ctx.globalAlpha=a;ctx.shadowColor=rgba(col,.8);ctx.shadowBlur=10;text(mana?'+10 MP':'+10 HP',nx+107,ny+23-out(p)*22,25,bright,'center','Georgia');ctx.restore()}
}
function soulShape(x,y,size,t,a){
 ctx.save();ctx.translate(x,y);ctx.scale(size,size);ctx.globalCompositeOperation='screen';
 for(let k=0;k<3;k++){
  ctx.save();ctx.filter='blur('+(k===0?8:k===1?3:1.2)+'px)';ctx.globalAlpha=a*(k===0?.17:k===1?.16:.11);
  const g=ctx.createLinearGradient(0,-64,0,135);g.addColorStop(0,'#e6f4e7');g.addColorStop(.48,'#b8dbc9');g.addColorStop(1,'#8aac9c00');ctx.fillStyle=g;
  const wave=Math.sin(t*2.2)*6;ctx.beginPath();ctx.moveTo(-15,-29);ctx.bezierCurveTo(-40,-15,-48,5,-34,41);ctx.bezierCurveTo(-25,27,-28,9,-17,12);ctx.bezierCurveTo(-17,63,25+wave,82,-8+wave,130);ctx.bezierCurveTo(43,100,23,45,19,14);ctx.bezierCurveTo(35,16,24,41,35,50);ctx.bezierCurveTo(52,8,37,-16,15,-29);ctx.bezierCurveTo(26,-48,17,-68,0,-68);ctx.bezierCurveTo(-19,-67,-27,-48,-15,-29);ctx.closePath();ctx.fill();ctx.restore();
 }
 for(let i=0;i<12;i++){const u=rand(i+917),xx=Math.sin(t*1.4+i*1.7)*(17+u*22),yy=5+u*97+Math.cos(t*1.8+i)*9;glow(xx,yy,12+u*15,'161,200,179',a*.055,1,1.7);}
 ctx.restore();
}
function drawDeathWord(t){
 const age=t-.9;if(age<=0)return;const wordX=card.x+card.w*.5,wordY=card.y+card.h*.62,fontSize=deathFontSize;
 const settle=ease((age-4.25)/.75),color=settle<1?`rgb(${Math.round(147-65*settle)},${Math.round(13+15*settle)},${Math.round(27+7*settle)})`:'#521c22';
 ctx.save();ctx.font='bold '+fontSize+'px Georgia,serif';ctx.textAlign='left';const widths=[...deathWord].map(ch=>ctx.measureText(ch).width),total=widths.reduce((a,b)=>a+b,0);let x=wordX-total/2;
 for(let i=0;i<deathWord.length;i++){const show=ease((age-i*.10)/.36);if(show>0){ctx.save();ctx.globalAlpha=show;ctx.beginPath();ctx.rect(x-2,wordY-fontSize-4,widths[i]+4,(fontSize+12)*show);ctx.clip();ctx.lineWidth=1.3;ctx.strokeStyle='#280a11';ctx.strokeText(deathWord[i],x,wordY);ctx.fillStyle=color;ctx.fillText(deathWord[i],x,wordY);ctx.restore();}
  x+=widths[i];
 }
 // Drips are anchored to actual lower glyph pixels, never to empty letter gaps.
 const dripAlpha=1-ease((age-4.45)/.55);if(dripAlpha>0){ctx.save();ctx.globalAlpha=dripAlpha;ctx.lineCap='round';
  for(let i=0;i<deathLetters.length;i++){const point=deathLetters[i],start=.25+rand(i+39)*1.1,a=age-start;if(a<0)continue;
   const px=wordX-total/2+point.x,py=wordY-fontSize+point.y,len=(12+rand(i+184)*30)*ease(a/1.8),bend=(rand(i+321)-.5)*3;
   ctx.strokeStyle='#7b0a1a';ctx.lineWidth=1.1+rand(i+221)*1.4;ctx.beginPath();ctx.moveTo(px,py-1);ctx.bezierCurveTo(px+1,py+len*.35,px+bend,py+len*.65,px+bend,py+len);ctx.stroke();dot(px+bend,py+len,1.5+rand(i+991),'#a41827');
   const fall=(a-1.5)%1.05;if(a>1.5&&fall>0&&age<4.4){ctx.globalAlpha=dripAlpha*(1-fall/1.05);ctx.beginPath();ctx.ellipse(px+bend,py+len+fall*43+fall*fall*54,1.8,3,0,0,TAU);ctx.fillStyle='#8d1020';ctx.fill();ctx.globalAlpha=dripAlpha;}
  }ctx.restore();
 }ctx.restore();
}
return{
 word(x,w,h,t){ctx=x;ctx.save();ctx.scale(w/260,h/462);drawDeathWord(t);ctx.restore()},
 draw(x,r,t){ctx=x;ctx.save();ctx.translate(r.x,r.y);ctx.scale(r.w/260,r.h/462);
 if(effect==='hp'||effect==='mp')potionEffect(t);
 else{const p=clamp((t-.35)/3.5),a=ease(p/.16)*(1-ease((p-.65)/.35));if(a>0){const x=130+Math.sin(p*5)*13,y=462*.45-490*ease(p);soulShape(x,y,1+p*.25,t,a);glow(x,y+30,72,'168,207,186',a*.055,.7,1.6)}}
 ctx.restore()}
};
 }
 return{create};
})();

/* Author-approved beasts 08: right rat paws, wolves unchanged. */
const CLAW_OPENING=[null,null,null,null,[135,136],[135,136],[135,136],[134,136],[134,136],[134,136],[133,136],[135,136],[135,136],[132,133],[135,136],[135,136],[131,132],null,null,[130,131],[134,135],[129,130],[129,130],[128,130],[128,130],[127,130],[126,130],[126,130],[125,130],[125,128],[124,129],[124,129],[124,129],[125,129],[125,129],[125,129],[124,129],[124,127],[123,128],[123,128],[122,127],[122,128],[121,128],[121,128],[120,126],[117,127],[119,125],[119,126],[118,125],[117,119],[114,118],[120,125],[115,125],[114,124],[113,124],[113,124],[113,123],[112,123],[111,122],[110,122],[109,122],[109,122],[110,122],[110,122],[109,122],[109,122],[108,122],[104,122],[106,121],[106,121],[106,121],[105,121],[105,121],[99,122],[103,122],[102,122],[101,123],[101,123],[100,124],[100,125],[99,125],[99,125],[99,126],[98,126],[98,126],[97,127],[99,127],[99,127],[96,127],[95,127],[94,127],[96,126],[100,126],[100,126],[99,127],[94,127],[94,127],[95,127],[94,127],[92,128],[92,128],[92,128],[92,128],[92,129],[91,129],[90,129],[90,129],[90,121],[90,128],[89,127],[89,127],[88,126],[87,125],[87,127],[86,129],[85,129],[85,129],[91,129],[89,129],[89,128],[89,128],[89,128],[89,129],[89,129],[89,129],[86,128],[86,128],[90,128],[89,128],[89,128],[83,128],[83,128],[82,127],[82,126],[81,127],[86,127],[86,127],[86,127],[86,122],[89,122],[89,125],[89,125],[89,125],[89,127],[84,126],[84,126],[84,126],[84,124],[84,126],[85,125],[86,122],[86,126],[87,121],[87,123],[87,120],[87,128],[90,128],[90,128],[91,129],[91,129],[91,123],[88,123],[87,123],[88,125],[88,125],[88,125],[88,124],[88,124],[88,124],[88,124],[88,123],[89,123],[89,123],[84,123],[92,124],[82,125],[82,126],[86,126],[86,126],[86,125],[85,125],[85,127],[85,127],[85,127],[85,128],[85,129],[82,130],[83,131],[83,127],[84,127],[84,128],[86,130],[86,133],[85,131],[87,131],[83,132],[83,132],[88,132],[88,131],[84,131],[83,135],[89,136],[89,139],[84,139],[84,127],[85,127],[85,136],[90,128],[90,128],[88,129],[88,129],[88,137],[88,137],[84,137],[83,128],[82,128],[82,129],[81,129],[81,129],[81,129],[85,141],[85,141],[84,135],[83,137],[82,137],[81,137],[81,136],[80,136],[80,136],[81,130],[81,129],[80,130],[84,130],[79,130],[78,130],[77,129],[77,129],[77,129],[76,128],[75,128],[75,135],[74,134],[74,134],[83,128],[82,128],[83,133],[83,133],[83,133],[80,132],[82,132],[82,130],[82,132],[83,129],[83,132],[83,132],[83,132],[83,131],[83,131],[88,130],[83,130],[84,131],[84,131],[85,132],[85,132],[85,132],[88,132],[88,132],[88,129],[90,132],[92,133],[92,133],[93,133],[93,133],[93,133],[93,134],[93,134],[94,134],[94,134],[94,134],[94,133],[89,133],[90,134],[90,134],[90,130],[90,130],[90,131],[90,131],[90,135],[90,136],[90,138],[90,140],[89,139],[89,142],[89,131],[88,131],[88,131],[87,131],[87,132],[86,132],[85,140],[85,140],[88,133],[83,133],[82,133],[80,133],[79,147],[78,147],[78,146],[77,133],[77,133],[77,133],[77,133],[77,133],[77,134],[77,146],[76,145],[76,146],[81,135],[81,134],[81,134],[81,134],[80,135],[80,135],[74,147],[74,141],[78,134],[79,134],[79,134],[79,134],[79,134],[79,135],[79,135],[78,146],[72,144],[72,135],[71,134],[71,134],[70,135],[70,135],[70,143],[71,146],[71,145],[71,145],[73,135],[73,135],[78,135],[78,135],[78,135],[78,146],[78,135],[77,135],[70,134],[69,135],[69,135],[68,141],[68,146],[67,145],[67,142],[66,142],[66,142],[66,143],[65,143],[65,131],[71,131],[71,131],[72,132],[72,143],[72,132],[75,132],[75,132],[75,131],[72,131],[77,131],[77,131],[76,131],[76,140],[71,140],[77,130],[71,129],[70,129],[70,129],[74,137],[75,135],[76,134],[77,133],[77,133],[77,128],[81,128],[81,128],[82,128],[83,128],[83,128],[84,128],[84,128],[84,128],[80,131],[81,130],[81,130],[82,130],[82,130],[82,133],[83,132],[84,132],[84,132],[85,133],[85,134],[86,135],[86,136],[85,136],[85,136],[85,136],[86,136],[86,136],[87,136],[87,136],[87,138],[87,139],[87,140],[87,141],[87,142],[87,144],[87,145],[88,145],[88,146],[88,146],[88,147],[88,148],[87,149],[87,148],[87,149],[88,149],[88,150],[88,150],[88,150],[85,150],[85,150],[85,150],[85,150],[85,150],[85,150],[85,150],[87,150],[86,151],[86,152],[87,145],[87,143],[91,145],[92,144],[96,138],[96,138],[97,138],[96,138],[96,138],[96,155],[94,155],[94,155],[94,155],[94,155],[94,147],[94,147],[95,147],[95,147],[95,141],[99,141],[99,142],[99,142],[99,142],[99,142],[99,143],[99,143],[99,143],[98,143],[94,143],[93,143],[93,143],[97,142],[98,142],[98,150],[98,143],[91,143],[91,143],[91,143],[90,143],[90,149],[94,149],[95,150],[95,150],[95,145],[95,145],[95,145],[96,145],[96,144],[96,144],[96,144],[96,145],[96,149],[96,149],[96,150],[96,150],[96,150],[96,150],[96,150],[96,150],[96,149],[96,149],[96,148],[90,148],[90,147],[89,139],[89,138],[93,141],[93,145],[93,140],[93,144],[97,144],[97,143],[97,145],[97,145],[97,144],[97,143],[97,143],[96,143],[93,143],[93,136],[93,136],[93,136],[93,135],[93,140],[93,140],[93,139],[92,138],[92,137],[89,137],[89,137],[94,137],[98,136],[98,136],[98,136],[98,136],[94,131],[99,130],[95,129],[95,130],[95,129],[95,129],[95,130],[95,131],[95,131],[95,132],[96,132],[99,126],[99,126],[96,125],[98,132],[99,131],[100,124],[100,124],[100,123],[100,123],[98,128],[98,127],[97,125],[97,124],[93,124],[93,124],[93,124],[93,125],[93,124],[92,122],[92,122],[96,122],[95,117],[95,117],[95,116],[98,122],[98,122],[87,123],[87,123],[89,123],[89,119],[89,119],[90,118],[94,118],[94,117],[95,117],[94,112],[95,112],[96,112],[96,116],[96,116],[96,111],[96,111],[92,117],[92,117],[92,115],[92,115],[92,115],[92,115],[92,115],[92,115],[93,116],[93,116],[93,117],[93,117],[94,118],[93,118],[93,115],[94,117],[95,117],[96,117],[96,116],[96,116],[96,116],[101,116],[102,117],[95,117],[96,117],[96,116],[97,117],[97,117],[98,118],[99,114],[99,114],[99,115],[100,116],[104,115],[104,115],[100,115],[101,116],[101,116],[102,116],[102,116],[102,112],[102,112],[102,112],[102,119],[102,114],[102,114],[103,114],[103,114],[103,114],[104,114],[104,114],[104,118],[105,114],[105,114],[105,114],[105,114],[105,114],[105,114],[106,114],[106,114],[106,114],[106,114],[107,114],[107,113],[104,113],[104,117],[105,116],[105,111],[105,111],[105,115],[105,115],[105,110],[105,110],[108,110],[112,114],[112,114],[106,110],[109,114],[109,113],[107,113],[107,113],[107,113],[107,113],[107,112],[107,112],[108,112],[108,112],[108,112],[108,111],[108,111],[108,111],[108,111],[108,111],[108,111],[109,110],[109,110],[109,110],[109,110],null,null];
/* Grivensburg beasts 08. Deterministic, card-relative renderer.
   The same pose/tipAt function drives both the sprite and every wound vertex.
   Wound material and baked interior contour come from the approved VFX lab 2.9.0. */
const PawFX=(()=>{
 'use strict';
 const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
 const ease=x=>{x=clamp(x);return x*x*(3-2*x)};
 const lerp=(a,b,p)=>a+(b-a)*p;
 const rnd=n=>{const v=Math.sin(n*127.1+71.7)*43758.5453123;return v-Math.floor(v)};
 const inverseEase=x=>{let a=0,b=1;for(let i=0;i<18;i++){const m=(a+b)/2;if(ease(m)<x)a=m;else b=m}return(a+b)/2};
 const CUT={x:280,y:16,w:201,h:692};
 const defs={
  rat:{name:'Крыса',family:'rat',boss:false,mirrorX:true,rightPaw:true,bbox:[98,91,1241,1190],tips:[[936,128],[1105,195],[1238,341],[1200,1010]],short:3,description:'Три длинных следа и короткий изогнутый след снизу-слева.'},
  rat_king:{name:'Крысиный король',family:'rat',boss:true,mirrorX:true,rightPaw:true,bbox:[123,92,1240,1156],tips:[[953,115],[1114,153],[1237,337],[1118,1068]],short:3,description:'Мощная лапа со слизью и старым кольцом. Нижний левый след короче и сильнее изогнут.'},
  wolf:{name:'Волк',family:'wolf',boss:false,mirrorX:true,bbox:[34,267,1231,1089],tips:[[1219,608],[1206,839],[1142,1061],[570,1043]],short:3,description:'Когти слева, маленький палец снизу. Резкий силовой взмах слева направо.'},
  dire_wolf:{name:'Лютоволк',family:'wolf',boss:true,mirrorX:true,bbox:[29,241,1246,1032],tips:[[1115,502],[1240,673],[1234,917],[576,1027]],short:3,description:'Когти слева, маленький палец снизу. Мощный быстрый удар; размер босса — 115%.'}
 };
 const BASE_SIZE=166, BOSS_MULTIPLIER=1.15, ATTACK_SPEED=1.1;
 function config(id,w=300,h=450,tune=null){
  const d=defs[id],scale=w/300,mult=d.boss?BOSS_MULTIPLIER:1;
  const [x0,y0,x1,y1]=d.bbox,unit=BASE_SIZE*scale*mult/Math.max(x1-x0,y1-y0)*(tune?tune.size/100:1);
  const flipX=tune?(tune.flipX?-1:1):(d.mirrorX?-1:1),flipY=tune&&tune.flipY?-1:1;
  const pivot=[(x0+x1)/2,(y0+y1)/2],local=d.tips.map(p=>[(p[0]-pivot[0])*unit*flipX,(p[1]-pivot[1])*unit*flipY]);
  const avg=local.slice(0,3).reduce((p,v)=>[p[0]+v[0]/3,p[1]+v[1]/3],[0,0]);
  return{d,w,h,scale,mult,pivot,unit,local,avg,flipX,flipY,tune,size:BASE_SIZE*scale*mult*(tune?tune.size/100:1)};
 }
 function motion(cfg,p){
  if(cfg.tune){
   const t=cfg.tune,q=clamp(p),r=Math.PI/180;
   const a=(t.rotation+t.swing*(q-.5))*r,c=Math.cos(a),s=Math.sin(a);
   const theta=t.direction*r,along=(p-.5)*t.length;
   const bend=t.curve*Math.sin(Math.PI*q);
   return{x:cfg.w*t.x/100+(Math.cos(theta)*along-Math.sin(theta)*bend)*cfg.scale,
    y:cfg.h*t.y/100+(Math.sin(theta)*along+Math.cos(theta)*bend)*cfg.scale,angle:a,c,s};
  }
  // A short wrist arc, not a thrown projectile. Slight rotation curves the traces.
  const wolf=cfg.d.family==='wolf';
  // Mirror only X: claws face left, inner digit stays below, the rake travels right.
  // For rats H*R(a) = R(-a)*H: change handedness without turning claws downward.
  const wrist=cfg.d.rightPaw?-1:1;
  const a0=wolf?0:-1.08*wrist,a=a0+(wolf?-.18:.20*wrist)*clamp(p)+(wolf?0:.25*wrist*Math.sin(Math.PI*clamp(p))),c=Math.cos(a),s=Math.sin(a);
  const c0=Math.cos(a0),s0=Math.sin(a0);
  const ax=cfg.avg[0]*c0-cfg.avg[1]*s0,ay=cfg.avg[0]*s0+cfg.avg[1]*c0;
  // Keep the previous wrist path; mirror fingers about that wrist, not the card.
  const anchorX=cfg.d.rightPaw?-ax:ax;
  return {x:cfg.w*(wolf?.34:.29)-anchorX+cfg.w*(wolf?.43:.40)*p*cfg.mult+Math.sin(Math.PI*clamp(p))*5*cfg.scale,
   y:cfg.h*(wolf?.27:.20)-ay+cfg.h*(wolf?.145:.265)*p*cfg.mult-Math.sin(Math.PI*clamp(p))*7*cfg.scale,angle:a,c,s};
 }
 function tipAt(cfg,i,p){const m=motion(cfg,p),v=cfg.local[i];return{x:m.x+v[0]*m.c-v[1]*m.s,y:m.y+v[0]*m.s+v[1]*m.c};}
 function timings(critical,family='rat',variant=null){
  const wolf=family==='wolf';
  const tm=critical?{intro:wolf?.035:.08,contact:wolf?.19:.53,end:wolf?.47:1.17,fade:3.9,life:4.95}
                   :{intro:wolf?.035:.08,contact:wolf?.15:.37,end:wolf?.34:.76,fade:2.8,life:3.85};
  Object.assign(tm,{alphaIn:wolf?.025:.14,release:wolf?.085:.24,alphaDelay:wolf?.015:.065,alphaOut:wolf?.08:.22});
  // Accelerate attack phases only; the readable wound/blood lifetime is unchanged.
  for(const key of ['intro','contact','end','alphaIn','release','alphaDelay','alphaOut'])tm[key]/=ATTACK_SPEED;
  if(variant!==null){
   const profiles=[{contact:.22,end:.53},{contact:.3,end:.69},{contact:.38,end:.93}];
   const a=profiles[variant]||profiles[0],factor=critical?1.25:1;
   Object.assign(tm,{intro:.025,contact:a.contact*factor,end:a.end*factor,alphaIn:.06,release:.14,alphaDelay:.06,alphaOut:.18});
  }
  return tm;
 }
 function progressAt(t,tm){return ease((t-tm.contact)/(tm.end-tm.contact));}
 function windowFor(cfg,i){
  // After mirroring, the lower inner claw lies ahead of the three long claws.
  if(i===cfg.d.short)return cfg.d.family==='rat'?{a:.10,b:.51}:{a:.04,b:.45};
  return{a:[0,.02,.045][i],b:[.96,.985,1][i]};
 }
 function markAt(cfg,i,p){const win=windowFor(cfg,i);return tipAt(cfg,i,lerp(win.a,win.b,p));}
 function widthAt(cfg,i,u,critical){
  const base=(i===cfg.d.short?6.4:12.8)*cfg.scale*cfg.mult*(critical?2:1);
  // Irregular lip geometry is shared by the texture and hole.
  return base*(.965+rnd(Math.floor(u*96)+i*61)*.07);
 }
 function opening(u){return CLAW_OPENING[Math.min(CUT.h-1,Math.floor(clamp(u)*(CUT.h-1)))];}
 function tangent(cfg,i,u){const a=markAt(cfg,i,Math.max(0,u-.001)),b=markAt(cfg,i,Math.min(1,u+.001)),L=Math.hypot(b.x-a.x,b.y-a.y)||1;return{x:(b.x-a.x)/L,y:(b.y-a.y)/L};}
 function getMarks(cfg,t,critical){
  const tm=timings(critical,cfg.d.family,cfg.tune?.variant??null),p=progressAt(t,tm),fade=1-ease((t-tm.fade)/(tm.life-tm.fade));
  return cfg.d.tips.map((_,i)=>{const win=windowFor(cfg,i);return{i,win,p:clamp((p-win.a)/(win.b-win.a)),fade}}).filter(m=>m.p>0&&fade>0);
 }
 function trace(ctx,points){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();}
 function holeFor(cfg,m,critical){
  const left=[],right=[],N=120;
  for(let k=0;k<=N;k++){
   const u=Math.min(k/N,m.p),row=opening(u);if(row){
    const pos=markAt(cfg,m.i,u),v=tangent(cfg,m.i,u),width=widthAt(cfg,m.i,u,critical);
    const mid=(row[0]+row[1])/2,closure=ease(m.fade),front=ease((m.p-u)/.018);
    const off=side=>(row[side]-mid)/CUT.w*width*closure*front;
    left.push([pos.x-v.y*off(0),pos.y+v.x*off(0)]);right.push([pos.x-v.y*off(1),pos.y+v.x*off(1)]);
   }if(u>=m.p)break;
  }
  return left.concat(right.reverse());
 }
 function material(ctx,atlas,cfg,m,critical){
  const N=112;ctx.save();ctx.globalAlpha=m.fade;
  for(let k=0;k<N;k++){
   const u=k/N;if(u>=m.p)break;
   const next=Math.min((k+1)/N,m.p),a=markAt(cfg,m.i,u),b=markAt(cfg,m.i,next),L=Math.hypot(b.x-a.x,b.y-a.y);
   if(L<.0001)continue;
   const width=widthAt(cfg,m.i,u,critical),row=opening((u+next)/2),center=row?(row[0]+row[1])/2:CUT.w*.55;
   ctx.save();ctx.translate(a.x,a.y);ctx.rotate(Math.atan2(b.y-a.y,b.x-a.x)-Math.PI/2);ctx.scale(-1,1);
   ctx.drawImage(atlas,CUT.x,CUT.y+CUT.h*u,CUT.w,CUT.h*(next-u),-center/CUT.w*width,0,width,L+.4*cfg.scale);
   ctx.restore();
  }ctx.restore();
 }
 function blood(ctx,cfg,marks,t,critical){
  const tm=timings(critical,cfg.d.family,cfg.tune?.variant??null);
  ctx.save();ctx.lineCap='round';
  for(const m of marks){
   const count=critical?5:2;
   for(let j=0;j<count;j++){
    const u=.14+j*(.72/Math.max(1,count-1));if(m.p<u)continue;
    const p=lerp(m.win.a,m.win.b,u),born=tm.contact+(tm.end-tm.contact)*inverseEase(p),age=t-born;
    if(age<.025)continue;
    const pt=markAt(cfg,m.i,u),v=tangent(cfg,m.i,u),row=opening(u),wide=widthAt(cfg,m.i,u,critical);
    const edge=row?(row[1]-row[0])/2/CUT.w*wide:0;
    const x=pt.x-v.y*(edge+wide*.1),y=pt.y+v.x*(edge+wide*.1),seed=m.i*29+j*7;
    const amount=(critical?1:.62)*(m.i===cfg.d.short?.68:1)*cfg.mult;
    const L=ease(age/1.45)*(18+rnd(seed+8)*30)*amount*cfg.scale;
    const bend=(rnd(seed+6)-.4)*4*cfg.scale;
    ctx.globalAlpha=m.fade*.9;
    ctx.strokeStyle='#580b16';ctx.lineWidth=(critical?1.6:1.05)*cfg.scale;
    ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x-1,y+L*.25,x+bend,y+L*.7,x+bend,y+L);ctx.stroke();
    ctx.strokeStyle='#a72835';ctx.lineWidth=.5*cfg.scale;ctx.beginPath();ctx.moveTo(x+.3,y+1);ctx.lineTo(x+bend+.3,y+L*.82);ctx.stroke();
    // Slender falling drops, no round blood splats or circles.
    const fall=(age-1.0-j*.075)%1.2;
    if(age>1.0+j*.075&&fall>0&&fall<.66){
     ctx.globalAlpha=m.fade*(1-fall/.66);ctx.strokeStyle='#8e1828';ctx.lineWidth=1.15*cfg.scale;
     const yy=y+L+fall*27*cfg.scale+fall*fall*50*cfg.scale;
     ctx.beginPath();ctx.moveTo(x+bend,yy);ctx.lineTo(x+bend,yy+3.5*cfg.scale);ctx.stroke();
    }
   }
  }ctx.restore();
 }
 function poseAt(cfg,t,critical){
  const tm=timings(critical,cfg.d.family,cfg.tune?.variant??null),p=progressAt(t,tm);
  let physical=p;
  if(t<tm.contact){
   const prep=clamp((t-tm.intro)/(tm.contact-tm.intro));
   physical=cfg.d.family==='wolf'?-.26*Math.sin(Math.PI*prep):-.28*(1-ease(prep));
  }
  if(t>tm.end)physical=1+(cfg.d.family==='wolf'?.28:.16)*ease((t-tm.end)/tm.release);
  const m=motion(cfg,physical),alpha=ease((t-tm.intro)/tm.alphaIn)*(1-ease((t-tm.end-tm.alphaDelay)/tm.alphaOut));
  return{...m,alpha,p,physical};
 }
 function paintPaw(ctx,img,cfg,t,critical){
  const pose=poseAt(cfg,t,critical);if(pose.alpha<=0)return;
  ctx.save();ctx.globalAlpha=pose.alpha;ctx.translate(pose.x,pose.y);ctx.rotate(pose.angle);ctx.scale(cfg.flipX,cfg.flipY);
  ctx.shadowColor='#0007';ctx.shadowBlur=7*cfg.scale;ctx.shadowOffsetY=3*cfg.scale;
  ctx.drawImage(img,-cfg.pivot[0]*cfg.unit,-cfg.pivot[1]*cfg.unit,img.width*cfg.unit,img.height*cfg.unit);ctx.restore();
 }
 function guides(ctx,cfg,t,critical){
  const colors=['#f5cc66','#a8df83','#83dfe7','#eb9be2'];
  ctx.save();ctx.lineWidth=.8*cfg.scale;
  cfg.d.tips.forEach((_,i)=>{
   ctx.strokeStyle=colors[i];ctx.setLineDash([3,4]);ctx.beginPath();for(let j=0;j<=48;j++){const p=markAt(cfg,i,j/48);if(j)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y)}ctx.stroke();
  });
  const pose=poseAt(cfg,t,critical);if(pose.alpha>0){ctx.setLineDash([]);cfg.local.forEach((v,i)=>{
   const x=pose.x+v[0]*pose.c-v[1]*pose.s,y=pose.y+v[0]*pose.s+v[1]*pose.c;
   ctx.strokeStyle=colors[i];ctx.lineWidth=1.2*cfg.scale;ctx.beginPath();ctx.arc(x,y,3.3*cfg.scale,0,Math.PI*2);ctx.stroke();
  });}ctx.restore();
 }
 function renderWounds(ctx,images,cfg,t,critical){
  const marks=getMarks(cfg,t,critical);marks.forEach(m=>material(ctx,images.cuts_atlas,cfg,m,critical));
  if(critical){ctx.save();ctx.globalCompositeOperation='destination-out';ctx.fillStyle='#000';for(const m of marks){const poly=holeFor(cfg,m,true);if(poly.length>3){trace(ctx,poly);ctx.fill();}}ctx.restore();}
  blood(ctx,cfg,marks,t,critical);return marks;
 }
 function renderCardLayer(ctx,images,cfg,t,critical){
  const {w,h}=cfg;ctx.clearRect(0,0,w,h);
  ctx.save();ctx.beginPath();ctx.roundRect(0,0,w,h,8);ctx.clip();
  ctx.drawImage(images.hero,0,0,w,h);
  const shade=ctx.createLinearGradient(0,h*.65,0,h);shade.addColorStop(0,'#100c0a00');shade.addColorStop(1,'#100c0acc');ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
  const marks=renderWounds(ctx,images,cfg,t,critical);
  ctx.strokeStyle='#bd955799';ctx.lineWidth=2;ctx.strokeRect(1,1,w-2,h-2);
  ctx.fillStyle='#e6d2b1';ctx.font='16px Georgia';ctx.textAlign='center';ctx.fillText('ВОИН',w/2,h-27);
  ctx.fillStyle='#321716';ctx.fillRect(w*.14,h-15,w*.72,3);ctx.fillStyle='#bb5b40';ctx.fillRect(w*.14,h-15,w*.72,3);
  ctx.restore();return marks;
 }
 function diagnostics(id,t=1.5,critical=false){
  const cfg=config(id),marks=getMarks(cfg,t,critical);
  return{size:cfg.size,multiplier:cfg.mult,contact:timings(critical,cfg.d.family).contact,end:timings(critical,cfg.d.family).end,
   marks:marks.map(m=>({i:m.i,short:m.i===cfg.d.short,from:markAt(cfg,m.i,0),to:markAt(cfg,m.i,1),width:widthAt(cfg,m.i,.5,critical),points:Array.from({length:61},(_,n)=>markAt(cfg,m.i,n/60)),hole:critical?holeFor(cfg,m,true):[]}))};
 }
 return{defs,config,timings,progressAt,tipAt,markAt,poseAt,getMarks,holeFor,paintPaw,renderCardLayer,renderWounds,guides,diagnostics,BASE_SIZE,BOSS_MULTIPLIER,ATTACK_SPEED};
})();

/* Exact settings transcribed from the user's two screenshots, 2026-10-09.
   1 -> wolf, 2 -> dire_wolf. Rotation and movement direction are independent. */
const BEAST_PRESETS=Object.freeze({
 rat:Object.freeze({family:"rat",speed:1,variant:null}),
 rat_king:Object.freeze({family:"rat",speed:1,variant:null}),
 wolf:Object.freeze({variant:1,speed:1.3,rotation:59,size:100,x:74.7,y:43.4,flipX:true,flipY:false,direction:41,length:164,curve:8,swing:-16}),
 dire_wolf:Object.freeze({variant:2,speed:1.45,rotation:49,size:100,x:73.8,y:50.2,flipX:true,flipY:false,direction:57,length:200,curve:-21,swing:35})
});


/* Approved bard/priest animations from demo 04, sharing the laboratory clock/canvas. */
(function(sceneCards){
'use strict';
let c=ctx;const gold='#ffe08b',purple='#9754c7';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),smooth=v=>{v=clamp(v);return v*v*(3-2*v)},mix=(a,b,t)=>a+(b-a)*t;
const img={};
const fits={lute:{x:.51,y:.52,size:.86,angle:58},lute2:{x:.51,y:.52,size:.86,angle:58}};
let kind='lute',time=0,fx=null,turns=0,flexTarget=null,bardTurn=true,luteBoost=1,scale=1,actorId='h_bar',priestId='h_pri',cards=[],active=null,flexActor='h_bar',inspireActor='h_bar',nextChord=0,suppressedUntil=0;
const aliases=()=>({bard:actorId,priest:priestId});
function card(id){const key=aliases()[id]||id,r=R(key);return {id:key,enemy:!sceneCards[key].hero,x:r.x/scale,y:r.y/scale,w:r.w/scale,h:r.h/scale}}
function isAnimal(id){return !!sceneCards[id]?.d?.animal}
function origin(){const p=weaponPoseFor('mainhand',actorId);return{x:p.cx/scale,y:p.cy/scale}}
function note(message){if($('supportStatus'))$('supportStatus').textContent=message}
function clearFlex(){if(flexTarget&&sceneCards[flexTarget]){sceneCards[flexTarget].el.style.rotate='';sceneCards[flexTarget].el.style.translate=''}flexTarget=null}
function clear(){clearFlex();active=null;turns=0;luteBoost=1;suppressedUntil=0;note('Песни и молитвы готовы. Фортуна — по выбранному герою; флекс — по выбранному врагу.');syncTurns()}
function syncTurns(){if($('bardTurns'))$('bardTurns').textContent=turns?'Бодрящий риф: '+turns+' / 5 ходов':'Бодрящий риф не действует'}
function showScene(){if(Lab.mode!=='heroes')Lab.tab('heroes');$('healingFocus').checked=false;$('focus').checked=false;stage.classList.remove('healing-focus','focus');stage.classList.add('support-view');resize();paused=false;$('pause').textContent='⏸ Пауза';$('pause').classList.remove('on')}
function start(type,options={}){
 if(!VFX.ready)return false;
 if(options.preview!==false)showScene();
 actorId=options.actorId||(type.startsWith('prayer')?'h_pri':'h_bar');
 if(!sceneCards[actorId])throw Error('Неизвестный исполнитель '+actorId);
 const target=options.targetId||(type==='flex'?targetId:healId);
 if(!sceneCards[target])throw Error('Неизвестная цель '+target);
 if(type.startsWith('prayer'))priestId=actorId;
 const instrument=$('instrument').value==='lute_dead'?'lute2':'lute';
 active={type,start:clock/1000,actorId,target,enemy:target,instrument,targets:options.targetIds||null};
 if(type==='inspire'){turns=5;inspireActor=actorId;nextChord=clock/1000+2.5;syncTurns()}
 if(type==='flex'){clearFlex();flexTarget=target;flexActor=actorId}
 if(!type.startsWith('prayer'))SFX.play(type==='minor'?'bard_song_minor':'bard_song_major');
 const messages={major:'Качающий риф — по союзникам.',minor:'Колкая подъёбка — по врагам-людям.',inspire:'Бодрящий риф — 5 ходов. Переключай ход барда и нажимай «Следующий ход».',fortune:'Госпожа Фортуна → '+sceneCards[target].d.name,flex:'Флекс: успешное срабатывание → '+sceneCards[target].d.name,prayerWisdom:'Молитва мудрости · святой свет и синие частицы.',prayerStrength:'Молитва силы · святой свет и красные частицы.'};note(messages[type]);return true;
}
function advanceTurn(){if(turns){turns--;syncTurns()}if(flexTarget){clearFlex();note('Враг пропустил ход. Флекс завершён.')}}
function drawLute(playing,age,alpha){
 const p=fits[kind],o=origin(),b=card('bard'),im=img[kind];if(!loaded(im))return;
 c.save();c.globalAlpha=alpha;c.translate(o.x,o.y);c.rotate(weaponPoseFor('mainhand',actorId).angle+(playing?Math.sin(time*5)*2:0)*Math.PI/180);const geo=weaponPoseFor('mainhand',actorId),w=geo.width/scale*luteBoost,h=geo.height/scale*luteBoost;c.shadowColor='#000';c.shadowBlur=7;c.drawImage(im,-w/2,-h/2,w,h);c.restore();
 if(playing&&!(fx?.type==='fortune'&&age<2.3))for(let i=0;i<7;i++){const u=(time*.32+i/5)%1,theta=i*2.4+time*.6;music(o.x+Math.cos(theta)*(30+u*45),o.y-20-u*95,24,gold,Math.sin(u*Math.PI)*.85*alpha,Math.sin(theta)*.18,i)}
}
function draw(dt){
 if(!turns&&!active&&!flexTarget)return;
 time=clock/1000;fx=active;actorId=active&&!active.type.startsWith('prayer')?active.actorId:turns?inspireActor:flexActor;
 priestId=active?.type.startsWith('prayer')?active.actorId:'h_pri';kind=active?.instrument||($('instrument').value==='lute_dead'?'lute2':'lute');
 img.lute=IMG.lute_old;img.lute2=IMG.lute_dead;img['prayer-hands']=IMG.prayer_hands;
 const reference=active?.type.startsWith('prayer')?priestId:actorId;scale=Math.max(.05,R(reference).w/175);
 cards=Object.keys(sceneCards).filter(id=>R(id).w>0&&getComputedStyle(sceneCards[id].el).visibility!=='hidden').map(card);
 const age=active?time-active.start:100,bardActive=active&&!active.type.startsWith('prayer'),playing=turns>0||(bardActive&&age<(active.type==='fortune'?5.1:3.5));
 const boost=turns?bardTurn:(bardActive&&age<(active.type==='fortune'?5.1:3.5));luteBoost+=((boost?1.21:1)-luteBoost)*Math.min(1,dt/.18);
 c.save();c.globalAlpha=1;c.globalCompositeOperation='source-over';c.scale(scale,scale);
 if((turns||bardActive)&&time>=suppressedUntil)drawLute(playing,age,turns?1:smooth(age/.18)*(1-smooth((age-5.8)/.6)));
 if(active){
  if(active.type==='major'||active.type==='minor')song(age,active.type==='minor');
  if(active.type==='fortune')fortune(age);
  if(active.type.startsWith('prayer')&&loaded(img['prayer-hands']))prayer(age,active.type==='prayerStrength');
  if(age>7.2)active=null;
 }
 if(turns&&time>=nextChord){if(time>=suppressedUntil)SFX.play('bard_song_major');nextChord=time+2.5}
 if(flexTarget){
  flex();const el=sceneCards[flexTarget].el;if(!isAnimal(flexTarget)){el.style.rotate=(Math.sin(time*6)*1.43)+'deg';el.style.translate='0 '+(-Math.abs(Math.sin(time*6))*5*scale)+'px'}
 }
 c.restore();
}
function applyFit(data){
 if(data?.schema!=='grivensburg-bard-placement-v1')throw Error('Нужен JSON посадки лютни');
 for(const k of ['lute','lute2']){const p=data.placements?.[k];if(!p||!['x','y','size','angle'].every(n=>Number.isFinite(p[n]))||p.x<-.2||p.x>1.2||p.y<-.2||p.y>1.2||p.size<.25||p.size>1.8||Math.abs(p.angle)>180)throw Error('Неверные значения посадки')}
 for(const k of ['lute','lute2'])Object.assign(fits[k],data.placements[k]);note('Посадка обеих лютней загружена.');return true;
}
const aliasesFX={bardRiff:'major',bardTaunt:'minor',bardInspire:'inspire',bardFortune:'fortune',bardFlex:'flex',prayerWisdom:'prayerWisdom',prayerStrength:'prayerStrength'};
for(const [key,type] of Object.entries(aliasesFX)){FX[key]=()=>start(type);NOTARGET.add(key)}
const previousClear=FX.clear;FX.clear=function(...args){clear();stage.classList.remove('support-view');const result=previousClear(...args);resize();return result};
const previousHurt=hurt;hurt=function(id,damage){if(damage>0&&id===flexTarget)clearFlex();return previousHurt(id,damage)};
const previousRun=run;run=function(key,...args){
 if(key==='bard')suppressedUntil=clock/1000+2.5;
 if(!Object.hasOwn(aliasesFX,key)&&!['clear','demo'].includes(key)&&stage.classList.contains('support-view')){stage.classList.remove('support-view');resize()}
 return previousRun(key,...args);
};
const previousTurn=nextLabTurn;nextLabTurn=function(...args){advanceTurn();return previousTurn(...args)};
const api={drawNotes(context,r,time,color){const old=c;c=context;for(let i=0;i<7;i++){const u=(time*.32+i/5)%1,theta=i*2.4+time*.6;music(r.x+r.w*.5+Math.cos(theta)*(30+u*45),r.y+r.h*.45-20-u*95,24,color,Math.sin(u*Math.PI)*.85,Math.sin(theta)*.18,i)}c=old;},start,draw,clear,applyFit,nextTurn:advanceTurn,setBardTurn:value=>{bardTurn=!!value;if($('bardTurnOn'))$('bardTurnOn').checked=bardTurn},removeFlex:clearFlex,
 get visible(){return !!(active||turns||flexTarget)},snapshot:()=>({active:active?{...active,age:clock/1000-active.start}:null,turns,flexTarget,bardTurn,luteBoost,placements:structuredClone(fits),handScale:.54,handStartY:.44,handEndY:.33})};
SupportEffects=api;
function glow(x,y,r,color,a=1){if(r<=0||a<=0)return;c.save();c.globalAlpha=clamp(a);const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(.3,color+'99');g.addColorStop(1,color+'00');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);c.restore()}
function text(s,x,y,size=18,color=gold){c.font=size+'px Georgia';c.fillStyle=color;c.textAlign='center';c.fillText(s,x,y)}
function clef(x,y,size,color,a=1,angle=0){c.save();c.translate(x,y);c.rotate(angle);c.scale(size/60,size/60);c.globalAlpha=clamp(a);c.strokeStyle=color;c.lineWidth=3.3;c.lineCap='round';c.shadowColor=color;c.shadowBlur=8;c.beginPath();c.moveTo(2,24);c.bezierCurveTo(17,35,17,9,6,-8);c.bezierCurveTo(-9,-36,8,-39,9,-25);c.bezierCurveTo(11,-11,-19,-8,-13,10);c.bezierCurveTo(-8,25,14,18,12,5);c.bezierCurveTo(10,-7,-7,-5,-6,5);c.bezierCurveTo(-4,12,2,10,4,8);c.stroke();c.beginPath();c.arc(0,24,3,0,Math.PI*2);c.fillStyle=color;c.fill();c.restore()}
function star(x,y,r,color,a=1){c.save();c.globalAlpha=clamp(a);c.translate(x,y);c.fillStyle=color;c.beginPath();for(let i=0;i<10;i++){const t=i*Math.PI/5-Math.PI/2,rr=i%2?r*.4:r;c.lineTo(Math.cos(t)*rr,Math.sin(t)*rr)}c.closePath();c.fill();c.restore()}
function reception(b,age,color,down=false){if(age<0||age>3.8)return;const env=Math.sin(clamp(age/3.8)*Math.PI);glow(b.x+b.w*.5,b.y+b.h*.48,b.w*.7,color,env*.28);for(let i=0;i<9;i++){const p=clamp((age-i*.1)/2.4);if(p<=0||p>=1)continue;const x=b.x+b.w*(.15+((i*.313)% .7))+Math.sin(p*5+i)*8,y=b.y+b.h*(down?.22:.74)+(down?1:-1)*p*b.h*.55;music(x,y,27+i%3*4,color,Math.sin(p*Math.PI),Math.sin(p*3+i)*.15,i)}}
function seed(i){return ((Math.sin(i*127.1+31.8)*43758.5453)%1+1)%1}
function music(x,y,size,color,alpha=1,angle=0,variant=0){
 variant=((variant%5)+5)%5;if(variant===0)return clef(x,y,size,color,alpha,angle);
 c.save();c.translate(x,y);c.rotate(angle);c.scale(size/40,size/40);c.globalAlpha=clamp(alpha);c.strokeStyle=color;c.fillStyle=color;c.lineWidth=2.7;c.lineCap='round';c.shadowColor=color;c.shadowBlur=6;
 const head=(x,y,open=false)=>{c.beginPath();c.ellipse(x,y,5.5,3.5,-.4,0,Math.PI*2);open?c.stroke():c.fill()};
 head(-4,11,variant===4);c.beginPath();c.moveTo(1,10);c.lineTo(1,-17);c.stroke();
 if(variant===2){c.beginPath();c.moveTo(1,-17);c.bezierCurveTo(20,-7,9,1,7,3);c.stroke()}
 if(variant===3){head(14,6);c.beginPath();c.moveTo(19,6);c.lineTo(19,-22);c.lineTo(1,-17);c.moveTo(1,-12);c.lineTo(19,-17);c.stroke()}c.restore()
}
function musicPath(a,b,u){
 const dx=b.x-a.x,dy=b.y-a.y,near=Math.hypot(dx,dy)<75;
 if(near){const v=1-u;return {x:v*v*v*a.x+3*v*v*u*(a.x-110)+3*v*u*u*(b.x+110)+u*u*u*b.x,y:v*v*v*a.y+3*v*v*u*(a.y-180)+3*v*u*u*(b.y-180)+u*u*u*b.y}}
 const arch=Math.min(90+Math.min(125,Math.abs(dx)*.2),Math.max(18,Math.min(a.y,b.y)-20));
 return {x:mix(a.x,b.x,u),y:mix(a.y,b.y,u)-Math.sin(Math.PI*u)*arch};
}
function pathFrame(a,b,u){const p=musicPath(a,b,u),q=musicPath(a,b,clamp(u+.003)),r=musicPath(a,b,clamp(u-.003)),dx=q.x-r.x,dy=q.y-r.y,len=Math.hypot(dx,dy)||1;return {...p,nx:-dy/len,ny:dx/len}}
function phraseWindow(age,travel=1.85,emission=1.1){return {head:clamp(age/travel),tail:clamp((age-emission)/travel)}}
function staff(a,b,age,color,strength=1,travel=1.85){
 if(age<=0)return;const {head,tail}=phraseWindow(age,travel);if(head<=tail)return;
 c.save();c.lineCap='round';c.strokeStyle=color;c.shadowColor=color;c.shadowBlur=7;
 for(let k=-2;k<=2;k++)for(let j=0;j<64;j++){
  const u=mix(tail,head,j/64),v=mix(tail,head,(j+1)/64),p=pathFrame(a,b,u),q=pathFrame(a,b,v);
  const taper=Math.pow(Math.sin(clamp((u-tail)/(head-tail))*Math.PI),.38),width=(.25+.75*Math.sin(u*Math.PI));
  const off=k*6*width+Math.sin(u*12-age*3)*5*Math.sin(u*Math.PI),off2=k*6*(.25+.75*Math.sin(v*Math.PI))+Math.sin(v*12-age*3)*5*Math.sin(v*Math.PI);
  c.globalAlpha=taper*.58*strength;c.lineWidth=1.5;c.beginPath();c.moveTo(p.x+p.nx*off,p.y+p.ny*off);c.lineTo(q.x+q.nx*off2,q.y+q.ny*off2);c.stroke();
 }
 c.restore();
}
function flock(o,dst,age,color,count=34,spread=100,travel=1.85){
 for(let i=0;i<count;i++){
  const delay=seed(i+3)*1.1,duration=travel*(.86+seed(i+6)*.14),p=(age-delay)/duration;if(p<0||p>1)continue;
  const f=pathFrame(o,dst,p),env=Math.pow(Math.sin(p*Math.PI),.7),mode=i%4,phase=i+age*(2+seed(i+8)*2);
  let off=(seed(i+21)*2-1)*spread*.55;
  if(mode===0)off+=Math.sin(phase)*spread*.5;
  if(mode===1)off+=Math.sin(p*15+i)*spread*.38;
  if(mode===2)off*=.17;
  if(mode===3)off+=Math.cos(p*7+i)*spread*.65;
  off*=env;const along=mode===0?Math.cos(phase)*18*env:Math.sin(p*6+i)*8*env;
  music(f.x+f.nx*off-f.ny*along,f.y+f.ny*off+f.nx*along,20+seed(i+42)*20,color,smooth(p/.09)*(1-smooth((p-.90)/.1)),Math.sin(phase)*.35,i);
 }
}
function song(age,minor){const color=minor?purple:gold,targets=fx.targets?fx.targets.map(card):cards.filter(b=>minor?(b.enemy&&!isAnimal(b.id)):!b.enemy),o=origin();for(const b of targets){const dst={x:b.x+b.w*.5,y:b.y+b.h*.47};staff(o,dst,age-.25,color,.8);flock(o,dst,age-.25,color,32,minor?90:120);reception(b,age-1.95,color,minor)}}
function fortune(age){const o=origin(),b=card(fx.target),dst={x:b.x+b.w*.5,y:b.y+b.h*.42};if(age<2.5){const p=smooth(age/2),fade=1-smooth((age-2)/.5);glow(o.x,o.y,110,gold,p*.65*fade);glow(o.x,o.y,42,'#fff2ca',p*.7*fade);for(let i=0;i<5;i++){const a=age*1.2+i*1.26;glow(o.x+Math.cos(a)*45*(1-p*.4),o.y+Math.sin(a)*32,30,gold,p*.16*fade)}}if(age>=2){staff(o,dst,age-2,gold,1.15,2.1);flock(o,dst,age-2,gold,62,95,2.1)}if(age>3.85&&age<7){const p=(age-3.85)/3.15;glow(dst.x,dst.y,100,gold,(1-p)*.55);for(let i=0;i<23;i++){const a=i*Math.PI*2/23,r=20+p*(95+seed(i)*65);music(dst.x+Math.cos(a)*r,dst.y+Math.sin(a)*r*.85,25+seed(i+20)*10,gold,Math.sin(clamp(p)*Math.PI),Math.sin(a+p)*.35,i)}}}
function flex(){if(!flexTarget)return;const b=card(flexTarget),x=b.x+b.w*.5,y=isAnimal(b.id)?b.y+b.h*.4:b.y+b.h*.035;if(!isAnimal(b.id))for(let i=0;i<6;i++){const a=time*1.2+i*Math.PI/3;music(b.x+b.w*(.15+i*.14),b.y+b.h*.67-Math.abs(Math.sin(time*3+i))*45,24,gold,.85,Math.sin(a)*.2,i)}c.save();c.strokeStyle='#ffdf83';c.lineWidth=2.5;c.shadowColor=gold;c.shadowBlur=10;c.beginPath();for(let i=0;i<140;i++){const a=i*.12+time*1.5,r=i*.29;c.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r*.35)}c.stroke();c.restore();for(let i=0;i<4;i++){const a=time*1.7+i*Math.PI/2;star(x+Math.cos(a)*48,y+Math.sin(a)*18,8,gold)}text('ДЕЗОРИЕНТАЦИЯ',x,b.y-15,13,gold)}
function holyMote(x,y,r,color,a){c.save();c.globalAlpha=clamp(a);c.shadowColor=color;c.shadowBlur=8;c.fillStyle=color;c.beginPath();c.moveTo(x,y-r*1.8);c.lineTo(x+r*.65,y);c.lineTo(x,y+r*1.8);c.lineTo(x-r*.65,y);c.closePath();c.fill();c.restore()}
function prayer(age,strength=false){
 const b=card('priest'),x=b.x+b.w*.5,y=b.y+b.h*.33,im=img['prayer-hands'],w=b.w*.54,h=w*im.height/im.width,color=strength?'#ff747c':'#83bdff',light='#fff3ce',holy='#ffe3a0';
 const close=smooth((age-.4)/.8),fade=smooth(age/.5)*(1-smooth((age-3.6)/.8));
 if(age<4.4){c.save();c.globalAlpha=fade;const gap=(w*.065+b.w*.24)*(1-close),inset=w*.032*close,handY=y+b.h*.11*(1-close);c.drawImage(im,0,0,im.width/2,im.height,x-w/2-gap+inset,handY-h/2,w/2,h);c.drawImage(im,im.width/2,0,im.width/2,im.height,x+gap-inset,handY-h/2,w/2,h);c.restore()}
 if(age>.75&&age<4.2){
  const front=smooth((age-.75)/1.05),end=mix(-30,y,front),env=smooth((age-.75)/.3)*(1-smooth((age-3.25)/.95));
  c.save();c.lineCap='round';
  // Soft-edged light descends gradually rather than drawing an instant complete ray.
  for(let k=0;k<12;k++){const wide=90-k*6,narrow=12-k*.7,g=c.createLinearGradient(x,0,x,Math.max(1,end));g.addColorStop(0,holy+'00');g.addColorStop(.35,holy+'0c');g.addColorStop(1,light+'27');c.globalAlpha=env;c.fillStyle=g;c.beginPath();c.moveTo(x-wide,-5);c.lineTo(x+wide,-5);c.lineTo(x+narrow,end);c.quadraticCurveTo(x,end+10,x-narrow,end);c.closePath();c.fill()}
  c.restore();
  for(let i=0;i<74;i++){const birth=.83+seed(i+111)*1.75,u=(age-birth)/(1.05+seed(i+210)*.35);if(u<=0||u>=1)continue;const px=x+(seed(i+20)*2-1)*70*(1-u)+Math.sin(u*5+i)*7*(1-u),py=mix(-10,y,u);holyMote(px,py,1+seed(i+32)*1.5,i%4===0?light:color,Math.sin(u*Math.PI)*env*.9)}
  const gather=smooth((age-1.55)/1.1)*env;glow(x,y,52,holy,gather*.45);glow(x,y,36,color,gather*.20);glow(x,y,21,light,gather*.72);
 }
 if(age>2.25&&age<6.4){
  const t=age-2.25,env=smooth(t/.7)*(1-smooth((age-4.5)/1.9));c.save();c.beginPath();c.roundRect(b.x+2,b.y+2,b.w-4,b.h-4,7);c.clip();
  // Light follows the figure from palms into chest, head, arms and lower robe. No ring.
  const anchors=[[.5,.33,0,.24],[.5,.20,.2,.20],[.5,.10,.42,.17],[.35,.34,.25,.21],[.65,.34,.25,.21],[.23,.43,.48,.18],[.77,.43,.48,.18],[.5,.49,.28,.26],[.5,.64,.57,.28],[.43,.80,.85,.21],[.57,.80,.85,.21],[.43,.92,1.05,.15],[.57,.92,1.05,.15]];
  for(const [xx,yy,delay,r] of anchors){const a=smooth((t-delay)/.8)*env;glow(b.x+b.w*xx,b.y+b.h*yy,b.w*r,holy,a*.18);glow(b.x+b.w*xx,b.y+b.h*yy,b.w*r*.85,color,a*.12);glow(b.x+b.w*xx,b.y+b.h*yy,b.w*r*.5,light,a*.09)}
  for(let i=0;i<24;i++){const u=(t-seed(i+60)*.85)/1.8;if(u<=0||u>=1)continue;const direction=i%4,target=direction===0?[.5,.12]:direction===1?[.24,.43]:direction===2?[.76,.43]:[.5,.88];holyMote(mix(x,b.x+b.w*target[0],smooth(u))+Math.sin(u*5+i)*6*Math.sin(u*Math.PI),mix(y,b.y+b.h*target[1],smooth(u)),1.1,color,Math.sin(u*Math.PI)*env*.7)}
  c.restore();
 }
}
})(cards);

const hostSlash=slashDecal;slashDecal=function(id,...args){const d=hostSlash(id,...args);if(d&&cards[id].hero&&!d.thin){d.center[1]-=.15;d.endpoints[1]-=.15;d.endpoints[3]-=.15;}return d;};
// All laboratory mutations are replaced with presentation callbacks.
function impact(id){
 const c=cards[id],t=active?.targets?.find(x=>x.id===id);if(!c||!t||t.shown)return;
 t.shown=true;options.onImpact?.(active,t);
 const out=t.outcome||active.outcome;
 const value=Number(t.value??t.damage??active.damage)||0;
 const text=out==='miss'?'ПРОМАХ':out==='parry'?'ПАРИРОВАНИЕ':out==='block'&&value===0?'БЛОК':value?(active.healing?'+':'−')+value:'';
 if(text)label(id,text,active.healing?'#94efb0':'#ffcf94',Math.max(20,R(id).w*.14));
 if(out==='crit')label(id,'КРИТ!','#ffcf4a',Math.max(20,R(id).w*.12),true,-.13);
 if(Number.isFinite(t.hpAfter)){
  const hp=c.el.querySelector('.hp-text,.hp-txt');if(hp)hp.textContent=t.hpAfter+'/'+(t.maxHP||c.max);
 }
 if(t.killed && !c.death)after(160,()=>deathVisual(id));
}
function weaponFor(slot='mainhand',id=active?.actor){
 const key=id+':'+slot;return weapons.get(key)||(slot==='mainhand'?weapons.get(active?.actor+':mainhand'):null);
}
function weaponPoseFor(slot='mainhand',id=active?.actor){return global.EquipmentGeometry.pose(weaponFor(slot,id),R(id));}
function defenseWeapon(id,shield=false){
 const own=weaponFor(shield?'offhand':'mainhand',id);
 if(own&&(shield?own.kind==='shield':['sword','axe','dagger'].includes(own.kind)))return own;
 return global.EquipmentGeometry.resolve({type:'enemy',slots:{mainhand:shield?'shield':'sword'}},'mainhand',false,{});
}
function activeGear(){const w=weaponFor();return{kind:w?.kind==='axe'?'axe':'sword',grip:w?.two?'two':weaponFor('offhand')?.kind===w?.kind?'dual':'one'};}
function selectedArms(){
 const make=w=>({physical:global.EquipmentGeometry.pose(w,R(active.actor)),key:w.key,hx:w.profile.labPivot?.[0]??w.profile.anchors?.grip?.[0]??.5,edge:w.profile.edge||'both',kind:w.kind,geometry:w});
 const a=weaponFor(),b=weaponFor('offhand');return a?[make(a),...(b&&b!==a&&['sword','axe','dagger'].includes(b.kind)&&!a.two?[make(b)]:[])]:ARMS.sword1;
}
// Preserve independent dimensions in all blade calculations, including crit holes.
strikeGeom=function(r,w,side,two){
 const L=side==='left'?1:-1,physical=w.physical||global.EquipmentGeometry.pose(w.geometry||weaponFor(),R(active.actor));
 const len=physical.height,iw=physical.width,from=L*(Math.PI/2-.83),to=L*(Math.PI/2+.83),flip=w.edge==='right'&&L<0;
 const offset=headAt(w,{x:0,y:0},len,iw,L*Math.PI/2,flip);
 const pivot={x:r.x+r.w*(w.cutX??(L>0?.29:.71))-offset.x,y:r.cy-offset.y};
 return{pivot,len,iw,from,to,ms:two?500:w.kind==='axe'?430:370,easing:ease.inOut,contact:.5,flip,spin:L};
};
MagicFitPose=function(id,kind,cast){
 id=labActor(id);const w=weaponFor('mainhand',id),p=weaponPoseFor('mainhand',id),grip=w.profile.anchors?.grip||[.5,.78],tip=w.profile.anchors?.tip||[.5,0];
 const lx=(tip[0]-grip[0])*p.width,ly=(tip[1]-grip[1])*p.height;let delta=0,turn=0;
 if(cast?.targetId&&cast.targetId!==id){const t=R(cast.targetId),r=R(id);
  delta=cast.mode==='heal'?Math.atan2(t.y+t.h*.44-p.grip.y,t.cx-p.grip.x)-Math.atan2(ly,lx)-p.angle:clamp(Math.atan2(t.cx-r.cx,Math.max(1,t.cy-r.cy)),-Math.PI/4,Math.PI/4);
  delta=Math.atan2(Math.sin(delta),Math.cos(delta));turn=smooth(cast.time/Math.min(.68,Math.max(.12,cast.charge*.7)))*(1-smooth((cast.time-cast.returnAt)/.28));
 }
 const angle=p.angle+delta*turn;
 return{base:p.grip,tip:{x:p.grip.x+lx*Math.cos(angle)-ly*Math.sin(angle),y:p.grip.y+lx*Math.sin(angle)+ly*Math.cos(angle)},angle,restAngle:p.angle,tiltDegrees:delta*turn*180/Math.PI,len:p.height,width:p.width,s:{key:w.key,grip,tip}};
};
function resizeLayers(){
 backFx.width=W*DPR;backFx.height=H*DPR;
 for(const c of Object.values(cards)){const w=c.rect.w,h=c.rect.h;
  c.canvas.width=Math.ceil(w*DPR);c.canvas.height=Math.ceil(h*DPR);
  for(const a of [c.overlay,c.cornerCanvas]){a.width=Math.ceil(w*1.5*DPR);a.height=Math.ceil(h*1.7*DPR)}
  c.hoodCanvas.width=Math.ceil(w*1.5*DPR);c.hoodCanvas.height=Math.ceil(h*1.4*DPR);c.maskKey='';c.dirty=true;
 }
}
function deathVisual(id){
 const c=cards[id];if(!c||c.death)return;c.death=true;const render=CardEffects.create('death','hit','ПОМЕР');
 decal(id,{life:7,deathWord:true,draw(x,w,h,t){render.word(x,w,h,t)}});
 objs.push({meta:{death:true,target:id},update(){const t=this.age;c.surface.style.filter=`grayscale(${smooth(t/.65)}) brightness(${1-smooth(t/.65)*.25})`;render.draw(ctx,R(id),t);return t<4.2}});
}
function localVisual(type,id){
 if(type==='death'){deathVisual(id);return}
 if(type==='revive'){cards[id].surface.style.filter='';holyPillar(id);SFX.play('revive');impact(id);return}
 if(type==='heal'||type==='royalHeal'){
  const renderer=Divine.createRenderer(type==='royalHeal'?'royal':'beam','wand',id);
  objs.push({meta:{receive:true},update(){renderer.receive(this.age+1.4);if(this.age>.1)impact(id);return this.age<3}});SFX.play('heal');return;
 }
 const renderer=CardEffects.create(type==='mana'?'mp':'hp','hit');SFX.play('drink_potion');
 objs.push({meta:{potion:true,target:id},update(){renderer.draw(ctx,R(id),this.age);if(this.age>=1.34)impact(id);return this.age<3.8}});
}
function beastStrike(ev,tid){
 const target=ev.targets.find(t=>t.id===tid),out=target.outcome||ev.outcome||'hit';
 const kind=ev.animalKind||global.CombatPresentation?.animalKind(ev.actorRecord||cards[ev.actor]?.d.record);
 if(!BEAST_PRESETS[kind])return false;
 const c=cards[tid],p=BEAST_PRESETS[kind],family=PawFX.defs[kind].family,critical=!!ev.critical||out==='crit';
 const bloody=Number(target.damage??ev.damage)>0&&!['miss','parry'].includes(out);
 // Marks, mask openings and paw tips share the real portrait surface, including
 // its shorter height above the HP/name footer. No second clock or game writes.
 const hr=host.getBoundingClientRect(),sr=c.surface.getBoundingClientRect();
 const sx=hr.width/W||1,sy=hr.height/H||1;
 const r={x:(sr.left-hr.left)/sx,y:(sr.top-hr.top)/sy,w:sr.width/sx,h:sr.height/sy};
 const cfg=PawFX.config(kind,r.w,r.h,family==='rat'?null:p),timing=PawFX.timings(critical,family,p.variant);
 const life=timing.life/p.speed,contact=timing.contact/p.speed;
 const renderer={
  holes(t){return bloody&&critical?PawFX.getMarks(cfg,t*p.speed,true).map(m=>PawFX.holeFor(cfg,m,true).map(q=>[q[0]/r.w,q[1]/r.h])):[]},
  marks(x,w,h,t){if(!bloody)return;x.save();x.scale(w/r.w,h/r.h);PawFX.renderWounds(x,IMG,cfg,t*p.speed,critical);x.restore()},
  draw(x,t){x.save();x.translate(r.x+(out==='miss'?-r.w*.45:0),r.y);PawFX.paintPaw(x,IMG[kind+'_paw'],cfg,t*p.speed,critical);x.restore()}
 };
 const effect={renderer,age:0,holes:[],kind,outcome:out};c.claw=effect;
 if(bloody)decal(tid,{life,clawCut:true,critical,draw(x,w,h){renderer.marks(x,w,h,effect.age)}});
 let hit=false;
 objs.push({meta:{claw:true,kind,target:tid,outcome:out},update(){
  const t=this.age;effect.age=t;effect.holes=renderer.holes(t);c.maskKey=null;renderer.draw(ctx,t);
  if(!hit&&t>=contact){
   hit=true;impact(tid);
   const x=r.x+r.w*.5,y=r.y+r.h*.42;
   if(out==='block'){
    if(weaponFor('offhand',tid)?.kind==='shield')shieldPop(tid,x,y,r.h*.45);
    sparks(x,y,14);SFX.play('shield_block');
   }else if(out==='parry'){
    if(['sword','axe','dagger'].includes(weaponFor('mainhand',tid)?.kind))parryBlade(tid,{x,y},0,1);
    sparks(x,y,24);SFX.play('parry');
   }else SFX.play(out==='miss'?'miss':critical?'crit':'dagger_hit');
  }
  return t<life;
 }});
 return true;
}
function dispatch(){
 const ev=active,tid=ev.targets[0]?.id;if(!tid)return;
 const fx=ev.fx,out=ev.outcome||'hit';
 if(ev.healing&&out==='miss'){impact(tid);SFX.play('miss');return;}
 if(options.local){localVisual(fx,tid);return;}
 if(['potion','mana','death'].includes(fx)){localVisual(fx,tid);return}
 if(['heal','royalHeal','revive'].includes(fx)){
  if(ev.actor===tid){localVisual(fx,tid);return}
  const spell=fx==='revive'?'revive':fx==='royalHeal'?'royal':'beam',renderer=Divine.createRenderer(spell,weaponFor()?.kind==='staff'?'staff':'wand',tid),timing=Divine.SPELLS[spell];let landed=false;
  SFX.play('magic_cast');objs.push({meta:{divineHealing:true},update(){renderer.draw(this.age);if(!landed&&this.age>=timing.charge+timing.travel){landed=true;if(fx==='revive')holyPillar(tid);impact(tid);SFX.play(fx==='revive'?'revive':'heal')}return this.age<timing.total}});return;
 }
 const support={bardRiff:'major',bardTaunt:'minor',bardInspire:'inspire',bardFortune:'fortune',bardFlex:'flex',prayerWisdom:'prayerWisdom',prayerStrength:'prayerStrength'}[fx];
 if(support){SupportEffects.start(support,{preview:false,actorId:ev.actor,targetId:tid,targetIds:ev.targets.map(x=>x.id)});return}
 if(fx==='claw'){
  if(beastStrike(ev,tid))return;
  // Unknown future beasts still report their actual result, without borrowing
  // an unrelated animal's paw or keeping the retired generic texture alive.
  impact(tid);SFX.play(out==='miss'?'miss':out==='parry'?'parry':out==='block'?'shield_block':out==='crit'?'crit':'dagger_hit');return;
 }
 if(fx==='howl'||fx==='howlHeal'){SFX.play('wolf_howl');shoutWave(ev.actor,{col:[185,210,255],thick:false,rings:5,targets:ev.targets.map(t=>t.id),onReach:id=>{if(fx==='howlHeal')impact(id);}});return}
 if(FX[fx])FX[fx](tid,out,activeGear());
}
function rectStyle(c,r){c.rect={...r};Object.assign(c.el.style,{left:r.x+'px',top:r.y+'px',width:r.w+'px',height:r.h+'px'});}
function travel(layouts,seconds,done){
 const starts=Object.fromEntries(Object.keys(layouts).map(id=>[id,{...cards[id].rect}]));
 objs.push({meta:{closeupTravel:true},update(){const u=clamp(this.age/seconds,0,1),p=u*u*u*(u*(u*6-15)+10);
  for(const[id,end]of Object.entries(layouts)){const a=starts[id];rectStyle(cards[id],{x:a.x+(end.x-a.x)*p,y:a.y+(end.y-a.y)*p-Math.sin(Math.PI*u)*H*.025,w:a.w+(end.w-a.w)*p,h:a.h+(end.h-a.h)*p});}
  if(u<1)return true;resizeLayers();after(0,done);return false;
 }});
}
sweepTargets=function(){return active.targets.map(t=>t.id)};
function stageAttack(){
 const ev=active,ids=[...new Set([ev.actor,...ev.targets.map(t=>t.id)])],actorCard=cards[ev.actor];
 // The resolved event owns range. Class, current equipment and later retargets
 // must not change a scene already waiting behind its result card.
 const melee=ev.melee===true;
 const close=melee&&options.settings?.().melee!==false&&!options.local;
 active.closeup=close;
 const homes=Object.fromEntries(Object.entries(cards).map(([id,c])=>[id,{...c.rect}])),layouts={};
 const size=clamp(Number(options.settings?.().fighterSize)||100,60,130)/100;
 if(close){
  if(ev.fx==='sweep'){const h=H*.34*size,w=h*9/16;layouts[ev.actor]={x:W*.5-w/2,y:H*.5-h/2,w,h};
   ev.targets.forEach((t,i)=>{const angle=ev.targets.length===2?i*Math.PI:-Math.PI/2+i*Math.PI*2/ev.targets.length,h=H*.26*size,w=h*9/16;layouts[t.id]={x:W*(.5+Math.cos(angle)*.28)-w/2,y:H*(.5+Math.sin(angle)*.33)-h/2,w,h}});
  }else ids.slice(0,2).forEach((id,i)=>{const h=H*.65*size,w=h*9/16;layouts[id]={x:W*(i?.655:.345)-w/2,y:H*.53-h/2,w,h}});
  layer.classList.add('gvfx-closeup');for(const id of ids)cards[id].el.classList.add('gvfx-focus');
 }else if(!options.local){
  for(const[id,c]of Object.entries(cards)){const r=c.rect;if(ids.includes(id))layouts[id]={x:clamp(r.x-r.w*.075,4,W-r.w*1.15-4),y:clamp(r.y-r.h*.075-16,4,H-r.h*1.15-4),w:r.w*1.15,h:r.h*1.15};
   else{let dx=0;for(const aid of ids){const a=homes[aid];if(a&&Math.abs(a.y-r.y)<r.h*.4&&Math.abs(a.x-r.x)<r.w*1.8)dx+=Math.sign(r.x-a.x)*r.w*.09}if(dx)layouts[id]={...r,x:r.x+dx};}
  }
 }
 const duration=['revive','royalHeal'].includes(ev.fx)?6.5:ev.fx.startsWith('bard')||ev.fx.startsWith('prayer')?7.4:ev.outcome==='crit'||ev.targets.some(t=>t.killed)?6.2:['fireball','shadow','claw','death'].includes(ev.fx)?5.7:4.1;
 const attack=()=>{dispatch();after(duration*1000,()=>{
  // Pending label callbacks are presentation-only; no late callbacks may leak into the next event.
  tasks.length=0;objs.length=0;parts.length=0;SupportEffects.clear();
  if(Object.keys(layouts).length)travel(homes,close?.72:.25,complete);else complete();
 })};
 if(Object.keys(layouts).length)travel(layouts,close?.88:.25,()=>after(close?180:0,attack));else attack();
}
function buildScene(){
 W=host.clientWidth;H=host.clientHeight;DPR=Math.min(2,devicePixelRatio||1);front.width=W*DPR;front.height=H*DPR;
 const hr=host.getBoundingClientRect(),sx=hr.width/W||1,sy=hr.height/H||1;
 for(let data of options.cards()){
  if(data.id===active.actor&&active.actorRecord)data={...data,record:active.actorRecord,cls:active.actorRecord.cls||data.cls,role:active.actorRole||data.role};
  const original=data.el;if(!original||!original.isConnected)continue;const r=original.getBoundingClientRect();if(!r.width||!r.height)continue;
  const el=original.cloneNode(true);el.removeAttribute('id');el.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));el.classList.add('gvfx-card');el.classList.remove('dead');el.querySelectorAll('.dead').forEach(n=>n.classList.remove('dead'));
  const surface=el.querySelector('.card-header,.doll-face')||el;surface.classList.add('gvfx-surface');
  let portrait=surface.querySelector('.enemy-bg-img,.base-character');if(!portrait){portrait=document.createElement('img');portrait.src=data.art;portrait.className='gvfx-portrait';surface.prepend(portrait);}
  const canvas=document.createElement('canvas'),overlay=document.createElement('canvas'),hoodCanvas=document.createElement('canvas'),cornerCanvas=document.createElement('canvas');
  canvas.className='gvfx-decal';overlay.className='gvfx-status';hoodCanvas.className='gvfx-hood';cornerCanvas.className='gvfx-corners';surface.append(canvas);el.prepend(hoodCanvas);el.append(overlay,cornerCanvas);
  const burnLabel=document.createElement('span');burnLabel.hidden=true;el.append(burnLabel);
  // Compatibility bar is not visible; real HP stays in the game DOM and event payload.
  const bar=document.createElement('span');bar.className='hp';bar.hidden=true;bar.append(document.createElement('i'));el.append(bar);
  const c={el,surface,canvas,ctx:canvas.getContext('2d'),overlay,overlayCtx:overlay.getContext('2d'),hoodCanvas,hoodCtx:hoodCanvas.getContext('2d'),cornerCanvas,cornerCtx:cornerCanvas.getContext('2d'),burnLabel,
   burns:[],impactScorches:[],decals:[],weaponCuts:[],maskKey:'',hero:data.type!=='enemy',d:data,hp:data.hp,max:data.maxHP,dirty:true};
  cardStore[data.id]=c;world.append(el);rectStyle(c,{x:(r.left-hr.left)/sx,y:(r.top-hr.top)/sy,w:r.width/sx,h:r.height/sy});
  (c.hero?HEROES:ENEMIES).push({id:data.id,name:data.name});
 }
 resizeLayers();sync();
}
function sync(){syncAmbient();if(!active)return;for(const c of options.cards()){if(cards[c.id]&&c.el)c.el.dataset.vfxHidden='true';}}
function complete(){
 cancelAnimationFrame(raf);raf=0;tasks.length=objs.length=parts.length=0;SupportEffects?.clear();
 for(const c of options.cards())if(c.el)delete c.el.dataset.vfxHidden;
 for(const c of Object.values(cardStore)){c.el.getAnimations({subtree:true}).forEach(a=>a.cancel());c.el.remove()}
 for(const id of Object.keys(cardStore))delete cardStore[id];HEROES.length=ENEMIES.length=0;weapons.clear();
 front.getContext('2d').clearRect(0,0,front.width,front.height);back.getContext('2d').clearRect(0,0,back.width,back.height);
 layer.classList.remove('gvfx-closeup');layer.style.display='none';active=null;const done=finish;finish=null;done?.();syncAmbient();
}
function cancel(){generation++;complete();}
function frame(now){
 if(!active)return;let dt=Math.max(0,(now-last)/1000);last=now;if(hitstop>0){hitstop-=dt;dt*=.06}clock+=dt*1000;
 try{
  for(let i=tasks.length-1;i>=0;i--)if(tasks[i].at<=clock){const t=tasks.splice(i,1)[0];t.fn();if(!active)return}
  ctx.setTransform(DPR,0,0,DPR,0,0);ctx.clearRect(0,0,W,H);backCtx.setTransform(DPR,0,0,DPR,0,0);backCtx.clearRect(0,0,W,H);
  drawStatuses(dt);drawObjs(dt);drawParts(dt);SupportEffects.draw(dt);drawVignette(dt);drawDecals(dt);
 }catch(error){console.error('VFX presentation',error);options.onError?.(error);cancel();return}
 if(active)raf=requestAnimationFrame(frame);
}
// Persistent statuses are derived from live turn state, never lab countdowns.
const ambient=document.createElement('canvas');ambient.className='gvfx-ambient';host.append(ambient);
const ambientCtx=ambient.getContext('2d'),ambientActors=new Map();let ambientRAF=0,ambientStart=performance.now();
function clearAmbient(){
 cancelAnimationFrame(ambientRAF);ambientRAF=0;ambientCtx.clearRect(0,0,ambient.width,ambient.height);
 for(const data of options.cards())if(data.el?.dataset.vfxFlex){data.el.style.rotate='';data.el.style.translate='';delete data.el.dataset.vfxFlex;}
}
function ambientFrame(now){
 ambientRAF=0;if(active||options.local||!VFX.ready){clearAmbient();return}
 const game=global.CombatRules,worldState=options.world?.()||{},all=options.cards();
 const hr=host.getBoundingClientRect(),width=host.clientWidth,height=host.clientHeight,ratio=hr.width/width||1;
 if(ambient.width!==width||ambient.height!==height){ambient.width=width;ambient.height=height;}
 ambientCtx.clearRect(0,0,width,height);const t=(now-ambientStart)/1000;let visible=false;
 prepareIceStages();
 for(const data of all){
  if(!data.el)continue;const p=data.record||{},alive=data.hp>0,burn=alive&&game?.burnLeft(p)>0,frost=alive&&game?.frostLeft(p)>0;
  const flex=alive&&data.type==='enemy'&&!data.animal&&game?.isDisoriented(p),riff=alive&&game?.inspiringActive(p,worldState);
  if(!flex&&data.el.dataset.vfxFlex){data.el.style.rotate='';data.el.style.translate='';delete data.el.dataset.vfxFlex;}
  if(!burn&&!frost&&!flex&&!riff){ambientActors.delete(data.id);continue}
  visible=true;const b=data.el.getBoundingClientRect(),r={x:(b.left-hr.left)/ratio,y:(b.top-hr.top)/ratio,w:b.width/ratio,h:b.height/ratio};
  if(flex){data.el.dataset.vfxFlex='true';data.el.style.rotate=Math.sin(t*6)*1.43+'deg';data.el.style.translate='0 '+(-Math.abs(Math.sin(t*6))*5)+'px';SupportEffects.drawNotes(ambientCtx,r,t,'#9754c7');}
  ambientCtx.save();ambientCtx.translate(r.x,r.y);
  if(burn){ApprovedFire.burn(ambientCtx,r.w,r.h,t,1,false,1,Infinity);ApprovedFire.corners(ambientCtx,r.w,r.h,t,1,false)}
  if(frost&&iceStages[3])ambientCtx.drawImage(iceStages[3],-r.w*.105,r.h*.63,r.w*1.21,r.h*.47);
  ambientCtx.restore();
  if(riff){
   const weapon=global.EquipmentGeometry.resolve({...p,cls:data.cls,type:data.type},'mainhand',options.settings?.().personalWeapons===true,options.items?.());
   if(weapon){const pose=global.EquipmentGeometry.pose(weapon,r),im=IMG[weapon.key]||IMG[weapon.template];
    const head=Object.values(worldState.queue||{})[0],own=head?.type==='player'&&'player:'+head.id===data.id;
    const boost=own?1.21:1;if(loaded(im)){ambientCtx.save();ambientCtx.translate(pose.cx,pose.cy);ambientCtx.rotate(pose.angle+Math.sin(t*5)*.035);ambientCtx.drawImage(im,-pose.width*boost/2,-pose.height*boost/2,pose.width*boost,pose.height*boost);ambientCtx.restore();}
    SupportEffects.drawNotes(ambientCtx,r,t,'#ffe08b');
   }
  }
 }
 if(visible)ambientRAF=requestAnimationFrame(ambientFrame);
}
function syncAmbient(){if(options.local)return;if(active){clearAmbient();return}if(!ambientRAF)ambientRAF=requestAnimationFrame(ambientFrame);}

const ready=Promise.all((global.vfxAssetManifest||[]).filter(a=>!options.local||/potion_hp|potion_mp|cuts_atlas/.test(a.file)).map(a=>new Promise(resolve=>{const key=a.file.split('/').pop().replace('.webp',''),im=img(key,a.file);im.onload=()=>resolve(true);im.onerror=()=>resolve(false);if(im.complete)resolve(!!im.naturalWidth)}))).then(values=>{
 Object.assign(IMG,{dagger:IMG.dagger_stock,shield:IMG.shield_dragon,lute_old:IMG.daddy_old_lute,lute_dead:IMG.dead_bards_lute});ApprovedFire.prepare(IMG);VFX.ready=values.every(Boolean);syncAmbient();return VFX.ready;
});
async function play(event){
 const token=++generation;if(!await ready||token!==generation)return false;
 if(active)complete();active=structuredClone(event);layer.style.display='block';buildScene();
 if(!cards[active.actor]||!active.targets?.length||active.targets.some(t=>!cards[t.id])){complete();return false}
 targetId=active.targets[0].id;healId=targetId;Lab.activeEnemy=cards[active.actor].hero?null:active.actor;
 for(const[id,c]of Object.entries(cards))for(const slot of ['mainhand','offhand']){
  const w=global.EquipmentGeometry.resolve({...c.d.record,cls:c.d.cls,type:c.d.type},slot,options.settings?.().personalWeapons===true,options.items?.());
  if(!w)continue;
  const rows=w.profile.geometry?.rows,cw=w.profile.canvas?.width,ch=w.profile.canvas?.height;
  if(w.personal&&rows?.length&&cw&&ch){const left=[],right=[];for(const[y,spans]of rows){left.push([spans[0][0]/cw,y/ch]);right.push([spans[spans.length-1][1]/cw,y/ch])}WEAPON_CONTOURS[w.key]=left.concat(right.reverse());}
  else if(!WEAPON_CONTOURS[w.key])WEAPON_CONTOURS[w.key]=WEAPON_CONTOURS[w.template]||WEAPON_CONTOURS.sword_short;
  weapons.set(id+':'+slot,w);
  if(!IMG[w.key]){const im=new Image();im.src=options.assetUrl(w.image);IMG[w.key]=im;await new Promise(resolve=>{if(im.complete)resolve();else{const timer=setTimeout(resolve,5000);im.onload=im.onerror=()=>{clearTimeout(timer);resolve()}}});}
  if(token!==generation)return false;
  if(!loaded(IMG[w.key]))weapons.set(id+':'+slot,global.EquipmentGeometry.resolve({...c.d.record,cls:c.d.cls,type:c.d.type},slot,false,options.items?.()));
 }
 if(token!==generation)return false;
 const w=weaponFor();if(w){Lab.enemyWeapon=w.kind;control('priestWeapon').value=control('mageWeapon').value=w.kind==='staff'?'staff':'wand';if(w.kind==='bow'){BOW.key=w.key;BOW.grip=w.profile.anchors.grip;BOW.top=w.profile.anchors.tip;BOW.bot=w.profile.anchors.bowBottom||[.22,.985];BOW.rest=w.profile.anchors.rest?.[0]??.243;}if(w.kind==='instrument'){IMG.lute_dead=IMG[w.key];control('instrument').value='lute_dead';}if(w.kind==='dagger')IMG.dagger=IMG[w.key];}
 return new Promise(resolve=>{finish=()=>resolve(true);clock=0;last=performance.now();stageAttack();raf=requestAnimationFrame(frame)});
}
return{play,cancel,sync,ready,setVolume:v=>SFX.deviceVolume(v),sound:key=>SFX.play(key),snapshot:()=>({clock,active:active?structuredClone(active):null,cards:Object.keys(cardStore),tasks:tasks.length,objects:objs.length,particles:parts.length,errors:MISSING}),destroy(){cancel();clearAmbient();ambient.remove();layer.remove()}};
}
global.GrivensburgVFX={create,version:'1.2.0',approved:'lab-2.9.0 + closeup-contact + gear-3.5.1 + beasts-08'};
})(window);
