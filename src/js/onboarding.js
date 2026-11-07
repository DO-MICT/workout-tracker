/* ---------- register + first-run setup (friends test build) ---------- */
var MY_GEAR=["adjbench","flatbench","barbell","plates","ezbar","dumbbells","lyingpress","shoulderpress","latpulldown","legext","lyingcurl","standcalf","abbench","romanchair","cablecross","pullupbar","bands","yogamat","treadmill","smith","stabball"];
var OB=null; /* {step, ans:{train,level,goal,days}, plan, picked, locName}; web sign-in also keeps mode/email here */
/* F3: four short questions, then where you train, then a plan that fits. Progress is kept in S.ob as you go,
   so a reload picks up where you left off; setup stays open until a plan is saved (Build my own included). */
var OB_Q={
 train:{h:"What do you like to train?",sub:"Pick the one you do most. You can change it later in Profile.",opts:[["gym","Gym","Weights and machines"],["pilates","Pilates","Mat or reformer"],["yoga","Yoga","Poses, stretching and breathing"],["running","Running","Outdoors or on a treadmill"],["mixed","A mix","A bit of everything"]]},
 level:{h:"How much training have you done?",sub:"This sets how hard your first plan is.",opts:[["new","I’m new to this","Just starting, or back after a long break"],["some","Some experience","I know the basics and train now and then"],["experienced","Experienced","I’ve trained regularly for a year or more"]]},
 goal:{h:"What’s your main goal?",sub:"Pick the one that matters most right now.",opts:[["strength","Get stronger","Lift more and feel solid"],["muscle","Build muscle","Grow and shape your muscles"],["weight","Lose weight","Burn more and move more"],["move","Move better","Flexibility, posture, less stiffness"],["general","General fitness","Feel fitter and healthier"]]},
 days:{h:"How many days a week?",sub:"Be honest: a plan you can keep beats a perfect one.",opts:[["2","2 days",""],["3","3 days",""],["4","4 days",""],["5","5 days",""]]}
};
var OB_ORDER=["train","level","goal","days","loc","gear","plan"];
var OB_LOC={gym:"Gym",mixed:"Gym",pilates:"Pilates studio",yoga:"Home",running:"Park"};
var OB_PRESETS={
 gym:["Full gym",MY_GEAR.concat(["chestpress","legpress","seatedrow","seatedcurl","powerrack","kettlebells","pecdeck","abductor","bike","rower"])],
 home:["Home basics",["dumbbells","bands","adjbench","yogamat","calisthenics"]],
 pilates:["Pilates studio",["pilatesmat","reformer","pilatesring","yogamat","foamroller"]],
 yoga:["Yoga at home",["yogamat","yogablocks","stretchstrap"]],
 body:["Just my body",["calisthenics"]]
};
function obPresetOrder(t){return ({pilates:["pilates","home","body","gym"],yoga:["yoga","home","body","gym"],running:["body","home","gym"]})[t]||["gym","home","body","yoga"];}
function needsOnboarding(){ if(!TESTER_BUILD) return false; var A=acct(); return !A.signedIn||!S.onboarded; }
function obShow(){ var sh=document.getElementById("onboard"); sh.hidden=false; document.body.style.overflow="hidden"; renderOnboard(); }
function startOnboarding(){
  if(!needsOnboarding()) return;
  if(acct().signedIn) resumeOnboarding(); else { OB={step:"register",ans:{}}; obShow(); }
}
/* open setup where it was left: the saved step and answers, or the first question */
function resumeOnboarding(){
  var o=S.ob||{}, st=OB_ORDER.indexOf(o.step)>=0?o.step:"train";
  OB={step:st,ans:Object.assign({},o.ans||{}),plan:o.plan||"",picked:!!o.picked,locName:o.locName||""};
  obShow();
}
function obSave(){ if(!OB||OB.step==="register") return; S.ob={step:OB.step,ans:OB.ans,plan:OB.plan,picked:OB.picked,locName:OB.locName}; save(); }
function obGo(step){ OB.step=step; obSave(); renderOnboard(); }
function endOnboarding(){
  var ans=(OB&&OB.ans)||(S.ob&&S.ob.ans)||null;
  if(ans&&ans.train){ S.about={train:ans.train,level:ans.level,goal:ans.goal,days:+ans.days||3}; if(!S.celebrate) S.celebrate=GFDRules.celebrateFor(ans); }
  S.onboarded=true; delete S.ob; save();
  var sh=document.getElementById("onboard"); sh.hidden=true; sh.innerHTML=""; document.body.style.overflow=""; OB=null;
  pickToday=true; OPEN={}; renderAll();
}
/* GFD brand lockup shown at the top of the sign-up and sign-in screens */
function brandHtml(){return '<div class="brand"><svg viewBox="0 0 100 100" width="56" height="56" aria-hidden="true"><rect width="100" height="100" rx="22" fill="#D4FF3A"/><circle cx="50" cy="50" r="37" fill="none" stroke="#0D0F12" stroke-width="8"/><text x="50" y="60" text-anchor="middle" font-family="Archivo,sans-serif" font-weight="900" font-size="30" fill="#0D0F12">GFD</text></svg><div><b>Get Fit Daily</b><span>Great Form and Discipline</span></div></div>';}
function obDots(n,extra){return '<div class="wzsteps"><ol>'+[1,2,3].map(function(i){return '<li class="'+(i<n?'done':i===n?'on':'')+'"><span>'+i+'</span></li>';}).join("")+'</ol><p><b>Step '+n+' of 3</b> · '+["About you","Where you train","Your plan"][n-1]+(extra?' · '+extra:'')+'</p></div>';}
/* the plan's days as they'd be with your answers: starter plans follow your days a week */
function obPlanDays(id){
  var t=tmplById(id);
  if(t&&t.starter&&!(planMeta(id).dayIds||[]).length) return WEEK.filter(function(w){return GFDRules.starterDays(OB.ans.days).indexOf(w.id)>=0;}).map(function(w){return resolveDay(w,t.days[w.id]);});
  return buildDaysFor(id);
}
/* share of a plan's exercises the gear here covers; undefined when there's no gear yet to check against */
function obFit(id,g){
  if(id==="coles"||!g.length) return undefined;
  var tot=0, ok=0; obPlanDays(id).forEach(function(d){d.ex.forEach(function(x){ if(!LIB[x.id]) return; tot++; if(!missingFor(LIB[x.id],g).length) ok++; });});
  return tot?ok/tot:undefined;
}
function obRecommend(){
  var g=gear(), fit={}; TEMPLATES.forEach(function(t){ var f=obFit(t.id,g); if(f!==undefined) fit[t.id]=f; });
  return GFDRules.recommendPlan(OB.ans,fit);
}
function obPlanCard(t,pick,g){
  var on=OB.plan===t.id, tag=t.id===pick?'<span class="ttag obbest">Best fit</span>':'';
  if(t.random) return '<button class="tier'+(on?' on':'')+'" role="radio" aria-checked="'+on+'" data-obplan="'+t.id+'"><span class="th"><b>'+esc(t.name)+'</b>'+tag+'<span class="ttag">Random</span></span><span class="tprice">'+esc(t.desc)+'</span><ul><li class="okt">Always fits your gear</li></ul>'+(on?'<span class="tcur">Selected</span>':'')+'</button>';
  var days=obPlanDays(t.id), train=days.filter(function(d){return d.ex.length&&!d.opt;}), opt=days.filter(function(d){return d.ex.length&&d.opt;}), miss=0, tot=0;
  days.forEach(function(d){d.ex.forEach(function(x){tot++; if(g.length&&LIB[x.id]&&missingFor(LIB[x.id],g).length) miss++;});});
  return '<button class="tier'+(on?' on':'')+'" role="radio" aria-checked="'+on+'" data-obplan="'+t.id+'"><span class="th"><b>'+esc(t.name)+'</b>'+tag+'</span><span class="tprice">'+esc(t.desc)+'</span>'+
    '<ul><li>'+train.length+' training day'+(train.length===1?'':'s')+' a week'+(opt.length?' + '+opt.length+' optional cardio':'')+(t.restOff?' · rest timer off':'')+'</li>'+
    '<li class="obdays">'+train.map(function(d){return '<span>'+d.short+' · '+esc(d.title)+'</span>';}).join("")+opt.map(function(d){return '<span class="opt">'+d.short+' · optional</span>';}).join("")+'</li>'+
    '<li class="'+(miss?'warnt':'okt')+'">'+(g.length?(miss?miss+' of '+tot+' exercises need gear you don’t have (you can swap them)':'Fits your gear'):'Add gear to check the fit')+'</li></ul>'+(on?'<span class="tcur">Selected</span>':'')+'</button>';
}
function renderOnboard(){
  var sh=document.getElementById("onboard"); if(!sh||!OB) return;
  var h='<div class="sheet-in ob">', back='<button class="ghost" id="obBack">Back</button>';
  if(OB.step==="register"&&WEB_MODE){ h+=webAuthHtml(); }
  else if(OB.step==="register"){
    h+=brandHtml()+'<div class="obhero"><h1>Welcome</h1><p>Create your account to start testing Get Fit Daily.</p></div>'+
      '<label class="bname"><span>Name</span><input id="obName" maxlength="40" autocomplete="name" placeholder="What should we call you?"></label>'+
      '<label class="bname"><span>Email</span><input id="obEmail" type="email" inputmode="email" autocomplete="email" maxlength="80" placeholder="you@example.com"></label>'+
      '<label class="bname dim"><span>Password</span><input id="obPass" type="text" value="mvp" disabled aria-describedby="obPassNote"><em id="obPassNote">Fixed to “mvp” while we test. Real passwords come with the app store release.</em></label>'+
      '<p class="wzerr" id="obErr" role="alert"></p><button class="primary" id="obRegister">Create account</button>'+
      '<p class="obfine">Test version: your details and workouts are saved on this phone only.</p>';
  } else if(OB_Q[OB.step]){
    var q=OB_Q[OB.step], qi=["train","level","goal","days"].indexOf(OB.step), cur=OB.ans[OB.step];
    if(qi===0) h+='<div class="obhero"><h1>Let’s set you up</h1><p>Four quick questions, then we’ll suggest a plan that fits. You can change everything later.</p></div>';
    h+=obDots(1,'Question '+(qi+1)+' of 4')+'<h2 class="obh" id="obQ">'+q.h+'</h2><p class="sub">'+q.sub+'</p>'+
      '<div class="'+(OB.step==="days"?'obdaysq':'obopts')+'" role="radiogroup" aria-labelledby="obQ">'+q.opts.map(function(o){var on=String(cur)===o[0];
        return '<button class="obopt'+(on?' on':'')+'" role="radio" aria-checked="'+on+'" data-obans="'+OB.step+':'+o[0]+'"><b>'+o[1]+'</b>'+(o[2]?'<span>'+o[2]+'</span>':'')+'</button>';}).join("")+'</div>'+
      (qi>0?'<div class="wznav">'+back+'<span></span></div>':'');
  } else if(OB.step==="loc"){
    var defName=OB.locName||OB_LOC[OB.ans.train]||locState().list[0].name;
    h+=obDots(2)+'<h2 class="obh">Where do you train?</h2><p class="sub">Name your main training spot. You can add more places later, like home or a hotel gym.</p>'+
      '<label class="bname"><span>Location name</span><input id="obLoc" maxlength="24" value="'+esc(defName)+'" autocomplete="off"></label>'+
      '<div class="locsugg">'+LOC_SUGG.map(function(s){return '<button class="chip sm" data-oblocsugg="'+esc(s)+'">'+esc(s)+'</button>';}).join("")+'</div>'+
      '<p class="wzerr" id="obErr" role="alert"></p><div class="wznav">'+back+'<button class="primary" id="obLocNext">Next: equipment</button></div>';
  } else if(OB.step==="gear"){
    h+=obDots(2)+'<h2 class="obh">What’s at '+esc(curLoc().name)+'?</h2><p class="sub">Tap everything you can use there, or start from a quick list. Exercises are matched to this list.</p>'+
      '<div class="locsugg obpresets">'+obPresetOrder(OB.ans.train).map(function(k){return '<button class="chip sm" data-obpreset="'+k+'">+ '+esc(OB_PRESETS[k][0])+'</button>';}).join("")+'</div>'+
      '<div class="eqsearch"><input type="search" id="eqSearch" placeholder="Search, e.g. treadmill, yoga, cable" autocomplete="off" aria-label="Search equipment"><button class="linkbtn" id="clearSearch" hidden>Clear</button></div>'+
      '<div id="eqLists"></div><div class="wznav">'+back+'<button class="primary" id="obGearNext">Next: workout plan</button></div>';
  } else if(OB.step==="plan"){
    var g=gear(), rec=obRecommend();
    if(!OB.picked||!OB.plan){ OB.plan=rec.pick; obSave(); }
    var first=[rec.pick].concat(rec.order.filter(function(id){return id!==rec.pick;})), more=TEMPLATES.filter(function(t){return first.indexOf(t.id)<0;});
    h+=obDots(3)+'<h2 class="obh">Your plan</h2><p class="sub">We picked the one that fits your answers and the gear at '+esc(curLoc().name)+'. Tap another to choose it instead.</p><div class="tiers" role="radiogroup" aria-label="Workout plan">';
    first.forEach(function(id){var t=tmplById(id); if(t) h+=obPlanCard(t,rec.pick,g);});
    var own=OB.plan==="own", moreOn=more.some(function(t){return t.id===OB.plan;});
    h+='<details class="obmore"'+(moreOn?' open':'')+'><summary>More plans</summary><div class="tiers">'+more.map(function(t){return obPlanCard(t,rec.pick,g);}).join("")+'</div></details>';
    h+='<button class="tier'+(own?' on':'')+'" role="radio" aria-checked="'+own+'" data-obplan="own"><span class="th"><b>Build my own</b></span><span class="tprice">Pick your days and exercises step by step.</span>'+(own?'<span class="tcur">Selected</span>':'')+'</button></div>'+
      '<div class="wznav">'+back+'<button class="primary" id="obFinish">'+(own?'Next: build my plan':'Start training')+'</button></div>';
  }
  sh.innerHTML=h+'</div>'; sh.scrollTop=0;
  if(OB.step==="gear") renderGear();
  var f=sh.querySelector("#obName,#obLoc"); if(f) f.focus();
}
/* the week for "Build my own", from your days a week */
function obWeek(n){return ({2:["mon","thu"],3:["mon","wed","fri"],4:["mon","tue","thu","fri"],5:["mon","tue","wed","thu","fri"]})[+n]||[];}
function onboardClick(t){
  if(!OB) return false;
  if(t.id==="obRegister"){
    var n=(document.getElementById("obName").value||"").trim(), e=(document.getElementById("obEmail").value||"").trim(), err=document.getElementById("obErr");
    if(!e){err.textContent="Enter your email to create your account.";document.getElementById("obEmail").focus();return true;}
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)){err.textContent="That email doesn’t look right.";document.getElementById("obEmail").focus();return true;}
    var A=acct(); A.email=e; A.signedIn=true; A.authMode="mvp"; A.registeredAt=new Date().toISOString(); A.tier="tester";
    S.names[0]=n||"You"; save(); resumeOnboarding(); return true;
  }
  if(t.dataset.obans){
    var kv=t.dataset.obans.split(":"), k=kv[0];
    OB.ans[k]=k==="days"?+kv[1]:kv[1];
    obGo(OB_ORDER[OB_ORDER.indexOf(k)+1]);
    var nb=document.querySelector("#onboard .obopt"); if(nb) nb.focus();
    return true;
  }
  if(t.dataset.oblocsugg){var i=document.getElementById("obLoc");i.value=t.dataset.oblocsugg;i.focus();return true;}
  if(t.id==="obLocNext"){
    var v=(document.getElementById("obLoc").value||"").trim();
    if(!v){document.getElementById("obErr").textContent="Give your location a name.";return true;}
    var L2=locState(); L2.list[0].name=v; L2.active=L2.list[0].id; OB.locName=v; obGo("gear"); return true;
  }
  if(t.dataset.obpreset){
    var pr=OB_PRESETS[t.dataset.obpreset], gl=gear(), added=0; pr[1].forEach(function(id){if(gl.indexOf(id)<0){gl.push(id);added++;}});
    save(); renderGear(); toast(added?"Added "+added+" item"+(added===1?"":"s")+" from "+pr[0]:"Already there"); return true;
  }
  if(t.id==="obGearNext"){
    if(!gear().length&&!t.dataset.armed){t.dataset.armed="1";t.textContent="Continue without gear?";setTimeout(function(){if(document.body.contains(t)){delete t.dataset.armed;t.textContent="Next: workout plan";}},3000);return true;}
    obGo("plan"); return true;
  }
  if(t.dataset.obplan){OB.plan=t.dataset.obplan;OB.picked=true;obSave();renderOnboard();var b=document.querySelector('[data-obplan="'+OB.plan+'"]');if(b)b.focus();return true;}
  if(t.id==="obFinish"){
    if(OB.plan==="own"){
      /* setup stays open: the plan builder runs on top, and Cancel there comes back here */
      var days=obWeek(OB.ans.days); obSave();
      var sh=document.getElementById("onboard"); sh.hidden=true; sh.innerHTML="";
      openWizard(null,true); if(days.length){WZ.days=days.slice();renderWizard();} return true;
    }
    var P=plansState(), tp=tmplById(OB.plan); P.active=OB.plan;
    if(tp&&tp.starter&&!(planMeta(OB.plan).dayIds||[]).length&&(+OB.ans.days||3)<=2){ if(!P.meta) P.meta={}; P.meta[OB.plan]=Object.assign({},P.meta[OB.plan],{dayIds:GFDRules.starterDays(OB.ans.days)}); }
    var nm=planById(OB.plan).name; endOnboarding(); toast("You’re on "+nm); return true;
  }
  if(t.id==="obBack"){var k2=OB_ORDER.indexOf(OB.step); obGo(OB_ORDER[Math.max(0,k2-1)]); return true;}
  return false;
}
/* ---------- About you, in Profile: the onboarding answers, editable ---------- */
function aboutHtml(){
  var a=S.about||{};
  var row=function(k,lbl){return '<p class="aboutlbl">'+lbl+'</p><div class="locsugg" role="group" aria-label="'+lbl+'">'+OB_Q[k].opts.map(function(o){return '<button class="chip sm" data-aboutset="'+k+':'+o[0]+'" aria-pressed="'+(String(a[k])===o[0])+'">'+o[1]+'</button>';}).join("")+'</div>';};
  return '<h3 class="psec">About you</h3><p class="sub">Your answers from setup. We use them to suggest plans that fit.</p>'+
    row("train","What you train")+row("level","Experience")+row("goal","Main goal")+row("days","Days a week");
}
function aboutClick(t){
  if(!t.dataset.aboutset) return false;
  var kv=t.dataset.aboutset.split(":"); if(!S.about) S.about={};
  S.about[kv[0]]=kv[0]==="days"?+kv[1]:kv[1]; save();
  document.querySelectorAll('[data-aboutset^="'+kv[0]+':"]').forEach(function(b){b.setAttribute("aria-pressed",b===t?"true":"false");});
  return true;
}
