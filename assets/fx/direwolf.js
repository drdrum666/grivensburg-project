/* Grivensburg – Direwolf v21. Canvas 2D, no dependencies. Coordinates are local to the field.
 * start.html demonstrates the same public adapter as the host game. */
(function(root){'use strict';
const last={'40':8,'01':10,'12':10,'23':12,'31':10};
const D=8.9, marks=Object.freeze({prepare:.67,launch:1.13,gone:2.2,entry:2.90,hit:3.76,flat:4.37,maul:4.49,end:D});
const min=Math.min,max=Math.max, clamp=x=>min(1,max(0,x)),seg=(x,a,b)=>clamp((x-a)/(b-a)),smooth=x=>x*x*(3-2*x),S=(x,a,b)=>smooth(seg(x,a,b)),mix=(a,b,t)=>a+(b-a)*t,lerpv=(a,b,t)=>a.map((v,i)=>mix(v,b[i],t));
const rise=.67,jump=1.13,gone=2.20,entry=2.90,hit=3.76,floor=4.37;
const bites=[[4.49,4.82,4.96,5.16,5.47],[5.54,5.81,5.94,6.15,6.43],[6.53,6.81,6.95,7.23,7.56],[7.60,7.91,8.06,8.30,8.54]];
const react=t=>bites.reduce((z,[a,b,d,p,r])=>z+S(t,d,p)*(1-S(t,p,r)),0);
let defaultBase='assets/fx/';if(typeof document!=='undefined' && document.currentScript?.src)defaultBase=new URL('./',document.currentScript.src).href;
async function preload({base=defaultBase,onProgress}={}){
 base=base.replace(/\/?$/,'/');const urls={rise:'wolf-takeoff.webp',front:'wolf-camera.webp',empty:'wolf-card-empty.webp'};
 for(const [id,k] of Object.entries(last))for(let i=0;i<=k;i++){const n=id+'-'+String(i).padStart(2,'0');urls[n]='poses/'+n+'.webp'}
 let done=0;const list=Object.entries(urls),out={audio:base+'maul.mp3'};
 await Promise.all(list.map(([k,path])=>new Promise((ok,no)=>{const pic=new Image();pic.onload=()=>{out[k]=pic;onProgress?.(++done,list.length);ok()};pic.onerror=()=>no(Error('Не загрузился '+path));pic.src=base+path})));return out
}
function createScene(canvas,assets,initial,{makeCanvas=(w,h)=>{const a=document.createElement('canvas');a.width=w;a.height=h;return a}}={}){
 const c=canvas.getContext('2d'),im=Object.create(assets),createCanvas=makeCanvas;
 let target,boss,view,heroes,others,uv,W,H,K,targetId,slip,space;
 const off=t=>S(t,hit,floor);
 function configure(L){
   if(!L||!L.heroes?.length||!L.heroes.some(h=>h.id===L.targetId&&h.texture))throw Error('Нужны карты и текстура выбранной цели');
   const rect=r=>Array.isArray(r)&&r.length===4&&r.every(Number.isFinite)&&r[2]>0&&r[3]>0;
   if(!(L.width>0&&L.height>0)||!rect(L.boss)||L.heroes.some(h=>!rect(h.rect))||new Set(L.heroes.map(h=>h.id)).size!==L.heroes.length)throw Error('Неверные размеры или повтор id');
   targetId=L.targetId;const curr=L.heroes.find(h=>h.id===targetId);K=curr.rect[3]/309;W=L.width/K;H=L.height/K;boss=L.boss.map(v=>v/K);

   heroes=L.heroes.map(h=>({...h,rect:h.rect.map(v=>v/K)}));target=heroes.find(h=>h.id===targetId).rect;others=heroes.filter(h=>h.id!==targetId);
   uv=(curr.biteUV||[.59,.23]).map(clamp);
   const pic=curr.texture,iw=pic.naturalWidth||pic.videoWidth||pic.width,ih=pic.naturalHeight||pic.videoHeight||pic.height;
   if(!iw||!ih)throw Error('Текстура цели ещё не загружена');
   const shrink=Math.min(1,512/iw,768/ih);const tex=makeCanvas(Math.max(2,Math.round(iw*shrink)),Math.max(2,Math.round(ih*shrink)));
   tex.getContext('2d').drawImage(pic,0,0,tex.width,tex.height);im.target=tex;cached=null;
   const sameRow=r=>Math.abs((r[1]+r[3]/2)-(target[1]+target[3]/2))<.55*Math.min(r[3],target[3]);
   const l=others.filter(h=>sameRow(h.rect)&&h.rect[0]<target[0]).sort((a,b)=>b.rect[0]-a.rect[0]);
   const r=others.filter(h=>sameRow(h.rect)&&h.rect[0]>=target[0]).sort((a,b)=>a.rect[0]-b.rect[0]);
   space={l,r};const needR=r.reduce((v,h,i)=>v+h.rect[2]+(i===0?32:8),0);
   const margin=8;slip=Math.max(0,target[0]+target[2]+target[3]+needR+margin-W);
   const needL=l.reduce((v,h,i)=>v+h.rect[2]+(i===0?24:8),0);
   // On crowded rows clamp the target group to its free corridor; preserve original card sizes.
   slip=Math.min(slip,Math.max(0,target[0]+target[2]-needL-margin));
   setVisible(L.visibleRect);
 }
// All framing is in board coordinates; the DOM adapter supplies the actual unobstructed rectangle.
 function setVisible(rect){
   if(!rect)view=[0,0,W,H];
   else{
    if(!Array.isArray(rect)||rect.length!==4||!rect.every(Number.isFinite))throw Error('visibleRect: [x,y,width,height]');
    const [x,y,w,h]=rect.map(v=>v/K),l=min(W,max(0,x)),t=min(H,max(0,y));
    view=[l,t,max(l,min(W,x+max(0,w))),max(t,min(H,y+max(0,h)))];
   }
   planSide();
 }
 const between=(n,l,h)=>max(l,min(h,n));
 function safe(){const [l,t,r,b]=view,p=.055*min(r-l,b-t);return [l+p,t+p,r-p,b-p]}
 function fit(ext,at,desired,safeBox=safe()){
   const [l,t,r,b]=safeBox,[x0,y0,x1,y1]=ext;
   const k=max(0,min(desired,(r-l)/max(.000001,x1-x0),(b-t)/max(.000001,y1-y0)));
   return [between(at[0],l-x0*k,r-x1*k),between(at[1],t-y0*k,b-y1*k),k];
 }
function geom(t){
 const s=seg(t,hit,floor),a=Math.PI/2*(s*s*(2.25-1.25*s))-.04*Math.sin(Math.PI*seg(t,floor,floor+.19))*(1-seg(t,floor,floor+.19));
 const f=S(t,hit+.048,floor+.055),b=f*(Math.PI/2-(18+14)*Math.PI/180),q=.14*Math.sin(b),co=Math.cos(a),sn=Math.sin(a);
 const ox=target[0]+target[2]+edgeTravel(t)-slip*S(t,hit,floor)+1.5*react(t),oy=target[1]+target[3]+3*f-react(t)*1.4;
 const p=(u,v)=>{let l=1-u,g=1/(1+l*q),X=-target[2]*l*Math.cos(b)*g,Y=target[3]*(-.5+(v-.5)*g);return [ox+co*X-sn*Y,oy+sn*X+co*Y]};
 const ground=(u,v)=>{let v0=p(u,v);v0[1]+=f*(1-u)*target[2]*Math.sin(14*Math.PI/180)*.94;return v0};return {p,f,a,q,ground}
}

 function positions(t){
  const m=S(t,hit-.33,floor-.03),p=geom(t).p,corners=[[0,0],[1,0],[0,1],[1,1]],xr=corners.map(x=>p(...x)[0]);
  let right=Math.max(...xr),left=Math.min(...xr),homeR=target[0]+target[2],homeL=target[0],out={};const nudge=edgeTravel(t);if(nudge&&t<=hit)out[targetId]=nudge*K;
  for(const [i,h] of space.r.entries()){const [x,y,w]=h.rect,gap0=Math.max(0,Math.min(x-homeR,i?8:10)),gap=mix(gap0,i?8:32,m),ahead=i?0:Math.max(0,target[0]+target[2]+target[3]-slip+32-x)*m;
   const pos=Math.max(x+ahead,right+gap);out[h.id]=(pos-x)*K;right=pos+w;homeR=x+w}
  for(const [i,h] of space.l.entries()){const [x,y,w]=h.rect,g0=Math.max(0,Math.min(homeL-x-w,8)),pos=Math.min(x,left-w-mix(g0,i?8:14,m));out[h.id]=(pos-x)*K;left=pos;homeL=x}
  return out
 }
function poly(p,fill){c.beginPath();p.forEach((v,i)=>i?c.lineTo(...v):c.moveTo(...v));c.closePath();if(fill){c.fillStyle=fill;c.fill()}}
function shadowEllipse(x,y,w,h,str){c.save();c.translate(x,y);c.scale(w,h);const g=c.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,'rgba(0,0,0,'+str+')');g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.fillRect(-1,-1,2,2);c.restore()}
let cached=null;
function warp(q){if(q<.00001)return im.target;if(cached&&Math.abs(q-cached.q)<.00001)return cached.can;const w=im.target.width,h=im.target.height,can=cached?cached.can:createCanvas(w,h),g=can.getContext('2d');g.clearRect(0,0,w,h);const inv=z=>z/(1+q*(1-z));for(let x=0;x<w;x+=1){const l=inv(1-(x+.5)/w),a=1-inv(1-x/w),b=1-inv(1-(x+1)/w),k=1/(1+q*l);g.drawImage(im.target,a*w,0,(b-a)*w,h,x,(1-k)*h/2,1,k*h)}cached={q,can};return can}
function card(t){if(t<=hit)return;
const {p,q,ground,f}=geom(t),cor=[[0,0],[1,0],[1,1],[0,1]],corn=cor.map(x=>p(...x));c.save();c.shadowColor='rgba(0,0,0,.8)';c.shadowBlur=9;poly(cor.map(x=>ground(...x)),'rgba(9,10,12,'+(.56*f)+')');c.restore();
poly(corn.concat([corn[0]]).map(([x,y])=>[x,y+2.4]),'#6b5032');
const a=p(0,.5),b=p(1,.5),A=p(1,0),B=p(1,1),u=[(b[0]-a[0])/im.target.width,(b[1]-a[1])/im.target.width],v=[(B[0]-A[0])/im.target.height,(B[1]-A[1])/im.target.height];c.save();c.transform(u[0],u[1],v[0],v[1],a[0]-v[0]*im.target.height/2,a[1]-v[1]*im.target.height/2);c.drawImage(warp(q),0,0);c.restore()}
const anchors=[[529,486],[501,489],[501,489],[501,489],[594,421]],noses=[[577,356],[609,430],[593,487],[610,354],[538,341]];
const ink={"01-00":[2,145,593,502],"01-01":[2,146,588,503],"01-02":[2,148,591,504],"01-03":[2,149,594,504],"01-04":[2,151,598,505],"01-05":[2,152,601,505],"01-06":[8,165,603,510],"01-07":[8,167,606,509],"01-08":[8,168,609,509],"01-09":[8,170,612,508],"01-10":[9,172,615,508],"12-00":[9,172,615,508],"12-01":[9,172,614,508],"12-02":[9,172,612,508],"12-03":[9,173,611,508],"12-04":[9,173,609,508],"12-05":[9,173,607,508],"12-06":[7,171,607,508],"12-07":[7,171,605,508],"12-08":[8,172,603,508],"12-09":[8,172,601,508],"12-10":[8,173,599,508],"23-00":[8,173,599,508],"23-01":[8,168,601,508],"23-02":[8,164,602,508],"23-03":[8,159,604,508],"23-04":[8,155,605,508],"23-05":[8,150,607,508],"23-06":[8,146,608,508],"23-07":[7,151,609,508],"23-08":[7,147,610,508],"23-09":[7,144,612,508],"23-10":[7,140,613,508],"23-11":[8,137,614,508],"23-12":[8,134,615,508],"31-00":[8,134,615,508],"31-01":[8,137,615,508],"31-02":[7,141,615,508],"31-03":[7,145,615,508],"31-04":[7,149,615,508],"31-05":[7,153,615,508],"31-06":[9,153,616,508],"31-07":[9,158,616,508],"31-08":[9,162,616,508],"31-09":[9,167,616,508],"31-10":[9,172,615,508],"40-00":[9,225,607,488],"40-01":[10,215,603,482],"40-02":[12,205,600,477],"40-03":[14,195,598,486],"40-04":[16,184,597,496],"40-05":[1,173,607,485],"40-06":[1,165,602,489],"40-07":[2,155,597,495],"40-08":[2,145,593,502]};
function pose(t){let id='40',k=0;if(t<hit)k=S(t,entry+.33,hit);else if(t<floor+.1){id='01';k=S(t,hit+.04,floor+.075)}else{id='12';for(const [a,b,d,p,r] of bites){if(t<a)break;if(t<b){k=S(t,a,b);break}if(t<d){k=1;break}if(t<p){id='23';k=S(t,d,p);break}if(t<r){id='31';k=S(t,p,r);break}}}let j=Math.round(k*last[id]),f=j/last[id];const name=id+'-'+String(j).padStart(2,'0');return {pic:im[name],bounds:ink[name],an:lerpv(anchors[+id[0]],anchors[+id[1]],f),no:lerpv(noses[+id[0]],noses[+id[1]],f)}}
const rotate=(p,ang)=>[p[0]*Math.cos(ang)-p[1]*Math.sin(ang),p[0]*Math.sin(ang)+p[1]*Math.cos(ang)];
// Rotated silhouette bounds with a one-pixel transparent guard for filtered sampling.
function extents(z,ang){const [l,t,r,b]=z.bounds,[ax,ay]=z.an,
 corners=[[l,t],[r,t],[r,b],[l,b]].map(([x,y])=>rotate([x-ax,y-ay],ang));
 return [min(...corners.map(x=>x[0])),min(...corners.map(x=>x[1])),max(...corners.map(x=>x[0])),max(...corners.map(x=>x[1]))]}
// Use the same model scale from the first airborne exposure to the final bite.
// v20 reference: 0.616; v21 is exactly 10% larger on both axes.
const SIDE_SIZE=.616*1.10;
const envelope=Object.values(ink).reduce((out,[l,t,r,b])=>[
 max(out[0],r-l+(b-t)*.122),max(out[1],b-t+(r-l)*.122)], [1,1]); // |angle| < .122 rad
let side;
function planSide(){
 const [l,t,r,b]=view,pad=.024*min(r-l,b-t),box=[l+pad,t+pad,r-pad,b-pad];
 // One viewport-level fallback for a physically smaller window; never fit individual poses/slots.
 const scale=max(0,min(SIDE_SIZE,(box[2]-box[0])/envelope[0],(box[3]-box[1])/envelope[1]));
 const ext=extents(pose(hit),.085),[x,y,w,h]=target;
 const xmin=box[0]-ext[0]*scale,xmax=box[2]-ext[2]*scale,ymin=box[1]-ext[1]*scale,ymax=box[3]-ext[3]*scale;
 const room=max(0,W-8-Math.max(x+w,...space.r.map(({rect:a})=>a[0]+a[2]))-32);
 // At the very left edge, make a little room for a full-size beast. Travel is temporary;
 // neighbours follow the real target edge and every regular slot keeps its original position.
 const inSight=x+w>l&&x<r&&y+h>t&&y<b;
 const nudge=inSight?min(room,.65*w,max(0,xmin-(x+.91*w))):0;
 const cx=between(between(x+.38*w+nudge,xmin,xmax),x+nudge+.09*w,x+nudge+.91*w);
 const cy=between(between(y+.52*h,ymin,ymax),y+.08*h,y+.92*h);
 const uvHit=[(cx-x-nudge)/w,(cy-y)/h];
 side={box,scale,nudge,uvHit};
}
function edgeTravel(t){return side.nudge*S(t,entry+.055,hit-.05)*(1-off(t))}
function keepIn(ext,point,s,box){return [between(point[0],box[0]-ext[0]*s,box[2]-ext[2]*s),between(point[1],box[1]-ext[1]*s,box[3]-ext[3]*s)]}
function actor(t){
 const {p}=geom(t),z=pose(t),fin=-.052,f=off(t),{scale,box,uvHit}=side,bite=p(...uv);
 const ss=rotate([(noses[2][0]-anchors[2][0])*scale,(noses[2][1]-anchors[2][1])*scale],fin);
 const rest=[bite[0]-ss[0],bite[1]-ss[1]];let ang=mix(.085,fin,f),at=lerpv(p(...uvHit),rest,f);
 if(t<=hit){
   const u=seg(t,entry,hit),e=u*(1.28-.28*u);ang=.085+.036*Math.sin(Math.PI*u);
   const end=keepIn(extents(pose(hit),.085),geom(hit).p(...uvHit),scale,box),
         st=keepIn(extents(pose(entry),.085),[box[0],box[1]],scale,box);
   at=keepIn(extents(z,ang),[mix(st[0],end[0],e),mix(st[1],end[1],.30*u*u+.70*u)],scale,box)
 }else if(t<floor){
   // Retain the registered paw at impact, then follow the tipping face. Once the hero is
   // down the jaws are locked to the real shoulder, even if the host scrolls the victim away.
   at=lerpv(keepIn(extents(z,ang),at,scale,box),at,f);
 }
 const rn=rotate([(z.no[0]-z.an[0])*scale,(z.no[1]-z.an[1])*scale],ang);
 return {z,at,ang,scale,nose:[at[0]+rn[0],at[1]+rn[1]]}
}
 const lens={rise:{key:'rise',reg:[584,597]},front:{key:'front',reg:[522,589]}};
 function eye(){return [boss[0]+.505*boss[2],boss[1]+.346*boss[3]]}
 function aim(sp,at,desired){const [x,y]=sp.reg,q=im[sp.key];return fit([-x,-y,q.width-x,q.height-y],at,desired)}
 function departure(t){
   const reg=eye(),h0=boss[3]*.786;
   if(t<jump){const sp=lens.rise;return {sp,tr:aim(sp,reg,h0*mix(1,1.008,S(t,rise,jump))/1506),opacity:S(t,rise,rise+.14)}}
   const sp=lens.front,u=seg(t,jump,gone),s=aim(sp,reg,h0*1.008/1193);
   const [l,top,r,b]=view,ww=r-l,hh=b-top,q=im.front;
   const k=min(.86*hh/q.height,.84*ww/q.width);
   const p=aim(sp,[l+ww*.39+(sp.reg[0]-q.width/2)*k,top+hh*.50+(sp.reg[1]-q.height/2)*k],k);
   // Convex interpolation of two fully contained rectangles: no transient overrun at any FPS.
   const z=smooth(Math.pow(seg(u,0,.82),1.58));return {sp,tr:lerpv(s,p,z),opacity:1-S(u,.905,1)}
 }
 function intro(t){
   if(t<rise||t>=gone)return;
   const {sp,tr:[x,y,k],opacity}=departure(t),pic=im[sp.key];
   c.save();c.globalAlpha=opacity;c.drawImage(pic,x-sp.reg[0]*k,y-sp.reg[1]*k,pic.width*k,pic.height*k);c.restore()
 }
function random(j){const a=Math.sin(j*75.2731+9.123)*38512.6;return a-Math.floor(a)}
function effects(t){for(let i=0;i<bites.length;i++){const [a,b,d,p,r]=bites[i];for(let j=0;j<28;j++){let n=i*181+j,born=d+.019+random(n+42)*.115,age=t-born,life=.29+random(n+501)*.26;if(age<0||age>life)continue;let origin=actor(born).nose,dir=(i%2===0?1:-1)*(j%7===0?-1:1),vx=dir*(70+random(n+2)*193),vy=-35-random(n+4)*168;let dx=vx*age,dy=vy*age+352*age*age;let px=origin[0]+dx,py=min(origin[1]+dy,geom(t).p(1,.5)[1]+2);c.save();c.globalAlpha=1-S(age,life-.15,life);c.translate(px,py);c.rotate(Math.atan2(vy+704*age,vx));let rr=1+random(n)*2;c.fillStyle=['#aa3040','#7b1729','#b53a42','#761e2b'][j%4];c.beginPath();c.ellipse(0,0,rr*(j%7===0?1.0:2.1),rr*.65,0,0,2*Math.PI);c.fill();c.restore()}}}
function attack(t){if(t<entry)return;const ac=actor(t);let f=off(t);if(f>0){const site=geom(t).p(...uv);shadowEllipse(site[0]-91,site[1]+12,145,13,.35*f);if(t>bites[0][2]){c.save();const s=geom(t);poly([[0,0],[1,0],[1,1],[0,1]].map(v=>s.p(...v)));c.clip();c.strokeStyle='#742732';c.lineCap='round';for(let k=0;k<3;k++){c.beginPath();c.moveTo(site[0]-7,site[1]+k*2);c.quadraticCurveTo(site[0]+2,site[1]+6+k*1.1,site[0]+13-k*2,site[1]+4+k);c.lineWidth=2.1-k*.4;c.stroke()}c.restore()}}
c.save();if(t<hit)c.globalAlpha=S(t,entry,entry+.105);c.translate(...ac.at);c.rotate(ac.ang);c.scale(ac.scale,ac.scale);if(t<=hit){const [l,tp,r,b]=ac.z.bounds;c.drawImage(ac.z.pic,l,tp,r-l,b-tp,l-ac.z.an[0],tp-ac.z.an[1],r-l,b-tp)}else c.drawImage(ac.z.pic,-ac.z.an[0],-ac.z.an[1]);c.restore();effects(t)}

 function phase(t){return t<rise?'ready':t<jump?'windup':t<gone?'launch':t<entry?'away':t<hit?'incoming':t<floor?'fall':t<bites[0][0]?'landed':t<D?'maul':'pinned'}
 function state(time){const t=clamp(time/D)*D;return {time:t,phase:phase(t),bossBlend:S(t,rise,rise+.14),targetHidden:t>hit,shifts:positions(t),axis:(t>=rise&&t<gone?departure(t).tr.slice(0,2):eye()).map(v=>v*K),targetId}}
 function paint(time){
    if(time>D)return paintTransfer(time);
    const t=clamp(time/D)*D,s=state(t);c.save();c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,canvas.width,canvas.height);c.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);if(view[2]>view[0]&&view[3]>view[1]){card(t);attack(t);intro(t);}c.restore();return s}
 // The original victim rises as the same wolf springs from its shoulder. The den stays empty.
 function paintTransfer(time){
   const u=clamp((time-D)/.6), t=mix(floor+.08,hit,smooth(u)), s=state(t);
   c.save();c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,canvas.width,canvas.height);
   c.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);
   card(t);
   const ac=actor(D), lift=smooth(u), x=ac.at[0]+(view[2]+180-ac.at[0])*lift;
   const y=ac.at[1]-(ac.at[1]-view[1]+80)*lift-56*Math.sin(Math.PI*u);
   c.translate(x,y);c.rotate(ac.ang-.18*Math.sin(Math.PI*u));c.scale(ac.scale,ac.scale);
   c.drawImage(ac.z.pic,-ac.z.an[0],-ac.z.an[1]);c.restore();
   return {...s,time,phase:'transfer',bossBlend:1,targetHidden:u<1};
 }
 configure(initial);return {configure,setVisible,state,paint,inspect(t){const a=actor(t);return {sideScale:a.scale,paw:a.at.map(x=>x*K),nose:a.nose.map(x=>x*K),shoulder:geom(t).p(...uv).map(x=>x*K),corners:[[0,0],[0,1],[1,0],[1,1]].map(u=>geom(t).p(...u).map(x=>x*K))}}}
}
// Client rectangles, not backing-store pixels. Ancestor overflow and mobile viewport both matter.
function visibleBoard(board,br=board.getBoundingClientRect()){
 const vv=window.visualViewport,vx=vv?.offsetLeft||0,vy=vv?.offsetTop||0;
 let l=max(br.left,vx),t=max(br.top,vy),r=min(br.left+br.width,vx+(vv?.width||window.innerWidth||Infinity)),b=min(br.top+br.height,vy+(vv?.height||window.innerHeight||Infinity));
 const clips=v=>/^(auto|scroll|hidden|clip|overlay)$/.test(v);
 for(let el=board.parentElement;el;el=el.parentElement){
  if(el===document.documentElement||el===document.body)continue;
  const css=getComputedStyle(el),cx=clips(css.overflowX),cy=clips(css.overflowY);
  if(!cx&&!cy)continue;
  const a=el.getBoundingClientRect(),sx=a.width/(el.offsetWidth||a.width||1),sy=a.height/(el.offsetHeight||a.height||1),
   x=a.left+(el.clientLeft||0)*sx,y=a.top+(el.clientTop||0)*sy;
  if(cx){l=max(l,x);r=min(r,x+el.clientWidth*sx)}if(cy){t=max(t,y);b=min(b,y+el.clientHeight*sy)}
 }
 return [l-br.left,t-br.top,max(0,r-l),max(0,b-t)];
}
// Visual clock: game authority starts each phase; a running tween never advances the turn.
function bindBoard({board,canvas,assets,boss,heroes,targetId,bossBlend=()=>{},onFrame=()=>{},onPhase=()=>{},muted=true}){
 if(!board||!boss||!assets||!heroes?.length)throw Error('Не передана доска, босс или арты');
 const own=!canvas;canvas=canvas||document.createElement('canvas');
 const boardPos=board.style.position,wasStatic=getComputedStyle(board).position==='static';
 if(wasStatic)board.style.position='relative';
 if(own){Object.assign(canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:20});board.append(canvas)}
 const original=heroes.map(h=>({h,translate:h.el.style.translate,vis:h.el.style.visibility}));
 const music=new Audio(assets.audio);music.preload='auto';music.muted=!!muted;
 let time=0,end=0,playing=false,speed=1,tickId=0,start=0,clock=0,done=null,scene,scaleX=1,disposed=false,prev='',current,resizeId=0;
 function measure(){const br=board.getBoundingClientRect();for(const item of original)item.scale=item.h.el.getBoundingClientRect().width/(item.h.el.offsetWidth || 1);scaleX=br.width/(board.clientWidth||br.width);const rect=el=>{const a=el.getBoundingClientRect();return [a.left-br.left,a.top-br.top,a.width,a.height]};
  const d=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.max(1,Math.round(br.width*d));canvas.height=Math.max(1,Math.round(br.height*d));
  return {width:br.width,height:br.height,visibleRect:visibleBoard(board,br),boss:rect(boss),targetId,heroes:heroes.map(h=>({id:h.id,rect:rect(h.el),texture:h.texture,biteUV:h.biteUV}))}}
 function restore(){for(const {h,vis,translate} of original){h.el.style.translate=translate;h.el.style.visibility=vis}}
 function draw(){const s=scene.paint(time);for(const {h,vis,translate,scale} of original){const dx=s.shifts[h.id]||0;h.el.style.translate=dx?dx/(scale||scaleX)+'px 0px':translate;h.el.style.visibility=s.targetHidden&&h.id===targetId?'hidden':vis}
  bossBlend(s.bossBlend);current=s;if(prev!==s.phase){prev=s.phase;onPhase(s.phase,s)}onFrame(s);return s}
 function refresh(){if(disposed || !board.getBoundingClientRect().width || !boss.getBoundingClientRect().width || heroes.some(h=>!h.el.getBoundingClientRect().width))return;restore();const layout=measure();if(scene)scene.configure(layout);else scene=createScene(canvas,assets,layout);draw()}
 function stop(reason){playing=false;cancelAnimationFrame(tickId);music.pause();if(done){const r=done;done=null;r(reason)}}
 function audioStart(){if(music.muted||disposed)return;try{music.currentTime=time;music.playbackRate=speed;const result=music.play();if(result)result.catch(()=>{})}catch{}}
 function tick(stamp){if(!playing||disposed)return;time=Math.min(end,start+(stamp-clock)*.001*speed);if(time>=end){stop('finished');draw();return}draw();tickId=requestAnimationFrame(tick)}
 function segment(a,b){if(disposed)return Promise.resolve('disposed');scene.setVisible(visibleBoard(board));stop('interrupted');time=start=a;end=b;clock=performance.now();playing=true;draw();audioStart();const promise=new Promise(r=>done=r);tickId=requestAnimationFrame(tick);return promise}
 function seek(t){if(disposed)return;stop('interrupted');time=Math.max(0,Math.min(D,Number(t)||0));draw()}
 function reset(){seek(0);end=D}
 let viewId=0;const cleanups=[];
 function updateVisible(){if(!disposed && board.offsetWidth && boss.offsetWidth && heroes.every(h=>h.el.offsetWidth))refresh()}
 function scheduleView(){if(!viewId)viewId=requestAnimationFrame(()=>{viewId=0;updateVisible()})}
 function listen(obj,name,fn,opt){if(obj?.addEventListener){obj.addEventListener(name,fn,opt);cleanups.push(()=>obj.removeEventListener(name,fn,opt))}}
 listen(window,'scroll',scheduleView,true);listen(window,'resize',scheduleView);
 listen(window.visualViewport,'scroll',scheduleView);listen(window.visualViewport,'resize',scheduleView);
 listen(document,'fullscreenchange',scheduleView);
 refresh();const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(()=>{cancelAnimationFrame(resizeId);resizeId=requestAnimationFrame(()=>refresh())}):null;observer?.observe(board);
 const api={full:()=>segment(0,D),launch:(elapsed=0)=>segment(Math.min(gone,Math.max(0,elapsed)),gone),
  approach:(elapsed=0)=>segment(Math.min(hit,entry+Math.max(0,elapsed)),hit),
  capture:()=>segment(hit,D),depart:()=>segment(D,D+.6),strike:(id)=>{if(id!==undefined&&id!==targetId){if(!heroes.some(h=>h.id===id))throw Error('Нет цели '+id);stop('interrupted');time=entry;targetId=id;refresh()}return segment(entry,D)},maul:()=>segment(bites[0][0],D),reset,release:reset,seek,refresh,
  pause(){stop('paused')},resume(){return segment(time,end>time?end:D)},
  selectTarget(id){if(!heroes.some(h=>h.id===id))throw Error('Нет цели '+id);const wait=time>=gone&&time<entry;stop('interrupted');time=wait?gone:0;end=wait?gone:D;targetId=id;refresh()},
  setSpeed(n){if(!Number.isFinite(n)||n<=0)return;speed=Math.min(2,Math.max(.25,n));start=time;clock=performance.now();music.playbackRate=speed},
  setVolume(v){music.volume=Math.max(0,Math.min(1,v))},
  setMuted(v){music.muted=!!v;if(v)music.pause();else if(playing)audioStart()},
  get time(){return time},get playing(){return playing},get state(){return current},
  dispose(){if(disposed)return;disposed=true;stop('disposed');observer?.disconnect();for(const fn of cleanups)fn();cancelAnimationFrame(viewId);cancelAnimationFrame(resizeId);restore();bossBlend(0);if(own)canvas.remove();else canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);if(wasStatic)board.style.position=boardPos;music.removeAttribute('src');music.load()}
 };return api
}
const api=Object.freeze({version:'21.0',duration:D,marks,preload,createScene,bindBoard});
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GrivensburgDirewolf=api;
})(typeof window!=='undefined'?window:globalThis);
