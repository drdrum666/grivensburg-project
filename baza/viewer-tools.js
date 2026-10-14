/* Local viewing controls. Nothing here writes game state or broadcasts journal visibility. */
(function(w){
'use strict';
const style=document.createElement('style');style.textContent=`
.gb-preview-shell{background:transparent!important;backdrop-filter:none!important;box-shadow:none!important;border-color:transparent!important}
.gb-preview-shell>:not(.gb-preview-path){visibility:hidden!important}
.gb-preview-path{visibility:visible!important}.gb-preview-path input[type=range],input.gb-preview-path{filter:drop-shadow(0 1px 3px #000);opacity:1!important}
#combatLog.gb-local-journal{position:fixed!important;right:auto!important;top:0;left:0;transform:none!important;z-index:8400;max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);min-height:0;box-sizing:border-box;pointer-events:auto;background:#17130ee8;border:1px solid #af925e99;border-radius:8px;box-shadow:0 6px 25px #0008}
#combatLog.gb-local-journal.hidden{pointer-events:none;visibility:hidden}
#combatLog.gb-local-journal .log-header{cursor:grab;touch-action:none;user-select:none;font:700 12px/1.2 Georgia,serif;padding:7px 9px;gap:7px;background:#30261ee8}
.gb-local-journal .log-header button{font:17px/1 Arial;min-width:30px;min-height:28px;padding:0;border:1px solid #a5895a88;background:transparent;color:#ead4a5;cursor:pointer}
#combatLog.gb-local-journal .log-content{min-height:0;overflow:auto;overscroll-behavior:contain;touch-action:pan-y;pointer-events:auto;font-size:12px;line-height:1.35;padding:8px;scrollbar-width:thin;scrollbar-color:#a5895a66 transparent}
#combatLog.gb-collapsed{height:auto!important}#combatLog.gb-collapsed .log-content{display:none}
`;document.head.appendChild(style);
let preview=[];
function endPreview(){for(const el of preview){el.classList.remove('gb-preview-shell','gb-preview-path')}preview=[];}
document.addEventListener('pointerdown',e=>{
 const input=e.target.closest?.('input[type=range][data-preview]');if(!input)return;
 endPreview();input.classList.add('gb-preview-path');preview.push(input);
 const stop=input.closest('.modal-overlay') || input.closest('details') || input.closest('.modal') || input.parentElement;
 for(let n=input.parentElement;n&&n!==document.body;n=n.parentElement){n.classList.add('gb-preview-shell','gb-preview-path');preview.push(n);if(n===stop)break;}
},true);
for(const event of ['pointerup','pointercancel','blur'])w.addEventListener(event,endPreview);
document.addEventListener('visibilitychange',()=>{if(document.hidden)endPreview()});
function journal({box,room=()=>'',size=()=>50,onToggle=()=>{}}){
 if(!box)return null;
 // Move outside scaled canvases: touch coordinates, fixed placement and bounds share pixels.
 document.body.appendChild(box);box.classList.add('gb-local-journal');
 const header=box.querySelector('.log-header');header.querySelectorAll('[onclick]').forEach(el=>el.remove());
 const button=document.createElement('button');button.type='button';header.append(button);
 let state={x:1,y:.5,collapsed:false},currentRoom=null,drag=null;
 const key=()=> 'gb-journal-v1-'+room();
 function save(){try{localStorage.setItem(key(),JSON.stringify(state))}catch{}}
 function load(){if(currentRoom===room())return;currentRoom=room();try{state={x:1,y:.5,collapsed:false,...JSON.parse(localStorage.getItem(key())||'null')}}catch{state={x:1,y:.5,collapsed:false}}}
 function fit(){
  load();const width=w.innerWidth,height=w.innerHeight,p=Math.max(0,Math.min(100,Number(size())||0));
  const side=Math.max(120,Math.min(width-16,height-16,Math.min(width*.34,height*.58)*(0.65+p/100)));
  box.style.width=side+'px';box.style.height=side+'px';box.classList.toggle('gb-collapsed',!!state.collapsed);
  button.textContent=state.collapsed?'▣':'−';button.title=state.collapsed?'Развернуть журнал':'Свернуть журнал';button.setAttribute('aria-label',button.title);
  const h=state.collapsed?header.offsetHeight:side;
  box.style.left=(8+Math.max(0,width-side-16)*Math.max(0,Math.min(1,Number(state.x)||0)))+'px';
  box.style.top=(8+Math.max(0,height-h-16)*Math.max(0,Math.min(1,Number(state.y)||0)))+'px';
 }
 function toggle(){load();state.collapsed=!state.collapsed;save();fit();onToggle(state.collapsed);}
 button.onclick=toggle;
 header.addEventListener('pointerdown',e=>{if(e.target.closest('button')||e.button>0)return;const r=box.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top};header.setPointerCapture(e.pointerId);e.preventDefault();});
 header.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const r=box.getBoundingClientRect(),x=drag.left+e.clientX-drag.x,y=drag.top+e.clientY-drag.y;state.x=Math.max(0,Math.min(1,(x-8)/Math.max(1,w.innerWidth-r.width-16)));state.y=Math.max(0,Math.min(1,(y-8)/Math.max(1,w.innerHeight-r.height-16)));fit();});
 function end(e){if(drag?.id===e.pointerId){drag=null;save();}}
 header.addEventListener('pointerup',end);header.addEventListener('pointercancel',end);w.addEventListener('resize',fit);fit();
 return{fit,toggle,get collapsed(){return !!state.collapsed}};
}
w.GrivensburgViewerTools={journal,endPreview};
})(window);
