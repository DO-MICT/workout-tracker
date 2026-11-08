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
    accBusy=null;
    if(r&&!r.error&&sbUser&&sbUser.id===uid){
      var d=r.data||accFree();
      ACC={uid:uid,tier:d.tier||"free",source:d.source||"none",starts_at:d.starts_at||null,ends_at:d.ends_at||null,
        will_renew:!!d.will_renew,features:Array.isArray(d.features)?d.features:[],fetched:Date.now()};
      try{ localStorage.setItem(ACCESS_KEY,JSON.stringify(ACC)); }catch(e){}
    }
    return access();
  },function(){ accBusy=null; return access(); });
  return accBusy;
}
function accessForget(){ ACC=false; try{ localStorage.removeItem(ACCESS_KEY); }catch(e){} }
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
  if(t==="free") h+='<ul><li>Workout logging, history, swaps and records</li><li>Basic charts, export and import</li><li>Up to 3 plans</li></ul>';
  else h+='<ul>'+a.features.filter(function(f){return ACCESS_FEATS[f];}).map(function(f){return '<li>'+esc(ACCESS_FEATS[f])+'</li>';}).join("")+'</ul>';
  return h;
}
function accessHtml(){
  var note=!WEB_MODE?"":sbUser?"Your plan is kept on your account, so it follows you to every device. Buying Pro comes with the app store release.":"Sign in to see your plan.";
  return '<h3 class="psec">Your plan</h3>'+(note?'<p class="sub">'+note+'</p>':'')+
    '<div class="tier on static" id="accCard" aria-live="polite">'+accessCardInner()+'</div>';
}
function accRefreshCard(){ var c=document.getElementById("accCard"); if(c) c.innerHTML=accessCardInner(); }
