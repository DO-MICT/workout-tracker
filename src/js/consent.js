/* ---------- consent: terms, privacy, marketing and (later) health details (WP6) ----------
   The server keeps the record (public.consents, append-only). The app only reads my_consents and calls
   give_consent / withdraw_consent. Nothing here decides what someone agreed to on its own.
   - After sign-in, if the terms or privacy policy has a published version the person hasn't agreed to
     (new account, or the text changed), a screen asks before the app opens. Signing out is the other way out.
   - The sign-up form has the same tick box, plus an optional one for tips and news; the database records
     those with the new account (sign-up trigger).
   - Profile › Privacy shows what was agreed and when, and turns tips and news on or off.
   - Terms and privacy versions stay empty in app_config.policies until the policy pages go live (WP7);
     until then nobody is asked. Health consent comes with the health details screens (WP9). */
var CS=null;   /* {rows: [{kind, version, given_at, withdrawn_at, active, current_version}], uid} or null */
var CONSENT_KINDS=["terms","privacy"], CONSENT_LABEL={terms:"Terms of use",privacy:"Privacy policy",marketing:"Tips and news by email",health:"Health details"};

/* which of terms and privacy still need a yes (pure: tested in tests/consent.test.js) */
function consentNeeds(rows){
  return CONSENT_KINDS.filter(function(k){
    var r=(rows||[]).filter(function(x){return x&&x.kind===k;})[0];
    if(!r||!r.current_version) return false;                 /* not published yet: nothing to ask */
    return !r.active||r.version!==r.current_version;
  });
}
/* true when the person agreed to an older version of every kind that is needed now (so: "we've updated") */
function consentIsUpdate(rows,needs){
  return needs.length>0&&needs.every(function(k){ var r=(rows||[]).filter(function(x){return x.kind===k;})[0]; return r&&r.version&&r.version!==r.current_version; });
}
function consentRow(k){ return CS&&CS.rows?CS.rows.filter(function(x){return x.kind===k;})[0]||null:null; }
function policyUrl(k){ var p=cfg().policies, u=p&&typeof p==="object"?p[k+"_url"]:""; return typeof u==="string"&&/^https:\/\/|^[a-z0-9_-]+\.html$/i.test(u)?u:""; }
function policyVersion(k){ var p=cfg().policies, v=p&&typeof p==="object"?p[k]:""; return typeof v==="string"?v:""; }
function policyLink(k){ var u=policyUrl(k), t=CONSENT_LABEL[k]; return u?'<a href="'+esc(u)+'" target="_blank" rel="noopener">'+t+'</a>':t; }

/* read the record; resolves with the rows, or null when it can't (offline, older database) */
function consentLoad(){
  if(!WEB_MODE||typeof sb==="undefined"||!sb||!sbUser) return Promise.resolve(null);
  var uid=sbUser.id;
  return sb.from("my_consents").select("kind,version,given_at,withdrawn_at,active,current_version").then(function(r){
    if(!r||r.error||!Array.isArray(r.data)||!sbUser||sbUser.id!==uid) return null;
    CS={rows:r.data,uid:uid}; return r.data;
  },function(){ return null; });
}

/* ---------- the gate after sign-in ---------- */
var consentDone=null;
/* resolves once nothing is owed (or we can't tell: offline never locks anyone out of their workouts) */
function consentCheck(){
  return consentLoad().then(function(rows){
    var needs=consentNeeds(rows);
    if(!needs.length) return;
    return new Promise(function(res){ consentDone=res; consentOpen(needs,consentIsUpdate(rows,needs)); });
  });
}
function consentOpen(needs,update){
  var sh=document.getElementById("consent"); if(!sh) return;
  sh.dataset.needs=needs.join(",");
  var both=needs.length>1, what=both?policyLink("terms")+' and the '+policyLink("privacy"):'the '+policyLink(needs[0]);
  sh.innerHTML='<div class="sheet-in ob">'+brandHtml()+'<div class="obhero"><h1 id="cstitle">'+(update?'We’ve updated':'One more thing')+'</h1>'+
    '<p>'+(update?'We changed our '+(both?'Terms of use and Privacy policy':CONSENT_LABEL[needs[0]])+'. Please read '+(both?'them':'it')+' and agree to keep using GFD.'
      :'Please read and agree to how GFD works and how we look after your data.')+'</p></div>'+
    '<label class="cscheck"><input type="checkbox" id="csAgree"> <span>I agree to '+what+'.</span></label>'+
    '<p class="wzerr" id="csErr" role="alert"></p><button class="primary" id="csGo">Agree and continue</button>'+
    '<p class="obfine">Don’t agree? <button class="linkbtn" id="csOut">Sign out</button></p></div>';
  sh.hidden=false; document.body.style.overflow="hidden"; sh.scrollTop=0; sh.focus();
}
function consentClose(){
  var sh=document.getElementById("consent"); if(!sh||sh.hidden) return;
  sh.hidden=true; sh.innerHTML=""; document.body.style.overflow="";
  var d=consentDone; consentDone=null; if(d) d();
}
/* record each kind in turn; stop at the first problem */
function consentGive(kinds){
  var src=typeof evPlatform==="function"?evPlatform():"web";
  return kinds.reduce(function(p,k){
    return p.then(function(){
      var r=consentRow(k), v=(r&&r.current_version)||policyVersion(k);
      return sb.rpc("give_consent",{p_kind:k,p_version:v,p_source:src}).then(function(x){ if(x&&x.error) throw x.error; });
    });
  },Promise.resolve());
}
function consentErr(e){
  var m=(e&&e.message)||"";
  if(/text has changed/i.test(m)) return "The text was just updated. Close and reopen the app to read the new version.";
  if(/too many/i.test(m)) return "Too many changes today. Try again tomorrow.";
  return "Couldn’t save that. Check your connection and try again.";
}

