/* ---------- suggestions (web version): text + optional screenshot, saved to Supabase ---------- */
var APP_VERSION="2026.10.21";
var SG=null; /* {kind, msg, blob, url, sending, sent, past, err, seenBefore} */
var SG_UNREAD=0;
/* count replies the tester hasn't seen yet (shows a dot on the menu) */
function checkReplies(){
  if(!sb||!sbUser) return;
  sb.from("suggestions").select("user_id,replied_at").eq("user_id",sbUser.id).order("created_at",{ascending:false}).limit(50).then(function(r){
    var seen=S.sgSeen||"", n=((r&&r.data)||[]).filter(function(x){return x.user_id===sbUser.id&&x.replied_at&&x.replied_at>seen;}).length;
    if(n!==SG_UNREAD){SG_UNREAD=n;renderWho();}
  },function(){});
}
document.addEventListener("visibilitychange",function(){ if(document.visibilityState==="visible"&&sbUser) checkReplies(); });
var SG_KINDS=[["idea","Idea"],["bug","Something’s wrong"],["other","Other"]];
var SG_STATUS={new:"Sent",seen:"Seen",planned:"Planned",done:"Done",wont_do:"Not planned"};
function openSugg(){
  SG={kind:"idea",msg:"",blob:null,url:"",sending:false,sent:false,past:null,err:"",seenBefore:S.sgSeen||""};
  var sh=document.getElementById("sugg"); sh.hidden=false; document.body.style.overflow="hidden"; renderSugg(); sh.scrollTop=0; sh.focus();
  loadPastSugg();
}
function closeSugg(){
  var sh=document.getElementById("sugg"); if(!sh||sh.hidden) return;
  if(SG&&SG.url) URL.revokeObjectURL(SG.url);
  sh.hidden=true; sh.innerHTML=""; document.body.style.overflow=""; SG=null;
  var b=document.getElementById("menuBtn"); if(b) b.focus();
}
function loadPastSugg(){
  if(!sb||!sbUser) return;
  sb.from("suggestions").select("id,kind,message,status,created_at,screenshot_path,admin_reply,replied_at").eq("user_id",sbUser.id).order("created_at",{ascending:false}).limit(20).then(function(r){
    if(!SG) return; SG.past=(r&&r.data)||[]; renderSugg(true);
    S.sgSeen=new Date().toISOString(); SG_UNREAD=0; save(); renderWho();
  },function(){ if(SG){SG.past=[];renderSugg(true);} });
}
function renderSugg(keepScroll){
  var sh=document.getElementById("sugg"); if(!sh||!SG) return;
  var st=sh.scrollTop, h='<div class="sheet-in"><div class="sheet-top"><h2 id="sgtitle">Suggestions</h2><button class="chip" id="closeSugg">Close</button></div>';
  if(!sbUser){
    h+='<p class="sub">Sign in to send suggestions.</p>';
  } else if(SG.sent){
    h+='<div class="sgdone">'+OK_SVG+'<div><b>Thanks, it’s sent.</b><p>Every suggestion gets read. You can see its status below.</p></div></div><button class="primary" id="sgAgain">Send another</button>';
  } else {
    h+='<p class="sub">Found a problem or have an idea? Tell us what you’d change. A screenshot helps.</p>'+
      '<div class="locchips sgkinds" role="radiogroup" aria-label="Type of suggestion">'+SG_KINDS.map(function(k){return '<button class="chip sm" role="radio" data-sgkind="'+k[0]+'" aria-checked="'+(SG.kind===k[0])+'" aria-pressed="'+(SG.kind===k[0])+'">'+k[1]+'</button>';}).join("")+'</div>'+
      '<label class="bname"><span>Your suggestion</span><textarea id="sgMsg" rows="6" maxlength="2000" placeholder="'+(SG.kind==="bug"?"What happened, and what did you expect? Which screen were you on?":"What would make the app better for you?")+'">'+esc(SG.msg)+'</textarea><em id="sgCount">'+SG.msg.length+' / 2000</em></label>'+
      '<div class="sgshot">'+(SG.url?'<img src="'+SG.url+'" alt="Screenshot to send"><button class="chip sm" id="sgRemove">Remove screenshot</button>':'<button class="ghost sgadd" id="sgPick">'+CAM_SVG+'<span>Add a screenshot</span></button>')+
      '<input type="file" id="sgFile" accept="image/*" hidden></div>'+
      '<p class="wzerr" id="sgErr" role="alert">'+esc(SG.err)+'</p>'+
      '<button class="primary" id="sgSend"'+(SG.sending?' disabled':'')+'>'+(SG.sending?'Sending…':'Send suggestion')+'</button>';
  }
  if(sbUser){
    h+='<h3 class="psec">Your suggestions</h3>';
    if(SG.past===null) h+='<p class="eqempty">Loading…</p>';
    else if(!SG.past.length) h+='<p class="eqempty">Nothing sent yet.</p>';
    else h+='<ul class="sglist">'+SG.past.map(function(s){
      var d=new Date(s.created_at), kn=(SG_KINDS.filter(function(k){return k[0]===s.kind;})[0]||["","Other"])[1];
      var rd=s.replied_at?new Date(s.replied_at):null, isNew=s.admin_reply&&s.replied_at&&(!SG.seenBefore||s.replied_at>SG.seenBefore);
      return '<li><div class="sgmeta"><span>'+(isNaN(d)?"":d.toLocaleDateString(undefined,{day:"numeric",month:"short"}))+' · '+esc(kn)+(s.screenshot_path?' · with screenshot':'')+'</span><b class="sgst st-'+esc(s.status)+'">'+esc(SG_STATUS[s.status]||s.status)+'</b></div><p>'+esc(s.message)+'</p>'+
        (s.admin_reply?'<div class="sgreply"><div><b>Reply from the team</b>'+(isNew?'<span class="newtag">New</span>':'')+'<span>'+(rd&&!isNaN(rd)?rd.toLocaleDateString(undefined,{day:"numeric",month:"short"}):'')+'</span></div><p>'+esc(s.admin_reply)+'</p></div>':'')+'</li>';
    }).join("")+'</ul>';
  }
  sh.innerHTML=h+'</div>'; if(keepScroll) sh.scrollTop=st;
}
var CAM_SVG='<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="10" r="2" fill="currentColor"/><path d="M4 18l5-5 4 4 3-3 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
/* shrink big phone screenshots before upload (max 1600px, JPEG) so they send quickly */
function shrinkImage(file){
  return new Promise(function(res){
    var url=URL.createObjectURL(file), img=new Image();
    img.onload=function(){
      var max=1600, w=img.naturalWidth, h=img.naturalHeight, k=Math.min(1,max/Math.max(w,h));
      var c=document.createElement("canvas"); c.width=Math.round(w*k); c.height=Math.round(h*k);
      c.getContext("2d").drawImage(img,0,0,c.width,c.height); URL.revokeObjectURL(url);
      c.toBlob(function(b){res(b||null);},"image/jpeg",0.82);
    };
    img.onerror=function(){URL.revokeObjectURL(url);res(null);};
    img.src=url;
  });
}
function suggClick(t){
  if(!SG) return false;
  if(t.id==="closeSugg"){closeSugg();return true;}
  if(t.dataset.sgkind){var m=document.getElementById("sgMsg"); if(m) SG.msg=m.value; SG.kind=t.dataset.sgkind; renderSugg(true); var b=document.querySelector('[data-sgkind="'+SG.kind+'"]'); if(b) b.focus(); return true;}
  if(t.id==="sgPick"){var f=document.getElementById("sgFile"); if(f) f.click(); return true;}
  if(t.id==="sgRemove"){var m2=document.getElementById("sgMsg"); if(m2) SG.msg=m2.value; if(SG.url) URL.revokeObjectURL(SG.url); SG.blob=null; SG.url=""; renderSugg(true); return true;}
  if(t.id==="sgAgain"){SG.sent=false; SG.msg=""; SG.err=""; renderSugg(); return true;}
  if(t.id==="sgSend"){
    var msg=(document.getElementById("sgMsg").value||"").trim(); SG.msg=msg;
    if(msg.length<3){SG.err="Tell us a little about your suggestion first."; renderSugg(true); document.getElementById("sgMsg").focus(); return true;}
    if(!sb||!sbUser){SG.err="You’re offline. Try again when you’re connected."; renderSugg(true); return true;}
    SG.sending=true; SG.err=""; renderSugg(true);
    var path=null, up=Promise.resolve({error:null});
    if(SG.blob){ var ct=SG.blob.type||"image/jpeg", ext={"image/png":"png","image/webp":"webp","image/heic":"heic","image/heif":"heif"}[ct]||"jpg"; path=sbUser.id+"/"+Date.now()+"-"+Math.random().toString(36).slice(2,8)+"."+ext; up=sb.storage.from("suggestions").upload(path,SG.blob,{contentType:ct,upsert:false}); }
    up.then(function(r){
      if(r&&r.error) throw r.error;
      var d=DAYS[day]||{};
      return sb.from("suggestions").insert({kind:SG.kind,message:msg,screenshot_path:path,
        context:{plan:activePlan().name,day:weekLong(d.id||""),workout:d.title||"",version:APP_VERSION,screen:innerWidth+"x"+innerHeight,ua:(navigator.userAgent||"").slice(0,160)}});
    }).then(function(r){
      if(r&&r.error) throw r.error;
      if(!SG) return; if(SG.url) URL.revokeObjectURL(SG.url);
      SG.sending=false; SG.sent=true; SG.blob=null; SG.url=""; SG.msg=""; SG.past=null; renderSugg(); loadPastSugg(); toast("Suggestion sent");
    }).catch(function(e){
      if(!SG) return; SG.sending=false;
      SG.err=/size|large/i.test((e&&e.message)||"")?"That screenshot is too big. Try a smaller one.":"Couldn’t send that. Check your connection and try again.";
      renderSugg(true);
    });
    return true;
  }
  return false;
}
document.addEventListener("change",function(e){
  if(e.target.id!=="sgFile"||!SG) return;
  var f=e.target.files&&e.target.files[0]; if(!f) return;
  var m=document.getElementById("sgMsg"); if(m) SG.msg=m.value;
  if(!/^image\//.test(f.type||"image/")){SG.err="Pick an image file.";renderSugg(true);return;}
  shrinkImage(f).then(function(b){
    if(!SG) return;
    if(!b){ if(f.size>5*1024*1024){SG.err="That image is too big. Try a screenshot under 5 MB.";renderSugg(true);return;} b=f; }
    if(SG.url) URL.revokeObjectURL(SG.url);
    SG.blob=b; SG.url=URL.createObjectURL(b); SG.err=""; renderSugg(true);
  });
});
document.addEventListener("input",function(e){
  if(e.target.id==="sgMsg"&&SG){SG.msg=e.target.value; var c=document.getElementById("sgCount"); if(c) c.textContent=e.target.value.length+" / 2000";}
});
/* ---------- Feedback (admins only): every tester's suggestions, with screenshots and status ----------
   The menu item only shows for admins, and the database only returns other people's rows to admins. */
var sbAdmin=false, FB=null;
var FB_FILTERS=[["new","New"],["seen","Seen"],["planned","Planned"],["done","Done"],["wont_do","Not planned"],["all","All"]];
function openFeedback(){
  FB={filter:"new",rows:null,who:{},urls:{},view:null,err:"",edit:{},draft:{},busy:{}};
  var sh=document.getElementById("feedback"); sh.hidden=false; document.body.style.overflow="hidden"; renderFeedback(); sh.scrollTop=0; sh.focus();
  loadFeedback();
}
function closeFeedback(){
  var sh=document.getElementById("feedback"); if(!sh||sh.hidden) return;
  sh.hidden=true; sh.innerHTML=""; document.body.style.overflow=""; FB=null;
  var b=document.getElementById("menuBtn"); if(b) b.focus();
}
function loadFeedback(){
  if(!sb||!sbUser){ if(FB){FB.rows=[];FB.err="Sign in to see feedback.";renderFeedback(true);} return; }
  sb.from("suggestions").select("id,user_id,kind,message,screenshot_path,context,status,created_at,admin_reply,replied_at").order("created_at",{ascending:false}).limit(300).then(function(r){
    if(!FB) return; if(r&&r.error) throw r.error;
    FB.rows=(r&&r.data)||[]; renderFeedback(true);
    var ids=FB.rows.map(function(x){return x.user_id;}).filter(function(v,i,a){return a.indexOf(v)===i;});
    var paths=FB.rows.map(function(x){return x.screenshot_path;}).filter(Boolean);
    var pw=ids.length?sb.from("profiles").select("id,display_name,email").in("id",ids):Promise.resolve({data:[]});
    var uw=paths.length?sb.storage.from("suggestions").createSignedUrls(paths,3600):Promise.resolve({data:[]});
    return Promise.all([pw,uw]);
  }).then(function(res){
    if(!FB||!res) return;
    ((res[0]&&res[0].data)||[]).forEach(function(p){FB.who[p.id]=p;});
    ((res[1]&&res[1].data)||[]).forEach(function(u){if(u&&u.path&&u.signedUrl) FB.urls[u.path]=u.signedUrl;});
    renderFeedback(true);
  }).catch(function(){ if(FB){FB.rows=FB.rows||[];FB.err="Couldn’t load feedback. Check your connection and try again.";renderFeedback(true);} });
}
function renderFeedback(keepScroll){
  var sh=document.getElementById("feedback"); if(!sh||!FB) return;
  var st=sh.scrollTop, rows=FB.rows||[], cnt={all:rows.length};
  rows.forEach(function(x){cnt[x.status]=(cnt[x.status]||0)+1;});
  var h='<div class="sheet-in"><div class="sheet-top"><h2 id="fbtitle">Feedback</h2><button class="chip" id="closeFeedback">Close</button></div>'+
    '<p class="sub">Suggestions from all testers. Changing the status updates what the tester sees. <button class="linkbtn" id="fbRefresh">Refresh</button></p>'+
    '<div class="locchips fbfilters" role="group" aria-label="Filter by status">'+FB_FILTERS.map(function(f){return '<button class="chip sm" data-fbfilter="'+f[0]+'" aria-pressed="'+(FB.filter===f[0])+'">'+f[1]+' <span class="lcnt">'+(cnt[f[0]]||0)+'</span></button>';}).join("")+'</div>';
  if(FB.err) h+='<p class="wzerr" role="alert">'+esc(FB.err)+'</p>';
  if(FB.rows===null) h+='<p class="eqempty">Loading…</p>';
  else {
    var list=rows.filter(function(x){return FB.filter==="all"||x.status===FB.filter;});
    if(!list.length) h+='<p class="eqempty">'+(rows.length?'Nothing with this status.':'No suggestions yet.')+'</p>';
    h+='<div class="fblist">'+list.map(function(x){
      var p=FB.who[x.user_id]||{}, d=new Date(x.created_at), c=x.context||{}, kn=(SG_KINDS.filter(function(k){return k[0]===x.kind;})[0]||["","Other"])[1];
      var dev=/iPhone|iPad/.test(c.ua||"")?"iPhone":/Android/.test(c.ua||"")?"Android":/Mac|Windows|Linux/.test(c.ua||"")?"Computer":"";
      var ctx=[c.plan,c.day&&(c.day+(c.workout?" ("+c.workout+")":"")),dev,c.version&&("v"+c.version)].filter(Boolean).join(" · ");
      var url=x.screenshot_path&&FB.urls[x.screenshot_path];
      return '<article class="fbcard"><div class="fbhead"><div><b>'+esc(p.display_name||"Tester")+'</b><span>'+esc(p.email||"")+'</span></div><span class="fbkind k-'+esc(x.kind)+'">'+esc(kn)+'</span></div>'+
        '<p class="fbmsg">'+esc(x.message)+'</p>'+
        (x.screenshot_path?(url?'<button class="fbshot" data-fbview="'+esc(x.screenshot_path)+'" aria-label="View screenshot full size"><img src="'+esc(url)+'" alt="Screenshot from '+esc(p.display_name||"tester")+'" loading="lazy"></button>':'<p class="eqempty">Loading screenshot…</p>'):'')+
        '<p class="fbctx">'+(isNaN(d)?"":d.toLocaleString(undefined,{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}))+(ctx?' · '+esc(ctx):'')+'</p>'+
        fbReplyHtml(x)+
        '<label class="fbstatus"><span>Status</span><select data-fbstatus="'+esc(x.id)+'">'+FB_FILTERS.filter(function(f){return f[0]!=="all";}).map(function(f){return '<option value="'+f[0]+'"'+(x.status===f[0]?' selected':'')+'>'+f[1]+'</option>';}).join("")+'</select></label></article>';
    }).join("")+'</div>';
  }
  if(FB.view) h+='<div class="fbview" role="dialog" aria-label="Screenshot"><button class="chip fbclose" id="fbViewClose">Close</button><img src="'+esc(FB.urls[FB.view]||"")+'" alt="Screenshot full size"><a class="linkbtn" href="'+esc(FB.urls[FB.view]||"")+'" target="_blank" rel="noopener">Open in new tab</a></div>';
  sh.innerHTML=h+'</div>'; if(keepScroll) sh.scrollTop=st;
}
function fbReplyHtml(x){
  var rd=x.replied_at?new Date(x.replied_at):null;
  if(x.admin_reply&&!FB.edit[x.id]) return '<div class="sgreply mine"><div><b>Your reply</b><span>'+(rd&&!isNaN(rd)?rd.toLocaleString(undefined,{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):'')+'</span></div><p>'+esc(x.admin_reply)+'</p><button class="linkbtn" data-fbedit="'+esc(x.id)+'">Edit reply</button></div>';
  var v=FB.draft[x.id]!==undefined?FB.draft[x.id]:(x.admin_reply||"");
  return '<div class="fbreply"><label><span>'+(x.admin_reply?'Edit your reply':'Reply to '+esc((FB.who[x.user_id]||{}).display_name||'tester'))+'</span><textarea rows="3" maxlength="2000" data-fbdraft="'+esc(x.id)+'" placeholder="The tester sees this under their suggestion.">'+esc(v)+'</textarea></label>'+
    '<div class="fbrbtns">'+(x.admin_reply?'<button class="chip sm" data-fbcancel="'+esc(x.id)+'">Cancel</button><button class="chip sm danger" data-fbclear="'+esc(x.id)+'">Remove reply</button>':'')+
    '<button class="chip sm primarychip" data-fbsend="'+esc(x.id)+'"'+(FB.busy[x.id]?' disabled':'')+'>'+(FB.busy[x.id]?'Sending…':(x.admin_reply?'Save reply':'Send reply'))+'</button></div></div>';
}
function fbSaveReply(id,text){
  var row=(FB.rows||[]).filter(function(x){return x.id===id;})[0]; if(!row) return;
  var vals={admin_reply:text}; if(text&&row.status==="new") vals.status="seen";
  FB.busy[id]=true; renderFeedback(true);
  sb.from("suggestions").update(vals).eq("id",id).then(function(r){
    if(r&&r.error) throw r.error;
    row.admin_reply=text||null; row.replied_at=text?new Date().toISOString():null; if(vals.status) row.status=vals.status;
    delete FB.busy[id]; delete FB.edit[id]; delete FB.draft[id]; renderFeedback(true); toast(text?"Reply sent":"Reply removed");
  }).catch(function(){ delete FB.busy[id]; if(FB) renderFeedback(true); toast("Couldn’t save the reply. Try again"); });
}
function feedbackClick(t){
  if(!FB) return false;
  if(t.id==="closeFeedback"){closeFeedback();return true;}
  if(t.id==="fbRefresh"){FB.rows=null;FB.err="";renderFeedback(true);loadFeedback();return true;}
  if(t.dataset.fbfilter){FB.filter=t.dataset.fbfilter;renderFeedback(true);var b=document.querySelector('[data-fbfilter="'+FB.filter+'"]');if(b)b.focus();return true;}
  if(t.dataset.fbview){FB.view=t.dataset.fbview;renderFeedback(true);var c=document.getElementById("fbViewClose");if(c)c.focus();return true;}
  if(t.id==="fbViewClose"){FB.view=null;renderFeedback(true);return true;}
  if(t.dataset.fbedit){FB.edit[t.dataset.fbedit]=true;renderFeedback(true);var ta=document.querySelector('[data-fbdraft="'+t.dataset.fbedit+'"]');if(ta){ta.focus();ta.setSelectionRange(ta.value.length,ta.value.length);}return true;}
  if(t.dataset.fbcancel){delete FB.edit[t.dataset.fbcancel];delete FB.draft[t.dataset.fbcancel];renderFeedback(true);return true;}
  if(t.dataset.fbsend){var tx=document.querySelector('[data-fbdraft="'+t.dataset.fbsend+'"]'), v=(tx&&tx.value||"").trim(); if(!v){toast("Write a reply first");if(tx)tx.focus();return true;} fbSaveReply(t.dataset.fbsend,v); return true;}
  if(t.dataset.fbclear){if(!confirmTap(t,"Remove reply","Tap again to remove")) return true; fbSaveReply(t.dataset.fbclear,""); return true;}
  return false;
}
document.addEventListener("input",function(e){ var id=e.target.dataset&&e.target.dataset.fbdraft; if(id&&FB) FB.draft[id]=e.target.value; });
document.addEventListener("change",function(e){
  var id=e.target.dataset&&e.target.dataset.fbstatus; if(!id||!FB||!sb) return;
  var row=(FB.rows||[]).filter(function(x){return x.id===id;})[0]; if(!row) return;
  var was=row.status, now=e.target.value; row.status=now;
  sb.from("suggestions").update({status:now}).eq("id",id).then(function(r){
    if(r&&r.error) throw r.error; toast("Marked "+(FB_FILTERS.filter(function(f){return f[0]===now;})[0]||[,now])[1].toLowerCase());
    if(FB) renderFeedback(true);
  }).catch(function(){ row.status=was; if(FB) renderFeedback(true); toast("Couldn’t update. Try again"); });
});
