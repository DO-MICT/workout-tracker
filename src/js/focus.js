/* ---------- Focus view: one-thumb set logging (Deon, 11 Nov) ----------
   The Workout tab shows one exercise and one set at a time. A round timer at the top reads Start, then counts down
   the rest after each set, then says Go. Nothing below it moves when the timer changes. "Log set" sits right above the
   tab bar. Finishing an exercise moves on to the next one by itself; + adds an extra set (an extra round in a superset
   or circuit). Swap, Machine taken, the injury note, history and How to do it safely live in the ⋯ sheet.
   The list of every exercise is still there: ⋯ → Show all exercises (S.dayView="list"), and "Focus view" goes back.
   Sets are the same objects the list uses (setsFor), and the boxes carry the same data-ex/data-i/data-f, so typing,
   the number pad, ticking (tickSet), the rest timer and Complete workout all run through the existing code. */
var FX={id:null,si:null,prev:null,tools:false,clock:null};
function focusOn(d){ return !!d&&!d.coles&&d.ex.length>0&&S.dayView!=="list"; }
/* how many sets an exercise has today: the plan's sets plus any extra ones added on the fly (marked x) */
function nSets(ex,arr){ arr=arr||setsFor(ex); var n=ex.sets; while(arr[n]&&arr[n].x) n++; return n; }
function openSet(ex){ var a=setsFor(ex), n=nSets(ex,a); for(var i=0;i<n;i++) if(!a[i].d) return i; return -1; }
function exDoneF(ex){ return openSet(ex)<0; }
/* the exercises in workout order, each with its superset/circuit group (null for a single exercise) */
function fxOrder(){
  var out=[]; groupsOf(DAYS[day]).forEach(function(g){ g.items.forEach(function(ex,k){ out.push({ex:ex,g:g.kind==="single"?null:g,k:k}); }); });
  return out;
}
function fxItem(id){ var o=fxOrder(); for(var i=0;i<o.length;i++) if(o[i].ex.id===id) return o[i]; return null; }
/* where to be: the remembered exercise, else the first one with sets left (a group starts at its first unfinished member) */
function fxCurrent(){
  var o=fxOrder(), it=FX.id&&fxItem(FX.id);
  if(it) return it;
  for(var i=0;i<o.length;i++) if(!exDoneF(o[i].ex)) { FX.id=o[i].ex.id; return o[i]; }
  FX.id=o.length?o[0].ex.id:null; return o[0]||null;
}
function fxNextOpen(fromId){
  var o=fxOrder(), at=0; o.forEach(function(x,i){ if(x.ex.id===fromId) at=i; });
  for(var j=1;j<=o.length;j++){ var x=o[(at+j)%o.length]; if(!exDoneF(x.ex)) return x; }
  return null;
}
function grpLetter(g){ var gs=groupsOf(DAYS[day]).filter(function(x){return x.kind!=="single";}); return String.fromCharCode(65+Math.max(0,gs.indexOf(g))); }
function fxStarted(){
  var d=DAYS[day], f=S.fstart; if(f&&f.day===d.id&&f.who===(S.who||0)&&Date.now()-f.at<86400000) return f.at;
  var first=0; d.ex.forEach(function(ex){ setsFor(ex).forEach(function(s){ if(s.d&&s.at&&(!first||s.at<first)) first=s.at; }); });
  return first||0;
}
function fxResting(){ var t=document.getElementById("timer"); return !!t&&t.classList.contains("on")&&Date.now()<tEnd; }
function mmssF(s){ s=Math.max(0,Math.round(s)); return Math.floor(s/60)+":"+String(s%60).padStart(2,"0"); }

