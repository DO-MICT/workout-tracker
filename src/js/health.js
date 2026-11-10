/* ---------- health details: injury notes (WP9, NFR-6, architecture 8.1) ----------
   Injury notes are health details. On the server they live in public.health_limits (kind exercise_note), which only
   opens to the owner while their health consent is active, and withdrawing the consent deletes them. They are not in
   the synced tables or the blob, events or error reports.
   - The screens still read S.notes ({exercise id: text}). S.notes, S.healthQ (changes waiting to upload) and S.healthSync
     (the account this phone last loaded notes for) are local-only (syncmap.js LOCAL).
   - After sign-in (healthStart, after the consent gate): consent on = load the notes from the server, upload waiting ones;
     withdrawn = forget them here too; never asked and this phone has notes (from before WP9) = ask once per open
     whether to keep them (agree), delete them, or decide later (they stay on this phone only).
   - Adding a note while signed in without health consent asks for it first.
   - Profile › Privacy turns health details on (asks) or off (withdraws, which deletes them everywhere).
   Signed out (local only) nothing changes: notes stay on this phone as before.
   The pure parts (healthStateOf, healthMerge) are tested in tests/health.test.js. */
var HEALTH_KIND="exercise_note";
var healthDone=null, healthAfter=null;

/* "on", "off" (withdrawn), "never" (no answer yet), or "unknown" (couldn't load) */
function healthStateOf(row){
  if(!row) return "unknown";
  if(row.active) return "on";
  if(row.withdrawn_at) return "off";
  return "never";
}
function healthState(){ return WEB_MODE&&typeof sbUser!=="undefined"&&sbUser?healthStateOf(consentRow("health")):"local"; }

/* server notes + this phone's waiting changes. first = this phone hasn't loaded this account's notes before, so its
   own notes that the server doesn't have are queued (nothing typed before WP9 is lost). */
function healthMerge(server,local,queue,first){
  var notes={}, q={};
  Object.keys(queue||{}).forEach(function(k){ q[k]=queue[k]; });
  Object.keys(server||{}).forEach(function(k){ notes[k]=server[k]; });
  if(first) Object.keys(local||{}).forEach(function(k){
    if(typeof local[k]==="string"&&local[k]&&!(k in notes)&&!(k in q)) q[k]=local[k];
  });
  Object.keys(q).forEach(function(k){ if(q[k]) notes[k]=q[k]; else delete notes[k]; });
  return {notes:notes,queue:q};
}
function healthHasNotes(){ return !!(S.notes&&Object.keys(S.notes).some(function(k){return S.notes[k];})); }
function healthRecId(ex){ return GFDSync.recId(sbUser.id,"hnote",ex); }

/* ---------- server ---------- */
function healthPull(){
  var uid=sbUser.id;
  return healthFlush().then(function(){
    return sb.from("health_limits").select("exercise_id,note").eq("kind",HEALTH_KIND);
  }).then(function(r){
    if(!r||r.error||!Array.isArray(r.data)||!sbUser||sbUser.id!==uid) return;
    var server={}; r.data.forEach(function(x){ if(x.exercise_id&&x.note) server[x.exercise_id]=x.note; });
    var m=healthMerge(server,S.notes,S.healthQ,S.healthSync!==uid);
    S.notes=m.notes; S.healthQ=m.queue; S.healthSync=uid; save();
    return healthFlush();
  },function(){});
}
/* upload waiting changes, one by one; a failure keeps the rest for next time */
var healthBusy=null;
function healthFlush(){
  if(healthBusy) return healthBusy;
  if(!sb||!sbUser||healthState()!=="on"||!S.healthQ||!Object.keys(S.healthQ).length) return Promise.resolve();
  var keys=Object.keys(S.healthQ);
  healthBusy=keys.reduce(function(p,ex){
    return p.then(function(){
      var v=S.healthQ[ex];
      var call=v?sb.from("health_limits").upsert({id:healthRecId(ex),kind:HEALTH_KIND,exercise_id:ex.slice(0,80),note:String(v).slice(0,2000)},{onConflict:"id"})
               :sb.from("health_limits").delete().eq("kind",HEALTH_KIND).eq("exercise_id",ex);
      return call.then(function(r){ if(!(r&&r.error)&&S.healthQ&&S.healthQ[ex]===v){ delete S.healthQ[ex]; save(); } });
    });
  },Promise.resolve()).then(function(){ healthBusy=null; },function(){ healthBusy=null; });
  return healthBusy;
}
/* a note was saved or deleted on screen (builder.js) */
function healthNoteChanged(ex,v){
  if(healthState()==="local") return;
  if(!S.healthQ) S.healthQ={};
  S.healthQ[ex]=v||""; save(); healthFlush();
}
/* forget health details on this phone (consent withdrawn here or on another device) */
function healthForget(keepQueued){
  var q=keepQueued&&S.healthQ?S.healthQ:{}, n={};
  Object.keys(q).forEach(function(k){ if(q[k]) n[k]=q[k]; });
  S.notes=n; S.healthQ=Object.keys(n).length?Object.assign({},n):{}; delete S.healthSync; save();
}

/* ---------- after sign-in ---------- */
function healthStart(){
  if(!WEB_MODE||typeof sb==="undefined"||!sb||!sbUser) return Promise.resolve();
  var st=healthState();
  if(st==="on") return healthPull();
  if(st==="off"){
    healthForget(true);   /* deleted on the server when withdrawn; keep only notes typed here since (asked below) */
    if(!healthHasNotes()) return Promise.resolve();
  }
  if((st==="never"||st==="off")&&healthHasNotes()&&!healthStart.asked){
    healthStart.asked=true;
    return new Promise(function(res){ healthDone=res; healthOpen("move"); });
  }
  return Promise.resolve();
}

