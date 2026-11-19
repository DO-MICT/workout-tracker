/* ---------- first-run setup (sign-up itself is in signin.js) ---------- */
var OB=null; /* {step, plan, picked, locName}; web sign-in also keeps mode/email here */
/* Three steps: location, equipment, plan. Progress is kept in S.ob as you go,
   so a reload picks up where you left off; setup stays open until a plan is saved (Build my own included). */
var OB_ORDER=["loc","gear","plan"];
function obShow(){ var sh=document.getElementById("onboard"); sh.hidden=false; document.body.style.overflow="hidden"; renderOnboard(); }
/* open setup where it was left; a saved step that no longer exists (the old questions) maps to the location step */
function resumeOnboarding(){
  var o=S.ob||{}, st=OB_ORDER.indexOf(o.step)>=0?o.step:"loc";
  OB={step:st,plan:o.plan||"",picked:!!o.picked,locName:o.locName||""};
  obShow();
}
function obSave(){ if(!OB||OB.step==="register") return; S.ob={step:OB.step,plan:OB.plan,picked:OB.picked,locName:OB.locName}; save(); }
function obGo(step){ OB.step=step; OB.sub=""; obSave(); renderOnboard(); }
function endOnboarding(){
  S.onboarded=true; delete S.ob; save();
  logEvent("onboarding_done",{});
  var sh=document.getElementById("onboard"); sh.hidden=true; sh.innerHTML=""; document.body.style.overflow=""; OB=null;
  pickToday=true; OPEN={}; renderAll();
}
/* GFD brand lockup shown at the top of the sign-up and sign-in screens */
function brandHtml(){return '<div class="brand"><svg viewBox="0 0 100 100" width="56" height="56" aria-hidden="true"><rect width="100" height="100" rx="22" fill="#D4FF3A"/><circle cx="50" cy="50" r="37" fill="none" stroke="#0D0F12" stroke-width="8"/><text x="50" y="60" text-anchor="middle" font-family="Archivo,sans-serif" font-weight="900" font-size="30" fill="#0D0F12">GFD</text></svg><div><b>Get Fit Daily</b><span>Great Form and Discipline</span></div></div>';}
function obDots(n,extra){return '<div class="wzsteps"><ol>'+[1,2,3].map(function(i){return '<li class="'+(i<n?'done':i===n?'on':'')+'"><span>'+i+'</span></li>';}).join("")+'</ol><p><b>Step '+n+' of 3</b> · '+["Location","Equipment","Your plan"][n-1]+(extra?' · '+extra:'')+'</p></div>';}
function obPlanCard(t,g){
  var on=OB.plan===t.id, tag='';
  if(t.random) return '<button class="tier'+(on?' on':'')+'" role="radio" aria-checked="'+on+'" data-obplan="'+t.id+'"><span class="th"><b>'+esc(t.name)+'</b>'+tag+'<span class="ttag">Random</span></span><span class="tprice">'+esc(t.desc)+'</span><ul><li class="okt">Always fits your equipment</li></ul>'+(on?'<span class="tcur">Selected</span>':'')+'</button>';
  var days=buildDaysFor(t.id), train=days.filter(function(d){return d.ex.length&&!d.opt;}), opt=days.filter(function(d){return d.ex.length&&d.opt;}), miss=0, tot=0;
  days.forEach(function(d){d.ex.forEach(function(x){tot++; if(g.length&&LIB[x.id]&&missingFor(LIB[x.id],g).length) miss++;});});
  return '<button class="tier'+(on?' on':'')+'" role="radio" aria-checked="'+on+'" data-obplan="'+t.id+'"><span class="th"><b>'+esc(t.name)+'</b>'+tag+'</span><span class="tprice">'+esc(t.desc)+'</span>'+
    '<ul><li>'+train.length+' training day'+(train.length===1?'':'s')+' a week'+(opt.length?' + '+opt.length+' optional cardio':'')+(t.restOff?' · rest timer off':'')+'</li>'+
    '<li class="obdays">'+train.map(function(d){return '<span>'+d.short+' · '+esc(d.title)+'</span>';}).join("")+opt.map(function(d){return '<span class="opt">'+d.short+' · optional</span>';}).join("")+'</li>'+
    '<li class="'+(miss?'warnt':'okt')+'">'+(g.length?(miss?miss+' of '+tot+' exercises need equipment you don’t have (you can swap them)':'Fits your equipment'):'Add equipment to check the fit')+'</li></ul>'+(on?'<span class="tcur">Selected</span>':'')+'</button>';
}
function renderOnboard(){
  var sh=document.getElementById("onboard"); if(!sh||!OB) return;
  var h='<div class="sheet-in ob">', back='<button class="ghost" id="obBack">Back</button>';
  if(OB.step==="register"&&WEB_MODE){ h+=webAuthHtml(); }
  else if(OB.step==="loc"){
    var defName=OB.locName||locState().list[0].name;
    h+='<div class="obhero"><h1>Let’s set you up</h1><p>Three quick steps. You can change everything later.</p></div>'+obDots(1)+'<h2 class="obh">Add your location</h2><p class="sub">Add your workout location, or skip for now. You can add more places later, like home or a hotel gym.</p>'+
      '<label class="bname"><span>Location name</span><input id="obLoc" maxlength="24" value="'+esc(defName)+'" autocomplete="off"></label>'+
      '<div class="locsugg">'+LOC_SUGG.map(function(s){return '<button class="chip sm" data-oblocsugg="'+esc(s)+'">'+esc(s)+'</button>';}).join("")+'</div>'+
      '<p class="wzerr" id="obErr" role="alert"></p><div class="wznav"><button class="ghost" id="obLocSkip">Skip</button><button class="primary" id="obLocNext">Next</button></div>';
  } else if(OB.step==="gear"){
    h+=obDots(2)+'<h2 class="obh">What equipment do you have at '+esc(curLoc().name)+'?</h2><p class="sub">Tap everything you can use there, or skip for now. Exercises are matched to your picks. Bodyweight is always included.</p>'+
      '<div class="eqsearch"><input type="search" id="eqSearch" placeholder="Search, e.g. treadmill, yoga, cable" autocomplete="off" aria-label="Search equipment"><button class="linkbtn" id="clearSearch" hidden>Clear</button></div>'+
      '<div id="eqLists"></div><div class="wznav w3">'+back+'<button class="ghost" id="obGearSkip">Skip</button><button class="primary" id="obGearNext">Next</button></div>';
  } else if(OB.step==="plan"){
    var g=gear(), own=OB.plan==="own";
    if(OB.sub==="list"){
      h+=obDots(3)+'<h2 class="obh">Use a default plan</h2><p class="sub">Tap one to choose it. You can change it later.</p><div class="tiers" role="radiogroup" aria-label="Workout plan">';
      TEMPLATES.forEach(function(t){h+=obPlanCard(t,g);});
      h+='</div><div class="wznav">'+back+'<button class="primary" id="obFinish"'+(OB.plan&&!own?'':' disabled')+'>Start training</button></div>';
    } else {
      var dflt=!!OB.plan&&!own;
      h+=obDots(3)+'<h2 class="obh">Your plan</h2><p class="sub">Start with a ready-made plan, or build your own.</p><div class="tiers" role="radiogroup" aria-label="Workout plan">'+
        '<button class="tier'+(dflt?' on':'')+'" role="radio" aria-checked="'+dflt+'" data-obmode="list"><span class="th"><b>Use a default plan</b></span><span class="tprice">Choose from ready-made plans.</span>'+(dflt?'<span class="tcur">Selected: '+esc(planById(OB.plan).name)+'</span>':'')+'</button>'+
        '<button class="tier'+(own?' on':'')+'" role="radio" aria-checked="'+own+'" data-obplan="own"><span class="th"><b>Build my own</b></span><span class="tprice">Pick your days and exercises step by step.</span>'+(own?'<span class="tcur">Selected</span>':'')+'</button></div>'+
        '<div class="wznav">'+back+'<button class="primary" id="obFinish"'+(OB.plan?'':' disabled')+'>'+(own?'Next':'Start training')+'</button></div>';
    }
  }
  sh.innerHTML=h+'</div>'; sh.scrollTop=0;
  if(OB.step==="gear") renderGear();
  var f=sh.querySelector("#obName,#obLoc"); if(f) f.focus();
}
function onboardClick(t){
  if(!OB) return false;
  if(t.dataset.oblocsugg){var i=document.getElementById("obLoc");i.value=t.dataset.oblocsugg;i.focus();return true;}
  if(t.id==="obLocNext"){
    var L2=locState(), v=(document.getElementById("obLoc").value||"").trim()||L2.list[0].name; /* blank is not saved: keep the default */
    L2.list[0].name=v; L2.active=L2.list[0].id; OB.locName=v; obGo("gear"); return true;
  }
  if(t.id==="obLocSkip"){var L3=locState(); L3.active=L3.list[0].id; OB.locName=L3.list[0].name; obGo("gear"); return true;}
  if(t.id==="obGearSkip"){curLoc().gear=[]; save(); obGo("plan"); return true;}   /* skipped: equipment stays not set */
  if(t.id==="obGearNext"){obGo("plan"); return true;}
  if(t.dataset.obplan){OB.plan=t.dataset.obplan;OB.picked=true;obSave();renderOnboard();var b=document.querySelector('[data-obplan="'+OB.plan+'"]');if(b)b.focus();return true;}
  if(t.id==="obFinish"){
    if(OB.plan==="own"){
      /* setup stays open: the plan builder runs on top, and Cancel there comes back here */
      obSave();
      var sh=document.getElementById("onboard"); sh.hidden=true; sh.innerHTML="";
      openWizard(null,true); return true;
    }
    var P=plansState(); P.active=OB.plan;
    var nm=planById(OB.plan).name; endOnboarding(); toast("You’re on "+nm); return true;
  }
  if(t.dataset.obmode){OB.sub="list";renderOnboard();return true;}
  if(t.id==="obBack") return obBackStep();
  return false;
}
/* one step back in setup (the Back button and the Android back button); false on the first step or sign-up */
function obBackStep(){
  var sh=document.getElementById("onboard");
  if(!OB||!sh||sh.hidden) return false;   /* hidden while the plan builder runs on top */
  if(OB.step==="plan"&&OB.sub){OB.sub="";renderOnboard();return true;}
  var k=OB_ORDER.indexOf(OB.step); if(k<1) return false;
  obGo(OB_ORDER[k-1]); return true;
}
