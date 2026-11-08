/* ---------- per-record sync (WP3, architecture section 4) ----------
   Replaces the one-blob upload (user_state) for accounts that have moved (profiles.data_model = 2).
   The screens still read and write S; on every save() this file works out which records changed
   (syncmap.js), queues just those fields and sends them with sync_push. sync_pull brings in what other
   devices changed. Server order (change_seq) decides, never this phone's clock.

   Saved in IndexedDB per account ("gfd-sync"), with localStorage as a fallback:
     known   the records as last agreed (server rows plus this phone's queued changes)
     queue   changes waiting to be sent, one entry per record
     revs    each record's server rev (sent as the base rev)
     cursor  the highest change_seq pulled
     epoch   matches S._sync, so saved sync state is only used with the S it was made from

   When: on sign-in, after each push, on return to the app, when the connection comes back and every
   60 seconds while the app is open. A change the server refuses is logged and dropped; it never blocks
   the rest of the queue. Changes from another device are not applied while a sheet is open or you are
   typing; they wait for the next pull. */
var SY={on:false,uid:null,known:{},queue:{},revs:{},cursor:0,epoch:"",busy:false,pullAgain:false,timer:null,fails:0,err:"",dropped:[],tick:null,saveT:null,diffT:null};
function storeOn(){ return SY.on&&!!sbUser&&SY.uid===sbUser.id; }

