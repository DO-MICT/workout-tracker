/* ---------- shared catalogues from Supabase: exercises (1,032) and gear (441) ----------
   The built-in LIB and EQUIP work offline and in Claude. On the web the full lists load from the
   public `exercises` and `gear` tables (readable without signing in) and are kept on this phone,
   so the next start has them straight away. Exercises already built into the app keep their name,
   cues, gear and diagram (plans and history depend on them); the database adds the details. */
var CAT_KEY="gfd-catalog-v1", CAT={sig:"",ex:0,gear:0,loaded:false};
var EX_COLS="id,name,aliases,training_type,muscle_group,primary_muscles,secondary_muscles,equipment,req,equipment_tier,difficulty,tracking,sets,reps,form_cues,common_mistakes,regressions,progressions,safety,diagram,updated_at";
var GEAR_COLS="id,name,aliases,keywords,category,app_group,group_order,sort_order,tier,setting,description,muscle_focus,loading,weight_options,space,price_band,buying_tips,safety,updated_at";
var BUILTIN_IDS=Object.keys(LIB).reduce(function(o,k){o[k]=1;return o;},{});
var GEAR_INFO={};

function catSig(ex,gr){
  var m=function(rows){return rows.reduce(function(a,r){return r.updated_at>a?r.updated_at:a;},"");};
  return ex.length+"/"+gr.length+"/"+m(ex)+"/"+m(gr);
}
function catApply(ex,gr){
  if(ex&&ex.length){
    ex.forEach(function(r){
      var x={tt:r.training_type,diff:r.difficulty,tier:r.equipment_tier,pm:r.primary_muscles||[],sm:r.secondary_muscles||[],eq:r.equipment||[],
        mist:r.common_mistakes||[],reg:r.regressions||[],prog:r.progressions||[],safety:r.safety||"",al:r.aliases||[]};
      var L=LIB[r.id];
      if(L&&BUILTIN_IDS[r.id]){ L.x=x; return; }
      LIB[r.id]={id:r.id,n:r.name,mg:r.muscle_group,req:r.req||"",f:r.diagram||"",sets:r.sets||3,reps:r.reps||"10",lab:r.tracking||"w",c:r.form_cues||[],x:x};
    });
    CAT.ex=ex.length;
  }
  if(gr&&gr.length){
    var groups=[], byName={};
    gr.slice().sort(function(a,b){return (a.group_order-b.group_order)||(a.sort_order-b.sort_order);}).forEach(function(r){
      if(!byName[r.app_group]){byName[r.app_group]={g:r.app_group,items:[]};groups.push(byName[r.app_group]);}
      byName[r.app_group].items.push([r.id,r.name,((r.keywords||"")+" "+(r.aliases||[]).join(" ")).trim()]);
      GEAR_INFO[r.id]=r;
    });
    EQUIP=groups; CAT.gear=gr.length;
  }
  GEAR_NAMES=null;
}
/* cached copy from the last visit: instant, and works offline */
(function catFromCache(){
  try{
    var c=JSON.parse(localStorage.getItem(CAT_KEY)||"null");
    if(c&&c.v===1&&Array.isArray(c.ex)&&Array.isArray(c.gear)){ catApply(c.ex,c.gear); CAT.sig=c.sig||""; }
  }catch(e){}
})();
function catPage(table,cols,order){
  var rows=[], step=1000;
  function next(from){
    return sb.from(table).select(cols).eq("active",true).order(order).range(from,from+step-1).then(function(r){
      if(r.error) throw r.error;
      rows=rows.concat(r.data||[]);
      return (r.data||[]).length===step?next(from+step):rows;
    });
  }
  return next(0);
}
/* called once the Supabase client exists (signin.js); re-renders only when something changed */
function catFetch(){
  if(!sb) return;
  Promise.all([catPage("exercises",EX_COLS,"id"),catPage("gear",GEAR_COLS,"id")]).then(function(r){
    var ex=r[0], gr=r[1], sig=catSig(ex,gr);
    CAT.loaded=true;
    if(sig===CAT.sig) return;
    catApply(ex,gr); CAT.sig=sig;
    try{ localStorage.setItem(CAT_KEY,JSON.stringify({v:1,sig:sig,ex:ex,gear:gr})); }catch(e){}
    catRefresh();
  }).catch(function(){ CAT.loaded=true; });
}
/* redraw what shows the catalogues, without touching a half-typed set on the day view */
function catRefresh(){
  var a=document.activeElement, typing=a&&a.tagName==="INPUT"&&a.closest&&a.closest("#day");
  if(!typing) renderAll();
  if(!document.getElementById("equip").hidden){ renderGear(); }
  if(BD) renderBuilder();
  if(EL) renderLibrary(true);
}
var GEAR_NAMES=null;
function gearName(id){
  if(!GEAR_NAMES){ GEAR_NAMES={}; EQUIP.forEach(function(G){G.items.forEach(function(it){GEAR_NAMES[it[0]]=it[1];});}); }
  return GEAR_NAMES[id]||id;
}

