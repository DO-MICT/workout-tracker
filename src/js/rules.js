/* ---------- training rules ----------
   Pure functions only: no DOM, no Supabase, no S global. The screens (state.js, day.js, profile.js,
   finish.js, history.js, library.js, equipment.js) call these, and tests/rules.test.js runs them in Node.
   Change a rule here and add a test for it.

   Shapes used below:
   - a set is {w, r} as typed (strings, may be empty): w = weight / distance / added kg, r = reps / minutes / seconds
   - lab is a tracking label pair from LABS, e.g. ["kg","reps"], ["+kg","reps"], ["km","min"], ["","sec"]
   - req is a gear requirement string: "a|b,c" means (a or b) and c */
(function(root){
  "use strict";
  function num(v){ var n=parseFloat(v); return isFinite(n)?n:0; }
  function round2(n){ return Math.round(n*100)/100; }

  /* ---- personal records (weight only, for now) ----
     Records come from saved history (F1): nothing is stored that only ever goes up, so fixing or
     deleting a workout fixes the record too. */
  /* heaviest weight typed in a list of sets */
  function topWeight(sets){
    var top=0; (sets||[]).forEach(function(s){ var v=num(s&&s.w); if(v>top) top=v; }); return top;
  }
  /* what to celebrate when a session is finished, compared with history before it:
     best = the record from history (exerciseRecords), lastSets = last session's sets.
     {pr:{now,was,u}} for a new record, {up:{by,u}} for heavier than last time, otherwise null */
  function sessionWin(tracking,lab,sets,best,lastSets){
    var top=topWeight(sets); if(!(top>0)||!(lab&&lab[0])) return null;
    var unit=tracking==="cardio"?"km":"kg";
    var was=num(best), prevTop=topWeight(lastSets);
    if(was>0&&top>was) return {pr:{now:top,was:was,u:unit}};
    if(prevTop>0&&top>prevTop) return {up:{by:round2(top-prevTop),u:unit}};
    return null;
  }
  /* sets worth saving: anything with a weight or reps, except boxes still showing last time's values
     untouched and unticked (pre = pre-filled, t = typed in, d = ticked) */
  function loggedSets(sets){ return (sets||[]).filter(function(s){ return s&&(s.w||s.r)&&!(s.pre&&!s.d&&!s.t); }); }

  /* ---- history: the one source for records and last time ----
     A saved set row is {workout_id, performed_at, exercise_id, set_no, measure, weight, reps} (numbers or null),
     the shape of the workout_sets table. */
  /* the database rows plus workouts still waiting to upload ({id, performed_at, sets:[...]}).
     A waiting workout with the same id as a saved one is an edit, so it replaces the saved rows. */
  function historyRows(dbRows,pending){
    var mine={}, out=[];
    (pending||[]).forEach(function(w){ if(w&&w.id) mine[w.id]=1; });
    (dbRows||[]).forEach(function(r){ if(!mine[r.workout_id]) out.push(r); });
    (pending||[]).forEach(function(w){
      if(!w||!w.id) return;
      (w.sets||[]).forEach(function(s){
        out.push({workout_id:w.id,performed_at:w.performed_at,exercise_id:s.exercise_id,set_no:s.set_no,measure:s.measure||"w",weight:s.weight==null?null:+s.weight,reps:s.reps==null?null:+s.reps});
      });
    });
    return out;
  }
  function str(v){ return v==null||v===""||!isFinite(+v)?"":String(+v); }
  /* per exercise: {best, bestAt, last:{date, sets:[{w,r}]}} from history rows.
     best is the heaviest weight saved after the exercise's reset date (resets = {exId: ISO date});
     last is every set of the most recent workout with that exercise, as typed-style strings. */
  function exerciseRecords(rows,resets){
    var out={}, lastW={};
    resets=resets||{};
    (rows||[]).forEach(function(r){
      var id=r.exercise_id; if(!id) return;
      var e=out[id]||(out[id]={best:0,bestAt:null,last:null});
      var at=r.performed_at||"";
      var reset=resets[id];
      var w=num(r.weight);
      if(w>e.best&&!(reset&&at<=reset)){ e.best=w; e.bestAt=at; }
      var L=lastW[id];
      if(!L||at>L.at||(at===L.at&&r.workout_id===L.id)){
        if(!L||r.workout_id!==L.id){ L=lastW[id]={id:r.workout_id,at:at,sets:[]}; }
        L.sets.push(r);
      }
    });
    Object.keys(lastW).forEach(function(id){
      var L=lastW[id];
      L.sets.sort(function(a,b){ return (a.set_no||0)-(b.set_no||0); });
      out[id].last={date:L.at,sets:L.sets.map(function(s){ return {w:str(s.weight),r:str(s.reps)}; })};
    });
    return out;
  }

  /* ---- filling in today's sets ---- */
  /* the real values an untouched set box starts with: last session's same set; past last session's
     sets, the nearest earlier set typed today. Never the all-time top weight. */
  function setPrefill(today,i,lastSets){
    var ls=lastSets&&lastSets[i];
    if(ls&&(ls.w||ls.r)) return {w:ls.w||"",r:ls.r||""};
    for(var j=i-1;j>=0;j--){ var t=today&&today[j]; if(t&&(t.w||t.r)) return {w:t.w||"",r:t.r||""}; }
    return {w:"",r:""};
  }
  /* which box must be filled before a set can be ticked: "w", "r" or null when it's fine.
     kg lifts need both; added weight (+kg) is optional; cardio needs distance or time. */
  function tickMissing(lab,s){
    s=s||{};
    if(lab[0]==="km") return (s.w||s.r)?null:"w";
    if(lab[0]==="kg"&&!s.w) return "w";
    if(!s.r) return "r";
    return null;
  }
  /* sane top limits for a first-ever set, by the first box's unit */
  var SANE={"kg":400,"+kg":200,"km":200};
  /* is this weight (or distance) suspiciously high? Compared with last session's top set
     (more than 25% and at least 5 more), any earlier set today (10×), or a sane limit when there's nothing to compare.
     Returns null, or {x, ref} (times last), {by, ref} (more than last), {limit} */
  function bigJump(lab,value,lastSets,earlier){
    var v=num(value); if(!(v>0)||!lab||!lab[0]) return null;
    var lastTop=topWeight(lastSets), lo=0;
    (earlier||[]).forEach(function(s){ var e=num(s&&s.w); if(e>0&&(!lo||e<lo)) lo=e; });
    if(lastTop>0){
      if(v>=lastTop*2) return {x:Math.round(v/lastTop),ref:lastTop};
      if(lab[0]!=="km"&&v>lastTop*1.25&&v-lastTop>=5) return {by:round2(v-lastTop),ref:lastTop};
    }
    if(lo>0&&v>=lo*10) return {x:Math.round(v/lo),ref:lo,today:true};
    if(!(lastTop>0)&&!lo&&SANE[lab[0]]&&v>SANE[lab[0]]) return {limit:SANE[lab[0]]};
    return null;
  }
  /* "850 kg? That's 10× your last set." */
  function jumpText(j,value,unit){
    var v=String(num(value))+" "+unit+"?";
    if(j.limit) return v+" That's more than most people ever log for this.";
    if(j.x) return v+" That's "+j.x+"× your "+(j.today?"earlier set today":"last set")+".";
    return v+" That's "+j.by+" "+unit+" more than last time ("+j.ref+" "+unit+").";
  }

  /* ---- last time ---- */
  /* "60 kg × 8", "+10 kg × 6", "12 reps", "30 sec" for each set of last session */
  function lastSetParts(sets,lab){
    var u2=lab[1]==="reps"?"":" "+lab[1];
    return (sets||[]).map(function(s){
      return (s.w&&lab[0]?s.w+" "+lab[0].replace("+",""):"")+(s.w&&lab[0]&&s.r?" × ":"")+(s.r?s.r+u2:"");
    }).filter(Boolean);
  }

  /* ---- gear and swaps ---- */
  /* [] when the gear covers it, otherwise the "any of" groups that are missing */
  function missingGear(req,gear){
    if(!req) return []; gear=gear||[];
    return req.split(",").filter(function(alt){ return !alt.split("|").some(function(id){ return gear.indexOf(id)>=0; }); });
  }
  /* up to n swaps for exId: same muscle group, not already in the day, doable with this gear;
     ones tracked the same way (kg, reps, time...) first */
  function swapCandidates(lib,exId,gear,inDay,n){
    var L=lib[exId]; if(!L) return [];
    inDay=inDay||[];
    return Object.keys(lib).map(function(k){ return lib[k]; })
      .filter(function(o){ return o.mg===L.mg&&o.id!==exId&&inDay.indexOf(o.id)<0&&!missingGear(o.req,gear).length; })
      .sort(function(a,b){ return (a.lab===L.lab?0:1)-(b.lab===L.lab?0:1); })
      .slice(0,n==null?3:n);
  }

  /* ---- stats maths ---- */
  /* kg × reps over the weighted sets of a saved workout (sets as saved: {measure, weight, reps}) */
  function workoutVolume(sets){
    var v=0; (sets||[]).forEach(function(s){ if(s.measure==="w"&&s.weight!=null&&s.reps!=null) v+=s.weight*s.reps; }); return round2(v);
  }
  /* total distance (km) and time (min) of cardio sets ({weight: km, reps: min}) */
  function cardioSum(sets){
    var km=0,min=0;
    (sets||[]).forEach(function(s){ var w=+s.weight,r=+s.reps; if(isFinite(w)&&w>0) km+=w; if(isFinite(r)&&r>0) min+=r; });
    return {km:Math.round(km*1000)/1000,min:round2(min)};
  }

  var R={num:num,topWeight:topWeight,sessionWin:sessionWin,loggedSets:loggedSets,
    historyRows:historyRows,exerciseRecords:exerciseRecords,setPrefill:setPrefill,tickMissing:tickMissing,bigJump:bigJump,jumpText:jumpText,
    lastSetParts:lastSetParts,missingGear:missingGear,swapCandidates:swapCandidates,
    workoutVolume:workoutVolume,cardioSum:cardioSum};
  if(typeof module!=="undefined"&&module.exports) module.exports=R; else root.GFDRules=R;
})(typeof window!=="undefined"?window:this);
