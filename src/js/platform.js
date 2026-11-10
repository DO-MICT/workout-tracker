/* ---------- platform adapter (WP10) ----------
   The one place that knows whether GFD runs as the website or inside the Android app (Capacitor).
   Core code calls platform.* and never Capacitor directly, so an iOS shell later is a new branch here, not a fork.
   Inside the app the native plugins are reached through window.Capacitor.Plugins (injected by the shell; no bundler).

   platform.name            "web" | "android"   (the Claude copy counts as web)
   platform.native          true inside the app
   platform.siteUrl(path)   the public website (in the app: site.json's domain; on the web: this site)
   platform.authRedirect()  where sign-in emails send people back to: gfd://auth-callback in the app, this page on the web
   platform.onAuthLink(fn)  the app was opened by a sign-in link: fn({access_token, refresh_token, type, error_description})
   platform.saveFile(blob,name)  web: download; app: the share sheet (Save to Files, Drive, email...)
   platform.share({title,text,url})
   platform.buzz(ms)        a short vibration
   platform.restAlert(endMs)  app: a notification when rest ends, even with the screen off (0 cancels it)
   platform.restSoon()      the in-app beep is about to play with the app open: drop the notification
   platform.openExternal(url)  the browser (relative links go to the website)
   platform.appInfo()       Promise of {version, build} in the app, null on the web
   platform.storeUrl()      the Google Play listing
   platform.billing         null until WP12 (RevenueCat)
   Android's back button closes the open sheet or menu first, then leaves the app (same as Escape on a keyboard). */
