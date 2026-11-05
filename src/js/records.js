/* ---------- records and last time, rebuilt from history (F1) ----------
   Records and "last time" come from the saved sets (workout_sets in the database, cached on this phone for
   offline use) plus workouts still waiting to upload. Nothing is kept that only ever goes up, so fixing or
   deleting a workout in History fixes the record too. The maths is in rules.js (exerciseRecords). */
var RC_KEY="gfd-sets-v1";
var RC={uid:null,rows:null,loading:false};   /* rows: the database's sets, or null until loaded once */
var REC=null;                                  /* cached exerciseRecords() result; recDirty() clears it */
function rcPack(r){ return [r.workout_id,r.performed_at,r.exercise_id,r.set_no,r.measure,r.weight,r.reps]; }
function rcUnpack(a){ return {workout_id:a[0],performed_at:a[1],exercise_id:a[2],set_no:a[3],measure:a[4],weight:a[5],reps:a[6]}; }
function rcRow(r){ return {workout_id:r.workout_id,performed_at:r.performed_at,exercise_id:r.exercise_id,set_no:r.set_no,measure:r.measure||"w",weight:r.weight==null?null:+r.weight,reps:r.reps==null?null:+r.reps}; }
(function rcLoadLocal(){
  try{ var o=JSON.parse(localStorage.getItem(RC_KEY)||"null"); if(o&&o.uid&&Array.isArray(o.rows)){ RC.uid=o.uid; RC.rows=o.rows.map(rcUnpack); } }catch(e){}
})();
function rcStore(){ if(!RC.rows) return; try{ localStorage.setItem(RC_KEY,JSON.stringify({uid:RC.uid,rows:RC.rows.map(rcPack)})); }catch(e){} }
function rcForget(){ RC.uid=null; RC.rows=null; REC=null; try{ localStorage.removeItem(RC_KEY); }catch(e){} }
function rcMine(){ var id=sbUser?sbUser.id:(S.account&&S.account.id); return !!(RC.rows&&id&&RC.uid===id); }
function recDirty(){ REC=null; }
/* history is known when the device log is the history (Claude), or the database's sets have loaded once */
function histKnown(){ return !WEB_MODE||rcMine(); }
function prResets(){ if(!S.prReset||typeof S.prReset!=="object") S.prReset={}; return S.prReset; }
function recs(){
  if(REC) return REC;
  var rows=WEB_MODE?GFDRules.historyRows(rcMine()?RC.rows:[],wout()):GFDRules.historyRows([],localWorkouts());
  REC=GFDRules.exerciseRecords(rows,prResets());
  return REC;
}
/* last session of an exercise: {date, sets:[{w,r}]} or null. Until history has loaded on a new phone,
   fall back to the copy kept with the app data. */
function lastFor(exId){
  var r=recs()[exId]; if(r&&r.last) return r.last;
  return histKnown()?null:(last()[exId]||null);
}
/* the record (heaviest weight) from history; 0 when there isn't one */
function bestFor(exId){
  var r=recs()[exId], b=r?r.best:0;
  if(!histKnown()){ var L=last()[exId]; b=Math.max(b,GFDRules.topWeight(L&&L.sets)); }
  return b;
}
/* load every saved set of this account (1000 per page). Runs after sign-in; later changes are applied
   locally as workouts upload, so this doesn't need repeating. */
function recFetch(){
  if(!WEB_MODE||!sb||!sbUser||RC.loading) return Promise.resolve();
  RC.loading=true;
  var uid=sbUser.id, all=[], page=1000;
  var step=function(from){
    return sb.from("workout_sets").select("workout_id,performed_at,exercise_id,set_no,measure,weight,reps")
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
  (w.sets||[]).forEach(function(s){ RC.rows.push(rcRow({workout_id:w.id,performed_at:w.performed_at,exercise_id:s.exercise_id,set_no:s.set_no,measure:s.measure,weight:s.weight,reps:s.reps})); });
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
