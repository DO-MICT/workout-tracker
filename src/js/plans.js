/* ---------- workout plans ----------
   Built-in plans live here; your edits to them are stored per plan and day.
   Plans you create are stored whole. Day ex entries: [id, sets, reps, linkWithNext] */
function T(rows){return rows.map(function(r){return {id:r[0],sets:r[1],reps:r[2],link:!!r[3]};});}
var TEMPLATES=[
 {id:"split5",name:"5-day split",desc:"Chest & arms, back & shoulders, legs, then repeat.",days:null},
 {id:"bro",name:"Bro split",desc:"One muscle group a day: chest, back, shoulders, legs, arms.",days:{
  mon:{title:"Chest",ex:T([["bench",4,"6–8"],["incdb",3,"8–10"],["lyingpress",3,"10–12"],["crossfly",3,"12–15"],["pushup",2,"max"]])},
  tue:{title:"Back",ex:T([["bbrow",4,"6–8"],["widepull",3,"10–12"],["cablerow",3,"10–12"],["dbrow",3,"10 / side"],["straightarm",3,"12–15"],["backext",3,"12"]])},
  wed:{title:"Shoulders",ex:T([["ohp",4,"6–8"],["shouldermach",3,"8–10"],["lateral",3,"12–15",1],["revfly",3,"15"],["cablelat",3,"12 / side"],["facepull",3,"15"]])},
  thu:{title:"Legs",ex:T([["goblet",4,"10–12"],["rdl",4,"8"],["bss",3,"8–10 / leg"],["hipthrust",3,"10"],["legext",3,"12",1],["legcurl",3,"12"],["calf",4,"12–15"]])},
  fri:{title:"Arms",ex:T([["ezcurl",3,"8–10",1],["skull",3,"10"],["hammer",3,"10–12",1],["ropepush",3,"10–12"],["cablecurlbar",3,"12",1],["ohext",3,"12"]])}
 }},
 {id:"fb3",name:"Full body 3-day + cardio",desc:"Full body on Monday, Wednesday and Friday. Cardio on Tuesday and Thursday.",days:{
  mon:{title:"Full body A",ex:T([["goblet",3,"10–12"],["bench",3,"6–8"],["widepull",3,"10–12"],["shouldermach",3,"8–10"],["plank",3,"45 s"]])},
  tue:{title:"Cardio",ex:T([["inclinewalk",1,"30 min"],["plank",3,"45 s"]])},
  wed:{title:"Full body B",ex:T([["rdl",3,"8"],["bss",3,"8 / leg"],["incdb",3,"8–10"],["cablerow",3,"10–12"],["lateral",3,"12–15"],["situp",3,"12"]])},
  thu:{title:"Cardio",ex:T([["treadrun",1,"20 min"],["inclinewalk",1,"10 min"],["sideplank",2,"30 s / side"]])},
  fri:{title:"Full body C",ex:T([["hipthrust",3,"10"],["lyingpress",3,"10"],["cgpull",3,"10–12"],["ohp",3,"8–10"],["hammer",2,"12",1],["skull",2,"10"]])}
 }},
 {id:"coles",name:"Cole’s Sessions",desc:"A random session from the gear at your location. Pick full body, upper, lower, core or cardio, how many exercises and how many sets.",days:null,random:true}
];
function plansState(){
  if(!S.plans||typeof S.plans!=="object") S.plans={active:"split5",custom:[],edits:{}};
  var P=S.plans; if(!Array.isArray(P.custom)) P.custom=[]; if(!P.edits) P.edits={};
  if(S.plan&&typeof S.plan==="object"){ P.edits.split5=Object.assign({},S.plan,P.edits.split5||{}); delete S.plan; }  /* move older day edits into the 5-day split */
  return P;
}
function planMeta(id){var P=plansState(); if(!P.meta) P.meta={}; return P.meta[id]||{};}
function allPlans(){var P=plansState();return TEMPLATES.map(function(t){var m=planMeta(t.id);return {id:t.id,name:m.name||t.name,desc:t.desc,builtin:true};}).concat(P.custom.map(function(c){return {id:c.id,name:c.name,desc:"",builtin:false};}));}
function planById(id){var a=allPlans();for(var i=0;i<a.length;i++)if(a[i].id===id)return a[i];return null;}
function activePlan(){var P=plansState();return planById(P.active)||planById("split5");}
function tmplById(id){for(var i=0;i<TEMPLATES.length;i++)if(TEMPLATES[i].id===id)return TEMPLATES[i];return null;}
function customById(id){var c=plansState().custom;for(var i=0;i<c.length;i++)if(c[i].id===id)return c[i];return null;}
/* where a day's exercises come from: null means "use the original 5-day split day as-is" */
function daySource(planId,dayId){
  var P=plansState(), cp=customById(planId);
  if(cp) return (cp.days&&cp.days[dayId])||{title:"Workout",ex:[]};
  var ed=P.edits[planId]&&P.edits[planId][dayId]; if(ed) return ed;
  var t=tmplById(planId); if(!t) return null;
  if(!t.days) return DEFAULT_DAYS.some(function(d){return d.id===dayId;})?null:{title:"Rest day",ex:[]};
  return t.days[dayId]||{title:"Rest day",ex:[]};
}
function isEdited(planId,dayId){var P=plansState();return !!(tmplById(planId)&&P.edits[planId]&&P.edits[planId][dayId]);}
function planEdited(planId){var P=plansState();return !!(tmplById(planId)&&((P.edits[planId]&&Object.keys(P.edits[planId]).length)||Object.keys(planMeta(planId)).length));}
function setDaySource(dayId,src){
  var P=plansState(), id=activePlan().id, cp=customById(id);
  if(cp){ if(!cp.days) cp.days={}; cp.days[dayId]=src; }
  else { if(!P.edits[id]) P.edits[id]={}; P.edits[id][dayId]=src; }
}
function resolveDay(d,src){
  var ex=(src.ex||[]).filter(function(x){return LIB[x.id];}).map(function(x){var L=LIB[x.id];return {id:x.id,n:L.n,f:L.f,c:L.c,mg:L.mg,lab:L.lab,sets:x.sets,reps:x.reps,link:!!x.link};});
  var counts={}, chains=[];
  for(var i=0;i<ex.length;){var j=i;while(ex[j].link&&ex[j+1])j++; if(j>i)chains.push([i,j]); i=j+1;}
  chains.forEach(function(ch){
    var items=ex.slice(ch[0],ch[1]+1), circuit=items.length>2;
    var mgs=items.map(function(x){return x.mg;}).filter(function(v,k,a){return a.indexOf(v)===k;});
    var base=(circuit?"Circuit":"Superset")+": "+mgs.join(" & ");
    counts[base]=(counts[base]||0)+1; items[0].gl=base; items[0]._base=base;
    items.forEach(function(x,k){x.ss=circuit?"c":(k===0?"a":"b");});
  });
  var seen={}; ex.forEach(function(x){ if(x._base&&counts[x._base]>1){seen[x._base]=(seen[x._base]||0)+1; x.gl=x._base.replace(":"," "+seen[x._base]+":");} });
  return {id:d.id,short:d.short,title:src.title||d.title,sub:"",custom:true,ex:ex};
}
function buildDaysFor(planId){
  if(planId==="coles") return [colesDay()];
  var cp=customById(planId);
  if(cp&&Array.isArray(cp.dayIds)&&cp.dayIds.length) return WEEK.filter(function(w){return cp.dayIds.indexOf(w.id)>=0;}).map(function(w){return resolveDay(w,daySource(planId,w.id));});
  var ids=planMeta(planId).dayIds;
  if(tmplById(planId)&&Array.isArray(ids)&&ids.length) return WEEK.filter(function(w){return ids.indexOf(w.id)>=0;}).map(function(w){
    var src=daySource(planId,w.id); if(src) return resolveDay(w,src);
    for(var i=0;i<DEFAULT_DAYS.length;i++) if(DEFAULT_DAYS[i].id===w.id) return DEFAULT_DAYS[i];
    return resolveDay(w,{title:"Rest day",ex:[]});
  });
  return DEFAULT_DAYS.map(function(d){var src=daySource(planId,d.id); return src?resolveDay(d,src):d;});
}
function planRest(id){var cp=customById(id), r=cp?+cp.rest:+planMeta(id).rest; return (r>=5&&r<=600)?r:0;}
function buildDays(){return buildDaysFor(activePlan().id);}
/* resolved day -> storable source (keeps supersets as links) */
function dayToSrc(d){
  return {title:d.title,ex:d.ex.map(function(x,k){var nx=d.ex[k+1];return {id:x.id,sets:x.sets,reps:x.reps,
    link:!!nx&&((x.ss==="a"&&nx.ss==="b")||(x.ss==="b"&&nx.ss==="b")||(x.ss==="c"&&nx.ss==="c"))};})};
}
function usePlan(id){ if(!planById(id)) return; plansState().active=id; save(); OPEN={}; pickToday=true; renderAll(); }
function newPlanId(){return "p"+Date.now().toString(36)+Math.floor(Math.random()*1e4).toString(36);}

