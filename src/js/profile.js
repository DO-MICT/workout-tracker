/* ---------- profile: body measurements ---------- */
var PF=[["height","Height","cm"],["weight","Weight","kg"],["waist","Waist","cm"],["chest","Chest","cm"],["uarm","Upper arm","cm"],["larm","Lower arm","cm"],["abd","Abdomen","cm"],["glutes","Glutes","cm"],["thighs","Thighs","cm"],["calves","Calves","cm"]];
function profileRest(){var r=S.profile&&+S.profile.rest; return (r>=5&&r<=600)?r:90;}
function restSec(){var r=S.plans?planRest(activePlan().id):0; return r||profileRest();}
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
/* ---------- account + subscription (placeholders for the app store release) ----------
   Shape is ready for real sign-in later: an auth provider will fill id/emailVerified,
   and the store will set tier. Passwords are never stored here. */
var TIERS=[
 {id:"free",name:"Free",price:"R0",tag:"Basic",pts:["Built-in plans and workout logging","Equipment and one location"]},
 {id:"pro",name:"Pro",price:"Price TBC / month",tag:"Full access",pts:["Unlimited plans and locations","Guided plan setup and swaps"]},
 {id:"tester",name:"Tester",price:"Free during testing",tag:"Beta",pts:["Everything in Pro while the app is being tested","Early features before release","Send feedback"]}
];
function acct(){
  if(!S.account||typeof S.account!=="object") S.account={v:1,id:"",provider:"email",email:"",emailVerified:false,signedIn:false,tier:"tester",tierSource:"placeholder",createdAt:new Date().toISOString()};
  return S.account;
}
function tierOf(){var t=acct().tier;return TIERS.some(function(x){return x.id===t;})?t:"tester";}
function accountHtml(){
  var A=acct(), tier=tierOf(), h;
  if(WEB_MODE&&sbUser){
    h='<h3 class="psec">Your details</h3><p class="sub">Signed in as <b>'+esc(sbUser.email||A.email||"")+'</b>. Your data syncs to your account.</p>'+
      '<div class="acct"><label class="bname"><span>Name</span><input id="acName" maxlength="40" autocomplete="name" value="'+esc(S.names[0]||"")+'"></label>'+
      '<p class="wzerr" id="acErr" role="alert"></p><button class="primary" id="saveAcct">Save details</button>'+
      '<div class="soon"><div><b>Account</b><span>'+(sbOk?'Synced':'Not synced yet')+' · server tier: '+esc(A.serverTier||"tester")+'</span></div><div class="soonbtns"><button class="chip sm danger" id="signOut">Sign out</button></div></div></div>';
  } else
  h='<h3 class="psec">Your details</h3><p class="sub">Saved with your data. Sign-in with email and password comes with the app store release.</p>'+
    '<div class="acct"><label class="bname"><span>Name</span><input id="acName" maxlength="40" autocomplete="name" value="'+esc(S.names[0]||"")+'"></label>'+
    '<label class="bname"><span>Email</span><input id="acEmail" type="email" inputmode="email" autocomplete="email" maxlength="80" value="'+esc(A.email||"")+'" placeholder="you@example.com"></label>'+
    '<p class="wzerr" id="acErr" role="alert"></p><button class="primary" id="saveAcct">Save details</button>'+
    '<div class="soon"><div><b>Account</b><span>'+(A.signedIn?'Signed in':'Not signed in')+' · email and password sign-in coming soon</span></div>'+
    '<div class="soonbtns"><button class="chip sm" disabled aria-disabled="true">Create account</button><button class="chip sm" disabled aria-disabled="true">Sign in</button></div></div></div>';
  h+='<h3 class="psec">Subscription</h3><p class="sub">Placeholder tiers for the app store launch. No payment is taken, and switching here only changes how the app looks for testing.</p>'+
    '<div class="tiers" role="radiogroup" aria-label="Subscription tier">'+TIERS.map(function(t){
      return '<button class="tier'+(t.id===tier?' on':'')+'" role="radio" aria-checked="'+(t.id===tier)+'" data-tier="'+t.id+'">'+
        '<span class="th"><b>'+t.name+'</b><span class="ttag">'+t.tag+'</span></span><span class="tprice">'+t.price+'</span>'+
        '<ul>'+t.pts.map(function(x){return '<li>'+x+'</li>';}).join("")+'</ul>'+(t.id===tier?'<span class="tcur">Current</span>':'')+'</button>';
    }).join("")+'</div>';
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
  var P=prof(), hs=P.hist, lastS=hs.length?hs[hs.length-1]:null, prevS=hs.length>1?hs[hs.length-2]:null;
  var h='<div class="sheet-in"><div class="sheet-top"><h2 id="ptitle">Profile</h2><button class="chip" id="closeProfile">Close</button></div>'+
    accountHtml()+
    '<h3 class="psec">Default rest timer</h3><p class="sub">Used by the built-in plans. Plans you set up can have their own. Saves as you scroll.</p>'+
    wheelHtml()+
    '<button class="linkbtn" id="testPing">Play the start sound</button>'+
    '<h3 class="psec" id="pMeas">Measurements</h3><p class="sub">'+(lastS?'Last saved '+esc(fmtDay(lastS.d))+'.':'Nothing saved yet.')+'</p><div class="pgrid">';
  PF.forEach(function(f){
    var v=P.vals[f[0]]; v=(v===undefined?"":v);
    var delta="";
    if(lastS&&prevS){var a=parseFloat(lastS.v[f[0]]),b=parseFloat(prevS.v[f[0]]);
      if(isFinite(a)&&isFinite(b)&&a!==b){var df=Math.round((a-b)*10)/10;delta=(df>0?"+":"−")+Math.abs(df)+" "+f[2]+" since "+fmtDay(prevS.d);}}
    h+='<label class="pf"><span class="pl">'+f[1]+'<i>'+f[2]+'</i></span><input inputmode="decimal" autocomplete="off" data-pf="'+f[0]+'" value="'+esc(v)+'" aria-label="'+f[1]+' in '+(f[2]==="kg"?"kilograms":"centimetres")+'"><span class="pd">'+esc(delta)+'</span></label>';
  });
  h+='</div><button class="primary" id="saveProfile">Save measurements</button>'+backupHtml()+'</div>';
  var sh=document.getElementById("profile"); sh.innerHTML=h; sh.hidden=false; sh.scrollTop=0;
  document.body.style.overflow="hidden"; sh.focus();
  initWheel();
}
function closeProfile(){
  var sh=document.getElementById("profile"); if(!sh||sh.hidden) return;
  sh.hidden=true; sh.innerHTML=""; document.body.style.overflow="";
}
function saveProfile(){
  var P=prof(), vals={}, bad=null;
  document.querySelectorAll("#profile input[data-pf]").forEach(function(inp){
    var raw=inp.value.trim().replace(",",".");
    if(raw===""){inp.removeAttribute("aria-invalid");return;}
    var n=Number(raw);
    if(!isFinite(n)||n<=0||n>500){inp.setAttribute("aria-invalid","true");if(!bad)bad=inp;return;}
    inp.removeAttribute("aria-invalid"); vals[inp.dataset.pf]=String(Math.round(n*10)/10);
  });
  if(bad){bad.focus();toast("Check the highlighted fields: numbers only");return;}
  if(!Object.keys(vals).length&&!Object.keys(P.vals).length){toast("Enter at least one measurement");return;}
  P.vals=vals;
  var lastS=P.hist.length?P.hist[P.hist.length-1]:null;
  if(!lastS||JSON.stringify(lastS.v)!==JSON.stringify(vals)){ P.hist.push({d:new Date().toISOString(),v:vals}); if(P.hist.length>200) P.hist=P.hist.slice(-200); }
  save(); closeProfile(); toast("Measurements saved");
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
function finishWorkout(){
  var d=DAYS[day], c=cur(), L=last(), saved=0, now=new Date().toISOString(), rec=buildWorkout(d), wins={prs:[],up:[]};
  d.ex.forEach(function(ex){
    var arr=setsFor(ex).slice(0,ex.sets).filter(function(s){return s.w||s.r;});
    /* before overwriting: compare with the PR and with last time (weighted exercises only) */
    var top=0; arr.forEach(function(s){var v=parseFloat(s.w); if(v>top) top=v;});
    if(top>0&&labOf(ex)[0]){
      var oldPr=parseFloat(prFor(ex))||0, prev=L[ex.id], prevTop=0;
      if(prev&&prev.sets) prev.sets.forEach(function(s){var v=parseFloat(s.w); if(v>prevTop) prevTop=v;});
      if(oldPr>0&&top>oldPr) wins.prs.push({n:ex.n,now:top,was:oldPr});
      else if(prevTop>0&&top>prevTop) wins.up.push({n:ex.n,by:Math.round((top-prevTop)*100)/100});
    }
    if(arr.length){L[ex.id]={date:now,sets:arr.map(function(s){return {w:s.w,r:s.r};})};saved++;}
    arr.forEach(function(s){var v=parseFloat(s.w); if(v>(parseFloat(prs()[ex.id])||0)) prs()[ex.id]=String(v);});
    delete c[ex.id];
  });
  recordWorkout(rec); save(); stopTimer(); renderDay(); window.scrollTo(0,0);
  if(saved&&rec) showDone(rec,d,wins);
  else toast("Nothing logged yet. Enter a weight or reps first.");
}
