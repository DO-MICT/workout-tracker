/* ---------- body measurements: swipe-card check-in, progress, goals and reminders ----------
   Data lives on the profile: S.profile.hist = [{d:ISO, v:{key:"80.6",...}}] (one entry per check-in),
   S.profile.vals = latest value of each key. Keys stay stable: the single-side keys (uarm, larm, thighs,
   calves) are the right side, and the left side adds "L" (uarmL...).
   Settings: S.profile.mset {off:{key:1}, lr, tips}, remind {weigh:days, tape:days}, goals {key:{t, by}},
   mapSel [keys on the body map], msSnooze (day the due card was put off until). */
var MS_SPOTS=[["weight","Weight","kg"],["neck","Neck","cm"],["chest","Chest","cm"],["waist","Waist","cm"],["abd","Abdomen","cm"],
  ["hips","Hips","cm"],["glutes","Glutes","cm"],["uarm","Upper arm","cm",1,"Upper arms"],["larm","Forearm","cm",1,"Forearms"],["thighs","Thigh","cm",1,"Thighs"],["calves","Calf","cm",1,"Calves"]];
var MS_DEF={weight:75,height:175,neck:38,chest:100,waist:85,abd:90,hips:100,glutes:100,uarm:33,larm:28,thighs:56,calves:37};
var MS_TIP={weight:"Step on the scale first thing in the morning, before you eat or drink.",
  height:"Stand straight against a wall, heels together, no shoes.",
  neck:"Just below the Adam's apple. Look straight ahead and keep the tape level.",
  chest:"Across the nipples and under the armpits. Arms relaxed, breathe out normally.",
  waist:"The narrowest point, just above your belly button. Breathe out, tape snug but not tight.",
  abd:"Around your belly button. Stand relaxed and don't pull in.",
  hips:"Across the top of your hip bones, feet together.",
  glutes:"Around the widest part of your bottom, feet together.",
  uarm:"Arm relaxed at your side. Halfway between shoulder and elbow.",
  larm:"The widest part of the forearm, just below the elbow, hand open.",
  thighs:"Just below the buttock crease, weight on both feet.",
  calves:"The widest part of the calf, standing with weight on both feet."};
/* tape bands on the anatomy figure: [cx, cy, rx, ry, rotate]; the figure faces you, so the right side is on the left */
var MS_BAND={neck:[0,38,9.5,2.6,0],chest:[0,69.5,36.5,6,0],waist:[0,109.5,29,4.8,0],abd:[0,124.5,31.5,5,0],hips:[0,142,34,5.5,0],glutes:[0,154,34.5,5.5,0],
  uarm:[-64.5,58.8,7.4,2.4,90],uarmL:[64.5,58.8,7.4,2.4,-90],larm:[-102,57.5,7.6,2.4,90],larmL:[102,57.5,7.6,2.4,-90],
  thighs:[-18.8,167,14.6,3.6,0],thighsL:[18.8,167,14.6,3.6,0],calves:[-14.3,222,9.6,2.6,0],calvesL:[14.3,222,9.6,2.6,0]};
var MS_CROP={weight:"-110 -8 220 300",height:"-110 -8 220 300",neck:"-36 14 72 48",chest:"-62 38 124 82",waist:"-62 72 124 82",abd:"-62 86 124 82",hips:"-62 104 124 82",glutes:"-62 116 124 82",
  uarm:"-112 30 100 66",uarmL:"12 30 100 66",larm:"-148 30 100 66",larmL:"48 30 100 66",thighs:"-72 132 106 70",thighsL:"-34 132 106 70",calves:"-68 188 106 70",calvesL:"-38 188 106 70"};
/* body map tags: [dotX, dotY, tagX, tagY, tag to the left] */
var MS_TAG={neck:[0,38,16,22,0],chest:[-26,69.5,-36,92,1],waist:[24,109.5,36,104,0],abd:[-27,124.5,-36,124,1],hips:[30,142,36,140,0],glutes:[-31,154,-36,158,1],
  uarm:[-64.5,52,-46,30,1],uarmL:[64.5,52,46,30,0],larm:[-100,52,-84,30,1],larmL:[100,52,84,30,0],
  thighs:[-26,167,-36,190,1],thighsL:[26,167,36,180,0],calves:[-18,222,-28,244,1],calvesL:[18,222,28,244,0]};
var MS_REMIND={weigh:[[0,"Off"],[7,"Weekly"],[14,"Every 2 weeks"],[28,"Every 4 weeks"]],tape:[[0,"Off"],[14,"Every 2 weeks"],[28,"Every 4 weeks"],[84,"Every 12 weeks"]]};

function msCfg(){
  var P=prof();
  if(!P.mset||typeof P.mset!=="object") P.mset={off:{},lr:true,tips:true};
  if(!P.mset.off) P.mset.off={};
  if(!P.remind) P.remind={weigh:7,tape:28};
  if(!P.goals) P.goals={};
  if(!P.mapSel) P.mapSel=["waist","chest","uarm"];
  return P;
}
function msSpot(k){var b=k.replace(/L$/,"");for(var i=0;i<MS_SPOTS.length;i++)if(MS_SPOTS[i][0]===b)return MS_SPOTS[i];return k==="height"?["height","Height","cm"]:null;}
function msUnit(k){var s=msSpot(k);return s?(s[2]==="kg"?U():s[2]):"cm";}
/* body weight is kept in kg (WP4). With lb picked, the screens below work in lb: msSeries and msGoal convert
   on the way in, msStore on the way out (kg to 2 decimals, so a weight typed to 0.1 lb comes back the same). */
