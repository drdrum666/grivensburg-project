/* Fit only the three card rows. All lengths are measured afresh at scale 1. */
(function(w){
 'use strict';
 function layout({root,area,size=80,heroSize=100,enemySize=100,queueSize=100,mobile=false}){
  if(!root||!area)return null;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number(v)||0));
  const common=.40+.60*clamp(size,0,100)/100;
  const fraction=clamp(size,0,100)/100, gap=22*(1-fraction);
  const specs=[['party-layer','.player-wrapper',heroSize],['queue-layer','.queue-card',queueSize],['enemies-layer','.enemy-card',enemySize]];
  const rows=[];
  for(const[id,selector,category]of specs){
   const row=document.getElementById(id),body=row?.querySelector('.stream-row-body');if(!row||!body)continue;
   const nodes=[...body.querySelectorAll(':scope > '+selector)];
   row.style.display=row.classList.contains('hidden')||!nodes.length?'none':'block';if(row.style.display==='none')continue;
   body.style.gap=gap+'px';body.style.transform='none';body.style.width='max-content';body.style.display='flex';body.style.gridTemplateColumns='';body.style.gridAutoRows='';
   const reserve=0;body.style.paddingLeft=reserve+'px';
   const widths=nodes.map(n=>n.offsetWidth),heights=nodes.map(n=>n.offsetHeight);
   const h=Math.max(...heights)+8*(1-fraction),full=reserve+widths.reduce((a,n)=>a+n,0)+Math.max(0,nodes.length-1)*gap;
   rows.push({id,row,body,nodes,widths,h,full,reserve,requested:common*clamp(category,60,140)/100});
  }
  const width=area.clientWidth,height=area.clientHeight;if(!width||!height||!rows.length)return null;
  function wrapFor(r,scale){
   const cell=Math.max(...r.widths),available=Math.max(1,width/Math.max(.01,scale)-r.reserve);
   const columns=Math.max(1,Math.min(r.nodes.length,Math.floor((available+gap)/(cell+gap))));
   return{columns,lines:Math.ceil(r.nodes.length/columns),cell};
  }
  let fit=1;
  if(mobile){
   const fitW=Math.min(1/(1-.82*fraction),...rows.map(r=>width/((r.reserve+Math.max(...r.widths))*r.requested)));
   let low=0,high=fitW;
   // При уменьшении масштаба в строке помещается больше карточек, поэтому
   // бинарным поиском берём самый крупный размер, который не переполняет высоту.
   for(let i=0;i<36;i++){
    const mid=(low+high)/2;
    const total=rows.reduce((sum,r)=>{const scale=r.requested*mid,f=wrapFor(r,scale);return sum+(r.h*f.lines+Math.max(0,f.lines-1)*gap)*scale;},0);
    if(total<=height)low=mid;else high=mid;
   }
   fit=low;
  }else{
   const fitW=Math.min(...rows.map(r=>width/(r.full*r.requested)));
   const fitH=height/rows.reduce((sum,r)=>sum+r.h*r.requested,0);
   fit=Math.min(1/(1-.82*fraction),fitW,fitH);
  }
  const scales={};
  for(const r of rows){
   const scale=r.requested*fit;scales[r.id]=scale;
   if(mobile){
    const f=wrapFor(r,scale);r.body.style.display='grid';r.body.style.gridTemplateColumns=`repeat(${f.columns},${f.cell}px)`;r.body.style.gridAutoRows=r.h+'px';
    r.h=r.h*f.lines+Math.max(0,f.lines-1)*gap;r.full=r.reserve+f.columns*f.cell+Math.max(0,f.columns-1)*gap;r.row.dataset.cardRows=String(f.lines);
   }else{r.body.style.gridAutoRows='';r.row.dataset.cardRows='1';}
   r.scale=scale;
  }
  const totalHeight=rows.reduce((sum,r)=>sum+r.h*r.scale,0),free=Math.max(0,height-totalHeight);
  let y=rows.length===1?free/2:0;
  for(const r of rows){
   const old=r.row.scrollLeft,visualHeight=r.h*r.scale,visualWidth=r.full*r.scale;
   r.row.style.top=y+'px';r.row.style.height=visualHeight+'px';r.body.style.transform=`scale(${r.scale})`;
   r.body.style.width=r.full+'px';r.body.style.height=r.h+'px';r.body.style.left=mobile?Math.max(0,(width-visualWidth)/2)+'px':'0px';
   let spacer=r.row.querySelector('.stream-row-space');if(!spacer){spacer=document.createElement('div');spacer.className='stream-row-space';r.row.prepend(spacer)}
   spacer.style.width=Math.max(width,visualWidth)+'px';spacer.style.height=visualHeight+'px';r.row.scrollLeft=old;
   y+=visualHeight+(rows.length>1?free/(rows.length-1):0);
  }
  return{scale:fit,scales,width,height,rows:rows.length};
 }
 w.GrivensburgStreamLayout={layout};
})(window);
