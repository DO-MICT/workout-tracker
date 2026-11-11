/* ---------- access: what this account may use (WP1) ----------
   The server decides. public.entitlements holds every grant (14-day trial at sign-up, testers,
   promos, and later Google Play and web purchases), and the my_access view returns the best one.
   The app only reads it, keeps a copy for offline use, and asks can("stats.full") and so on.
   Nothing in the app can give itself Pro: the table has no insert or update rights for users. */
var ACCESS_KEY="gfd-access-v1", ACCESS_GRACE=3*864e5, ACCESS_STALE=30*6e4;
var ACCESS_FEATS={"plans.unlimited":"Unlimited plans","stats.full":"Full stats","progression":"Progression and programmes",
  "timed":"Timed workouts","photos":"Progress photos","measure.full":"All measurement sites","beta":"New features early, while we test","coach":"Coach tools"};
var ACCESS_LABEL={free:"Free",pro:"Pro",tester:"Tester",coach:"Coach"};
var ACC=null, accBusy=null;
function accFree(){ return {tier:"free",source:"none",ends_at:null,will_renew:false,features:[]}; }
function accLoad(){
  if(ACC===null){ try{ ACC=JSON.parse(localStorage.getItem(ACCESS_KEY)||"false")||false; }catch(e){ ACC=false; } }
  return ACC||null;
}
/* the access to use right now */
function access(){
  /* inside Claude there is no account or server: everything is open for previewing */
  if(!WEB_MODE) return {tier:"tester",source:"preview",ends_at:null,will_renew:false,features:Object.keys(ACCESS_FEATS).filter(function(k){return k!=="coach";})};
  var a=accLoad(), uid=(sbUser&&sbUser.id)||acct().id;
  if(!a||!uid||a.uid!==uid) return accFree();
  if(a.ends_at){
    /* a renewing plan is kept 3 days past its end while offline, in case the renewal hasn't reached us yet;
       a trial or a plan that won't renew ends on time */
    var end=Date.parse(a.ends_at)+(a.will_renew?ACCESS_GRACE:0);
    if(!(end>Date.now())) return accFree();
  }
  return a;
}
function can(f){ return access().features.indexOf(f)>=0; }
function isPro(){ return access().tier!=="free"; }
/* ask the server again; resolves with the new access (or the cached one if offline) */
function refreshAccess(){
  if(!WEB_MODE||!sb||!sbUser) return Promise.resolve(access());
  if(accBusy) return accBusy;
  var uid=sbUser.id;
  accBusy=sb.from("my_access").select("tier,source,starts_at,ends_at,will_renew,features,checked_at").maybeSingle().then(function(r){
    if(r&&!r.error&&sbUser&&sbUser.id===uid){
      var keepPlans=ACC&&ACC.uid===uid?ACC.plans:null;
      var d=r.data||accFree();
      ACC={uid:uid,tier:d.tier||"free",source:d.source||"none",starts_at:d.starts_at||null,ends_at:d.ends_at||null,
        will_renew:!!d.will_renew,features:Array.isArray(d.features)?d.features:[],fetched:Date.now(),plans:keepPlans};
      try{ localStorage.setItem(ACCESS_KEY,JSON.stringify(ACC)); }catch(e){}
      return refreshPlanAccess();
    }
  }).then(function(){ accBusy=null; return access(); },function(){ accBusy=null; return access(); });
  return accBusy;
}
function accessForget(){ ACC=false; try{ localStorage.removeItem(ACCESS_KEY); }catch(e){} }

/* ---------- what Free includes (WP14) ----------
   Free keeps up to 3 of its own plans in use and logs the basic measurement sites; both numbers come from
   app_config.free_limits so they can change without a release. The server holds the plan cap (a trigger on plans):
   my_plan_access applies it and says which plans are read-only, choose_plans picks which stay in use. Built-in plans
   are always open. Nothing is deleted when Pro ends: extra plans and sites become read-only. */
