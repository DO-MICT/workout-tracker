/* ---------- profile: rest timer, account and links to body measurements (measure.js) ---------- */
function profileRest(){var r=S.profile&&+S.profile.rest; return (r>=5&&r<=600)?r:90;}
function restSec(){if(S.plans&&planRestOff(activePlan().id)) return 0; var r=S.plans?planRest(activePlan().id):0; return r||profileRest();}
var WH=40;
function wheelItems(n,step){var s='<div class="wpad"></div>';for(var i=0;i<n;i++)s+='<div class="witem">'+(step===5?String(i*step).padStart(2,"0"):i*step)+'</div>';return s+'<div class="wpad"></div>';}
function wIndex(el){return Math.max(0,Math.min(el.querySelectorAll(".witem").length-1,Math.round(el.scrollTop/WH)));}
function wMark(el){var k=wIndex(el);el.querySelectorAll(".witem").forEach(function(it,j){it.classList.toggle("on",j===k);});var v=el.id==="wMin"?k:k*5;el.setAttribute("aria-valuenow",v);el.setAttribute("aria-valuetext",v+(el.id==="wMin"?" minutes":" seconds"));}
var WSET=null;
function wheelHtml(){
  return '<div class="wheel" aria-label="Rest period">'+
      '<div class="wcol"><div class="wscroll" id="wMin" tabindex="0" role="spinbutton" aria-label="Rest minutes" aria-valuemin="0" aria-valuemax="10">'+wheelItems(11,1)+'</div><span class="wunit">min</span></div>'+
      '<div class="wcol"><div class="wscroll" id="wSec" tabindex="0" role="spinbutton" aria-label="Rest seconds" aria-valuemin="0" aria-valuemax="55">'+wheelItems(12,5)+'</div><span class="wunit">sec</span></div>'+
    '</div>';
}
function wCommit(){
  var m=document.getElementById("wMin"), s=document.getElementById("wSec"); if(!m||!s) return;
  var tot=wIndex(m)*60+wIndex(s)*5;
  if(tot<5){s.scrollTo({top:WH,behavior:"smooth"});return;}
  if(WSET) WSET(tot);
}
function initWheel(initial,onSet){
  WSET=onSet||function(v){if(v!==profileRest()){prof().rest=v;save();}};
  var r=initial||profileRest(), m=document.getElementById("wMin"), s=document.getElementById("wSec"); if(!m||!s) return;
  m.scrollTop=Math.floor(r/60)*WH; s.scrollTop=Math.round((r%60)/5)*WH; wMark(m); wMark(s);
  [m,s].forEach(function(el){
    var tmr=null;
    el.addEventListener("scroll",function(){wMark(el);clearTimeout(tmr);tmr=setTimeout(wCommit,160);},{passive:true});
    el.addEventListener("keydown",function(e){
      var d=e.key==="ArrowDown"?1:e.key==="ArrowUp"?-1:0; if(!d) return; e.preventDefault();
      el.scrollTo({top:(wIndex(el)+d)*WH,behavior:"smooth"});
    });
    el.addEventListener("click",function(e){var it=e.target.closest(".witem");if(!it)return;var j=Array.prototype.indexOf.call(el.querySelectorAll(".witem"),it);el.scrollTo({top:j*WH,behavior:"smooth"});});
  });
}
function fmtRest(s){return Math.floor(s/60)+":"+String(s%60).padStart(2,"0");}
function prof(){ if(!S.profile) S.profile={vals:{},hist:[]}; if(!S.profile.hist) S.profile.hist=[]; if(!S.profile.vals) S.profile.vals={}; return S.profile; }
function fmtDay(iso){var d=new Date(iso);return isNaN(d)?"":d.toLocaleDateString(undefined,{day:"numeric",month:"short"});}
/* ---------- account ----------
   Filled by Supabase sign-in in web mode. Passwords are never stored here.
   What the account may use (Free, Pro, Tester) comes from the server: see access.js. */
