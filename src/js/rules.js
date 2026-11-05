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

  /* ---- personal records (weight only, for now) ---- */
  /* heaviest weight typed in a list of sets */
  function topWeight(sets){
    var top=0; (sets||[]).forEach(function(s){ var v=num(s&&s.w); if(v>top) top=v; }); return top;
  }
  /* best ever = the saved record, or last session's heaviest set if that's higher */
  function bestWeight(storedPr,lastSets){ return Math.max(num(storedPr),topWeight(lastSets)); }
  /* the record to save after a session: it only ever goes up */
  function nextStoredPr(storedPr,sets){
    var best=num(storedPr), out=storedPr;
    (sets||[]).forEach(function(s){ var v=num(s&&s.w); if(v>best){ best=v; out=String(v); } });
    return out;
  }
  /* what to celebrate when a session is finished, before it overwrites last time:
     {pr:{now,was,u}} for a new record, {up:{by,u}} for heavier than last time, otherwise null */
  function sessionWin(tracking,lab,sets,storedPr,lastSets){
    var top=topWeight(sets); if(!(top>0)||!(lab&&lab[0])) return null;
    var unit=tracking==="cardio"?"km":"kg";
    var was=bestWeight(storedPr,lastSets), prevTop=topWeight(lastSets);
    if(was>0&&top>was) return {pr:{now:top,was:was,u:unit}};
    if(prevTop>0&&top>prevTop) return {up:{by:round2(top-prevTop),u:unit}};
    return null;
  }
  /* sets worth saving: anything with a weight or reps typed */
  function loggedSets(sets){ return (sets||[]).filter(function(s){ return s&&(s.w||s.r); }); }

  /* ---- last time ---- */
  /* "60 kg × 8", "+10 kg × 6", "12 reps", "30 sec" for each set of last session */
  function lastSetParts(sets,lab){
    var u2=lab[1]==="reps"?"":" "+lab[1];
    return (sets||[]).map(function(s){
      return (s.w&&lab[0]?s.w+" "+lab[0].replace("+",""):"")+(s.w&&lab[0]&&s.r?" × ":"")+(s.r?s.r+u2:"");
    }).filter(Boolean);
  }
  /* grey hints for set i: the nearest earlier set typed today; before that the record (weight)
     and last session's same set or the plan's target (reps) */
  function setHint(today,i,lastSets,best,lab,target){
    var wp="", rp="";
    for(var j=i-1;j>=0;j--){ var t=today[j]||{}; if(!wp&&t.w) wp=t.w; if(!rp&&t.r) rp=t.r; }
    if(!wp) wp=(best>0?String(best):"")||lab[0];
    if(!rp){
      var ls=lastSets&&lastSets.length?(lastSets[i]||lastSets[lastSets.length-1]):null;
      rp=ls&&ls.r?ls.r:(target==="max"?"max":String(target).split(/[–\s]/)[0]);
    }
    return [wp,rp];
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

  var R={num:num,topWeight:topWeight,bestWeight:bestWeight,nextStoredPr:nextStoredPr,sessionWin:sessionWin,loggedSets:loggedSets,
    lastSetParts:lastSetParts,setHint:setHint,missingGear:missingGear,swapCandidates:swapCandidates,
    workoutVolume:workoutVolume,cardioSum:cardioSum};
  if(typeof module!=="undefined"&&module.exports) module.exports=R; else root.GFDRules=R;
})(typeof window!=="undefined"?window:this);
