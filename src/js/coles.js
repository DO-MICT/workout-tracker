/* ---------- Cole's Sessions: a random session built from the gear at a location ---------- */
var COLES_FOCUS=[
 ["full","Full body",["Legs","Chest","Back","Shoulders","Glutes","Arms","Core"]],
 ["upper","Upper body",["Chest","Back","Shoulders","Arms"]],
 ["lower","Lower body",["Legs","Glutes"]],
 ["core","Core",["Core"]],
 ["cardio","Cardio",["Cardio"]]
];
function todayKey(){var d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function colesState(){
  if(!S.coles||typeof S.coles!=="object") S.coles={};
  var C=S.coles; if(!C.opts) C.opts={focus:"full",count:6,sets:3,loc:""};
  return C;
}
function colesLoc(){var C=colesState();return locById(C.opts.loc)||curLoc();}
function colesSession(){var C=colesState();return C.session&&C.session.date===todayKey()?C.session:null;}
function colesFocus(id){for(var i=0;i<COLES_FOCUS.length;i++)if(COLES_FOCUS[i][0]===id)return COLES_FOCUS[i];return COLES_FOCUS[0];}
function shuffled(a){a=a.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),t=a[i];a[i]=a[j];a[j]=t;}return a;}
/* everything at the location for these muscle groups (no mobility moves) */
function colesPool(groups,g){
  return Object.keys(LIB).map(function(k){return LIB[k];}).filter(function(L){return groups.indexOf(L.mg)>=0&&g.length&&!missingFor(L,g).length;});
}
/* balanced pick: take turns across the focus's muscle groups so a full-body session isn't all chest */
function colesPick(focusId,count,g,exclude){
  var groups=colesFocus(focusId)[2], pool=colesPool(groups,g).filter(function(L){return (exclude||[]).indexOf(L.id)<0;});
  /* within each group, main lifts first (lower rep targets, not band-only), then everything else, each tier shuffled */
  var score=function(L){var r=parseInt(String(L.reps),10), s=0; if(!(r>0&&r<=10)) s++; if(L.req==="bands"||/^bands$/.test(L.req)) s++; if(/calf|wrist|shrug/i.test(L.id)) s++; return s;};
  var by={}; groups.forEach(function(m){var all=shuffled(pool.filter(function(L){return L.mg===m;})); by[m]=all.map(function(L,i){return [score(L),i,L];}).sort(function(a,b){return a[0]-b[0]||a[1]-b[1];}).map(function(x){return x[2];});});
  var out=[], order=focusId==="full"?groups.slice():shuffled(groups), guard=0;
  while(out.length<count&&guard<200){
    guard++; var any=false;
    order.forEach(function(m){ if(out.length<count&&by[m].length){ out.push(by[m].shift()); any=true; } });
    if(!any) break;
  }
  return out;
}
function colesSetsFor(L,sets){return L.lab==="cardio"?1:sets;}
function colesGenerate(){
  var C=colesState(), o=C.opts, lo=colesLoc(), g=lo.gear;
  var picks=colesPick(o.focus,o.count,g,[]);
  if(!picks.length) return 0;
  C.session={date:todayKey(),focus:o.focus,loc:lo.id,ex:picks.map(function(L){return {id:L.id,sets:colesSetsFor(L,o.sets),reps:L.reps,link:false};})};
  var c=cur(); picks.forEach(function(L){delete c[L.id];});   /* fresh sets for the new session */
  return picks.length;
}
function colesDay(){
  var w=WEEK[(new Date().getDay()+6)%7], s=colesSession();
  var d=resolveDay({id:w.id,short:"Today"},{title:"Cole’s Session",ex:s?s.ex:[]});
  d.coles=true; return d;
}
function colesPanelHtml(){
  var C=colesState(), o=C.opts, s=colesSession(), lo=colesLoc(), f=colesFocus(s?s.focus:o.focus);
  if(s&&!C.editing){
    var n=s.ex.length, sl=locById(s.loc)||lo;
    return '<div class="colesbar"><div><b>'+esc(f[1])+'</b><span>'+n+' exercise'+(n>1?'s':'')+' · at '+esc(sl.name)+'</span></div><button class="chip sm" id="colesNew">New session</button></div>';
  }
  var pool=lo.gear.length?colesPool(colesFocus(o.focus)[2],lo.gear).length:0;
  var h='<div class="coles"><p class="sub">Pick where you are and what to train. Cole builds a random session from the gear there.</p>'+
    '<span class="loclbl">Location</span><div class="locchips" role="group" aria-label="Location">'+locChips("data-colesloc",lo.id)+'</div>'+
    '<span class="loclbl">Focus</span><div class="locchips colesfocus" role="radiogroup" aria-label="Focus">'+COLES_FOCUS.map(function(x){return '<button class="chip sm" role="radio" data-colesfocus="'+x[0]+'" aria-checked="'+(o.focus===x[0])+'" aria-pressed="'+(o.focus===x[0])+'">'+x[1]+'</button>';}).join("")+'</div>'+
    '<div class="colessteps"><div class="bstep"><span>Exercises</span><button class="ibtn" data-colescount="-1" aria-label="Fewer exercises"'+(o.count<=2?' disabled':'')+'>−</button><b aria-live="polite">'+o.count+'</b><button class="ibtn" data-colescount="1" aria-label="More exercises"'+(o.count>=12?' disabled':'')+'>+</button></div>'+
    '<div class="bstep"><span>Sets each</span><button class="ibtn" data-colessets="-1" aria-label="Fewer sets"'+(o.sets<=1?' disabled':'')+'>−</button><b aria-live="polite">'+o.sets+'</b><button class="ibtn" data-colessets="1" aria-label="More sets"'+(o.sets>=6?' disabled':'')+'>+</button></div></div>';
  if(!lo.gear.length) h+='<div class="ready none">No equipment set for '+esc(lo.name)+' yet. <button class="linkbtn" id="colesGear">Add equipment</button></div>';
  else h+='<p class="colesinfo">'+pool+' '+esc(colesFocus(o.focus)[1].toLowerCase())+' exercises possible at '+esc(lo.name)+(pool&&pool<o.count?', so you’ll get '+pool:'')+'.'+(o.focus==="cardio"?' Cardio machines count as one block each.':'')+'</p>';
  h+='<div class="colesbtns">'+(s?'<button class="ghost" id="colesCancel">Keep current</button>':'')+'<button class="primary" id="colesGo"'+(pool?'':' disabled')+'>'+(s?'Build new session':'Build my session')+'</button></div></div>';
  return h;
}
function colesClick(t){
  if(!(DAYS[day]&&DAYS[day].coles)) return false;
  var C=colesState(), o=C.opts;
  if(t.dataset.colesloc){o.loc=t.dataset.colesloc;save();renderDay();var b=document.querySelector('[data-colesloc="'+o.loc+'"]');if(b)b.focus();return true;}
  if(t.dataset.colesfocus){o.focus=t.dataset.colesfocus;save();renderDay();var b2=document.querySelector('[data-colesfocus="'+o.focus+'"]');if(b2)b2.focus();return true;}
  if(t.dataset.colescount){o.count=Math.max(2,Math.min(12,o.count+(+t.dataset.colescount)));save();renderDay();var b3=document.querySelector('[data-colescount="'+t.dataset.colescount+'"]');if(b3&&!b3.disabled)b3.focus();return true;}
  if(t.dataset.colessets){o.sets=Math.max(1,Math.min(6,o.sets+(+t.dataset.colessets)));save();renderDay();var b4=document.querySelector('[data-colessets="'+t.dataset.colessets+'"]');if(b4&&!b4.disabled)b4.focus();return true;}
  if(t.id==="colesNew"){C.editing=true;renderDay();return true;}
  if(t.id==="colesCancel"){C.editing=false;renderDay();return true;}
  if(t.id==="colesGear"){setLoc(colesLoc().id);openEquip();return true;}
  if(t.id==="colesGo"){
    var n=colesGenerate(); C.editing=false;
    if(!n){toast("No exercises fit that gear. Try another focus or add equipment");renderDay();return true;}
    save(); OPEN={}; DAYS=buildDays(); renderTabs(); renderDay();
    var first=document.querySelector("#day details.ex"); if(first){first.open=true;}
    toast("Session ready: "+n+" exercises"); return true;
  }
  if(t.dataset.colesswap){
    var s=colesSession(); if(!s) return true;
    var old=t.dataset.colesswap, L=LIB[old], lo=locById(s.loc)||colesLoc();
    var alt=shuffled(colesPool([L.mg],lo.gear).filter(function(x){return !s.ex.some(function(e){return e.id===x.id;});}))[0];
    if(!alt){toast("No other "+L.mg.toLowerCase()+" exercise fits the gear there");return true;}
    s.ex.forEach(function(e,i){ if(e.id===old) s.ex[i]={id:alt.id,sets:colesSetsFor(alt,o.sets),reps:alt.reps,link:false}; });
    delete cur()[alt.id]; save(); DAYS=buildDays(); OPEN[day+":"+alt.id]=true; renderDay(); toast("Swapped for "+alt.n); return true;
  }
  return false;
}
