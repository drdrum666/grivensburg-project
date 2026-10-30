/* Standalone card fracture renderer. Coordinates are relative to a 300 × 450 card. */
(() => {
  const W=300,H=450, clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const ease=v=>{v=clamp(v);return v*v*(3-2*v)};
  const mix=(a,b,t)=>a+(b-a)*t;
  function rng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
  function path(c,pts,closed=false){c.beginPath();pts.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));if(closed)c.closePath()}
  const ROWS=[[460,569,24],[461,568,27],[461,569,30],[461,569,33],[462,567,36],[462,567,39],[463,566,42],[464,566,45],[464,565,48],[464,563,51],[465,562,54],[466,561,57],[467,560,60],[468,559,63],[469,559,66],[470,558,69],[470,557,72],[473,555,75],[473,554,78],[474,553,81],[476,550,84],[477,549,87],[479,549,90],[480,548,93],[481,548,96],[482,547,99],[484,547,102],[485,547,105],[486,548,108],[486,547,111],[487,546,114],[488,545,117],[488,545,120],[488,544,123],[488,543,126],[488,544,129],[488,545,132],[488,546,135],[488,548,138],[488,549,141],[488,550,144],[490,551,147],[490,552,150],[491,552,153],[492,551,156],[492,552,159],[492,552,162],[492,552,165],[492,551,168],[493,550,171],[494,550,174],[494,549,177],[495,548,180],[495,547,183],[495,548,186],[496,548,189],[496,546,192],[497,545,195],[497,546,198],[497,545,201],[497,544,204],[497,544,207],[498,544,210],[498,543,213],[498,543,216],[499,543,219],[500,543,222],[499,543,225],[499,543,228],[500,543,231],[500,543,234],[500,543,237],[500,544,240],[501,544,243],[501,543,246],[502,543,249],[502,544,252],[503,544,255],[504,544,258],[505,544,261],[505,544,264],[506,544,267],[506,544,270],[507,544,273],[507,544,276],[506,544,279],[508,544,282],[508,544,285],[508,544,288],[508,544,291],[508,544,294],[507,544,297],[508,544,300],[508,543,303],[508,543,306],[508,543,309],[508,543,312],[509,543,315],[510,543,318],[510,542,321],[511,542,324],[511,542,327],[510,542,330],[510,543,333],[510,543,336],[510,543,339],[509,542,342],[509,542,345],[510,542,348],[510,542,351],[510,542,354],[511,541,357],[511,541,360],[511,541,363],[511,540,366],[511,540,369],[511,539,372],[511,538,375],[511,537,378],[512,537,381],[512,537,384],[512,537,387],[513,538,390],[513,537,393],[514,537,396],[515,537,399],[514,537,402],[514,536,405],[514,535,408],[515,534,411],[514,534,414],[513,534,417],[513,533,420],[514,533,423],[513,533,426],[513,533,429],[513,534,432],[514,534,435],[514,535,438],[514,535,441],[514,536,444],[514,536,447],[514,536,450],[515,537,453],[515,537,456],[514,537,459],[514,537,462],[514,537,465],[514,537,468],[515,536,471],[514,535,474],[515,535,477],[515,535,480],[516,535,483],[516,535,486],[516,534,489],[517,535,492],[516,535,495],[516,535,498],[517,535,501],[518,535,504],[518,535,507],[517,535,510],[518,534,513],[518,533,516],[518,534,519],[519,533,522],[520,533,525],[520,532,528],[520,532,531],[521,532,534],[522,532,537],[522,532,540],[523,531,543],[523,531,546],[524,530,549],[524,529,552],[524,528,555],[524,528,558],[524,528,561],[524,528,564],[524,528,567],[525,528,570],[526,528,573],[526,528,576],[526,526,591]];
  function rowAt(f){const yy=24+567*clamp(f);let lo=0,hi=ROWS.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(ROWS[m][2]<=yy)lo=m;else hi=m}const a=ROWS[lo],b=ROWS[hi],t=(yy-a[2])/(b[2]-a[2]);return[mix(a[0],b[0],t),mix(a[1],b[1],t),yy]}
  function makeGeometry(kind,seed){
    const r=rng(seed);let line=[],keep,chip,hinge;
    // Version 03: exact diagonal from the user's red markup (123ни.jpg).
    const start=kind==='crack'?[W*.5,0]:[W*.52,0];
    const end=kind==='crack'?[W*.5,H*.55]:[W,H*.64];
    const dx=end[0]-start[0],dy=end[1]-start[1],len=Math.hypot(dx,dy),n=[-dy/len,dx/len];
    // The outline follows the old tear's fibres instead of random saw teeth.
    for(let i=0;i<=48;i++){const f=i/48,row=rowAt(f),offset=(row[0]-mix(460,526,f))*.22;line.push([mix(start[0],end[0],f)+n[0]*offset,mix(start[1],end[1],f)+n[1]*offset])}
    line[0]=start;line[line.length-1]=end;
    if(kind==='crack'){hinge=end;keep=[[0,0],...line,[hinge[0],H],[0,H]]}
    else {keep=[[0,0],...line,[W,H],[0,H]];chip=[...line,[W,0]]}
    const drips=Array.from({length:7},(_,i)=>({f:.08+i*.13+r()*.035,len:9+r()*25,delay:r()*.8,width:.65+r()*1.05,bend:(r()-.5)*5}));
    return{kind,seed,line,keep,chip,hinge,drips};
  }
  function pointOn(line,f){let k=clamp(f)*(line.length-1),i=Math.min(line.length-2,Math.floor(k)),t=k-i;return[mix(line[i][0],line[i+1][0],t),mix(line[i][1],line[i+1][1],t)]}
  function partial(line,f){let k=clamp(f)*(line.length-1),i=Math.floor(k);return [...line.slice(0,i+1),pointOn(line,f)]}
  function warp(g,p,amount){
    if(g.kind!=='crack'||p[1]>=g.hinge[1])return p;
    const [hx,hy]=g.hinge,fall=clamp((hy-p[1])/hy),a=.145*amount*fall,dx=p[0]-hx,dy=p[1]-hy;
    return[hx+dx*Math.cos(a)-dy*Math.sin(a),hy+dx*Math.sin(a)+dy*Math.cos(a)];
  }
  // An affine texture triangle gives the broken panel a flexible, connected hinge.
  function triangle(c,img,s,d){
    const [a,b,e]=s,[u,v,w]=d;
    const den=a[0]*(b[1]-e[1])+b[0]*(e[1]-a[1])+e[0]*(a[1]-b[1]);
    if(Math.abs(den)<.0001)return;
    const A=(u[0]*(b[1]-e[1])+v[0]*(e[1]-a[1])+w[0]*(a[1]-b[1]))/den;
    const C=(u[0]*(e[0]-b[0])+v[0]*(a[0]-e[0])+w[0]*(b[0]-a[0]))/den;
    const E=(u[0]*(b[0]*e[1]-e[0]*b[1])+v[0]*(e[0]*a[1]-a[0]*e[1])+w[0]*(a[0]*b[1]-b[0]*a[1]))/den;
    const B=(u[1]*(b[1]-e[1])+v[1]*(e[1]-a[1])+w[1]*(a[1]-b[1]))/den;
    const D=(u[1]*(e[0]-b[0])+v[1]*(a[0]-e[0])+w[1]*(b[0]-a[0]))/den;
    const F=(u[1]*(b[0]*e[1]-e[0]*b[1])+v[1]*(e[0]*a[1]-a[0]*e[1])+w[1]*(a[0]*b[1]-b[0]*a[1]))/den;
    const cx=(u[0]+v[0]+w[0])/3,cy=(u[1]+v[1]+w[1])/3;
    const clip=d.map(p=>[p[0]+Math.sign(p[0]-cx)*1.05,p[1]+Math.sign(p[1]-cy)*1.05]);
    c.save();path(c,clip,true);c.clip();c.transform(A,B,C,D,E,F);c.drawImage(img,0,0,W,H);c.restore();
  }
  function panel(c,texture,g,amount){
    c.save();path(c,g.keep,true);c.clip();c.drawImage(texture,0,0,W,H);c.restore();
    const line=[...g.line.filter((p,i)=>i%4===0),[g.hinge[0],H]];
    // Continuous textured underlay prevents Canvas2D triangle antialiasing
    // from exposing the scene through interior mesh seams.
    const boundary=[...g.line.map(p=>warp(g,p,amount)),[g.hinge[0],H],[W,H],...g.line.slice().reverse().map(p=>warp(g,[W,p[1]],amount))];
    c.save();path(c,boundary,true);c.clip();c.fillStyle='#392b20';c.fill();
    const top=g.line[0],right=[W,0],bottom=[W,g.hinge[1]];
    for(const tri of [[top,right,g.hinge],[right,bottom,g.hinge]])triangle(c,texture,tri,tri.map(p=>warp(g,p,amount)));
    const sourceY=g.hinge[1]/H*texture.height;
    c.drawImage(texture,0,sourceY,texture.width,texture.height-sourceY,0,g.hinge[1],W,H-g.hinge[1]);c.restore();
    for(let i=0;i<line.length-1;i++){
      const a=line[i],b=[W,a[1]],e=line[i+1],d=[W,e[1]];
      // Small mesh overlap suppresses anti-aliasing hairlines inside the artwork.
      const tri=(s)=>triangle(c,texture,s,s.map(p=>warp(g,p,amount)));
      tri([a,b,e]);tri([b,d,e]);
    }
  }
  function rim(c,art,g,amount,time,second=false,progress=1){
    c.save();
    // Copy only the two narrow textured lips from the APPROVED reference.
    // No red outline, generated zigzag, or background-filled fake opening.
    const count=Math.ceil(progress*190),sx=.34;
    for(let i=0;i<count;i++){
      const f0=i/190,f1=Math.min(progress,(i+1)/190),f=(f0+f1)/2;
      if(f1<=f0)continue;
      let a=pointOn(g.line,f0),z=pointOn(g.line,f1);
      if(second&&g.kind==='crack'){a=warp(g,a,amount);z=warp(g,z,amount)}
      const dx=z[0]-a[0],dy=z[1]-a[1],len=Math.hypot(dx,dy)||1,tx=dx/len,ty=dy/len;
      const row=rowAt(f),edge=row[second?1:0],sy=len/((f1-f0)*567),y=24+f0*567,dh=(f1-f0)*567+.35;
      const x=second?edge-.7:edge-23,sw=23.7;
      c.save();c.transform(ty*sx,-tx*sx,tx*sy,ty*sy,a[0]-ty*sx*edge-tx*sy*y,a[1]+tx*sx*edge-ty*sy*y);
      c.drawImage(art,x,y,sw,dh,x,y,sw,dh);c.restore();
    }
    for(const d of g.drips){
      if(d.f>progress)continue;
      const p=pointOn(g.line,d.f),start=second?warp(g,p,amount):p;
      const grow=ease((time-.2-d.delay)/1.45),len=d.len*grow;
      if(len<.1)continue;
      c.beginPath();c.moveTo(start[0],start[1]);c.bezierCurveTo(start[0]+d.bend,start[1]+len*.3,start[0]-2,start[1]+len*.75,start[0]+d.bend*.4,start[1]+len);
      c.strokeStyle=time<3?'#741118':'#4f1015';c.lineWidth=d.width;c.lineCap='round';c.stroke();
      c.strokeStyle='#b94739';c.lineWidth=d.width*.22;c.stroke();
    }
    c.restore();
  }
  class CardFracture{
    constructor(texture,art){this.texture=texture;this.art=art}
    draw(c,g,t,progress=1,releaseAge=t){
      if(!g){c.drawImage(this.texture,0,0,W,H);return}
      if(progress<1){c.drawImage(this.texture,0,0,W,H);rim(c,this.art,g,0,t,false,progress);rim(c,this.art,g,0,t,true,progress);return}
      if(g.kind==='crack'){
        const amount=ease(releaseAge/.6)*(1+Math.sin(releaseAge*12)*.065*Math.exp(-releaseAge*2));
        panel(c,this.texture,g,amount);rim(c,this.art,g,amount,t);rim(c,this.art,g,amount,t,true);
      }else{
        c.save();path(c,g.keep,true);c.clip();c.drawImage(this.texture,0,0,W,H);c.restore();rim(c,this.art,g,0,t);
        // This is the actual detached piece of the same card, not a painted replacement.
        if(releaseAge<1.5){
          const f=Math.max(0,releaseAge),center=pointOn(g.line,.55);
          c.save();c.globalAlpha=1-ease((f-.55)/.85);c.translate(center[0]+125*f,center[1]-115*f+145*f*f);c.rotate(f*1.3);c.translate(-center[0],-center[1]);
          c.save();path(c,g.chip,true);c.clip();c.drawImage(this.texture,0,0,W,H);c.restore();rim(c,this.art,g,0,t,true);c.restore();
        }
      }
    }
  }
  window.GrivensburgCardFractures={W,H,clamp,ease,mix,rng,makeGeometry,pointOn,partial,path,warp,CardFracture,
    qualifies:(critical,hpAfter,maxHP,damage=1)=>Boolean(critical&&damage>0&&hpAfter>0&&maxHP>0&&hpAfter*10<maxHP*3)};
})();