function acct(){
  if(!S.account||typeof S.account!=="object") S.account={v:1,id:"",provider:"email",email:"",emailVerified:false,signedIn:false,createdAt:new Date().toISOString()};
  return S.account;
}
function accountHtml(){
  var A=acct(), h;
  if(WEB_MODE&&sbUser){
    h='<h3 class="psec">Your details</h3><p class="sub">Signed in as <b>'+esc(sbUser.email||A.email||"")+'</b>. Your data syncs to your account.</p>'+
      '<div class="acct"><label class="bname"><span>Name</span><input id="acName" maxlength="40" autocomplete="name" value="'+esc(S.names[0]||"")+'"></label>'+
      '<p class="wzerr" id="acErr" role="alert"></p><button class="primary" id="saveAcct">Save details</button>'+
      '<div class="soon"><div><b>Account</b><span>'+(sbOk?'Synced':'Not synced yet')+'</span></div><div class="soonbtns"><button class="chip sm danger" id="signOut">Sign out</button></div></div></div>';
  } else
  h='<h3 class="psec">Your details</h3><p class="sub">Saved with your data. Sign-in with email and password comes with the app store release.</p>'+
    '<div class="acct"><label class="bname"><span>Name</span><input id="acName" maxlength="40" autocomplete="name" value="'+esc(S.names[0]||"")+'"></label>'+
    '<label class="bname"><span>Email</span><input id="acEmail" type="email" inputmode="email" autocomplete="email" maxlength="80" value="'+esc(A.email||"")+'" placeholder="you@example.com"></label>'+
    '<p class="wzerr" id="acErr" role="alert"></p><button class="primary" id="saveAcct">Save details</button>'+
    '<div class="soon"><div><b>Account</b><span>'+(A.signedIn?'Signed in':'Not signed in')+' · email and password sign-in coming soon</span></div>'+
    '<div class="soonbtns"><button class="chip sm" disabled aria-disabled="true">Create account</button><button class="chip sm" disabled aria-disabled="true">Sign in</button></div></div></div>';
  h+=accessHtml()+consentHtml();
  return h;
}
function saveAcct(){
  var n=(document.getElementById("acName").value||"").trim(), ae=document.getElementById("acEmail"), e=ae?(ae.value||"").trim():acct().email||"", err=document.getElementById("acErr");
  if(e&&!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)){err.textContent="That email doesn’t look right.";document.getElementById("acEmail").focus();return;}
  err.textContent=""; var A=acct();
  if(A.email!==e){A.email=e;A.emailVerified=false;}
  if(n) S.names[0]=n.slice(0,40);
  if(WEB_MODE&&sb&&sbUser&&n) sb.from("profiles").update({display_name:n.slice(0,40)}).eq("id",sbUser.id).then(function(){},function(){});
  save(); renderAll(); toast("Details saved");
}
function openProfile(){
  var P=prof(), hs=P.hist, lastS=hs.length?hs[hs.length-1]:null;
  var h='<div class="sheet-in"><div class="sheet-top"><h2 id="ptitle">Profile</h2><button class="chip" id="closeProfile">Close</button></div>'+
    accountHtml()+
    aboutHtml()+
    '<h3 class="psec">Default rest timer</h3><p class="sub">Used by the built-in plans. Plans you set up can have their own. Saves as you scroll.</p>'+
    wheelHtml()+
    '<button class="linkbtn" id="testPing">Play the start sound</button>'+
    '<h3 class="psec">Celebrations</h3><p class="sub">How the app cheers when you finish a workout. Calm uses quieter words and no confetti.</p>'+
    '<div class="seg" role="group" aria-label="Celebration style">'+[["energetic","Energetic"],["calm","Calm"]].map(function(o){return '<button data-celebset="'+o[0]+'" aria-pressed="'+(celebStyle()===o[0])+'">'+o[1]+'</button>';}).join("")+'</div>'+
    '<h3 class="psec" id="pMeas">Body measurements</h3><p class="sub">'+(lastS?'Last check-in '+esc(fmtDay(lastS.d))+'.':'Nothing saved yet.')+' Weigh in and measure one card at a time.</p>'+
    '<div class="ms-row2"><button class="chip" data-ms="start">Body check-in</button><button class="chip" data-ms="progress">Body progress</button></div>';
  /* backup codes are for moving data by hand: tucked away so Profile reads like a finished app (F5.E3.S1) */
  h+=accountDataHtml()+'<details class="padv"><summary>Advanced</summary>'+backupHtml()+'</details></div>';
  var sh=document.getElementById("profile"); sh.innerHTML=h; sh.hidden=false; sh.scrollTop=0;
  document.body.style.overflow="hidden"; sh.focus();
  initWheel();
  if(WEB_MODE&&sbUser) consentProfileLoad();
}
function closeProfile(){
  var sh=document.getElementById("profile"); if(!sh||sh.hidden) return;
  sh.hidden=true; sh.innerHTML=""; document.body.style.overflow="";
}
function cardDone(c){return c.classList.contains("grp")?!!c.querySelector(":scope > summary .gcnt.all"):c.classList.contains("alldone");}
function advanceFrom(ex){
  var g=groupOf(ex), card;
  if(g){ if(!g.items.every(function(x){return setsFor(x).slice(0,x.sets).every(function(s){return s.d;});})) return;
         card=document.querySelector('#day > details.grp[data-gk="'+g.items[0].id+'"]'); }
  else card=document.querySelector('#day > details.ex[data-ex="'+ex.id+'"]');
  if(!card) return;
  var next=card.nextElementSibling;
  while(next&&(!next.matches("details.ex,details.grp")||cardDone(next))) next=next.nextElementSibling;
  setTimeout(function(){
    if(!document.body.contains(card)) return;
    card.open=false;
    if(next){
      next.open=true;
      if(next.classList.contains("grp")) next.querySelectorAll("details.ex").forEach(function(x){x.open=true;});
      var calm=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
      next.scrollIntoView({behavior:calm?"auto":"smooth",block:"start"});
    }
  },450);
}
function groupOf(ex){var gs=groupsOf(DAYS[day]);for(var k=0;k<gs.length;k++){if(gs[k].kind!=="single"&&gs[k].items.indexOf(ex)>=0)return gs[k];}return null;}
function findEx(id){var d=DAYS[day];for(var i=0;i<d.ex.length;i++)if(d.ex[i].id===id)return d.ex[i];return null;}
/* ---------- ticking, checking and deleting sets (F1) ---------- */
function setInput(ex,i,f){ return document.querySelector('input[data-ex="'+ex.id+'"][data-i="'+i+'"][data-f="'+f+'"]'); }
function boxName(lab,f){ return f==="w"?(lab[0]==="km"?"distance":"weight"):(lab[1]==="reps"?"reps":"time"); }
function tickSet(ex,i,btn){
  if(!ex) return;
  var arr=setsFor(ex), s=arr[i], lab=labOf(ex);
  if(!s.d){
    /* an empty box can't be ticked: what you see is what's saved */
    var miss=GFDRules.tickMissing(lab,s);
    if(miss){ var inp=setInput(ex,i,miss); if(inp) inp.focus(); toast("Type the "+boxName(lab,miss)+" first"); return; }
    var j=jumpFor(ex,i);
    if(j){ askJump(ex,i,j,function(){ tickSet(ex,i); }); return; }
  }
  s.d=!s.d;
  if(s.d){
    if(!s.at) s.at=Date.now();
    var g=groupOf(ex);
    if(!g||g.items.every(function(x){return x.sets<=i||setsFor(x)[i].d;})) {var rs=restSec(); if(rs) startTimer(rs);}
    else{var nx=g.items.filter(function(x){return x.sets>i&&!setsFor(x)[i].d;})[0]; audio(); toast("Next: "+nx.n+", set "+(i+1));}
  }
  var b=btn||document.querySelector('[data-tick="'+ex.id+'"][data-i="'+i+'"]');
  if(b){
    var row=b.parentElement; b.setAttribute("aria-pressed",s.d); row.classList.toggle("isdone",s.d); row.classList.remove("editing");
    row.classList.toggle("missed",!!s.d&&GFDRules.isMissed(lab,s,ex.reps));
    var mn=document.querySelector('.missnote[data-miss="'+ex.id+'"]');
    if(mn){ var tmp=document.createElement("div"), ms=[]; arr.slice(0,ex.sets).forEach(function(x,k){ if(x.d&&GFDRules.isMissed(lab,x,ex.reps)) ms.push(k+1); }); tmp.innerHTML=missNote(ex,ms); mn.replaceWith(tmp.firstChild); }
    var n=row.querySelector(".n"); if(n) n.innerHTML=setNumHtml(ex,i,s.d);
  }
  refreshSets(ex); save(); updateProgress();
  if(s.d&&arr.slice(0,ex.sets).every(function(x){return x.d;})) advanceFrom(ex);
}
/* the bin on a ticked set: clear it, with Undo */
function deleteSet(ex,i){
  if(!ex) return;
  var arr=setsFor(ex), snap=JSON.parse(JSON.stringify(arr[i]));
  arr[i]={w:"",r:"",d:false,t:1};
  save(); renderDay();
  toastAction("Set "+(i+1)+" of "+ex.n+" deleted","Undo",function(){
    var a=setsFor(ex); a[i]=snap; save(); renderDay();
  });
}
/* tapping into a ticked set opens it for editing and shows its bin */
document.addEventListener("focusin",function(e){
  var row=e.target.closest&&e.target.closest("#day .setrow");
  document.querySelectorAll("#day .setrow.editing").forEach(function(r){ if(r!==row) r.classList.remove("editing"); });
  if(row&&row.classList.contains("isdone")) row.classList.add("editing");
});
/* is set i far above last time? (rules.js bigJump) Not asked again once you've kept that value. */
function jumpFor(ex,i){
  var arr=setsFor(ex), s=arr[i], lab=labOf(ex);
  if(!lab[0]||!s.w||s.ok===s.w) return null;
  var L=lastFor(ex.id,ex);
  return GFDRules.bigJump(lab,s.w,L&&L.sets,GFDRules.loggedSets(arr.slice(0,i)));
}
var ASK=null;
function askJump(ex,i,j,then){
  var el=document.getElementById("askpop"); if(!el){ then(); return; }
  var s=setsFor(ex)[i], u=labOf(ex)[0].replace("+",""), uw=GFDRules.showUnit(u,U());
  ASK={ex:ex,i:i,then:then};
  el.innerHTML='<div class="donecard askcard" role="alertdialog" aria-modal="true" aria-labelledby="askTitle" aria-describedby="askText">'+
    '<h2 id="askTitle">Check this set</h2><p class="asksub">'+esc(ex.n)+', set '+(i+1)+'</p>'+
    '<p id="askText" class="asktext">'+esc(GFDRules.jumpText(j,s.w,u,U()))+'</p>'+
    '<div class="donebtns"><button class="ghost" id="askKeep">Keep '+esc(u==="kg"?GFDRules.boxShow(s.w,U()):fmtNum(+s.w))+' '+esc(uw)+'</button><button class="primary" id="askFix">Fix it</button></div></div>';
  el.hidden=false; document.body.style.overflow="hidden";
  document.getElementById("askFix").focus();
}
function askAnswer(keep){
  var el=document.getElementById("askpop"), a=ASK; ASK=null;
  if(el){ el.hidden=true; el.innerHTML=""; document.body.style.overflow=""; }
  if(!a) return;
  var s=setsFor(a.ex)[a.i];
  if(keep){ s.ok=s.w; save(); a.then(); return; }
  /* Fix: open the exercise and put the cursor in the weight box */
  OPEN[day+":"+a.ex.id]=true;
  var card=document.querySelector('details.ex[data-ex="'+a.ex.id+'"]');
  if(card){ card.open=true; var gp=card.closest("details.grp"); if(gp) gp.open=true; }
  var inp=setInput(a.ex,a.i,"w"); if(inp){ inp.focus(); try{inp.select();}catch(e){} }
}
function finishWorkout(){
  var d=DAYS[day];
  /* check big jumps first, so a typo never becomes a record or last time */
  for(var k=0;k<d.ex.length;k++){
    var ex0=d.ex[k], a0=setsFor(ex0);
    for(var i=0;i<ex0.sets;i++){
      if(!GFDRules.loggedSets([a0[i]]).length) continue;
      var j=jumpFor(ex0,i); if(j){ askJump(ex0,i,j,finishWorkout); return; }
    }
  }
  var c=cur(), L=last(), saved=0, now=new Date().toISOString(), rec=buildWorkout(d), wins={prs:[],up:[],prevCardio:{},missed:[],miles:[]};
  /* milestones need every earlier workout; skipped until history has loaded on a new phone */
  var prevDates=histKnown()?workoutDates():null, planned=0, ticked=0;
  d.ex.forEach(function(ex){
    var all=setsFor(ex).slice(0,ex.sets), arr=GFDRules.loggedSets(all), Ls=lastFor(ex.id,ex), lab=labOf(ex);
    planned+=ex.sets;
    all.forEach(function(s,i){ if(s.d&&!GFDRules.isMissed(lab,s,ex.reps)) ticked++; if(s.d&&GFDRules.isMissed(lab,s,ex.reps)) wins.missed.push({n:ex.n,set:i+1}); });
    /* cardio: keep last time's distance and minutes so the summary can compare pace */
    if(ex.lab==="cardio"&&Ls&&Ls.sets) wins.prevCardio[ex.id]=cardioSum(Ls.sets.map(function(s){return {weight:parseFloat(s.w),reps:parseFloat(s.r)};}));
    /* before this workout joins history: compare with the record and with last time (rules.js) */
    var win=GFDRules.sessionWin(ex.lab,lab,arr,bestFor(ex.id),Ls&&Ls.sets,ex.reps);
    if(win&&win.pr) wins.prs.push({n:ex.n,now:win.pr.now,was:win.pr.was,u:win.pr.u,what:win.pr.what,about:win.pr.about});
    else if(win&&win.up) wins.up.push({n:ex.n,by:win.up.by,u:win.up.u});
    /* a copy of last time kept with the app data, used only until history loads on a new phone */
    if(arr.length){L[ex.id]={date:now,sets:arr.map(function(s){return {w:s.w,r:s.r};})};saved++;}
    delete c[ex.id];
  });
  if(rec&&prevDates) wins.miles=GFDRules.milestones(prevDates,rec.performed_at,DAYS.filter(function(x){return !x.coles&&!x.opt&&x.ex.length;}).length,planned>0&&ticked===planned);
  /* today-only swaps end with the workout: next time the plan's own exercises are back */
  if(saved&&rec&&d.ex.some(function(x){return x.swFrom;})){ endTodaySwaps(d.id); DAYS=buildDays(); }
  recordWorkout(rec); save(); stopTimer(); renderDay(); window.scrollTo(0,0);
  if(saved&&rec) showDone(rec,d,wins);
  if(saved&&rec&&prevDates&&!prevDates.length) logEvent("first_workout",{exercises:d.ex.length});
  else toast("Nothing logged yet. Tick a set or type a weight or reps first.");
}
