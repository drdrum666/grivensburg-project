/* История отделена от rooms: игровые подписки и транзакции боя не качают
   десять старых комнат. В списке читается только index, при загрузке —
   один payload. Запись и вытеснение старых записей — одна транзакция. */
(function(root){
    'use strict';
    const LIMIT=10;
    function archivePath(room,owner){
        for(const value of [room,owner])if(typeof value!=='string'||!value||/[.#$\[\]/\x00-\x1f\x7f]/.test(value))throw Error('Не найден владелец сохранений комнаты');
        return 'roomSaves/'+room+'/'+owner;
    }
    function insert(current,entry){
        if(!entry||!entry.id||!entry.code)throw Error('Нет данных сохранения');
        const old=current||{};
        if(old.index?.[entry.id]&&old.data?.[entry.id])return old;
        const {code,...meta}=entry,index={...old.index,[entry.id]:meta},data={...old.data,[entry.id]:code};
        const keep=new Set(Object.keys(index).sort((a,b)=>Number(index[b].createdAt)-Number(index[a].createdAt)||b.localeCompare(a)).slice(0,LIMIT));
        for(const id of Object.keys(index))if(!keep.has(id))delete index[id];
        for(const id of Object.keys(data))if(!keep.has(id))delete data[id];
        return {version:1,index,data};
    }
    function rewardsComplete(reward){
        if(!reward?.id||!reward.victory||!reward.generated||!reward.xpDone||reward.stage!=='loot')return false;
        if(Number(reward.gold)>0&&!reward.goldGiven)return false;
        return Object.keys(reward.items||{}).every(i=>reward.grants?.[i]?.done===true);
    }
    function receiptsComplete(room){
        const r=room?.battle?.rewardState;if(!rewardsComplete(r))return false;
        if(!Object.values(r.xpPlan?.ids||{}).every(id=>room.players?.[id]?.rewardReceipts?.[r.id+'_xp']))return false;
        if(Number(r.gold)>0&&!room.world?.vault?.rewardReceipts?.[r.id+'_gold'])return false;
        return Object.keys(r.items||{}).every(i=>room.players?.[r.grants[i].playerId]?.rewardReceipts?.[r.id+'_item_'+i]);
    }
    root.RoomSaves={LIMIT,archivePath,insert,rewardsComplete,receiptsComplete};
})(window);
