/* ---------- workout history ----------
   Every "Complete workout" becomes a record: {id, performed_at, started_at, duration_sec, plan/day/location
   snapshots, sets:[{exercise_id, exercise_name, muscle_group, exercise_order, set_no, measure, weight, reps, done, group_tag}]}.
   The shape matches the Supabase tables workouts + workout_sets, so the native app can use them unchanged.
   Web: records wait in S.wout (outbox, synced with the rest of the app data) until save_workout() confirms them;
        the database is the source of truth after that. Ids are made on the device, so retries never duplicate.
   Claude: no database, so records are kept on the device in S.wlog. */
var HIST_LIMITS={plan_id:80,plan_name:80,day_id:20,day_title:80,location_id:80,location_name:80};
function uuid4(){
  if(window.crypto&&crypto.randomUUID) return crypto.randomUUID();
  var b=new Uint8Array(16); (window.crypto||{getRandomValues:function(a){for(var i=0;i<a.length;i++)a[i]=Math.random()*256|0;return a;}}).getRandomValues(b);
  b[6]=(b[6]&15)|64; b[8]=(b[8]&63)|128; return hexUuid(b);
}
function hexUuid(b){var h=Array.prototype.map.call(b,function(x){return (x+256).toString(16).slice(1);}).join("");return h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20);}
/* same text -> same id (used for the one-off import, so two phones importing the same data don't double up) */
function stableUuid(str){
  var b=new Uint8Array(16);
  for(var k=0;k<4;k++){var h=2166136261^(k*16777619);for(var i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}h^=h>>>13;h=Math.imul(h,1540483477);h^=h>>>15;
    b[k*4]=h>>>24&255;b[k*4+1]=h>>>16&255;b[k*4+2]=h>>>8&255;b[k*4+3]=h&255;}
  b[6]=(b[6]&15)|80; b[8]=(b[8]&63)|128; return hexUuid(b);
}
/* dp: decimals kept (2; weights 3, so pounds typed in the app come back exactly, WP4) */
function numOrNull(v,lo,hi,dp){ if(v===undefined||v===null||v==="") return null; var n=parseFloat(String(v).replace(",",".")); if(!isFinite(n)) return null; var f=Math.pow(10,dp||2); n=Math.round(n*f)/f; return Math.max(lo,Math.min(hi,n)); }
function clip(s,n){ return s==null?null:String(s).slice(0,n); }
function wout(){ if(!Array.isArray(S.wout)) S.wout=[]; return S.wout; }
function wlog(){ if(!Array.isArray(S.wlog)) S.wlog=[]; return S.wlog; }
function histSet(ex,k,i,s){
  return {exercise_id:clip(ex.id,80),exercise_name:clip(ex.n,120),muscle_group:clip(ex.mg||(LIB[ex.id]&&LIB[ex.id].mg)||"",40)||null,exercise_order:Math.min(k,199),set_no:Math.min(i+1,50),
    measure:ex.lab||"w",weight:numOrNull(s.w,-1000,5000,3),reps:numOrNull(s.r,0,100000),done:!!s.d,group_tag:/^[abc]$/.test(ex.ss||"")?ex.ss:null};
}
/* at: when it was done, for a workout logged later (F1.E4.S1); its start and length are then unknown */
function buildWorkout(d,at){
  var P=activePlan(), cs=d.coles?colesSession():null, lo=cs?(locById(cs.loc)||colesLoc()):dayLoc(P.id,d.id);
  var sets=[], first=0, now=Date.now();
  d.ex.forEach(function(ex,k){
    setsFor(ex).slice(0,nSets(ex)).forEach(function(s,i){
      if(!GFDRules.loggedSets([s]).length) return;
      if(s.at&&(!first||s.at<first)) first=s.at;
      sets.push(histSet(ex,k,i,s));
    });
  });
  if(!sets.length) return null;
  /* the Start workout tap (focus view) counts as the start, when it came before the first set */
  var fs=S.fstart; if(fs&&fs.day===d.id&&fs.who===(S.who||0)&&fs.at<now&&(!first||fs.at<first)) first=fs.at;
  var dur=first&&now>first?Math.round((now-first)/1000):null; if(dur!==null&&dur>86400) {dur=null;first=0;}
  if(at){ dur=null; first=0; }
  var w={id:uuid4(),performed_at:at||new Date(now).toISOString(),started_at:first?new Date(first).toISOString():null,duration_sec:dur,
    plan_id:P.id,plan_name:P.name,day_id:d.id,day_title:d.title,location_id:lo?lo.id:null,location_name:lo?lo.name:null,
    source:"app",app_version:APP_VERSION,who:S.who||0,sets:sets};
  Object.keys(HIST_LIMITS).forEach(function(f){w[f]=clip(w[f],HIST_LIMITS[f]);});
  return w;
}
function histVolume(w){return GFDRules.workoutVolume(w.sets);}
function recordWorkout(w){
  if(!w) return;
  if(WEB_MODE){ wout().push(w); histFlush(); }
  else { var L=wlog(); if(!L.some(function(x){return x.id===w.id;})) L.push(w); if(L.length>2000) L.splice(0,L.length-2000); }
  recDirty();
  if(H) H.dirty=true;
}

/* send waiting workouts to the database, oldest first. New ones go through save_workout, edits
   (op "update") through update_workout. One that the database turns down stays waiting and the rest carry on;
   a dropped connection stops the run until the next try. */
