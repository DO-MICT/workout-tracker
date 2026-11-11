/* ---------- web mode: Supabase accounts and sync (GitHub Pages) ----------
   Used when the page runs outside Claude. The publishable key is meant to be public;
   row level security in the database keeps each person's data private. */
var SB_URL="https://zdllpjrkwcdmcuizxuum.supabase.co", SB_KEY="sb_publishable_MDB4dT4ybWlZk5rzdcx40w_G7KwYRtm";
var sb=null, sbUser=null, sbTimer=null, sbBusy=false, sbDirty=false, sbOk=false, sbOffline=false, sbDataModel=0;
/* Google sign-in (WP11) shows only once the Supabase project has the Google provider switched on; the last answer
   is remembered so the button doesn't pop in late, and offline it stays as it was. */
var sbGoogle=(function(){ try{ return localStorage.getItem("gfd.google")==="1"; }catch(e){ return false; } })();
function webStart(){
  setStatus("Connecting…");
  if(window.supabase&&window.supabase.createClient){ webReady(); return; }
  var s=document.createElement("script"); s.src="vendor/supabase.js";
  s.onload=webReady;
  s.onerror=function(){ sbOffline=true; setStatus(); if(!acct().signedIn) openWebAuth("signup"); else { if(!S.onboarded) resumeOnboarding(); toast("Offline. Your workouts save on this phone and sync later."); } };
  document.head.appendChild(s);
}
function webReady(){
  try{ sb=window.supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}); }
  catch(e){ sbOffline=true; setStatus(); if(!acct().signedIn) openWebAuth("signup"); return; }
  catFetch(); evReady(); googleCheck();
  sb.auth.onAuthStateChange(function(ev){ if(ev==="PASSWORD_RECOVERY") openWebAuth("newpass"); });
  platform.onAuthLink(appAuthLink);   /* the Android app: confirm-email and reset links come back as gfd://auth-callback (WP10) */
  sb.auth.getSession().then(function(r){
    var ses=r&&r.data&&r.data.session;
    if(ses&&ses.user) onSignedIn(ses.user);
    else openWebAuth(acct().signedIn?"signin":"signup");
  },function(){ sbOffline=true; setStatus(); if(!acct().signedIn) openWebAuth("signup"); });
}
/* a sign-in link opened the app. On the website supabase-js reads the link from the address bar itself
   (detectSessionInUrl); in the app the link arrives through platform.js instead. */
function appAuthLink(a){
  if(!sb) return;
  if(a.error||a.error_description){
    openWebAuth("signin"); toast(/expired|invalid/i.test(a.error_description||a.error_code||"")?"That link has expired. Sign in, or ask for a new one.":"That link didn’t work. Sign in instead.");
    return;
  }
  if(!a.access_token||!a.refresh_token) return;
  sb.auth.setSession({access_token:a.access_token,refresh_token:a.refresh_token}).then(function(r){
    if(r.error||!r.data||!r.data.user){ openWebAuth("signin"); toast("That link has expired. Sign in, or ask for a new one."); return; }
    if(a.type==="recovery"){ openWebAuth("newpass"); return; }
    if(!sbUser||sbUser.id!==r.data.user.id) onSignedIn(r.data.user,a.type==="signup");
  },function(){ toast("Can’t reach the server. Check your connection."); });
}
/* ask the project which sign-in providers are on (a public endpoint; the publishable key is enough) */
function googleCheck(){
  if(typeof fetch!=="function") return;
  fetch(SB_URL+"/auth/v1/settings",{headers:{apikey:SB_KEY}}).then(function(r){ return r.ok?r.json():null; }).then(function(j){
    if(!j||!j.external) return;
    sbGoogle=!!j.external.google;
    try{ localStorage.setItem("gfd.google",sbGoogle?"1":"0"); }catch(e){}
    var box=document.getElementById("waGoogleBox"); if(box) box.hidden=!sbGoogle;
  },function(){});
}
function googleHtml(){
  return '<div class="wagoog" id="waGoogleBox"'+(sbGoogle?'':' hidden')+'><button class="gbtn" id="waGoogle" type="button">'+
    '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>'+
    '<span>Continue with Google</span></button><p class="orline"><span>or with email</span></p></div>';
}
/* web: the page goes to Google and comes back here, where supabase-js picks the session out of the address bar.
   The app: Google opens in a Custom Tab and comes back as gfd://auth-callback, handled by appAuthLink.
   A new account then gets the terms and privacy screen (consentCheck), since Google skips the sign-up tick box. */