function msLb(k){return k==="weight"&&U()==="lb";}
function msStore(k,v){return msLb(k)?String(Math.round(v*GFDRules.KG_PER_LB*100)/100):msFmt(v);}
function msShown(k,kg){return msLb(k)?kg/GFDRules.KG_PER_LB:kg;}
function msGoal(k){var g=msCfg().goals[k];return g?{t:msShown(k,+g.t),by:g.by}:null;}
function msMax(k){return msLb(k)?1100:500;}
function msIsLeft(k){return /L$/.test(k)&&!!MS_BAND[k];}
function msSide(k){var s=msSpot(k);if(!s||!s[3]||!msCfg().mset.lr)return "";return msIsLeft(k)?"Left":"Right";}
function msName(k,short){var s=msSpot(k),sd=msSide(k);if(!s)return k;return s[1]+(sd?(short?" "+sd.charAt(0):" · "+sd):"");}
/* every key that's tracked, in check-in order */
function msKeys(){
  var C=msCfg().mset, out=[];
  MS_SPOTS.forEach(function(s){ if(C.off[s[0]]) return; out.push(s[0]); if(s[3]&&C.lr) out.push(s[0]+"L"); });
  return out;
}
function msNum(x){var n=parseFloat(x);return isFinite(n)?n:null;}
/* [{t:Date, v:number, e:entry}] oldest first */
function msSeries(k){
  var out=[]; prof().hist.forEach(function(e){var n=e&&e.v?msNum(e.v[k]):null; if(n!=null) out.push({t:new Date(e.d),v:msShown(k,n),e:e});});
  out.sort(function(a,b){return a.t-b.t;}); return out;
}
function msLatest(k){var s=msSeries(k);return s.length?s[s.length-1]:null;}
function msGood(k,d){var g=msGoal(k),s=msSeries(k);if(!d)return true;
  if(g&&s.length){return (g.t-s[0].v)*d>0;} return k==="weight"||k==="waist"||k==="abd"||k==="hips"?d<0:d>0;}
function msFmt(n){return (Math.round(n*10)/10).toFixed(1);}
function msDelta(a,b){var d=Math.round((a-b)*10)/10;return (d>0?"+":d<0?"−":"±")+Math.abs(d).toFixed(1);}
function msDaysSince(d){return Math.floor((Date.now()-new Date(d).getTime())/864e5);}

/* ---------- the figure (loaded on first use, ~110 KB) ---------- */
var MS_FIG_STATE=0; /* 0 not loaded, 1 loading, 2 ready */
function msFigLoad(cb){
  if(MS_FIG_STATE===2||window.GFD_BODY_FIG){msFigMount();cb&&cb();return;}
  if(MS_FIG_STATE===1){msFigLoad.q=(msFigLoad.q||[]).concat(cb||[]);return;}
  MS_FIG_STATE=1; msFigLoad.q=cb?[cb]:[];
  var s=document.createElement("script"); s.src="src/js/gfd-body-fig.js";
  var done=function(){msFigMount();var q=msFigLoad.q||[];msFigLoad.q=[];q.forEach(function(f){f();});};
  s.onload=done; s.onerror=function(){MS_FIG_STATE=0;done();}; document.head.appendChild(s);
}
/* also called when the colour theme changes: the figure is drawn in GFD colours and recoloured by artTint (exart.js) */
function msFigMount(){
  if(!window.GFD_BODY_FIG) return;
  var pal=document.documentElement.getAttribute("data-palette")||"", old=document.getElementById("msFigDefs");
  if(old){ if(old.dataset.pal===pal) return; old.remove(); }
  var fig=window.GFD_BODY_FIG, cut=fig.indexOf('<symbol id="msFigD"');
  if(pal&&window.ART_PAL&&ART_PAL[pal]&&cut>0) fig=artTint(fig.slice(0,cut),"light-"+pal)+artTint(fig.slice(cut),"dark-"+pal);
  var d=document.createElement("div"); d.id="msFigDefs"; d.setAttribute("aria-hidden","true"); d.dataset.pal=pal;
  d.innerHTML='<svg width="0" height="0" style="position:absolute"><defs><filter id="msGlow" x="-60%" y="-300%" width="220%" height="700%"><feGaussianBlur stdDeviation="3"/></filter>'+fig+'</defs></svg>';
  document.body.appendChild(d); MS_FIG_STATE=2;
}
function msBand(k,strong){
  var b=MS_BAND[k]; if(!b) return "";
  var cx=b[0],cy=b[1],rx=b[2],ry=b[3];
  var g='<g transform="rotate('+b[4]+' '+cx+' '+cy+')">';
  if(strong) g+='<ellipse class="ms-glow" cx="'+cx+'" cy="'+cy+'" rx="'+(rx+5)+'" ry="'+(ry+4)+'" filter="url(#msGlow)"/>';
  g+='<path class="ms-bandb" style="stroke-width:'+(strong?1.6:1.2)+'" d="M'+(cx-rx)+','+cy+' A'+rx+' '+ry+' 0 0 1 '+(cx+rx)+','+cy+'"/>';
  g+='<path class="ms-bandf'+(strong?'':' soft')+'" style="stroke-width:'+(strong?2.6:1.8)+'" d="M'+(cx-rx)+','+cy+' A'+rx+' '+ry+' 0 0 0 '+(cx+rx)+','+cy+'"/>';
  return g+'</g>';
}
function msFig(o){
  o=o||{};
  var s='<svg class="ms-fig" viewBox="'+(o.vb||"-152 -8 304 300")+'" preserveAspectRatio="xMidYMid meet" aria-hidden="true">'+
    '<use class="ms-uL" href="#msFigL" x="-152" y="-8" width="304" height="300"/><use class="ms-uD" href="#msFigD" x="-152" y="-8" width="304" height="300"/>';
  (o.soft||[]).forEach(function(k){s+=msBand(k,false);});
  (o.hi||[]).forEach(function(k){s+=msBand(k,true);});
  return s+(o.extra||"")+'</svg>';
}

/* ---------- reminders: what's due ---------- */
function msDue(){
  var P=msCfg(), R=P.remind, out=null, today=new Date().toISOString().slice(0,10);
  if(P.msSnooze&&P.msSnooze>=today) return null;
  var tapeKeys=msKeys().filter(function(k){return k!=="weight";});
  var lastTape=null; tapeKeys.forEach(function(k){var l=msLatest(k); if(l&&(!lastTape||l.t>lastTape)) lastTape=l.t;});
  var lw=msLatest("weight");
  var tapeDue=R.tape>0&&tapeKeys.length&&(!lastTape||msDaysSince(lastTape)>=R.tape);
  var weighDue=R.weigh>0&&!P.mset.off.weight&&(!lw||msDaysSince(lw.t)>=R.weigh);
  if(tapeDue) out={kind:"tape",title:lastTape?"Check-in due":"Start tracking your body",sub:lastTape?"Last one "+fmtDay(lastTape)+" · about "+Math.max(1,Math.round(msKeys().length*12/60))+" min":"Weight and tape measurements, one card at a time"};
  else if(weighDue) out={kind:"weigh",title:"Weigh-in due",sub:lw?"Last one "+fmtDay(lw.t)+" · "+msFmt(lw.v)+" "+msUnit("weight"):"Log your weight to start the trend"};
  return out;
}
function msDueHtml(where){
  var d=msDue(); if(!d) return "";
  return '<section class="ms-due'+(where==="stats"?' st':'')+'" aria-label="'+esc(d.title)+'"><div><b>'+esc(d.title)+'</b><span>'+esc(d.sub)+'</span></div>'+
    '<div class="ms-due-b"><button class="chip sm" data-ms="later">Later</button><button class="chip sm primarychip" data-ms="'+(d.kind==="weigh"?"weigh":"start")+'">'+(d.kind==="weigh"?"Weigh in":"Start")+'</button></div></section>';
}

