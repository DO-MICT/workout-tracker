/* ---------- exercise swaps (F4) ----------
   Swap any exercise during a workout: the options keep the movement and change the gear (GFDRules.rankSwaps).
   A swap is "Just today" (the default) or "Change my plan". Today-only swaps live in S.swapToday and end when
   the workout is completed, or at midnight; the plan itself never changes. "Machine taken" is a today-only
   swap to the best option in one tap. Edit workout has Replace, which uses the same ranking. */
var SWAP=null;          /* open swap panel on the day view: {ex, more} */
var SWMODE="today";     /* "today" | "plan" */

function swapLevel(){ return S.about&&S.about.level||null; }
function swapGearName(id){ return gearName(id); }
/* ranked options for one exercise; g = gear list, or null when no gear is set (then everything counts) */
function swapOptions(exId,g,inDay,n){
  return GFDRules.rankSwaps(LIB,exId,{gear:g&&g.length?g:null,inDay:inDay||[],level:swapLevel(),n:n});
}
function swapReasonText(r){ return GFDRules.swapReason(r,swapGearName); }

/* ---- today-only swaps ---- */
function swapDayKey(){ var d=new Date(); return d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate(); }
/* {fromId: toId} for one day of a plan, today only; older entries are dropped */
function todaySwaps(planId,dayId){
  var T=S.swapToday;
  if(!T||T.date!==swapDayKey()){ if(T) delete S.swapToday; return {}; }
  return (T.plan===planId&&T.days&&T.days[dayId])||{};
}
function setTodaySwap(planId,dayId,from,to){
  var T=S.swapToday;
  if(!T||T.date!==swapDayKey()||T.plan!==planId) T=S.swapToday={date:swapDayKey(),plan:planId,days:{}};
  var m=T.days[dayId]||(T.days[dayId]={});
  /* swapping a swap: keep the plan's exercise as the key */
  var orig=from; Object.keys(m).forEach(function(k){ if(m[k]===from) orig=k; });
  if(orig===to) delete m[orig]; else m[orig]=to;
  if(!Object.keys(m).length) delete T.days[dayId];
  if(!Object.keys(T.days).length) delete S.swapToday;
}
function endTodaySwaps(dayId){
  var T=S.swapToday; if(!T||!T.days) return;
  delete T.days[dayId];
  if(!Object.keys(T.days).length) delete S.swapToday;
}
/* the plan's days with today's swaps put in; each swapped exercise remembers what it replaced (swFrom) */
function applyTodaySwaps(planId,days){
  if(!S.swapToday) return days;
  return days.map(function(d){
    if(d.coles) return d;
    var m=todaySwaps(planId,d.id); if(!Object.keys(m).length) return d;
    var nd={}; Object.keys(d).forEach(function(k){ nd[k]=d[k]; });
    nd.ex=d.ex.map(function(x){
      var to=m[x.id], L=to&&LIB[to]; if(!L) return x;
      var y={}; Object.keys(x).forEach(function(k){ y[k]=x[k]; });
      y.id=L.id; y.n=L.n; y.f=L.f; y.c=L.c; y.mg=L.mg; y.lab=L.lab; y.reps=GFDRules.swapReps(LIB[x.id],L,x.reps); y.swFrom=x.id;
      return y;
    });
    return nd;
  });
}
/* the day as the plan has it, without today's swaps (what Edit workout and permanent swaps change) */
function planDay(i){ return buildDaysFor(activePlan().id)[i]; }

/* ---- the swap panel ---- */
function swapPanelHtml(ex,inline){
  var d=DAYS[day], inDay=d.ex.map(function(x){return x.id;}), more=SWAP&&SWAP.ex===ex.id&&SWAP.more;
  var all=swapOptions(ex.id,DAYGEAR,inDay,null), list=all.slice(0,more?15:3);
  var h='<div class="swpanel'+(inline?' inline':'')+'" role="group" aria-label="Swap '+esc(ex.n)+'">';
  if(!inline) h+='<div class="swhead"><b>Swap '+esc(ex.n)+'</b><button class="linkbtn" data-swclose="'+ex.id+'">Cancel</button></div>';
  if(!list.length) return h+'<p class="swnone">No alternative here with your gear.</p></div>';
  h+='<div class="swmode" role="radiogroup" aria-label="How long is this swap for?">'+
    '<button role="radio" data-swmode="today" aria-checked="'+(SWMODE==="today")+'">Just today</button>'+
    '<button role="radio" data-swmode="plan" aria-checked="'+(SWMODE==="plan")+'">Change my plan</button></div>';
  h+='<div class="swlist">'+list.map(function(r){
    return '<button class="swopt" data-swto="'+ex.id+'|'+r.o.id+'"><span class="bn"><b>'+esc(r.o.n)+'</b><span>'+esc(swapReasonText(r))+'</span></span>'+
      (r.harder?'<em class="swhard">Harder</em>':'')+'</button>';
  }).join("")+'</div>';
  if(all.length>list.length&&!more) h+='<button class="linkbtn swmore" data-swmore="'+ex.id+'">More options ('+(Math.min(all.length,15)-list.length)+')</button>';
  return h+'</div>';
}
/* the bits under each exercise on the day view: swapped-for-today note, Swap and Machine taken */
function swapBarHtml(ex,inWarn){
  var d=DAYS[day]; if(!d||d.coles) return "";
  var h="", L=LIB[ex.id];
  if(ex.swFrom&&LIB[ex.swFrom]) h+='<div class="swnote">Swapped for today. Your plan has <b>'+esc(LIB[ex.swFrom].n)+'</b>. <button class="linkbtn" data-swback="'+ex.id+'">Put it back</button></div>';
  if(inWarn) return h; /* the gear warning already lists the swaps */
  var needs=L&&GFDRules.missingGear(L.req,[]).length>0;
  h+='<div class="swacts"><button class="chip sm" data-swopen="'+ex.id+'" aria-expanded="'+!!(SWAP&&SWAP.ex===ex.id)+'">⇄ Swap</button>'+
    (needs?'<button class="chip sm" data-swtaken="'+ex.id+'" title="Swap for the best option, just for today">Machine taken</button>':'')+'</div>';
  return h;
}