var FREE_DEFAULT={plans:3,measure_sites:["weight","waist","chest","hips"]};
function freeLimits(){
  var c=typeof cfg==="function"?cfg().free_limits:null, o={plans:FREE_DEFAULT.plans,measure_sites:FREE_DEFAULT.measure_sites};
  if(c&&typeof c==="object"){
    if(+c.plans>=1) o.plans=Math.floor(+c.plans);
    if(Array.isArray(c.measure_sites)&&c.measure_sites.length) o.measure_sites=c.measure_sites.map(String);
  }
  return o;
}
/* ask the server which plans are read-only (it applies the cap first). Old databases without WP14 just say nothing. */
function refreshPlanAccess(){
  if(!WEB_MODE||!sb||!sbUser) return Promise.resolve();
  var uid=sbUser.id;
  return sb.rpc("my_plan_access").then(function(r){
    if(!r||r.error||!r.data||!ACC||ACC.uid!==uid) return;
    ACC.plans={limit:+r.data.limit||freeLimits().plans,locked:Array.isArray(r.data.locked)?r.data.locked.map(String):[],at:Date.now()};
    try{ localStorage.setItem(ACCESS_KEY,JSON.stringify(ACC)); }catch(e){}
    planAccessApplied();
  },function(){});
}
function planCap(){ return can("plans.unlimited")?Infinity:((ACC&&ACC.plans&&ACC.plans.limit)||freeLimits().plans); }
/* your own plans that are read-only right now: the server's list, plus (while offline) any beyond the cap,
   keeping the active plan first and then the list order */
function lockedPlans(){
  var out={}; if(can("plans.unlimited")||typeof plansState!=="function") return out;
  var P=plansState(), srv=(ACC&&ACC.plans&&ACC.plans.locked)||[], cap=planCap(), n=0;
  var ids=P.custom.map(function(c){return String(c.id);});
  ids.sort(function(a,b){return (b===P.active)-(a===P.active);});
  ids.forEach(function(id){ if(srv.indexOf(id)>=0||n>=cap) out[id]=1; else n++; });
  return out;
}
function planLocked(id){ return !!lockedPlans()[String(id)]; }
function plansInUse(){ if(typeof plansState!=="function") return 0; var L=lockedPlans(); return plansState().custom.filter(function(c){return !L[c.id];}).length; }
function canAddPlan(){ return plansInUse()<planCap(); }
/* after the server's answer: never stay on a plan that is read-only */
function planAccessApplied(){
  if(typeof plansState!=="function") return;
  var P=plansState();
  if(customById(P.active)&&planLocked(P.active)){
    var L=lockedPlans(), next=P.custom.filter(function(c){return !L[c.id];})[0];
    P.active=next?next.id:"split5"; save();
    if(typeof renderAll==="function"&&typeof DAYS!=="undefined"&&DAYS) renderAll();
  }
  renderPlans();
}
/* "Weight, waist, chest and hips" */
function freeSitesText(){
  var t=freeLimits().measure_sites.map(function(k){var m=typeof msSpot==="function"&&msSpot(k);return m?m[1].toLowerCase():k;}).join(", ").replace(/, ([^,]*)$/," and $1");
  return t.charAt(0).toUpperCase()+t.slice(1);
}
/* a body measurement site that Free can look at but not add to */
function msLocked(k){
  if(can("measure.full")||k==="height") return false;
  return freeLimits().measure_sites.indexOf(String(k).replace(/L$/,""))<0;
}

/* ---------- the upgrade page ----------
   One sheet for every locked thing: a friendly line about what was tapped, what Pro adds, and Get Pro.
   Buying comes from window.GFDBilling: Google Play in the app (WP12, billing.js) or Paddle on the website (WP13,
   webbilling.js). Its shape: {label, buy(why, planId) -> Promise, and optionally ready() -> bool,
   plans() -> Promise of [{id, title, price, per, note}] (price is the store's own price text, per "month"/"year")}.
   buy resolves when paid ({pending:true}: paid, but Pro hasn't reached the account yet) and rejects with an Error
   whose message the page shows, or with {cancelled:true} (also accepted as a resolve) when the person backed out.
   With no billing (or not ready) the page says when Pro opens. */