/* ---------- check-in sheet: start, cards, done, settings ---------- */
var M=null; /* {mode, keys, i, entry, stack:[{k,saved,prev}], saved:{k:val}} */
function msOpen(mode,keys){
  closeTabSheets();
  msCfg();
  M={mode:mode||"start",keys:keys||null,i:0,entry:null,stack:[],saved:{}};
  var sh=document.getElementById("measure"); sh.hidden=false; document.body.style.overflow="hidden";
  msRender(); sh.scrollTop=0; sh.focus();
  msFigLoad(function(){ if(M) msRender(); });
}
function msClose(){
  var sh=document.getElementById("measure"); if(!sh||sh.hidden) return;
  sh.hidden=true; sh.innerHTML=""; document.body.style.overflow=""; M=null;
  if(typeof renderDay==="function"&&DAYS) renderDay();
  if(H&&!H.ex) renderHistory(true);
}
function msDeck(){
  var keys=M.keys||msKeys();
  if(!M.keys&&!msLatest("height")) keys=keys.concat(["height"]);
  return keys;
}
function msRender(){
  var sh=document.getElementById("measure"); if(!sh||!M) return;
  sh.classList.toggle("ms-full",M.mode==="cards");
  if(M.mode==="cards"){ sh.innerHTML=msCardsHtml(); msWireDeck(); return; }
  var h='<div class="sheet-in ms-in">';
  if(M.mode==="start") h+=msStartHtml();
  else if(M.mode==="done") h+=msDoneHtml();
  else if(M.mode==="settings") h+=msSettingsHtml();
  sh.innerHTML=h+'</div>';
}
function msStartHtml(){
  var P=msCfg(), keys=msDeck(), lastAny=null;
  P.hist.forEach(function(e){var t=new Date(e.d); if(!lastAny||t>lastAny) lastAny=t;});
  var goals=Object.keys(P.goals).filter(function(k){return msLatest(k);}).slice(0,2);
  return '<div class="sheet-top"><h2 id="mstitle">Body check-in</h2><button class="chip" data-ms="close">Close</button></div>'+
    '<div class="ms-hero">'+msFig({soft:keys.filter(function(k){return MS_BAND[k];})})+'</div>'+
    '<p class="sub">'+keys.length+' card'+(keys.length===1?'':'s')+' · about '+Math.max(1,Math.round(keys.length*12/60))+' min'+(lastAny?' · last one '+esc(fmtDay(lastAny)):'')+'</p>'+
    '<div class="ms-legend"><span class="ms-pill">Swipe →</span><span>Save and go to the next</span><span class="ms-pill out">← Swipe</span><span>Skip this one today</span></div>'+
    goals.map(function(k){return msGoalHtml(k,true);}).join("")+
    '<button class="primary" data-ms="go">Start check-in</button>'+
    '<div class="ms-row2"><button class="ghost" data-ms="weigh">Weight only</button><button class="ghost" data-ms="settings">What you track</button></div>'+
    '<button class="linkbtn" data-ms="progress">See your body progress</button>';
}
function msCardHtml(k,depth){
  var P=msCfg(), l=msLatest(k), v=l?l.v:Math.round(msShown(k,MS_DEF[k.replace(/L$/,"")]||50)), side=msSide(k), sp=msSpot(k);
  var h='<div class="ms-card'+(depth?' back'+depth:'')+'" data-k="'+k+'"'+(depth?' aria-hidden="true"':'')+'>';
  if(depth) return h+'</div>';
  h+='<span class="ms-stamp save" aria-hidden="true">SAVE</span><span class="ms-stamp skip" aria-hidden="true">SKIP</span>'+
    '<div class="ms-figbox">'+msFig({vb:MS_CROP[k],hi:MS_BAND[k]?[k]:[],soft:(side==="Left"&&MS_BAND[k.slice(0,-1)])?[k.slice(0,-1)]:[]})+'</div>'+
    '<h3>'+esc(sp[1])+(side?'<span class="ms-side">'+side+'</span>':'')+'</h3>'+
    (P.mset.tips!==false?'<p class="ms-tip">'+esc(MS_TIP[k.replace(/L$/,"")]||"")+'</p>':'')+
    '<div class="ms-val"><label class="ms-num"><input id="msInput" inputmode="decimal" autocomplete="off" value="'+msFmt(v)+'" aria-label="'+esc(msName(k))+' in '+(sp[2]==="kg"?(msLb(k)?"pounds":"kilograms"):"centimetres")+'"><span>'+msUnit(k)+'</span></label>'+
    '<span class="ms-pill'+(l?'':' out')+'" id="msDelta">'+(l?'same as '+esc(fmtDay(l.t)):'first time')+'</span></div>'+
    '<div class="ms-ruler" id="msRuler" tabindex="0" role="slider" aria-label="'+esc(msName(k))+'" aria-valuenow="'+msFmt(v)+'"><i class="ms-ptr"></i></div>';
  return h+'</div>';
}
function msCardsHtml(){
  var keys=msDeck(), i=M.i, h='<div class="ms-cards"><div class="ms-ctop"><button class="ms-x" data-ms="stop" aria-label="Stop the check-in">✕</button>'+
    '<div class="ms-prog"><i style="width:'+(i/keys.length*100).toFixed(1)+'%"></i></div><span>'+Math.min(i+1,keys.length)+' of '+keys.length+'</span></div><div class="ms-deck" id="msDeck">';
  for(var j=Math.min(i+2,keys.length-1);j>=i;j--) h+=msCardHtml(keys[j],j-i);
  h+='</div><div class="ms-btns"><button class="ms-rb" data-ms="skip" aria-label="Skip">✕</button>'+
    '<div class="ms-hint"><button class="ms-undo" data-ms="undo"'+(M.stack.length?'':' disabled')+'>↶ Undo</button><span>Swipe right to save, left to skip</span></div>'+
    '<button class="ms-rb ok" data-ms="save" aria-label="Save">✓</button></div></div>';
  return h;
}
function msRulerSvg(val,step){
  var px=7, span=12, from=Math.floor(val)-span/2, n=span*10, s='<svg width="'+(n*px)+'" height="58" viewBox="0 0 '+(n*px)+' 58" aria-hidden="true">';
  for(var i=0;i<=n;i++){var x=i*px,maj=i%10===0,mid=i%5===0;
    s+='<line class="ms-tick'+(maj?' maj':'')+'" x1="'+x+'" x2="'+x+'" y1="0" y2="'+(maj?24:mid?16:10)+'"/>';
    if(maj) s+='<text x="'+x+'" y="42" text-anchor="middle">'+(from+i/10)+'</text>';}
  return {svg:s+'</svg>',from:from,px:px,n:n};
}
var MS_CUR=null; /* {k, el, get} the card on top */
function msWireDeck(){
  var keys=msDeck(); MS_CUR=null;
  if(M.i>=keys.length){ M.mode="done"; msRender(); return; }
  var k=keys[M.i], c=document.querySelector('#msDeck .ms-card[data-k="'+k+'"]:not(.back1):not(.back2)'); if(!c) return;
  var rul=document.getElementById("msRuler"), inp=document.getElementById("msInput"), dd=document.getElementById("msDelta"), l=msLatest(k);
  var cur=msNum(inp.value), R=null, svg=null;
  function build(){ R=msRulerSvg(cur); var old=rul.querySelector("svg"); if(old) old.remove(); rul.insertAdjacentHTML("afterbegin",R.svg); svg=rul.querySelector("svg"); draw(); }
  function draw(){ var w=rul.clientWidth||260; svg.style.transform="translateX("+(w/2-(cur-R.from)*10*R.px)+"px)"; rul.setAttribute("aria-valuenow",msFmt(cur)); }
  function show(fromInput){
    if(!fromInput) inp.value=msFmt(cur);
    if(l){var d=Math.round((cur-l.v)*10)/10; dd.textContent=d===0?"same as "+fmtDay(l.t):msDelta(cur,l.v)+" since "+fmtDay(l.t); dd.className="ms-pill"+(msGood(k,d)?"":" out");}
  }
  function set(v,fromInput){ v=Math.round(v*10)/10; if(!(v>0)) return; cur=Math.min(msMax(k),v); if(cur<R.from+1||cur>R.from+R.n/10-1) build(); else draw(); show(fromInput); }
  build();
  var sx=null,sv=0;
  rul.addEventListener("pointerdown",function(e){e.stopPropagation();sx=e.clientX;sv=cur;rul.setPointerCapture(e.pointerId);});
  rul.addEventListener("pointermove",function(e){if(sx===null)return;e.stopPropagation();var nv=Math.round((sv-(e.clientX-sx)/(R.px*10))*10)/10;if(nv!==cur){cur=nv;draw();show();}});
  var rend=function(e){if(sx===null)return;e.stopPropagation();sx=null;if(cur<R.from+1||cur>R.from+R.n/10-1)build();};
  rul.addEventListener("pointerup",rend); rul.addEventListener("pointercancel",rend);
  rul.addEventListener("keydown",function(e){var d=e.key==="ArrowRight"?0.1:e.key==="ArrowLeft"?-0.1:e.key==="PageUp"?1:e.key==="PageDown"?-1:0;if(d){e.preventDefault();e.stopPropagation();set(cur+d);}});
  inp.addEventListener("pointerdown",function(e){e.stopPropagation();});
  inp.addEventListener("input",function(){var n=msNum(inp.value.replace(",","."));if(n!=null&&n>0&&n<=msMax(k))set(n,true);});
  inp.addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();inp.blur();msGo(true);}});
  /* swipe the card */
  var px0=null,dx=0,stS=c.querySelector(".ms-stamp.save"),stK=c.querySelector(".ms-stamp.skip");
  c.addEventListener("pointerdown",function(e){if(e.target.closest("input,.ms-ruler"))return;px0=e.clientX;dx=0;c.classList.remove("snap");c.setPointerCapture(e.pointerId);});
  c.addEventListener("pointermove",function(e){if(px0===null)return;dx=e.clientX-px0;c.style.transform="translateX("+dx+"px) rotate("+(dx/18)+"deg)";stS.style.opacity=Math.max(0,Math.min(1,dx/70));stK.style.opacity=Math.max(0,Math.min(1,-dx/70));});
  var cend=function(){if(px0===null)return;px0=null;if(Math.abs(dx)>80)msGo(dx>0);else{c.classList.add("snap");c.style.transform="";stS.style.opacity=0;stK.style.opacity=0;}};
  c.addEventListener("pointerup",cend); c.addEventListener("pointercancel",cend);
  MS_CUR={k:k,el:c,get:function(){return cur;},stS:stS,stK:stK};
}
function msGo(saveIt){
  var t=MS_CUR; if(!t||!M) return; MS_CUR=null;
  var P=msCfg(), k=t.k, v=t.get(), rec={k:k,saved:false,prev:P.vals[k]};
  if(saveIt&&v>0&&v<=msMax(k)){
    if(!M.entry){M.entry={d:new Date().toISOString(),v:{}};P.hist.push(M.entry);if(P.hist.length>400)P.hist=P.hist.slice(-400);}
    M.entry.v[k]=msStore(k,v); P.vals[k]=msStore(k,v); M.saved[k]=v; rec.saved=true; save();
    platform.buzz(12);
  }
  M.stack.push(rec);
  (saveIt?t.stS:t.stK).style.opacity=1;
  t.el.classList.remove("snap"); t.el.classList.add("fly");
  var reduce=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
  t.el.style.transform="translateX("+(saveIt?120:-120)+"vw) rotate("+(saveIt?24:-24)+"deg)"; t.el.style.opacity="0";
  setTimeout(function(){if(!M)return;M.i++;msRender();},reduce?0:240);
}
function msUndo(){
  if(!M||!M.stack.length) return;
  var r=M.stack.pop(), P=msCfg();
  if(r.saved&&M.entry){ delete M.entry.v[r.k]; delete M.saved[r.k]; if(r.prev===undefined) delete P.vals[r.k]; else P.vals[r.k]=r.prev;
    if(!Object.keys(M.entry.v).length){ var i=P.hist.indexOf(M.entry); if(i>=0) P.hist.splice(i,1); M.entry=null; } save(); }
  M.i=Math.max(0,M.i-1); M.mode="cards"; msRender();
}
function msGoalHtml(k,compact){
  var g=msGoal(k), s=msSeries(k); if(!g||!s.length) return "";
  var start=s[0].v, now=s[s.length-1].v, tot=g.t-start, frac=tot?Math.max(0,Math.min(1,(now-start)/tot)):1, left=Math.round(Math.abs(g.t-now)*10)/10;
  return '<div class="ms-goal'+(compact?' c':'')+'"><div><b>'+esc(msName(k))+' goal '+msFmt(g.t)+' '+msUnit(k)+'</b><span>'+(frac>=1?'Reached':left+' '+msUnit(k)+' to go')+(g.by?' · by '+esc(fmtDay(g.by)):'')+'</span></div>'+
    '<div class="ms-bar"><i style="width:'+Math.round(frac*100)+'%"></i></div></div>';
}
function msDoneHtml(){
  var P=msCfg(), keys=Object.keys(M.saved), skipped=M.stack.filter(function(r){return !r.saved;}).length;
  var rows=keys.map(function(k){
    var s=msSeries(k), prevE=null; for(var i=s.length-1;i>=0;i--){ if(s[i].e!==M.entry){prevE=s[i];break;} }
    var v=M.saved[k], d=prevE?Math.round((v-prevE.v)*10)/10:null;
    return '<tr><td>'+esc(msName(k,true))+'</td><td><b>'+msFmt(v)+'</b> '+msUnit(k)+'</td><td>'+(d==null?'<span class="ms-pill out">new</span>':'<span class="ms-pill'+(msGood(k,d)?'':' out')+'">'+msDelta(v,prevE.v)+'</span>')+'</td></tr>';
  }).join("");
  var goals=Object.keys(P.goals).filter(function(k){return M.saved[k]!=null;});
  return '<div class="sheet-top"><h2 id="mstitle">'+(keys.length?'Check-in done':'Nothing saved')+'</h2><button class="chip" data-ms="close">Done</button></div>'+
    '<p class="sub">'+keys.length+' saved'+(skipped?' · '+skipped+' skipped':'')+'</p>'+
    (keys.length?'<table class="ms-tbl">'+rows+'</table>':'<p class="sub">Swipe a card right to save it.</p>')+
    goals.map(function(k){return msGoalHtml(k);}).join("")+
    '<button class="primary" data-ms="progress">See your progress</button>'+
    (M.stack.length?'<button class="linkbtn" data-ms="undo">↶ Back to the last card</button>':'');
}
function msSettingsHtml(){
  var P=msCfg(), C=P.mset, R=P.remind, ht=msLatest("height");
  var tog=function(id,on,label,sub){return '<button class="ms-set" data-ms="'+id+'" role="switch" aria-checked="'+!!on+'"><span><b>'+label+'</b><span>'+sub+'</span></span><i class="ms-tog"></i></button>';};
  var rem=function(kind,label){return '<div class="ms-remrow"><b>'+label+'</b><div class="ms-chips">'+MS_REMIND[kind].map(function(o){return '<button class="chip sm" data-ms="rem" data-kind="'+kind+'" data-days="'+o[0]+'" aria-pressed="'+(R[kind]===o[0])+'">'+o[1]+'</button>';}).join("")+'</div></div>';};
  var goals=Object.keys(P.goals);
  return '<div class="sheet-top"><h2 id="mstitle">What you track</h2><button class="chip" data-ms="back">Back</button></div>'+
    '<p class="sub">Tap to turn a spot on or off. Your check-in has one card for each.</p>'+
    '<div class="ms-chips">'+MS_SPOTS.map(function(s){var on=!C.off[s[0]];return '<button class="chip sm" data-ms="spot" data-k="'+s[0]+'" aria-pressed="'+on+'">'+(on?'✓ ':'')+esc(s[4]||s[1])+'</button>';}).join("")+'</div>'+
    '<div class="ms-box">'+tog("lr",C.lr,"Left and right separately","Upper arms, forearms, thighs and calves")+tog("tips",C.tips!==false,"Tips on each card","Where and how to place the tape")+
    '<label class="ms-set"><span><b>Height</b><span>Set once, change it any time</span></span><span class="ms-ht"><input id="msHeight" inputmode="decimal" autocomplete="off" value="'+(ht?msFmt(ht.v):'')+'" placeholder="175" aria-label="Height in centimetres">cm</span></label></div>'+
    '<h3 class="psec">Reminders</h3><p class="sub">The app shows a card on the Workout and Stats tabs when one is due.</p>'+
    '<div class="ms-box">'+rem("weigh","Weigh-in")+rem("tape","Tape check-in")+'</div>'+
    '<h3 class="psec">Goals</h3><p class="sub">'+(goals.length?'Change a goal from its chart in Body progress.':'Set a goal from any chart in Body progress.')+'</p>'+
    goals.map(function(k){return msGoalHtml(k);}).join("")+
    '<button class="ghost ms-wide" data-ms="progress">Open body progress</button>';
}
function msSaveHeight(){
  var el=document.getElementById("msHeight"); if(!el) return;
  var n=msNum(el.value.replace(",",".")), l=msLatest("height"), P=msCfg();
  if(el.value.trim()===""||n==null) return;
  if(n<50||n>260){toast("Height should be in centimetres, like 175");return;}
  if(l&&msFmt(l.v)===msFmt(n)) return;
  P.hist.push({d:new Date().toISOString(),v:{height:msFmt(n)}}); P.vals.height=msFmt(n); save(); toast("Height saved");
}

