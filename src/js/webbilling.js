/* ---------- Pro on the website: Paddle checkout through RevenueCat Web Billing (WP13) ----------
   Only on the website (getfitdaily.co.za and dev), never inside the Android app: there Google Play billing (WP12) sells
   Pro, and Play's rules don't allow pointing people to another way to pay.

   How a purchase reaches the account: the RevenueCat Web SDK (vendor/purchases-js.umd.js, loaded only when someone
   opens the upgrade page) is configured with the Supabase user id as RevenueCat's app user id. Its checkout runs on
   Paddle, the merchant of record, which handles tax worldwide. Paddle tells RevenueCat, RevenueCat calls the billing
   webhook (WP12) and that writes public.entitlements with source 'web'. The app never writes Pro itself: after paying it
   just asks my_access again until Pro shows up.

   Settings live in app_config.web_billing, one per Supabase project, so dev can use Paddle sandbox and production the
   real thing without a release:
     {"rc_key": "rcb_...", "offering": null}
   rc_key is RevenueCat's Web Billing public API key (public by design, like the Supabase publishable key; the sandbox
   one starts rcb_sb_). offering picks a RevenueCat offering by id; null uses the current one. No row, or an empty key,
   and the upgrade page keeps saying Pro opens with the Google Play release. Steps: docs/db-brief.md, "Pro on the web".

   It fills window.GFDBilling, the same shape as Google Play's in the app (billing.js, WP12), which access.js uses:
     ready()            true when buying can be offered here
     plans()            Promise of [{id, title, price, per, note}]: id is the RevenueCat package identifier
     buy(why, id)       Promise of {pending} once paid (pending: paid but Pro hasn't reached the account yet);
                        rejects with {cancelled:true} when the checkout is closed, or an Error saying what went wrong
     manage()           opens Paddle's page to change card, switch plan or cancel */
