/* ---------- account: download my data, delete my account (WP8) ----------
   - Download my data: export_my_data() returns everything the server keeps about the signed-in person as JSON; this
     file turns it into a ZIP (the JSON, CSVs of sets and measurements, a README, and any screenshots sent with
     feedback). Free for everyone. Inside the Android app (WP10) the ZIP goes through platform.saveFile instead.
   - Delete my account: Profile › Delete my account, type DELETE, confirm. request_account_deletion() starts 7 days of
     grace; this phone then signs out and forgets the data. The delete-account Edge Function removes everything after
     the 7 days (supabase/functions/delete-account).
   - Signing in during the 7 days shows "Keep my account" before the app opens (deletionCheck, after the consent gate).
   - The same can be done without the app on delete-account.html (built from site/delete-account.html). */
var DEL=null;   /* the pending request {requested_at, due_at} while the sheet is open */

/* ---------- ZIP (stored, no compression) and CSV: pure, tested in tests/account.test.js ---------- */
var CRC_T=null;
function crc32(b){
  if(!CRC_T){ CRC_T=[]; for(var n=0;n<256;n++){ var c=n; for(var k=0;k<8;k++) c=c&1?0xEDB88320^(c>>>1):c>>>1; CRC_T[n]=c>>>0; } }
  var x=0xFFFFFFFF; for(var i=0;i<b.length;i++) x=CRC_T[(x^b[i])&255]^(x>>>8);
  return (x^0xFFFFFFFF)>>>0;
}
function utf8(s){ return new TextEncoder().encode(s); }
/* files: [{name, data: string or Uint8Array}] -> Uint8Array of a .zip */
function zipFiles(files,when){
  var d=when||new Date(), dt=((d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1))&0xFFFF,
      dd=(((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate())&0xFFFF;
  var parts=[], central=[], off=0;
  function hdr(n){ return new DataView(new ArrayBuffer(n)); }
  files.forEach(function(f){
    var name=utf8(f.name), data=typeof f.data==="string"?utf8(f.data):f.data, crc=crc32(data);
    var h=hdr(30);
    h.setUint32(0,0x04034b50,true); h.setUint16(4,20,true); h.setUint16(6,0x0800,true); h.setUint16(8,0,true);
    h.setUint16(10,dt,true); h.setUint16(12,dd,true); h.setUint32(14,crc,true); h.setUint32(18,data.length,true);
    h.setUint32(22,data.length,true); h.setUint16(26,name.length,true); h.setUint16(28,0,true);
    var c=hdr(46);
    c.setUint32(0,0x02014b50,true); c.setUint16(4,20,true); c.setUint16(6,20,true); c.setUint16(8,0x0800,true); c.setUint16(10,0,true);
    c.setUint16(12,dt,true); c.setUint16(14,dd,true); c.setUint32(16,crc,true); c.setUint32(20,data.length,true);
    c.setUint32(24,data.length,true); c.setUint16(28,name.length,true); c.setUint32(42,off,true);
    parts.push(new Uint8Array(h.buffer),name,data); central.push(new Uint8Array(c.buffer),name);
    off+=30+name.length+data.length;
  });
  var csize=central.reduce(function(a,p){return a+p.length;},0), e=hdr(22);
  e.setUint32(0,0x06054b50,true); e.setUint16(8,files.length,true); e.setUint16(10,files.length,true);
  e.setUint32(12,csize,true); e.setUint32(16,off,true);
  var all=parts.concat(central,[new Uint8Array(e.buffer)]), out=new Uint8Array(off+csize+22), p=0;
  all.forEach(function(a){ out.set(a,p); p+=a.length; });
  return out;
}
function csvCell(v){
  if(v===null||v===undefined) return "";
  var s=typeof v==="object"?JSON.stringify(v):String(v);
  if(/^[=+\-@\t\r]/.test(s)&&!/^-?\d+(\.\d+)?$/.test(s)) s="'"+s;   /* no formulas when opened in a spreadsheet */
  return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
}
function csv(head,rows){ return [head].concat(rows).map(function(r){return r.map(csvCell).join(",");}).join("\r\n")+"\r\n"; }
function dayOf(ts){ return ts?String(ts).slice(0,10):""; }

/* the export JSON -> the files in the ZIP (screenshots are added by exportDownload) */
function exportFiles(x){
  var t=(x&&x.tables)||{}, live=function(a){return (a||[]).filter(function(r){return !r.deleted_at;});};
  var wk={}; (t.workouts||[]).forEach(function(w){ wk[w.id]=w; });
  var sets=(t.workout_sets||[]).map(function(s){
    var w=wk[s.workout_id]||{};
    return [dayOf(s.performed_at||w.performed_at),w.plan_name||"",w.day_title||"",s.exercise_name||s.exercise_id,s.exercise_order,s.set_no,
      s.weight,s.reps,s.measure||"",s.done?"yes":"no",w.location_name||""];
  });
  var meas=live(t.measurements).slice().sort(function(a,b){return a.taken_at<b.taken_at?-1:a.taken_at>b.taken_at?1:0;})
    .map(function(m){return [dayOf(m.taken_at),m.site,m.side||"",m.value];});
  var readme="GFD · Get Fit Daily: your data\r\n\r\n"+
    "Exported "+(x&&x.exported_at||"")+" for "+((x&&x.account&&x.account.email)||"your account")+".\r\n\r\n"+
    "gfd-data.json      everything GFD keeps about you, one section per table (format gfd-export, version 1)\r\n"+
    "sets.csv           every set you logged: date, plan, day, exercise, order, set, weight (kg), reps, type, done, place\r\n"+
    "measurements.csv   body check-ins: date, site, side, value (kg for weight, cm for lengths, % for body fat)\r\n"+
    "screenshots/       pictures you sent with feedback, if any\r\n\r\n"+
    "Health details (injury notes, things you can't do, pain scores) are in the \"health\" section of gfd-data.json,\r\n"+
    "kept apart from everything else and only while you have health details turned on.\r\n\r\n"+
    "Weights are always in kg, whatever unit the app shows. Times are UTC.\r\n"+
    "Rows marked deleted_at in the JSON are ones you deleted; they are removed for good within 90 days.\r\n";
  return [
    {name:"README.txt",data:readme},
    {name:"gfd-data.json",data:JSON.stringify(x,null,2)},
    {name:"sets.csv",data:csv(["date","plan","day","exercise","order","set","weight_kg","reps","type","done","place"],sets)},
    {name:"measurements.csv",data:csv(["date","site","side","value"],meas)}
  ];
}

/* ---------- download ---------- */
function exportName(){ return "gfd-data-"+new Date().toISOString().slice(0,10)+".zip"; }
function saveBlob(blob,name){
  if(typeof platform!=="undefined"&&platform&&platform.saveFile) return platform.saveFile(blob,name);   /* Android (WP10) */
  var a=document.createElement("a"), u=URL.createObjectURL(blob);
  a.href=u; a.download=name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(u); },30000);
}
function exportScreenshots(x){
  var paths=((x.tables||{}).suggestions||[]).map(function(s){return s.screenshot_path;}).filter(Boolean).slice(0,50);
  return Promise.all(paths.map(function(p){
    return sb.storage.from("suggestions").download(p).then(function(r){
      if(!r||r.error||!r.data) return null;
      return r.data.arrayBuffer().then(function(b){ return {name:"screenshots/"+String(p).split("/").pop(),data:new Uint8Array(b)}; });
    },function(){ return null; });
  })).then(function(a){ return a.filter(Boolean); });
}
function exportDownload(btn){
  if(!WEB_MODE||!sb||!sbUser){ toast("Sign in to download your data"); return; }
  var label=btn?btn.textContent:"";
  if(btn){ btn.disabled=true; btn.textContent="Getting your data…"; }
  var done=function(){ if(btn&&document.body.contains(btn)){ btn.disabled=false; btn.textContent=label; } };
  /* send anything still waiting first, so the download has the latest */
  var flush=(typeof storeOn==="function"&&storeOn()&&typeof storeFlush==="function")?storeFlush().catch(function(){}):Promise.resolve();
  flush.then(function(){ return sb.rpc("export_my_data"); }).then(function(r){
    if(!r||r.error||!r.data) throw (r&&r.error)||new Error("no data");
    var x=r.data;
    return exportScreenshots(x).catch(function(){return [];}).then(function(shots){
      saveBlob(new Blob([zipFiles(exportFiles(x).concat(shots))],{type:"application/zip"}),exportName());
      logEvent("export"); toast("Your data is downloading"); done();
    });
  }).catch(function(){ done(); toast("Couldn’t get your data. Check your connection and try again."); });
}

