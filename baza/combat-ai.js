/* Гривенсбург: выбор действий, без расчёта урона, записи состояния и UI.
   Загружать после combat-rules.js. Browser / Worker / Node VM.
   Все случайные решения получают rng снаружи. Правила мести и реакции
   остаются в CombatRules; план не является разрешением обойти их. */
(function (g) {
'use strict';
const VERSION = 'ai-workshop-1.2.0';
const PROFILES = Object.freeze({
    animal: { name:'Обычное животное', priorities:{}, ready:true },
    animal_boss: { name:'Разумное животное / босс-животное', priorities:{fear_howl:100}, ready:true },
    boss: { name:'Разумный босс', priorities:{fury:100}, ready:true },
    melee: { name:'Воин с ближним оружием', priorities:{}, ready:true },
    shield: { name:'Воин со щитом', priorities:{}, ready:true },
    archer: { name:'Стрелок', priorities:{}, ready:true },
    mage: { name:'Маг · пока обычная дальняя атака', priorities:{}, ready:true },
    rogue: { name:'Разбойник / Спук', priorities:{}, ready:true },
    flying: { name:'Летающий — отдельный будущий тип', priorities:{}, ready:false }
});
const n = value => Number(value) || 0;
const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);

function create(options) {
    const opt=options || {}, R=opt.rules || g.CombatRules;
    if (!R) throw new Error('CombatAI requires CombatRules');
    const profiles=Object.assign({},PROFILES,opt.profiles || {});
    const bindings=Object.assign({},R.ENEMY_ABILITY_DEFAULTS,opt.bindings || {});
    const abilities=Object.assign({
        potion: {
            stage:'extra', priority:100, executor:'potion',
            candidates:c => {
                const plan=c.actor.ai?.allowPotion===false?null:R.planEnemyPotion(c.actor);
                return plan ? [{kind:'potion',targetId:c.actorId,plan,reason:'Здоровье ниже четверти; есть зелье'}] : [];
            }
        },
        fear_howl: {
            stage:'main', priority:100, executor:'fear_howl',
            candidates:c => R.planFearHowl(c.actor,c.actorId,c.world.battleNo)
                ? [{kind:'ability',reason:'Пришло время устрашения'}] : []
        },
        fury: {
            stage:'main', priority:100, executor:'fury',
            candidates:c => R.shouldRoarFury({enemy:c.actor,round:c.world.round})
                ? [{kind:'ability',reason:'Пришло время клича главаря'}] : []
        },
        attack: {
            stage:'target', priority:0, executor:'attack',
            candidates:c => {
                if(typeof c.rng!=='function')throw new Error('CombatAI: pass rng for target selection');
                const pick=R.pickEnemyTarget({enemy:c.actor,enemyId:c.actorId,rng:c.rng,
                    world:c.world,enemies:c.world.enemies || {},candidates:c.targets});
                if(pick && c.actor.ai?.tactic==='weakest' && !c.actor.aggroTargetId && !c.actor.retargetIntent){
                    let legal=c.targets.filter(t=>t.alive&&!t.stealth && (!R.isMeleeEnemy(c.actor)||R.canEngageMelee(t.id,c.world.enemies||{},c.actorId)));
                    if(R.isMeleeEnemy(c.actor))legal=R.enemyTargetPool({enemy:c.actor,enemyId:c.actorId,world:c.world,enemies:c.world.enemies || {},candidates:legal});
                    legal.sort((a,b)=>(c.world.players?.[a.id]?.hp ?? Infinity)-(c.world.players?.[b.id]?.hp ?? Infinity));
                    if(legal.length)return [{kind:'attack',targetId:legal[0].id,reason:'Самая слабая доступная цель при первом выборе'}];
                }
                return pick ? [{kind:'attack',targetId:pick.id,reason:pick.reason}] : [];
            }
        }
    },opt.abilities || {});

    function profileFor(actor, side) {
        const a=actor || {}, explicit=a.ai && a.ai.profile || a.aiProfile;
        if(explicit) {
            if(!own(profiles,explicit))throw new Error('Unknown AI profile: '+explicit);
            return explicit;
        }
        if(side==='companion')return a.companionKey==='spook' ? 'rogue' : null;
        if(a.human===false)return a.isUnique || a.isBoss ? 'animal_boss' : 'animal';
        if(a.isUnique || a.isBoss)return 'boss';
        if(a.cls==='mage')return 'mage';
        if(a.isRanged || a.role==='back')return 'archer';
        if(a.hasShield || R.defenseKind(a)==='block')return 'shield';
        return 'melee';
    }
    function skillIds(actor) {
        // Явно заданные skills заменяют видовой набор активных способностей.
        // Зелье и обычная атака доступны только по собственным условиям.
        const supplied=actor.ai && actor.ai.skills;
        if(supplied!=null && !Array.isArray(supplied))throw new Error('ai.skills must be an array');
        return [...new Set(['potion','attack'].concat(supplied || bindings[actor.key] || []))];
    }
    function context(p) {
        const actor=p.enemy || p.actor || {}, world=p.world || {};
        const profile=profileFor(actor,'enemy');
        return {actor,actorId:p.enemyId || actor.id,world,profile,rng:p.rng,targets:p.candidates || [],
            rules:R,stage:p.stage || 'main',supported:p.supported || ['potion','fear_howl','fury','attack']};
    }
    function evaluate(p) {
        const c=context(p), rows=[], rejected=[];
        if(!profiles[c.profile].ready || !R.enemyAlive(c.actor) || R.isEnemyDisabled(c.actor))
            return {profile:c.profile,choices:[],rejected:[{reason:!profiles[c.profile].ready?'Профиль ещё не реализован':'Погиб или под полным контролем'}]};
        for(const id of skillIds(c.actor)) {
            const a=abilities[id];
            if(!a){rejected.push({abilityId:id,reason:'Способность не зарегистрирована'});continue;}
            if(a.stage!==c.stage)continue;
            if(!c.supported.includes(a.executor)){rejected.push({abilityId:id,reason:'Нет исполнителя в этом приложении'});continue;}
            // costs и cooldowns — метаданные для новых способностей. Списание
            // и запись КД выполняет исполнитель через общий движок, не ИИ.
            if(Object.entries(a.costs || {}).some(([key,value])=>n(c.actor[key])<n(value))) {
                rejected.push({abilityId:id,reason:'Не хватает ресурса'});continue;
            }
            const ready=(c.actor.aiCooldowns || {})[id];
            if(ready!=null && n(ready)>n(c.world.round)) {
                rejected.push({abilityId:id,reason:'Перезарядка'});continue;
            }
            if(a.canUse && !a.canUse(c)){rejected.push({abilityId:id,reason:'Условия применения не выполнены'});continue;}
            const candidates=a.candidates(c) || [];
            for(const choice of candidates) {
                const score=n(a.priority)+n((profiles[c.profile].priorities || {})[id])
                    + n(a.score ? a.score(c,choice) : choice.score);
                rows.push(Object.assign({},choice,{abilityId:id,executor:a.executor,profile:c.profile,score}));
            }
        }
        rows.sort((a,b)=>b.score-a.score || a.abilityId.localeCompare(b.abilityId)
            || String(a.targetId || '').localeCompare(String(b.targetId || '')));
        return {profile:c.profile,choices:rows,rejected};
    }
    function planEnemy(p) {
        const report=evaluate(p);
        return report.choices[0] || null;
    }
    // Run once after abilities/control, before resolving movement and attacks.
    // Commit returned enemy facts; this function does not itself change target.
    function planRetarget(p) {
        const e=p.enemy || {}, w=p.world || {};
        if(R.isOrdinaryAnimal(e))return R.planAnimalRetarget({enemy:e,candidates:p.candidates,
            roll:p.rng(),round:w.round,battleNo:w.battleNo});
        return R.planShieldRetarget(p);
    }
    function canAutoCompanion(actor) {
        const a=actor || {};
        return !!a.mercenary && a.autoPlay!==false && profileFor(a,'companion')==='rogue';
    }
    function planCompanion(actor,world) {
        const p=Object.assign({},actor,{companionKey:actor.companionKey || ((world || {}).mercs || {})[actor.id]?.key});
        if(!canAutoCompanion(p))return {kind:'wait',reason:'Для наёмника нет подключённого исполнителя'};
        const plan=R.planSpookTurn(p,world);
        return Object.assign({},plan,{profile:'rogue',abilityId:plan.kind==='attack'
            ? (plan.skill || (plan.prepareSneak || actor.sneakNextHit ? 'sneak_hit' : 'attack')) : 'wait'});
    }
    return Object.freeze({VERSION,profileFor,planEnemy,planRetarget,evaluate,planCompanion,canAutoCompanion,
        describe:()=>({version:VERSION,profiles:Object.keys(profiles).map(id=>({id,name:profiles[id].name,ready:profiles[id].ready})),
            abilities:Object.keys(abilities).map(id=>({id,stage:abilities[id].stage,executor:abilities[id].executor}))})});
}
g.CombatAI=Object.freeze(Object.assign({create,VERSION},create()));
})(typeof window!=='undefined' ? window : globalThis);
