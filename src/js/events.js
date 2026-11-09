/* ---------- usage events, error reports and app config (WP5) ----------
   Privacy first (NFR-11): nothing here sends a user id, email, name, free text or health data.
   - logEvent(name, props): counts things like "first workout". Each install has a random anon id (not the
     account id). Events wait in a small queue on the phone and go out when there's a connection.
     Sign-up, trial start, purchase and account deleted are counted by the database itself.
   - reportError(): app crashes go to client_errors (message, stack, version, screen), scrubbed of emails,
     ids and long numbers, at most 5 different errors per visit.
   - app_config: min_version asks older copies of the app to reload; flag("name") reads feature switches.
   - Usage (admins): counts per event for the last 7 and 30 days, and the latest errors.
   Inside Claude (not WEB_MODE) nothing is sent. */

/* Bump APP_VERSION (the date, or date.2 for a second release that day) when a release must replace old copies,
   then set app_config.min_version to it in the SQL editor. */
var APP_VERSION="2026.11.08";
var EV_ANON_KEY="gfd-anon-v1", EV_Q_KEY="gfd-evq-v1", CFG_KEY="gfd-config-v1", EV_Q_MAX=50;
/* the events the app may send (the database refuses others) */
var EV_NAMES=["onboarding_done","first_workout","week2_return","paywall_seen","export"];
var evBusy=false, ERR_SEEN={}, ERR_N=0, ERR_WAIT=[], CFG=null;

function evGet(k){ try{ return JSON.parse(localStorage.getItem(k)||"null"); }catch(e){ return null; } }
function evPut(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
function evUuid(){
  var c=window.crypto;
  if(c&&c.randomUUID) return c.randomUUID();
  var b=new Uint8Array(16);
  if(c&&c.getRandomValues) c.getRandomValues(b); else for(var i=0;i<16;i++) b[i]=Math.floor(Math.random()*256);
  b[6]=(b[6]&15)|64; b[8]=(b[8]&63)|128;
  var h=Array.prototype.map.call(b,function(x){return (x+256).toString(16).slice(1);}).join("");
  return h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20);
}
/* a random id for this install; never the account id */
function evAnonId(){
  var id=evGet(EV_ANON_KEY);
  if(typeof id==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return id;
  id=evUuid(); evPut(EV_ANON_KEY,id); return id;
}
function evPlatform(){ return platform.name; }
/* same rule as the database: up to 8 short keys; numbers, true/false or short lower-case codes */
function evPropsOk(p){
  if(p==null) return true;
  if(typeof p!=="object"||Array.isArray(p)) return false;
  var ks=Object.keys(p); if(ks.length>8) return false;
  return ks.every(function(k){
    var v=p[k];
    if(!/^[a-z][a-z0-9_]{0,23}$/.test(k)) return false;
    return (typeof v==="number"&&isFinite(v))||typeof v==="boolean"||(typeof v==="string"&&/^[a-z0-9_.-]{0,32}$/.test(v));
  });
}
/* emails, query strings, ids and long numbers out (the database does this again) */
function evScrub(t,max){
  return String(t||"").replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,"[email]").replace(/\?[^\s)]*/g,"?[query]")
    .replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g,"[id]").replace(/[0-9]{6,}/g,"[n]").slice(0,max);
}
/* "2026.11.08" < "2026.11.08.2" < "2026.12.01" */
function versionLess(a,b){
  var x=String(a||"0").split("."), y=String(b||"0").split("."), n=Math.max(x.length,y.length);
  for(var i=0;i<n;i++){ var p=parseInt(x[i]||"0",10)||0, q=parseInt(y[i]||"0",10)||0; if(p!==q) return p<q; }
  return false;
}

