/* ---------- render ---------- */
/* the bottom tab bar (tabs.js) is the main menu; refresh it and the More page (reply dot, admin row) */
function renderNav(){
  renderTabbar();
  var m=document.getElementById("more"); if(m&&!m.hidden) renderMore();
}
function themePref(){var t=S.theme; if(t!=="light"&&t!=="dark"&&t!=="auto"){try{t=localStorage.getItem("split5-theme")||"auto";}catch(e){t="auto";}} return t;}
function applyTheme(){
  var t=themePref(), r=document.documentElement;
  if(t==="light"||t==="dark") r.setAttribute("data-theme",t); else r.removeAttribute("data-theme");
  try{localStorage.setItem("split5-theme",t);}catch(e){}
  var c=palPref(); if(c!=="volt") r.setAttribute("data-palette",c); else r.removeAttribute("data-palette");
  try{localStorage.setItem("split5-palette",c);}catch(e){}
  if(window.artRetheme) artRetheme();
  if(window.msFigMount&&document.getElementById("msFigDefs")) msFigMount();
}
/* colour themes, picked under More: GFD volt green is the default; the others are softer looks */
var PALETTES=[["volt","GFD","#D4FF3A","#0D0F12"],["flow","Flow","#F7B6C8","#B24A6F"],["drift","Drift","#D3C2F2","#6A55A3"],["glow","Glow","#FFC6AB","#B4553C"]];
function palPref(){var c=S.palette; if(!PALETTES.some(function(p){return p[0]===c;})){try{c=localStorage.getItem("split5-palette");}catch(e){c=null;} if(!PALETTES.some(function(p){return p[0]===c;})) c="volt";} return c;}
/* one button with the full day name; tap it to pick another day of the plan */
var DAY_CHEV='<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function isToday(d){return !!d&&d.id===WEEK[(new Date().getDay()+6)%7].id;}
function renderTabs(){
  var tb=document.getElementById("tabs"), d=DAYS[day]; if(!tb) return;
  if(!d){tb.innerHTML="";return;}
  var one=DAYS.length<2, tag='<span class="dm-today">Today</span>';
  var h='<button class="daybtn" id="dayBtn"'+(one?' disabled':' aria-haspopup="true" aria-expanded="false" aria-controls="dayMenu"')+'>'+
    '<span class="dn"><b>'+esc(weekLong(d.id))+(isToday(d)?tag:'')+'</b><small>'+(one?'Today’s session':'Day '+(day+1)+' of '+DAYS.length+' · tap to change')+'</small></span>'+(one?'':DAY_CHEV)+'</button>';
  if(!one) h+='<div class="menu daymenu" id="dayMenu" hidden><div class="menu-lbl2">Pick a day</div>'+DAYS.map(function(x,i){
    return '<button class="menu-item dm-item" data-day="'+i+'" aria-pressed="'+(i===day)+'"><span class="dn"><span>'+esc(weekLong(x.id))+(isToday(x)?tag:'')+'</span><small>'+esc(x.title)+'</small></span>'+(i===day?'<b aria-hidden="true">✓</b>':'')+'</button>';
  }).join("")+'</div>';
  tb.innerHTML=h;
}
function setDayMenu(open){
  var m=document.getElementById("dayMenu"), b=document.getElementById("dayBtn"); if(!m||!b) return;
  m.hidden=!open; b.setAttribute("aria-expanded",open?"true":"false");
  if(open){var c=m.querySelector('[aria-pressed="true"]')||m.querySelector(".dm-item"); if(c) c.focus();}
}
function lastText(ex){
  var L=lastFor(ex.id,ex); if(!L||!L.sets||!L.sets.length) return labOf(ex)[0]==="kg"?"First time: pick a weight you can do with good form.":"First time: start easy and log what you do.";
  var parts=GFDRules.lastSetParts(L.sets,labOf(ex));
  var dt=new Date(L.date); var ds=isNaN(dt)?"":" ("+dt.toLocaleDateString(undefined,{weekday:"short",day:"numeric",month:"short"})+")";
  return "Last time"+ds+": "+parts.join(", ");
}
function groupsOf(d){
  var out=[], i=0;
  while(i<d.ex.length){
    var ex=d.ex[i];
    if(ex.ss==="c"){var gc=[ex]; while(d.ex[i+1]&&d.ex[i+1].ss==="c"){gc.push(d.ex[++i]);} out.push({kind:"circuit",items:gc});}
    else if(ex.ss==="a"){var gs=[ex]; while(d.ex[i+1]&&d.ex[i+1].ss==="b"){gs.push(d.ex[++i]);} out.push({kind:"superset",items:gs});}
    else out.push({kind:"single",items:[ex]});
    i++;
  }
  return out;
}
/* grey hints in empty boxes are just the units: values come from last time as real numbers (setsFor) */
function phFor(ex){ return labOf(ex); }
/* after a change, show the values of the boxes you haven't touched (they follow your earlier sets) */
function refreshSets(ex){
  var arr=setsFor(ex);
  for(var i=0;i<ex.sets;i++){
    var s=arr[i]; if(s.d||s.t) continue;
    ["w","r"].forEach(function(f){
      var el=document.querySelector('input[data-ex="'+ex.id+'"][data-i="'+i+'"][data-f="'+f+'"]');
      if(el&&el!==document.activeElement&&el.value!==s[f]) el.value=s[f];
    });
  }
}
var DAYGEAR=null;
var DEL_SVG='<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
var PIN_SVG='<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="10" r="2.6" fill="currentColor"/></svg>';
var CHEV_SVG='<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
var OK_SVG='<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor" opacity=".18"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
var WARN_SVG='<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l10 18H2z" fill="currentColor" opacity=".18"/><path d="M12 10v5M12 18v.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
function setDayLocMenu(open){var m=document.getElementById("dayLocMenu"),b=document.getElementById("dayLocBtn");if(!m||!b)return;m.hidden=!open;b.setAttribute("aria-expanded",open?"true":"false");}
var NOTE_SVG='<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><g transform="rotate(-45 12 12)"><rect x="1.5" y="7.5" width="21" height="9" rx="4.5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="8.5" y="7.5" width="7" height="9" fill="currentColor" opacity=".35"/></g></svg>';
function noteOf(id){return (S.notes&&S.notes[id])||"";}
function setNumHtml(ex,i,done){ return '<b>'+(i+1)+'</b>'+(done?'<button class="setdel" data-sdel="'+ex.id+'" data-i="'+i+'" aria-label="Delete set '+(i+1)+' of '+esc(ex.n)+'">'+DEL_SVG+'</button>':''); }
function exHtml(ex){
  var arr=setsFor(ex), h="";
  var nd=arr.slice(0,ex.sets).filter(function(s){return s.d;}).length;
  h+='<details class="ex'+(nd===ex.sets?' alldone':'')+'" data-ex="'+ex.id+'"'+(OPEN[day+":"+ex.id]?' open':'')+'>';
  var nt=noteOf(ex.id);
  var exMiss=DAYGEAR&&LIB[ex.id]?missingFor(LIB[ex.id],DAYGEAR):[];
  h+='<summary><div class="ttl"><h3>'+esc(ex.n)+'</h3>'+(exMiss.length?'<span class="nogear">Needs gear</span>':'')+'</div><div class="meta"><span class="target">'+ex.sets+' × '+esc(ex.reps)+'</span><span class="cntrow"><button class="notebtn'+(nt?' has':'')+'" data-note="'+ex.id+'" aria-label="'+(nt?'Edit':'Add')+' injury note for '+esc(ex.n)+'" title="Injury note">'+NOTE_SVG+'</button><span class="cnt'+(nd===ex.sets?' all':'')+'">'+nd+'/'+ex.sets+' sets</span></span></div></summary>';
  if(nt) h+='<div class="injnote"><b>Injury note</b><p>'+esc(nt)+'</p></div>';
  if(exMiss.length){
    var lo2=dayLoc(activePlan().id,DAYS[day].id);
    h+='<div class="gearwarn"><p>Not possible at '+esc(lo2.name)+': needs '+esc(needsText(LIB[ex.id],DAYGEAR))+'. Swap it for:</p>'+swapPanelHtml(ex,true)+'</div>';
  }
  h+=swapBarHtml(ex,exMiss.length>0);
  if(SWAP&&SWAP.ex===ex.id&&!exMiss.length&&!(DAYS[day]&&DAYS[day].coles)) h+=swapPanelHtml(ex,false);
  h+='<div class="last">'+esc(lastText(ex))+'</div><button class="linkbtn hlink" data-hex="'+ex.id+'">See history and progress</button>';
  if(DAYS[day]&&DAYS[day].coles) h+='<button class="chip sm colesswap" data-colesswap="'+ex.id+'">↻ Different '+esc((LIB[ex.id]||{}).mg||"").toLowerCase()+' exercise</button>';
  h+='<details class="how"><summary>How to do it safely</summary>'+exFigure(ex.id,ex.f)+'<ul class="cues">'+ex.c.map(function(c){return '<li>'+esc(c)+'</li>';}).join("")+'</ul></details>';
  var lb=labOf(ex);
  h+='<div class="sets"><div class="setrow" aria-hidden="true"><span></span><span class="lbl">'+lb[0]+'</span><span class="lbl">'+lb[1]+'</span><span></span></div>';
  var missed=[];
  arr.slice(0,ex.sets).forEach(function(s,i){
    var ph=phFor(ex), wp=ph[0], rp=ph[1], ms=s.d&&GFDRules.isMissed(lb,s,ex.reps);
    if(ms) missed.push(i+1);
    h+='<div class="setrow'+(s.d?' isdone':'')+(ms?' missed':'')+'"><span class="n">'+setNumHtml(ex,i,s.d)+'</span>'+
      (lb[0]?'<input inputmode="decimal" aria-label="Set '+(i+1)+' '+lb[0]+'" data-ex="'+ex.id+'" data-i="'+i+'" data-f="w" value="'+esc(s.w)+'" placeholder="'+esc(wp)+'">':'<span></span>')+
      '<input inputmode="decimal" aria-label="Set '+(i+1)+' '+lb[1]+'" data-ex="'+ex.id+'" data-i="'+i+'" data-f="r" value="'+esc(s.r)+'" placeholder="'+esc(rp)+'">'+
      '<button class="tick" aria-label="Mark set '+(i+1)+' done" aria-pressed="'+!!s.d+'" data-tick="'+ex.id+'" data-i="'+i+'">✓</button></div>';
  });
  h+='</div>'+missNote(ex,missed)+'</details>';
  return h;
}
/* ticked sets short of the planned reps: saved, but never counted as a win (F2) */
function missNote(ex,missed){
  if(!missed.length) return '<p class="missnote" data-miss="'+esc(ex.id)+'" hidden></p>';
  return '<p class="missnote" data-miss="'+esc(ex.id)+'">'+(missed.length===1?'Set '+missed[0]:'Sets '+missed.join(", "))+' missed the target of '+esc(ex.reps)+'. That’s fine: '+(missed.length===1?'it’s':'they’re')+' saved, just not counted as a record.</p>';
}
function grpHtml(g){
  var first=g.items[0], tot=0, nd=0;
  g.items.forEach(function(ex){var a=setsFor(ex);for(var i=0;i<ex.sets;i++){tot++;if(a[i].d)nd++;}});
  var label=first.gl||(g.kind==="circuit"?"Circuit":"Superset");
  var hint=g.kind==="circuit"?"Go straight from one exercise to the next. The rest timer starts once set 1 of every exercise is ticked, and so on.":"Do one set of each, back and forth. The rest timer starts once both set 1s are ticked, then both set 2s, and so on.";
  var h='<details class="grp" data-g="'+g.items.map(function(x){return x.id;}).join(",")+'" data-gk="'+first.id+'"'+(OPEN[day+":g:"+first.id]?' open':'')+'>';
  h+='<summary><div class="gt"><b>'+esc(label)+'</b><span>'+g.items.length+' exercises</span></div><span class="gcnt'+(nd===tot?' all':'')+'">'+nd+'/'+tot+' sets</span></summary>';
  h+='<p class="ghint">'+hint+'</p>'+g.items.map(exHtml).join("")+'</details>';
  return h;
}
function renderDay(){
  var d=DAYS[day], h="";
  if(d.coles){
    DAYGEAR=null;
    h+='<div class="dayhead"><h2>'+esc(d.title)+'</h2></div>'+colesPanelHtml();
    if(d.ex.length&&!colesState().editing){
      h+='<div class="progress"><div class="bar"><i id="pbar"></i></div><span id="ptext"></span></div>';
      groupsOf(d).forEach(function(g){ h+=exHtml(g.items[0]); });
      h+='<div class="actions"><button class="primary" id="finish">Complete workout</button></div>';
    }
    document.getElementById("day").innerHTML=h; updateProgress(); return;
  }
  h+=msDueHtml("day")+'<div class="dayhead"><h2>'+esc(d.title)+'</h2><button class="linkbtn" id="editDay">Edit workout</button></div>';
  var pid=activePlan().id, lo=dayLoc(pid,d.id), set=!!dayLocOf(pid,d.id), miss=[];
  DAYGEAR=lo.gear.length?lo.gear:null;
  if(DAYGEAR) d.ex.forEach(function(x){var L=LIB[x.id]; if(L&&missingFor(L,DAYGEAR).length) miss.push(x);});
  h+='<div class="dayloc"><button id="dayLocBtn" class="locpill" aria-haspopup="true" aria-expanded="false" aria-controls="dayLocMenu">'+PIN_SVG+'<span>At '+esc(lo.name)+(set?'':' <i>(default)</i>')+'</span>'+CHEV_SVG+'</button>'+
    '<div class="menu daylocmenu" id="dayLocMenu" hidden><div class="menu-lbl2">Where are you training on '+weekLong(d.id)+'?</div>'+
    locState().list.map(function(l){return '<button class="menu-item pm-item" data-dayloc="'+l.id+'" aria-pressed="'+(l.id===lo.id)+'"><span>'+esc(l.name)+' <small>'+l.gear.length+' items</small></span>'+(l.id===lo.id?'<b aria-hidden="true">✓</b>':'')+'</button>';}).join("")+
    '<button class="menu-item pm-manage" id="dayLocSetup">Set up locations and gear</button></div></div>';
  if(d.ex.length){
    if(!DAYGEAR) h+='<div class="ready none">No equipment set for '+esc(lo.name)+' yet, so this can’t be checked. <button class="linkbtn" id="dayLocSetup2">Set it up</button></div>';
    else if(!miss.length) h+='<div class="ready ok">'+OK_SVG+'<span>Everything for today is at '+esc(lo.name)+'.</span></div>';
    else h+='<div class="ready warn">'+WARN_SVG+'<span><b>'+miss.length+' of '+d.ex.length+' exercises</b> need gear that isn’t at '+esc(lo.name)+'. Open them to swap.</span></div>';
  }
  h+='<div class="progress"><div class="bar"><i id="pbar"></i></div><span id="ptext"></span></div>';
  if(!d.ex.length) h+='<div class="emptyday"><p>'+(d.title==="Rest day"?'Rest day. Recover, walk, stretch.':'No exercises on this day yet.')+'</p><button class="'+(d.title==="Rest day"?'ghost':'primary')+'" id="editDay2">Add exercises</button></div>';
  groupsOf(d).forEach(function(g){ h+= g.kind==="single" ? exHtml(g.items[0]) : grpHtml(g); });
  h+='<div class="actions"><button class="primary" id="finish">Complete workout</button></div>';
  document.getElementById("day").innerHTML=h;
  updateProgress();
}
function updateProgress(){
  var d=DAYS[day], tot=0, done=0;
  d.ex.forEach(function(ex){var a=setsFor(ex);for(var i=0;i<ex.sets;i++){tot++;if(a[i].d)done++;}});
  var pb=document.getElementById("pbar"), pt=document.getElementById("ptext");
  if(pb) pb.style.width=(tot?done/tot*100:0)+"%";
  if(pt) pt.textContent=done+" of "+tot+" sets";
  d.ex.forEach(function(ex){
    var el=document.querySelector('details.ex[data-ex="'+ex.id+'"]'); if(!el) return;
    var a=setsFor(ex), n=0; for(var i=0;i<ex.sets;i++) if(a[i].d) n++;
    var c=el.querySelector(".cnt"); if(c){c.textContent=n+"/"+ex.sets+" sets";c.classList.toggle("all",n===ex.sets);}
    el.classList.toggle("alldone",n===ex.sets);
  });
  document.querySelectorAll("details.grp").forEach(function(g){
    var tot=0,n=0;
    g.dataset.g.split(",").forEach(function(id){var ex=findEx(id); if(!ex) return; var a=setsFor(ex); for(var i=0;i<ex.sets;i++){tot++; if(a[i].d) n++;}});
    var c=g.firstElementChild&&g.firstElementChild.querySelector(".gcnt"); if(c){c.textContent=n+"/"+tot+" sets";c.classList.toggle("all",n===tot);}
  });
}
function renderAll(){applyTheme();DAYS=buildDays();
  if(pickToday){var tid=WEEK[(new Date().getDay()+6)%7].id;day=0;DAYS.forEach(function(d,i){if(d.id===tid)day=i;});pickToday=false;}
  if(day>=DAYS.length) day=0;
  renderPlanBtn();renderNav();renderTabs();renderDay();setStatus();}