/* ---------- Exercise library page (More › Exercise library) ---------- */
var EL=null; /* {q, mg, can, show, view} */
var EL_TIER=["No equipment","Minimal home kit","Home gym","Full gym"];
function openLibrary(exId){
  EL={q:"",mg:"",can:false,show:60,view:exId||null};
  var sh=document.getElementById("exlib"); sh.hidden=false; document.body.style.overflow="hidden";
  renderLibrary(); sh.scrollTop=0; sh.focus();
}
function closeLibrary(){
  var sh=document.getElementById("exlib"); if(!sh||sh.hidden) return;
  sh.hidden=true; sh.innerHTML=""; document.body.style.overflow=""; EL=null;
}
function libList(){
  var q=EL.q.trim().toLowerCase(), g=gear();
  return Object.keys(LIB).map(function(id){return LIB[id];}).filter(function(L){
    if(EL.mg&&L.mg!==EL.mg) return false;
    if(EL.can&&missingFor(L,g).length) return false;
    if(q){ var hay=(L.n+" "+L.mg+" "+(L.x?L.x.tt+" "+L.x.al.join(" ")+" "+L.x.pm.join(" ")+" "+L.x.eq.join(" "):"")).toLowerCase(); if(hay.indexOf(q)<0) return false; }
    return true;
  }).sort(function(a,b){return a.n.localeCompare(b.n);});
}
function renderLibrary(keep){
  var sh=document.getElementById("exlib"); if(!sh||!EL) return;
  if(EL.view&&LIB[EL.view]){ sh.innerHTML=libDetailHtml(LIB[EL.view]); if(!keep) sh.scrollTop=0; return; }
  var focusQ=document.activeElement&&document.activeElement.id==="libSearch";
  var list=libList(), n=Object.keys(LIB).length;
  var h='<div class="sheet-in"><div class="sheet-top"><h2 id="eltitle">Exercise library</h2><button class="chip" id="closeLib">Close</button></div>'+
    '<p class="sub">'+n.toLocaleString("en")+' exercises'+(WEB_MODE&&!CAT.ex&&!CAT.loaded?' · loading the full library…':'')+'. Tap one for how to do it, the muscles it works and the gear it needs.</p>'+
    '<div class="eqsearch"><input type="search" id="libSearch" value="'+esc(EL.q)+'" placeholder="Search, e.g. squat, glutes, kettlebell" autocomplete="off" aria-label="Search exercises"></div>'+
    '<div class="mgchips" role="group" aria-label="Muscle group">'+['All'].concat(MGS).map(function(m){var v=m==="All"?"":m;return '<button class="chip sm" data-elmg="'+v+'" aria-pressed="'+(EL.mg===v)+'">'+m+'</button>';}).join("")+'</div>'+
    (gear().length?'<label class="ptoggle"><input type="checkbox" id="libCan"'+(EL.can?' checked':'')+'> Only what I can do at '+esc(curLoc().name)+'</label>':'')+
    '<p class="elcount" aria-live="polite">'+list.length.toLocaleString("en")+' match'+(list.length===1?'':'es')+'</p>';
  if(!list.length) h+='<p class="eqempty">No exercises match. Try another word or muscle group.</p>';
  h+='<div class="ellist">'+list.slice(0,EL.show).map(function(L){
    var x=L.x, miss=gear().length?missingFor(L,gear()).length:0;
    return '<button class="elrow" data-elview="'+L.id+'"><span class="bn"><b>'+esc(L.n)+'</b><span>'+esc(L.mg)+(x?(x.tt!==L.mg?' · '+esc(x.tt):'')+' · '+esc(x.diff):'')+'</span>'+(miss?'<em>Needs '+esc(needsText(L,gear()))+'</em>':'')+'</span>'+
      '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
  }).join("")+'</div>';
  if(list.length>EL.show) h+='<button class="ghost elmore" id="libMore">Show more ('+(list.length-EL.show).toLocaleString("en")+' left)</button>';
  h+='</div>';
  var st=sh.scrollTop; sh.innerHTML=h; if(keep) sh.scrollTop=st;
  if(focusQ){var i=document.getElementById("libSearch");i.focus();i.setSelectionRange(i.value.length,i.value.length);}
}
function libDetailHtml(L){
  var x=L.x||{}, li=function(a){return '<ul class="cues">'+a.map(function(c){return '<li>'+esc(c)+'</li>';}).join("")+'</ul>';};
  var need=L.req?L.req.split(",").map(function(alt){return alt.split("|").map(gearName).join(" or ");}):[];
  var miss=gear().length?missingFor(L,gear()):[];
  var h='<div class="sheet-in"><div class="sheet-top"><button class="chip" id="libBack">‹ Back</button><button class="chip" id="closeLib">Close</button></div>'+
    '<h2 id="eltitle" class="eltitle">'+esc(L.n)+'</h2>'+
    '<div class="eltags"><span>'+esc(L.mg)+'</span>'+(x.tt&&x.tt!==L.mg?'<span>'+esc(x.tt)+'</span>':'')+(x.diff?'<span>'+esc(x.diff)+'</span>':'')+(x.tier!=null?'<span>'+EL_TIER[x.tier]+'</span>':'')+'</div>'+
    (x.al&&x.al.length?'<p class="sub">Also called '+esc(x.al.join(", "))+'.</p>':'');
  h+=exFigure(L.id,L.f,"elfig");
  if(x.pm&&(x.pm.length||x.sm.length)) h+='<section class="elsec"><h3 class="psec">Muscles</h3><p class="elmus"><b>Main:</b> '+esc(x.pm.join(", "))+(x.sm.length?'<br><b>Helpers:</b> '+esc(x.sm.join(", ")):'')+'</p></section>';
  h+='<section class="elsec"><h3 class="psec">Gear</h3><p class="elmus">'+(need.length?esc(need.join(", ")):'No equipment needed')+'</p>'+
    (miss.length?'<p class="elwarn">Not at '+esc(curLoc().name)+': '+esc(needsText(L,gear()))+'.</p>':(gear().length&&need.length?'<p class="elok">You have this at '+esc(curLoc().name)+'.</p>':''))+'</section>';
  h+='<section class="elsec"><h3 class="psec">Default</h3><p class="elmus">'+L.sets+' sets × '+esc(L.reps)+'</p></section>';
  if(L.c&&L.c.length) h+='<section class="elsec"><h3 class="psec">How to do it</h3>'+li(L.c)+'</section>';
  if(x.mist&&x.mist.length) h+='<section class="elsec"><h3 class="psec">Common mistakes</h3>'+li(x.mist)+'</section>';
  if(x.safety) h+='<section class="elsec"><h3 class="psec">Safety</h3><p class="elmus">'+esc(x.safety)+'</p></section>';
  if(x.reg&&(x.reg.length||x.prog.length)) h+='<section class="elsec"><h3 class="psec">Make it easier or harder</h3><p class="elmus">'+(x.reg.length?'<b>Easier:</b> '+esc(x.reg.join(", ")):'')+(x.reg.length&&x.prog.length?'<br>':'')+(x.prog.length?'<b>Harder:</b> '+esc(x.prog.join(", ")):'')+'</p></section>';
  return h+'</div>';
}
function libraryClick(t){
  if(!EL) return false;
  if(t.id==="closeLib"){closeLibrary();return true;}
  if(t.id==="libBack"){var from=EL.view;EL.view=null;renderLibrary();var b=document.querySelector('[data-elview="'+from+'"]');if(b){b.focus();b.scrollIntoView({block:"center"});}return true;}
  if(t.dataset.elview){EL.view=t.dataset.elview;renderLibrary();var bk=document.getElementById("libBack");if(bk)bk.focus();return true;}
  if(t.dataset.elmg!==undefined){EL.mg=t.dataset.elmg;EL.show=60;renderLibrary(true);return true;}
  if(t.id==="libMore"){EL.show+=60;renderLibrary(true);return true;}
  return false;
}
function libraryInput(el){
  if(!EL) return false;
  if(el.id==="libSearch"){EL.q=el.value;EL.show=60;renderLibrary(true);return true;}
  if(el.id==="libCan"){EL.can=el.checked;EL.show=60;renderLibrary(true);return true;}
  return false;
}