/* ---- saving the sync state on this phone ---- */
var SY_DB=null;
function syDb(){
  if(SY_DB) return SY_DB;
  SY_DB=new Promise(function(res,rej){
    try{
      var r=indexedDB.open("gfd-sync",1);
      r.onupgradeneeded=function(){ r.result.createObjectStore("kv"); };
      r.onsuccess=function(){ res(r.result); };
      r.onerror=function(){ rej(r.error); };
    }catch(e){ rej(e); }
  });
  SY_DB.catch(function(){});
  return SY_DB;
}
function syGet(key){
  return syDb().then(function(db){ return new Promise(function(res,rej){ var q=db.transaction("kv").objectStore("kv").get(key); q.onsuccess=function(){res(q.result||null);}; q.onerror=function(){rej(q.error);}; }); })
    .catch(function(){ try{ return JSON.parse(localStorage.getItem("gfd-sync-"+key)||"null"); }catch(e){ return null; } });
}
function syPut(key,val){
  return syDb().then(function(db){ return new Promise(function(res,rej){ var tx=db.transaction("kv","readwrite"); tx.objectStore("kv").put(val,key); tx.oncomplete=function(){res();}; tx.onerror=function(){rej(tx.error);}; }); })
    .catch(function(){ try{ localStorage.setItem("gfd-sync-"+key,JSON.stringify(val)); }catch(e){} });
}
function syDel(key){
  try{ localStorage.removeItem("gfd-sync-"+key); }catch(e){}
  return syDb().then(function(db){ return new Promise(function(res){ var tx=db.transaction("kv","readwrite"); tx.objectStore("kv").delete(key); tx.oncomplete=function(){res();}; tx.onerror=function(){res();}; }); }).catch(function(){});
}
function sySave(now){
  clearTimeout(SY.saveT);
  var go=function(){ if(SY.uid) return syPut(SY.uid,{epoch:SY.epoch,known:SY.known,queue:SY.queue,revs:SY.revs,cursor:SY.cursor}); };
  if(now) return go()||Promise.resolve();
  SY.saveT=setTimeout(go,300);
}
function syNewEpoch(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
function syLocalSave(){ try{ localStorage.setItem(KEY,JSON.stringify(S)); }catch(e){} }

/* ---- start: called from onSignedIn. dataModel 1 = move off the blob first (S already holds the newest blob). ----
   Resolves true when per-record sync is running, false to stay on the old blob sync. */
function storeStart(user,dataModel){
  SY.uid=user.id; SY.on=false;
  return syGet(user.id).then(function(saved){
    if(dataModel===1) return syMigrate(user);
    if(saved&&saved.epoch&&saved.epoch===S._sync){
      SY.known=saved.known||{}; SY.queue=saved.queue||{}; SY.revs=saved.revs||{}; SY.cursor=+saved.cursor||0; SY.epoch=saved.epoch;
      SY.on=true; storeChanged(true);   /* anything changed here since the last diff */
      return syPush().then(function(){ return true; });
    }
    return syFresh();
  }).then(function(ok){
    if(ok) syLoop();
    return ok;
  },function(e){
    syLog("start",e); SY.on=false;
    /* already moved: the blob is read-only, so keep trying (offline on a new phone) */
    if(dataModel===2){ syFail(e); clearTimeout(SY.timer); SY.timer=setTimeout(function(){ if(sbUser&&sbUser.id===user.id&&!SY.on) storeStart(user,2); },30000); }
    return false;
  });
}
/* first sync on this phone: take the account's records. A brand-new account has none, so this phone's data goes up. */
function syFresh(){
  SY.known={}; SY.queue={}; SY.revs={}; SY.cursor=0; SY.epoch=syNewEpoch(); S._sync=SY.epoch;
  return syPullAll(0).then(function(got){
    SY.on=true;
    if(got.count){ GFDSync.applyRecords(S,SY.known); syLocalSave(); }
    storeChanged(true);
    return syPush().then(function(){ return true; });
  });
}
/* move this account off the blob: every record goes up once (insert only), then the account's records come back */
function syMigrate(user){
  var recs=GFDSync.toRecords(S,user.id), list=Object.keys(recs).map(function(k){var r=recs[k];return {t:r.t,id:r.id,op:"upsert",f:r.f};});
  return sb.rpc("migrate_from_blob",{records:list}).then(function(r){
    if(r.error){ syLog("migrate",r.error); return false; }
    return syFresh();
  });
}

/* ---- local change -> queue ---- */
function storeChanged(now){
  if(!SY.on) return;
  clearTimeout(SY.diffT);
  if(!now){ SY.diffT=setTimeout(function(){storeChanged(true);},500); return; }
  var next=GFDSync.toRecords(S,SY.uid), muts=GFDSync.diff(SY.known,next);
  if(!muts.length) return;
  muts.forEach(function(m){ GFDSync.enqueue(SY.queue,m); });
  SY.known=next; sbOk=false; sySave(); setStatus();
  sySchedule(800);
}
function sySchedule(ms){ clearTimeout(SY.timer); SY.timer=setTimeout(function(){ syPush().then(syPull); },ms); }

/* ---- push ---- */
function syPush(){
  if(!SY.on||!sb) return Promise.resolve();
  var keys=Object.keys(SY.queue);
  if(!keys.length){ syStatus(); return Promise.resolve(); }
  if(SY.busy){ SY.pullAgain=true; return Promise.resolve(); }
  SY.busy=true;
  var batch=keys.slice(0,200), sent={}, muts=batch.map(function(k){
    var q=SY.queue[k], m={t:q.t,id:q.id,op:q.op}; if(q.op!=="delete") m.f=q.f; if(SY.revs[k]) m.rev=SY.revs[k];
    sent[k]=GFDSync.canon(q); return m;
  });
  return sb.rpc("sync_push",{mutations:muts}).then(function(r){
    SY.busy=false;
    if(r.error) throw r.error;
    ((r.data&&r.data.results)||[]).forEach(function(x,i){
      var k=batch[i]; if(!k) return;
      if(x.status==="error") { SY.dropped.push({key:k,error:x.error,at:new Date().toISOString()}); syLog("refused "+k,x.error); }
      if(x.rev) SY.revs[k]=x.rev;
      if(SY.queue[k]&&GFDSync.canon(SY.queue[k])===sent[k]) delete SY.queue[k];   /* changed again while sending: keep it */
    });
    SY.fails=0; SY.err=""; sbOffline=false; sySave();
    if(Object.keys(SY.queue).length) return syPush();
    syStatus();
  }).catch(function(e){ SY.busy=false; syFail(e); });
}

/* ---- pull ---- */
function syPullAll(since){
  /* used at start: no queue yet, so rows go straight into known */
  var count=0;
  function page(c){
    return sb.rpc("sync_pull",{since:c}).then(function(r){
      if(r.error) throw r.error;
      var d=r.data||{};
      (d.rows||[]).forEach(function(x){ var rec=GFDSync.fromServer(x.t,x.r), k=x.t+":"+x.r.id; SY.revs[k]=x.r.rev; if(rec){SY.known[k]=rec;count++;} else delete SY.known[k]; });
      SY.cursor=+d.cursor||c;
      if(d.more&&(d.rows||[]).length) return page(SY.cursor);
    });
  }
  return page(since).then(function(){ sySave(); return {count:count}; });
}
function syBusyUi(){
  var a=document.activeElement, tag=a&&a.tagName;
  if(tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT") return true;
  return !!document.querySelector(".sheet:not([hidden]),.donepop:not([hidden])");
}
function syPull(){
  if(!SY.on||!sb||SY.busy) return Promise.resolve();
  SY.busy=true;
  var rows=[], cur=SY.cursor;
  function page(c){
    return sb.rpc("sync_pull",{since:c}).then(function(r){
      if(r.error) throw r.error;
      var d=r.data||{}; rows=rows.concat(d.rows||[]); cur=+d.cursor||c;
      if(d.more&&(d.rows||[]).length) return page(cur);
    });
  }
  return page(SY.cursor).then(function(){
    SY.busy=false;
    storeChanged(true);   /* fold in local edits first, so the overlay below sees them */
    var known=JSON.parse(JSON.stringify(SY.known)), revs={}, changed=false;
    rows.forEach(function(x){
      var k=x.t+":"+x.r.id, rec=GFDSync.fromServer(x.t,x.r), q=SY.queue[k];
      revs[k]=x.r.rev;
      if(!GFDSync.FIELDS[x.t]) return;
      if(q&&q.op==="delete") rec=null;
      else if(q){
        var base=rec?rec.f:((known[k]&&known[k].f)||{});
        rec={t:x.t,id:x.r.id,f:GFDSync.overlay(base,q.f)};
        if(x.r.deleted_at) q.f=JSON.parse(JSON.stringify(rec.f));   /* deleted elsewhere but edited here: send it all back */
      }
      var before=known[k]?GFDSync.canon(known[k].f):"", after=rec?GFDSync.canon(rec.f):"";
      if(before!==after) changed=true;
      if(rec) known[k]=rec; else delete known[k];
    });
    if(changed&&syBusyUi()){ setTimeout(syPull,10000); return; }   /* try again when the sheet is closed */
    Object.keys(revs).forEach(function(k){ SY.revs[k]=revs[k]; });
    SY.cursor=cur;
    if(changed){
      SY.known=known;
      GFDSync.applyRecords(S,SY.known); syLocalSave();
      storeChanged(true);
      if(typeof renderAll==="function"&&typeof DAYS!=="undefined"){ try{ renderAll(); }catch(e){ syLog("render",e); } }
    }
    SY.fails=0; SY.err=""; sbOffline=false; sySave(); syStatus();
    if(SY.pullAgain){ SY.pullAgain=false; return syPush().then(syPull); }
  }).catch(function(e){ SY.busy=false; syFail(e); });
}

/* ---- status, retries, timers ---- */
function syStatus(){ sbOk=SY.on&&!Object.keys(SY.queue).length&&!SY.err; setStatus(); }
function syFail(e){
  var msg=(e&&(e.message||e.details))||String(e||"");
  SY.err=msg; SY.fails++; syLog("sync",e);
  sbOffline=/fetch|network|offline/i.test(msg)||(typeof navigator!=="undefined"&&navigator.onLine===false);
  sbOk=false; setStatus();
  sySchedule(Math.min(300000,2000*Math.pow(2,Math.min(SY.fails,8))));
}
function syLog(what,e){ try{ console.warn("[sync] "+what,e&&(e.message||e)); }catch(x){} }
function syLoop(){
  clearInterval(SY.tick);
  SY.tick=setInterval(function(){ if(document.visibilityState==="visible") syPush().then(syPull); },60000);
  syPull();
}
document.addEventListener("visibilitychange",function(){
  if(!storeOn()) return;
  if(document.visibilityState==="hidden"){ storeChanged(true); sySave(true); syPush(); }
  else syPush().then(syPull);
});
window.addEventListener("online",function(){ if(storeOn()){ SY.fails=0; syPush().then(syPull); } });

/* sign-out: send what's waiting, then forget this account's sync state on this phone */
function storeFlush(){
  if(!SY.on) return Promise.resolve();
  storeChanged(true);
  return syPush().then(function(){ return sySave(true); });
}
function storeForget(){
  var uid=SY.uid; SY.on=false; clearInterval(SY.tick); clearTimeout(SY.timer); clearTimeout(SY.diffT); clearTimeout(SY.saveT);
  SY.known={}; SY.queue={}; SY.revs={}; SY.cursor=0;
  return uid?syDel(uid):Promise.resolve();
}