/* ---------- events ---------- */
document.addEventListener("click",function(e){
  var gsum=e.target.closest("details.grp > summary"); if(gsum) GRPCLICK=gsum.parentElement;
  if(!e.target.closest("#planMenu")&&!e.target.closest("#planBtn")) setPlanMenu(false);
  if(!e.target.closest("#dayLocMenu")&&!e.target.closest("#dayLocBtn")) setDayLocMenu(false);
  if(e.target.closest("#dayBtn")){var dm=document.getElementById("dayMenu");setPlanMenu(false);setDayMenu(dm&&dm.hidden);return;}
  if(!e.target.closest("#dayMenu")) setDayMenu(false);
  var t=e.target.closest("button"); if(!t) return;
  if(tabsClick(t)) return;
  if(msClick(t)) return;
  if(libraryClick(t)) return;
  if(statsClick(t)) return;
  if(t.dataset.note){e.preventDefault();openNote(t.dataset.note);return;}
  if(t.id==="openSugg"){openSugg();return;}
  if(t.id==="openFeedback"){openFeedback();return;}
  if(t.id==="doneClose"){closeDone();var fb=document.getElementById("dayBtn");if(fb)fb.focus({preventScroll:true});return;}
  if(t.id==="doneHistory"){closeDone();openHistory();return;}
  if(historyClick(t)) return;
  if(feedbackClick(t)) return;
  if(suggClick(t)) return;
  if(webAuthClick(t)) return;
  if(onboardClick(t)) return;
  if(backupClick(t)) return;
  if(t.id==="signOut"){ if(!confirmTap(t,"Sign out","Tap again to sign out")) return; webSignOut(); return; }
  if(swapsClick(t)) return;
  if(locClick(t)) return;
  if(wizardClick(t)) return;
  if(plansClick(t)) return;
  if(t.id==="nCancel"){closeNote();return;}
  if(t.id==="nSave"){saveNote(false);return;}
  if(t.id==="nDelete"){saveNote(true);return;}
  if(builderClick(t)) return;
  if(t.dataset.palset){S.palette=t.dataset.palset;save();applyTheme();document.querySelectorAll("[data-palset]").forEach(function(b){b.setAttribute("aria-pressed",b===t?"true":"false");});return;}
  if(t.dataset.themeset){S.theme=t.dataset.themeset;save();applyTheme();document.querySelectorAll("[data-themeset]").forEach(function(b){b.setAttribute("aria-pressed",b===t?"true":"false");});return;}
  if(colesClick(t)) return;
  if(t.id==="editDay"||t.id==="editDay2"){openBuilder();return;}
  if(t.id==="dayLocSetup2"){setLoc(dayLoc(activePlan().id,DAYS[day].id).id);openEquip();return;}
  if(t.id==="openProfile"){openProfile();return;}
  if(t.id==="closeEquip"){closeEquip();return;}
  if(t.dataset.gear){toggleGear(t.dataset.gear);return;}
  if(t.id==="clearSearch"){var q=document.getElementById("eqSearch");q.value="";renderGear();q.focus();return;}
  if(t.id==="closeProfile"){closeProfile();return;}
  if(t.id==="saveAcct"){saveAcct();return;}
  if(t.id==="testPing"){schedulePing(3);return;}
  if(aboutClick(t)) return;
  if(t.dataset.celebset){S.celebrate=t.dataset.celebset;save();document.querySelectorAll("[data-celebset]").forEach(function(b){b.setAttribute("aria-pressed",b===t?"true":"false");});toast(t.dataset.celebset==="calm"?"Calm: quieter words, no confetti":"Energetic: cheers and confetti for real wins");return;}
  if(t.dataset.day!==undefined){day=+t.dataset.day;renderTabs();renderDay();window.scrollTo(0,0);var db=document.getElementById("dayBtn");if(db)db.focus({preventScroll:true});return;}
  if(t.dataset.tick){ tickSet(findEx(t.dataset.tick),+t.dataset.i,t); return; }
  if(t.dataset.sdel){ deleteSet(findEx(t.dataset.sdel),+t.dataset.i); return; }
  if(t.id==="toastAct"){ if(toast._act){var fn=toast._act; toast._act=null; document.getElementById("toast").classList.remove("on"); fn();} return; }
  if(t.id==="askKeep"||t.id==="askFix"){ askAnswer(t.id==="askKeep"); return; }
  if(t.id==="finish"){finishWorkout();return;}
  if(t.id==="tskip"){stopTimer();return;}
  if(t.id==="t30"){tEnd+=30000;tTotal+=30;schedulePing((tEnd-Date.now())/1000);return;}
});
document.addEventListener("keydown",function(e){
  if(OB&&e.key==="Escape") return;
  if(e.key==="Escape"){var ap=document.getElementById("askpop");if(ap&&!ap.hidden){askAnswer(false);return;}}
  if(e.key==="Escape"){var dp=document.getElementById("donepop");if(dp&&!dp.hidden){closeDone();return;}}
  if(H&&e.key==="Escape"){if(H.edit){H.edit=null;renderHistory(true);}else if(H.del){H.del=null;renderHistory(true);}else if(H.ex&&!H.fromEx){document.getElementById("histBack").click();}else closeHistory();return;}
  if(SG&&e.key==="Escape"){closeSugg();return;}
  if(FB&&e.key==="Escape"){if(FB.view){FB.view=null;renderFeedback(true);}else closeFeedback();return;}
  if(OB&&e.key==="Enter"&&/^(obEmail|obName|obPass)$/.test(e.target.id)){var pb=document.querySelector("#onboard .primary");if(pb)pb.click();return;}
  if(OB&&e.key==="Enter"&&e.target.id==="obLoc"){document.getElementById("obLocNext").click();return;}
  if(e.key==="Enter"&&e.target.id==="locName"){var ls=document.getElementById("locSave");if(ls)ls.click();return;}
  if(e.key==="Escape"&&LOC_MODE){LOC_MODE=null;renderLocBar();return;}
  if(e.key==="Enter"&&e.target.id==="plName"){var sb=document.querySelector("[data-saveren]");if(sb)sb.click();return;}
  if(e.key==="Escape"&&WZ){var eqs=document.getElementById("equip"); if(eqs&&!eqs.hidden) return; if(BD&&BD.wizard&&BD.view==="peek"){peekBack(BD.peek);} else if(BD&&BD.wizard&&(BD.view==="pick"||BD.view==="rep")){BD.view="edit";renderBuilder();} else toast("Tap Cancel to leave setup"); return;}
  if(e.key==="Escape"&&SWAP&&!BD&&!EL&&!H){var se=SWAP.ex;SWAP=null;renderDay();var sb2=document.querySelector('[data-swopen="'+se+'"]');if(sb2)sb2.focus({preventScroll:true});return;}
  if(e.key==="Escape"){var dym=document.getElementById("dayMenu");if(dym&&!dym.hidden){setDayMenu(false);document.getElementById("dayBtn").focus();return;}}
  if(e.key==="Escape"){var dlm=document.getElementById("dayLocMenu");if(dlm&&!dlm.hidden){setDayLocMenu(false);document.getElementById("dayLocBtn").focus();return;}}
  if(e.key==="Escape"){var pm=document.getElementById("planMenu");if(pm&&!pm.hidden){setPlanMenu(false);document.getElementById("planBtn").focus();return;}}
  if(e.key==="Escape"){var ps=document.getElementById("plans");if(ps&&!ps.hidden){if(PL_REN){PL_REN=null;renderPlans();}else closePlans();return;}}
  if(e.key==="Escape"){var ns=document.getElementById("notesheet");if(ns&&!ns.hidden){closeNote();return;}}
  if(e.key==="Escape"&&BD){ if(BD.view==="peek") peekBack(BD.peek); else if(BD.view==="pick"||BD.view==="rep"){BD.view="edit";renderBuilder();} else if(!BD.dirty) closeBuilder(); else toast("Tap Save workout or Cancel"); return; }
  if(e.key==="Escape"){var eq=document.getElementById("equip");if(eq&&!eq.hidden){closeEquip();return;}}
  if(e.key==="Escape"){var sh=document.getElementById("profile");if(sh&&!sh.hidden){closeProfile();return;}}
  if(EL&&e.key==="Escape"){if(EL.view){document.getElementById("libBack").click();}else closeLibrary();return;}
  if(e.key==="Escape"){var mo=document.getElementById("more");if(mo&&!mo.hidden){closeMore();return;}}
});
document.addEventListener("input",function(e){
  var el=e.target; if(builderInput(el)||libraryInput(el)||historyInput(el)) return;
  if(el.id==="eqSearch"){renderGear();return;}
  if(el.dataset&&el.dataset.pf){el.removeAttribute("aria-invalid");return;}
  if(!el.dataset||!el.dataset.ex) return;
  var ex=findEx(el.dataset.ex); var arr=setsFor(ex);
  var st=arr[+el.dataset.i]; st[el.dataset.f]=el.value.replace(",",".").slice(0,6); st.t=1; delete st.pre;
  refreshSets(ex); save();
});
document.addEventListener("toggle",function(e){
  var el=e.target; if(!el||!el.classList) return;
  if(el.classList.contains("eqfold")){if(!(document.getElementById("eqSearch")||{}).value) EQ_OPEN[el.dataset.eqg]=el.open; return;}
  if(el.classList.contains("ex")){OPEN[day+":"+el.dataset.ex]=el.open;}
  else if(el.classList.contains("grp")){
    OPEN[day+":g:"+el.dataset.gk]=el.open;
    if(el.open&&GRPCLICK===el){el.querySelectorAll("details.ex").forEach(function(x){x.open=true;});}
    if(GRPCLICK===el) GRPCLICK=null;
  }
},true);
