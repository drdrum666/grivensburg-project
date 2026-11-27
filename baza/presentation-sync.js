/* Presentation receipts never change combat facts. A vanished viewer cannot stop a room. */
(function(w){
 'use strict';
 const LEASE=20000,MAX_WAIT=120000;let offset=0;
 const serverNow=()=>Date.now()+offset;
 function connectClock({db,ref,onValue}){return onValue(ref(db,'.info/serverTimeOffset'),snap=>{offset=Number(snap.val())||0;});}
 function live(v,now){return v?.visible===true && now-Number(v.at)<LEASE;}
 function append(stream,id,event,now=serverNow()){
  const sync=stream.presentationSync||{},gates={...sync.gates};
  for(const[k,g]of Object.entries(gates))if(now-Number(g.at)>MAX_WAIT)delete gates[k];
  if(!gates[id] && ['result','sweep','vfx','enemy_skill','reinforcement'].includes(event.type)){
   const viewers=Object.fromEntries(Object.entries(sync.viewers||{}).filter(([,v])=>live(v,now)).map(([k])=>[k,true]));
   if(Object.keys(viewers).length)gates[id]={at:now,viewers};
  }
  const viewers=Object.fromEntries(Object.entries(sync.viewers||{}).filter(([,v])=>now-Number(v.at)<60000));
  return {...stream,presentationSync:{...sync,viewers,gates}};
 }
 function blocked(sync,now=serverNow()){
  return Object.values(sync?.gates||{}).some(g=>now-Number(g.at)<MAX_WAIT && Object.keys(g.viewers||{}).some(id=>!g.done?.[id]&&live(sync.viewers?.[id],now)));
 }
 function viewer({db,ref,update,runTransaction,room,visible,onError=()=>{}}){
  const id='v_'+Math.random().toString(36).slice(2)+Date.now().toString(36);let timer=null,connectedRoom='';
  function write(path,value){return update(ref(db,path),value).catch(onError);}
  function pulse(){const r=room();if(!r)return;connectedRoom=r;return write('rooms/'+r+'/stream/presentationSync/viewers/'+id,{visible:visible(),at:serverNow()});}
  function start(){if(timer)return;void pulse();timer=setInterval(()=>{if(visible())void pulse();},5000);}
  function done(eventId){if(!eventId||!connectedRoom)return;return runTransaction(ref(db,'rooms/'+connectedRoom+'/stream/presentationSync/gates/'+eventId),g=>g?.viewers?.[id]?{...g,done:{...g.done,[id]:true}}:undefined,{applyLocally:false}).catch(onError);}
  function stop(){clearInterval(timer);timer=null;if(connectedRoom)void write('rooms/'+connectedRoom+'/stream/presentationSync/viewers/'+id,{visible:false,at:serverNow()});}
  return {start,pulse,done,stop,id};
 }
 w.GrivensburgPresentationSync={append,blocked,viewer,connectClock,LEASE,MAX_WAIT};
})(window);