/* ---------- plan switcher (tap the title) ---------- */
function renderPlanBtn(){
  var b=document.getElementById("planBtn"); if(!b) return;
  b.firstChild.textContent=activePlan().name;
  var m=document.getElementById("planMenu"), act=activePlan().id;
  m.innerHTML='<div class="menu-lbl2">Switch plan</div>'+allPlans().map(function(p){
    return '<button class="menu-item pm-item" data-useplan="'+p.id+'" aria-pressed="'+(p.id===act)+'"><span>'+esc(p.name)+'</span>'+(p.id===act?'<b aria-hidden="true">✓</b>':'')+'</button>';
  }).join("")+'<button class="menu-item pm-manage" id="managePlans">Manage plans</button>';
}
function setPlanMenu(open){
  var m=document.getElementById("planMenu"), b=document.getElementById("planBtn"); if(!m||!b) return;
  m.hidden=!open; b.setAttribute("aria-expanded",open?"true":"false");
}

/* ---------- Workout plans page ---------- */
var PL_REN=null;
function openPlans(){var sh=document.getElementById("plans"); sh.hidden=false; document.body.style.overflow="hidden"; renderPlans(); sh.scrollTop=0; sh.focus();}
function closePlans(){var sh=document.getElementById("plans"); if(!sh||sh.hidden) return; sh.hidden=true; sh.innerHTML=""; document.body.style.overflow=""; PL_REN=null;}
function renderPlans(){
  var sh=document.getElementById("plans"); if(!sh||sh.hidden) return;
  var act=activePlan().id;
  var h='<div class="sheet-in"><div class="sheet-top"><h2 id="pltitle">Workout plans</h2><button class="chip" id="closePlans">Close</button></div>'+
    '<p class="sub">Pick the plan you’re following. Each plan keeps its own edits. Your logs and PRs follow the exercise, whichever plan you’re on.</p>';
  allPlans().forEach(function(p){
    if(p.id==="coles"){
      var cs=colesSession(), cf=colesFocus(cs?cs.focus:colesState().opts.focus);
      h+='<div class="plcard'+(p.id===act?' on':'')+'"><div class="plhead"><h3>'+esc(p.name)+'</h3>'+(p.id===act?'<span class="pltag">Active</span>':'')+'<span class="ttag">Random</span></div><p class="pldesc">'+esc(p.desc)+'</p>'+
        '<p class="pldesc">'+(cs?'Today: '+esc(cf[1])+' · '+cs.ex.length+' exercises':'No session built today')+'</p>'+
        '<div class="placts">'+(p.id===act?'':'<button class="chip sm primarychip" data-useplan="coles">Use this plan</button>')+'</div></div>';
      return;
    }
    var days=buildDaysFor(p.id), edited=planEdited(p.id);
    h+='<div class="plcard'+(p.id===act?' on':'')+'">';
    if(PL_REN===p.id) h+='<div class="plren"><input id="plName" maxlength="32" value="'+esc(p.name)+'" aria-label="Plan name"><button class="chip sm" data-saveren="'+p.id+'">Save</button></div>';
    else h+='<div class="plhead"><h3>'+esc(p.name)+'</h3>'+(p.id===act?'<span class="pltag">Active</span>':'')+'</div>';
    var pcp=customById(p.id);
    if(p.desc) h+='<p class="pldesc">'+esc(p.desc)+(edited?' <em>Edited</em>':'')+'</p>'; else if(edited) h+='<p class="pldesc"><em>Edited</em></p>';
    h+='<p class="pldesc">'+days.length+' day'+(days.length>1?'s':'')+' a week · rest '+fmtRest(planRest(p.id)||profileRest())+(planRest(p.id)?'':' (default)')+'</p>';
    h+='<ul class="pldays">'+days.map(function(d){return '<li><b>'+d.short+'</b>'+esc(d.title)+'<span>'+(d.ex.length?d.ex.length+' exercises':'Empty')+'</span></li>';}).join("")+'</ul>';
    h+='<div class="placts">'+(p.id===act?'':'<button class="chip sm primarychip" data-useplan="'+p.id+'">Use this plan</button>')+
      '<button class="chip sm" data-editplan="'+p.id+'">Edit</button><button class="chip sm" data-dupplan="'+p.id+'">Duplicate</button>'+
      (p.builtin?'':'<button class="chip sm" data-renplan="'+p.id+'">Rename</button><button class="chip sm danger" data-delplan="'+p.id+'">Delete</button>')+
      (p.builtin&&edited?'<button class="chip sm" data-resetplan="'+p.id+'">Reset edits</button>':'')+'</div></div>';
  });
  h+='<button class="primary" id="newPlan">+ Set up a new plan</button></div>';
  var st=sh.scrollTop; sh.innerHTML=h; sh.scrollTop=st;
  if(PL_REN){var i=document.getElementById("plName"); if(i){i.focus();i.select();}}
}
function confirmTap(t,label,again){
  if(t.dataset.armed) return true;
  t.dataset.armed="1"; t.textContent=again;
  setTimeout(function(){if(document.body.contains(t)){delete t.dataset.armed;t.textContent=label;}},3000);
  return false;
}
function plansClick(t){
  if(t.id==="planBtn"){var m=document.getElementById("planMenu");setPlanMenu(m.hidden);return true;}
  if(t.dataset.useplan){
    var inSheet=!!t.closest("#plans"); setPlanMenu(false); usePlan(t.dataset.useplan);
    if(inSheet) renderPlans(); toast("Now on: "+activePlan().name); return true;
  }
  if(t.id==="openPlans"||t.id==="managePlans"){setPlanMenu(false);openPlans();return true;}
  if(t.id==="closePlans"){closePlans();var b=document.getElementById("planBtn");if(b)b.focus();return true;}
  if(t.dataset.dupplan){
    var src=planById(t.dataset.dupplan), days={};
    buildDaysFor(src.id).forEach(function(d){days[d.id]=dayToSrc(d);});
    var srcDays=buildDaysFor(src.id), scp=customById(src.id);
    var np={id:newPlanId(),name:("Copy of "+src.name).slice(0,32),dayIds:srcDays.map(function(d){return d.id;}),days:days};
    if(scp&&scp.rest) np.rest=scp.rest;
    plansState().custom.push(np); save(); PL_REN=np.id; renderPlans(); toast("Copied. Give it a name");return true;
  }
  if(t.dataset.editplan){openWizard(t.dataset.editplan);return true;}
  if(t.dataset.renplan){PL_REN=t.dataset.renplan;renderPlans();return true;}
  if(t.dataset.saveren){
    var cp=customById(t.dataset.saveren), v=(document.getElementById("plName").value||"").trim();
    if(cp&&v){cp.name=v.slice(0,32);save();} PL_REN=null; renderPlans(); renderPlanBtn(); return true;
  }
  if(t.dataset.delplan){
    if(!confirmTap(t,"Delete","Tap again to delete")) return true;
    var P=plansState(), id=t.dataset.delplan;
    P.custom=P.custom.filter(function(c){return c.id!==id;});
    if(P.active===id){P.active="split5";save();renderAll();} else save();
    renderPlans(); renderPlanBtn(); toast("Plan deleted"); return true;
  }
  if(t.dataset.resetplan){
    if(!confirmTap(t,"Reset edits","Tap again to reset")) return true;
    delete plansState().edits[t.dataset.resetplan]; if(plansState().meta) delete plansState().meta[t.dataset.resetplan]; save(); renderAll(); renderPlans(); toast("Plan reset to the original"); return true;
  }
  if(t.id==="newPlan"){openWizard();return true;}
  return false;
}
/* ---------- guided plan setup ---------- */
var WZ=null; /* {step, days:[ids], titles:{}, ex:{}, cur, rest, name, activate} */
var WZSTEPS=["Pick your days","Add exercises","Rest timer","Name your plan","Review","Save"];
function openWizard(editId){
  WZ={step:1,days:[],titles:{},ex:{},locs:{},cur:"",rest:profileRest(),name:"",activate:true,touched:false};
  var ep=editId&&planById(editId);
  if(ep){
    WZ.editId=ep.id; WZ.step=5; WZ.name=ep.name; WZ.rest=planRest(ep.id)||profileRest(); WZ.restWas=WZ.rest; WZ.activate=activePlan().id===ep.id;
    buildDaysFor(ep.id).forEach(function(d){var s=dayToSrc(d); WZ.days.push(d.id); var dl=dayLocOf(ep.id,d.id); if(dl) WZ.locs[d.id]=dl; WZ.titles[d.id]=d.title; WZ.ex[d.id]=s.ex.map(function(x){return {id:x.id,sets:x.sets,reps:x.reps,link:x.link};});});
    WZ.orig=JSON.stringify([WZ.days,WZ.titles,WZ.ex,WZ.rest,WZ.name,WZ.locs]);
  }
  var sh=document.getElementById("wizard"); sh.hidden=false; document.body.style.overflow="hidden";
  renderWizard(); sh.scrollTop=0; sh.focus();
}
function closeWizard(){
  var sh=document.getElementById("wizard"); if(!sh||sh.hidden) return;
  sh.hidden=true; sh.innerHTML=""; document.body.style.overflow=""; WZ=null; if(BD&&BD.wizard) BD=null;
}
function wzOrderedDays(){return WEEK.filter(function(w){return WZ.days.indexOf(w.id)>=0;});}
function wzHead(){
  var h='<div class="sheet-in"><div class="sheet-top"><h2 id="wtitle">'+(WZ.editId?'Edit plan':'New plan')+'</h2><button class="chip" id="wzCancel">Cancel</button></div>';
  h+='<div class="wzsteps" aria-label="Step '+WZ.step+' of 6"><ol>'+WZSTEPS.map(function(s,i){var n=i+1;return '<li class="'+(n<WZ.step?'done':n===WZ.step?'on':'')+'"'+(n===WZ.step?' aria-current="step"':'')+'><span>'+n+'</span></li>';}).join("")+'</ol>'+
     '<p><b>Step '+WZ.step+' of 6</b> · '+WZSTEPS[WZ.step-1]+'</p></div>';
  return h;
}
function wzNav(nextLabel){
  return '<div class="wznav">'+(WZ.step>1?'<button class="ghost" id="wzBack">Back</button>':'<span></span>')+'<button class="primary" id="wzNext">'+(nextLabel||"Next")+'</button></div></div>';
}
function wzDayLabel(id){for(var i=0;i<WEEK.length;i++)if(WEEK[i].id===id)return WEEK[i].long;return id;}
function renderWizard(){
  var sh=document.getElementById("wizard"); if(!sh||!WZ) return;
  if(WZ.step===2){ wzStep2(); return; }
  var h=wzHead();
  if(WZ.step===1){
    h+='<p class="sub">Which days will you train? Pick at least one. Each day gets its own tab.</p><div class="wzdays" role="group" aria-label="Training days">'+
      WEEK.map(function(w){var on=WZ.days.indexOf(w.id)>=0;return '<button class="wzday" data-wzday="'+w.id+'" aria-pressed="'+on+'"><b>'+w.short+'</b><span>'+w.long+'</span></button>';}).join("")+'</div>'+
      '<p class="wzcount">'+(WZ.days.length?WZ.days.length+' day'+(WZ.days.length>1?'s':'')+' a week':'No days picked yet')+'</p>';
    h+=wzNav();
  } else if(WZ.step===3){
    h+='<p class="sub">How long to rest between sets on this plan. It starts at your default from Profile.</p>'+wheelHtml()+wzNav();
  } else if(WZ.step===4){
    h+='<p class="sub">Give it a name you’ll recognise in the plan list.</p><label class="bname"><span>Plan name</span><input id="wzName" maxlength="32" value="'+esc(WZ.name)+'" placeholder="e.g. Summer cut, Push pull legs" autocomplete="off"></label><p class="wzerr" id="wzErr" role="alert"></p>'+wzNav();
  } else if(WZ.step===5){
    h+='<p class="sub">Check everything before you save. Tap Edit to change a section.</p>';
    h+='<div class="wzrev"><div class="wzrev-h"><h3>'+esc(WZ.name)+'</h3><button class="linkbtn" data-wzgo="4">Edit</button></div>'+
       '<p class="wzmeta">Rest '+fmtRest(WZ.rest)+' between sets <button class="linkbtn" data-wzgo="3">Edit</button></p></div>';
    wzOrderedDays().forEach(function(w){
      var ex=WZ.ex[w.id]||[], title=(WZ.titles[w.id]||"").trim()||"Workout";
      var wl=locById(WZ.locs[w.id])||curLoc(), wg=wl.gear, nmiss=wg.length?ex.filter(function(x){return missingFor(LIB[x.id],wg).length;}).length:0;
      h+='<div class="wzrev"><div class="wzrev-h"><h4><span>'+w.short+'</span>'+esc(ex.length?title:"Rest day")+'</h4><button class="linkbtn" data-wzedit="'+w.id+'">Edit</button></div>';
      if(ex.length) h+='<p class="wzmeta">At '+esc(wl.name)+(nmiss?' · <em class="warnt">'+nmiss+' need gear that isn’t there</em>':(wg.length?' · <span class="okt">all gear there</span>':''))+'</p>';
      if(ex.length){
        h+='<ol class="wzlist">'+ex.map(function(x,k){var L=LIB[x.id], miss=wg.length?needsText(L,wg):"", lk=x.link||(k>0&&ex[k-1].link);
          return '<li class="'+(lk?'lk':'')+'"><span>'+esc(L.n)+(miss?' <em>needs '+esc(miss)+'</em>':'')+'</span><b>'+x.sets+' × '+esc(x.reps)+'</b></li>';}).join("")+'</ol>';
      } else h+='<p class="wzmeta">No exercises. It will show as a rest day.</p>';
      h+='</div>';
    });
    h+='<button class="linkbtn" data-wzgo="1">Change days</button>'+wzNav("Next: save");
  } else if(WZ.step===6){
    var nEx=0; WZ.days.forEach(function(d){nEx+=(WZ.ex[d]||[]).length;});
    h+='<div class="wzdone"><h3>'+esc(WZ.name)+'</h3><p>'+WZ.days.length+' day'+(WZ.days.length>1?'s':'')+' a week · '+nEx+' exercises · rest '+fmtRest(WZ.rest)+'</p>'+
       (WZ.editId&&activePlan().id===WZ.editId?'<p>This is the plan you’re on now.</p>':'<label class="ptoggle"><input type="checkbox" id="wzAct"'+(WZ.activate?' checked':'')+'> Start using this plan now</label>')+'</div>'+wzNav(WZ.editId?"Save changes":"Create plan");
  }
  sh.innerHTML=h;
  if(WZ.step===3) initWheel(WZ.rest,function(v){WZ.rest=v;});
  if(WZ.step===4){var i=document.getElementById("wzName"); if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length);}}
}
/* step 2 reuses the workout editor and exercise picker, one day at a time */
function wzStep2(){
  var od=wzOrderedDays(); if(!WZ.cur||WZ.days.indexOf(WZ.cur)<0) WZ.cur=od[0].id;
  if(!WZ.ex[WZ.cur]) WZ.ex[WZ.cur]=[];
  if(!BD||!BD.wizard||BD.dayId!==WZ.cur) BD={wizard:true,dayId:WZ.cur,loc:WZ.locs[WZ.cur]||"",title:WZ.titles[WZ.cur]||"",ex:WZ.ex[WZ.cur],view:"edit",q:"",mg:"",all:false,dirty:false};
  renderBuilder();
}
function wzBuilderChrome(){ /* header for step 2 inside the editor */
  var od=wzOrderedDays();
  var h=wzHead()+'<p class="sub">Add exercises to each day. Leave a day empty to make it a rest day.</p>'+
    '<div class="wzdaytabs" role="tablist" aria-label="Days">'+od.map(function(w){var n=(WZ.ex[w.id]||[]).length;
      return '<button class="chip sm" role="tab" data-wzcur="'+w.id+'" aria-selected="'+(w.id===WZ.cur)+'">'+w.short+(n?' · '+n:'')+'</button>';}).join("")+'</div>'+
    '<h3 class="psec">'+wzDayLabel(WZ.cur)+'</h3>';
  return h;
}
function wzValidate(){
  if(WZ.step===1&&!WZ.days.length){toast("Pick at least one day");return false;}
  if(WZ.step===2){ if(!WZ.days.some(function(d){return (WZ.ex[d]||[]).length;})){toast("Add exercises to at least one day");return false;} }
  if(WZ.step===4){
    var v=(document.getElementById("wzName").value||"").trim(), err=document.getElementById("wzErr");
    if(!v){err.textContent="Give your plan a name.";document.getElementById("wzName").focus();return false;}
    if(allPlans().some(function(p){return p.id!==WZ.editId&&p.name.toLowerCase()===v.toLowerCase();})){err.textContent="You already have a plan with that name.";return false;}
    WZ.name=v;
  }
  return true;
}
function wzGo(step){ WZ.step=step; if(step!==2&&BD&&BD.wizard) BD=null; renderWizard(); document.getElementById("wizard").scrollTop=0; }
function wzSubmit(){
  if(WZ.editId) return wzSaveEdit();
  var days={};
  wzOrderedDays().forEach(function(w){
    days[w.id]={title:(WZ.titles[w.id]||"").trim()||((WZ.ex[w.id]||[]).length?"Workout":"Rest day"),
      ex:(WZ.ex[w.id]||[]).map(function(x,k,a){return {id:x.id,sets:x.sets,reps:(x.reps||"").trim()||LIB[x.id].reps,link:!!x.link&&k<a.length-1};})};
  });
  var np={id:newPlanId(),name:WZ.name,dayIds:wzOrderedDays().map(function(w){return w.id;}),days:days,rest:WZ.rest};
  plansState().custom.push(np);
  wzDays2Locs(np.id);
  var act=WZ.activate; if(act) plansState().active=np.id;
  save(); closeWizard(); closePlans();
  if(act){OPEN={};pickToday=true;} renderAll();
  toast(act?"Plan created. You’re now on "+np.name:"Plan created");
}
function wzBuiltDays(){
  var days={};
  wzOrderedDays().forEach(function(w){
    days[w.id]={title:(WZ.titles[w.id]||"").trim()||((WZ.ex[w.id]||[]).length?"Workout":"Rest day"),
      ex:(WZ.ex[w.id]||[]).map(function(x,k,a){return {id:x.id,sets:x.sets,reps:(x.reps||"").trim()||LIB[x.id].reps,link:!!x.link&&k<a.length-1};})};
  });
  return days;
}
function wzDays2Locs(pid){var P=plansState(); if(!P.dayLoc) P.dayLoc={}; var m={}; WZ.days.forEach(function(d){if(WZ.locs[d]&&locById(WZ.locs[d]))m[d]=WZ.locs[d];}); P.dayLoc[pid]=m;}
function wzSaveEdit(){
  var id=WZ.editId, days=wzBuiltDays(), ids=wzOrderedDays().map(function(w){return w.id;}), cp=customById(id), P=plansState();
  wzDays2Locs(id);
  if(cp){ cp.name=WZ.name; cp.dayIds=ids; cp.days=days; cp.rest=WZ.rest; }
  else {
    /* built-in: store only what differs from the original */
    var t=tmplById(id); if(!P.meta) P.meta={}; var m={};
    if(WZ.name!==t.name) m.name=WZ.name;
    if(WZ.rest!==WZ.restWas||planMeta(id).rest) m.rest=WZ.rest;
    if(ids.join()!=="mon,tue,wed,thu,fri") m.dayIds=ids;
    if(Object.keys(m).length) P.meta[id]=m; else delete P.meta[id];
    var ed={}, orig={}; delete P.edits[id]; var saveMeta=P.meta[id]; delete P.meta[id];
    buildDaysFor(id).forEach(function(d){orig[d.id]=JSON.stringify(dayToSrc(d));});   /* original, without edits */
    if(saveMeta) P.meta[id]=saveMeta;
    ids.forEach(function(d){ var s=days[d]; if(!orig[d]||JSON.stringify(s)!==orig[d]) ed[d]=s; });
    if(Object.keys(ed).length) P.edits[id]=ed;
  }
  var a=document.getElementById("wzAct"); if(a&&a.checked&&activePlan().id!==id){P.active=id;pickToday=true;OPEN={};}
  save(); closeWizard(); renderAll(); renderPlans(); toast("Changes saved");
}
function wizardClick(t){
  if(!WZ) return false;
  if(t.id==="wzCancel"){
    var started=WZ.editId?JSON.stringify([WZ.days,WZ.titles,WZ.ex,WZ.rest,WZ.name,WZ.locs])!==WZ.orig:(WZ.days.length||WZ.name);
    if(started&&!t.dataset.armed){t.dataset.armed="1";t.textContent=WZ.editId?"Discard changes?":"Discard plan?";setTimeout(function(){if(document.body.contains(t)){delete t.dataset.armed;t.textContent="Cancel";}},3000);return true;}
    closeWizard();return true;
  }
  if(t.dataset.wzday){var id=t.dataset.wzday,k=WZ.days.indexOf(id); if(k>=0) WZ.days.splice(k,1); else WZ.days.push(id); renderWizard(); var b=document.querySelector('[data-wzday="'+id+'"]'); if(b) b.focus(); return true;}
  if(t.dataset.wzcur){ if(BD&&BD.wizard) WZ.titles[WZ.cur]=BD.title; WZ.cur=t.dataset.wzcur; BD=null; wzStep2(); var c=document.querySelector('[data-wzcur="'+WZ.cur+'"]'); if(c) c.focus(); return true;}
  if(t.dataset.wzgo){wzGo(+t.dataset.wzgo);return true;}
  if(t.dataset.wzedit){WZ.cur=t.dataset.wzedit;wzGo(2);return true;}
  if(t.id==="wzBack"){ if(WZ.step===4) WZ.name=(document.getElementById("wzName").value||"").trim(); if(BD&&BD.wizard) WZ.titles[WZ.cur]=BD.title; wzGo(WZ.step-1); return true; }
  if(t.id==="wzNext"){
    if(BD&&BD.wizard) WZ.titles[WZ.cur]=BD.title;
    if(!wzValidate()) return true;
    if(WZ.step===6){ var a=document.getElementById("wzAct"); WZ.activate=!a||a.checked; wzSubmit(); return true; }
    wzGo(WZ.step+1); return true;
  }
  return false;
}