/* ---------- events ---------- */
function evQueue(){ var q=evGet(EV_Q_KEY); return Array.isArray(q)?q:[]; }
function logEvent(name,props){
  if(!WEB_MODE||EV_NAMES.indexOf(name)<0) return;
  var q=evQueue();
  q.push({n:name,p:evPropsOk(props)?(props||{}):{},at:new Date().toISOString()});
  if(q.length>EV_Q_MAX) q.splice(0,q.length-EV_Q_MAX);
  evPut(EV_Q_KEY,q);
  evFlush();
}
/* send waiting events one by one; stop on a network problem and try again later */
function evFlush(){
  if(!WEB_MODE||evBusy||typeof sb==="undefined"||!sb) return;
  var q=evQueue(); if(!q.length) return;
  var e=q[0]; evBusy=true;
  sb.rpc("log_event",{p_name:e.n,p_anon_id:evAnonId(),p_props:e.p||{},p_app_version:APP_VERSION,p_platform:evPlatform(),p_at:e.at}).then(function(r){
    evBusy=false;
    var st=r&&r.status||0;
    if(r&&r.error&&!(st>=400&&st<500)) return;   /* offline or server trouble: keep it */
    var q2=evQueue(); if(q2.length&&q2[0].at===e.at&&q2[0].n===e.n){ q2.shift(); evPut(EV_Q_KEY,q2); }   /* sent, or refused for good */
    evFlush();
  },function(){ evBusy=false; });
}
/* counted once per account: opening the app 7 to 13 days after joining */
function evWeek2(user){
  if(!WEB_MODE||!user||!user.created_at||S.evW2) return;
  var d=(Date.now()-Date.parse(user.created_at))/864e5;
  if(d>=7&&d<14){ S.evW2=1; save(); logEvent("week2_return"); }
}

/* ---------- errors ---------- */
var EV_SCREENS=["consent","onboard","wizard","builder","measure","body","more","exlib","profile","sugg","feedback","usage","history","plans","equip","notesheet","donepop"];
function evScreen(){
  for(var i=0;i<EV_SCREENS.length;i++){ var el=document.getElementById(EV_SCREENS[i]); if(el&&!el.hidden) return EV_SCREENS[i]; }
  return "day";
}
function reportError(msg,stack){
  if(!WEB_MODE) return;
  msg=String(msg||"").trim();
  if(!msg||/^Script error\.?$/i.test(msg)) return;                       /* another site's script: no details */
  if(/Failed to fetch|NetworkError|Load failed|network|AbortError/i.test(msg)) return;   /* being offline isn't a bug */
  if(ERR_N>=5||ERR_SEEN[msg]) return;
  ERR_SEEN[msg]=1; ERR_N++;
  var body={p_message:evScrub(msg,300),p_stack:evScrub(stack||"",2000)||null,p_screen:evScreen(),
    p_anon_id:evAnonId(),p_app_version:APP_VERSION,p_platform:evPlatform()};
  if(typeof sb==="undefined"||!sb){ ERR_WAIT.push(body); return; }
  sb.rpc("log_client_error",body).then(function(){},function(){});
}
window.addEventListener("error",function(e){
  if(e&&e.filename&&e.filename.indexOf(location.origin)!==0) return;      /* only our own files */
  reportError(e&&e.message,e&&e.error&&e.error.stack);
});
window.addEventListener("unhandledrejection",function(e){
  var r=e&&e.reason; reportError(r&&r.message||String(r||""),r&&r.stack);
});

/* ---------- app config ---------- */
function cfg(){ if(CFG===null) CFG=evGet(CFG_KEY)||{}; return CFG; }
function flag(name){ var f=cfg().flags; return !!(f&&typeof f==="object"&&f[name]); }
function cfgLoad(){
  cfgApply();
  if(typeof sb==="undefined"||!sb) return;
  sb.from("app_config").select("key,value").then(function(r){
    if(!r||r.error||!Array.isArray(r.data)) return;
    var c={}; r.data.forEach(function(x){ c[x.key]=x.value; });
    CFG=c; evPut(CFG_KEY,c); cfgApply();
  },function(){});
}
function cfgApply(){
  var m=cfg().min_version;
  if(typeof m==="string"&&versionLess(APP_VERSION,m)) showUpdateBar();
}
function showUpdateBar(){
  if(document.getElementById("updBar")) return;
  var d=document.createElement("div"); d.id="updBar"; d.className="updbar"; d.setAttribute("role","status");
  if(platform.native){   /* the app can't reload new code: it comes from Google Play */
    d.innerHTML='<span>A new version of GFD is on Google Play.</span><button id="updReload">Update</button>';
    document.body.appendChild(d);
    document.getElementById("updReload").addEventListener("click",function(){ platform.openExternal(platform.storeUrl()); });
    return;
  }
  d.innerHTML='<span>A new version of GFD is ready.</span><button id="updReload">Reload</button>';
  document.body.appendChild(d);
  document.getElementById("updReload").addEventListener("click",function(){
    var go=function(){ location.reload(); };
    if(typeof storeFlush==="function"&&typeof storeOn==="function"&&storeOn()) storeFlush().then(go,go); else go();
  });
}