function doSwap(from,to,mode){
  var d=DAYS[day], pid=activePlan().id, F=LIB[from], T=LIB[to]; if(!d||!T) return;
  var cur0=null; d.ex.forEach(function(x){ if(x.id===from) cur0=x; }); if(!cur0) return;
  var orig=cur0.swFrom||from;
  if(mode==="plan"){
    var raw=planDay(day), src=dayToSrc(raw), i=-1;
    src.ex.forEach(function(x,k){ if(x.id===orig) i=k; }); if(i<0) return;
    src.ex[i]={id:T.id,sets:src.ex[i].sets,reps:GFDRules.swapReps(LIB[orig],T,src.ex[i].reps),link:src.ex[i].link};
    setDaySource(d.id,src);
    var m=todaySwaps(pid,d.id); if(m[orig]) setTodaySwap(pid,d.id,m[orig],orig);
  } else setTodaySwap(pid,d.id,from,to);
  SWAP=null; OPEN[day+":"+T.id]=true; save(); renderAll();
  toastAction(mode==="plan"?"Your plan now has "+T.n:"Swapped for "+T.n+", just for today","Undo",function(){
    if(mode==="plan"){ var s2=dayToSrc(planDay(day)); s2.ex.forEach(function(x){ if(x.id===T.id){ x.id=orig; x.reps=GFDRules.swapReps(T,LIB[orig],x.reps); } }); setDaySource(d.id,s2); }
    else setTodaySwap(pid,d.id,to,from);
    OPEN[day+":"+from]=true; save(); renderAll();
  });
  var c=document.querySelector('details.ex[data-ex="'+T.id+'"]'); if(c){ var gp=c.closest("details.grp"); if(gp) gp.open=true; c.scrollIntoView({block:"center"}); }
}
function swapsClick(t){
  if(t.dataset.swopen){
    var id=t.dataset.swopen; SWAP=SWAP&&SWAP.ex===id?null:{ex:id,more:false}; SWMODE="today"; OPEN[day+":"+id]=true; renderDay();
    var f=document.querySelector('[data-swopen="'+id+'"]'); if(f) f.focus({preventScroll:true});
    return true;
  }
  if(t.dataset.swclose){ var c=t.dataset.swclose; SWAP=null; renderDay(); var b=document.querySelector('[data-swopen="'+c+'"]'); if(b) b.focus({preventScroll:true}); return true; }
  if(t.dataset.swmode){
    SWMODE=t.dataset.swmode;
    document.querySelectorAll("[data-swmode]").forEach(function(b){ b.setAttribute("aria-checked",b.dataset.swmode===SWMODE?"true":"false"); });
    return true;
  }
  if(t.dataset.swmore){ SWAP={ex:t.dataset.swmore,more:true}; renderDay(); return true; }
  if(t.dataset.swto){ var p=t.dataset.swto.split("|"); doSwap(p[0],p[1],SWMODE); return true; }
  if(t.dataset.swtaken){
    var id2=t.dataset.swtaken, best=swapOptions(id2,DAYGEAR,DAYS[day].ex.map(function(x){return x.id;}),1)[0];
    if(!best){ toast("No alternative here with your gear"); return true; }
    doSwap(id2,best.o.id,"today"); return true;
  }
  if(t.dataset.swback){
    var id3=t.dataset.swback, ex=findEx(id3); if(!ex||!ex.swFrom) return true;
    setTodaySwap(activePlan().id,DAYS[day].id,id3,ex.swFrom); OPEN[day+":"+ex.swFrom]=true; save(); renderAll(); toast("Back to "+LIB[ex.swFrom].n);
    return true;
  }
  return false;
}