/* ---------- render ---------- */
var FX_C=2*Math.PI*54;
function fxRingHtml(){
  var started=fxStarted(), rest=fxResting(), left=rest?(tEnd-Date.now())/1000:0;
  var cls=rest?"rest":started?"go":"idle", big=rest?mmssF(left):started?"Go":"Start", small=rest?"rest":started?(FX.sw?"no rest":"next set"):"workout";
  var off=rest?FX_C*(1-left/tTotal):started?0:FX_C;
  var label=cls==="idle"?"Start workout":cls==="rest"?"Rest timer, "+mmssF(left)+" left":"Rest over. Go";
  return '<div class="fx-tz"><button class="fx-side'+(rest?'':' off')+'" data-fx="t30"'+(rest?'':' tabindex="-1" aria-hidden="true"')+'>+30s</button>'+
    '<button class="fx-ring '+cls+'" data-fx="ring" aria-label="'+label+'"><svg viewBox="0 0 128 128" aria-hidden="true"><circle class="trk" cx="64" cy="64" r="54"/><circle class="arc" id="fxArc" cx="64" cy="64" r="54" stroke-dasharray="'+FX_C.toFixed(1)+'" stroke-dashoffset="'+off.toFixed(1)+'"/></svg>'+
    '<span class="in" aria-hidden="true"><b id="fxBig">'+big+'</b><small id="fxSmall">'+small+'</small></span></button>'+
    '<button class="fx-side'+(rest?'':' off')+'" data-fx="skip"'+(rest?'':' tabindex="-1" aria-hidden="true"')+'>Skip</button></div>'+
    '<div class="fx-clock" id="fxClock">'+(started?'Workout '+mmssF((Date.now()-started)/1000):'')+'</div>';
}
function fxLastFor(ex,i){
  var L=lastFor(ex.id,ex); if(!L||!L.sets||!L.sets.length) return "";
  var p=GFDRules.lastSetParts(L.sets,labOf(ex),U()); return p[Math.min(i,p.length-1)]||"";
}
function renderFocus(){
  var d=DAYS[day], it=fxCurrent(); if(!it){ S.dayView="list"; renderDay(); return; }
  document.body.classList.add("focusview");
  var ex=it.ex, g=it.g, arr=setsFor(ex), n=nSets(ex,arr), open=openSet(ex), all=open<0;
  if(FX.si!=null&&(FX.si>=n||FX.id!==ex.id)) FX.si=null;
  var si=FX.si!=null?FX.si:(all?n-1:open), s=arr[si], lab=labOf(ex), lw=GFDRules.unitLabel(lab[0],U());
  var o=fxOrder(), pos=0; o.forEach(function(x,i){ if(x.ex===ex) pos=i; });
  var L=g?grpLetter(g):"", tag=g?L+(it.k+1):(pos+1)+"/"+o.length;
  var miss=DAYGEAR&&LIB[ex.id]?missingFor(LIB[ex.id],DAYGEAR):[];
  var sub=g?(g.kind==="circuit"?"Circuit":"Superset")+" · "+ex.sets+" rounds × "+esc(ex.reps):"Target "+ex.sets+" × "+esc(ex.reps);
  var h='<div class="fx" id="fx">';
  h+='<div class="fx-top">'+
    '<div class="fx-name"><span class="fx-pos'+(g?' grp':'')+'">'+tag+'</span><div><h2>'+esc(ex.n)+'</h2><span>'+sub+(miss.length?' · <b class="fx-warn">Needs gear</b>':'')+(noteOf(ex.id)?' · <b class="fx-warn">Injury note</b>':'')+'</span></div></div>'+
    '<button class="fx-nav fx-more" data-fx="tools" aria-haspopup="dialog" aria-label="More for '+esc(ex.n)+': swap, injury note, history, how to">⋯</button></div>';
  h+=fxRingHtml();
  h+='<div class="fx-card" id="fxCard">';
  if(g){
    h+='<div class="fx-pills">'+g.items.map(function(x,k){
      var ahead=x!==ex&&setsFor(x).slice(0,nSets(x)).filter(function(q){return q.d;}).length>(all?n-1:si);
      return '<button class="fx-pill'+(x===ex?' on':'')+(ahead?' ok':'')+'" data-fx="go" data-id="'+esc(x.id)+'" aria-pressed="'+(x===ex)+'"><b>'+L+(k+1)+(ahead?' ✓':'')+'</b><span>'+esc(x.n)+'</span></button>';
    }).join("")+'</div>';
  }
  var editing=FX.si!=null&&s.d;
  h+='<div class="fx-lbl"><span>'+(all&&FX.si==null?'All done':(g?'Round ':'Set ')+(si+1)+' <small>of '+n+'</small>')+(s.x?' <span class="fx-x">Extra</span>':'')+(editing?' <span class="fx-x ed">Editing</span>':'')+'</span>'+
    (fxLastFor(ex,si)?'<span class="fx-last">Last time <b>'+esc(fxLastFor(ex,si))+'</b></span>':'<span class="fx-last">First time</span>')+'</div>';
  h+='<div class="fx-dots" role="group" aria-label="Sets">'+arr.slice(0,n).map(function(q,k){
    return '<button class="fx-dot'+(q.d?' d':'')+(k===si?' c':'')+(q.x?' x':'')+'" data-fx="set" data-i="'+k+'" aria-label="Set '+(k+1)+(q.d?', done':'')+(q.x?', extra':'')+'"'+(k===si?' aria-current="step"':'')+'>'+(k+1)+'</button>';
  }).join("")+'<button class="fx-dot add" data-fx="add" aria-label="'+(g?'Add an extra round':'Add an extra set')+'">+</button></div>';
  h+='<div class="fx-nums numgrp'+(lab[0]?'':' one')+'">'+
    (lab[0]?'<label class="fx-num"><input'+numFor(lw)+' aria-label="Set '+(si+1)+' '+lw+'" data-ex="'+ex.id+'" data-i="'+si+'" data-f="w" value="'+esc(boxVal(ex,s,"w"))+'" placeholder="–"><small>'+esc(lw)+'</small></label><span class="fx-times" aria-hidden="true">×</span>':'')+
    '<label class="fx-num"><input'+numFor(lab[1])+' aria-label="Set '+(si+1)+' '+lab[1]+'" data-ex="'+ex.id+'" data-i="'+si+'" data-f="r" value="'+esc(s.r)+'" placeholder="–"><small>'+esc(lab[1])+'</small></label></div>';
  h+='</div>';
  var started=fxStarted(), nx=fxNextOpen(ex.id), label, act;
  if(editing){ label="Done editing set "+(si+1); act="back"; }
  else if(!started){ label="Start workout"; act="start"; }
  else if(all){ label=nx?"Next: "+esc(nx.ex.n):"Complete workout"; act=nx?"next":"finish"; }
  else { label="✓ Log "+(g?L+(it.k+1)+" · round "+(si+1):"set "+(si+1)); act="log"; }
  h+='<div class="fx-bot"><div class="fx-gorow"><button class="fx-nav" data-fx="prev" aria-label="Previous exercise">‹</button><button class="fx-go" data-fx="'+act+'"'+(act==="log"?' data-i="'+si+'"':'')+'>'+label+'</button><button class="fx-nav" data-fx="next" aria-label="Next exercise">›</button></div><div class="fx-slot">'+fxSlot(it,si,all,started,nx)+'</div></div>';
  h+='</div>';
  if(FX.tools) h+=fxToolsHtml(ex,miss);
  document.getElementById("day").innerHTML=h;
  fxClockStart();
  if(!fxFit()&&started&&!FX.tools&&!document.body.classList.contains("wide")) fxScroll();
}
/* Deon, 12 Nov: the whole focus view fits on the screen without scrolling. It fills the space from where it starts down
   to the tab bar, so the set card centres in what's really visible. Only when it can't fit (a long superset on a short
   phone) does it take the full screen height and scroll the header away. Returns true when it fits. */