var histBusy=false;
function histFlush(){
  if(!WEB_MODE||!sb||!sbUser||histBusy||!wout().length) return Promise.resolve();
  histBusy=true;
  var queue=wout().slice();
  var step=function(){
    var w=queue.shift(); if(!w) return;
    if(wout().indexOf(w)<0) return step();
    var body=JSON.parse(JSON.stringify(w)), op=body.op; delete body.who; delete body.err; delete body.op;
    return sb.rpc(op==="update"?"update_workout":"save_workout",{w:body}).then(function(r){
      if(r&&r.error){
        w.err=(w.err||0)+1;
        if(!r.error.code) throw r.error;   /* no answer from the database: try again later */
        return step();
      }
      var k=wout().indexOf(w);
      if(k>=0) wout().splice(k,1);
      /* edited while it was uploading: the newer copy now has to replace the saved one */
      else wout().forEach(function(x){ if(x.id===w.id&&!x.op) x.op="update"; });
      rcApply(w);
      if(H){H.dirty=true;H.cache[w.id]=w;} save(); return step();
    });
  };
  return Promise.resolve(step()).catch(function(){histBusy=false;save();}).then(function(){histBusy=false; if(H&&H.dirty&&!H.ex&&!H.edit) histReload();});
}
window.addEventListener("online",function(){histFlush();});
document.addEventListener("visibilitychange",function(){ if(document.visibilityState==="visible") histFlush(); });

/* one-off: turn the "last time" entries saved before history existed into workouts (grouped by when they were saved) */
function histImport(){
  if(S.histImportV1) return;
  if(WEB_MODE&&!sbUser) return;
  var seed=WEB_MODE?sbUser.id:"local", days=buildDays(), P=activePlan();
  [0,1].forEach(function(who){
    var L=(S.last&&S.last[who])||{}, by={};
    if(!WEB_MODE&&who===1&&!Object.keys(L).length) return;
    if(WEB_MODE&&who!==0) return;
    Object.keys(L).forEach(function(id){var e=L[id]; if(e&&e.date&&e.sets&&e.sets.length&&LIB[id]) (by[e.date]=by[e.date]||[]).push(id);});
    Object.keys(by).forEach(function(date){
      var ids=by[date], best=null, bestN=0;
      days.forEach(function(d){var n=d.ex.filter(function(x){return ids.indexOf(x.id)>=0;}).length; if(n>bestN){bestN=n;best=d;}});
      var order=best?best.ex.map(function(x){return x.id;}):[];
      ids.sort(function(a,b){var ia=order.indexOf(a),ib=order.indexOf(b);return (ia<0?99:ia)-(ib<0?99:ib);});
      var sets=[];
      ids.forEach(function(id,k){var Lb=LIB[id]; L[id].sets.forEach(function(s,i){ if(s.w||s.r) sets.push(histSet({id:id,n:Lb.n,mg:Lb.mg,lab:Lb.lab},k,i,{w:s.w,r:s.r,d:true})); });});
      if(!sets.length) return;
      var t=new Date(date); if(isNaN(t)) return;
      var w={id:stableUuid("import|"+seed+"|"+who+"|"+date),performed_at:t.toISOString(),started_at:null,duration_sec:null,
        plan_id:best?clip(P.id,80):null,plan_name:best?clip(P.name,80):null,day_id:best?best.id:null,day_title:clip(best?best.title:"Workout",80),
        location_id:null,location_name:null,source:"import",app_version:APP_VERSION,who:who,sets:sets};
      if(WEB_MODE){ if(!wout().some(function(x){return x.id===w.id;})) wout().push(w); }
      else { var lg=wlog(); if(!lg.some(function(x){return x.id===w.id;})) lg.push(w); }
    });
  });
  wout().sort(function(a,b){return a.performed_at<b.performed_at?-1:1;});
  if(!WEB_MODE) wlog().sort(function(a,b){return a.performed_at<b.performed_at?-1:1;});
  S.histImportV1=1; save(); histFlush();
}
function histInit(){ try{ histImport(); }catch(e){} histFlush().then(recFetch); }

