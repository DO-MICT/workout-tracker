/* ---------- records and last time, rebuilt from history (F1) ----------
   Records and "last time" come from the saved sets (workout_sets in the database, cached on this phone for
   offline use) plus workouts still waiting to upload. Nothing is kept that only ever goes up, so fixing or
   deleting a workout in History fixes the record too. The maths is in rules.js (exerciseRecords). */
var RC_KEY="gfd-sets-v2";   /* v2 (F2): each set also carries its workout's plan and day */
var RC={uid:null,rows:null,loading:false};   /* rows: the database's sets, or null until loaded once */
var REC=null;                                  /* cached exerciseRecords() result; recDirty() clears it */
function rcPack(r){ return [r.workout_id,r.performed_at,r.exercise_id,r.set_no,r.measure,r.weight,r.reps,r.plan_id,r.day_id]; }
function rcUnpack(a){ return {workout_id:a[0],performed_at:a[1],exercise_id:a[2],set_no:a[3],measure:a[4],weight:a[5],reps:a[6],plan_id:a[7]||null,day_id:a[8]||null}; }
/* a row from the database (with its workout's plan and day nested under "workouts") or from a saved workout */
function rcRow(r){ var w=r.workouts||{}; return {workout_id:r.workout_id,performed_at:r.performed_at,exercise_id:r.exercise_id,set_no:r.set_no,measure:r.measure||"w",weight:r.weight==null?null:+r.weight,reps:r.reps==null?null:+r.reps,
  plan_id:r.plan_id||w.plan_id||null,day_id:r.day_id||w.day_id||null}; }
(function rcLoadLocal(){
  try{ localStorage.removeItem("gfd-sets-v1"); }catch(e){}
  try{ var o=JSON.parse(localStorage.getItem(RC_KEY)||"null"); if(o&&o.uid&&Array.isArray(o.rows)){ RC.uid=o.uid; RC.rows=o.rows.map(rcUnpack); } }catch(e){}
})();
function rcStore(){ if(!RC.rows) return; try{ localStorage.setItem(RC_KEY,JSON.stringify({uid:RC.uid,rows:RC.rows.map(rcPack)})); }catch(e){} }
function rcForget(){ RC.uid=null; RC.rows=null; REC=null; try{ localStorage.removeItem(RC_KEY); }catch(e){} }
function rcMine(){ var id=sbUser?sbUser.id:(S.account&&S.account.id); return !!(RC.rows&&id&&RC.uid===id); }
function recDirty(){ REC=null; }
/* history is known when the device log is the history (Claude), or the database's sets have loaded once */
function histKnown(){ return !WEB_MODE||rcMine(); }
function prResets(){ if(!S.prReset||typeof S.prReset!=="object") S.prReset={}; return S.prReset; }
function histAllRows(){ return WEB_MODE?GFDRules.historyRows(rcMine()?RC.rows:[],wout()):GFDRules.historyRows([],localWorkouts()); }
function recs(){
  if(REC) return REC;
  REC=GFDRules.exerciseRecords(histAllRows(),prResets());
  return REC;
}
/* when each saved workout was done (one date per workout), for milestones */
function workoutDates(){
  var seen={}, out=[];
  histAllRows().forEach(function(r){ if(r.workout_id&&!seen[r.workout_id]){ seen[r.workout_id]=1; out.push(r.performed_at); } });
  return out;
}
/* the planned reps of an exercise on a plan day ("8", "8–12"), for matching last time by rep target */
function planTarget(planId,dayId,exId){
  try{
    if(!S.plans||planId!==activePlan().id) return null;
    var d=(DAYS||[]).filter(function(x){ return x.id===dayId; })[0];
    var ex=d&&d.ex.filter(function(x){ return x.id===exId; })[0];
    return ex?ex.reps:null;
  }catch(e){ return null; }
}
/* last session of an exercise: {date, sets:[{w,r}], match} or null. With ex (an exercise of today's day),
   the last time that matches today: same plan day, then same rep target, then any (rules.js lastMatching).
   Until history has loaded on a new phone, fall back to the copy kept with the app data. */
