/* One physical geometry for client and presentation. Raster resolution is not size. */
(function(g){
'use strict';
const finite=(n,d=0)=>Number.isFinite(+n)?+n:d;
function kindOf(key,item={},actor={}) {
 if(actor.type==='enemy'&&actor.isRanged&&!key)return 'bow';
 const text=[item.weaponKind,item.kind,key,item.name].filter(Boolean).join(' ').toLowerCase();
 if(/shield|щит/.test(text))return 'shield';
 if(/dagger|кинжал/.test(text))return 'dagger';
 if(/bow|лук/.test(text))return 'bow';
 if(/axe|топор|секир/.test(text))return 'axe';
 if(/staff|посох/.test(text))return 'staff';
 if(/wand|жезл|палоч/.test(text))return 'wand';
 if(/lute|лютн|instrument/.test(text))return 'instrument';
 if(/sword|меч/.test(text))return 'sword';
 return ({mage:'staff',priest:'wand',archer:'bow',rogue:'dagger',bard:'instrument'})[actor.cls]||'sword';
}
function expandedFit(f,p) {
 const e=Math.max(.01,finite(p.displayScale,1));
 const [gx,gy]=p.normalizationPivot||p.anchors?.grip||[.5,.5],a=finite(f.rot)*Math.PI/180;
 const dx=(gx-.5)*f.w*3*(1-e),dy=(gy-.5)*f.h*5*(1-e);
 return {...f,x:f.x+(dx*Math.cos(a)-dy*Math.sin(a))/3,y:f.y+(dx*Math.sin(a)+dy*Math.cos(a))/5,w:f.w*e,h:f.h*e};
}
function profileFor(key,items=g.masterItemsDB||{}){
 return g.itemAssetProfiles?.[key]||items[key]?.assetProfile||Object.values(g.itemAssetProfiles||{}).reverse().find(p=>p.sourceItemKey===key);
}
function resolve(actor={},slot='mainhand',personal=false,items=g.masterItemsDB||{}) {
 const reg=g.stockReferenceRegistry;if(!reg)return null;
 const key=actor.slots?.[slot]||actor[slot]||'',item=items[key]||{};
 if(slot==='offhand'&&!key)return null;
 const own=profileFor(key,items);
 if(slot==='offhand'&&!own&&!/shield|щит|dagger|кинжал|sword|меч|axe|топор|секир/.test([key,item.name,item.weaponKind,item.kind].join(' ').toLowerCase()))return null;
 const kind=own?.kind||kindOf(key,item,actor),two=!!(item.isTwoHanded||own?.twoHanded||['bow','staff','instrument'].includes(kind));
 let template=own?.template||reg.itemTemplateOverrides?.[key]||reg.typeTemplates[kind+'_'+(two?'two':'one')];
 if(kind==='dagger')template=slot==='offhand'?'dagger_rusty_left':'dagger_stock';
 if(!reg.profiles[template])template=reg.typeTemplates[kind+'_'+(two?'two':'one')]||'sword_short';
 const base=reg.profiles[template];
 const fitKey='stock_'+template+'_'+slot;
 const stockFit=reg.fits[fitKey]||reg.fits['stock_'+template+'_mainhand']||Object.entries(reg.fits).find(([k])=>k.startsWith('stock_'+template+'_'))?.[1];
 if(!stockFit)return null;
 const fit=stockFit.fit||stockFit;
 const prepared=personal && actor.type!=='enemy' && own && (own.image||own.path||item.icon);
 const authored=prepared && typeof g.itemFit==='function'?(g.itemFit(actor.race,actor.cls,actor.gender,own.key||key,actor.portrait||1)||g.itemFit(actor.race,actor.cls,actor.gender,key,actor.portrait||1)):null;
 const profile=prepared?{...base,...own,anchors:{...base.anchors,...own.anchors}}:base;
 return {key:prepared?'personal_'+key:template,itemKey:key,template,kind,two,slot,profile,
  fit:authored?{...authored}:prepared?expandedFit(fit,profile):{...fit},personal:!!prepared,
  image:prepared?(own.image||own.path||item.icon):base.image};
}
function pose(weapon,r) {
 const f=weapon.fit,p=weapon.profile,angle=finite(f.rot)*Math.PI/180;
 // Fit the canonical 300×500 portrait plane uniformly; never stretch its axes.
 const scale=Math.min(r.w/300,r.h/500),ox=r.x+(r.w-300*scale)/2,oy=r.y+(r.h-500*scale)/2;
 const width=f.w*3*scale,height=f.h*5*scale,cx=ox+f.x*3*scale,cy=oy+f.y*5*scale;
 const point=uv=>{const x=(uv[0]-.5)*width,y=(uv[1]-.5)*height;return{x:cx+x*Math.cos(angle)-y*Math.sin(angle),y:cy+x*Math.sin(angle)+y*Math.cos(angle)}};
 return {cx,cy,width,height,angle,grip:point(p.anchors?.grip||[.5,.9]),tip:point(p.anchors?.tip||[.5,0]),point};
}
g.EquipmentGeometry={resolve,pose,kindOf,expandedFit,profileFor};
})(window);