/* ---------- Body progress sheet ---------- */
var BP=null; /* {range, k, edit, goal} */
var BP_RANGES=[["q","3 mo",91],["h","6 mo",183],["y","Year",365],["all","All",0]];
function bpOpen(k){
  closeTabSheets(); msCfg();
  BP={range:BP&&BP.range||"h",k:k||null,edit:null,goal:false};
  var sh=document.getElementById("body"); sh.hidden=false; document.body.style.overflow="hidden";
  bpRender(); sh.scrollTop=0; sh.focus();
  msFigLoad(function(){ if(BP) bpRender(true); });
}
function bpClose(){ var sh=document.getElementById("body"); if(!sh||sh.hidden) return; sh.hidden=true; sh.innerHTML=""; document.body.style.overflow=""; BP=null; }
function bpSince(){ var r=BP_RANGES.filter(function(x){return x[0]===BP.range;})[0]; return r&&r[2]?Date.now()-r[2]*864e5:0; }
function bpPts(k){ var since=bpSince(); return msSeries(k).filter(function(p){return p.t.getTime()>=since;}); }
function bpChange(k){ var p=bpPts(k); if(p.length<2) return null; return {a:p[0],b:p[p.length-1],d:Math.round((p[p.length-1].v-p[0].v)*10)/10}; }
function bpRender(keep){
  var sh=document.getElementById("body"); if(!sh||!BP) return;
  var st=sh.scrollTop, h='<div class="sheet-in">';
  h+=BP.k?bpDetailHtml():bpMainHtml();
  sh.innerHTML=h+'</div>'; if(keep) sh.scrollTop=st;
}
function bpSeg(){ return '<div class="stseg ms-seg" role="group" aria-label="Time range">'+BP_RANGES.map(function(r){return '<button data-bp="range" data-r="'+r[0]+'" aria-pressed="'+(BP.range===r[0])+'">'+r[1]+'</button>';}).join("")+'</div>'; }
function bpTag(x,y,txt,sub,cls,left){
  var w=Math.max(txt.length*5.4,sub.length*4.5)+12, hh=25, x0=left?x-w:x;
  return '<g class="ms-tag '+cls+'"><rect x="'+x0.toFixed(1)+'" y="'+(y-hh/2)+'" width="'+w.toFixed(1)+'" height="'+hh+'" rx="8"/><text x="'+(x0+6).toFixed(1)+'" y="'+(y-1.5)+'">'+esc(txt)+'</text><text class="s" x="'+(x0+6).toFixed(1)+'" y="'+(y+8.5)+'">'+esc(sub)+'</text></g>';
}
function bpMainHtml(){
  var P=msCfg(), keys=msKeys().filter(function(k){return msSeries(k).length;});
  var h='<div class="sheet-top"><h2 id="bptitle">Body progress</h2><button class="chip primarychip" data-ms="start">Check in</button></div>';
  if(!keys.length) return h+'<div class="hempty"><b>Your progress starts with your first check-in</b><p>Weigh in and measure with the tape, one card at a time. Changes show up here on your body and as charts.</p><button class="chip" data-ms="start">Start a check-in</button></div>';
  h+=bpSeg();
  /* body map: up to 5 picked spots */
  var tapeKeys=keys.filter(function(k){return MS_TAG[k];}), sel=P.mapSel.filter(function(k){return tapeKeys.indexOf(k)>=0;});
  if(!sel.length) sel=tapeKeys.slice(0,3);
  if(tapeKeys.length){
    var ex="";
    sel.forEach(function(k){var t=MS_TAG[k], c=bpChange(k), l=msLatest(k);
      var txt=c?msDelta(c.b.v,c.a.v)+" "+msUnit(k):msFmt(l.v)+" "+msUnit(k);
      ex+='<path class="ms-leader" d="M'+t[0]+','+t[1]+' L'+t[2]+','+t[3]+'"/><circle class="ms-dot" cx="'+t[0]+'" cy="'+t[1]+'" r="2.2"/>'+bpTag(t[2],t[3],txt,msName(k,true),c&&c.d?(msGood(k,c.d)?"good":""):"",t[4]);});
    h+='<section class="stcard ms-map"><div class="ms-chips" role="group" aria-label="Shown on the body">'+tapeKeys.map(function(k){return '<button class="chip sm" data-bp="pick" data-k="'+k+'" aria-pressed="'+(sel.indexOf(k)>=0)+'">'+esc(msName(k,true))+'</button>';}).join("")+'</div>'+
      '<div class="ms-mapfig" role="img" aria-label="'+esc(sel.map(function(k){var c=bpChange(k);return msName(k)+(c?" "+msDelta(c.b.v,c.a.v)+" "+msUnit(k):"");}).join(", "))+'">'+msFig({vb:"-100 -6 200 300",soft:sel.filter(function(k){return MS_BAND[k];}),extra:ex})+'</div>'+
      '<p class="ms-cap">Change over the '+(BP.range==="all"?'whole time':'last '+BP_RANGES.filter(function(r){return r[0]===BP.range;})[0][1].replace("mo","months").replace("Year","year"))+'. Pick up to 5.</p></section>';
  }
  h+='<h3 class="stsec">Every measurement</h3><div class="ms-list">';
  keys.concat(msLatest("height")?["height"]:[]).forEach(function(k){
    var l=msLatest(k), c=bpChange(k);
    h+='<button class="ms-li" data-bp="open" data-k="'+k+'"><span class="ms-lin"><b>'+esc(msName(k,true))+'</b><span><b>'+msFmt(l.v)+'</b> '+msUnit(k)+'</span></span>'+
      '<span class="ms-spark">'+bpSpark(k,120,40,false)+'</span>'+(c?'<span class="ms-pill'+(msGood(k,c.d)?'':' out')+'">'+msDelta(c.b.v,c.a.v)+'</span>':'<span class="ms-pill out">'+esc(fmtDay(l.t))+'</span>')+'</button>';
  });
  h+='</div><button class="ghost ms-wide" data-ms="settings">What you track, reminders and goals</button>';
  return h;
}
function bpSpark(k,w,hgt,axis){
  var pts=bpPts(k), g=msGoal(k);
  if(pts.length<2) return '';
  var vs=pts.map(function(p){return p.v;}).concat(g?[g.t]:[]), lo=Math.min.apply(null,vs), hi=Math.max.apply(null,vs), pad=(hi-lo)*.15||1; lo-=pad; hi+=pad;
  var t0=pts[0].t.getTime(), t1=pts[pts.length-1].t.getTime(), L=axis?28:2, Rr=axis?8:6, T=6, B=axis?18:4;
  var X=function(t){return L+(t1===t0?0.5:(t-t0)/(t1-t0))*(w-L-Rr);}, Y=function(v){return T+(hi-v)/(hi-lo)*(hgt-T-B);};
  var line=pts.map(function(p){return X(p.t.getTime()).toFixed(1)+","+Y(p.v).toFixed(1);});
  var s='<svg class="ms-chart" viewBox="0 0 '+w+' '+hgt+'" width="100%" preserveAspectRatio="none" aria-hidden="true">';
  if(axis){ [hi-pad,(hi+lo)/2,lo+pad].forEach(function(v){s+='<line class="ms-grid" x1="'+L+'" x2="'+(w-Rr)+'" y1="'+Y(v).toFixed(1)+'" y2="'+Y(v).toFixed(1)+'"/><text class="ms-ax" x="'+(L-4)+'" y="'+(Y(v)+3).toFixed(1)+'" text-anchor="end">'+(Math.round(v*10)/10)+'</text>';});
    s+='<text class="ms-ax" x="'+L+'" y="'+(hgt-4)+'">'+esc(fmtDay(pts[0].t))+'</text><text class="ms-ax" x="'+(w-Rr)+'" y="'+(hgt-4)+'" text-anchor="end">'+esc(fmtDay(pts[pts.length-1].t))+'</text>'; }
  s+='<path class="ms-area" d="M'+X(t0).toFixed(1)+','+(hgt-B)+' L'+line.join(" L")+' L'+X(t1).toFixed(1)+','+(hgt-B)+' Z"/>';
  if(g){ s+='<line class="ms-goalln" x1="'+L+'" x2="'+(w-Rr)+'" y1="'+Y(g.t).toFixed(1)+'" y2="'+Y(g.t).toFixed(1)+'"/>'; if(axis) s+='<text class="ms-ax" x="'+(w-Rr)+'" y="'+(Y(g.t)-4).toFixed(1)+'" text-anchor="end">Goal '+msFmt(g.t)+'</text>'; }
  s+='<polyline class="ms-line" points="'+line.join(" ")+'"/>';
  if(axis) pts.forEach(function(p,i){ if(i<pts.length-1) s+='<circle class="ms-pt" cx="'+X(p.t.getTime()).toFixed(1)+'" cy="'+Y(p.v).toFixed(1)+'" r="2.6"/>'; });
  var e=pts[pts.length-1]; s+='<circle class="ms-end" cx="'+X(e.t.getTime()).toFixed(1)+'" cy="'+Y(e.v).toFixed(1)+'" r="4"/>';
  return s+'</svg>';
}
/* when the trend reaches the goal (simple straight line through the range), or "" */
function bpForecast(k){
  var g=msGoal(k), p=bpPts(k); if(!g||p.length<3) return "";
  var n=p.length, mx=0,my=0; p.forEach(function(q){mx+=q.t.getTime();my+=q.v;}); mx/=n; my/=n;
  var sxy=0,sxx=0; p.forEach(function(q){var dx=q.t.getTime()-mx;sxy+=dx*(q.v-my);sxx+=dx*dx;});
  if(!sxx) return ""; var slope=sxy/sxx, now=p[n-1].v; if((g.t-now)*slope<=0) return "";
  var when=new Date(p[n-1].t.getTime()+(g.t-now)/slope); if(when.getTime()-Date.now()>3*365*864e5) return "";
  return "At this pace: "+when.toLocaleDateString(undefined,{month:"long",year:"numeric"});
}
function bpDetailHtml(){
  var k=BP.k, s=msSeries(k), l=s[s.length-1], c=bpChange(k), g=msGoal(k), u=msUnit(k);
  var h='<div class="sheet-top"><button class="chip" data-bp="back">‹ Back</button><h2 id="bptitle">'+esc(msName(k))+'</h2></div>';
  if(!l) return h+'<p class="sub">Nothing saved yet.</p>';
  h+='<div class="ms-dhead"><span class="ms-big">'+msFmt(l.v)+'<small>'+u+'</small></span>'+(c?'<span class="ms-pill'+(msGood(k,c.d)?'':' out')+'">'+msDelta(c.b.v,c.a.v)+' since '+esc(fmtDay(c.a.t))+'</span>':'')+'</div>';
  if(k!=="height"){
    h+=bpSeg();
    h+=bpPts(k).length>1?'<section class="stcard ms-big-chart" role="img" aria-label="'+esc(msName(k)+": "+bpPts(k).map(function(p){return fmtDay(p.t)+" "+msFmt(p.v)+" "+u;}).join(", "))+'">'+bpSpark(k,320,170,true)+'</section>':'<p class="sub">One more check-in and a chart shows up here.</p>';
    if(BP.goal){
      h+='<section class="stcard ms-goaled"><b>Goal</b><div class="ms-goalin"><label><span>Target</span><span class="ms-ht"><input id="bpGoalT" inputmode="decimal" autocomplete="off" value="'+(g?msFmt(g.t):'')+'" placeholder="'+msFmt(l.v)+'">'+u+'</span></label>'+
        '<label><span>By (optional)</span><input id="bpGoalBy" type="date" value="'+(g&&g.by?esc(g.by):'')+'"></label></div>'+
        '<div class="ms-row2"><button class="ghost" data-bp="goalcancel">Cancel</button><button class="chip primarychip" data-bp="goalsave">Save goal</button></div>'+(g?'<button class="linkbtn danger" data-bp="goaldel">Remove this goal</button>':'')+'</section>';
    } else if(g){
      var fc=bpForecast(k);
      h+='<button class="ms-goalbtn" data-bp="goal">'+msGoalHtml(k)+(fc?'<span class="ms-fc">'+esc(fc)+'</span>':'')+'<span class="ms-edit">Change</span></button>';
    } else h+='<button class="ghost ms-wide" data-bp="goal">＋ Set a goal</button>';
  }
  h+='<h3 class="stsec">History</h3><div class="ms-hist">';
  s.slice().reverse().forEach(function(p,i,arr){
    var prev=arr[i+1], id=p.e.d;
    if(BP.edit===id){
      h+='<div class="ms-hrow edit"><span>'+esc(hDate(p.e.d,{day:"numeric",month:"short",year:"numeric"}))+'</span><span class="ms-ht"><input id="bpEditV" inputmode="decimal" autocomplete="off" value="'+msFmt(p.v)+'" aria-label="New value">'+u+'</span>'+
        '<button class="chip sm" data-bp="editcancel">Cancel</button><button class="chip sm primarychip" data-bp="editsave">Save</button></div>';
    } else
      h+='<div class="ms-hrow"><span>'+esc(hDate(p.e.d,{day:"numeric",month:"short",year:"numeric"}))+'</span><b>'+msFmt(p.v)+' '+u+'</b><span class="ms-hd">'+(prev?msDelta(p.v,prev.v):'')+'</span>'+
        '<button class="linkbtn" data-bp="edit" data-id="'+esc(id)+'">Edit</button><button class="linkbtn danger" data-bp="del" data-id="'+esc(id)+'">Delete</button></div>';
  });
  return h+'</div>';
}
function bpEntry(id){ var hs=prof().hist; for(var i=0;i<hs.length;i++) if(hs[i].d===id) return hs[i]; return null; }
function bpRefreshVals(k){ var l=msLatest(k), P=prof(); if(l) P.vals[k]=msStore(k,l.v); else delete P.vals[k]; }

