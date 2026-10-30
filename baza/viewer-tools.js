/* Local viewing controls. No game state or broadcast visibility is changed here. */
(function(w){
'use strict';
const style=document.createElement('style');style.textContent=`
input[type=range][data-preview]{touch-action:none;cursor:ew-resize}
.gb-preview-path input[type=range],input.gb-preview-path{filter:drop-shadow(0 1px 3px #000)}
#combatLog.gb-local-journal{position:fixed!important;right:auto!important;bottom:auto!important;transform:none!important;z-index:8600;max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);min-height:0;box-sizing:border-box;pointer-events:auto;background:#17130ee8;border:1px solid #af925e99;border-radius:8px;box-shadow:0 6px 25px #0008;resize:none;display:flex;flex-direction:column}
#combatLog.gb-local-journal.hidden:not(.gb-journal-preview),#combatLog.gb-local-journal[data-journal-owner=gm]:not(.open):not(.gb-journal-preview){pointer-events:none!important;visibility:hidden!important}
body:has(.modal-overlay:not(#streamerModal):not(.gb-preview-shell):not(.gb-preview-suppressed):not([hidden])[style*="display: flex"]) #combatLog.gb-local-journal[data-journal-owner=gm]:not(.gb-journal-preview){visibility:hidden!important;pointer-events:none!important}
#combatLog.gb-local-journal.gb-journal-preview{visibility:visible!important;opacity:1!important;pointer-events:none!important}
#combatLog.gb-local-journal .log-header{cursor:grab;touch-action:none;user-select:none;font:700 12px/1.2 Georgia,serif;padding:6px 8px;gap:7px;background:#30261ee8;display:flex;align-items:center;justify-content:space-between;flex:none}
#combatLog.gb-local-journal .log-header>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#combatLog.gb-local-journal .log-header:active{cursor:grabbing}
.gb-local-journal .log-header button{font:17px/1 Arial;min-width:30px;min-height:28px;padding:0;border:1px solid #a5895a88;border-radius:3px;background:transparent;color:#ead4a5;cursor:pointer;touch-action:manipulation}
#combatLog.gb-local-journal .log-content{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;touch-action:pan-y;pointer-events:auto;font-size:12px;line-height:1.35;padding:8px;scrollbar-width:thin;scrollbar-color:#a5895a66 transparent}
#combatLog .gb-journal-resize{position:absolute;right:1px;bottom:1px;width:24px;height:24px;min-width:24px;min-height:24px;padding:0;border:0;border-radius:0 0 5px 0;background:linear-gradient(135deg,transparent 48%,#8d7449 49%,#8d7449 55%,transparent 56%,transparent 67%,#8d7449 68%,#8d7449 74%,transparent 75%);cursor:nwse-resize;touch-action:none;z-index:2}
#combatLog.gb-collapsed .gb-journal-resize{display:none}
#combatLog.gb-collapsed{height:auto!important}#combatLog.gb-collapsed .log-content{display:none}

#combatLog.gb-local-journal .log-content,#combatLog.gb-local-journal .log-entry{font:400 12px/1.4 Georgia,serif!important;letter-spacing:normal!important;text-shadow:none!important;color:#dfd1b4}
#combatLog.gb-local-journal .log-entry{padding:4px 0;border-bottom:1px solid #ad925926}
#combatLog.gb-local-journal .log-entry b{font-weight:600}
`;document.head.appendChild(style);
let preview=null;
function endPreview(){
 if(!preview)return;const previous=preview;preview=null;
 for(const [el,props] of previous.styles){for(const [key,value,priority] of props)value?el.style.setProperty(key,value,priority):el.style.removeProperty(key);el.classList.remove('gb-preview-shell','gb-preview-path','gb-preview-suppressed');}
 document.documentElement.removeAttribute('data-gb-preview');
 document.dispatchEvent(new CustomEvent('gb-preview-end',{detail:{input:previous.input}}));
}
function beginPreview(input){
 if(preview?.input===input)return;endPreview();preview={input,styles:new Map()};
 function write(el,values){let saved=preview.styles.get(el);if(!saved){saved=[];preview.styles.set(el,saved)}for(const[key,value]of Object.entries(values)){saved.push([key,el.style.getPropertyValue(key),el.style.getPropertyPriority(key)]);el.style.setProperty(key,value,'important');}}
 const stop=input.closest('.modal-overlay') || input.closest('details') || input.closest('.modal') || input.parentElement;
 for(const other of document.querySelectorAll('.modal-overlay'))if(other!==stop&&!other.contains(input)&&getComputedStyle(other).display!=='none'){write(other,{visibility:'hidden','pointer-events':'none'});other.classList.add('gb-preview-suppressed');}
 let path=input;write(input,{visibility:'visible',opacity:'1'});input.classList.add('gb-preview-path');
 for(let n=input.parentElement;n&&n!==document.body;n=n.parentElement){
  n.classList.add('gb-preview-shell','gb-preview-path');
  write(n,{background:'transparent','backdrop-filter':'none','-webkit-backdrop-filter':'none','box-shadow':'none','border-color':'transparent',visibility:'visible'});
  for(const child of n.children)if(child!==path)write(child,{visibility:'hidden','pointer-events':'none'});
  if(n===stop)break;path=n;
 }
 document.documentElement.dataset.gbPreview='true';
 document.dispatchEvent(new CustomEvent('gb-preview-start',{detail:{input}}));
}
document.addEventListener('pointerdown',e=>{const input=e.target.closest?.('input[type=range][data-preview]');if(input)beginPreview(input);},true);
document.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key)&&e.target.matches?.('input[type=range][data-preview]'))beginPreview(e.target);});
document.addEventListener('keyup',e=>{if(preview?.input===e.target)endPreview()});
for(const event of ['pointerup','pointercancel','blur'])w.addEventListener(event,endPreview);
document.addEventListener('visibilitychange',()=>{if(document.hidden)endPreview()});
function journal({box,room=()=>'',size=()=>50,owner='stream',scope='local',onChange=()=>{},onToggle=()=>{},onSize=()=>{}}){
 if(!box)return null;
 document.body.appendChild(box);box.classList.add('gb-local-journal');box.dataset.journalOwner=owner;
 const header=box.querySelector('.log-header');header.replaceChildren();
 const label=document.createElement('span');label.textContent=owner==='gm'?'МОЙ ЖУРНАЛ':'ЖУРНАЛ СТРИМА';header.append(label);
 const button=document.createElement('button');button.type='button';header.append(button);
 const grip=document.createElement('button');grip.type='button';grip.className='gb-journal-resize';grip.title='Изменить размер журнала';grip.setAttribute('aria-label',grip.title);box.append(grip);
 const defaults=()=>({x:owner==='gm'?0:1,y:owner==='gm'?.15:.35,collapsed:false});
 let state=defaults(),currentRoom=null,drag=null,previewing=false,resizing=null;
 const key=()=> 'gb-journal-v3-'+owner+'-'+scope+'-'+room();
 function save(){try{localStorage.setItem(key(),JSON.stringify(state))}catch{}onChange({...state});}
 function load(){if(currentRoom===room())return;currentRoom=room();try{state={...defaults(),...JSON.parse(localStorage.getItem(key())||'null')}}catch{state=defaults()}}
 function fit(){
  load();const width=w.innerWidth,height=w.innerHeight,p=Math.max(0,Math.min(100,Number(size())||0));
  const side=Math.max(140,Math.min(width-16,height-16,Math.min(width*.38,height*.4)*(.5+p/100)));
  const collapsed=state.collapsed&&!previewing;box.style.setProperty('width',side+'px','important');box.style.setProperty('height',collapsed?'auto':side+'px','important');box.classList.toggle('gb-collapsed',collapsed);
  button.textContent=state.collapsed?'▣':'−';button.title=state.collapsed?'Развернуть журнал':'Свернуть журнал';button.setAttribute('aria-label',button.title);button.setAttribute('aria-expanded',String(!state.collapsed));
  const h=collapsed?(header.offsetHeight||42):side;
  box.style.setProperty('left',(8+Math.max(0,width-side-16)*Math.max(0,Math.min(1,Number(state.x)||0)))+'px','important');
  box.style.setProperty('top',(8+Math.max(0,height-h-16)*Math.max(0,Math.min(1,Number(state.y)||0)))+'px','important');
 }
 function setCollapsed(value){load();state.collapsed=!!value;save();fit();onToggle(state.collapsed);}
 function toggle(){load();setCollapsed(!state.collapsed)}
 button.onclick=toggle;
 header.addEventListener('pointerdown',e=>{if(e.target.closest('button')||e.button>0)return;const r=box.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top};header.setPointerCapture(e.pointerId);e.preventDefault();});
 header.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const r=box.getBoundingClientRect(),x=drag.left+e.clientX-drag.x,y=drag.top+e.clientY-drag.y;state.x=Math.max(0,Math.min(1,(x-8)/Math.max(1,w.innerWidth-r.width-16)));state.y=Math.max(0,Math.min(1,(y-8)/Math.max(1,w.innerHeight-r.height-16)));fit();});
 function end(e){if(drag?.id===e.pointerId){drag=null;save();}}
 header.addEventListener('pointerup',end);header.addEventListener('pointercancel',end);header.addEventListener('lostpointercapture',end);
 grip.addEventListener('pointerdown',e=>{if(e.button>0)return;const r=box.getBoundingClientRect();resizing={id:e.pointerId,x:e.clientX,y:e.clientY,side:r.width,left:r.left,top:r.top};grip.setPointerCapture(e.pointerId);e.preventDefault();e.stopPropagation()});
 grip.addEventListener('pointermove',e=>{
  if(!resizing||e.pointerId!==resizing.id)return;
  const base=Math.min(w.innerWidth*.38,w.innerHeight*.4),delta=((e.clientX-resizing.x)+(e.clientY-resizing.y))/2;
  const value=Math.max(0,Math.min(100,Math.round(((resizing.side+delta)/base-.5)*100))),side=Math.max(140,Math.min(w.innerWidth-16,w.innerHeight-16,base*(.5+value/100)));
  state.x=Math.max(0,Math.min(1,(resizing.left-8)/Math.max(1,w.innerWidth-side-16)));state.y=Math.max(0,Math.min(1,(resizing.top-8)/Math.max(1,w.innerHeight-side-16)));onSize(value);fit();
 });
 function endSize(e){if(resizing?.id===e.pointerId){resizing=null;save()}}
 grip.addEventListener('pointerup',endSize);grip.addEventListener('pointercancel',endSize);grip.addEventListener('lostpointercapture',endSize);
 grip.addEventListener('keydown',e=>{const d={ArrowLeft:-3,ArrowUp:-3,ArrowRight:3,ArrowDown:3}[e.key];if(d){e.preventDefault();onSize(Math.max(0,Math.min(100,Number(size())+d)));fit();save()}});
 w.addEventListener('resize',fit);fit();
 return{fit,toggle,setCollapsed,applyState(value){if(!value)return;load();state={...state,...value};fit()},preview(on){previewing=!!on;box.classList.toggle('gb-journal-preview',previewing);fit()},get collapsed(){return !!state.collapsed}};
}
w.GrivensburgViewerTools={journal,beginPreview,endPreview};
})(window);
