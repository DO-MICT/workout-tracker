/* ---------- buying and managing Pro in the Android app (WP12) ----------
   Google Play sells Pro; RevenueCat checks the purchase and tells our server (Edge Function billing-webhook), which
   writes public.entitlements. The app never decides Pro itself: after a purchase it asks the server to sync, then
   reads my_access again (refreshAccess).
   In the app this file sets window.GFDBilling for the upgrade page in access.js:
     {label, ready() -> bool, plans() -> Promise<[{id,title,price,per,note}]>, buy(why, planId) -> Promise,
      manage(), restore() -> Promise}
   buy() resolves when Pro is open, resolves {pending:true} if Google took the payment but the server hasn't caught
   up yet, rejects {cancelled:true} when the person backs out, and rejects an Error with a message to show otherwise.
   On the website webbilling.js (WP13) sets GFDBilling instead, for Paddle checkout.
   Also here, for every platform: the "Your plan" card's Manage or cancel and Restore purchases buttons
   (billingCardHtml / billingClick) and the reminder before a yearly plan renews (billingAfterAccess).
   Setup per Supabase project: app_config key play_billing = {"rc_key":"goog_..."} (RevenueCat's Google Play public key). */
var BILL_REMIND_KEY="gfd-renew-reminded", BILL_REMIND_DAYS=7;

function billCfg(){ var c=typeof cfg==="function"?cfg().play_billing:null; return c&&typeof c==="object"?c:{}; }
function billPlay(){ return typeof platform!=="undefined"&&platform.native&&platform.billing?platform.billing:null; }
function billReady(){ return !!(billPlay()&&billCfg().rc_key&&typeof sbUser!=="undefined"&&sbUser); }
function billStart(){ var b=billPlay(); return b.ready(billCfg().rc_key,sbUser.id); }

/* ask the server to read the RevenueCat record now, then read my_access again a few times until Pro shows */
function billSync(){
  var call=sb&&sb.functions?sb.functions.invoke("billing-webhook/sync",{method:"POST"}).catch(function(){ return null; }):Promise.resolve(null);
  return call.then(function(){ return billWaitPro(4); });
}
function billWaitPro(tries){
  return refreshAccess().then(function(){
    if(isPro()&&access().source!=="trial") return true;
    if(tries<=1) return false;
    return new Promise(function(ok){ setTimeout(ok,2500); }).then(function(){ return billWaitPro(tries-1); });
  });
}

function billPlans(){
  if(!billReady()) return Promise.reject(new Error("Sign in to buy Pro."));
  return billStart().then(function(){ return billPlay().plans(); }).then(function(list){
    return list.filter(function(p){ return p.per==="month"||p.per==="year"; }).map(function(p){
      return {id:p.id,title:p.per==="year"?"Yearly":"Monthly",price:p.price,per:p.per,
        note:p.per==="year"?"Best value":"Cancel any time"};
    });
  });
}
function billBuy(why,planId){
  if(!billReady()) return Promise.reject(new Error("Sign in to buy Pro."));
  /* an upgrade page without a plan picker passes no id: take the yearly plan, else the first */
  var pick=planId?Promise.resolve(planId):billPlans().then(function(l){ var y=l.filter(function(p){return p.per==="year";})[0]||l[0]; if(!y) throw new Error("Pro isn’t on sale right now. Try again later."); return y.id; });
  return pick.then(function(id){ planId=id; return billStart(); }).then(function(){ return billPlay().buy(planId); }).then(function(){
    return billSync();
  }).then(function(pro){
    return pro?true:{pending:true};   /* the purchase itself is counted by the database (server_event 'purchase') */
  });
}
function billRestore(){
  if(!billReady()) return Promise.reject(new Error("Sign in to restore purchases."));
  return billStart().then(function(){ return billPlay().restore(); }).then(function(){ return billSync(); });
}
function billManage(){
  var a=access();
  if(a.source==="web"&&window.GFDBilling&&!platform.native&&typeof window.GFDBilling.manage==="function") return window.GFDBilling.manage();
  return platform.openExternal(billPlayManageUrl(a.product_id));
}
/* works on the web too: Google's subscriptions page for the signed-in Google account */
/* the Play package name, from platform.js (the one place that knows it) */
function billAppId(){ var m=/[?&]id=([^&]+)/.exec(platform.storeUrl()); return m?decodeURIComponent(m[1]):""; }
function billPlayManageUrl(product){
  var b=billPlay(); if(b) return b.manageUrl(product);
  var sku=String(product||"").split(":")[0];
  return "https://play.google.com/store/account/subscriptions"+(sku?"?sku="+encodeURIComponent(sku)+"&package="+encodeURIComponent(billAppId()):"");
}

