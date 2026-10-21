/* ---------- web mode: Supabase accounts and sync (GitHub Pages) ----------
   Used when the page runs outside Claude. The publishable key is meant to be public;
   row level security in the database keeps each person's data private. */
var SB_URL="https://zdllpjrkwcdmcuizxuum.supabase.co", SB_KEY="sb_publishable_MDB4dT4ybWlZk5rzdcx40w_G7KwYRtm";
var sb=null, sbUser=null, sbTimer=null, sbBusy=false, sbDirty=false, sbOk=false, sbOffline=false;
function webStart(){
  setStatus("Connecting…");
  if(window.supabase&&window.supabase.createClient){ webReady(); return; }
  var s=document.createElement("script"); s.src="vendor/supabase.js";
  s.onload=webReady;
  s.onerror=function(){ sbOffline=true; setStatus(); if(!acct().signedIn) openWebAuth("signup"); else toast("Offline. Your workouts save on this phone and sync later."); };
  document.head.appendChild(s);
}
function webReady(){
  try{ sb=window.supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}); }
  catch(e){ sbOffline=true; setStatus(); if(!acct().signedIn) openWebAuth("signup"); return; }
  sb.auth.onAuthStateChange(function(ev){ if(ev==="PASSWORD_RECOVERY") openWebAuth("newpass"); });
  sb.auth.getSession().then(function(r){
    var ses=r&&r.data&&r.data.session;
    if(ses&&ses.user) onSignedIn(ses.user);
    else openWebAuth(acct().signedIn?"signin":"signup");
  },function(){ sbOffline=true; setStatus(); if(!acct().signedIn) openWebAuth("signup"); });
}
function openWebAuth(mode){
  OB={step:"register",mode:mode||"signup",plan:"split5"};
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
  if(/fetch|network/i.test(m)) return "Can’t reach the server. Check your connection.";
  return m;
}
function webAuthHtml(){
  var m=OB.mode, h='<div class="obhero"><h1>'+({signup:"Welcome",signin:"Welcome back",check:"Check your email",reset:"Reset password",sent:"Check your email",newpass:"New password"}[m])+'</h1>';
  if(m==="signup"){
    h+='<p>Create your account to start testing the workout tracker.</p></div>'+obDots(1)+
      '<label class="bname"><span>Name</span><input id="obName" maxlength="40" autocomplete="name" placeholder="What should we call you?"></label>'+
      '<label class="bname"><span>Email</span><input id="obEmail" type="email" inputmode="email" autocomplete="email" maxlength="80" placeholder="you@example.com"></label>'+
      '<label class="bname"><span>Password</span><input id="obPass" type="password" autocomplete="new-password" minlength="6" maxlength="72" placeholder="At least 6 characters"></label>'+
      '<p class="wzerr" id="obErr" role="alert"></p><button class="primary" id="waSignup">Create account</button>'+
      '<p class="obfine">Already have an account? <button class="linkbtn" data-wamode="signin">Sign in</button></p>';
  } else if(m==="signin"){
    h+='<p>Sign in to load your plans and workouts.</p></div>'+
      '<label class="bname"><span>Email</span><input id="obEmail" type="email" inputmode="email" autocomplete="email" maxlength="80" value="'+esc(OB.email||acct().email||"")+'"></label>'+
      '<label class="bname"><span>Password</span><input id="obPass" type="password" autocomplete="current-password" maxlength="72"></label>'+
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
      '<label class="bname"><span>New password</span><input id="obPass" type="password" autocomplete="new-password" minlength="6" maxlength="72" placeholder="At least 6 characters"></label>'+
      '<p class="wzerr" id="obErr" role="alert"></p><button class="primary" id="waNewpass">Save new password</button>';
  }
  return h;
}
function waBusy(t,on,label){ t.disabled=on; t.textContent=on?"Please wait…":label; }
function webAuthClick(t){
  if(!OB||OB.step!=="register"||!WEB_MODE) return false;
  if(t.dataset.wamode){ var em=document.getElementById("obEmail"); if(em) OB.email=em.value.trim(); OB.mode=t.dataset.wamode; renderOnboard(); return true; }
  var err=document.getElementById("obErr"), v=function(id){var el=document.getElementById(id);return el?(el.value||"").trim():"";};
  var okEmail=function(e){return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);};
  if(!sb&&(t.id==="waSignup"||t.id==="waSignin"||t.id==="waReset"||t.id==="waNewpass")){ err.textContent="Can’t reach the server. Check your connection and reload."; return true; }
  if(t.id==="waSignup"){
    var n=v("obName"), e=v("obEmail"), p=document.getElementById("obPass").value;
    if(!okEmail(e)){err.textContent="Enter a valid email.";return true;}
    if(p.length<6){err.textContent="Use a password of at least 6 characters.";return true;}
    waBusy(t,true,"Create account"); OB.email=e;
    sb.auth.signUp({email:e,password:p,options:{data:{display_name:n},emailRedirectTo:location.origin+location.pathname}}).then(function(r){
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
    sb.auth.resetPasswordForEmail(e3,{redirectTo:location.origin+location.pathname}).then(function(r){
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
  A=acct(); A.id=user.id; A.email=user.email||A.email; A.signedIn=true; A.authMode="supabase";
  setStatus("Syncing…");
  sb.from("user_state").select("data,client_ts").eq("user_id",user.id).maybeSingle().then(function(r){
    var row=r&&r.data, rd=row&&row.data, ok=rd&&rd.v===1&&rd.cur&&rd.last;
    if(ok&&(!S.onboarded||(+row.client_ts||0)>(S.ts||0))){
      var keep=wout().slice();   /* workouts finished on this phone but not uploaded yet */
      S=rd; S.who=0; keep.forEach(function(w){ if(!wout().some(function(x){return x.id===w.id;})) wout().push(w); });
      S.account=Object.assign({},S.account||{},{id:user.id,email:user.email,signedIn:true,authMode:"supabase"});
      try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}
      sbOk=true;
    } else { save(); sbPush(true); }
    return sb.from("profiles").select("display_name,tier,is_admin").eq("id",user.id).maybeSingle();
  }).then(function(p){
    var pd=p&&p.data;
    if(pd){ if(pd.display_name&&(!S.names[0]||S.names[0]==="You")) S.names[0]=pd.display_name; acct().serverTier=pd.tier; sbAdmin=!!pd.is_admin; }
  }).catch(function(){}).then(function(){
    var sh=document.getElementById("onboard");
    if(!S.onboarded){ OB={step:"choose",plan:"split5"}; sh.hidden=false; document.body.style.overflow="hidden"; renderOnboard(); }
    else if(OB){ sh.hidden=true; sh.innerHTML=""; document.body.style.overflow=""; OB=null; }
    pickToday=true; renderAll(); setStatus(); checkReplies(); histInit();
  });
}
function sbQueue(){ if(!sbUser) return; sbDirty=true; clearTimeout(sbTimer); sbTimer=setTimeout(sbPush,800); }
function sbPush(force){
  if(!sb||!sbUser) return; if(force) sbDirty=true; if(sbBusy||!sbDirty) return;
  sbBusy=true; sbDirty=false; var snap=JSON.parse(JSON.stringify(S));
  sb.from("user_state").upsert({user_id:sbUser.id,data:snap,client_ts:snap.ts||Date.now()},{onConflict:"user_id"}).then(function(r){
    sbOk=!(r&&r.error); sbBusy=false; setStatus(); if(sbDirty){clearTimeout(sbTimer);sbTimer=setTimeout(sbPush,400);}
  },function(){ sbOk=false; sbBusy=false; sbDirty=true; setStatus(); });
}
document.addEventListener("visibilitychange",function(){ if(document.visibilityState==="hidden"&&sbDirty){clearTimeout(sbTimer);sbPush();} });
function webSignOut(){
  if(wout().length&&sbUser&&!webSignOut.tried){ webSignOut.tried=true; histFlush().then(webSignOut,webSignOut); return; }
  var done=function(){ try{localStorage.removeItem(KEY);}catch(e){} location.reload(); };
  if(sbDirty&&sbUser){ clearTimeout(sbTimer); sbBusy=false; sbPush(); setTimeout(function(){ sb.auth.signOut().then(done,done); },900); }
  else if(sb) sb.auth.signOut().then(done,done); else done();
}