/* ---------- reading history (same calls whether it comes from the database or the device) ---------- */
var HIST_PAGE=20;
function localWorkouts(){ return wlog().filter(function(w){return (w.who||0)===(S.who||0);}); }
/* newest first; each row has .sets when known, .pending when not yet in the database */
function histFetch(offset){
  if(!WEB_MODE){ var all=localWorkouts().slice().reverse(); return Promise.resolve({rows:all.slice(offset,offset+HIST_PAGE),more:all.length>offset+HIST_PAGE}); }
  if(!sb||!sbUser) return Promise.resolve({rows:[],more:false,offline:true});
  return sb.from("workouts").select("id,performed_at,started_at,duration_sec,plan_id,plan_name,day_id,day_title,location_name,set_count,volume_kg,source")
    .order("performed_at",{ascending:false}).range(offset,offset+HIST_PAGE).then(function(r){
      if(r&&r.error) throw r.error;
      var rows=(r&&r.data)||[], more=rows.length>HIST_PAGE; return {rows:rows.slice(0,HIST_PAGE),more:more};
    });
}
function histSets(ids){
  if(!WEB_MODE||!ids.length) return Promise.resolve({});
  return sb.from("workout_sets").select("workout_id,exercise_id,exercise_name,muscle_group,exercise_order,set_no,measure,weight,reps,done,group_tag")
    .in("workout_id",ids).then(function(r){
      if(r&&r.error) throw r.error;
      var by={}; ((r&&r.data)||[]).forEach(function(s){(by[s.workout_id]=by[s.workout_id]||[]).push(s);});
      Object.keys(by).forEach(function(k){by[k].sort(function(a,b){return a.exercise_order-b.exercise_order||a.set_no-b.set_no;});});
      return by;
    });
}
/* every logged set of one exercise, newest first: [{workout_id, performed_at, set_no, measure, weight, reps}] */
function histExercise(exId){
  var mine=function(list){var out=[];list.forEach(function(w){w.sets.forEach(function(s){if(s.exercise_id===exId)out.push({workout_id:w.id,performed_at:w.performed_at,set_no:s.set_no,measure:s.measure,weight:s.weight,reps:s.reps,pending:WEB_MODE});});});return out;};
  var pend=WEB_MODE?mine(wout()):[], waiting={};
  wout().forEach(function(w){waiting[w.id]=1;});
  if(!WEB_MODE) return Promise.resolve(mine(localWorkouts()).sort(byNewest));
  if(!sb||!sbUser) return Promise.resolve(pend.sort(byNewest));
  return sb.from("workout_sets").select("workout_id,performed_at,set_no,measure,weight,reps").eq("exercise_id",exId)
    .order("performed_at",{ascending:false}).limit(600).then(function(r){
      if(r&&r.error) throw r.error;
      /* a workout edited on this phone and not uploaded yet: show the edited sets, not the saved ones */
      return pend.concat(((r&&r.data)||[]).filter(function(x){return !waiting[x.workout_id];})).sort(byNewest);
    });
}
function byNewest(a,b){return a.performed_at<b.performed_at?1:a.performed_at>b.performed_at?-1:(a.set_no||0)-(b.set_no||0);}
function histDelete(id){
  var q=wout().filter(function(w){return w.id===id;})[0];
  if(q&&q.op!=="update"){ S.wout=wout().filter(function(w){return w.id!==id;}); save(); recDirty(); return Promise.resolve(); }
  if(!WEB_MODE){ S.wlog=wlog().filter(function(w){return w.id!==id;}); save(); recDirty(); return Promise.resolve(); }
  /* saved in the database (maybe with an edit waiting): delete it there, then drop the waiting edit */
  return sb.from("workouts").delete().eq("id",id).then(function(r){
    if(r&&r.error) throw r.error;
    S.wout=wout().filter(function(w){return w.id!==id;}); save(); rcRemove(id);
  });
}
/* save changes made to a past workout. Not uploaded yet: change it in place. Saved in the database: queue
   an edit (op "update") that waits in the outbox like a new workout, so it works offline too.
   row.performed_at is when it happened (F1.E4.S1: it may have been moved); update_workout moves the sets with it. */
function histSaveEdit(row,sets){
  var id=row.id, q=wout().filter(function(w){return w.id===id;})[0], when={performed_at:row.performed_at,started_at:row.started_at||null};
  if(q){ var k=wout().indexOf(q); wout()[k]=Object.assign({},q,{sets:sets},when); }
  else if(!WEB_MODE){ var lw=wlog().filter(function(w){return w.id===id;})[0]; if(lw){ lw.sets=sets; Object.assign(lw,when); wlog().sort(function(a,b){return a.performed_at<b.performed_at?-1:1;}); } }
  else wout().push({op:"update",id:id,performed_at:row.performed_at,started_at:row.started_at||null,duration_sec:row.duration_sec||null,
    plan_id:row.plan_id||null,plan_name:row.plan_name||null,day_id:row.day_id||null,day_title:row.day_title||null,location_name:row.location_name||null,
    source:row.source||"app",who:S.who||0,sets:sets});
  save(); recDirty(); histFlush();
}

/* ---------- formatting ---------- */
function fmtNum(n){ if(n==null) return ""; var r=Math.round(n*100)/100; return String(r); }
function fmtSet(s){
  var m=s.measure||"w", w=s.weight, r=s.reps;
  if(m==="w") return (w!=null?fmtW(w):"")+(w!=null&&r!=null?" × ":"")+(r!=null?fmtNum(r)+(w==null?" reps":""):"");
  if(m==="bw") return (w?(w>0?"+":"")+fmtW(w)+" × ":"")+(r!=null?fmtNum(r)+" reps":"");
  if(m==="cardio") return [w!=null?fmtNum(w)+" km":"",r!=null?fmtNum(r)+" min":""].filter(Boolean).join(" · ");
  if(m==="time") return r!=null?fmtNum(r)+" min":"";
  if(m==="hold") return r!=null?fmtNum(r)+" sec":"";
  return r!=null?fmtNum(r)+" reps":"";
}
/* a total in kg (volume lifted), whole numbers, in the chosen unit: "12 450 kg", "27 448 lb" */
function fmtKg(v){ v=Math.round(GFDRules.fromKg(+v||0,U(),0)||0); return v.toLocaleString("en-ZA").replace(/,/g," ")+" "+U(); }
function fmtDur(s){ if(!s) return ""; var m=Math.round(s/60); return m<60?m+" min":Math.floor(m/60)+" h "+String(m%60).padStart(2,"0")+" min"; }
function hDate(iso,opts){ var d=new Date(iso); return isNaN(d)?"":d.toLocaleDateString(undefined,opts||{weekday:"short",day:"numeric",month:"short"}); }
/* what the progress chart tracks for each kind of exercise */
function metricOf(measure){
  return {w:["Top weight","kg","weight"],bw:["Most reps","reps","reps"],cardio:["Distance","km","weight"],time:["Longest","min","reps"],hold:["Longest hold","sec","reps"],count:["Most reps","reps","reps"]}[measure||"w"]||["Top weight","kg","weight"];
}