function lastFor(exId,ex){
  var r=recs()[exId];
  if(r&&r.sessions&&r.sessions.length){
    if(!ex) return r.last;
    var d=DAYS&&DAYS[day], P=activePlan();
    return GFDRules.lastMatching(r,{plan:P&&P.id,day:d&&!d.coles?d.id:null,target:ex.reps,
      targetFor:function(p,dd){ return planTarget(p,dd,exId); }});
  }
  return histKnown()?null:(last()[exId]||null);
}
/* this exercise's records from history ({measure, bests, best...}, rules.js exerciseRecords), or null.
   Until history has loaded on a new phone, the copy of last time kept with the app data counts too. */
function bestFor(exId){
  var r=recs()[exId];
  if(!histKnown()){
    var L=last()[exId];
    if(L&&L.sets&&L.sets.length){
      var lab=(LIB[exId]&&LIB[exId].lab)||"w", rows=(r&&r.sessions||[]).reduce(function(a,s){ return a.concat(s.sets.map(function(x,i){ return {workout_id:s.id,performed_at:s.at,exercise_id:exId,set_no:i+1,measure:r.measure,weight:x.w===""?null:+x.w,reps:x.r===""?null:+x.r}; })); },[]);
      L.sets.forEach(function(x,i){ rows.push({workout_id:"local",performed_at:L.date||"",exercise_id:exId,set_no:i+1,measure:lab,weight:x.w===""?null:+x.w,reps:x.r===""?null:+x.r}); });
      r=GFDRules.exerciseRecords(rows,prResets())[exId]||r;
    }
  }
  return r||null;
}
/* load every saved set of this account (1000 per page). Runs after sign-in; later changes are applied
   locally as workouts upload, so this doesn't need repeating. */
function recFetch(){
  if(!WEB_MODE||!sb||!sbUser||RC.loading) return Promise.resolve();
  RC.loading=true;
  var uid=sbUser.id, all=[], page=1000;
  var step=function(from){
    return sb.from("workout_sets").select("workout_id,performed_at,exercise_id,set_no,measure,weight,reps,workouts(plan_id,day_id)")
      .order("performed_at",{ascending:false}).order("id",{ascending:true}).range(from,from+page-1).then(function(r){
        if(r&&r.error) throw r.error;
        var d=(r&&r.data)||[]; all=all.concat(d.map(rcRow));
        if(d.length===page&&all.length<100000) return step(from+page);
      });
  };
  return step(0).then(function(){
    if(!sbUser||sbUser.id!==uid) return;
    RC.uid=uid; RC.rows=all; rcStore(); recDirty(); recChanged();
  }).catch(function(){}).then(function(){ RC.loading=false; });
}
/* a workout reached the database (new or edited): swap its rows in the cache */
function rcApply(w){
  if(!rcMine()) return;
  RC.rows=RC.rows.filter(function(r){ return r.workout_id!==w.id; });
  (w.sets||[]).forEach(function(s){ RC.rows.push(rcRow({workout_id:w.id,performed_at:w.performed_at,exercise_id:s.exercise_id,set_no:s.set_no,measure:s.measure,weight:s.weight,reps:s.reps,plan_id:w.plan_id,day_id:w.day_id})); });
  rcStore(); recDirty();
}
function rcRemove(id){
  if(rcMine()){ RC.rows=RC.rows.filter(function(r){ return r.workout_id!==id; }); rcStore(); }
  recDirty();
}
/* history changed under the day view: refresh it, unless someone is typing in it */
function recChanged(){
  recDirty();
  var a=document.activeElement;
  if(a&&a.tagName==="INPUT"&&a.closest&&a.closest("#day")) return;
  if(typeof DAYS!=="undefined"&&DAYS&&DAYS[day]) renderDay();
}
/* start the record for one exercise again from today; history itself is kept */
function resetRecord(exId){ prResets()[exId]=new Date().toISOString(); save(); recChanged(); }
