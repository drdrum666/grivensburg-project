/* All hero resource writes pass the same pure reconciler inside the Firebase
   transaction. No rules live here: this adapter only identifies room/player nodes. */
(function(root){
'use strict';
root.makeResourceTransactions=function(api){
    function kind(reference){
        const path=reference?.path || String(reference);
        const match=path.match(/(?:^|\/)rooms\/([^/?]+)(?:\/players(?:\/([^/?]+))?)?(?:\/?(?:\?.*)?)$/);
        if(!match)return null;
        return {room:match[1],player:match[2],players:/\/players\/?(?:\?.*)?$/.test(path)};
    }
    function normalized(before,next,reference,stamp){
        if(next==null)return next;
        const k=kind(reference);if(!k)return next;
        const base=api.world(),items=api.items(),R=api.rules;
        const hero=(p,n,w,id)=>{
            if(!n?.cls)return n;
            const out=R.normalizePlayerResources(p,n,w,items,id);
            if(p && (out.hp!==p.hp || out.mp!==p.mp) && (!out.battleVitalsId || out.battleVitalsId===p.battleVitalsId))out.battleVitalsId=stamp;
            return out;
        };
        if(k.player)return hero(before,next,base,k.player);
        if(k.players){const out={...next};for(const id of Object.keys(out))out[id]=hero(before?.[id],out[id],base,id);return out;}
        if(!next.players)return next;
        const world={...base,...next.world,players:next.players,enemies:next.enemies || {},round:next.battle?.round || 1,queue:Object.values(next.battle?.queue || {})};
        const players={...next.players};for(const id of Object.keys(players))players[id]=hero(before?.players?.[id],players[id],world,id);
        return {...next,players};
    }
    function runTransaction(reference,change,options){
        const stamp='resources-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
        return api.runTransaction(reference,before=>{
            const next=change(before);if(next===undefined)return;
            return normalized(before,next,reference,stamp);
        },options);
    }
    function update(reference,patch){
        const k=kind(reference);
        return k?.player ? runTransaction(reference,p=>({...p,...patch}),{applyLocally:false}) : api.update(reference,patch);
    }
    function set(reference,value){
        const k=kind(reference);
        return k?.player && value?.cls ? runTransaction(reference,()=>value,{applyLocally:false}) : api.set(reference,value);
    }
    return {runTransaction,update,set};
};
})(typeof window==='undefined'?globalThis:window);