/* ---------- History page: past workouts, and progress per exercise ---------- */
var H=null; /* {rows, more, loading, err, sets:{id:[...]}, open:{id:true}, del:id, ex:exId|null, exRows, back:bool, cache:{}, dirty} */
function openHistory(exId){
  H={rows:null,more:false,loading:false,err:"",sets:{},open:{},del:null,ex:exId||null,exRows:null,fromEx:!!exId,cache:{},dirty:false};
  var sh=document.getElementById("history"); sh.hidden=false; document.body.style.overflow="hidden";
  renderHistory(); sh.scrollTop=0; sh.focus();
  if(exId) histLoadEx(exId); else { histReload(); statsLoad(); }
  histFlush();
}
function closeHistory(){
  var sh=document.getElementById("history"); if(!sh||sh.hidden) return;
  sh.hidden=true; sh.innerHTML=""; document.body.style.overflow=""; H=null;
}
function histReload(){ if(!H) return; H.rows=null; H.more=false; H.err=""; H.dirty=false; histMore(); }
function histMore(){
  if(!H||H.loading) return; H.loading=true; renderHistory(true);
  var off=H.rows?H.rows.length:0;
  histFetch(off).then(function(res){
    if(!H) return; H.loading=false;
    H.rows=(H.rows||[]).concat(res.rows); H.more=res.more; if(res.offline) H.err="Sign in to see workouts saved to your account.";
    if(!WEB_MODE) res.rows.forEach(function(w){H.sets[w.id]=w.sets;});
    renderHistory(true);
    if(H.loadAll&&H.more) setTimeout(histMore,0); else if(H) H.loadAll=false;
  }).catch(function(){ if(!H) return; H.loading=false; H.rows=H.rows||[]; H.err="Couldn’t load your history. Check your connection and try again."; renderHistory(true); });
}
function histLoadEx(exId){
  H.ex=exId; H.exRows=null; renderHistory(); document.getElementById("history").scrollTop=0;
  histExercise(exId).then(function(rows){ if(!H||H.ex!==exId) return; H.exRows=rows; renderHistory(true); })
    .catch(function(){ if(!H) return; H.exRows=[]; H.err="Couldn’t load this exercise’s history. Check your connection."; renderHistory(true); });
}
function histOpenSets(id){
  if(H.sets[id]) return;
  var p=wout().filter(function(w){return w.id===id;})[0]||H.cache[id];
  if(p){H.sets[id]=p.sets;return;}
  histSets([id]).then(function(by){ if(!H) return; H.sets[id]=by[id]||[]; renderHistory(true); })
    .catch(function(){ if(!H) return; H.sets[id]=null; toast("Couldn’t load that workout. Check your connection"); renderHistory(true); });
}
function histRows(){
  /* waiting-to-sync workouts first (web), then what the database or device returned */
  var shown=function(w){return Object.assign({},w,{pending:true,set_count:w.sets.length,volume_kg:histVolume(w)});};
  var pend=WEB_MODE?wout().filter(function(w){return w.op!=="update";}).reverse().map(shown):[];
  var edits={}; if(WEB_MODE) wout().forEach(function(w){ if(w.op==="update") edits[w.id]=w; });
  var seen={}; pend.forEach(function(w){seen[w.id]=1;});
  return pend.concat((H.rows||[]).filter(function(w){return !seen[w.id];}).map(function(w){
    if(edits[w.id]) return Object.assign({},w,{pending:true,edited:true,performed_at:edits[w.id].performed_at||w.performed_at,started_at:edits[w.id].performed_at?edits[w.id].started_at:w.started_at,
      set_count:edits[w.id].sets.length,volume_kg:histVolume(edits[w.id])});
    if(!WEB_MODE) return Object.assign({},w,{set_count:w.sets.length,volume_kg:histVolume(w)}); return w;
  })).sort(function(a,b){return a.performed_at<b.performed_at?1:a.performed_at>b.performed_at?-1:0;});
}
function histExerciseList(sets){
  var out=[], cur=null;
  (sets||[]).forEach(function(s){ if(!cur||cur.order!==s.exercise_order){cur={order:s.exercise_order,id:s.exercise_id,name:s.exercise_name,tag:s.group_tag,sets:[]};out.push(cur);} cur.sets.push(s); });
  return out;
}
function renderHistory(keepScroll){
  var sh=document.getElementById("history"); if(!sh||!H) return;
  var st=sh.scrollTop, h='<div class="sheet-in">';
  if(H.ex) h+=histExHtml();
  else {
    h+='<div class="sheet-top"><h2 id="htitle">Your progress</h2>'+statsStreakChip()+'</div>';
    h+='<div class="stdash">'+statsHtml()+'</div>';
    var rows=histRows(), np=WEB_MODE?wout().length:0;
    var wideT=isWide();
    h+='<h3 class="stsec">Workouts</h3><p class="sub">'+(wideT?'Filter, open a workout to see its sets, or tick several to delete them together.':'Tap a workout to see the sets, or an exercise to see your progress.')+'</p>';
    if(np) h+='<p class="hpend" role="status">'+np+' workout'+(np>1?'s':'')+' waiting to sync. '+(sbUser?'It’ll upload when you’re online.':'Sign in to upload.')+'</p>';
    if(H.err) h+='<p class="wzerr" role="alert">'+esc(H.err)+'</p>';
    if(H.rows===null&&!rows.length) h+='<p class="eqempty">Loading…</p>';
    else if(!rows.length) h+='<div class="hempty"><b>No workouts yet</b><p>Log your sets and tap <b>Complete workout</b>. It’ll show up here with the date, sets and weights.</p></div>';
    var month="";
    if(wideT&&rows.length){ h+=histTableHtml(rows); rows=[]; }
    rows.forEach(function(w){
      var m=hDate(w.performed_at,{month:"long",year:"numeric"});
      if(m!==month){month=m;h+='<h3 class="psec hmonth">'+esc(m)+'</h3>';}
      var meta=[w.plan_name,w.location_name,(w.set_count||0)+' set'+(w.set_count===1?'':'s'),+w.volume_kg>0?fmtKg(w.volume_kg):"",fmtDur(w.duration_sec)].filter(Boolean).join(" · ");
      var open=!!H.open[w.id];
      h+='<details class="hcard" data-hw="'+esc(w.id)+'"'+(open?' open':'')+'><summary><div class="hdate"><b>'+esc(hDate(w.performed_at,{day:"numeric"}))+'</b><span>'+esc(hDate(w.performed_at,{weekday:"short"}))+'</span></div>'+
        '<div class="hmain"><b>'+esc(w.day_title||"Workout")+'</b><span>'+esc(meta)+'</span>'+(w.pending?'<em class="htag">'+(w.edited?'Edit waiting to sync':'Waiting to sync')+'</em>':'')+(w.source==="import"?'<em class="htag imp">From before history</em>':'')+'</div>'+DAY_CHEV+'</summary>';
      if(open) h+=histBodyHtml(w);
      h+='</details>';
    });
    if(H.more) h+='<button class="ghost hmore" id="histMore"'+(H.loading?' disabled':'')+'>'+(H.loading?'Loading…':'Show older workouts')+'</button>';
  }
  sh.innerHTML=h+'</div>'; if(keepScroll) sh.scrollTop=st;
}
/* the sets of one open workout, with edit and delete (the phone list and the big-screen table share it) */
function histBodyHtml(w){
  var h='';
  var sets=H.sets[w.id];
  if(sets===undefined) h+='<p class="eqempty">Loading…</p>';
  else if(sets===null) h+='<p class="eqempty">Couldn’t load the sets.</p>';
  else if(H.edit&&H.edit.id===w.id) h+=histEditHtml();
  else {
    h+='<ol class="hex">'+histExerciseList(sets).map(function(e){
      return '<li'+(e.tag?' class="g"':'')+'><button class="linkbtn hexname" data-hex="'+esc(e.id)+'">'+esc(e.name)+'</button><span>'+e.sets.map(function(s){return esc(fmtSet(s)||"–");}).join(", ")+'</span></li>';
    }).join("")+'</ol>';
    if(w.started_at) h+='<p class="hsmall">Started '+esc(new Date(w.started_at).toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"}))+', finished '+esc(new Date(w.performed_at).toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"}))+'</p>';
  }
  if(H.edit&&H.edit.id===w.id){}
  else if(H.del===w.id) h+='<div class="hdel"><span>Delete this workout? Your records and last time will update to match.</span><button class="ghost" data-hdelno="1">Keep</button><button class="primary danger" data-hdelyes="'+esc(w.id)+'">Delete</button></div>';
  else h+='<div class="hacts">'+(sets&&sets.length?'<button class="chip" data-hedit="'+esc(w.id)+'">Edit workout</button>':'')+'<button class="linkbtn hdelbtn" data-hdel="'+esc(w.id)+'">Delete workout</button></div>';
  return h;
}
/* ---------- edit a past workout (F1) ---------- */
function histEditStart(id){
  var row=histRows().filter(function(w){return w.id===id;})[0], sets=H.sets[id]; if(!row||!sets) return;
  H.del=null;
  H.edit={id:id,row:row,err:"",when:GFDRules.whenParts(row.performed_at),ex:histExerciseList(sets).map(function(e){
    var s0=e.sets[0]||{};
    return {id:e.id,name:e.name,mg:s0.muscle_group||null,measure:s0.measure||"w",tag:e.tag||null,order:e.order,
      /* weights are edited in the chosen unit and turned back into kg on save */
      sets:e.sets.map(function(s){return {w:s.weight==null?"":(isKgLab(LABS[s0.measure||"w"])?GFDRules.boxShow(+s.weight,U()):fmtNum(+s.weight)),r:s.reps==null?"":fmtNum(+s.reps),done:s.done!==false};})};
  })};
}
function histEditHtml(){
  var E=H.edit, h='<div class="hedit"><p class="sub">Change any number, add a set or remove one. Records and last time update to match.</p>';
  /* F1.E4.S1: when it happened, in case it was logged late or on the wrong day */
  h+='<fieldset class="hwhen"><legend>When you did it</legend><label><span>Date</span><input type="date" data-hedwhen="date" value="'+esc(E.when.date)+'" max="'+esc(GFDRules.whenParts(new Date().toISOString()).date)+'" min="2000-01-01"></label>'+
    '<label><span>Finished at</span><input type="time" data-hedwhen="time" value="'+esc(E.when.time)+'"></label></fieldset>';
  E.ex.forEach(function(e,k){
    var lb0=LABS[e.measure]||LABS.w, lb=[GFDRules.unitLabel(lb0[0],U()),lb0[1]];
    h+='<div class="hedex numgrp"><b>'+esc(e.name)+'</b>';
    if(e.sets.length) h+='<div class="setrow hedrow" aria-hidden="true"><span></span><span class="lbl">'+esc(lb[0])+'</span><span class="lbl">'+esc(lb[1])+'</span><span></span></div>';
    e.sets.forEach(function(s,j){
      h+='<div class="setrow hedrow"><span class="n">'+(j+1)+'</span>'+
        (lb[0]?'<input'+numFor(lb[0])+' aria-label="'+esc(e.name)+' set '+(j+1)+' '+esc(lb[0])+'" data-hed="'+k+'|'+j+'|w" value="'+esc(s.w)+'" placeholder="'+esc(lb[0])+'">':'<span></span>')+
        '<input'+numFor(lb[1])+' aria-label="'+esc(e.name)+' set '+(j+1)+' '+esc(lb[1])+'" data-hed="'+k+'|'+j+'|r" value="'+esc(s.r)+'" placeholder="'+esc(lb[1])+'">'+
        '<button class="setdel hsetdel" data-hedel="'+k+'|'+j+'" aria-label="Remove '+esc(e.name)+' set '+(j+1)+'">'+DEL_SVG+'</button></div>';
    });
    if(!e.sets.length) h+='<p class="hsmall">No sets: this exercise will be removed.</p>';
    h+='<button class="linkbtn headd" data-headd="'+k+'">+ Add set</button></div>';
  });
  if(E.err) h+='<p class="wzerr" role="alert">'+esc(E.err)+'</p>';
  h+='<div class="hdel"><button class="ghost" data-hedcancel="1">Cancel</button><button class="primary" data-hedsave="1">Save changes</button></div></div>';
  return h;
}
function historyInput(el){
  if(H&&H.edit&&el.dataset&&el.dataset.hedwhen){ H.edit.when[el.dataset.hedwhen]=el.value; return true; }
  if(!H||!H.edit||!el.dataset||!el.dataset.hed) return false;
  var p=el.dataset.hed.split("|"), s=H.edit.ex[+p[0]].sets[+p[1]];
  s[p[2]]=el.value.replace(",",".").slice(0,7);
  return true;
}
function histEditSave(){
  var E=H.edit, sets=[];
  E.ex.forEach(function(e){
    var n=0;
    e.sets.forEach(function(s){
      if(!(s.w||s.r)) return;
      n++;
      sets.push({exercise_id:e.id,exercise_name:e.name,muscle_group:e.mg,exercise_order:e.order,set_no:Math.min(n,50),
        measure:e.measure,weight:numOrNull(isKgLab(LABS[e.measure]||LABS.w)?GFDRules.boxSave(s.w,U()):s.w,-1000,5000,3),reps:numOrNull(s.r,0,100000),done:s.done,group_tag:e.tag});
    });
  });
  if(!sets.length){ E.err="Every set is empty. To remove the whole workout, use Delete workout instead."; renderHistory(true); return; }
  /* the date and time: only a real change moves it (the boxes have no seconds) */
  var wh=GFDRules.whenFromParts(E.when.date,E.when.time), row=E.row, moved=false;
  if(wh.err){ E.err=wh.err; renderHistory(true); var wi=document.querySelector("[data-hedwhen]"); if(wi) wi.focus(); return; }
  var was=GFDRules.whenParts(row.performed_at);
  if(was.date!==E.when.date||was.time!==E.when.time){
    moved=true;
    row=Object.assign({},row,{performed_at:wh.at,started_at:GFDRules.shiftStart(row.started_at,row.performed_at,wh.at)});
    (H.rows||[]).forEach(function(r){ if(r.id===E.id){ r.performed_at=row.performed_at; r.started_at=row.started_at; } });
  }
  histSaveEdit(row,sets);
  H.sets[E.id]=sets; H.cache[E.id]=Object.assign({},row,{sets:sets}); H.edit=null;
  renderHistory(true); statsLoad(); recChanged(); toast(moved?"Workout moved to "+hDate(row.performed_at,{weekday:"short",day:"numeric",month:"short"}):"Workout updated");
}
/* progress for one exercise: chart of the best set per workout + every session */
function histExHtml(){
  var L=LIB[H.ex]||{n:H.ex,lab:"w"}, rows=H.exRows;
  var h='<div class="sheet-top"><h2 id="htitle">'+esc(L.n)+'</h2>'+(H.fromEx?'<button class="chip" id="closeHistory">Close</button>':'<button class="chip" id="histBack">Back</button>')+'</div>';
  if(H.err) h+='<p class="wzerr" role="alert">'+esc(H.err)+'</p>';
  if(rows===null) return h+'<p class="eqempty">Loading…</p>';
  if(!rows.length) return h+'<div class="hempty"><b>Nothing logged yet</b><p>Once you complete a workout with '+esc(L.n)+', your sets and progress show here.</p></div>';
  var measure=rows[0].measure||L.lab||"w", m=metricOf(measure);
  if(measure==="bw"&&rows.some(function(r){return r.weight>0;})) m=["Top added weight","kg","weight"];
  /* weights are kept in kg: the tiles and chart show the chosen unit */
  var conv=m[1]==="kg"?function(v){return GFDRules.fromKg(v,U(),U()==="lb"?1:2);}:function(v){return v;};
  m=[m[0],GFDRules.showUnit(m[1],U()),m[2]];
  var by={}, order=[];
  rows.forEach(function(r){ if(!by[r.workout_id]){by[r.workout_id]={at:r.performed_at,sets:[],pending:r.pending};order.push(r.workout_id);} by[r.workout_id].sets.push(r); });
  var sessions=order.map(function(id){var s=by[id]; s.sets.sort(function(a,b){return a.set_no-b.set_no;}); var v=null; s.sets.forEach(function(x){var n=x[m[2]]; if(n!=null&&GFDRules.setCounts(measure,{w:x.weight,r:x.reps})&&(v===null||n>v)) v=+n;}); s.best=v===null?null:conv(v); return s;});
  var vals=sessions.filter(function(s){return s.best!=null;}), top=null, reset=prResets()[H.ex];
  /* the record counts from the reset date, if there is one; the chart and list keep everything */
  vals.forEach(function(s){ if((!reset||s.at>reset)&&(!top||s.best>top.best)) top=s; });
  var first=vals.length?vals[vals.length-1]:null, lastS=vals.length?vals[0]:null;
  var recsH=histRecsHtml(measure,rows,reset);
  /* the personal bests below already show the top number, so the first tile is only for exercises without one */
  h+='<div class="hstats">'+(recsH?'':'<div><span>'+esc(reset?m[0]+' since reset':m[0])+'</span><b>'+(top?fmtNum(top.best)+' '+m[1]:'–')+'</b>'+(top?'<em>'+esc(hDate(top.at,{day:"numeric",month:"short"}))+'</em>':'')+'</div>')+
    '<div><span>Workouts</span><b>'+sessions.length+'</b><em>since '+esc(hDate(sessions[sessions.length-1].at,{day:"numeric",month:"short"}))+'</em></div>'+
    (first&&lastS&&vals.length>1?'<div><span>Change</span><b>'+((lastS.best-first.best)>=0?'+':'')+fmtNum(lastS.best-first.best)+' '+m[1]+'</b><em>first to latest</em></div>':'')+'</div>';
  h+=recsH;
  if(vals.length>1) h+=histChart(vals.slice(0,24).reverse(),m);
  h+='<p class="hsmall hreset">'+(reset?'Record reset on '+esc(hDate(reset,{day:"numeric",month:"short",year:"numeric"}))+'. ':'')+
    '<button class="linkbtn" data-prreset="'+esc(H.ex)+'">Reset record</button> Start your record fresh, for example after a long break or injury. Your history stays.</p>';
  h+='<h3 class="psec">Every workout</h3><ul class="hsess">'+sessions.map(function(s){
    return '<li><div><b>'+esc(hDate(s.at))+'</b>'+(s.pending?'<em class="htag">Waiting to sync</em>':'')+'</div><span>'+s.sets.map(function(x){return esc(fmtSet(x)||"–");}).join(", ")+'</span></li>';
  }).join("")+'</ul>';
  return h;
}
/* personal bests for this exercise, in its own units (rules.js recordList) */
function histRecsHtml(measure,rows,reset){
  var resets={}; if(reset) resets[H.ex]=reset;
  var rec=GFDRules.exerciseRecords(rows.map(function(r){return {workout_id:r.workout_id,performed_at:r.performed_at,exercise_id:H.ex,set_no:r.set_no,measure:r.measure||measure,weight:r.weight==null?null:+r.weight,reps:r.reps==null?null:+r.reps};}),resets)[H.ex];
  var list=rec?GFDRules.recordList(rec.measure,rec.bests,U()):[];
  if(!list.length) return '';
  return '<h3 class="psec">Personal bests'+(reset?' since reset':'')+'</h3><ul class="hrecs">'+list.map(function(o){
    return '<li><span>'+esc(o.label)+'</span><b>'+esc(o.text)+'</b><em>'+esc([o.set,o.at?hDate(o.at,{day:"numeric",month:"short"}):""].filter(Boolean).join(" · "))+'</em></li>';
  }).join("")+'</ul>';
}
function histChart(pts,m){
  var W=320,Hh=150,pl=38,pr=12,pt=14,pb=24, vs=pts.map(function(p){return p.best;});
  var lo=Math.min.apply(null,vs), hi=Math.max.apply(null,vs); if(hi===lo){hi+=1;lo=Math.max(0,lo-1);}
  /* round the axis to friendly steps (1, 2, 2.5, 5 x 10^n) */
  var raw=(hi-lo)/3, mag=Math.pow(10,Math.floor(Math.log10(raw))), step=[1,2,2.5,5,10].map(function(k){return k*mag;}).filter(function(v){return v>=raw;})[0];
  lo=Math.floor(lo/step)*step; hi=Math.ceil(hi/step)*step; if(lo<0&&Math.min.apply(null,vs)>=0) lo=0;
  var x=function(i){return pl+(pts.length<2?0:i*(W-pl-pr)/(pts.length-1));}, y=function(v){return pt+(hi-v)*(Hh-pt-pb)/(hi-lo);};
  var line=pts.map(function(p,i){return (i?"L":"M")+x(i).toFixed(1)+" "+y(p.best).toFixed(1);}).join(" ");
  var ticks=[]; for(var tv=lo;tv<=hi+step/2;tv+=step) ticks.push(Math.round(tv*100)/100);
  var label=m[0]+" per workout, "+pts.length+" workouts, from "+fmtNum(pts[0].best)+" to "+fmtNum(pts[pts.length-1].best)+" "+m[1];
  return '<figure class="hchart"><figcaption>'+esc(m[0])+' per workout ('+esc(m[1])+')</figcaption><svg viewBox="0 0 '+W+' '+Hh+'" role="img" aria-label="'+esc(label)+'">'+
    ticks.map(function(v){return '<line x1="'+pl+'" x2="'+(W-pr)+'" y1="'+y(v).toFixed(1)+'" y2="'+y(v).toFixed(1)+'" class="hgrid"/><text x="'+(pl-6)+'" y="'+(y(v)+4).toFixed(1)+'" text-anchor="end" class="hax">'+fmtNum(v)+'</text>';}).join("")+
    '<path d="'+line+'" class="hline"/>'+pts.map(function(p,i){return '<circle cx="'+x(i).toFixed(1)+'" cy="'+y(p.best).toFixed(1)+'" r="'+(i===pts.length-1?4.5:3)+'" class="hdot"><title>'+esc(hDate(p.at,{day:"numeric",month:"short"})+": "+fmtNum(p.best)+" "+m[1])+'</title></circle>';}).join("")+
    '<text x="'+pl+'" y="'+(Hh-6)+'" class="hax">'+esc(hDate(pts[0].at,{day:"numeric",month:"short"}))+'</text><text x="'+(W-pr)+'" y="'+(Hh-6)+'" text-anchor="end" class="hax">'+esc(hDate(pts[pts.length-1].at,{day:"numeric",month:"short"}))+'</text></svg></figure>';
}
function historyClick(t){
  if(t.dataset.hex&&!H){ openHistory(t.dataset.hex); return true; }
  if(!H) return false;
  if(t.id==="closeHistory"){closeHistory();return true;}
  if(t.id==="histBack"){H.ex=null;H.exRows=null;H.err="";renderHistory();var y=H.backY||0;document.getElementById("history").scrollTop=y;if(H.dirty)histReload();return true;}
  if(t.id==="histMore"){histMore();return true;}
  if(t.dataset.hex){H.backY=document.getElementById("history").scrollTop;H.fromEx=false;histLoadEx(t.dataset.hex);var b=document.getElementById("histBack");if(b)b.focus();return true;}
  if(t.dataset.hedit){histEditStart(t.dataset.hedit);renderHistory(true);var f=document.querySelector("[data-hed]");if(f)f.focus();return true;}
  if(t.dataset.hedcancel){var ide=H.edit&&H.edit.id;H.edit=null;renderHistory(true);var eb=document.querySelector('[data-hedit="'+ide+'"]');if(eb)eb.focus();return true;}
  if(t.dataset.hedsave){histEditSave();return true;}
  if(t.dataset.headd!==undefined&&H.edit){var ex=H.edit.ex[+t.dataset.headd], ls=ex.sets[ex.sets.length-1]; ex.sets.push(ls?{w:ls.w,r:ls.r,done:true}:{w:"",r:"",done:true}); renderHistory(true); var ins=document.querySelectorAll('[data-hed^="'+t.dataset.headd+'|'+(ex.sets.length-1)+'|"]'); if(ins.length) ins[0].focus(); return true;}
  if(t.dataset.hedel&&H.edit){var pq=t.dataset.hedel.split("|"); H.edit.ex[+pq[0]].sets.splice(+pq[1],1); renderHistory(true); var ab=document.querySelector('[data-headd="'+pq[0]+'"]'); if(ab) ab.focus(); return true;}
  if(t.dataset.prreset){
    if(!confirmTap(t,"Reset record","Tap again to reset")) return true;
    resetRecord(t.dataset.prreset); renderHistory(true); toast("Record reset. Your history is kept."); return true;
  }
  if(t.dataset.hdel){H.del=t.dataset.hdel;renderHistory(true);var y2=document.querySelector("[data-hdelyes]");if(y2)y2.focus();return true;}
  if(t.dataset.hdelno){var id0=H.del;H.del=null;renderHistory(true);var d0=document.querySelector('[data-hdel="'+id0+'"]');if(d0)d0.focus();return true;}
  if(t.dataset.hdelyes){
    var id=t.dataset.hdelyes; t.disabled=true;
    histDelete(id).then(function(){ recChanged(); if(!H) return; H.rows=(H.rows||[]).filter(function(w){return w.id!==id;}); H.del=null; delete H.open[id]; renderHistory(true); statsLoad(); toast("Workout deleted"); })
      .catch(function(){ if(!H) return; t.disabled=false; toast("Couldn’t delete. Check your connection"); });
    return true;
  }
  return false;
}
/* open a workout: remember it, load its sets */
document.addEventListener("toggle",function(e){
  var d=e.target; if(!H||!d.dataset||!d.dataset.hw) return;
  var id=d.dataset.hw, was=!!H.open[id];
  if(d.open===was) return;
  if(d.open){H.open[id]=true;histOpenSets(id);} else {delete H.open[id]; if(H.del===id) H.del=null; if(H.edit&&H.edit.id===id) H.edit=null;}
  var hadFocus=document.activeElement&&d.contains(document.activeElement);
  renderHistory(true);
  if(hadFocus){var sm=document.querySelector('[data-hw="'+id+'"] > summary'); if(sm) sm.focus({preventScroll:true});}
},true);

