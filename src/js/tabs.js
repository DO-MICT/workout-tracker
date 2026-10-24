/* ---------- bottom tab bar: Plans · Stats · Workout · Gear · More ----------
   Each side tab opens its full-screen page; the big centre plate goes back to today's workout. */
var TAB_SVG={
  plans:'<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 3v4M16 3v4M4 10h16M8 14h3M8 17h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  stats:'<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V11M10 20V5M16 20v-6M21 20H3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  gear:'<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 9.5a3.5 3.5 0 1 1 7 0" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6.5 10h11l1.5 9.5a1 1 0 0 1-1 1.2H6a1 1 0 0 1-1-1.2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  more:'<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/></svg>',
  workout:'<svg width="56" height="56" viewBox="0 0 62 62" aria-hidden="true"><circle cx="31" cy="31" r="24" fill="none" stroke="currentColor" stroke-width="3"/><path d="M22 25v12M18 28v6M40 25v12M44 28v6M22 31h18" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>'
};
var TAB_ACTIVE="workout";
function renderTabbar(){
  var nav=document.getElementById("tabbar"); if(!nav) return;
  var side=function(id,label){return '<button class="tab" data-tab="'+id+'" aria-current="'+(TAB_ACTIVE===id?"page":"false")+'"><span class="tpill">'+TAB_SVG[id]+(id==="more"&&SG_UNREAD?'<i class="tdot" aria-label="New reply"></i>':'')+'</span>'+label+'</button>';};
  nav.innerHTML=side("plans","Plans")+side("stats","Stats")+
    '<button class="tab tcentre" data-tab="workout" aria-current="'+(TAB_ACTIVE==="workout"?"page":"false")+'"><span class="tplate">'+TAB_SVG.workout+'</span>Workout</button>'+
    side("gear","Gear")+side("more","More");
}
function tabSheetsOpen(){
  var vis=function(id){var el=document.getElementById(id);return el&&!el.hidden;};
  return {overlay:vis("onboard")||vis("wizard")||vis("builder")||vis("notesheet")||vis("donepop"),
    tab:vis("more")||vis("profile")||vis("sugg")||vis("feedback")?"more":vis("history")?"stats":vis("plans")?"plans":vis("equip")?"gear":"workout"};
}
function syncTabs(){
  var st=tabSheetsOpen();
  document.body.classList.toggle("tabs",!st.overlay);
  if(st.tab!==TAB_ACTIVE){TAB_ACTIVE=st.tab;renderTabbar();}
}
function closeTabSheets(){ closeMore(); closeProfile(); closeSugg(); closeFeedback(); closePlans(); closeHistory(); closeEquip(); }
function goTab(id){
  if(id===TAB_ACTIVE&&id!=="workout") return;
  closeTabSheets();
  if(id==="plans") openPlans();
  else if(id==="stats") openHistory();
  else if(id==="gear") openEquip();
  else if(id==="more") openMore();
  else window.scrollTo(0,0);
  syncTabs();
}

/* ---------- More page ---------- */
function openMore(){
  var sh=document.getElementById("more"); sh.hidden=false; document.body.style.overflow="hidden"; renderMore(); sh.scrollTop=0; sh.focus();
}
function closeMore(){ var sh=document.getElementById("more"); if(!sh||sh.hidden) return; sh.hidden=true; sh.innerHTML=""; document.body.style.overflow=""; }
function renderMore(){
  var sh=document.getElementById("more"); if(!sh||sh.hidden) return;
  var nm=S.names&&S.names[0]||"You", A=acct();
  var row=function(id,label,extra){return '<button class="mrow" id="'+id+'"><span>'+label+'</span>'+(extra||'')+'<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';};
  var h='<div class="sheet-in"><div class="sheet-top"><h2 id="mtitle">More</h2></div>'+
    '<button class="mprof" id="openProfile"><span class="mav" aria-hidden="true">'+esc(nm.charAt(0).toUpperCase())+'</span><span class="mpt"><b>'+esc(nm)+'</b><span>'+esc(A.email||"Profile, rest timer and backup")+'</span></span><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'+
    '<div class="mlist">'+row("openMeasure","Capture measurements")+
    (WEB_MODE?row("openSugg","Suggestions",SG_UNREAD?'<span class="replytag">'+SG_UNREAD+' new repl'+(SG_UNREAD>1?'ies':'y')+'</span>':''):'')+
    (WEB_MODE&&sbAdmin?row("openFeedback","Feedback",'<span class="admtag">Admin</span>'):'')+'</div>'+
    '<div class="mlist mtheme"><span>Appearance</span><div class="seg" role="group" aria-label="Appearance">'+
    [["auto","Auto"],["light","Light"],["dark","Dark"]].map(function(o){return '<button data-themeset="'+o[0]+'" aria-pressed="'+(themePref()===o[0])+'">'+o[1]+'</button>';}).join("")+'</div></div>'+
    (WEB_MODE&&sbUser?'<button class="ghost msignout" id="signOut">Sign out</button>':'')+
    '</div>';
  sh.innerHTML=h;
}
/* straight to the measurements form on the profile page */
function openMeasure(){
  closeTabSheets(); openProfile();
  var sec=document.getElementById("pMeas"), sh=document.getElementById("profile");
  if(sec&&sh){ sh.scrollTop=Math.max(0,sec.offsetTop-12); var f=sh.querySelector('input[data-pf="weight"]'); if(f) f.focus({preventScroll:true}); }
}
function tabsClick(t){
  if(t.dataset.tab){goTab(t.dataset.tab);return true;}
  if(t.id==="openMeasure"){openMeasure();return true;}
  if(t.id==="openProfile"&&!document.getElementById("more").hidden){closeMore();openProfile();return true;}
  if(t.id==="openSugg"||t.id==="openFeedback"){closeMore();return false;}
  return false;
}
(function initTabs(){
  renderTabbar();
  var watch=["onboard","wizard","builder","notesheet","donepop","more","profile","sugg","feedback","history","plans","equip"];
  if(window.MutationObserver){
    var mo=new MutationObserver(function(){syncTabs();});
    watch.forEach(function(id){var el=document.getElementById(id); if(el) mo.observe(el,{attributes:true,attributeFilter:["hidden"]});});
  }
  syncTabs();
})();
