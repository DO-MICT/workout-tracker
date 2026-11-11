/* ---------- cardio on the summary: distance, time and pace ---------- */
function cardioSum(sets){return GFDRules.cardioSum(sets);}
/* rowers and ski ergs show time per 500 m, runs and walks time per km, everything else km/h */
function cardioKind(name){name=String(name||"").toLowerCase(); return /row|ski|erg/.test(name)?"500":/run|jog|walk|tread|sprint|hike|track/.test(name)?"km":"kmh";}
function fmtPace(sec){sec=Math.round(sec);return Math.floor(sec/60)+":"+String(sec%60).padStart(2,"0");}
/* {v:"2:05", u:"/500 m", sec:125, fast:-1 means lower is faster} or null when distance or time is missing */
function cardioPace(name,c){
  if(!(c&&c.km>0&&c.min>0)) return null;
  var k=cardioKind(name);
  if(k==="500"){var a=c.min*60/(c.km*2);return {v:fmtPace(a),u:"/500 m",n:a,lowFast:true};}
  if(k==="km"){var b=c.min*60/c.km;return {v:fmtPace(b),u:"/km",n:b,lowFast:true};}
  var h=c.km/(c.min/60);return {v:fmtNum(Math.round(h*10)/10),u:"km/h",n:h,lowFast:false};
}
function fmtMin(m){ if(!(m>0)) return ""; var sec=Math.round(m*60); return sec%60?fmtPace(sec)+" min":fmtNum(sec/60)+" min"; }
function fmtKm(km){ return km>=10?fmtNum(Math.round(km*10)/10)+" km":fmtNum(Math.round(km*100)/100)+" km"; }
function cardioBlocks(rec,prev){
  var by={},order=[];
  rec.sets.forEach(function(x){ if(x.measure!=="cardio") return; var k=x.exercise_order; if(!by[k]){by[k]={id:x.exercise_id,n:x.exercise_name,sets:[]};order.push(k);} by[k].sets.push(x); });
  return order.map(function(k){
    var b=by[k], c=cardioSum(b.sets), p=cardioPace(b.n,c), was=prev&&prev[b.id]?cardioPace(b.n,prev[b.id]):null;
    var cmp=null; if(p&&was&&was.n>0&&Math.abs(p.n-was.n)/was.n>0.005) cmp=(p.lowFast?p.n<was.n:p.n>was.n)?"up":"down";
    return {n:b.n,km:c.km,min:c.min,pace:p,was:was,cmp:cmp};
  }).filter(function(b){return b.km>0||b.min>0;});
}
/* ---------- the "well done" popup after Complete workout ---------- */
var DONE_CHEERS=["Well done!","High five!","Look at you go!","Crushed it!","Strong work!","That’s how it’s done!","Another one in the bank!","Beast mode: complete!","Nailed it!","You showed up and smashed it!"];
var DONE_PR_CHEERS=["New PR! Look at you go!","PR day! High five!","Stronger than ever!","New record. Take a bow!"];
/* Calm style (Profile): quieter words for a studio, and no confetti */
var DONE_CALM=["Nice practice","Good session","Well practised","Session complete","Time well spent"];
var DONE_CALM_PR=["Nice practice, and a new personal best","Good session, with a new best"];
var DONE_SVG='<svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="var(--accent)"/><path d="M22 18h20v8a10 10 0 0 1-20 0z" fill="var(--accent-ink)"/><path d="M22 21h-5a5 5 0 0 0 5 7M42 21h5a5 5 0 0 1-5 7" fill="none" stroke="var(--accent-ink)" stroke-width="2.6" stroke-linecap="round"/><path d="M32 36v6M25 46h14" stroke="var(--accent-ink)" stroke-width="3.2" stroke-linecap="round"/></svg>';
var DONE_LAST=null;
function donePick(a){var i=Math.floor(Math.random()*a.length); if(a.length>1&&a[i]===DONE_LAST) i=(i+1)%a.length; DONE_LAST=a[i]; return a[i];}
function celebStyle(){ return S.celebrate==="calm"?"calm":"energetic"; }
/* a record's number with its unit: "100 kg", "about 112.5 kg", "18 reps", "5:12 /km" */
function winText(p){ var u=p.u||"kg"; return u==="/km"?fmtPace(p.now)+" /km":(p.about?"about ":"")+GFDRules.showVal(p.now,u,U())+" "+GFDRules.showUnit(u,U()); }
function wasText(p){ return "was "+(p.u==="/km"?fmtPace(p.was):GFDRules.showVal(p.was,p.u||"kg",U())); }
function showDone(rec,d,wins){
  var el=document.getElementById("donepop"); if(!el) return;
  var calm=celebStyle()==="calm", miles=wins.miles||[], missed=wins.missed||[];
  var exN={}; rec.sets.forEach(function(x){exN[x.exercise_order]=1;});
  var nEx=Object.keys(exN).length, vol=histVolume(rec), done=rec.sets.filter(function(x){return x.done;}).length;
  var stats=[[fmtDur(rec.duration_sec)||"–","Time"],[String(rec.sets.length),"Sets"+(done&&done<rec.sets.length?" ("+done+" ticked)":"")],[String(nEx),"Exercise"+(nEx===1?"":"s")]];
  var cardio=cardioBlocks(rec,wins.prevCardio), cKm=0; cardio.forEach(function(b){cKm+=b.km;});
  if(vol>0) stats.push([fmtKg(vol),"Lifted"]);
  else if(cKm>0) stats.push([fmtKm(cKm),"Distance"]);
  /* confetti only for a real win, never in Calm, and only above the numbers */
  var party=!calm&&(wins.prs.length||wins.up.length||miles.length);
  var title=calm?donePick(wins.prs.length?DONE_CALM_PR:DONE_CALM):donePick(wins.prs.length?DONE_PR_CHEERS:DONE_CHEERS);
  var h='<div class="donecard'+(calm?' calm':'')+'" role="dialog" aria-modal="true" aria-labelledby="doneTitle">'+
    (party?'<div class="confetti" aria-hidden="true">'+Array.apply(null,Array(18)).map(function(_,i){return '<i style="--i:'+i+'"></i>';}).join("")+'</div>':'')+
    DONE_SVG+'<h2 id="doneTitle">'+esc(title)+'</h2>'+
    '<p class="donesub">'+esc(d.title)+' · '+esc(hDate(rec.performed_at))+'</p>'+
    '<div class="donestats">'+stats.map(function(x){return '<div><b>'+esc(x[0])+'</b><span>'+esc(x[1])+'</span></div>';}).join("")+'</div>';
  if(miles.length) h+='<ul class="donemiles">'+miles.map(function(m){return '<li class="dm-'+esc(m.key)+'">'+esc(m.text)+'</li>';}).join("")+'</ul>';
  if(cardio.length) h+='<div class="donecardio"><h3>Cardio</h3>'+cardio.map(function(b){
    var bits=[b.km>0?fmtKm(b.km):"",b.min>0?fmtMin(b.min):""].filter(Boolean).join(" in ");
    return '<div class="dcrow"><div class="dcname"><span>'+esc(b.n)+'</span><em>'+esc(bits)+'</em></div>'+
      (b.pace?'<div class="dcpace"><b>'+esc(b.pace.v)+'<small>'+esc(b.pace.u)+'</small></b>'+
        (b.was?'<em class="'+(b.cmp||"")+'">'+(b.cmp==="up"?"Faster than":b.cmp==="down"?"Slower than":"Same as")+' last time ('+esc(b.was.v)+')</em>':'')+'</div>'
      :'<div class="dcpace"><em>Add '+(b.km>0?'minutes':'distance')+' to see your pace</em></div>')+'</div>';
  }).join("")+'</div>';
  if(wins.prs.length) h+='<div class="donewins"><h3>'+(calm?'Personal best'+(wins.prs.length>1?'s':''):'New PR'+(wins.prs.length>1?'s':''))+'</h3><ul>'+wins.prs.map(function(p){return '<li><span>'+esc(p.n)+(p.what?'<small>'+esc(p.what)+'</small>':'')+'</span><b>'+esc(winText(p))+'</b><em>'+esc(wasText(p))+'</em></li>';}).join("")+'</ul></div>';
  if(wins.up.length) h+='<div class="donewins up"><h3>Up on last time</h3><ul>'+wins.up.map(function(p){return '<li><span>'+esc(p.n)+'</span><b>+'+esc(GFDRules.showVal(p.by,p.u||'kg',U())+' '+GFDRules.showUnit(p.u||'kg',U()))+'</b></li>';}).join("")+'</ul></div>';
  if(missed.length) h+='<p class="donemissed">'+esc(missed.length===1?missed[0].n+", set "+missed[0].set+" was short of its target.":missed.length+" sets were short of their target.")+' They’re saved, just not counted as wins.</p>';
  h+='<div class="donebtns"><button class="ghost" id="doneHistory">See in History</button><button class="primary" id="doneClose">Done</button></div></div>';
  el.innerHTML=h; el.hidden=false; document.body.style.overflow="hidden";
  var b=document.getElementById("doneClose"); if(b) b.focus();
}
function closeDone(){var el=document.getElementById("donepop"); if(!el||el.hidden) return; el.hidden=true; el.innerHTML=""; document.body.style.overflow="";}
function toast(m){var t=document.getElementById("toast");toast._act=null;t.textContent=m;t.classList.add("on");clearTimeout(toast._t);toast._t=setTimeout(function(){t.classList.remove("on");},2600);}
/* a toast with one button, e.g. Undo */
function toastAction(m,label,fn){
  var t=document.getElementById("toast");
  t.innerHTML='<span>'+esc(m)+'</span><button id="toastAct" class="toastbtn">'+esc(label)+'</button>';
  t.classList.add("on"); toast._act=fn; clearTimeout(toast._t);
  toast._t=setTimeout(function(){t.classList.remove("on");toast._act=null;},6000);
}

