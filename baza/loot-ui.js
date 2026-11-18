/* Одна читаемая карточка добычи для мастера и всех зрителей.
   Просмотр локальный: не выдаёт вещь и не меняет состояние комнаты. */
(function(g){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const classes={warrior:'воин',mage:'маг',priest:'жрец',archer:'лучник / разбойник',bard:'бард',all:'все классы'};
const slots={ring:'Кольцо',amulet:'Амулет',gloves:'Перчатки',feet:'Обувь',belt:'Пояс',mainhand:'Правая рука',offhand:'Левая рука',head:'Голова',chest:'Тело',magic:'Заклинание',relic:'Реликвия'};
function bonuses(it){
 const bits=[],stats=it.stats||{},sign=n=>n>0?'+'+n:String(n);
 for(const[k,label]of [['str','Сила'],['agi','Ловкость'],['int','Интеллект'],['cha','Харизма'],['init','Инициатива']])if(Number(stats[k]))bits.push(label+' '+sign(Number(stats[k])));
 if(Number(stats.critChance))bits.push('Порог крита '+sign(-Number(stats.critChance)));
 if(Number(stats.critPower))bits.push('Множитель крита '+sign(Number(stats.critPower)));
 if(Number(it.atk))bits.push('К броску атаки '+sign(Number(it.atk)));
 if(Number(it.def))bits.push('К броску защиты '+sign(Number(it.def)));
 if(Number(it.luck))bits.push('Удача '+sign(Number(it.luck)));
 return bits.join(' · ')||it.desc||'Без бонусов';
}
function art(it){return it.icon?'<img class="gb-loot-art" src="'+esc(it.icon)+'" alt="">':'';}
function content(it){return art(it)+'<strong class="gb-loot-name">'+esc(it.name||'Предмет')+'</strong><span class="gb-loot-bonuses">'+esc(bonuses(it))+'</span>';}
let modal=null,previousFocus=null;
function close(){if(modal){g.closeLootItemOnStream?.();modal.remove();modal=null;try{previousFocus?.focus({preventScroll:true});}catch{}}}
function detail(it,index){
 close();previousFocus=document.activeElement;modal=document.createElement('div');modal.className='gb-loot-detail';
 const c=it.classes||[],usable=g.CombatRules?.canEquip?Object.keys(classes).filter(k=>k!=='all'&&g.CombatRules.canEquip(it,k)):c;
 modal.innerHTML='<section class="gb-loot-detail-panel" role="dialog" aria-modal="true" aria-label="Описание предмета"><button class="gb-loot-close" aria-label="Закрыть описание">×</button>'+content(it)+'<p class="gb-loot-desc">'+esc(it.desc||'')+'</p><p class="gb-loot-meta">'+esc(slots[it.slot]||'Предмет')+(it.isTwoHanded?' · Двуручное':'')+'</p><p class="gb-loot-meta">'+esc((c.includes('all')?['all']:usable).map(x=>classes[x]||x).join(', '))+'</p><p class="gb-loot-meta">Базовая цена: '+esc(it.cost??0)+' монет</p><button class="gb-loot-ok">Понятно</button></section>';
 modal.addEventListener('click',e=>{if(e.target===modal||e.target.closest('.gb-loot-close,.gb-loot-ok'))close();});
 document.body.appendChild(modal);modal.querySelector('button').focus({preventScroll:true});
 if(typeof g.showLootItemOnStream==='function')g.showLootItemOnStream(it,index);
}
function card(it,owner,index){
 const button=document.createElement('button');button.type='button';button.className='gb-loot-card';button.setAttribute('aria-label','Описание: '+(it.name||'предмет'));
 button.innerHTML=content(it)+(owner?'<span class="gb-loot-owner">'+esc(owner)+'</span>':'')+'<span class="gb-loot-hint">Нажмите, чтобы узнать подробнее</span>';
 button.onclick=()=>detail(it,index);return button;
}
document.addEventListener('keydown',e=>{if(!modal)return;if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const buttons=[...modal.querySelectorAll('button')],first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
const style=document.createElement('style');style.textContent=`
.gb-loot-card{display:flex;flex-direction:column;align-items:center;gap:9px;box-sizing:border-box;width:100%;border:1px solid #a0885866;border-radius:12px;background:linear-gradient(145deg,#28271edd,#141a1de8);color:#efe7d5;padding:18px;cursor:pointer;font:inherit;text-align:center;box-shadow:0 12px 30px #0005;pointer-events:auto}
.gb-loot-card:hover,.gb-loot-card:focus-visible{border-color:#d0b073;outline:2px solid #d0b07344;outline-offset:2px}
.gb-loot-art{width:100px;height:100px;object-fit:contain;filter:drop-shadow(0 5px 8px #0006)}
.gb-loot-name{display:block;font-size:1.2em;color:#ecd5a5;line-height:1.3}
.gb-loot-bonuses{display:block;line-height:1.5;color:#c9dfc3;font-size:.96em}
.gb-loot-owner{color:#ddd4c4}.gb-loot-hint{font-size:.76em;color:#b5afa2}
.gb-loot-detail{position:fixed;inset:0;z-index:30000;background:#080e13ba;backdrop-filter:blur(7px);display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;font:16px/1.5 Arial,sans-serif;color:#efe7d5;pointer-events:auto}
.gb-loot-detail-panel{position:relative;width:min(440px,100%);max-height:calc(100dvh - 24px);box-sizing:border-box;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#a0885866 transparent;background:linear-gradient(145deg,#2c2c25f7,#141c23fa);border:1px solid #a0885888;border-radius:14px;padding:28px 22px 20px;text-align:center;box-shadow:0 20px 65px #0008}
.gb-loot-detail-panel .gb-loot-art{width:120px;height:120px;max-height:25dvh}.gb-loot-detail-panel .gb-loot-name{margin:10px 0}
.gb-loot-meta{font-size:13px;color:#bfb9ac;margin:8px 0}.gb-loot-desc{color:#e4dbc7;margin:14px 0}.gb-loot-close,.gb-loot-ok{border:1px solid #a0885866;background:#ffffff08;color:#e7d5ad;border-radius:7px;cursor:pointer;min-height:40px;font:inherit}
.gb-loot-close{position:absolute;right:8px;top:8px;width:40px;font-size:25px}.gb-loot-ok{margin-top:12px;padding:6px 28px}
`;document.head.appendChild(style);
g.GrivensburgLootUI={card,detail,close,bonuses};
})(window);