function fxFit(){
  var el=document.getElementById("fx"); if(!el) return true;
  if(document.body.classList.contains("wide")){ el.style.minHeight=""; return true; }
  var tb=document.getElementById("tabbar"), tabh=tb&&!tb.hidden?tb.getBoundingClientRect().height:0;
  var top=el.getBoundingClientRect().top+window.scrollY, room=window.innerHeight-tabh-16;
  /* first at full size, then tighter (smaller ring, number boxes and gaps; taps stay 44 px); with the header in view, then without it */
  var fits=function(avail){ el.style.minHeight="0px"; return el.scrollHeight<=avail; };
  for(var pass=0;pass<4;pass++){
    el.classList.toggle("fx-tight",pass%2===1);
    var avail=pass<2?room-top:room-8;
    if(fits(avail)||pass===3){ el.style.minHeight=Math.max(avail,el.scrollHeight)+"px"; return pass<2; }
  }
  return false;
}
window.addEventListener("resize",function(){ if(document.getElementById("fx")) fxFit(); });
/* when it doesn't fit, the header and day button scroll away so the focus view gets the whole screen */
function fxScroll(){
  var el=document.getElementById("fx"); if(!el||document.getElementById("onboard")&&!document.getElementById("onboard").hidden) return;
  var top=el.getBoundingClientRect().top+window.scrollY-8;
  if(Math.abs(window.scrollY-top)>2) window.scrollTo(0,top);
}
function fxSlot(it,si,all,started,nx){
  var ex=it.ex, g=it.g;
  if(FX.prev&&started&&findEx(FX.prev)){ var pi=fxItem(FX.prev); return '<button class="linkbtn" data-fx="addprev">'+(pi&&pi.g?'+ One more round of '+(pi.g.kind==="circuit"?'circuit ':'superset ')+grpLetter(pi.g):'+ One more set of '+esc(findEx(FX.prev).n))+'</button>'; }
  if(!started) return '<button class="linkbtn" data-fx="list">Show all exercises</button>';
  if(all) return nx?'':'Every set is done. Nice work.';
  if(g){ var later=g.items.slice(it.k+1).filter(function(x){return nSets(x)>si&&!setsFor(x)[si].d;})[0];
    return later?'Then straight to '+esc(later.n)+', no rest':(restSec()?'Then rest '+mmssF(restSec()):''); }
  var a=setsFor(ex), n=nSets(ex,a); if(si+1<n){ var q=a[si+1]; return 'Up next: set '+(si+2)+(q&&(q.w||q.r)?' · '+esc(GFDRules.lastSetParts([q],labOf(ex),U())[0]||''):''); }
  return nx?'Last set, then '+esc(nx.ex.n):'Last set of the workout';
}
/* the ⋯ sheet: everything the open exercise card used to show above its sets */
function fxToolsHtml(ex,miss){
  var nt=noteOf(ex.id), h='<div class="fx-scrim" data-fx="tools"></div><div class="fx-sheet" role="dialog" aria-modal="true" aria-labelledby="fxTitle" id="fxSheet"><div class="fx-grab" aria-hidden="true"></div>';
  h+='<div class="fx-sheethead"><h2 id="fxTitle">'+esc(ex.n)+'</h2><button class="fx-nav" data-fx="tools" aria-label="Close">✕</button></div>';
  if(nt) h+='<div class="injnote"><b>Injury note</b><p>'+esc(nt)+'</p></div>';
  if(miss.length){ var lo=dayLoc(activePlan().id,DAYS[day].id); h+='<div class="gearwarn"><p>Not possible at '+esc(lo.name)+': needs '+esc(needsText(LIB[ex.id],DAYGEAR))+'. Swap it for:</p>'+swapPanelHtml(ex,true)+'</div>'; }
  h+=swapBarHtml(ex,miss.length>0);
  if(SWAP&&SWAP.ex===ex.id&&!miss.length) h+=swapPanelHtml(ex,false);
  h+='<div class="last">'+esc(lastText(ex))+'</div>';
  h+='<div class="fx-links"><button class="linkbtn hlink" data-hex="'+ex.id+'">See history and progress</button><button class="linkbtn hlink notelink" data-note="'+ex.id+'" aria-label="'+(nt?'Edit':'Add')+' injury note for '+esc(ex.n)+'">'+NOTE_SVG+(nt?'Edit injury note':'Add injury note')+'</button></div>';
  h+='<details class="how"><summary>How to do it safely</summary>'+exFigure(ex.id,ex.f)+'<ul class="cues">'+(ex.c||[]).map(function(c){return '<li>'+esc(c)+'</li>';}).join("")+'</ul></details>';
  h+='<div class="fx-sheetfoot"><button class="ghost" data-fx="list">Show all exercises</button><button class="ghost" id="editDay">Edit workout</button></div></div>';
  return h;
}
/* the timer and workout clock update in place, so nothing on the screen jumps */
function focusRing(){
  var big=document.getElementById("fxBig"); if(!big) return;
  var rest=fxResting(), ring=big.closest(".fx-ring");
  if(rest!==ring.classList.contains("rest")||(!rest&&ring.classList.contains("idle")&&fxStarted())){ renderFocus(); return; }
  if(rest){ var left=(tEnd-Date.now())/1000; big.textContent=mmssF(left); var a=document.getElementById("fxArc"); if(a) a.setAttribute("stroke-dashoffset",(FX_C*(1-left/tTotal)).toFixed(1)); }
}
function fxClockStart(){
  clearInterval(FX.clock);
  FX.clock=setInterval(function(){
    var c=document.getElementById("fxClock"); if(!c){ clearInterval(FX.clock); return; }
    var st=fxStarted(); c.textContent=st?"Workout "+mmssF((Date.now()-st)/1000):"";
    focusRing();
  },500);
}