var platform=(function(){
  var C=window.Capacitor, P=(C&&C.Plugins)||{};
  var isAndroid=!!(C&&C.getPlatform&&C.getPlatform()==="android");
  var SHELL=window.GFD_SHELL||{};
  /* the app shell names the website; on the web the site is wherever this page is served from */
  var SITE=SHELL.site||(location.origin+location.pathname.replace(/[^\/]*$/,""));
  var APP_ID=SHELL.appId||"com.getfitdaily.app";
  var REST_ID=4201, restAsked=false, restEnd=0, linkFns=[], linkSeen={}, linkWait=[];

  function siteUrl(path){
    path=path||"";
    if(/^[a-z][a-z0-9+.-]*:/i.test(path)) return path;
    return SITE.replace(/\/?$/,"/")+String(path).replace(/^\.?\//,"");
  }
  function call(plugin,method,arg){
    try{ var p=P[plugin]; if(!p||typeof p[method]!=="function") return Promise.resolve(null); return Promise.resolve(p[method](arg)).catch(function(){ return null; }); }
    catch(e){ return Promise.resolve(null); }
  }
  function parseLink(url){
    /* gfd://auth-callback#access_token=..&refresh_token=..&type=signup  (or ?error=..&error_description=..) */
    var out={}, s=String(url||""), i=s.indexOf("#"), q=s.indexOf("?");
    var parts=[]; if(q>=0) parts.push(s.slice(q+1,i>q?i:undefined)); if(i>=0) parts.push(s.slice(i+1));
    parts.join("&").split("&").forEach(function(kv){ if(!kv) return; var j=kv.indexOf("="); var k=decodeURIComponent(j<0?kv:kv.slice(0,j)); out[k]=j<0?"":decodeURIComponent(kv.slice(j+1).replace(/\+/g," ")); });
    return out;
  }
  function gotLink(url){
    if(!url||!/^gfd:\/\/auth-callback/i.test(url)||linkSeen[url]) return;
    linkSeen[url]=1;
    var a=parseLink(url);
    if(!linkFns.length){ linkWait.push(a); return; }   /* the app was opened by the link: sign-in isn't ready yet */
    linkFns.forEach(function(fn){ try{ fn(a); }catch(e){} });
  }

  function saveFileWeb(blob,name){
    var a=document.createElement("a"), u=URL.createObjectURL(blob);
    a.href=u; a.download=name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(u); },30000);
    return Promise.resolve(true);
  }
  function blobB64(blob){
    return new Promise(function(ok,bad){ var r=new FileReader(); r.onload=function(){ var s=String(r.result||""); ok(s.slice(s.indexOf(",")+1)); }; r.onerror=bad; r.readAsDataURL(blob); });
  }
  function saveFileApp(blob,name){
    /* written to the app's cache, then handed to Android's share sheet; the person picks where it goes */
    return blobB64(blob).then(function(data){
      return P.Filesystem.writeFile({path:name,data:data,directory:"CACHE"});
    }).then(function(r){
      return P.Share.share({title:name,files:[r.uri],dialogTitle:"Save or send "+name});
    }).then(function(){ return true; },function(e){
      if(e&&/cancel/i.test(e.message||"")) return false;
      if(typeof toast==="function") toast("Couldn’t save the file. Try again.");
      return false;
    });
  }

  function ensureRestChannel(){
    if(restAsked) return Promise.resolve(true);
    restAsked=true;
    return call("LocalNotifications","checkPermissions").then(function(p){
      if(p&&p.display==="granted") return p;
      return call("LocalNotifications","requestPermissions");
    }).then(function(p){
      return call("LocalNotifications","createChannel",{id:"rest",name:"Rest timer",description:"Tells you when your rest is over",importance:5,visibility:1,vibration:true,lights:true,lightColor:"#D4FF3A"}).then(function(){ return !!(p&&p.display==="granted"); });
    });
  }
  function restAlert(endMs){
    restEnd=endMs||0;
    if(!isAndroid) return;
    call("LocalNotifications","cancel",{notifications:[{id:REST_ID}]}).then(function(){
      if(!restEnd||restEnd<=Date.now()+1500) return;
      return ensureRestChannel().then(function(ok){
        if(!ok||!restEnd) return;
        return call("LocalNotifications","schedule",{notifications:[{
          id:REST_ID, title:"Rest over", body:"Time for your next set.", channelId:"rest",
          schedule:{at:new Date(restEnd),allowWhileIdle:true}, smallIcon:"ic_stat_gfd", iconColor:"#D4FF3A", autoCancel:true
        }]});
      });
    });
  }

  /* Android back button: whatever Escape would close, else leave the app (kept running, like Home) */
  function overlayOpen(){
    if(document.querySelector(".sheet:not([hidden]),.donepop:not([hidden]),#dayMenu:not([hidden]),#dayLocMenu:not([hidden]),#planMenu:not([hidden]),.fbview")) return true;
    return (typeof SWAP!=="undefined"&&SWAP)||(typeof LOC_MODE!=="undefined"&&LOC_MODE);
  }
  function onBack(ev){
    if(location.pathname.replace(/\/index\.html$/,"/")!=="/"&&ev&&ev.canGoBack){ history.back(); return; }   /* the roadmap or a policy page */
    if(typeof OB!=="undefined"&&OB){ call("App","minimizeApp"); return; }   /* sign-in and first-run setup: nothing to go back to */
    if(overlayOpen()){ document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})); return; }
    call("App","minimizeApp");
  }

  function openExternal(url){
    var u=siteUrl(url);
    if(isAndroid&&P.Browser) return call("Browser","open",{url:u,toolbarColor:"#0D0F12"});
    window.open(u,"_blank","noopener"); return Promise.resolve(null);
  }

  if(isAndroid){
    document.documentElement.classList.add("native","android");
    if(P.App){
      P.App.addListener("backButton",onBack);
      P.App.addListener("appUrlOpen",function(e){ gotLink(e&&e.url); });
      call("App","getLaunchUrl").then(function(r){ if(r&&r.url) gotLink(r.url); });
      /* back in the app: the rest notification is no longer needed if the timer is on screen */
      P.App.addListener("resume",function(){ if(restEnd&&restEnd>Date.now()) restAlert(restEnd); });
    }
    /* links that would open a new tab go to the browser instead (a new tab can't open inside the app) */
    document.addEventListener("click",function(e){
      var a=e.target&&e.target.closest&&e.target.closest('a[target="_blank"]');
      if(!a) return;
      var h=a.getAttribute("href")||"";
      if(!h||/^(blob|data):/i.test(h)) return;
      e.preventDefault(); openExternal(h);
    },true);
  }

  return {
    name:isAndroid?"android":"web",
    native:isAndroid,
    siteUrl:siteUrl,
    authRedirect:function(){ return isAndroid?"gfd://auth-callback":location.origin+location.pathname; },
    onAuthLink:function(fn){ linkFns.push(fn); var w=linkWait; linkWait=[]; w.forEach(function(a){ try{ fn(a); }catch(e){} }); },
    parseLink:parseLink,
    saveFile:function(blob,name){ return isAndroid&&P.Filesystem&&P.Share?saveFileApp(blob,name):saveFileWeb(blob,name); },
    share:function(o){
      if(isAndroid&&P.Share) return call("Share","share",o);
      if(navigator.share) return navigator.share(o).catch(function(){ return null; });
      return Promise.resolve(null);
    },
    buzz:function(ms){
      if(isAndroid&&P.Haptics){ call("Haptics","vibrate",{duration:ms||20}); return; }
      try{ if(navigator.vibrate) navigator.vibrate(ms||20); }catch(e){}
    },
    restAlert:restAlert,
    restSoon:function(){ if(isAndroid&&restEnd&&document.visibilityState==="visible"){ restEnd=0; call("LocalNotifications","cancel",{notifications:[{id:REST_ID}]}); } },
    openExternal:openExternal,
    appInfo:function(){ return isAndroid?call("App","getInfo"):Promise.resolve(null); },
    storeUrl:function(){ return "https://play.google.com/store/apps/details?id="+APP_ID; },
    billing:null
  };
})();