function billing(){
  var b=window.GFDBilling;
  return b&&typeof b.buy==="function"&&(typeof b.ready!=="function"||b.ready())?b:null;
}
var PRO_WHY={
  general:function(){return "Pro opens everything in GFD, on every device you sign in on.";},
  plans:function(){return "Free keeps "+planCap()+" of your own plans in use. Pro has no limit, and every plan you’ve made opens again.";},
  stats:function(){return "Free shows your last week and month. Pro adds 3 months, a whole year and more.";},
  measure:function(){return "Free tracks "+freeSitesText().toLowerCase()+". Pro adds every measurement site.";},
  photos:function(){return "Progress photos are part of Pro.";},
  timed:function(){return "Timed workouts are part of Pro.";},
  progression:function(){return "Progression and programmes are part of Pro.";}
};
var PRO_LIST=["Unlimited plans","Full stats: 3 months, a year and more","Every body measurement site","Progression and programmes, timed workouts and progress photos as they arrive"];
var PRO=null;
/* the store's plans as the page shows them, yearly first */
function proChoices(list){
  var per={month:" a month",year:" a year",once:" once"}, rank={year:0,month:1,once:2};
  var out=(Array.isArray(list)?list:[]).filter(function(p){return p&&p.id!=null;}).map(function(p){
    return {id:String(p.id),label:String(p.title||""),price:String(p.price||"")+(per[p.per]||""),note:String(p.note||""),per:p.per};
  });
  out.sort(function(a,b){ return (rank[a.per]==null?3:rank[a.per])-(rank[b.per]==null?3:rank[b.per]); });
  return out;
}
function proOffer(why){
  var sh=document.getElementById("prosheet"); if(!sh) return;
  PRO={mode:"offer",why:PRO_WHY[why]?why:"plans"};
  logEvent("paywall_seen",{from:PRO.why});
  var b=billing();
  if(b&&typeof b.plans==="function"){
    var mine=PRO; mine.loading=true; mine.choices=[];
    Promise.resolve(b.plans()).then(function(list){
      mine.choices=proChoices(list); mine.pick=mine.choices.length?mine.choices[0].id:null; mine.loading=false;
    },function(){ mine.loading=false; mine.loadErr=true; })
      .then(function(){ if(PRO===mine&&!mine.busy) proRender(); });
  }
  proRender(); sh.hidden=false; document.body.style.overflow="hidden"; sh.scrollTop=0; sh.focus();
}
function proClose(){
  var sh=document.getElementById("prosheet"); if(!sh||sh.hidden) return;
  sh.hidden=true; sh.innerHTML=""; PRO=null;
  var open=document.querySelector(".sheet:not([hidden]):not(#prosheet)"); if(!open) document.body.style.overflow="";
}
function proRender(){
  var sh=document.getElementById("prosheet"); if(!sh||!PRO) return;
  if(PRO.mode==="pick"){ sh.innerHTML=pickPlansHtml(); return; }
  var a=access(), b=billing(), buy=!!b, ch=PRO.choices||[];
  var locked=Object.keys(lockedPlans()).length;
  sh.innerHTML='<div class="sheet-in"><div class="sheet-top"><h2 id="protitle">GFD Pro</h2><button class="chip" id="proLater">Not now</button></div>'+
    '<p class="sub">'+esc(PRO_WHY[PRO.why]())+'</p>'+
    '<ul class="hlist">'+PRO_LIST.map(function(x){return '<li>'+esc(x)+'</li>';}).join("")+'</ul>'+
    '<p class="wzerr" id="proErr" role="alert"></p>'+
    (buy&&ch.length>1?'<div class="prochoice" role="radiogroup" aria-label="Pick a plan">'+ch.map(function(c){
      var on=c.id===PRO.pick;
      return '<button class="ms-set" role="radio" aria-checked="'+on+'" data-procho="'+esc(c.id)+'"><span><b>'+esc(c.label)+'</b><span>'+esc(c.price)+'</span></span>'+(c.note?'<span class="ttag">'+esc(c.note)+'</span>':'')+'</button>';
    }).join("")+'</div>':buy&&ch.length===1?'<p class="sub">'+esc(ch[0].label+": "+ch[0].price)+'</p>':'')+
    (buy&&PRO.loading?'<p class="pronote">Loading prices…</p>':'')+
    (buy&&PRO.loadErr&&!ch.length?'<p class="pronote">Prices didn’t load. Check your connection, then close this and try again.</p>':'')+
    (buy&&!(b.plans&&!ch.length)&&typeof billingTermsHtml==="function"?billingTermsHtml():'')+
    (buy&&!(b.plans&&!ch.length)?'<button class="primary" id="proBuy">'+esc(b.label||"Get Pro")+'</button>'
        :'<p class="pronote">'+(sbUser?'Buying Pro opens with the Google Play release. Your logs, plans and history stay yours on Free.':'Sign in to start your 14-day free trial of Pro.')+'</p>')+
    (PRO.why==="plans"&&locked&&sbUser?'<button class="ghost bre" id="proPick">Pick which '+planCap()+' plans to keep</button>':'')+
    (a.source==="trial"?'':'<p class="obfine">Nothing you’ve saved is ever deleted when Pro ends.</p>')+'</div>';
}
function proBuy(t){
  var err=document.getElementById("proErr"), b=billing(), res=null; if(!b) return;
  var label=b.label||"Get Pro";
  t.disabled=true; t.textContent="Please wait…"; if(err) err.textContent=""; if(PRO) PRO.busy=true;
  Promise.resolve(b.buy(PRO&&PRO.why,PRO&&PRO.pick)).then(function(r){ res=r||{}; return refreshAccess(); }).then(function(){
    if(PRO) PRO.busy=false;
    if(!res.cancelled&&!res.pending&&isPro()){ proClose(); accRefreshCard(); renderPlans(); toast("Welcome to Pro"); if(typeof renderAll==="function"&&DAYS) renderAll(); }
    else {
      t.disabled=false; t.textContent=label;
      if(res.pending&&err) err.textContent="Payment received, thank you. Pro can take a minute to reach your account; it opens on its own, or close this and check Your plan in Profile.";
    }
  }).catch(function(e){
    if(PRO) PRO.busy=false;
    t.disabled=false; t.textContent=label;
    if(e&&e.cancelled) return;
    if(err) err.textContent=(e&&e.message)||"That didn’t go through. Nothing was charged. Try again in a moment.";
  });
}

