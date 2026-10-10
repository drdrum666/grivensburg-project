/* Fit only the three card rows. All lengths are measured afresh at scale 1. */
(function(w){
 'use strict';
 function layout({root,area,size=80,mobile=false}){
  if(!root||!area)return null;
  const gap=18*(1-Math.max(0,Math.min(100,size))/100);
  const specs=[['party-layer','.player-wrapper'],['queue-layer','.queue-card'],['enemies-layer','.enemy-card']];
  const rows=[];
  for(const[id,selector]of specs){
   const row=document.getElementById(id),body=row?.querySelector('.stream-row-body');if(!row||!body)continue;
   const nodes=[...body.querySelectorAll(':scope > '+selector)];
   row.style.display=row.classList.contains('hidden')||!nodes.length?'none':'block';if(row.style.display==='none')continue;
   body.style.gap=gap+'px';body.style.transform='none';body.style.width='max-content';
   const reserve=id==='party-layer'?24:0;
   body.style.paddingLeft=reserve+'px';
   const h=Math.max(...nodes.map(n=>n.offsetHeight))+8;
   const full=reserve+nodes.reduce((a,n)=>a+n.offsetWidth,0)+Math.max(0,nodes.length-1)*gap;
   // Portrait screens expose a scrollable row rather than shrinking seven heroes to stamps.
   const visible=mobile?nodes.slice(0,id==='queue-layer'?6:2):nodes;
   const width=reserve+visible.reduce((a,n)=>a+n.offsetWidth,0)+Math.max(0,visible.length-1)*gap;
   rows.push({row,body,nodes,h,full,width,reserve});
  }
  const width=area.clientWidth,height=area.clientHeight;
  if(!width||!height||!rows.length)return null;
  const maxScale=Math.min(width/Math.max(...rows.map(r=>r.width)),height/rows.reduce((a,r)=>a+r.h,0));
  const scale=maxScale*(.40+.60*Math.max(0,Math.min(100,size))/100);
  const free=Math.max(0,height-rows.reduce((a,r)=>a+r.h*scale,0));
  let y=rows.length===1?free/2:0;
  for(const r of rows){
   const old=r.row.scrollLeft;r.row.style.top=y+'px';r.row.style.height=r.h*scale+'px';
   r.body.style.transform=`scale(${scale})`;r.body.style.width=r.full+'px';r.body.style.height=r.h+'px';
   let spacer=r.row.querySelector('.stream-row-space');if(!spacer){spacer=document.createElement('div');spacer.className='stream-row-space';r.row.prepend(spacer)}
   spacer.style.width=Math.max(width,r.full*scale)+'px';spacer.style.height=r.h*scale+'px';
   r.row.scrollLeft=old;y+=r.h*scale+(rows.length>1?free/(rows.length-1):0);
  }
  return{scale,maxScale,width,height,rows:rows.length};
 }
 w.GrivensburgStreamLayout={layout};
})(window);