if(billPlay()){
  window.GFDBilling={label:"Get Pro",ready:billReady,plans:billPlans,buy:billBuy,manage:billManage,restore:billRestore};
}

/* ---------- the "Your plan" card ---------- */
function billIsYearly(a){ return /year|annual|12m|p1y/i.test(String(a.product_id||"")); }
function billCardHtml(a){
  if(!a||a.source==="preview"||typeof sbUser==="undefined"||!sbUser) return "";
  var h="", app=!!billPlay();
  if(a.source==="play"){
    h+='<p class="sub">'+(a.will_renew?'Cancel any time in Google Play. Pro stays until the end of the time you’ve paid for.':'This plan won’t renew. You can turn renewal back on in Google Play.')+'</p>'+
       '<button class="chip sm" data-bill="manage">Manage or cancel</button>';
  }else if(a.source==="web"){
    var canWeb=!app&&window.GFDBilling&&typeof window.GFDBilling.manage==="function";
    h+='<p class="sub">'+(app?'You bought Pro on the website. Sign in there to change or cancel it.':
       a.will_renew?'Cancel any time. Pro stays until the end of the time you’ve paid for.':'This plan won’t renew.')+'</p>'+
       (canWeb?'<button class="chip sm" data-bill="manage">Manage or cancel</button>':'');
  }else if(a.source==="lifetime"){
    h+='<p class="sub">Pro is yours for good. Thank you.</p>';
  }
  if(app&&billCfg().rc_key) h+='<button class="linkbtn" data-bill="restore">Restore purchases</button>';
  return h;
}
/* the access card and billing.js both live in the Profile screen; access.js calls these when they exist */
function billingCardHtml(a){ return billCardHtml(a); }
function billingClick(t){
  var what=t&&t.dataset&&t.dataset.bill; if(!what) return false;
  if(what==="manage"){ billManage(); return true; }
  if(what==="restore"){
    t.disabled=true; t.textContent="Checking Google Play…";
    billRestore().then(function(pro){
      if(typeof accRefreshCard==="function") accRefreshCard();
      toast(pro?"Pro is back. Welcome back":"No Pro purchase found on this Google account.");
      if(pro&&typeof renderPlans==="function") renderPlans();
    }).catch(function(e){
      t.disabled=false; t.textContent="Restore purchases";
      if(!(e&&e.cancelled)) toast((e&&e.message)||"Couldn’t check Google Play. Try again.");
    });
    return true;
  }
  return false;
}

/* ---------- a reminder a week before a yearly plan renews (F18.E2.S5) ----------
   Shown once per renewal date, the next time the app opens in that week. */
function billingAfterAccess(a){
  if(!a||!a.will_renew||!a.ends_at||(a.source!=="play"&&a.source!=="web")||!billIsYearly(a)) return;
  var end=Date.parse(a.ends_at), left=end-Date.now();
  if(!(left>0)||left>BILL_REMIND_DAYS*864e5) return;
  var seen=null; try{ seen=localStorage.getItem(BILL_REMIND_KEY); }catch(e){}
  if(seen===a.ends_at) return;
  try{ localStorage.setItem(BILL_REMIND_KEY,a.ends_at); }catch(e){}
  if(typeof toast==="function") setTimeout(function(){
    toast("Your Pro year renews on "+(typeof fmtDay==="function"?fmtDay(a.ends_at):a.ends_at.slice(0,10))+". Change or cancel it in Profile.");
  },1500);
}
/* signing out: the next person on this phone gets their own RevenueCat customer */
function billingForget(){ var b=billPlay(); if(b) b.signOut(); }

/* ---------- what the upgrade page must say before Buy (Google Play Subscriptions policy) ----------
   Shown above the plan choices' buy button on every platform: it renews automatically, and how to cancel. */
function billingTermsHtml(){
  var where=billPlay()?"Google Play → Subscriptions, or in Profile → Your plan → Manage or cancel":"Profile → Your plan → Manage or cancel";
  return '<p class="obfine" id="proTerms">Monthly and yearly Pro renew automatically at the price shown until you cancel. Cancel any time in '+where+'. Pro stays until the end of the time you’ve paid for.</p>';
}