/* ---------- actions ---------- */
function fxGo(id,keepPrev){ FX.id=id; FX.si=null; FX.sw=false; if(!keepPrev) FX.prev=null; renderFocus(); }
/* after a set is ticked (from here or from askJump's Keep): move to where the thumb should go next */
function focusTicked(ex,i,done){
  if(!done||!document.getElementById("fx")) return;
  var it=fxItem(ex.id); if(!it){ renderFocus(); return; }
  FX.si=null; FX.prev=null; FX.sw=false;
  if(it.g){
    var later=it.g.items.slice(it.k+1).filter(function(x){return nSets(x)>i&&!setsFor(x)[i].d;})[0];
    if(later){ FX.id=later.id; FX.sw=true; renderFocus(); return; }
    var first=it.g.items.filter(function(x){return !exDoneF(x);})[0];
    if(first){ FX.id=first.id; renderFocus(); return; }
    var nxg=fxNextOpen(it.g.items[it.g.items.length-1].id);
    if(nxg){ FX.prev=ex.id; FX.id=nxg.ex.id; toast((it.g.kind==="circuit"?"Circuit":"Superset")+" done. Next: "+nxg.ex.n); }
    renderFocus(); return;
  }
  if(exDoneF(ex)){ var nx=fxNextOpen(ex.id); if(nx){ FX.prev=ex.id; FX.id=nx.ex.id; toast("Next: "+nx.ex.n); } }
  renderFocus();
}
function fxAddSet(ex){ var a=setsFor(ex), n=nSets(ex,a), l=a[n-1]||{}; a.splice(n,0,{w:l.w||"",r:l.r||"",d:false,x:1,t:1}); }
function fxAdd(id){
  var it=fxItem(id); if(!it) return;
  (it.g?it.g.items:[it.ex]).forEach(fxAddSet);
  save(); FX.prev=null; FX.si=null; FX.id=it.g?it.g.items[0].id:id; updateProgress(); renderFocus();
  toast(it.g?"Extra round added":"Extra set added");
}
function focusClick(t){
  var a=t.dataset.fx; if(!a) return false;
  var it=fxCurrent(), ex=it&&it.ex;
  if(a==="start"||(a==="ring"&&!fxStarted())){ S.fstart={day:DAYS[day].id,at:Date.now(),who:S.who||0}; save(); audio(); renderFocus(); var gb=document.querySelector(".fx-go"); if(gb) gb.focus({preventScroll:true}); return true; }
  if(a==="ring") return true;
  if(a==="log"){ var i=t.dataset.i!=null?+t.dataset.i:openSet(ex); if(i>=0&&!setsFor(ex)[i].d) tickSet(ex,i); return true; }
  if(a==="back"){ FX.si=null; renderFocus(); return true; }
  if(a==="set"){ var k=+t.dataset.i; FX.si=k===openSet(ex)?null:k; renderFocus(); var w=document.querySelector('#fx input[data-f="w"]')||document.querySelector('#fx input[data-f="r"]'); if(w&&FX.si!=null) w.focus({preventScroll:true}); return true; }
  if(a==="add"){ fxAdd(ex.id); return true; }
  if(a==="addprev"){ if(FX.prev) fxAdd(FX.prev); return true; }
  if(a==="next"||a==="prev"){
    if(a==="next"&&t.classList.contains("fx-go")){ var nx=fxNextOpen(ex.id); if(nx) fxGo(nx.ex.id); return true; }
    var o=fxOrder(), at=0; o.forEach(function(x,i2){ if(x.ex===ex) at=i2; });
    fxGo(o[(at+(a==="next"?1:-1)+o.length)%o.length].ex.id); return true;
  }
  if(a==="go"){ fxGo(t.dataset.id); return true; }
  if(a==="tools"){ FX.tools=!FX.tools; if(!FX.tools) SWAP=null; renderFocus(); var f=FX.tools?document.getElementById("fxSheet"):document.querySelector(".fx-more"); if(f){ if(FX.tools) f.setAttribute("tabindex","-1"); f.focus({preventScroll:true}); } return true; }
  if(a==="list"){ FX.tools=false; S.dayView="list"; save(); document.body.classList.remove("focusview"); renderDay(); window.scrollTo(0,0); return true; }
  if(a==="focus"){ S.dayView="focus"; save(); renderDay(); window.scrollTo(0,0); return true; }
  if(a==="t30"){ if(fxResting()){ tEnd+=30000; tTotal+=30; schedulePing((tEnd-Date.now())/1000); platform.restAlert(tEnd); focusRing(); } return true; }
  if(a==="skip"){ stopTimer(); tEnd=0; renderFocus(); return true; }
  if(a==="finish"){ finishWorkout(); return true; }
  return false;
}
/* swipe the set card sideways to move between exercises (the ‹ › buttons do the same) */
(function(){
  var sx=null, sy=0;
  document.addEventListener("touchstart",function(e){ var c=e.target.closest&&e.target.closest("#fxCard"); if(!c||e.target.closest("input,button")){ sx=null; return; } sx=e.touches[0].clientX; sy=e.touches[0].clientY; },{passive:true});
  document.addEventListener("touchend",function(e){
    if(sx===null) return; var t=e.changedTouches[0], dx=t.clientX-sx, dy=t.clientY-sy; sx=null;
    if(Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)*1.5){ var b=document.querySelector('.fx-nav[data-fx="'+(dx<0?"next":"prev")+'"]'); if(b) focusClick(b); }
  },{passive:true});
})();