/* ---------- pick which plans stay in use (Free with more than the cap) ---------- */
function pickPlansOpen(){
  var sh=document.getElementById("prosheet"); if(!sh) return;
  var L=lockedPlans(), keep={};
  plansState().custom.forEach(function(c){ if(!L[c.id]) keep[c.id]=1; });
  PRO={mode:"pick",keep:keep};
  proRender(); sh.hidden=false; document.body.style.overflow="hidden"; sh.scrollTop=0; sh.focus();
}
function pickPlansHtml(){
  var cap=planCap(), n=Object.keys(PRO.keep).length;
  return '<div class="sheet-in"><div class="sheet-top"><h2 id="protitle">Plans in use</h2><button class="chip" id="proLater">Cancel</button></div>'+
    '<p class="sub">Free keeps '+cap+' of your own plans in use. The others stay saved and read-only until you pick them or get Pro. Built-in plans are always open.</p>'+
    '<div class="pkplans" role="group" aria-label="Your plans">'+plansState().custom.map(function(c){
      var on=!!PRO.keep[c.id];
      return '<button class="ms-set" role="checkbox" aria-checked="'+on+'" data-pickkeep="'+esc(c.id)+'"><span><b>'+esc(c.name)+'</b><span>'+(c.id===plansState().active?'Your current plan':on?'In use':'Read only')+'</span></span><i class="ms-tog"></i></button>';
    }).join("")+'</div>'+
    '<p class="wzerr" id="proErr" role="alert"></p>'+
    '<button class="primary" id="pickSave"'+(n>cap||!n?' disabled':'')+'>'+(n>cap?'Pick up to '+cap:'Keep these '+n)+'</button>'+
    '<button class="linkbtn" id="pickPro">Or get Pro to use them all</button></div>';
}
function pickPlansSave(t){
  var ids=Object.keys(PRO.keep), err=document.getElementById("proErr");
  t.disabled=true; t.textContent="Saving…";
  sb.rpc("choose_plans",{p_keep:ids}).then(function(r){
    if(r.error) throw r.error;
    if(ACC&&r.data) ACC.plans={limit:+r.data.limit||planCap(),locked:(r.data.locked||[]).map(String),at:Date.now()};
    try{ localStorage.setItem(ACCESS_KEY,JSON.stringify(ACC)); }catch(e){}
    proClose(); planAccessApplied(); renderPlanBtn(); toast("Saved. "+ids.length+" plan"+(ids.length===1?"":"s")+" in use");
  }).catch(function(e){
    t.disabled=false; t.textContent="Keep these "+ids.length;
    if(err) err.textContent=sbOffline||!navigator.onLine?"You’re offline. Try again when you’re connected.":((e&&e.message)||"That didn’t save. Try again.");
  });
}
function accessClick(t){
  if(t.id==="proLater"){proClose();return true;}
  if(t.id==="proBuy"){proBuy(t);return true;}
  if(t.dataset.procho&&PRO){PRO.pick=t.dataset.procho; proRender(); var c=document.querySelector('[data-procho="'+PRO.pick+'"]'); if(c) c.focus(); return true;}
  if(t.id==="proPick"||t.dataset.pickplans){pickPlansOpen();return true;}
  if(t.id==="pickPro"){proOffer("plans");return true;}
  if(t.id==="pickSave"){pickPlansSave(t);return true;}
  if(t.dataset.pickkeep&&PRO){var id=t.dataset.pickkeep; if(PRO.keep[id]) delete PRO.keep[id]; else PRO.keep[id]=1; proRender(); var b=document.querySelector('[data-pickkeep="'+id+'"]'); if(b) b.focus(); return true;}
  if(t.dataset.pro){proOffer(t.dataset.pro);return true;}
  return false;
}
document.addEventListener("visibilitychange",function(){
  if(document.visibilityState!=="visible"||!sbUser) return;
  var a=accLoad(); if(!a||!a.fetched||Date.now()-a.fetched>ACCESS_STALE) refreshAccess().then(accRefreshCard);
});