/* called once the Supabase client exists (signin.js) */
function evReady(){
  cfgLoad(); evFlush();
  var w=ERR_WAIT.splice(0); w.forEach(function(b){ sb.rpc("log_client_error",b).then(function(){},function(){}); });
}
window.addEventListener("online",function(){ evFlush(); });
document.addEventListener("visibilitychange",function(){
  if(document.visibilityState!=="visible") return;
  evFlush(); if(typeof sbUser!=="undefined"&&sbUser) evWeek2(sbUser);
});

/* ---------- Usage (admins only): counts, no personal details ---------- */
var US=null;
var US_LABELS=[["sign_up","Sign-ups"],["onboarding_done","Finished setup"],["first_workout","First workout logged"],["week2_return","Came back in week 2"],
  ["trial_start","Pro trials started"],["paywall_seen","Saw the upgrade page"],["purchase","Purchases"],["export","Backups made"],["account_deleted","Accounts deleted"]];
function openUsage(){
  US={rows:null,errs:null,err:""};
  var sh=document.getElementById("usage"); sh.hidden=false; document.body.style.overflow="hidden"; renderUsage(); sh.scrollTop=0; sh.focus();
  loadUsage();
}
function closeUsage(){ var sh=document.getElementById("usage"); if(!sh||sh.hidden) return; sh.hidden=true; sh.innerHTML=""; document.body.style.overflow=""; US=null; }
function loadUsage(){
  if(!sb||!sbUser){ US.rows=[]; US.errs=[]; US.err="Sign in to see usage."; renderUsage(); return; }
  Promise.all([sb.rpc("admin_usage",{p_days:30}),sb.rpc("admin_errors",{p_limit:30})]).then(function(r){
    if(!US) return;
    if(r[0].error||r[1].error) US.err="Couldn’t load usage. Check your connection and try again.";
    US.rows=r[0].data||[]; US.errs=r[1].data||[]; renderUsage();
  },function(){ if(US){ US.rows=US.rows||[]; US.errs=US.errs||[]; US.err="Couldn’t load usage. Check your connection and try again."; renderUsage(); } });
}
function usageCounts(rows,days){
  var since=new Date(Date.now()-days*864e5).toISOString().slice(0,10), out={};
  (rows||[]).forEach(function(x){ if(x.day>=since) out[x.name]=(out[x.name]||0)+(+x.n||0); });
  return out;
}
function renderUsage(){
  var sh=document.getElementById("usage"); if(!sh||!US) return;
  var h='<div class="sheet-in"><div class="sheet-top"><h2 id="ustitle">Usage</h2><button class="chip" id="closeUsage">Close</button></div>'+
    '<p class="sub">Counts only. Nobody’s name, email or workouts are in here. <button class="linkbtn" id="usRefresh">Refresh</button></p>';
  if(US.err) h+='<p class="wzerr" role="alert">'+esc(US.err)+'</p>';
  if(US.rows===null) h+='<p class="eqempty">Loading…</p>';
  else {
    var w=usageCounts(US.rows,7), m=usageCounts(US.rows,30);
    h+='<table class="ustable"><thead><tr><th scope="col">What</th><th scope="col">7 days</th><th scope="col">30 days</th></tr></thead><tbody>'+
      US_LABELS.map(function(l){ return '<tr><th scope="row">'+esc(l[1])+'</th><td>'+(w[l[0]]||0)+'</td><td>'+(m[l[0]]||0)+'</td></tr>'; }).join("")+'</tbody></table>';
    h+='<h3 class="psec">Latest errors</h3>';
    if(!US.errs||!US.errs.length) h+='<p class="eqempty">No errors logged. Nice.</p>';
    else h+='<div class="fblist">'+US.errs.map(function(x){
      var d=new Date(x.last_at), meta=[isNaN(d)?"":d.toLocaleString(undefined,{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}),
        x.count>1?x.count+" times":"",x.screen,x.app_version&&("v"+x.app_version),x.platform].filter(Boolean).join(" · ");
      return '<article class="fbcard"><p class="fbmsg">'+esc(x.message)+'</p><p class="fbctx">'+esc(meta)+'</p>'+
        (x.stack?'<details class="usstack"><summary>Stack</summary><pre>'+esc(x.stack)+'</pre></details>':'')+'</article>';
    }).join("")+'</div>';
  }
  sh.innerHTML=h+'</div>';
}
function usageClick(t){
  if(t.id==="closeUsage"){ closeUsage(); return true; }
  if(t.id==="usRefresh"&&US){ US.rows=null; US.err=""; renderUsage(); loadUsage(); return true; }
  return false;
}
