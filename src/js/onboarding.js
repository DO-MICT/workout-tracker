/* ---------- register + first-run setup (friends test build) ---------- */
var MY_GEAR=["adjbench","flatbench","barbell","plates","ezbar","dumbbells","lyingpress","shoulderpress","latpulldown","legext","lyingcurl","standcalf","abbench","romanchair","cablecross","pullupbar","bands","yogamat","treadmill","smith","stabball"];
var OB=null; /* {step:"register"|"choose"|"loc"|"gear"|"plan", plan} */
function needsOnboarding(){ if(!TESTER_BUILD) return false; var A=acct(); return !A.signedIn||!S.onboarded; }
function startOnboarding(){
  if(!needsOnboarding()) return;
  OB={step:acct().signedIn?"choose":"register",plan:"split5"};
  var sh=document.getElementById("onboard"); sh.hidden=false; document.body.style.overflow="hidden"; renderOnboard();
}
function endOnboarding(){
  S.onboarded=true; save();
  var sh=document.getElementById("onboard"); sh.hidden=true; sh.innerHTML=""; document.body.style.overflow=""; OB=null;
  pickToday=true; OPEN={}; renderAll();
}
function obDots(n){return '<div class="wzsteps"><ol>'+[1,2,3].map(function(i){return '<li class="'+(i<n?'done':i===n?'on':'')+'"><span>'+i+'</span></li>';}).join("")+'</ol><p><b>Step '+n+' of 3</b> · '+["Your account","Where you train","Your plan"][n-1]+'</p></div>';}
function renderOnboard(){
  var sh=document.getElementById("onboard"); if(!sh||!OB) return;
  var h='<div class="sheet-in ob">';
  if(OB.step==="register"&&WEB_MODE){ h+=webAuthHtml(); }
  else if(OB.step==="register"){
    h+='<div class="obhero"><h1>Welcome</h1><p>Create your account to start testing the workout tracker.</p></div>'+obDots(1)+
      '<label class="bname"><span>Name</span><input id="obName" maxlength="40" autocomplete="name" placeholder="What should we call you?"></label>'+
      '<label class="bname"><span>Email</span><input id="obEmail" type="email" inputmode="email" autocomplete="email" maxlength="80" placeholder="you@example.com"></label>'+
      '<label class="bname dim"><span>Password</span><input id="obPass" type="text" value="mvp" disabled aria-describedby="obPassNote"><em id="obPassNote">Fixed to “mvp” while we test. Real passwords come with the app store release.</em></label>'+
      '<p class="wzerr" id="obErr" role="alert"></p><button class="primary" id="obRegister">Create account</button>'+
      '<p class="obfine">Test version: your details and workouts are saved on this phone only.</p>';
  } else if(OB.step==="choose"){
    h+='<div class="obhero"><h1>Let’s set you up</h1><p>Pick how you want to start. You can change everything later from the menu.</p></div>'+
      '<button class="obopt" id="obExpress"><b>Express setup</b><span>Adds a Gym location with a full gym’s worth of gear (barbell, dumbbells, cable crossover, chest press, lat pulldown, leg machines, treadmill and more) and the 5-day split plan. Ready in one tap.</span></button>'+
      '<button class="obopt" id="obCustom"><b>Set up my own</b><span>Tell us where you train and what equipment is there, then choose or build a workout plan.</span></button>';
  } else if(OB.step==="loc"){
    var cur=locState().list[0].name;
    h+=obDots(2)+'<h2 class="obh">Where do you train?</h2><p class="sub">Name your main training spot. You can add more places later, like home or a hotel gym.</p>'+
      '<label class="bname"><span>Location name</span><input id="obLoc" maxlength="24" value="'+esc(OB.locName||cur)+'" autocomplete="off"></label>'+
      '<div class="locsugg">'+LOC_SUGG.map(function(s){return '<button class="chip sm" data-oblocsugg="'+esc(s)+'">'+esc(s)+'</button>';}).join("")+'</div>'+
      '<p class="wzerr" id="obErr" role="alert"></p><div class="wznav"><button class="ghost" id="obBack">Back</button><button class="primary" id="obLocNext">Next: equipment</button></div>';
  } else if(OB.step==="gear"){
    h+=obDots(2)+'<h2 class="obh">What’s at '+esc(curLoc().name)+'?</h2><p class="sub">Tap everything you can use there. Exercises are matched to this list.</p>'+
      '<div class="eqsearch"><input type="search" id="eqSearch" placeholder="Search, e.g. treadmill, yoga, cable" autocomplete="off" aria-label="Search equipment"><button class="linkbtn" id="clearSearch" hidden>Clear</button></div>'+
      '<div id="eqLists"></div><div class="wznav"><button class="ghost" id="obBack">Back</button><button class="primary" id="obGearNext">Next: workout plan</button></div>';
  } else if(OB.step==="plan"){
    var g=gear();
    h+=obDots(3)+'<h2 class="obh">Choose a workout plan</h2><p class="sub">Start with a ready-made plan or build your own. Plans are checked against your gear at '+esc(curLoc().name)+'.</p><div class="tiers" role="radiogroup" aria-label="Workout plan">';
    TEMPLATES.forEach(function(t){
      if(t.random){ var onr=OB.plan===t.id;
        h+='<button class="tier'+(onr?' on':'')+'" role="radio" aria-checked="'+onr+'" data-obplan="'+t.id+'"><span class="th"><b>'+esc(t.name)+'</b><span class="ttag">Random</span></span><span class="tprice">'+esc(t.desc)+'</span><ul><li class="okt">Always fits your gear</li></ul>'+(onr?'<span class="tcur">Selected</span>':'')+'</button>';
        return; }
      var days=buildDaysFor(t.id), miss=0, tot=0;
      days.forEach(function(d){d.ex.forEach(function(x){tot++; if(g.length&&LIB[x.id]&&missingFor(LIB[x.id],g).length) miss++;});});
      var on=OB.plan===t.id;
      h+='<button class="tier'+(on?' on':'')+'" role="radio" aria-checked="'+on+'" data-obplan="'+t.id+'"><span class="th"><b>'+esc(t.name)+'</b></span><span class="tprice">'+esc(t.desc)+'</span>'+
        '<ul><li>'+days.length+' days a week · '+tot+' exercises</li><li class="'+(miss?'warnt':'okt')+'">'+(g.length?(miss?miss+' need gear you don’t have (you can swap them)':'Fits your gear'):'Add gear to check the fit')+'</li></ul>'+(on?'<span class="tcur">Selected</span>':'')+'</button>';
    });
    var own=OB.plan==="own";
    h+='<button class="tier'+(own?' on':'')+'" role="radio" aria-checked="'+own+'" data-obplan="own"><span class="th"><b>Build my own</b></span><span class="tprice">Pick your days and exercises step by step.</span>'+(own?'<span class="tcur">Selected</span>':'')+'</button></div>'+
      '<div class="wznav"><button class="ghost" id="obBack">Back</button><button class="primary" id="obFinish">'+(own?'Next: build my plan':'Start training')+'</button></div>';
  }
  sh.innerHTML=h+'</div>'; sh.scrollTop=0;
  if(OB.step==="gear") renderGear();
  var f=sh.querySelector("#obName,#obLoc"); if(f) f.focus();
}
function onboardClick(t){
  if(!OB) return false;
  if(t.id==="obRegister"){
    var n=(document.getElementById("obName").value||"").trim(), e=(document.getElementById("obEmail").value||"").trim(), err=document.getElementById("obErr");
    if(!e){err.textContent="Enter your email to create your account.";document.getElementById("obEmail").focus();return true;}
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)){err.textContent="That email doesn’t look right.";document.getElementById("obEmail").focus();return true;}
    var A=acct(); A.email=e; A.signedIn=true; A.authMode="mvp"; A.registeredAt=new Date().toISOString(); A.tier="tester";
    S.names[0]=n||"You"; save(); OB.step="choose"; renderOnboard(); return true;
  }
  if(t.id==="obExpress"){
    var L=locState(), g=L.list[0]; g.name="Gym"; MY_GEAR.forEach(function(id){if(g.gear.indexOf(id)<0)g.gear.push(id);}); L.active=g.id;
    plansState().active="split5"; save(); endOnboarding(); toast("All set: Gym and the 5-day split"); return true;
  }
  if(t.id==="obCustom"){OB.step="loc";renderOnboard();return true;}
  if(t.dataset.oblocsugg){var i=document.getElementById("obLoc");i.value=t.dataset.oblocsugg;i.focus();return true;}
  if(t.id==="obLocNext"){
    var v=(document.getElementById("obLoc").value||"").trim();
    if(!v){document.getElementById("obErr").textContent="Give your location a name.";return true;}
    var L2=locState(); L2.list[0].name=v; L2.active=L2.list[0].id; OB.locName=v; save(); OB.step="gear"; renderOnboard(); return true;
  }
  if(t.id==="obGearNext"){
    if(!gear().length&&!t.dataset.armed){t.dataset.armed="1";t.textContent="Continue without gear?";setTimeout(function(){if(document.body.contains(t)){delete t.dataset.armed;t.textContent="Next: workout plan";}},3000);return true;}
    OB.step="plan"; renderOnboard(); return true;
  }
  if(t.dataset.obplan){OB.plan=t.dataset.obplan;renderOnboard();var b=document.querySelector('[data-obplan="'+OB.plan+'"]');if(b)b.focus();return true;}
  if(t.id==="obFinish"){
    if(OB.plan==="own"){ endOnboarding(); openWizard(); return true; }
    plansState().active=OB.plan; save(); var nm=planById(OB.plan).name; endOnboarding(); toast("You’re on "+nm); return true;
  }
  if(t.id==="obBack"){OB.step={loc:"choose",gear:"loc",plan:"gear"}[OB.step]||"choose";renderOnboard();return true;}
  return false;
}
