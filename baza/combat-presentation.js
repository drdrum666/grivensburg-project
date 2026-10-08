/* Typed, final combat result. Names are captions, never participant identifiers. */
(function(g){'use strict';
const key=(type,id)=>(type==='enemy'?'enemy:':'player:')+id;
const effects={royal_heal:'royalHeal',heal:'heal',revive:'revive',resurrection:'revive',fireball:'fireball',fire_arrow:'fire',ice_arrow:'ice',lightning:'lightning',mass_aggro:'cry'};
function describe(p,world={},items={}){
 if(!p.actorId)return null;
 const actorType=p.actorType||'player',record=(actorType==='enemy'?world.enemies:world.players)?.[p.actorId];if(!record)return null;
 const actor=key(actorType,p.actorId),who={...record,cls:record.cls||p.artCls||(record.isRanged?'archer':'warrior'),type:actorType},weapon=g.EquipmentGeometry?.resolve(who,'mainhand',false,items);
 const role=who.cls==='priest'?g.CombatRules.getRole({...who,...who.slots}):who.role;
 const outcome=p.visualOutcome||p.artOutcome||(p.isCrit?'crit':p.kind==='ability'||p.fx?'hit':p.damage>0?'hit':'miss');
 const spell=p.spell||items[p.spellKey];
 let fx=p.fx||effects[p.effectId]||(spell?.freezes?'ice':spell?.burns?'fireball':spell?.damageType==='fire'?'fire':spell?.subtype==='heal'?(spell.effectId==='royal_heal'?'royalHeal':'heal'):spell?.subtype==='revive'?'revive':null);
 if(!fx){
  if(actorType==='enemy' && (record.type==='beast'||record.category==='beast'||/rat|wolf|bear|boar|spider/.test(record.key||record.img||'')))fx='claw';
  else fx=({bow:'arrow',staff:'bolt',wand:'bolt',instrument:'bard',dagger:'shadow'})[weapon?.kind]||'strike';
 }
 const targetType=p.targetType||'enemy',healing=['heal','royalHeal','revive','potion','mana','howlHeal'].includes(fx);
 const inputs=p.rows||[{id:p.targetId,damage:p.damage,value:p.value,outcome}];
 const targets=inputs.filter(t=>t.id).map(t=>{
  const type=t.type||targetType,r=(type==='enemy'?world.enemies:world.players)?.[t.id]||{},hp=Number(t.hpAfter??t.left??p.hpAfter??(type==='enemy'?r.currentHP:r.hp));
  return {id:key(type,t.id),outcome:t.outcome||outcome,damage:Number(t.damage)||0,value:Number(t.value??p.value??t.damage)||0,
   ...(Number.isFinite(hp)?{hpAfter:hp,killed:hp<=0&&!healing&&(Number(t.damage??p.damage)||0)>0}:{}),maxHP:Number(r.maxHP)||0};
 });
 if(!targets.length)return null;
 return {version:1,actor,actorType,fx,outcome,damage:Number(p.damage)||0,healing,targets,
  melee:['strike','sweep','claw'].includes(fx)&&(actorType==='enemy'?!record.isRanged&&record.role!=='back':who.cls==='warrior'||who.cls==='priest'&&role==='front'),
  actorRecord:who,actorRole:role||'back'};
}
g.CombatPresentation={describe,key};
})(window);