var webBilling=(function(){
  var SDK_SRC="vendor/purchases-js.umd.js";
  var sdkP=null, inst=null, instUid=null, offerP=null, offerUid=null, pk={};
  var B={label:"Get Pro"};

  function conf(){ var c=typeof cfg==="function"&&cfg().web_billing; return c&&typeof c==="object"?c:{}; }
  function key(){ var k=conf().rc_key; return typeof k==="string"&&/^rcb_/.test(k.trim())?k.trim():""; }
  function here(){ return typeof WEB_MODE!=="undefined"&&WEB_MODE&&!(typeof platform!=="undefined"&&platform.native); }
  B.ready=function(){ return here()&&!!key()&&!!(typeof sbUser!=="undefined"&&sbUser&&sbUser.id); };

  function loadSdk(){
    if(window.Purchases&&window.Purchases.Purchases) return Promise.resolve(window.Purchases);
    if(sdkP) return sdkP;
    sdkP=new Promise(function(ok,no){
      var s=document.createElement("script"); s.src=SDK_SRC; s.async=true;
      s.onload=function(){ window.Purchases&&window.Purchases.Purchases?ok(window.Purchases):no(new Error("sdk")); };
      s.onerror=function(){ no(new Error("sdk")); };
      document.head.appendChild(s);
    }).catch(function(e){ sdkP=null; throw e; });
    return sdkP;
  }
  /* one RevenueCat customer per GFD account: the Supabase user id */
  function purchases(){
    var uid=sbUser&&sbUser.id;
    if(!uid) return Promise.reject(new Error("Sign in first."));
    return loadSdk().then(function(R){
      if(inst&&instUid===uid) return inst;
      if(inst) return inst.changeUser(uid).then(function(){ instUid=uid; return inst; });
      inst=R.Purchases.configure({apiKey:key(),appUserId:uid}); instUid=uid;
      return inst;
    });
  }

  function months(p){ var d=p&&p.product&&p.product.normalPeriodDuration; var m=/^P(\d+)([YM])$/.exec(d||""); return m?(+m[1])*(m[2]==="Y"?12:1):0; }
  function price(p){ var pr=p&&p.product&&p.product.currentPrice; return pr&&pr.formattedPrice||""; }
  function micros(p){ var pr=p&&p.product&&p.product.currentPrice; return pr&&+pr.amountMicros||0; }
  /* the offering's packages as plans: yearly first, then monthly, then lifetime */
  function toPlans(off){
    pk={};
    var list=(off&&off.availablePackages)||[], out=[], monthly=null;
    list.forEach(function(p){ if(p.packageType==="$rc_monthly") monthly=p; });
    list.forEach(function(p){
      var t=p.packageType, c=null;
      if(t==="$rc_annual"){
        c={title:"Yearly",per:"year",note:""};
        var a=micros(p), m=micros(monthly);
        if(a&&m&&a<m*12) c.note="Save "+Math.round(100-a/(m*12)*100)+"%";
      } else if(t==="$rc_monthly") c={title:"Monthly",per:"month",note:""};
      else if(t==="$rc_lifetime") c={title:"Lifetime",per:"once",note:"Pay once, keep Pro"};
      if(c){ c.id=p.identifier; c.price=price(p); pk[c.id]=p; out.push(c); }
    });
    var rank={year:0,month:1,once:2};
    out.sort(function(a,b){ return rank[a.per]-rank[b.per]; });
    return out;
  }
  B.plans=function(){
    if(!B.ready()) return Promise.resolve([]);
    var uid=sbUser.id;
    if(offerP&&offerUid===uid) return offerP;
    offerUid=uid;
    offerP=purchases().then(function(P){ return P.getOfferings(); }).then(function(o){
      var id=conf().offering, off=(id&&o.all&&o.all[id])||o.current;
      return toPlans(off);
    }).catch(function(e){ offerP=null; throw e; });
    return offerP;
  };

  function isCancel(e){
    var R=window.Purchases, code=R&&R.ErrorCode&&R.ErrorCode.UserCancelledError;
    return !!(e&&code!=null&&e.errorCode===code);
  }
  function friendly(e){
    if(typeof navigator!=="undefined"&&navigator.onLine===false) return new Error("You’re offline. Connect and try again. Nothing was charged.");
    if(e&&e.message==="sdk") return new Error("The payment page didn’t load. Check your connection and try again. Nothing was charged.");
    return new Error("That didn’t go through. Nothing was charged. Try again in a moment.");
  }
  function wait(ms){ return new Promise(function(r){ setTimeout(r,ms); }); }
  /* ask the server to read this customer from RevenueCat now (WP12's billing-webhook/sync), not wait for the webhook */
  function syncNow(){
    if(typeof sb==="undefined"||!sb||!sb.functions) return Promise.resolve();
    return sb.functions.invoke("billing-webhook/sync",{method:"POST"}).then(function(){},function(){});
  }
  /* then ask my_access until Pro shows up (Paddle → RevenueCat → webhook is usually a few seconds) */
  function waitForPro(tries){
    return refreshAccess().then(function(){
      if(isPro()&&access().source!=="trial") return {pending:false};
      if(tries<=0) return {pending:true};
      return wait(2500).then(function(){ return waitForPro(tries-1); });
    });
  }
  /* the checkout opens in its own layer above the app's sheets */
  function layer(){
    var d=document.createElement("div"); d.id="payLayer"; d.className="paylayer";
    document.body.appendChild(d); return d;
  }
  B.buy=function(why,id){
    if(!B.ready()) return Promise.reject(new Error("Sign in first."));
    var box=null;
    return B.plans().then(function(list){
      if(!id&&list.length) id=list[0].id;
      var p=pk[id]; if(!p) throw new Error("none");
      logEvent("checkout_started",{from:why||"",plan:id,store:"web"});
      box=layer();
      return purchases().then(function(P){
        return P.purchase({rcPackage:p,customerEmail:sbUser.email||undefined,htmlTarget:box});
      });
    }).then(function(){
      if(box){ box.remove(); box=null; }
      logEvent("checkout_paid",{plan:id,store:"web"});
      return syncNow().then(function(){ return waitForPro(8); });
    },function(e){
      if(box){ box.remove(); box=null; }
      if(isCancel(e)){ logEvent("checkout_cancelled",{plan:id,store:"web"}); throw {cancelled:true}; }
      if(e&&e.message==="none") throw new Error("Pro isn’t on sale here yet. Try again later.");
      throw friendly(e);
    });
  };
  /* Paddle's own page for this subscription: card, plan, cancel, receipts */
  B.manage=function(){
    var tab=window.open("about:blank","_blank");
    return purchases().then(function(P){ return P.getCustomerInfo(); }).then(function(ci){
      var u=ci&&ci.managementURL;
      if(!u) throw new Error("nourl");
      if(tab){ tab.opener=null; tab.location.href=u; } else location.href=u;
    }).catch(function(e){
      if(tab) tab.close();
      throw new Error(e&&e.message==="nourl"?"Use the link in your Paddle receipt email to manage or cancel.":"That didn’t open. Check your connection and try again.");
    });
  };
  B.forget=function(){ offerP=null; offerUid=null; };

  /* never on top of a store's own billing: the app sets window.GFDBilling itself (WP12) */
  if(here()&&!window.GFDBilling) window.GFDBilling=B;
  return B;
})();
