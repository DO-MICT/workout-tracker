/* ---------- injury notes (one per exercise, shared across days). Health details: health.js keeps them on the server (WP9) ---------- */
var NOTE_ID=null;
function openNote(id){
  var L=LIB[id]||findEx(id); if(!L) return;
  if(!healthMayEdit(id)) return;   /* signed in without health consent: ask first (health.js, WP9) */
  NOTE_ID=id;
  var sh=document.getElementById("notesheet"), cur=noteOf(id);
  sh.innerHTML='<div class="sheet-in"><div class="sheet-top"><h2 id="ntitle">Injury note</h2><button class="chip" id="nCancel">Cancel</button></div>'+
    '<p class="sub">'+esc(L.n)+'. Shows on this exercise every time it comes up.</p>'+
    '<textarea id="nText" maxlength="400" rows="5" placeholder="e.g. Left shoulder: keep elbows tucked, stop at any pinch." aria-label="Injury note for '+esc(L.n)+'">'+esc(cur)+'</textarea>'+
    '<button class="primary" id="nSave">Save note</button>'+(cur?'<button class="ghost bre" id="nDelete">Delete note</button>':'')+'</div>';
  sh.hidden=false; document.body.style.overflow="hidden";
  var ta=document.getElementById("nText"); ta.focus(); ta.setSelectionRange(ta.value.length,ta.value.length);
}
function closeNote(){
  var sh=document.getElementById("notesheet"); if(!sh||sh.hidden) return;
  sh.hidden=true; sh.innerHTML=""; document.body.style.overflow="";
  var b=document.querySelector('[data-note="'+NOTE_ID+'"]'); NOTE_ID=null; if(b) b.focus();
}
function saveNote(del){
  if(!NOTE_ID) return; if(!S.notes) S.notes={};
  var v=del?"":(document.getElementById("nText").value||"").trim(), id=NOTE_ID;
  if(v) S.notes[id]=v; else delete S.notes[id];
  save(); healthNoteChanged(id,v); OPEN[day+":"+id]=true; closeNote(); renderDay();
  var b=document.querySelector('[data-note="'+id+'"]'); if(b) b.focus();
  toast(v?"Note saved":"Note deleted");
}
/* ---------- workout builder ---------- */
var BD=null; /* draft: {day, title, ex:[{id,sets,reps,link}], view:"edit"|"pick", q, mg, all, dirty} */
function draftFromDay(i){
  var d=planDay(i); /* the plan as saved, without today-only swaps */
  return {day:i,title:d.title,dirty:false,view:"edit",q:"",mg:"",all:false,
    ex:d.ex.map(function(x,k){var nx=d.ex[k+1];return {id:x.id,sets:x.sets,reps:x.reps,
      link:!!nx&&((x.ss==="a"&&nx.ss==="b")||(x.ss==="b"&&nx.ss==="b")||(x.ss==="c"&&nx.ss==="c"))};})};
}
function openBuilder(){
  if(DAYS[day]&&DAYS[day].coles){toast("Tap New session to change Cole’s Session");return;}
  BD=draftFromDay(day); BD.loc=dayLocOf(activePlan().id,DAYS[day].id);
  var sh=document.getElementById("builder"); sh.hidden=false; document.body.style.overflow="hidden";
  renderBuilder(); sh.scrollTop=0; sh.focus();
}
function closeBuilder(){
  var sh=document.getElementById("builder"); if(!sh||sh.hidden) return;
  sh.hidden=true; sh.innerHTML=""; document.body.style.overflow=""; BD=null;
}
function bSheet(){return document.getElementById(BD&&BD.wizard?"wizard":"builder");}
function renderBuilder(){
  var sh=bSheet(); if(!sh||!BD) return;
  if(BD.view==="peek"&&LIB[BD.peek]){ renderPeek(sh); return; }
  if(BD.view==="pick"){ renderPicker(sh); return; }
  if(BD.view==="rep"&&BD.ex[BD.rep]){ renderReplace(sh); return; }
  var d=BD.wizard?null:DAYS[BD.day], h;
  if(BD.wizard) h=wzBuilderChrome();
  else h='<div class="sheet-in"><div class="sheet-top"><h2 id="btitle">Edit '+esc(weekLong(d.id))+'</h2><button class="chip" id="bCancel">Cancel</button></div>';
  h+='<label class="bname"><span>'+(BD.wizard?'Day name':'Workout name')+'</span><input id="bTitle" maxlength="28" value="'+esc(BD.title)+'" placeholder="e.g. Push, Legs, Cardio" autocomplete="off"></label>';
  h+='<div class="locbar slim"><span class="loclbl">Training at</span><div class="locchips" role="group" aria-label="Location for this day">'+locChips("data-bdloc",bLoc().id)+'</div></div>';
  if(!bGear().length) h+='<div class="bnote">You haven’t picked your equipment yet, so every exercise shows as available. <button class="linkbtn" id="bGoGear">Choose equipment</button></div>';
  if(!BD.ex.length) h+='<p class="eqempty">No exercises yet. Add your first one, or save it empty as a rest day.</p>';
  BD.ex.forEach(function(x,k){
    var L=LIB[x.id], miss=bGear().length?needsText(L,bGear()):"", inLink=x.link||(k>0&&BD.ex[k-1].link);
    h+='<div class="brow'+(inLink?' linked':'')+'">'+
      '<div class="brow-top"><div class="bn"><b>'+esc(L.n)+'</b><span>'+esc(L.mg)+'</span>'+(miss?'<em>Needs '+esc(miss)+'</em>':'')+'</div>'+
      '<div class="bacts"><button class="ibtn" data-bup="'+k+'" aria-label="Move '+esc(L.n)+' up"'+(k===0?' disabled':'')+'>↑</button>'+
      '<button class="ibtn" data-bdown="'+k+'" aria-label="Move '+esc(L.n)+' down"'+(k===BD.ex.length-1?' disabled':'')+'>↓</button>'+
      '<button class="ibtn" data-brep="'+k+'" aria-label="Replace '+esc(L.n)+'" title="Replace">⇄</button>'+
      '<button class="ibtn" data-bdel="'+k+'" aria-label="Remove '+esc(L.n)+'">×</button></div></div>'+
      '<div class="bfields"><div class="bstep"><span>Sets</span><button class="ibtn" data-bsets="'+k+'" data-d="-1" aria-label="Fewer sets"'+(x.sets<=1?' disabled':'')+'>−</button><b aria-live="polite">'+x.sets+'</b><button class="ibtn" data-bsets="'+k+'" data-d="1" aria-label="More sets"'+(x.sets>=8?' disabled':'')+'>+</button></div>'+
      '<label class="breps"><span>Target</span><input data-breps="'+k+'" value="'+esc(x.reps)+'" maxlength="16" autocomplete="off" aria-label="Target reps or time for '+esc(L.n)+'"></label></div></div>';
    if(k<BD.ex.length-1) h+='<button class="blink'+(x.link?' on':'')+'" data-blink="'+k+'" aria-pressed="'+x.link+'">'+(x.link?'Linked as superset · tap to unlink':'Link with next as superset')+'</button>';
  });
  h+='<button class="ghost badd" id="bAdd">+ Add exercise</button>';
  if(BD.wizard){ sh.innerHTML=h+wzNav(); return; }
  h+='<button class="primary" id="bSave">Save workout</button>';
  if(isEdited(activePlan().id,d.id)) h+='<button class="ghost bre" id="bReset">Reset this day to the original</button>';
  h+='</div>';
  sh.innerHTML=h;
}
function pickList(){
  var bg=bGear(), q=BD.q.trim().toLowerCase(), inDay=BD.ex.map(function(x){return x.id;});
  return Object.keys(LIB).map(function(id){return LIB[id];}).filter(function(L){
    if(BD.mg&&L.mg!==BD.mg) return false;
    if(q&&(L.n+" "+L.mg).toLowerCase().indexOf(q)<0) return false;
    /* no gear at this location means bodyweight only (Deon's suggestion, 10 Nov) */
    if(!BD.all&&missingFor(L,bg).length) return false;
    return true;
  }).map(function(L){return {L:L,added:inDay.indexOf(L.id)>=0,ok:!missingFor(L,bg).length};});
}
function renderPicker(sh){
  var keepFocus=document.activeElement&&document.activeElement.id==="pSearch";
  var h='<div class="sheet-in"><div class="sheet-top"><h2 id="btitle">'+(BD.wizard?'Add to '+esc(weekLong(BD.dayId)):'Add exercise')+'</h2><button class="chip" id="pBack">Done</button></div>';
  h+='<p class="sub">'+(bGear().length?'Showing exercises you can do at <b>'+esc(bLoc().name)+'</b>.':'No equipment set for '+esc(bLoc().name)+' yet, so only bodyweight exercises show.')+'</p>';
  if(locState().list.length>1) h+='<div class="locchips pickloc" role="group" aria-label="Location">'+locChips("data-bdloc",bLoc().id)+'</div>';
  h+='<div class="eqsearch"><input type="search" id="pSearch" value="'+esc(BD.q)+'" placeholder="Search exercises" autocomplete="off" aria-label="Search exercises"></div>';
  h+='<div class="mgchips" role="group" aria-label="Muscle group">'+['All'].concat(MGS).map(function(m){var v=m==="All"?"":m;return '<button class="chip sm" data-pmg="'+v+'" aria-pressed="'+(BD.mg===v)+'">'+m+'</button>';}).join("")+'</div>';
  if(!bGear().length) h+='<div class="bnote">No equipment picked yet. <button class="linkbtn" id="bGoGear">Choose equipment</button></div>';
  h+='<label class="ptoggle"><input type="checkbox" id="pAll"'+(BD.all?' checked':'')+'> Also show exercises I don’t have gear for</label>';
  var list=pickList();
  if(!list.length) h+='<p class="eqempty">'+(BD.q?'No exercises match “'+esc(BD.q)+'”.':(bGear().length?'Nothing here with your current gear. Try another muscle group or add equipment.':'No bodyweight exercises here. Try another muscle group or add equipment.'))+'</p>';
  MGS.forEach(function(m){
    var part=list.filter(function(r){return r.L.mg===m;}); if(!part.length) return;
    h+='<h4 class="pgh">'+m+'</h4>';
    part.forEach(function(r){
      var L=r.L;
      h+='<div class="prow'+(r.ok?'':' na')+'"><button class="pview" data-pview="'+L.id+'" aria-label="'+esc(L.n)+': see how to do it"><span class="bn"><b>'+esc(L.n)+'</b>'+(L.x&&L.x.pm.length?'<span>'+esc(L.x.pm.slice(0,3).join(", "))+'</span>':'')+(r.ok?'':'<em>Needs '+esc(needsText(L,bGear()))+'</em>')+'</span>'+PINFO_SVG+'</button>'+
        (r.added?'<span class="padded">Added</span>':r.ok?'<button class="chip sm" data-padd="'+L.id+'" aria-label="Add '+esc(L.n)+'">Add</button>':'')+'</div>';
    });
  });
  h+='</div>';
  var st=sh.scrollTop; sh.innerHTML=h; sh.scrollTop=st;
  if(keepFocus){var i=document.getElementById("pSearch");i.focus();i.setSelectionRange(i.value.length,i.value.length);}
}
/* Replace (F4.E2.S2): the best swaps for one exercise in the draft, same ranking as the day view */
function renderReplace(sh){
  var x=BD.ex[BD.rep], L=LIB[x.id], bg=bGear(), inDay=BD.ex.map(function(y){return y.id;});
  var all=swapOptions(x.id,bg,inDay,null), list=all.slice(0,BD.repMore?30:8);
  var h='<div class="sheet-in"><div class="sheet-top"><button class="chip" id="rBack">‹ Back</button></div>'+
    '<h2 id="btitle" class="eltitle">Replace '+esc(L.n)+'</h2>'+
    '<p class="sub">'+(bg.length?'Best matches you can do at <b>'+esc(bLoc().name)+'</b>, closest movement first.':'Closest movement first. No equipment set for '+esc(bLoc().name)+' yet, so only bodyweight options show.')+'</p>';
  if(!list.length) h+='<p class="eqempty">No alternative here with your gear. Try <button class="linkbtn" id="bAdd">adding an exercise</button> instead.</p>';
  h+='<div class="swlist">'+list.map(function(r){
    return '<div class="prow"><span class="pview"><span class="bn"><b>'+esc(r.o.n)+'</b><span>'+esc(swapReasonText(r))+'</span>'+(r.harder?'<em class="swhard">Harder</em>':'')+'</span></span>'+
      '<button class="chip sm" data-brepto="'+r.o.id+'" aria-label="Use '+esc(r.o.n)+' instead">Use</button></div>';
  }).join("")+'</div>';
  if(all.length>list.length) h+='<button class="ghost elmore" id="rMore">More options</button>';
  sh.innerHTML=h+'</div>'; sh.scrollTop=0;
}
var PINFO_SVG='<svg class="pinfo" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="7.4" r="1.4" fill="currentColor"/></svg>';
/* a look at one exercise before adding it: the same details as the library, with Add at the bottom */
function renderPeek(sh){
  var L=LIB[BD.peek], bg=bGear(), added=BD.ex.some(function(x){return x.id===L.id;}), ok=!missingFor(L,bg).length;
  var h='<div class="sheet-in peek"><div class="sheet-top"><button class="chip" id="pkBack">‹ Back</button></div>'+
    '<h2 id="btitle" class="eltitle">'+esc(L.n)+'</h2>'+exDetailBody(L,bg,bLoc().name)+
    '<div class="pkbar">'+(added?'<button class="primary" id="pkBack2">Already in this workout · back to list</button>':
      ok?'<button class="primary" data-pkadd="'+L.id+'">Add to '+(BD.wizard?esc(weekLong(BD.dayId)):'workout')+'</button>':
      '<p class="elwarn">You can’t add this here: '+esc(bLoc().name)+' needs '+esc(needsText(L,bg))+'.</p><button class="ghost" id="pkBack2">Back to list</button>')+'</div></div>';
  sh.innerHTML=h; sh.scrollTop=0;
}
function peekBack(id){
  BD.view="pick"; renderBuilder();
  var sh=bSheet(); if(BD.pickTop!=null) sh.scrollTop=BD.pickTop;
  var b=document.querySelector('[data-pview="'+id+'"]'); if(b) b.focus({preventScroll:true});
}
function bUpdateLinksAfterMove(){ var n=BD.ex.length; if(n) BD.ex[n-1].link=false; }
function builderClick(t){
  if(!BD) return false;
  if(t.id==="bCancel"){
    if(BD.dirty&&!t.dataset.armed){t.dataset.armed="1";t.textContent="Discard changes?";setTimeout(function(){if(document.body.contains(t)){delete t.dataset.armed;t.textContent="Cancel";}},3000);return true;}
    closeBuilder();return true;
  }
  if(t.id==="bGoGear"){if(!BD.wizard)closeBuilder();openEquip();return true;}
  if(t.id==="bAdd"){BD.view="pick";BD.q="";renderBuilder();bSheet().scrollTop=0;return true;}
  if(t.id==="pBack"){BD.view="edit";renderBuilder();var sh=bSheet();sh.scrollTop=sh.scrollHeight;return true;}
  if(t.dataset.pmg!==undefined){BD.mg=t.dataset.pmg;renderBuilder();return true;}
  if(t.dataset.pview){BD.pickTop=bSheet().scrollTop;BD.peek=t.dataset.pview;BD.view="peek";renderBuilder();var pb=document.getElementById("pkBack");if(pb)pb.focus();return true;}
  if(t.id==="pkBack"||t.id==="pkBack2"){peekBack(BD.peek);return true;}
  if(t.dataset.brep!==undefined){BD.rep=+t.dataset.brep;BD.repMore=false;BD.view="rep";renderBuilder();var rb=document.getElementById("rBack");if(rb)rb.focus();return true;}
  if(t.id==="rBack"){var rk=BD.rep;BD.view="edit";renderBuilder();var rf=document.querySelector('[data-brep="'+rk+'"]');if(rf){rf.focus();rf.scrollIntoView({block:"center"});}return true;}
  if(t.id==="rMore"){BD.repMore=true;var st=bSheet().scrollTop;renderBuilder();bSheet().scrollTop=st;return true;}
  if(t.dataset.brepto){var rx=BD.ex[BD.rep],R0=LIB[rx.id],R1=LIB[t.dataset.brepto];rx.reps=GFDRules.swapReps(R0,R1,rx.reps);rx.id=R1.id;BD.dirty=true;BD.view="edit";renderBuilder();toast(R0.n+" replaced with "+R1.n);var rf2=document.querySelector('[data-brep="'+BD.rep+'"]');if(rf2){rf2.focus();rf2.scrollIntoView({block:"center"});}return true;}
  if(t.dataset.pkadd){var P=LIB[t.dataset.pkadd];BD.ex.push({id:P.id,sets:P.sets,reps:P.reps,link:false});BD.dirty=true;peekBack(P.id);toast(P.n+" added");return true;}
  if(t.dataset.padd){var L=LIB[t.dataset.padd];BD.ex.push({id:L.id,sets:L.sets,reps:L.reps,link:false});BD.dirty=true;renderBuilder();toast(L.n+" added");return true;}
  var k;
  if(t.dataset.bup!==undefined){k=+t.dataset.bup;var a=BD.ex[k];BD.ex[k]=BD.ex[k-1];BD.ex[k-1]=a;bUpdateLinksAfterMove();BD.dirty=true;renderBuilder();var b=document.querySelector('[data-bup="'+(k-1)+'"]')||document.querySelector('[data-bdown="'+(k-1)+'"]');if(b)b.focus();return true;}
  if(t.dataset.bdown!==undefined){k=+t.dataset.bdown;var c=BD.ex[k];BD.ex[k]=BD.ex[k+1];BD.ex[k+1]=c;bUpdateLinksAfterMove();BD.dirty=true;renderBuilder();var b2=document.querySelector('[data-bdown="'+(k+1)+'"]')||document.querySelector('[data-bup="'+(k+1)+'"]');if(b2)b2.focus();return true;}
  if(t.dataset.bdel!==undefined){k=+t.dataset.bdel;var n=LIB[BD.ex[k].id].n;BD.ex.splice(k,1);if(k>0&&!BD.ex[k])BD.ex[k-1].link=false;BD.dirty=true;renderBuilder();toast(n+" removed");return true;}
  if(t.dataset.bsets!==undefined){k=+t.dataset.bsets;BD.ex[k].sets=Math.max(1,Math.min(8,BD.ex[k].sets+(+t.dataset.d)));BD.dirty=true;renderBuilder();var s=document.querySelector('[data-bsets="'+k+'"][data-d="'+t.dataset.d+'"]');if(s&&!s.disabled)s.focus();return true;}
  if(t.dataset.blink!==undefined){k=+t.dataset.blink;BD.ex[k].link=!BD.ex[k].link;BD.dirty=true;renderBuilder();var l=document.querySelector('[data-blink="'+k+'"]');if(l)l.focus();return true;}
  if(t.id==="bSave"){
    var title=(document.getElementById("bTitle").value||"").trim()||DAYS[BD.day].title;
    if(!BD.ex.length&&!customById(activePlan().id)){toast("Add at least one exercise");return true;}
    if(BD.loc) setDayLoc(activePlan().id,DAYS[BD.day].id,BD.loc);
    setDaySource(DAYS[BD.day].id,{title:title,ex:BD.ex.map(function(x){return {id:x.id,sets:x.sets,reps:(x.reps||"").trim()||LIB[x.id].reps,link:!!x.link};})});
    save(); closeBuilder(); renderAll(); toast("Workout saved");return true;
  }
  if(t.id==="bReset"){
    if(!t.dataset.armed){t.dataset.armed="1";t.textContent="Tap again to reset";setTimeout(function(){if(document.body.contains(t)){delete t.dataset.armed;t.textContent="Reset this day to the original";}},3000);return true;}
    var ed=plansState().edits[activePlan().id]; if(ed) delete ed[DAYS[BD.day].id]; save(); closeBuilder(); renderAll(); toast("Back to the original plan");return true;
  }
  return false;
}
function builderInput(el){
  if(!BD) return false;
  if(el.id==="bTitle"){BD.title=el.value;BD.dirty=true;if(BD.wizard&&WZ)WZ.titles[WZ.cur]=el.value;return true;}
  if(el.dataset&&el.dataset.breps!==undefined){BD.ex[+el.dataset.breps].reps=el.value;BD.dirty=true;return true;}
  if(el.id==="pSearch"){BD.q=el.value;renderBuilder();return true;}
  if(el.id==="pAll"){BD.all=el.checked;renderBuilder();return true;}
  return false;
}