/* ---------- sign-up form: same tick box, plus tips and news ---------- */
function consentSignupHtml(){
  if(!policyVersion("terms")||!policyVersion("privacy")) return "";
  return '<label class="cscheck"><input type="checkbox" id="obAgree"> <span>I agree to the '+policyLink("terms")+' and the '+policyLink("privacy")+'.</span></label>'+
    (policyVersion("marketing")?'<label class="cscheck"><input type="checkbox" id="obNews"> <span>Send me tips and news by email. You can stop any time.</span></label>':'');
}
/* null = fine (nothing published, or ticked); a string = what to tell the person */
function consentSignupError(){
  var a=document.getElementById("obAgree");
  return a&&!a.checked?"Please agree to the Terms of use and Privacy policy to create an account.":null;
}
/* what goes in the sign-up metadata; the database records it with the account */
function consentSignupMeta(){
  var a=document.getElementById("obAgree"), n=document.getElementById("obNews"), m={};
  if(a&&a.checked){ m.terms=policyVersion("terms"); m.privacy=policyVersion("privacy"); }
  if(n&&n.checked) m.marketing=policyVersion("marketing");
  return Object.keys(m).length?m:null;
}

/* ---------- Profile › Privacy ---------- */
function consentHtml(){
  if(!WEB_MODE||!sbUser) return "";
  return '<h3 class="psec">Privacy</h3><div id="consentBox">'+consentBoxHtml()+'</div>';
}
function consentWhen(r){ var d=r&&new Date(r.given_at); return d&&!isNaN(d)?d.toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"}):""; }
function consentBoxHtml(){
  if(!CS||!CS.rows) return '<p class="eqempty">Loading…</p>';
  var h='<div class="cslist">';
  CONSENT_KINDS.forEach(function(k){
    var r=consentRow(k), st;
    if(!r||!r.current_version) st="Coming soon";
    else if(r.active&&r.version===r.current_version) st="Agreed "+consentWhen(r);
    else if(r.active) st="Agreed to an older version";
    else st="Not agreed yet";
    h+='<div class="csrow"><b>'+policyLink(k)+'</b><span>'+esc(st)+'</span></div>';
  });
  var m=consentRow("marketing"), on=!!(m&&m.active);
  h+='</div><div class="mtheme cstoggle"><span>Tips and news by email</span><div class="seg segtwo" role="group" aria-label="Tips and news by email">'+
    [["off","Off"],["on","On"]].map(function(o){return '<button data-csnews="'+o[0]+'" aria-pressed="'+((o[0]==="on")===on)+'"'+(m&&m.current_version?'':' disabled')+'>'+o[1]+'</button>';}).join("")+'</div></div>'+
    '<p class="sub">Health details, like injuries or things you can’t do, will be kept apart and only with your OK. That comes in a later update.</p>';
  return h;
}
function consentProfileLoad(){
  consentLoad().then(function(){ var b=document.getElementById("consentBox"); if(b) b.innerHTML=consentBoxHtml(); });
}
function consentClick(t){
  if(t.id==="csGo"){
    var sh=document.getElementById("consent"), err=document.getElementById("csErr");
    if(!document.getElementById("csAgree").checked){ err.textContent="Tick the box to agree, or sign out."; return true; }
    t.disabled=true; t.textContent="Please wait…";
    consentGive((sh.dataset.needs||"").split(",").filter(Boolean)).then(function(){ consentClose(); },function(e){
      t.disabled=false; t.textContent="Agree and continue"; err.textContent=consentErr(e);
    });
    return true;
  }
  if(t.id==="csOut"){ webSignOut(); return true; }
  if(t.dataset.csnews){
    var want=t.dataset.csnews==="on", m=consentRow("marketing");
    if(!sb||!m||!!m.active===want) return true;
    var call=want?sb.rpc("give_consent",{p_kind:"marketing",p_version:m.current_version,p_source:evPlatform()}):sb.rpc("withdraw_consent",{p_kind:"marketing",p_source:evPlatform()});
    call.then(function(x){
      if(x&&x.error){ toast(consentErr(x.error)); return; }
      toast(want?"You’ll get tips and news by email":"No more tips and news emails");
      consentProfileLoad();
    },function(e){ toast(consentErr(e)); });
    return true;
  }
  return false;
}
