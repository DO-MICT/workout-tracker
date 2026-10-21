/* ---------- backup: copy all data out, or restore it (works in every version) ---------- */
function backupHtml(){
  return '<h3 class="psec">Back up or move your data</h3><p class="sub">Copy your backup code to keep it safe or to move your data to another version of the app. Restoring replaces what’s here.</p>'+
    '<div class="bkbtns"><button class="chip sm" id="bkShow">Show backup code</button><button class="chip sm" id="bkRestoreOpen">Restore from a code</button></div><div id="bkArea"></div>';
}
function backupClick(t){
  var area=document.getElementById("bkArea"); if(!area) return false;
  if(t.id==="bkShow"){
    var snap=JSON.parse(JSON.stringify(S)); if(snap.account){delete snap.account.id;delete snap.account.signedIn;delete snap.account.authMode;}
    area.innerHTML='<textarea id="bkOut" class="bktext" rows="5" readonly aria-label="Backup code">'+esc(JSON.stringify(snap))+'</textarea><button class="chip sm" id="bkCopy">Copy</button>';
    var ta=document.getElementById("bkOut"); ta.focus(); ta.select(); return true;
  }
  if(t.id==="bkCopy"){
    var o=document.getElementById("bkOut"); o.select();
    var ok=function(){toast("Backup code copied");}, fail=function(){try{document.execCommand("copy");ok();}catch(e){toast("Select the code and copy it");}};
    if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(o.value).then(ok,fail); else fail();
    return true;
  }
  if(t.id==="bkRestoreOpen"){
    area.innerHTML='<textarea id="bkIn" class="bktext" rows="5" placeholder="Paste your backup code here" aria-label="Backup code to restore"></textarea><p class="wzerr" id="bkErr" role="alert"></p><button class="primary" id="bkRestore">Restore backup</button>';
    document.getElementById("bkIn").focus(); return true;
  }
  if(t.id==="bkRestore"){
    var raw=(document.getElementById("bkIn").value||"").trim(), err=document.getElementById("bkErr"), d=null;
    try{d=JSON.parse(raw);}catch(e){}
    if(!d||d.v!==1||!d.cur||!d.last){err.textContent="That doesn’t look like a backup code from this app.";return true;}
    if(!confirmTap(t,"Restore backup","Tap again to replace your data")) return true;
    var keep=acct(); d.account=Object.assign({},d.account||{},{id:keep.id,email:keep.email||((d.account||{}).email),signedIn:keep.signedIn,authMode:keep.authMode});
    d.who=0; d.onboarded=true; d.gearSeedV1=1; S=d; save(); closeProfile(); OPEN={}; pickToday=true; renderAll(); toast("Backup restored");
    return true;
  }
  return false;
}