/* ---------- the sheet ---------- */
/* mode "move" = this phone has notes from before; "ask" = about to add one, or turning it on in Profile */
function healthOpen(mode,after){
  var sh=document.getElementById("healthsheet"); if(!sh) return;
  healthAfter=after||null; sh.dataset.mode=mode;
  var n=S.notes?Object.keys(S.notes).filter(function(k){return S.notes[k];}).length:0;
  var title=mode==="move"?"Keep your injury notes?":"Keep health details?";
  var lead=mode==="move"
    ?'You have injury notes on '+n+' exercise'+(n===1?'':'s')+'. Injury notes are health details, so GFD only keeps them in your account with your OK.'
    :'Injury notes are health details, so GFD only keeps them in your account with your OK.';
  sh.innerHTML='<div class="sheet-in"><div class="sheet-top"><h2 id="htitle">'+title+'</h2><button class="chip" id="hLater">Not now</button></div>'+
    '<p class="sub">'+lead+'</p>'+
    '<ul class="hlist"><li>Kept apart from the rest of your data and open only to you.</li>'+
    '<li>Used only to show your notes on your exercises, and later to fit exercises to you.</li>'+
    '<li>Never shared, sold or used for statistics.</li>'+
    '<li>Turn it off any time in Profile › Privacy, and they’re deleted straight away.</li></ul>'+
    '<p class="wzerr" id="hErr" role="alert"></p>'+
    '<button class="primary" id="hAgree">'+(mode==="move"?'Keep them':'I agree')+'</button>'+
    (mode==="move"?'<button class="ghost bre" id="hDrop">Delete them</button><p class="obfine">Not now keeps them on this phone only.</p>':'')+
    '<p class="obfine">'+policyLink("privacy")+'</p></div>';
  sh.hidden=false; document.body.style.overflow="hidden"; sh.scrollTop=0; sh.focus();
}
function healthClose(){
  var sh=document.getElementById("healthsheet"); if(!sh||sh.hidden) return;
  sh.hidden=true; sh.innerHTML=""; document.body.style.overflow="";
  var d=healthDone; healthDone=null; if(d) d();
}
function healthAgree(t){
  var err=document.getElementById("hErr"), r=consentRow("health"), v=(r&&r.current_version)||policyVersion("health");
  t.disabled=true; t.textContent="Please wait…";
  sb.rpc("give_consent",{p_kind:"health",p_version:v,p_source:typeof evPlatform==="function"?evPlatform():"web"}).then(function(x){
    if(x&&x.error) throw x.error;
    return consentLoad();
  }).then(function(){
    var after=healthAfter; healthAfter=null;
    delete S.healthSync;   /* upload this phone's notes the first time */
    healthClose(); toast("Health details on");
    var b=document.getElementById("consentBox"); if(b) b.innerHTML=consentBoxHtml();
    return healthPull().then(function(){ if(typeof renderDay==="function") renderDay(); if(after) after(); });
  }).catch(function(e){
    t.disabled=false; t.textContent=document.getElementById("healthsheet").dataset.mode==="move"?"Keep them":"I agree";
    if(err) err.textContent=consentErr(e);
  });
}
function healthWithdraw(){
  return sb.rpc("withdraw_consent",{p_kind:"health",p_source:typeof evPlatform==="function"?evPlatform():"web"}).then(function(x){
    if(x&&x.error) throw x.error;
    healthForget(false);
    return consentLoad();
  }).then(function(){
    toast("Health details off and deleted");
    var b=document.getElementById("consentBox"); if(b) b.innerHTML=consentBoxHtml();
    if(typeof renderDay==="function") renderDay();
  },function(e){ toast(consentErr(e)); });
}

/* builder.js asks before opening the note editor: true = go ahead */
function healthMayEdit(ex){
  var st=healthState();
  if(st==="local"||st==="on"||st==="unknown") return true;   /* offline: saved here, uploaded once agreed */
  healthOpen(healthHasNotes()?"move":"ask",function(){ openNote(ex); });
  return false;
}

/* Profile › Privacy row (consent.js puts it in the box) */
function healthRowHtml(){
  var r=consentRow("health"), st=healthStateOf(r), on=st==="on";
  var label=on?"On since "+consentWhen(r):st==="off"?"Off":"Not turned on";
  return '<div class="mtheme cstoggle"><span>Health details<small class="hsub">Injury notes. '+esc(label)+'.</small></span>'+
    '<div class="seg segtwo" role="group" aria-label="Health details">'+
    [["off","Off"],["on","On"]].map(function(o){return '<button data-cshealth="'+o[0]+'" aria-pressed="'+((o[0]==="on")===on)+'"'+(r&&r.current_version?'':' disabled')+'>'+o[1]+'</button>';}).join("")+
    '</div></div>';
}

function healthClick(t){
  if(t.id==="hAgree"){ healthAgree(t); return true; }
  if(t.id==="hLater"){ healthAfter=null; healthClose(); return true; }
  if(t.id==="hDrop"){
    if(!confirmTap(t,"Delete them","Tap again to delete your injury notes")) return true;
    healthForget(false); healthClose(); toast("Injury notes deleted"); if(typeof renderDay==="function") renderDay();
    return true;
  }
  if(t.dataset.cshealth){
    var want=t.dataset.cshealth==="on", on=healthState()==="on";
    if(!sb||want===on) return true;
    if(want){ healthOpen("ask"); return true; }
    if(!confirmTap(t,"Off","Tap again: deletes your injury notes")) return true;
    healthWithdraw();
    return true;
  }
  return false;
}

if(typeof module!=="undefined"&&module.exports) module.exports={healthStateOf:healthStateOf,healthMerge:healthMerge};