function googleStart(t,err){
  if(!sb){ err.textContent="Can’t reach the server. Check your connection and reload."; return; }
  var label="Continue with Google", lab=t.querySelector("span")||t, done=function(){ t.disabled=false; lab.textContent=label; };
  t.disabled=true; lab.textContent="Opening Google…"; err.textContent="";
  sb.auth.signInWithOAuth({provider:"google",options:{redirectTo:platform.authRedirect(),skipBrowserRedirect:true,queryParams:{prompt:"select_account"}}}).then(function(r){
    if(r.error||!r.data||!r.data.url){ done(); err.textContent=authMsg(r.error); return; }
    platform.openAuthUrl(r.data.url,done);
    if(platform.native) setTimeout(done,4000);   /* the app stays on this screen behind the tab */
  },function(x){ done(); err.textContent=authMsg(x); });
}
/* show or hide what's typed in a password box */
function peekHtml(){ return '<button class="pwpeek" type="button" data-wapeek="1" aria-label="Show password" aria-pressed="false">Show</button>'; }
function openWebAuth(mode){
  OB={step:"register",mode:mode||"signup",ans:{}};
  var sh=document.getElementById("onboard"); sh.hidden=false; document.body.style.overflow="hidden"; renderOnboard();
}
function authMsg(e){
  var m=(e&&(e.message||e.error_description))||"Something went wrong. Try again.";
  if(/invalid login/i.test(m)) return "Email or password is wrong.";
  if(/already registered|already exists/i.test(m)) return "There’s already an account with that email. Sign in instead.";
  if(/email not confirmed/i.test(m)) return "Confirm your email first. Check your inbox for the link.";
  if(/password should be at least|weak password/i.test(m)) return "Use a password of at least 6 characters.";
  if(/email rate limit/i.test(m)) return "We can’t send sign-up emails right now because too many went out in the last hour. Please try again a bit later.";
  if(/rate limit|too many/i.test(m)) return "Too many tries. Wait a minute and try again.";
  if(/provider is not enabled|unsupported provider/i.test(m)) return "Google sign-in isn’t switched on yet. Use your email for now.";
  if(/fetch|network/i.test(m)) return "Can’t reach the server. Check your connection.";
  return m;
}
function webAuthHtml(){
  var m=OB.mode, h=brandHtml()+'<div class="obhero"><h1>'+({signup:"Welcome",signin:"Welcome back",check:"Check your email",reset:"Reset password",sent:"Check your email",newpass:"New password"}[m])+'</h1>';
  if(m==="signup"){
    h+='<p>Create your account to start testing Get Fit Daily.</p></div>'+obDots(1)+googleHtml()+
      '<label class="bname"><span>Name</span><input id="obName" maxlength="40" autocomplete="name" placeholder="What should we call you?"></label>'+
      '<label class="bname"><span>Email</span><input id="obEmail" type="email" inputmode="email" autocomplete="email" maxlength="80" placeholder="you@example.com"></label>'+
      '<label class="bname pw"><span>Password</span><input id="obPass" type="password" autocomplete="new-password" minlength="6" maxlength="72" placeholder="At least 6 characters">'+peekHtml()+'</label>'+
      ageFieldHtml("obYear")+consentSignupHtml()+
      '<p class="wzerr" id="obErr" role="alert"></p><button class="primary" id="waSignup">Create account</button>'+
      '<p class="obfine">Already have an account? <button class="linkbtn" data-wamode="signin">Sign in</button></p>';
  } else if(m==="signin"){
    h+='<p>Sign in to load your plans and workouts.</p></div>'+googleHtml()+
      '<label class="bname"><span>Email</span><input id="obEmail" type="email" inputmode="email" autocomplete="email" maxlength="80" value="'+esc(OB.email||acct().email||"")+'"></label>'+
      '<label class="bname pw"><span>Password</span><input id="obPass" type="password" autocomplete="current-password" maxlength="72">'+peekHtml()+'</label>'+
      '<p class="wzerr" id="obErr" role="alert"></p><button class="primary" id="waSignin">Sign in</button>'+
      '<p class="obfine"><button class="linkbtn" data-wamode="reset">Forgot password?</button> · New here? <button class="linkbtn" data-wamode="signup">Create an account</button></p>';
  } else if(m==="check"){
    h+='<p>We sent a confirmation link to <b>'+esc(OB.email||"")+'</b>. Open it on this phone, then come back and sign in.</p></div>'+
      '<button class="primary" data-wamode="signin">I’ve confirmed, sign in</button><p class="obfine">No email? Check spam, or <button class="linkbtn" data-wamode="signup">try again</button>.</p>';
  } else if(m==="reset"){
    h+='<p>Enter your email and we’ll send a link to set a new password.</p></div>'+
      '<label class="bname"><span>Email</span><input id="obEmail" type="email" inputmode="email" autocomplete="email" maxlength="80" value="'+esc(OB.email||acct().email||"")+'"></label>'+
      '<p class="wzerr" id="obErr" role="alert"></p><button class="primary" id="waReset">Send reset link</button><p class="obfine"><button class="linkbtn" data-wamode="signin">Back to sign in</button></p>';
  } else if(m==="sent"){
    h+='<p>If there’s an account for <b>'+esc(OB.email||"")+'</b>, a reset link is on its way. Open it on this phone.</p></div><button class="primary" data-wamode="signin">Back to sign in</button>';
  } else if(m==="newpass"){
    h+='<p>Choose a new password for your account.</p></div>'+
      '<label class="bname pw"><span>New password</span><input id="obPass" type="password" autocomplete="new-password" minlength="6" maxlength="72" placeholder="At least 6 characters">'+peekHtml()+'</label>'+
      '<p class="wzerr" id="obErr" role="alert"></p><button class="primary" id="waNewpass">Save new password</button>';
  }
  return h;
}
function waBusy(t,on,label){ t.disabled=on; t.textContent=on?"Please wait…":label; }
function webAuthClick(t){
  if(!OB||OB.step!=="register"||!WEB_MODE) return false;
  if(t.dataset.wamode){ var em=document.getElementById("obEmail"); if(em) OB.email=em.value.trim(); OB.mode=t.dataset.wamode; renderOnboard(); return true; }
  if(t.dataset.wapeek){
    var pi=document.getElementById("obPass"); if(!pi) return true;
    var show=pi.type==="password"; pi.type=show?"text":"password";
    t.textContent=show?"Hide":"Show"; t.setAttribute("aria-pressed",show?"true":"false"); t.setAttribute("aria-label",show?"Hide password":"Show password");
    return true;
  }
  var err=document.getElementById("obErr"), v=function(id){var el=document.getElementById(id);return el?(el.value||"").trim():"";};
  var okEmail=function(e){return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);};
  if(!sb&&(t.id==="waSignup"||t.id==="waSignin"||t.id==="waReset"||t.id==="waNewpass")){ err.textContent="Can’t reach the server. Check your connection and reload."; return true; }
  if(t.id==="waGoogle"){ if(OB.mode==="signup"&&ageBlocked()){ err.textContent=AGE_SORRY; return true; } googleStart(t,err); return true; }
  if(t.id==="waSignup"){
    var n=v("obName"), e=v("obEmail"), p=document.getElementById("obPass").value;
    if(!okEmail(e)){err.textContent="Enter a valid email.";return true;}
    if(p.length<6){err.textContent="Use a password of at least 6 characters.";return true;}
    var aErr=ageError("obYear"); if(aErr){err.textContent=aErr;return true;}   /* neutral age screen (Play C1) */
    var cErr=consentSignupError(); if(cErr){err.textContent=cErr;return true;}
    var meta={display_name:n}, cm=consentSignupMeta(); if(cm) meta.consents=cm;   /* recorded with the account (WP6) */
    waBusy(t,true,"Create account"); OB.email=e;
    sb.auth.signUp({email:e,password:p,options:{data:meta,emailRedirectTo:platform.authRedirect()}}).then(function(r){
      waBusy(t,false,"Create account");
      if(r.error){err.textContent=authMsg(r.error);return;}
      if(n) S.names[0]=n.slice(0,40);
      if(r.data&&r.data.session) onSignedIn(r.data.user,true); else {OB.mode="check";renderOnboard();}
    },function(x){waBusy(t,false,"Create account");err.textContent=authMsg(x);});
    return true;
  }
  if(t.id==="waSignin"){
    var e2=v("obEmail"), p2=document.getElementById("obPass").value;
    if(!okEmail(e2)||!p2){err.textContent="Enter your email and password.";return true;}
    waBusy(t,true,"Sign in"); OB.email=e2;
    sb.auth.signInWithPassword({email:e2,password:p2}).then(function(r){
      waBusy(t,false,"Sign in");
      if(r.error){err.textContent=authMsg(r.error);return;}
      onSignedIn(r.data.user);
    },function(x){waBusy(t,false,"Sign in");err.textContent=authMsg(x);});
    return true;
  }
  if(t.id==="waReset"){
    var e3=v("obEmail"); if(!okEmail(e3)){err.textContent="Enter a valid email.";return true;}
    waBusy(t,true,"Send reset link"); OB.email=e3;
    sb.auth.resetPasswordForEmail(e3,{redirectTo:platform.authRedirect()}).then(function(r){
      waBusy(t,false,"Send reset link"); if(r.error){err.textContent=authMsg(r.error);return;} OB.mode="sent"; renderOnboard();
    },function(x){waBusy(t,false,"Send reset link");err.textContent=authMsg(x);});
    return true;
  }
  if(t.id==="waNewpass"){
    var p3=document.getElementById("obPass").value; if(p3.length<6){err.textContent="Use a password of at least 6 characters.";return true;}
    waBusy(t,true,"Save new password");
    sb.auth.updateUser({password:p3}).then(function(r){
      waBusy(t,false,"Save new password"); if(r.error){err.textContent=authMsg(r.error);return;}
      toast("Password updated"); onSignedIn(r.data.user);
    },function(x){waBusy(t,false,"Save new password");err.textContent=authMsg(x);});
    return true;
  }
  return false;
}
function onSignedIn(user,fresh){
  sbUser=user; var A=acct();
  if(A.id&&A.id!==user.id){ var nm=fresh?S.names[0]:""; S=blank(); if(nm) S.names[0]=nm; }  /* someone else used this phone before */
  A=acct(); A.id=user.id; A.email=user.email||A.email; A.signedIn=true; A.authMode="supabase"; delete A.tier; delete A.tierSource; delete A.serverTier;  /* tier now comes from the server (access.js) */
  setStatus("Syncing…");
  var pd=null;
  /* data_model says where this account's data lives: 1 = the user_state blob, 2 = per-record sync (WP3).
     An older database without the column means blob. */
  sb.from("profiles").select("display_name,is_admin,data_model").eq("id",user.id).maybeSingle().then(function(p){
    if(p&&p.error) return sb.from("profiles").select("display_name,is_admin").eq("id",user.id).maybeSingle();
    return p;
  }).then(function(p){
    pd=p&&p.data; sbDataModel=(pd&&pd.data_model)||0;
    if(sbDataModel===2) return storeStart(user,2);
    return blobLoad(user).then(function(){ if(sbDataModel===1) return storeStart(user,1); });
  }).then(function(){
    if(pd){ if(pd.display_name&&(!S.names[0]||S.names[0]==="You")) S.names[0]=pd.display_name; sbAdmin=!!pd.is_admin; }
    if(pd&&!pd.display_name) googleName(user);
    return refreshAccess();
  }).then(function(){ return deletionCheck(); })   /* asked to delete the account: keep it first, or sign out (WP8) */
  .then(function(){ return consentCheck(); })   /* then terms and privacy, if a version is owed (WP6) */
  .then(function(){ return healthStart(); })   /* injury notes from the health table, or ask about this phone's (WP9) */
  .catch(function(){}).then(function(){
    var sh=document.getElementById("onboard");
    if(!S.onboarded){ if(!(WZ&&WZ.ob)) resumeOnboarding(); else { sh.hidden=true; sh.innerHTML=""; } }
    else if(OB){ sh.hidden=true; sh.innerHTML=""; document.body.style.overflow=""; OB=null; }
    pickToday=true; renderAll(); setStatus(); checkReplies(); histInit(); evWeek2(user);
  });
}
/* signed up with Google: use the first name Google gave us (people can change it in Profile) */
function googleName(user){
  var m=(user&&user.user_metadata)||{}, n=String(m.given_name||m.full_name||m.name||"").trim().split(/\s+/)[0]||"";
  n=n.slice(0,40); if(!n) return;
  if(!S.names[0]||S.names[0]==="You"){ S.names[0]=n; if(typeof save==="function") save(); }
  sb.from("profiles").update({display_name:n}).eq("id",user.id).then(function(){},function(){});
}
/* the old one-blob sync: take the account copy if it is newer, else upload this phone's */
function blobLoad(user){
  return sb.from("user_state").select("data,client_ts").eq("user_id",user.id).maybeSingle().then(function(r){
    var row=r&&r.data, rd=row&&row.data, ok=rd&&rd.v===1&&rd.cur&&rd.last;
    /* a phone that hasn't finished setup takes the account copy, unless it has newer setup progress of its own */
    if(ok&&((+row.client_ts||0)>(S.ts||0)||(!S.onboarded&&(rd.onboarded||!S.ob)))){
      var keep=wout().slice();   /* workouts finished on this phone but not uploaded yet */
      S=rd; S.who=0; keep.forEach(function(w){ if(!wout().some(function(x){return x.id===w.id;})) wout().push(w); });
      S.account=Object.assign({},S.account||{},{id:user.id,email:user.email,signedIn:true,authMode:"supabase"});
      try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}
      sbOk=true;
    } else { save(); sbPush(true); }
  });
}
function sbQueue(){
  if(!sbUser) return;
  if(storeOn()){ storeChanged(); return; }
  if(sbDataModel===2) return;   /* moved to per-record sync: store.js picks the change up when it starts */
  sbDirty=true; clearTimeout(sbTimer); sbTimer=setTimeout(sbPush,800);
}
function sbPush(force){
  if(!sb||!sbUser||storeOn()||sbDataModel===2) return; if(force) sbDirty=true; if(sbBusy||!sbDirty) return;
  sbBusy=true; sbDirty=false; var snap=JSON.parse(JSON.stringify(S));
  sb.from("user_state").upsert({user_id:sbUser.id,data:snap,client_ts:snap.ts||Date.now()},{onConflict:"user_id"}).then(function(r){
    sbOk=!(r&&r.error); sbBusy=false; setStatus(); if(sbDirty){clearTimeout(sbTimer);sbTimer=setTimeout(sbPush,400);}
  },function(){ sbOk=false; sbBusy=false; sbDirty=true; setStatus(); });
}
document.addEventListener("visibilitychange",function(){ if(document.visibilityState==="hidden"&&sbDirty){clearTimeout(sbTimer);sbPush();} });
function webSignOut(){
  if(wout().length&&sbUser&&!webSignOut.tried){ webSignOut.tried=true; histFlush().then(webSignOut,webSignOut); return; }
  if(storeOn()&&!webSignOut.flushed){ webSignOut.flushed=true; var go=function(){ storeForget().then(webSignOut,webSignOut); }; storeFlush().then(go,go); return; }
  var done=function(){ try{localStorage.removeItem(KEY);}catch(e){} rcForget(); accessForget(); location.reload(); };
  if(sbDirty&&sbUser){ clearTimeout(sbTimer); sbBusy=false; sbPush(); setTimeout(function(){ sb.auth.signOut().then(done,done); },900); }
  else if(sb) sb.auth.signOut().then(done,done); else done();
}