/* ---------- on-screen keyboard ----------
   iPhone keeps full-screen panels at full height when the keyboard opens, so the bottom half
   ends up behind it. Measure the keyboard and add that much scroll room, and let a swipe on the
   list put the keyboard away (like the iPhone's own search screens). */
(function keyboardRoom(){
  var vv=window.visualViewport; if(!vv) return;
  function upd(){var kb=Math.max(0,Math.round(window.innerHeight-vv.height-vv.offsetTop)); document.documentElement.style.setProperty("--kb",(kb>80?kb:0)+"px");}
  vv.addEventListener("resize",upd); vv.addEventListener("scroll",upd); upd();
})();
(function swipeDismiss(){
  var y0=null, onField=false;
  document.addEventListener("touchstart",function(e){
    var a=document.activeElement; y0=null;
    if(!a||!/^(INPUT|TEXTAREA)$/.test(a.tagName)||!a.closest(".sheet")) return;
    onField=e.target===a; y0=e.touches[0].clientY;
  },{passive:true});
  document.addEventListener("touchmove",function(e){
    if(y0===null||onField) return;
    if(Math.abs(e.touches[0].clientY-y0)>12){var a=document.activeElement; if(a&&a.blur) a.blur(); y0=null;}
  },{passive:true});
})();
/* ---------- rest timer ---------- */
var tInt=null,tEnd=0,tTotal=90,AC=null,pingNodes=[];
function audio(){
  try{ if(!AC){var C=window.AudioContext||window.webkitAudioContext; if(!C) return null; AC=new C();}
       if(AC.state==="suspended") AC.resume(); }catch(e){return null;}
  return AC;
}
function cancelPing(){pingNodes.forEach(function(n){try{n.stop();}catch(e){}});pingNodes=[];}
function schedulePing(delay){
  cancelPing(); var a=audio(); if(!a) return;
  var end=a.currentTime+Math.max(0,delay)+0.05;
  [[-3,587,0.18],[-2,587,0.18],[-1,587,0.18],[0,1175,0.75]].forEach(function(b){
    var st=end+b[0]; if(st<a.currentTime) return;
    var o=a.createOscillator(), f=a.createBiquadFilter(), g=a.createGain();
    o.type="square"; o.frequency.value=b[1]; f.type="lowpass"; f.frequency.value=3200;
    g.gain.setValueAtTime(0.0001,st); g.gain.exponentialRampToValueAtTime(0.28,st+0.01);
    g.gain.setValueAtTime(0.28,st+b[2]-0.04); g.gain.exponentialRampToValueAtTime(0.0001,st+b[2]);
    o.connect(f); f.connect(g); g.connect(a.destination); o.start(st); o.stop(st+b[2]+0.02); pingNodes.push(o);
  });
}
function startTimer(sec){
  tTotal=sec;tEnd=Date.now()+sec*1000; schedulePing(sec); platform.restAlert(tEnd);   /* the app: a notification if the screen is off (WP10) */
  document.getElementById("timer").classList.add("on");
  clearInterval(tInt);tick();tInt=setInterval(tick,250);
}
function tick(){
  var left=Math.max(0,Math.round((tEnd-Date.now())/1000));
  document.getElementById("tt").textContent=Math.floor(left/60)+":"+String(left%60).padStart(2,"0");
  document.getElementById("tbar").style.width=(left/tTotal*100)+"%";
  if(left<=1) platform.restSoon();   /* on screen: the beep does the job, no notification */
  if(left<=0){clearInterval(tInt);document.getElementById("tt").textContent="Go";platform.buzz(200);setTimeout(stopTimer,2500);}
  if(window.focusRing) focusRing();
}
function stopTimer(){if(Date.now()<tEnd-300){cancelPing();platform.restAlert(0);}clearInterval(tInt);document.getElementById("timer").classList.remove("on");if(window.focusRing)focusRing();}

