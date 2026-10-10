/* Общий показ эффектов. Правила и длительности приходят из CombatRules. */
(function (root) {
    'use strict';
    const escape = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const explanations = {
        stealth: 'Скрытность: враги не выбирают разбойника обычной сменой цели, пока его никто не держит в ближнем бою. Повторное попадание по цели с его Присутствием раскрывает разбойника.',
        presence: 'Присутствие разбойника: повторное попадание владельца по этой цели раскрывает его перед всеми врагами с его Присутствием. После собственного хода врага и попадания другого героя уходит по одному стаку. «Без палева» не меняет эти стаки.',
        intercepted: 'Попытка перехвата уже выполнена для текущей цели. Повторной попытки на том же пути не будет; смена цели снимает отметку.',
        hangover: 'Бадун: штрафы к атаке и защите до начала следующего боя или опохмеления.'
    };
    function remaining(e, round) {
        if (Number(e.counter) > 0) return Number(e.counter);
        if (e.duration === 'turns') return Math.max(0,Number(e.turnsLeft) || 0);
        return Number(e.duration) > 0 ? Math.max(0,(Number(e.setRound) || 0) + Number(e.duration) - (Number(round) || 1)) : 0;
    }
    function text(e, round) {
        let out = explanations[e.id] || e.tooltip || e.name || e.id || 'Эффект';
        const mods = e.modifiers || {};
        const labels = {atk:'к броску атаки',def:'к броску защиты',dmg:'к урону',critChance:'к шансу крита',critPower:'к силе крита'};
        const values = Object.keys(labels).filter(k => Number(mods[k])).map(k => (mods[k] > 0 ? '+' : '') + mods[k] + ' ' + labels[k]);
        const missing=values.filter(v=>!out.includes(v));
        if (missing.length) out += '\nПоправки: ' + missing.join(', ');
        const left = remaining(e,round);
        if (left) out += '\n' + (e.duration === 'days' ? 'Игровых дней осталось: ' : ['fortune','shield'].includes(e.id) ? 'Зарядов осталось: ' : e.id === 'presence' ? 'Стаков осталось: ' : ['frostbite','stun','hamstring','disorientation','controlReady','burn','fury'].includes(e.id) || e.duration === 'turns' ? 'Собственных ходов осталось: ' : 'Раундов осталось: ') + left;
        if (e.duration === 'permanent') out += '\nПостоянный эффект.';
        if (e.suppressed) out += '\nСейчас подавлен.';
        return out;
    }
    function icon(e, kind, url, round, classes = '') {
        const label = text(e, round), mod = Number((e.modifiers || {}).atk) || 0;
        const counter = remaining(e,round);
        return '<span class="effect-icon ' + escape(kind + ' ' + classes) + '" tabindex="0" role="button" data-effect-tip="' + escape(label) + '" aria-label="' + escape(label) + '">'
            + '<span class="effect-letter">' + escape(e.id === 'hell_flex' ? '♫' : String(e.name || e.tooltip || e.id || '?')[0]) + '</span>'
            + (url ? '<img src="' + escape(url) + '" alt="" onerror="this.remove()">' : '')
            + (mod ? '<b class="effect-mod">' + (mod > 0 ? '+' : '') + mod + '</b>' : '')
            + (counter > 0 ? '<b class="effect-count">' + counter + '</b>' : '') + '</span>';
    }
    function spellText(it, resource = 'маны') {
        const bits = [], rules = root.CombatRules;
        if (it.subtype === 'revive') return 'Поднять павшего союзника с ' + rules.REVIVE_LEVELS.join('/') + '% максимального HP за столько же Веры. Главное действие, без броска, раз в игровой день.';
        if (Number(it.spellDamage)) bits.push('Урон до результата броска: ' + it.spellDamage + ' + интеллект.');
        if (Number(it.healPct)) bits.push('Лечение: ' + it.healPct + '% максимального HP цели до результата броска.');
        if (it.freezes) bits.push('Обморожение: запрещает движение до конца ближайшего собственного хода цели; огонь снимает эффект. Атаки с места по соседу и стрельба доступны.');
        if (it.burns) bits.push('При попадании — горение: в начале ' + rules.BURN_TURNS + ' следующих собственных ходов цели по ' + rules.BURN_RATE*100 + '% итогового урона попадания, с округлением вверх.');
        if (!bits.length && it.desc) bits.push(it.desc);
        bits.push('Главное действие, бросок кубика. Цена: ' + (Number(it.manaCost) || 0) + ' ' + resource + '.');
        return bits.join(' ');
    }
    let skillResolver = null, dismiss = () => {};
    function skillInfo(el) { return skillResolver ? skillResolver(el._skillSource || el) : null; }
    function refreshSkills(host = root.document) {
        if (!skillResolver || !host?.querySelectorAll) return;
        host.querySelectorAll('button:disabled[data-act]').forEach(button => {
            if (button.parentElement?.classList.contains('skill-hint') || !skillInfo(button)) return;
            const wrapper = button.ownerDocument.createElement('span');
            wrapper.className = 'skill-hint'; wrapper.tabIndex = 0; wrapper._skillSource = button;
            wrapper.setAttribute('aria-label',skillInfo(button).title + ' — описание недоступного навыка');
            button.replaceWith(wrapper); wrapper.appendChild(button);
        });
    }
    function configureSkills(resolver) { skillResolver = resolver; refreshSkills(); }
    function install(doc) {
        if (!doc || doc.getElementById('effect-tooltip-style')) return;
        const style = doc.createElement('style'); style.id = 'effect-tooltip-style';
        style.textContent = `.effect-icon{--effect-color:#2ecc71;position:relative;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;flex-shrink:0;box-sizing:border-box;border:1px solid var(--effect-color);border-radius:50%;background:#17120d;color:#eee;cursor:help;vertical-align:middle;font-size:12px;font-weight:800}
        .effect-icon.debuff{--effect-color:#e8746a}.effect-icon img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%}
        .effect-icon .effect-count,.effect-icon .effect-mod{position:absolute;z-index:3;right:-1px;bottom:-2px;min-width:16px;padding:1px 3px;box-sizing:border-box;border:1px solid var(--effect-color);border-radius:9px;background:#18120e;color:#fff;font:800 11px/1.2 'Segoe UI',sans-serif;text-align:center}
        .effect-icon .effect-mod{right:auto;left:-2px;color:var(--effect-color)}.effect-icon:focus-visible{outline:2px solid #f2d99c;outline-offset:2px}
        .effect-icon.passive{box-shadow:0 0 7px #da913d;border-color:#eab961;color:#ffd78e}
        .skill-hint{display:inline-flex;max-width:100%;align-items:center;justify-content:center}.vit-skills .skill-hint{align-self:flex-start}.skill-hint:focus-visible{outline:2px solid #f2d99c;outline-offset:2px;border-radius:6px}.skill-hint>button:disabled{pointer-events:none}.list .skill-hint{display:flex;width:100%}\n        #effect-tooltip{position:fixed;z-index:2147483647;max-width:min(320px,calc(100vw - 20px));box-sizing:border-box;padding:10px 12px;border:1px solid #ba975b;border-radius:7px;background:#211b15;color:#f3eadb;box-shadow:0 5px 24px #000b;font:14px/1.4 'Segoe UI',sans-serif;white-space:pre-line;pointer-events:none}\n        #effect-tooltip.interactive{pointer-events:auto;max-height:calc(100vh - 20px);overflow:auto}#effect-tooltip .tip-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}#effect-tooltip button{font:inherit;padding:6px 12px;border:1px solid #b89965;border-radius:5px;background:#443525;color:#ffedc9;cursor:pointer}`;
        doc.head.appendChild(style);
        /* Фильтр .dead-state на body меняет опору position:fixed. Подсказка
           вне body остаётся в пределах экрана и у павшего героя. */
        const tip = doc.createElement('div'); tip.id = 'effect-tooltip'; tip.hidden = true; tip.setAttribute('role','tooltip'); doc.documentElement.appendChild(tip);
        let owner = null, interactive = false, press = null, suppressClick = null, touchAt = 0, originalTitle = null;
        function hide() {
            tip.hidden = true;
            if (owner) { owner.removeAttribute('aria-describedby'); if (originalTitle !== null) (owner._skillSource || owner).setAttribute('title',originalTitle); }
            owner = null; originalTitle = null; interactive = false;
        }
        dismiss = hide;
        function show(el, touch = false) {
            const info = el.dataset.effectTip ? null : skillInfo(el);
            if (!el.dataset.effectTip && !info) return;
            hide(); owner = el; interactive = touch && !!info; tip.replaceChildren();
            const source = el._skillSource || el;
            originalTitle = source.getAttribute('title'); if (originalTitle !== null) source.removeAttribute('title');
            const content = doc.createElement('div');
            content.textContent = info ? info.title + '\n' + info.text + (info.why ? '\nСейчас недоступно: ' + info.why : '') : el.dataset.effectTip;
            tip.appendChild(content); tip.hidden = false; tip.classList.toggle('interactive',interactive); el.setAttribute('aria-describedby',tip.id);
            if (interactive) {
                const actions = doc.createElement('div'); actions.className = 'tip-actions';
                const close = doc.createElement('button'); close.type = 'button'; close.textContent = 'ОК'; close.onclick = hide; actions.appendChild(close);
                tip.appendChild(actions);
            }
            const r = el.getBoundingClientRect(), t = tip.getBoundingClientRect();
            tip.style.left = Math.max(10,Math.min(r.left + r.width / 2 - t.width / 2, root.innerWidth - t.width - 10)) + 'px';
            tip.style.top = Math.max(10,r.top > t.height + 16 ? r.top - t.height - 8 : Math.min(root.innerHeight - t.height - 10,r.bottom + 8)) + 'px';
        }
        const target = e => e.target.closest?.('[data-effect-tip],.skill-hint,[data-act]');
        function cancelPress() { if (press) clearTimeout(press.timer); press = null; }
        function sameTarget(a,b) { return a===b || a?.contains?.(b) || b?.contains?.(a); }
        doc.addEventListener('pointerdown',e => {
            cancelPress();
            suppressClick=null;
            if (e.pointerType!=='touch' && e.pointerType!=='pen') return;
            touchAt=Date.now();
            if (tip.contains(e.target)) return;
            const el=target(e);
            if (!el || (!el.dataset.effectTip && !skillInfo(el))) return;
            const held={el,id:e.pointerId,x:e.clientX,y:e.clientY,shown:false}; press=held;
            held.timer=setTimeout(()=>{
                if(press!==held || !el.isConnected)return;
                held.shown=true; suppressClick={el,at:Date.now()}; show(el,true);
            },500);
        },true);
        doc.addEventListener('pointermove',e=>{
            if(press && e.pointerId===press.id && Math.hypot(e.clientX-press.x,e.clientY-press.y)>10)cancelPress();
        },true);
        doc.addEventListener('pointerup',e=>{
            if(!press || e.pointerId!==press.id)return;
            if(press.shown)suppressClick={el:press.el,at:Date.now()};
            cancelPress();
        },true);
        doc.addEventListener('pointercancel',cancelPress,true);
        doc.addEventListener('contextmenu',e=>{
            if(press || suppressClick && Date.now()-suppressClick.at<1500 && sameTarget(suppressClick.el,target(e)))e.preventDefault();
        },true);
        doc.addEventListener('mouseover',e => { const el = target(e); if (!interactive && Date.now()-touchAt>1200 && el && el !== owner) show(el); });
        doc.addEventListener('mouseout',e => { if (!interactive && owner && !owner.contains(e.relatedTarget)) hide(); });
        doc.addEventListener('focusin',e => { const el = target(e); if (!interactive && Date.now()-touchAt>1200 && el) show(el); });
        doc.addEventListener('focusout',() => { if (!interactive) hide(); });
        doc.addEventListener('click',e => {
            if (tip.contains(e.target)) return;
            const el=target(e);
            if(suppressClick && Date.now()-suppressClick.at<1500 && sameTarget(suppressClick.el,el)) {
                suppressClick=null;e.preventDefault();e.stopImmediatePropagation();return;
            }
            suppressClick=null;
            if (el?.dataset.effectTip || el?._skillSource?.disabled) {
                e.preventDefault(); e.stopPropagation(); show(el,!!el._skillSource); return;
            }
            /* Доступная кнопка всегда идёт в обычный обработчик действия. */
            hide();
        },true);
        doc.addEventListener('keydown',e => {
            if (e.key === 'Escape') { hide(); return; }
            const el = target(e);
            if (el && ['Enter',' '].includes(e.key) && (el.dataset.effectTip || el._skillSource)) {
                e.preventDefault(); e.stopPropagation(); show(el,!!el._skillSource);
            }
        },true);
        doc.addEventListener('scroll',e => { cancelPress(); if (!tip.contains(e.target)) hide(); },true); root.addEventListener('resize',()=>{cancelPress();hide();});

    }
    root.EffectUI = {text,icon,spellText,install,configureSkills,refreshSkills,hide:() => dismiss()};
    if (root.document?.head) {
        if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded',() => install(root.document),{once:true});
        else install(root.document);
    }
})(typeof window !== 'undefined' ? window : globalThis);
