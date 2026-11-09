/* ---------- state ---------- */
/* TESTER_BUILD: the copy shared with friends shows a register page and first-run setup */
var TESTER_BUILD=false;
/* WEB_MODE: running outside Claude (e.g. GitHub Pages) -> Supabase sign-in and sync */
var WEB_MODE=!(window.claude&&typeof window.claude.use==="function");
var KEY="split5-v1";
function blank(){return {v:1,names:[(TESTER_BUILD||WEB_MODE)?"You":"Deon","Partner"],who:0,cur:[{},{}],last:[{},{}]};}
function load(){try{var r=localStorage.getItem(KEY);if(r){var o=JSON.parse(r);if(o&&o.v===1&&o.cur&&o.last){o.who=0;return o;}}}catch(e){}return blank();}
var S=load();
var canSave=true, cloudRef=null, cloudOk=false, cloudBusy=false, cloudDirty=false, cloudTimer=null;
function save(){
  S.ts=Date.now();
  try{localStorage.setItem(KEY,JSON.stringify(S));canSave=true;}catch(e){canSave=false;}
  if(cloudRef){cloudDirty=true;clearTimeout(cloudTimer);cloudTimer=setTimeout(cloudPush,700);}
  if(WEB_MODE) sbQueue();
  setStatus();
}
function cloudPush(){
  if(!cloudRef||cloudBusy||!cloudDirty) return;
  cloudBusy=true;cloudDirty=false;
  var snap=JSON.parse(JSON.stringify(S));
  cloudRef.set(snap).then(function(){cloudOk=true;},function(){cloudOk=false;}).then(function(){
    cloudBusy=false;setStatus();
    if(cloudDirty){clearTimeout(cloudTimer);cloudTimer=setTimeout(cloudPush,300);}
  });
}
function setStatus(msg){
  var el=document.getElementById("status");
  if(WEB_MODE){ el.textContent=msg||(sbOffline?"Offline · saved on this phone":sbUser?(sbOk?"Synced to your account":(typeof SY!=="undefined"&&SY.on&&SY.err)?"Saved on this phone · sync will try again":"Saving…"):"Saved on this phone"); return; }
  el.textContent=msg||(cloudOk?"Saved to your account":canSave?"Saved on this phone":"Can't save here. Turn off private browsing to keep your logs.");
}
/* Keep logs in the artifact's own database (private to each signed-in viewer),
   with localStorage as a fast local copy. */
(function initCloud(){
  if(!window.claude||!claude.use) return;
  /* wait until every script has loaded: the answer can arrive before later files define their functions */
  if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",initCloud);return;}
  Promise.all([claude.use("db"),claude.use("user")]).then(function(r){
    var db=r[0],user=r[1]; if(!db||!user) return null;
    return user.id().then(function(id){
      if(!id) return null;
      var ref=db.doc("data/users/"+id+"/profile");
      return ref.get().then(function(snap){
        var remote=snap.exists?snap.data():null;
        var ok=remote&&remote.v===1&&remote.cur&&remote.last;
        if(ok&&(remote.ts||0)>(S.ts||0)){
          S=JSON.parse(JSON.stringify(remote));S.who=0;
          try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}
          cloudRef=ref;cloudOk=true;
          renderAll();
        }else{
          cloudRef=ref;
          if(!S.ts) S.ts=Date.now();
          cloudDirty=true;cloudPush();
        }
      });
    });
  }).then(function(){seedMyGym();histInit();}).catch(function(){cloudRef=null;cloudOk=false;setStatus();seedMyGym();histInit();});
})();
/* one time: the equipment from Deon's gym photos goes into his first location (Gym).
   Runs only after account data has loaded, so it adds to what's saved rather than replacing it. */
function seedMyGym(){
  if(S.gearSeedV1||TESTER_BUILD||WEB_MODE) return;
  var g=locState().list[0].gear;
  ["adjbench","flatbench","barbell","plates","ezbar","dumbbells","lyingpress","shoulderpress","latpulldown","legext","lyingcurl","standcalf","abbench","romanchair","cablecross","pullupbar","bands","yogamat","treadmill","smith","stabball"].forEach(function(id){if(g.indexOf(id)<0)g.push(id);});
  var k=g.indexOf("bag"); if(k>=0) g.splice(k,1);
  S.gearSeedV1=1; save(); if(typeof renderAll==="function"&&DAYS) renderAll();
}
var OPEN={}, GRPCLICK=null;
var dow=new Date().getDay();
var day=0, pickToday=true;
var WEEK=[{id:"mon",short:"Mon",long:"Monday"},{id:"tue",short:"Tue",long:"Tuesday"},{id:"wed",short:"Wed",long:"Wednesday"},{id:"thu",short:"Thu",long:"Thursday"},{id:"fri",short:"Fri",long:"Friday"},{id:"sat",short:"Sat",long:"Saturday"},{id:"sun",short:"Sun",long:"Sunday"}];
function weekLong(id){for(var i=0;i<WEEK.length;i++)if(WEEK[i].id===id)return WEEK[i].long;return id;}

function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
function cur(){return S.cur[S.who];}
/* kg or lb (WP4): weights are kept in kg; this is only what's shown and typed. rules.js has the converters. */
function U(){return S.units==="lb"?"lb":"kg";}
function isKgLab(lab){return !!lab&&(lab[0]==="kg"||lab[0]==="+kg");}
/* a saved kg value shown in the chosen unit: "100 kg", "220.5 lb" */
function fmtW(kg,dp){return GFDRules.fmtWeight(kg,U(),dp);}
function last(){return S.last[S.who];}
/* records and last time come from history (records.js, rules.js) */
function prFor(ex){ var r=bestFor(ex.id); return r&&r.best>0?String(r.best):""; }
/* today's sets for an exercise. Boxes you haven't touched start with real values (last session's same set,
   or your earlier set today), so what you see is exactly what ✓ saves. pre marks those untouched values. */
function setsFor(ex){
  var c=cur(); if(!c[ex.id]){c[ex.id]=[];}
  var arr=c[ex.id]; while(arr.length<ex.sets)arr.push({w:"",r:"",d:false});
  /* migrate: clear weights a much older version auto-filled from the record */
  arr.forEach(function(s){ if(s.pf&&!s.d&&!s.t) s.w=""; delete s.pf; });
  var L=lastFor(ex.id,ex), lab=labOf(ex);
  for(var i=0;i<ex.sets;i++){
    var s=arr[i]; if(s.d||s.t) continue;
    var p=GFDRules.setPrefill(arr,i,L&&L.sets);
    s.w=lab[0]?p.w:""; s.r=p.r;
    if(s.w||s.r) s.pre=1; else delete s.pre;
  }
  return arr;
}
