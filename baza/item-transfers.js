/* Общак: перенос одной вещи и покупка за общие деньги.
   Резерв + квитанции живут в тех же небольших узлах, что и имущество.
   pendingItems позволяет ведущему закончить выдачу/возврат без телефона. */
(function(root){
    'use strict';
    root.makeItemTransfers=function(env){
        const {db,ref,get,set,runTransaction,onValue}=env,work=new Map();
        const list=v=>Array.isArray(v)?v:[], num=v=>Number(v)||0;
        const key=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,160}$/.test(v);
        const same=(a,b)=>a&&['id','by','kind','key','index','view','price'].every(k=>a[k]===b[k]);
        const valid=o=>o&&key(o.id)&&key(o.by)&&key(o.key)&&['store','take','buy'].includes(o.kind)
            &&Number.isSafeInteger(o.price)&&o.price>=0&&Number.isSafeInteger(o.index)
            &&typeof o.view==='string'&&(o.kind==='buy'||o.index>=0);
        const allowed=by=>env.master||by===env.player();
        function afterRemoval(p,inv){
            const slots={...(p.slots||{})},used={};
            for(const slot of Object.keys(slots)){
                const k=slots[slot];if(!k)continue;
                used[k]=(used[k]||0)+1;
                if(used[k]>inv.filter(x=>x===k).length)slots[slot]='';
            }
            const facts={inv,slots};
            for(const hand of ['mainhand','offhand'])if(p[hand]!==undefined)facts[hand]=slots[hand]||'';
            return facts;
        }
        async function warm(paths,task){
            const stops=[];
            try{await Promise.all(paths.map(p=>new Promise((resolve,reject)=>stops.push(onValue(ref(db,p),resolve,reject)))));return await task();}
            finally{stops.forEach(stop=>stop());}
        }
        function resume(by,room=env.room(),fallback){
            if(!key(by)||!room||!allowed(by))return Promise.resolve({ok:false,why:'Неверный игрок'});
            const taskKey=room+'/'+by+'/'+(fallback?.id||'current');
            if(work.has(taskKey))return work.get(taskKey);
            const base='rooms/'+room,pp=base+'/players/'+by,vp=base+'/world/vault';
            const task=Promise.resolve().then(()=>warm([pp,vp],async()=>{
                const first=(await get(ref(db,pp))).val();
                const op=fallback||first?.itemTransfer;
                if(!op)return {ok:true,idle:true};
                if(!valid(op)||op.by!==by)throw Error('Повреждённая операция с вещью');
                const tx=await runTransaction(ref(db,vp),cur=>{
                    const v=cur||{};if(v.itemReceipts?.[op.id])return;
                    // Поручение должно быть сохранено у игрока до кассы.
                    if(!same(first?.itemTransfer,op))return;
                    let why='',facts={};const items=list(v.items).slice();
                    if(op.kind==='store'){items.push(op.key);facts.items=items;}
                    else if(op.kind==='take'){
                        if(JSON.stringify(items)!==op.view||items[op.index]!==op.key)why='Склад изменился. Выберите вещь заново';
                        else{items.splice(op.index,1);facts.items=items;}
                    }else if(!Number.isSafeInteger(num(v.gold))||num(v.gold)<op.price)why='В общаке не хватает золота';
                    else facts.gold=num(v.gold)-op.price;
                    const receipt={...op,ok:!why,why,state:'reserved'};
                    return {...v,...facts,itemRevision:op.id,
                        ...(op.kind==='buy'?{moneyRevision:op.id}:{}),
                        itemReceipts:{...v.itemReceipts,[op.id]:receipt},pendingItems:{...v.pendingItems,[op.id]:op}};
                },{applyLocally:false});
                let result=tx.snapshot.val()?.itemReceipts?.[op.id];
                if(!same(result,op))throw Error('Поручение не подтверждено: повторите проверку');
                if(result.state==='done'||result.state==='refunded'){
                    // Остались лишь журнал/очистка после неизвестного подтверждения.
                }else{
                    const issued=await runTransaction(ref(db,pp),p=>{
                        if(!p||p.itemReceipts?.[op.id])return;
                        if(!same(p.itemTransfer,op))return;
                        const inv=list(p.inv).slice();
                        if(result.ok&&op.kind!=='store')inv.push(op.key);
                        return {...p,inv,itemReceipts:{...p.itemReceipts,[op.id]:{...result,state:'done'}},
                            itemRevision:'done-'+op.id,battleVitalsId:'item-done-'+op.id};
                    },{applyLocally:false});
                    const player=issued.snapshot.val(),paid=player?.itemReceipts?.[op.id];
                    if(paid){if(!same(paid,op))throw Error('Квитанция другой вещи');result=paid;}
                    else if(player)throw Error('У игрока другое поручение: выдача сохранена для проверки');
                    else if(result.ok&&op.kind!=='store'){
                        // Герой исчез после списания: вещь/деньги возвращаются
                        // той же транзакцией, которая помечает возврат.
                        const refund=await runTransaction(ref(db,vp),v=>{
                            const rec=v?.itemReceipts?.[op.id];if(!same(rec,op)||rec.state==='refunded')return;
                            const facts=op.kind==='buy'?{gold:num(v.gold)+op.price}:{items:[...list(v.items),op.key]};
                            return {...v,...facts,itemRevision:'refund-'+op.id,
                                ...(op.kind==='buy'?{moneyRevision:'refund-'+op.id}:{}),
                                itemReceipts:{...v.itemReceipts,[op.id]:{...rec,ok:false,why:'Герой удалён; имущество возвращено в общак',state:'refunded'}}};
                        },{applyLocally:false});
                        result=refund.snapshot.val()?.itemReceipts?.[op.id];
                        if(result?.state!=='refunded')throw Error('Возврат ещё не подтверждён');
                    }
                }
                const verb=op.kind==='store'?'сдал в общак':op.kind==='take'?'получил из общака':'купил за '+op.price+' золота из общака';
                await set(ref(db,base+'/battle/actionLog/-item-'+op.id),{text:result.ok
                    ?`🎒 ${op.name||result.name} ${verb}: ${op.title||result.title}`:'🎒 '+(op.name||result.name)+': '+result.why,type:'gm',timestamp:op.at||result.at});
                await runTransaction(ref(db,pp),p=>{
                    if(p?.itemTransfer?.id!==op.id||!same(p.itemReceipts?.[op.id],op))return;
                    const next={...p};delete next.itemTransfer;return next;
                },{applyLocally:false});
                await runTransaction(ref(db,vp),v=>{
                    if(!v?.pendingItems?.[op.id])return;
                    const pending={...v.pendingItems};delete pending[op.id];
                    return {...v,pendingItems:pending,itemReceipts:{...v.itemReceipts,
                        [op.id]:{...result,state:result.state==='refunded'?'refunded':'done'}}};
                },{applyLocally:false});
                return result;
            }));
            work.set(taskKey,task);task.finally(()=>work.delete(taskKey)).catch(()=>{});return task;
        }
        async function begin(request){
            if(!valid(request)||!allowed(request.by)||(!env.master&&request.kind==='buy'))return {ok:false,why:'Неверная операция'};
            const room=env.room(),pp='rooms/'+room+'/players/'+request.by;
            return warm([pp],async()=>{
                const before=(await get(ref(db,pp))).val();
                if(before?.itemReceipts?.[request.id])return same(before.itemReceipts[request.id],request)
                    ?resume(request.by,room,request):{ok:false,why:'Этот номер относится к другой вещи'};
                if(before?.itemTransfer?.id===request.id)return same(before.itemTransfer,request)
                    ?resume(request.by,room,before.itemTransfer):{ok:false,why:'Этот номер относится к другой вещи'};
                const open=(await get(ref(db,'rooms/'+room+'/world/battleOpen'))).val();
                const queue=(await get(ref(db,'rooms/'+room+'/battle/queue'))).val();
                let why='Герой больше не найден';
                const tx=await runTransaction(ref(db,pp),p=>{
                    if(!p||p.itemReceipts?.[request.id]||p.itemTransfer?.id===request.id)return;
                    if(p.itemTransfer){why='Сначала завершите предыдущую передачу вещи';return;}
                    if(p.nightLock){why='Сначала завершите ночёвку';return;}
                    let facts={};
                    if(request.kind==='store'){
                        const inv=list(p.inv).slice();
                        if(JSON.stringify(inv)!==request.view||inv[request.index]!==request.key){why='Рюкзак изменился. Выберите вещь заново';return;}
                        const hands=['mainhand','offhand','magic1','magic2','magic3','magic4'];
                        const worn=Object.entries(p.slots||{}).filter(([s,k])=>!hands.includes(s)&&k===request.key).length;
                        if((open||Object.keys(queue||{}).length)&&worn&&inv.filter(k=>k===request.key).length<=worn){why='В бою надетую одежду нельзя передать';return;}
                        inv.splice(request.index,1);facts=afterRemoval(p,inv);
                    }
                    const op={...request,name:p.name||'Игрок',title:env.title(request.key),at:num(request.at)};
                    return {...p,...facts,itemTransfer:op,itemRevision:'start-'+op.id,battleVitalsId:'item-start-'+op.id};
                },{applyLocally:false});
                const p=tx.snapshot.val(),op=p?.itemTransfer;
                if(op?.id===request.id)return same(op,request)?resume(request.by,room,op):{ok:false,why:'Этот номер относится к другой вещи'};
                return same(p?.itemReceipts?.[request.id],request)?resume(request.by,room,request):{ok:false,why};
            });
        }
        function scan(players,pending={}){
            const room=env.room();if(!room)return;
            const ops={...pending};for(const p of Object.values(players||{}))if(p?.itemTransfer)ops[p.itemTransfer.id]=p.itemTransfer;
            for(const op of Object.values(ops))if(op&&allowed(op.by))resume(op.by,room,op).catch(e=>env.onError?.(e));
        }
        return {begin,resume,scan};
    };
})(typeof window!=='undefined'?window:globalThis);