/* ---------- clicks (from the global handler in day.js) ---------- */
function msClick(t){
  var a=t.dataset.ms, b=t.dataset.bp;
  if(a){
    var P=msCfg();
    if(a==="start"){msOpen("start");return true;}
    if(a==="weigh"){msOpen("cards",["weight"]);return true;}
    if(a==="later"){var d=new Date(Date.now()+2*864e5);P.msSnooze=d.toISOString().slice(0,10);save();if(typeof renderDay==="function"&&DAYS)renderDay();if(H&&!H.ex)renderHistory(true);toast("We'll remind you in a few days");return true;}
    if(a==="progress"){msClose();bpOpen();return true;}
    if(a==="settings"&&!M){msOpen("settings");M.back="body";return true;}
    if(!M) return false;
    if(a==="close"){msClose();return true;}
    if(a==="go"){M.mode="cards";M.keys=null;M.i=0;msRender();return true;}
    if(a==="settings"){M.back=M.mode;M.mode="settings";msRender();document.getElementById("measure").scrollTop=0;return true;}
    if(a==="back"){msSaveHeight();if(M.back==="body"){msClose();bpOpen();return true;}M.mode=M.back&&M.back!=="settings"?M.back:"start";msRender();return true;}
    if(a==="save"){msGo(true);return true;}
    if(a==="skip"){msGo(false);return true;}
    if(a==="undo"){msUndo();return true;}
    if(a==="stop"){M.mode=Object.keys(M.saved).length?"done":"start";msRender();return true;}
    if(a==="spot"){var k=t.dataset.k;if(P.mset.off[k])delete P.mset.off[k];else{if(msKeys().length<=1){toast("Keep at least one spot");return true;}P.mset.off[k]=1;}save();msRender();return true;}
    if(a==="lr"){P.mset.lr=!P.mset.lr;save();msRender();return true;}
    if(a==="tips"){P.mset.tips=P.mset.tips===false;save();msRender();return true;}
    if(a==="rem"){P.remind[t.dataset.kind]=+t.dataset.days;delete P.msSnooze;save();msRender();return true;}
    return false;
  }
  if(b&&BP){
    var Pp=msCfg();
    if(b==="range"){BP.range=t.dataset.r;bpRender(true);return true;}
    if(b==="pick"){var kk=t.dataset.k,sel=Pp.mapSel.slice(),i=sel.indexOf(kk);
      if(i>=0){if(sel.length>1)sel.splice(i,1);}else{if(sel.length>=5){toast("Up to 5 on the body. Untick one first");return true;}sel.push(kk);}
      Pp.mapSel=sel;save();bpRender(true);return true;}
    if(b==="open"){BP.k=t.dataset.k;BP.edit=null;BP.goal=false;bpRender();document.getElementById("body").scrollTop=0;return true;}
    if(b==="back"){BP.k=null;BP.edit=null;BP.goal=false;bpRender();return true;}
    if(b==="goal"){BP.goal=true;bpRender(true);var gi=document.getElementById("bpGoalT");if(gi)gi.focus();return true;}
    if(b==="goalcancel"){BP.goal=false;bpRender(true);return true;}
    if(b==="goaldel"){delete Pp.goals[BP.k];save();BP.goal=false;bpRender(true);toast("Goal removed");return true;}
    if(b==="goalsave"){var n=msNum((document.getElementById("bpGoalT").value||"").replace(",",".")),by=document.getElementById("bpGoalBy").value||"";
      if(n==null||n<=0||n>msMax(BP.k)){toast("Enter a target number");return true;}
      Pp.goals[BP.k]={t:msLb(BP.k)?+msStore(BP.k,n):Math.round(n*10)/10,by:/^\d{4}-\d{2}-\d{2}$/.test(by)?by:""};save();BP.goal=false;bpRender(true);toast("Goal saved");return true;}
    if(b==="edit"){BP.edit=t.dataset.id;bpRender(true);var ei=document.getElementById("bpEditV");if(ei){ei.focus();ei.select();}return true;}
    if(b==="editcancel"){BP.edit=null;bpRender(true);return true;}
    if(b==="editsave"){var e=bpEntry(BP.edit),nv=msNum((document.getElementById("bpEditV").value||"").replace(",","."));
      if(!e||nv==null||nv<=0||nv>msMax(BP.k)){toast("Enter a number");return true;}
      e.v[BP.k]=msStore(BP.k,nv);bpRefreshVals(BP.k);save();BP.edit=null;bpRender(true);toast("Saved");return true;}
    if(b==="del"){if(!confirmTap(t,"Delete","Tap again"))return true;var e2=bpEntry(t.dataset.id);if(e2){delete e2.v[BP.k];
      if(!Object.keys(e2.v).length){var hs=prof().hist;hs.splice(hs.indexOf(e2),1);}bpRefreshVals(BP.k);save();}
      if(!msSeries(BP.k).length)BP.k=null;bpRender(true);toast("Deleted");return true;}
  }
  return false;
}
document.addEventListener("change",function(e){ if(e.target&&e.target.id==="msHeight") msSaveHeight(); });
document.addEventListener("keydown",function(e){
  if(e.key!=="Escape") return;
  if(M&&!document.getElementById("measure").hidden){ if(M.mode==="cards"){M.mode=Object.keys(M.saved).length?"done":"start";msRender();} else msClose(); }
  else if(BP){ if(BP.k){BP.k=null;bpRender();} else bpClose(); }
});