/* Canvas only replaces the enemy's artwork. Live names, HP and controls remain
   in the original DOM. Neither the saved state nor HP is changed here. */
(function(g){'use strict';
const F=g.GrivensburgCardFractures;
function createLayer(el,fracture,art){
 if(!el||!fracture||!art?.naturalWidth)return null;
 const portrait=el.querySelector('.enemy-bg-img,.gvfx-portrait');
 if(!portrait?.complete||!portrait.naturalWidth)return null;
 const texture=document.createElement('canvas');texture.width=600;texture.height=Math.round(600*(el.offsetHeight||450)/(el.offsetWidth||300));const tw=texture.width,th=texture.height;
 const x=texture.getContext('2d'),cs=getComputedStyle(el),border=cs.borderColor;
 x.save();x.beginPath();x.roundRect(0,0,tw,th,12);x.clip();
 x.fillStyle=cs.backgroundColor==='rgba(0, 0, 0, 0)'?'#1e1e20':cs.backgroundColor;x.fillRect(0,0,tw,th);
 const scale=Math.max(tw/portrait.naturalWidth,th/portrait.naturalHeight);
 x.drawImage(portrait,(tw-portrait.naturalWidth*scale)/2,(th-portrait.naturalHeight*scale)/2,portrait.naturalWidth*scale,portrait.naturalHeight*scale);
 x.restore();x.strokeStyle=border;x.lineWidth=3;x.beginPath();x.roundRect(1.5,1.5,tw-3,th-3,12);x.stroke();
 const renderer=new F.CardFracture(texture,art),geometry=F.makeGeometry(fracture.kind,fracture.seed);
 const canvas=document.createElement('canvas');canvas.className='gv-fracture-art';canvas.setAttribute('aria-hidden','true');
 Object.assign(canvas.style,{position:'absolute',left:'0',top:'0',width:'200%',height:'170%',pointerEvents:'none',zIndex:'0'});
 const styles={background:el.style.background,boxShadow:el.style.boxShadow,borderColor:el.style.borderColor,overflow:el.style.overflow,opacity:portrait.style.opacity};
 el.style.background='transparent';el.style.boxShadow='none';el.style.borderColor='transparent';el.style.overflow='visible';
 portrait.style.opacity='0';el.insertBefore(canvas,el.firstChild);el.dataset.fractured=fracture.kind;
 const c=canvas.getContext('2d');let cleared=false;
 function draw(age=8,progress=1){
  if(cleared)return;const w=el.offsetWidth,h=el.offsetHeight;if(!w||!h)return;
  const dpr=Math.min(2,g.devicePixelRatio||1),cw=Math.ceil(w*2*dpr),ch=Math.ceil(h*1.7*dpr);
  if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;}
  c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,canvas.width,canvas.height);
  canvas.style.filter=getComputedStyle(portrait).filter;c.scale(w*dpr/F.W,h*dpr/F.H);renderer.draw(c,geometry,Math.max(0,age),progress,Math.max(0,age));
 }
 function clear(){if(cleared)return;cleared=true;canvas.remove();delete el.dataset.fractured;
  Object.assign(el.style,{background:styles.background,boxShadow:styles.boxShadow,borderColor:styles.borderColor,overflow:styles.overflow});portrait.style.opacity=styles.opacity;}
 draw();return{draw,clear,canvas,geometry};
}
F.createLayer=createLayer;
})(window);