/* ---------- Profile: "Your plan" (read only) ---------- */
function accessCardInner(){
  var a=access(), t=a.tier, name=ACCESS_LABEL[t]||"Free", tag="", when="", h;
  if(a.source==="preview"){ tag="Preview"; when="Everything is unlocked in this preview."; }
  else if(a.source==="trial"){ name="Pro"; tag="Free trial"; when=a.ends_at?"Your free trial ends "+fmtDay(a.ends_at)+".":""; }
  else if(t==="free"){ tag="Basic"; }
  else if(!a.ends_at){ tag=t==="tester"?"Beta":"No end date"; when=t==="tester"?"Thanks for testing. You have everything in Pro.":""; }
  else { tag=a.will_renew?"Renews":"Active"; when=(a.will_renew?"Renews ":"Ends ")+fmtDay(a.ends_at)+"."; }
  h='<span class="th"><b>'+esc(name)+'</b>'+(tag?'<span class="ttag">'+esc(tag)+'</span>':'')+'</span>'+(when?'<span class="tprice">'+esc(when)+'</span>':'');
  if(t==="free") h+='<ul><li>Workout logging, history, swaps and records</li><li>Week and month charts, export and import</li><li>Up to '+freeLimits().plans+' of your own plans, plus every built-in plan</li><li>'+esc(freeSitesText())+'</li></ul>'+
    (a.source==="preview"?'':'<button class="chip sm" data-pro="general">What Pro adds</button>');
  else h+='<ul>'+a.features.filter(function(f){return ACCESS_FEATS[f];}).map(function(f){return '<li>'+esc(ACCESS_FEATS[f])+'</li>';}).join("")+'</ul>';
  return h;
}
function accessHtml(){
  var note=!WEB_MODE?"":sbUser?"Your plan is kept on your account, so it follows you to every device."+(billing()?"":" Buying Pro comes with the app store release."):"Sign in to see your plan.";
  return '<h3 class="psec">Your plan</h3>'+(note?'<p class="sub">'+note+'</p>':'')+
    '<div class="tier on static" id="accCard" aria-live="polite">'+accessCardInner()+'</div>';
}
function accRefreshCard(){ var c=document.getElementById("accCard"); if(c) c.innerHTML=accessCardInner(); }