/* ---------- Profile › Your data ---------- */
function accountDataHtml(){
  if(!WEB_MODE||!sbUser) return "";
  return '<h3 class="psec">Your data and account</h3><p class="sub">Download everything GFD keeps about you (a ZIP with your sets and measurements as spreadsheets). Free, any time.</p>'+
    '<div class="bkbtns"><button class="chip sm" id="acExport">Download my data</button><button class="chip sm danger" id="acDelete">Delete my account</button></div>';
}

/* ---------- the delete sheet ---------- */
function delDate(ts){ var d=new Date(ts); return isNaN(d)?"":d.toLocaleDateString(undefined,{weekday:"long",day:"numeric",month:"long"}); }
/* a paid plan from a store keeps billing until it is cancelled there */
function delStoreNote(){
  var a=typeof access==="function"?access():null, src=a&&a.source;
  if(src==="play") return '<p class="delwarn"><b>Cancel your subscription first.</b> Deleting your account doesn’t stop Google Play billing you. Open Google Play › Payments and subscriptions › Subscriptions › GFD › Cancel.</p>';
  if(src==="web") return '<p class="delwarn"><b>Cancel your subscription first.</b> Deleting your account doesn’t stop the payments. Use the link in your receipt email to cancel.</p>';
  return '';
}
function delSheet(html){
  var sh=document.getElementById("acctdel"); if(!sh) return null;
  sh.innerHTML='<div class="sheet-in ob">'+html+'</div>'; sh.hidden=false; document.body.style.overflow="hidden"; sh.scrollTop=0; sh.focus();
  return sh;
}
function delClose(){
  var sh=document.getElementById("acctdel"); if(!sh||sh.hidden) return;
  sh.hidden=true; sh.innerHTML=""; document.body.style.overflow=document.getElementById("profile")&&!document.getElementById("profile").hidden?"hidden":"";
  var d=delGateDone; delGateDone=null; if(d) d();
}
function delOpen(){
  delSheet('<div class="obhero"><h1 id="dltitle">Delete my account</h1>'+
    '<p>This deletes your account and everything in it: plans, workouts, records, measurements, notes, gear and settings. It can’t be undone.</p></div>'+
    delStoreNote()+
    '<ul class="dellist"><li>You have <b>7 days</b> to change your mind: sign in again and tap Keep my account.</li>'+
    '<li>After that, everything is removed for good.</li>'+
    '<li>Want a copy first? <button class="linkbtn" id="dlExport">Download my data</button></li></ul>'+
    '<label class="bname"><span>Type DELETE to confirm</span><input id="dlType" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="10"></label>'+
    '<p class="wzerr" id="dlErr" role="alert"></p><button class="primary danger" id="dlGo">Delete my account</button>'+
    '<p class="obfine"><button class="linkbtn" id="dlCancel">Keep my account</button></p>');
  var i=document.getElementById("dlType"); if(i) i.focus();
}
function delRequest(btn){
  var err=document.getElementById("dlErr"), typed=(document.getElementById("dlType").value||"").trim().toUpperCase();
  if(typed!=="DELETE"){ err.textContent="Type DELETE in the box to confirm."; document.getElementById("dlType").focus(); return; }
  if(!sb||!sbUser){ err.textContent="You need to be online and signed in."; return; }
  btn.disabled=true; btn.textContent="Please wait…";
  sb.rpc("request_account_deletion",{p_source:evPlatform()}).then(function(r){
    if(!r||r.error||!r.data) throw (r&&r.error)||new Error("no row");
    delSheet('<div class="obhero"><h1 id="dltitle">Account will be deleted</h1>'+
      '<p>Your account and data will be deleted on <b>'+esc(delDate(r.data.due_at))+'</b>.</p>'+
      '<p>Changed your mind? Sign in before then and tap Keep my account.</p></div>'+
      '<button class="primary" id="dlBye">Sign out</button>');
  }).catch(function(){ btn.disabled=false; btn.textContent="Delete my account"; err.textContent="Couldn’t do that. Check your connection and try again."; });
}
/* ---------- after sign-in: a pending request ---------- */
var delGateDone=null;
function deletionLoad(){
  if(!WEB_MODE||typeof sb==="undefined"||!sb||!sbUser) return Promise.resolve(null);
  return sb.from("deletion_requests").select("requested_at,due_at").maybeSingle().then(function(r){
    return r&&!r.error&&r.data?r.data:null;
  },function(){ return null; });
}
/* resolves once the account is kept (or there is nothing pending, or we can't tell) */
function deletionCheck(){
  return deletionLoad().then(function(row){
    if(!row) return;
    DEL=row;
    return new Promise(function(res){
      delGateDone=res;
      delSheet('<div class="obhero"><h1 id="dltitle">Keep your account?</h1>'+
        '<p>You asked to delete your account. It will be deleted on <b>'+esc(delDate(row.due_at))+'</b>, with everything in it.</p></div>'+
        '<p class="wzerr" id="dlErr" role="alert"></p><button class="primary" id="dlKeep">Keep my account</button>'+
        '<div class="bkbtns"><button class="chip sm" id="dlExport">Download my data</button><button class="chip sm" id="dlOut">Sign out</button></div>');
    });
  });
}

function accountClick(t){
  if(t.id==="acExport"||t.id==="dlExport"){ exportDownload(t); return true; }
  if(t.id==="acDelete"){ delOpen(); return true; }
  if(t.id==="dlCancel"){ delClose(); return true; }
  if(t.id==="dlGo"){ delRequest(t); return true; }
  /* signing out also forgets this phone's copy (signin.js webSignOut); the account copy goes after the 7 days */
  if(t.id==="dlBye"||t.id==="dlOut"){ t.disabled=true; webSignOut(); return true; }
  if(t.id==="dlKeep"){
    var err=document.getElementById("dlErr"); t.disabled=true; t.textContent="Please wait…";
    sb.rpc("cancel_account_deletion").then(function(r){
      if(r&&r.error) throw r.error;
      DEL=null; delClose(); toast("Your account is kept");
    }).catch(function(){ t.disabled=false; t.textContent="Keep my account"; err.textContent="Couldn’t do that. Check your connection and try again."; });
    return true;
  }
  return false;
}
