/* Денежный перевод между players и world/vault.
   Порядок: резерв в карточке героя -> касса/счёт + квитанция -> кошелёк
   + квитанция -> журнал -> снятие отметки ожидания. Каждый шаг повторяем.
   Это возобновляемый перевод, не транзакция всей комнаты. Старые пути
   сохраняются. В памяти нет единственного экземпляра незавершённых денег. */
(function (root) {
    'use strict';
    root.makeMoneyTransfers = function (env) {
        const {db, ref, get, set, runTransaction, onValue, rules:C} = env;
        const work=new Map(), number=v=>Number(v)||0;
        const deposit=kind=>['vault-put','common-put','own-put'].includes(kind);
        const kinds=['vault-put','vault-take','common-put','own-put','own-take','own-close'];
        const key=v=>typeof v==='string' && /^[a-zA-Z0-9_-]{1,160}$/.test(v);
        const same=(a,b)=>a && a.by===b.by && a.kind===b.kind && a.requested===b.amount;
        const receipt=(op,ok,why='',amount=op.amount)=>({id:op.id,by:op.by,kind:op.kind,
            requested:op.amount,amount,ok,why,name:op.name,at:op.at});
        const describe=r=>`${r.name}: ${({'vault-put':'в общак','vault-take':'из общака в кошелёк',
            'common-put':'на общий счёт','own-put':'на личный счёт','own-take':'с личного счёта в кошелёк',
            'own-close':'личный счёт закрыт, в кошелёк'})[r.kind]} ${r.amount} золота`;
        function valid(op) {
            return op && key(op.id) && key(op.by) && kinds.includes(op.kind)
                && Number.isSafeInteger(op.amount) && (op.kind==='own-close'?op.amount===0:op.amount>0);
        }
        // onValue прогревает настоящий локальный кеш SDK, get сам по себе
        // не заменяет подписку. Подписки всегда снимаются в finally.
        async function warm(paths, task) {
            const stops=[];
            try {
                await Promise.all(paths.map(path=>new Promise((resolve,reject)=>{
                    stops.push(onValue(ref(db,path),()=>resolve(),reject));
                })));
                return await task();
            } finally {stops.forEach(stop=>stop());}
        }
        function resume(by, room=env.room()) {
            if(!key(by) || !room || (!env.master && by!==env.player()))return Promise.resolve({ok:false,why:'Неверный игрок'});
            const taskKey=room+'/'+by;
            if(work.has(taskKey))return work.get(taskKey);
            const base='rooms/'+room,pp=base+'/players/'+by,vp=base+'/world/vault';
            const task=Promise.resolve().then(()=>warm([pp,vp],async()=>{
                const first=(await get(ref(db,pp))).val(),op=first?.moneyTransfer;
                if(!op)return {ok:true,idle:true};
                if(!valid(op) || op.by!==by)throw Error('Повреждённый перевод: нужен разбор, деньги не изменены');
                let result=first.moneyReceipts?.[op.id];
                if(result && !same(result,op))throw Error('Квитанция относится к другому переводу');
                if(!result){
                    const tx=await runTransaction(ref(db,vp),current=>{
                        const v=current||{},old=v.moneyReceipts?.[op.id];
                        if(old)return;
                        let next={...v},why='',amount=op.amount;
                        const acc=v.accounts?.[by];
                        if(op.kind.startsWith('own-') && (!acc || acc.gmTransfer))why='Личный счёт отсутствует или занят прежним переводом';
                        if(!why){
                            if(op.kind==='vault-put')next.gold=number(v.gold)+amount;
                            else if(op.kind==='vault-take'){
                                if(number(v.gold)<amount)why='В общаке не хватает золота';
                                else next.gold=number(v.gold)-amount;
                            }else if(op.kind==='common-put')Object.assign(next,C.bankDeposit(v,amount,op.day));
                            else {
                                const accounts={...(v.accounts||{})};
                                if(op.kind==='own-close'){amount=number(acc.bank);delete accounts[by];}
                                else {
                                    const change=op.kind==='own-put'?C.bankDeposit(acc,amount,op.day):C.bankWithdraw(acc,amount,op.day);
                                    if(!change)why='На личном счёте не хватает золота';
                                    else accounts[by]={...acc,...change};
                                }
                                next.accounts=accounts;
                            }
                        }
                        if(!why && (![next.gold,next.bank,next.accounts?.[by]?.bank,amount].filter(x=>x!==undefined)
                            .every(x=>Number.isSafeInteger(x) && x>=0)))why='Некорректная сумма на счёте';
                        const done=receipt(op,!why,why,amount);
                        if(why)next={...v};
                        return {...next,moneyRevision:op.id,moneyReceipts:{...v.moneyReceipts,[op.id]:done}};
                    },{applyLocally:false});
                    result=tx.snapshot.val()?.moneyReceipts?.[op.id];
                    if(!same(result,op))throw Error('Нет верной квитанции кассы: перевод сохранён для продолжения');
                    const done=await runTransaction(ref(db,pp),p=>{
                        if(!p || p.moneyTransfer?.id!==op.id || p.moneyReceipts?.[op.id])return;
                        const delta=deposit(op.kind)?(result.ok?0:op.amount):(result.ok?result.amount:0);
                        const gold=number(p.gold)+delta;
                        if(!Number.isSafeInteger(gold) || gold<0)return;
                        return {...p,gold,moneyReceipts:{...p.moneyReceipts,[op.id]:result},
                            goldTransferId:'money-done-'+op.id,battleVitalsId:'money-done-'+op.id};
                    },{applyLocally:false});
                    const stored=done.snapshot.val()?.moneyReceipts?.[op.id];
                    if(!same(stored,op))throw Error('Кошелёк ещё не подтвердил перевод: операция сохранена');
                    result=stored;
                }
                await set(ref(db,base+'/battle/actionLog/-money-'+op.id),{
                    text:result.ok?'🪙 '+describe(result):'🪙 '+result.name+': перевод отменён — '+result.why,
                    type:'gm',timestamp:op.at});
                await runTransaction(ref(db,pp),p=>{
                    if(p?.moneyTransfer?.id!==op.id || !same(p.moneyReceipts?.[op.id],op))return;
                    const next={...p};delete next.moneyTransfer;return next;
                },{applyLocally:false});
                return result;
            }));
            work.set(taskKey,task);task.finally(()=>work.delete(taskKey)).catch(()=>{});return task;
        }
        async function begin(request) {
            if(!valid(request) || (!env.master && (request.by!==env.player() || ['vault-take','own-close'].includes(request.kind))))
                return {ok:false,why:'Неверный перевод'};
            const room=env.room(),pp='rooms/'+room+'/players/'+request.by;
            return warm([pp],async()=>{
                const old=(await get(ref(db,pp))).val();
                if(old?.moneyTransfer?.id===request.id)return old.moneyTransfer.kind===request.kind && old.moneyTransfer.amount===request.amount
                    ?resume(request.by,room):{ok:false,why:'Номер уже принадлежит другому переводу'};
                if(old?.moneyReceipts?.[request.id])return same(old.moneyReceipts[request.id],request)
                    ?old.moneyReceipts[request.id]:{ok:false,why:'Номер уже принадлежит другому переводу'};
                if(!env.master && request.kind!=='vault-put'){
                    const bank=(await get(ref(db,'rooms/'+room+'/battle/bank'))).val();
                    const why=C.whyCantBank(bank);if(why)return {ok:false,why};
                }
                let why='Игрок больше не найден';
                const tx=await runTransaction(ref(db,pp),p=>{
                    if(!p)return;
                    if(p.moneyReceipts?.[request.id] || p.moneyTransfer?.id===request.id)return;
                    if(p.moneyTransfer){why='Сначала завершите предыдущий перевод';return;}
                    if(p.nightLock){why='Сначала завершите ночёвку';return;}
                    if(deposit(request.kind) && number(p.gold)<request.amount){why='В кошельке не хватает золота';return;}
                    const op={id:request.id,kind:request.kind,by:request.by,amount:request.amount,
                        day:number(request.day),at:number(request.at),name:p.name||'Игрок'};
                    return {...p,gold:number(p.gold)-(deposit(op.kind)?op.amount:0),moneyTransfer:op,
                        goldTransferId:'money-start-'+op.id,battleVitalsId:'money-start-'+op.id};
                },{applyLocally:false});
                const p=tx.snapshot.val();
                if(p?.moneyTransfer?.id===request.id)return p.moneyTransfer.kind===request.kind && p.moneyTransfer.amount===request.amount
                    ?resume(request.by,room):{ok:false,why:'Номер уже принадлежит другому переводу'};
                return same(p?.moneyReceipts?.[request.id],request)?p.moneyReceipts[request.id]:{ok:false,why};
            });
        }
        function scan(players) {
            const room=env.room();if(!room)return;
            for(const [id,p] of Object.entries(players||{}))if(p?.moneyTransfer && (env.master || id===env.player()))
                resume(id,room).catch(err=>{if(env.onError)env.onError(err);});
        }
        // Касса и общий вклад уже соседние поля: здесь обе стороны и
        // квитанция меняются сразу одной транзакцией.
        async function moveCommon(op){
            if(!env.master || !key(op?.id) || !['vault-bank-put','vault-bank-take'].includes(op.kind)
                || !Number.isSafeInteger(op.amount) || op.amount<=0)return {ok:false,why:'Неверная сумма'};
            op={...op,by:'_common',name:'Общак'};
            const base='rooms/'+env.room(),vp=base+'/world/vault';
            return warm([vp],async()=>{
                const tx=await runTransaction(ref(db,vp),value=>{
                    const v=value||{};if(v.moneyReceipts?.[op.id])return;
                    let next={...v},why='';
                    if(op.kind==='vault-bank-put'){
                        if(number(v.gold)<op.amount)why='В общаке не хватает золота';
                        else Object.assign(next,C.bankDeposit(v,op.amount,op.day),{gold:number(v.gold)-op.amount});
                    }else{
                        const f=C.bankWithdraw(v,op.amount,op.day);
                        if(!f)why='На общем счёте не хватает золота';
                        else Object.assign(next,f,{gold:number(v.gold)+op.amount});
                    }
                    if(!why && ![next.gold,next.bank].every(x=>Number.isSafeInteger(x)&&x>=0))why='Некорректная сумма на счёте';
                    if(why)next={...v};
                    return {...next,moneyRevision:op.id,moneyReceipts:{...v.moneyReceipts,[op.id]:receipt(op,!why,why)}};
                },{applyLocally:false});
                const result=tx.snapshot.val()?.moneyReceipts?.[op.id];
                if(!same(result,op))throw Error('Не удалось подтвердить перевод общего счёта');
                const direction=op.kind==='vault-bank-put'?'из общака на общий счёт':'с общего счёта в общак';
                await set(ref(db,base+'/battle/actionLog/-money-'+op.id),{text:result.ok?`🏦 ${direction}: ${op.amount} золота`:'🏦 '+result.why,type:'gm',timestamp:op.at});
                return result;
            });
        }
        return {begin,resume,scan,describe,moveCommon};
    };
})(typeof window!=='undefined'?window:globalThis);
