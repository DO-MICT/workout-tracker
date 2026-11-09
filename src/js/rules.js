/* ---------- training rules ----------
   Pure functions only: no DOM, no Supabase, no S global. The screens (state.js, day.js, profile.js,
   finish.js, history.js, library.js, equipment.js) call these, and tests/rules.test.js runs them in Node.
   Change a rule here and add a test for it.

   Shapes used below:
   - a set is {w, r} as typed (strings, may be empty): w = weight / distance / added kg, r = reps / minutes / seconds
   - measure is how an exercise is tracked: w, bw, cardio, time, hold or count (LABS in library.js)
   - lab is a tracking label pair from LABS, e.g. ["kg","reps"], ["+kg","reps"], ["km","min"], ["","sec"]
   - req is a gear requirement string: "a|b,c" means (a or b) and c
   - weights are always kg here (as stored); units ("kg" or "lb") only change what's shown and typed (WP4) */
(function(root){
  "use strict";
  function num(v){ var n=parseFloat(v); return isFinite(n)?n:0; }
  function round2(n){ return Math.round(n*100)/100; }


  /* ---- kg or lb (WP4, D10) ----
     Weights are kept in kg everywhere: the set boxes' saved values, history, the database. Someone who picked
     pounds sees and types lb; only these helpers convert. A weight typed in lb is kept in kg to 3 decimals,
     so 45 lb (20.412 kg) shows as 45 lb again. Distances (km), body lengths (cm) and times don't change. */
  var KG_PER_LB=0.45359237;
  function unitOf(u){ return u==="lb"?"lb":"kg"; }
  function parseNum(v){ if(v==null) return null; var n=parseFloat(String(v).replace(",",".")); return isFinite(n)?n:null; }
  function roundTo(n,dp){ var f=Math.pow(10,dp); return Math.round(n*f)/f; }
  /* a number in the chosen unit -> kg (null when it isn't a number) */
  function toKg(v,u){ var n=parseNum(v); if(n===null) return null; return unitOf(u)==="lb"?roundTo(n*KG_PER_LB,3):n; }
  /* kg -> the chosen unit, rounded (dp: decimals, default 2) */
  function fromKg(kg,u,dp){ var n=parseNum(kg); if(n===null) return null; return roundTo(unitOf(u)==="lb"?n/KG_PER_LB:n,dp==null?2:dp); }
  /* what a set box shows for a saved kg value: "" stays "", kg as saved, lb converted */
  function boxShow(kg,u){
    if(kg==null||kg==="") return "";
    if(unitOf(u)==="kg"){ var k=parseNum(kg); return k===null||roundTo(k,2)===k?String(kg):String(roundTo(k,2)); }   /* 61.235 (typed in lb) -> 61.24 */
    var n=fromKg(kg,"lb",2), n1=fromKg(kg,"lb",1); if(n===null) return String(kg);
    /* a weight saved before 3 decimals (2 in kg) is up to 0.011 lb off: 61.24 kg shows as 135, not 135.01 */
    return String(Math.abs(n-n1)<=0.015?n1:n);
  }
  /* what's saved for a value typed in a set box: kg as typed, lb converted to kg ("" stays "") */
  function boxSave(typed,u){
    typed=typed==null?"":String(typed);
    if(unitOf(u)==="kg"||typed==="") return typed;
    var n=toKg(typed,"lb"); return n===null?typed:String(n);
  }
  /* a box label from LABS in the chosen unit: "kg" -> "lb", "+kg" -> "+lb"; others unchanged */
  function unitLabel(lab0,u){ return lab0==="kg"||lab0==="+kg"?lab0.replace("kg",unitOf(u)):lab0; }
  /* a kg value with its unit, ready to show: "100 kg", "220.5 lb" (dp: decimals, default 1 for lb, 2 for kg) */
  function fmtWeight(kg,u,dp){
    u=unitOf(u); var n=fromKg(kg,u,dp==null?(u==="lb"?1:2):dp);
    return (n===null?"0":String(n))+" "+u;
  }
  /* a value with a unit from the rules ({v, u}), shown in the chosen unit: only "kg" values change */
  function showVal(v,unit,u){ return unit==="kg"?String(fromKg(v,u,unitOf(u)==="lb"?1:2)):fmtN(v); }
  function showUnit(unit,u){ return unit==="kg"?unitOf(u):unit; }

  /* ---- personal records by exercise type (F2) ----
     Records come from saved history (F1): nothing is stored that only ever goes up, so fixing or
     deleting a workout fixes the record too. Each kind of exercise has its own records:
       w (kg × reps)    heaviest for at least 1, 3, 5, 8 and 10 reps, plus an estimated 1RM (Epley)
       bw (+kg × reps)  most reps, most added kg
       hold (sec)       longest hold;  time (min) longest;  count (reps) most
       cardio (km, min) longest distance, longest time, fastest pace (min per km, runs of 0.5 km or more)
     A set only counts when it was done: reps above 0, and not short of the planned target. */
  /* heaviest weight typed in a list of sets */
  function topWeight(sets){
    var top=0; (sets||[]).forEach(function(s){ var v=num(s&&s.w); if(v>top) top=v; }); return top;
  }
  var REP_MAX=[1,3,5,8,10];
  var MEASURES={w:1,bw:1,cardio:1,time:1,hold:1,count:1};
  function measureOf(m){ return MEASURES[m]?m:"w"; }
  /* estimated 1RM, Epley: weight × (1 + reps / 30), rounded to 0.5 kg; only from 1 to 12 reps, where it's fair */
  function e1rm(w,r){ w=num(w); r=Math.floor(num(r)); if(!(w>0)||r<1||r>12) return 0; return r===1?w:Math.round(w*(1+r/30)*2)/2; }
  /* the planned target from a plan's reps text: "8–12 / side" {lo:8,hi:12,u:"reps"}, "30 sec" {lo:30,hi:30,u:"sec"};
     null when there's no number to aim for (AMRAP, "to failure") */
  function targetOf(txt){
    var m=String(txt==null?"":txt).match(/^\s*(\d+(?:[.,]\d+)?)(?:\s*[–—-]\s*(\d+(?:[.,]\d+)?))?\s*(seconds?|secs?|s|minutes?|mins?|km|m|reps?)?\b/i);
    if(!m) return null;
    var lo=parseFloat(m[1].replace(",",".")), hi=m[2]?parseFloat(m[2].replace(",",".")):lo, u=(m[3]||"").toLowerCase();
    u=/^s/.test(u)?"sec":/^min/.test(u)?"min":/^(m|km)$/.test(u)?"dist":"reps";
    return lo>0?{lo:lo,hi:Math.max(lo,hi),u:u}:null;
  }
  /* a set short of its target: fewer reps (or seconds, minutes) than the plan's lowest number */
  function isMissed(lab,s,target){
    var t=typeof target==="string"?targetOf(target):target;
    if(!t||!lab||t.u!==lab[1]||!s) return false;
    return num(s.r)<t.lo;
  }
  /* does this set count towards records? It has to be done (reps, time or distance above 0) and not missed */
  function setCounts(measure,s,lab,target){
    if(!s) return false;
    var w=num(s.w), r=num(s.r);
    measure=measureOf(measure);
    if(measure==="cardio") return w>0||r>0;
    if(!(r>0)) return false;
    if(measure==="w"&&!(w>0)) return false;
    return !(lab&&target&&isMissed(lab,s,target));
  }
  /* the records in a list of sets ({w, r, at} as numbers or strings): {key: {v, at, w, r}} */
  function bestsOf(measure,sets){
    var B={}; measure=measureOf(measure);
    function up(k,v,s,lower){ if(!(v>0)) return; var o=B[k]; if(!o||(lower?v<o.v:v>o.v)) B[k]={v:v,at:s.at||null,w:num(s.w),r:num(s.r)}; }
    (sets||[]).forEach(function(s){
      if(!setCounts(measure,s)) return;
      var w=num(s.w), r=num(s.r);
      if(measure==="w"){
        REP_MAX.forEach(function(n){ if(r>=n) up("rm"+n,w,s); });
        up("e1rm",e1rm(w,r),s);
      } else if(measure==="bw"){ up("reps",r,s); if(w>0) up("added",w,s); }
      else if(measure==="cardio"){ up("km",w,s); up("min",r,s); if(w>=0.5&&r>0) up("pace",Math.round(r*60/w),s,true); }
      else if(measure==="hold") up("sec",r,s);
      else if(measure==="time") up("min",r,s);
      else up("reps",r,s);
    });
    return B;
  }
  /* each record, in order, with its name and unit */
  var REC_KEYS={
    w:[["rm1","Heaviest","kg"],["rm3","Best for 3 reps","kg"],["rm5","Best for 5 reps","kg"],["rm8","Best for 8 reps","kg"],["rm10","Best for 10 reps","kg"],["e1rm","Estimated 1RM","kg"]],
    bw:[["reps","Most reps","reps"],["added","Most added weight","kg"]],
    cardio:[["km","Longest distance","km"],["pace","Fastest pace","/km"],["min","Longest time","min"]],
    hold:[["sec","Longest hold","sec"]], time:[["min","Longest","min"]], count:[["reps","Most","reps"]]
  };
  function fmtN(n){ return String(Math.round(n*100)/100); }
  function fmtPaceSec(sec){ sec=Math.round(sec); return Math.floor(sec/60)+":"+String(sec%60).padStart(2,"0"); }
  /* "100 kg", "about 112.5 kg", "18 reps", "45 sec", "5.2 km", "5:12 /km" */
  function recText(key,u,v,units){
    if(u==="/km") return fmtPaceSec(v)+" /km";
    return (key==="e1rm"?"about ":"")+showVal(v,u,units)+" "+showUnit(u,units);
  }
  /* records to show for one exercise: [{key, label, text, at, set}] (set: "100 kg × 5" for weighted records).
     When one set holds several rep maxes it's shown once, under the most reps it covers. */
  function recordList(measure,bests,units){
    measure=measureOf(measure); bests=bests||{};
    var keys=(REC_KEYS[measure]||[]).filter(function(k){ return bests[k[0]]; });
    var setId=function(b){ return b.w+"|"+b.r+"|"+b.at; }, seen={}, keep={};
    if(measure==="w"){
      if(bests.rm1) seen[setId(bests.rm1)]=1;
      REP_MAX.slice(1).reverse().forEach(function(n){ var b=bests["rm"+n]; if(!b) return; var id=setId(b); if(!seen[id]){ seen[id]=1; keep["rm"+n]=1; } });
    }
    return keys.filter(function(k){ return measure!=="w"||k[0]==="rm1"||k[0]==="e1rm"||keep[k[0]]; }).map(function(k){
      var b=bests[k[0]], o={key:k[0],label:k[1],text:recText(k[0],k[2],b.v,units),at:b.at};
      if(measure==="w") o.set=(k[0]==="e1rm"?"from ":"")+fmtWeight(b.w,units)+" × "+fmtN(b.r);
      return o;
    });
  }
  /* the one number "last time" is compared with, per kind: top kg, most reps, longest... */
  function mainOf(measure,sets,lab,target){
    measure=measureOf(measure);
    var B=bestsOf(measure,(sets||[]).filter(function(s){ return setCounts(measure,s,lab,target); }));
    if(measure==="w") return B.rm1?{v:B.rm1.v,u:"kg"}:null;
    if(measure==="bw") return B.added?{v:B.added.v,u:"kg",k:"added"}:B.reps?{v:B.reps.v,u:"reps"}:null;
    if(measure==="cardio") return B.km?{v:B.km.v,u:"km"}:B.min?{v:B.min.v,u:"min"}:null;
    var k=measure==="hold"?"sec":measure==="time"?"min":"reps";
    return B[k]?{v:B[k].v,u:REC_KEYS[measure][0][2]}:null;
  }
  /* what to celebrate when a session is finished, compared with history before it.
     rec = this exercise's entry from exerciseRecords (or null), lastSets = the last session's sets,
     target = the plan's reps text for today ("5", "8–12"), so missed sets never count.
     {pr:{now, was, u, what}} for a new record (the most telling one), {up:{by, u}} for more than last time, otherwise null.
     A first time is never a record: there's nothing to beat. */
  function sessionWin(measure,lab,sets,rec,lastSets,target){
    measure=measureOf(measure);
    var done=(sets||[]).filter(function(s){ return setCounts(measure,s,lab,target); });
    if(!done.length) return null;
    var now=bestsOf(measure,done), was=(rec&&rec.bests)||{};
    var order={w:["rm1","rm10","rm8","rm5","rm3","e1rm"],bw:["added","reps"],cardio:["km","pace","min"],hold:["sec"],time:["min"],count:["reps"]}[measure];
    for(var i=0;i<order.length;i++){
      var k=order[i], n=now[k], p=was[k]; if(!n||!p||!(p.v>0)) continue;
      var lower=k==="pace", better=lower?n.v<p.v:n.v>p.v;
      if(k==="e1rm"&&n.v-p.v<0.5) better=false;
      if(!better) continue;
      var meta=REC_KEYS[measure].filter(function(x){ return x[0]===k; })[0];
      var o={now:n.v,was:p.v,u:meta[2],what:meta[1]};
      if(k==="e1rm") o.about=true;
      return {pr:o};
    }
    var a=mainOf(measure,done), b=mainOf(measure,lastSets);
    if(a&&b&&a.u===b.u&&a.k===b.k&&a.v>b.v) return {up:{by:round2(a.v-b.v),u:a.u}};
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
        out.push({workout_id:w.id,performed_at:w.performed_at,exercise_id:s.exercise_id,set_no:s.set_no,measure:s.measure||"w",weight:s.weight==null?null:+s.weight,reps:s.reps==null?null:+s.reps,
          plan_id:w.plan_id||null,day_id:w.day_id||null});
      });
    });
    return out;
  }
  function str(v){ return v==null||v===""||!isFinite(+v)?"":String(+v); }
  /* per exercise, from history rows (rows may carry plan_id and day_id of their workout):
     {measure, bests, best, bestAt, last:{date, sets:[{w,r}]}, sessions:[{id, at, plan, day, sets}]}
     bests are the records (bestsOf) from sets saved after the exercise's reset date (resets = {exId: ISO date});
     best is the headline number of the first box (heaviest kg, most added kg, longest km), kept for older callers;
     sessions are newest first, each with its sets in order as typed-style strings; last is the newest one. */
  function exerciseRecords(rows,resets){
    var out={}, by={};
    resets=resets||{};
    (rows||[]).forEach(function(r){
      var id=r.exercise_id; if(!id) return;
      var e=by[id]||(by[id]={ws:{},list:[]});
      var k=r.workout_id||r.performed_at||"";
      var S=e.ws[k]||(e.ws[k]={id:r.workout_id,at:r.performed_at||"",plan:r.plan_id||null,day:r.day_id||null,rows:[]});
      if(r.plan_id&&!S.plan) S.plan=r.plan_id;
      if(r.day_id&&!S.day) S.day=r.day_id;
      S.rows.push(r);
    });
    Object.keys(by).forEach(function(id){
      var e=by[id], reset=resets[id];
      var list=Object.keys(e.ws).map(function(k){ return e.ws[k]; }).sort(function(a,b){ return a.at<b.at?1:a.at>b.at?-1:0; });
      var measure=measureOf(list[0].rows[0].measure);
      var counted=[];
      list.forEach(function(S){
        S.rows.sort(function(a,b){ return (a.set_no||0)-(b.set_no||0); });
        if(reset&&S.at<=reset) return;
        S.rows.forEach(function(r){ if(measureOf(r.measure)===measure) counted.push({w:r.weight,r:r.reps,at:S.at}); });
      });
      var bests=bestsOf(measure,counted);
      var head=measure==="w"?bests.rm1:measure==="bw"?bests.added:measure==="cardio"?bests.km:null;
      var sessions=list.map(function(S){ return {id:S.id,at:S.at,plan:S.plan,day:S.day,sets:S.rows.map(function(s){ return {w:str(s.weight),r:str(s.reps)}; })}; });
      out[id]={measure:measure,bests:bests,best:head?head.v:0,bestAt:head?head.at:null,
        last:{date:sessions[0].at,sets:sessions[0].sets},sessions:sessions};
    });
    return out;
  }
  /* last time that matches today (F2.E2): the newest session on the same plan day; failing that, one done
     for the same rep target (targetFor(plan, day) gives a past session's planned reps, or its own reps are in range);
     failing that, the newest session. ctx = {plan, day, target, targetFor}. Returns {date, sets, match} or null,
     match = "day", "target" or "any". */
  function lastMatching(rec,ctx){
    var L=rec&&rec.sessions; if(!L||!L.length) return null;
    ctx=ctx||{};
    function pick(s,m){ return {date:s.at,sets:s.sets,match:m}; }
    if(ctx.day){
      for(var i=0;i<L.length;i++) if(L[i].day===ctx.day&&(!ctx.plan||!L[i].plan||L[i].plan===ctx.plan)) return pick(L[i],"day");
    }
    var t=targetOf(ctx.target);
    if(t){
      for(var j=0;j<L.length;j++){
        var s=L[j], pt=ctx.targetFor&&s.day?targetOf(ctx.targetFor(s.plan,s.day)):null;
        if(pt){ if(pt.lo===t.lo&&pt.hi===t.hi&&pt.u===t.u) return pick(s,"target"); continue; }
        /* no plan to ask: judge by what was done, the middle set's reps within today's range */
        var rs=s.sets.map(function(x){ return num(x.r); }).filter(function(v){ return v>0; }).sort(function(a,b){ return a-b; });
        var mid=rs.length?rs[Math.floor(rs.length/2)]:0;
        if(t.u==="reps"&&mid>=t.lo&&mid<=t.hi) return pick(s,"target");
      }
    }
    return pick(L[0],"any");
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
  /* "850 kg? That's 10× your last set." value and j are kg for weights; units shows them in lb when picked */
  function jumpText(j,value,unit,units){
    var sv=function(x){ return unit==="kg"?showVal(x,"kg",units):String(num(x)); }, su=showUnit(unit,units);
    var v=sv(value)+" "+su+"?";
    if(j.limit) return v+" That's more than most people ever log for this.";
    if(j.x) return v+" That's "+j.x+"× your "+(j.today?"earlier set today":"last set")+".";
    return v+" That's "+sv(j.by)+" "+su+" more than last time ("+sv(j.ref)+" "+su+").";
  }

  /* ---- last time ---- */
  /* "60 kg × 8", "+10 kg × 6", "12 reps", "30 sec" for each set of last session */
  function lastSetParts(sets,lab,units){
    var u2=lab[1]==="reps"?"":" "+lab[1], kg=lab[0]==="kg"||lab[0]==="+kg";
    return (sets||[]).map(function(s){
      return (s.w&&lab[0]?(kg?boxShow(s.w,units)+" "+unitOf(units):s.w+" "+lab[0].replace("+","")):"")+(s.w&&lab[0]&&s.r?" × ":"")+(s.r?s.r+u2:"");
    }).filter(Boolean);
  }

  /* ---- gear and swaps ---- */
  /* floor moves: gear you can always stand in for with a floor, a towel or carpet (F4.E3), so push-ups,
     plank and mat work count as doable at every location without adding them as gear */
  var FLOOR=["calisthenics","yogamat","pilatesmat","gymmat"];
  /* [] when the gear covers it, otherwise the "any of" groups that are missing */
  function missingGear(req,gear){
    if(!req) return []; gear=gear||[];
    return req.split(",").filter(function(alt){ return !alt.split("|").some(function(id){ return gear.indexOf(id)>=0||FLOOR.indexOf(id)>=0; }); });
  }
  var LEVELS={new:0,some:1,experienced:2}, DIFF={Beginner:0,Intermediate:1,Advanced:2};
  /* words that name the gear, not the movement: "Barbell Romanian deadlift" and "Dumbbell Romanian deadlift" match */
  var GEAR_WORDS=/^(barbell|dumbbell|dumbbells|db|bb|kettlebell|kettlebells|kb|double|cable|machine|smith|trap|bar|ez|ez-bar|band|banded|resistance|landmine|seated|standing|lying|incline|decline|flat|weighted|bodyweight|reformer|mat|trx|suspension|ring|rings|single-arm|one-arm|a|the|with|on|and|of|to|in)$/;
  function nameWords(n){ return String(n||"").toLowerCase().replace(/[()]/g," ").split(/[\s,/]+/).filter(function(w){ return w&&!GEAR_WORDS.test(w); }); }
  /* the gear an exercise would use here: one id per "any of" group, preferring what's in the gear list */
  function gearUsed(req,gear){
    if(!req) return [];
    return req.split(",").map(function(alt){
      var ids=alt.split("|"), have=ids.filter(function(id){ return gear&&gear.indexOf(id)>=0; });
      return have[0]||ids.filter(function(id){ return FLOOR.indexOf(id)<0; })[0]||"";
    }).filter(Boolean);
  }
  /* free weights swap best for free weights; dumbbells are the usual stand-in for a barbell */
  var FREE=["barbell","ezbar","trapbar","dumbbells","kettlebells","plates"];
  function isFree(req){ return String(req||"").split(/[,|]/).some(function(id){ return FREE.indexOf(id)>=0; }); }
  function gearKin(fromReq,toReq){
    if(!isFree(fromReq)||!isFree(toReq)) return 0;
    return 4+(/(^|[,|])dumbbells($|[,|])/.test(toReq)?1:0);
  }
  /* swaps for exId, best first (F4.E1.S3). Keeps the movement and changes the gear:
     same movement pattern, then same main muscle, then same style (pilates stays pilates), tracked the same way,
     similar name. Moves above the person's level stay in the list, lower down, marked harder.
     opts: gear (null = don't check gear), inDay (ids to leave out), level ("new"|"some"|"experienced"), n.
     Returns [{o, score, move, muscle, style, harder, gear:[ids used]}]. */
  function rankSwaps(lib,exId,opts){
    var L=lib[exId]; if(!L) return [];
    opts=opts||{}; var gear=opts.gear||null, inDay=opts.inDay||[], lv=LEVELS[opts.level];
    var lx=L.x||{}, lpm=(lx.pm||[]).map(function(m){ return m.toLowerCase(); }), lw=nameWords(L.n);
    var out=[];
    Object.keys(lib).forEach(function(k){
      var o=lib[k]; if(o.id===exId||inDay.indexOf(o.id)>=0) return;
      if(gear&&missingGear(o.req,gear).length) return;
      var x=o.x||{}, pm=(x.pm||[]).map(function(m){ return m.toLowerCase(); });
      var move=!!(lx.mp&&x.mp===lx.mp), main=!!(lpm[0]&&pm[0]===lpm[0]), overlap=lpm.some(function(m){ return pm.indexOf(m)>=0; });
      var iso=lx.mp==="Isolation"||lx.mp==="Stretch"||lx.mp==="Mobility";
      /* a related move: same muscle group, or the same movement working the same muscles */
      if(o.mg!==L.mg&&!(move&&overlap)) return;
      /* "Isolation" says little on its own, so it only counts with the same main muscle */
      if(move&&iso&&!overlap) move=false;
      var style=!!(lx.tt&&x.tt===lx.tt), harder=lv!=null&&DIFF[x.diff]!=null&&DIFF[x.diff]>lv;
      var w=nameWords(o.n), shared=w.filter(function(t){ return lw.indexOf(t)>=0; }).length;
      var score=(move?100:0)+(main?40:overlap?20:0)+(o.mg===L.mg?10:0)+(style?12:0)+(o.lab===L.lab?8:0)+
        Math.min(shared,3)*6+(!!x.uni===!!lx.uni?10:0)+gearKin(L.req,o.req)-(harder?120:0);
      out.push({o:o,score:score,move:move,muscle:main||overlap,style:style,harder:harder,gear:gearUsed(o.req,gear)});
    });
    out.sort(function(a,b){ return (b.score-a.score)||String(a.o.n).localeCompare(String(b.o.n)); });
    return opts.n==null?out:out.slice(0,opts.n);
  }
  /* why a swap was offered, in plain words: "Same movement, uses dumbbells" */
  function swapReason(r,gearName){
    var name=gearName||function(id){ return id; }, parts=[];
    if(r.move) parts.push("Same movement"); else if(r.muscle) parts.push("Same muscles"); else parts.push("Same muscle group");
    var g=r.gear.map(function(id){ return String(name(id)).toLowerCase(); });
    parts.push(g.length?"uses "+(g.length>1?g.slice(0,-1).join(", ")+" and "+g[g.length-1]:g[0]):"no gear needed");
    return parts.join(", ");
  }
  /* reps to plan after a swap: keep the plan's target when both are tracked the same way */
  function swapReps(from,to,planReps){ return from&&to&&(from.lab||"w")===(to.lab||"w")&&planReps?planReps:(to&&to.reps)||planReps; }
  /* up to n swaps (the exercise objects), as before F4: kept for older callers */
  function swapCandidates(lib,exId,gear,inDay,n){
    return rankSwaps(lib,exId,{gear:gear||[],inDay:inDay,n:n==null?3:n}).map(function(r){ return r.o; });
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

  /* ---- wins worth celebrating (F2.E3) ---- */
  function pad2(n){ return (n<10?"0":"")+n; }
  function dayKey(d){ return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate()); }
  /* the Monday (local time) of the week a date falls in, as "2026-11-02" */
  function weekKey(iso){ var d=new Date(iso); if(isNaN(d)) return ""; return dayKey(new Date(d.getFullYear(),d.getMonth(),d.getDate()-(d.getDay()+6)%7)); }
  function prevWeek(k){ var p=k.split("-"); return dayKey(new Date(+p[0],+p[1]-1,+p[2]-7)); }
  var COUNT_WINS=[5,10,25,50,75,100,150,200,250,300,400,500,750,1000];
  /* milestones for the workout just finished: prev = dates of every earlier workout, planDays = days in the plan,
     allDone = every planned set ticked and none missed. [{key, text}], shown on the finish screen */
  function milestones(prev,nowIso,planDays,allDone){
    var out=[], weeks={}, n=(prev||[]).length+1, wk=weekKey(nowIso);
    (prev||[]).forEach(function(d){ var k=weekKey(d); if(k) weeks[k]=(weeks[k]||0)+1; });
    var thisWeek=(weeks[wk]||0)+1;
    if(n===1) out.push({key:"first",text:"Your first workout. The hardest one is done."});
    else if(COUNT_WINS.indexOf(n)>=0) out.push({key:"count",text:n+" workouts done"});
    if(planDays>1&&thisWeek===planDays){
      var before=Object.keys(weeks).some(function(k){ return k!==wk&&weeks[k]>=planDays; });
      out.push({key:"week",text:before?"Full week: every planned day done":"First full week: every planned day done"});
    }
    if(n>1&&thisWeek===1){
      var s=1, k=prevWeek(wk); while(weeks[k]){ s++; k=prevWeek(k); }
      if(s>=2) out.push({key:"streak",text:s+" weeks in a row"});
    }
    if(allDone) out.push({key:"all",text:"Every set done"});
    return out;
  }

  /* ---- onboarding: suggest a plan from four answers (F3) ----
     ans = {train: gym|pilates|yoga|running|mixed, level: new|some|experienced,
            goal: strength|muscle|weight|move|general, days: 2..5}
     fit = {planId: share of the plan's exercises the location has the gear for, 0..1}
     Returns plan ids best first. pick is the first one that doesn't mostly need gear the location
     doesn't have (fit of at least 0.5); "coles" builds from the gear that's there, so it always fits. */
  function planOrder(ans){
    var a=ans||{}, t=a.train, lv=a.level, g=a.goal, d=+a.days||3, out;
    if(t==="pilates") out=["pilates","yoga","beginner"];
    else if(t==="yoga") out=["yoga","pilates","beginner"];
    else if(t==="running") out=["run","beginner","fb3"];
    else if(lv==="new") out=["beginner","fb3"];
    else if(t==="mixed") out=d>=4||g==="weight"?["fb3","beginner","split5"]:["beginner","fb3"];
    else if(d>=5&&lv==="experienced") out=g==="muscle"?["split5","bro","fb3"]:["split5","fb3","bro"];
    else if(d>=5) out=["split5","fb3","beginner"];
    else out=["fb3","beginner","split5"];
    if(g==="move"&&out.indexOf("yoga")<0) out.push("yoga");
    return out;
  }
  function recommendPlan(ans,fit){
    var order=planOrder(ans), f=fit||{}, pick="coles";
    for(var i=0;i<order.length;i++){ var v=f[order[i]]; if(v==null||v>=0.5){ pick=order[i]; break; } }
    return {pick:pick,order:order};
  }
  /* how the app cheers: calm for pilates, yoga and "move better", energetic for the rest */
  function celebrateFor(ans){ var a=ans||{}; return a.train==="pilates"||a.train==="yoga"||a.goal==="move"?"calm":"energetic"; }
  /* training days for the starter plans: 2 days a week sit apart, 3 or more use Monday, Wednesday, Friday */
  function starterDays(days){ return (+days||3)<=2?["mon","thu"]:["mon","wed","fri"]; }

  var R={KG_PER_LB:KG_PER_LB,unitOf:unitOf,toKg:toKg,fromKg:fromKg,boxShow:boxShow,boxSave:boxSave,unitLabel:unitLabel,
    fmtWeight:fmtWeight,showVal:showVal,showUnit:showUnit,
    num:num,topWeight:topWeight,sessionWin:sessionWin,loggedSets:loggedSets,
    e1rm:e1rm,targetOf:targetOf,isMissed:isMissed,setCounts:setCounts,bestsOf:bestsOf,recordList:recordList,lastMatching:lastMatching,
    weekKey:weekKey,milestones:milestones,
    historyRows:historyRows,exerciseRecords:exerciseRecords,setPrefill:setPrefill,tickMissing:tickMissing,bigJump:bigJump,jumpText:jumpText,
    lastSetParts:lastSetParts,missingGear:missingGear,swapCandidates:swapCandidates,rankSwaps:rankSwaps,swapReason:swapReason,swapReps:swapReps,
    workoutVolume:workoutVolume,cardioSum:cardioSum,
    planOrder:planOrder,recommendPlan:recommendPlan,celebrateFor:celebrateFor,starterDays:starterDays};
  if(typeof module!=="undefined"&&module.exports) module.exports=R; else root.GFDRules=R;
})(typeof window!=="undefined"?window:this);
