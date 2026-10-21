/* ---------- the "well done" popup after Complete workout ---------- */
var DONE_CHEERS=["Well done!","High five!","Look at you go!","Crushed it!","Strong work!","That’s how it’s done!","Another one in the bank!","Beast mode: complete!","Nailed it!","You showed up and smashed it!"];
var DONE_PR_CHEERS=["New PR! Look at you go!","PR day! High five!","Stronger than ever!","New record. Take a bow!"];
var DONE_SVG='<svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="var(--accent)"/><path d="M22 18h20v8a10 10 0 0 1-20 0z" fill="var(--accent-ink)"/><path d="M22 21h-5a5 5 0 0 0 5 7M42 21h5a5 5 0 0 1-5 7" fill="none" stroke="var(--accent-ink)" stroke-width="2.6" stroke-linecap="round"/><path d="M32 36v6M25 46h14" stroke="var(--accent-ink)" stroke-width="3.2" stroke-linecap="round"/></svg>';
var DONE_LAST=null;
function donePick(a){var i=Math.floor(Math.random()*a.length); if(a.length>1&&a[i]===DONE_LAST) i=(i+1)%a.length; DONE_LAST=a[i]; return a[i];}
function showDone(rec,d,wins){
  var el=document.getElementById("donepop"); if(!el) return;
  var exN={}; rec.sets.forEach(function(x){exN[x.exercise_order]=1;});
  var nEx=Object.keys(exN).length, vol=histVolume(rec), done=rec.sets.filter(function(x){return x.done;}).length;
  var stats=[[fmtDur(rec.duration_sec)||"–","Time"],[String(rec.sets.length),"Sets"+(done&&done<rec.sets.length?" ("+done+" ticked)":"")],[String(nEx),"Exercise"+(nEx===1?"":"s")]];
  if(vol>0) stats.push([fmtKg(vol),"Lifted"]);
  var h='<div class="donecard" role="dialog" aria-modal="true" aria-labelledby="doneTitle"><div class="confetti" aria-hidden="true">'+Array.apply(null,Array(18)).map(function(_,i){return '<i style="--i:'+i+'"></i>';}).join("")+'</div>'+
    DONE_SVG+'<h2 id="doneTitle">'+esc(donePick(wins.prs.length?DONE_PR_CHEERS:DONE_CHEERS))+'</h2>'+
    '<p class="donesub">'+esc(d.title)+' · '+esc(hDate(rec.performed_at))+'</p>'+
    '<div class="donestats">'+stats.map(function(x){return '<div><b>'+esc(x[0])+'</b><span>'+esc(x[1])+'</span></div>';}).join("")+'</div>';
  if(wins.prs.length) h+='<div class="donewins"><h3>New PR'+(wins.prs.length>1?'s':'')+'</h3><ul>'+wins.prs.map(function(p){return '<li><span>'+esc(p.n)+'</span><b>'+fmtNum(p.now)+' kg</b><em>was '+fmtNum(p.was)+'</em></li>';}).join("")+'</ul></div>';
  if(wins.up.length) h+='<div class="donewins up"><h3>Up on last time</h3><ul>'+wins.up.map(function(p){return '<li><span>'+esc(p.n)+'</span><b>+'+fmtNum(p.by)+' kg</b></li>';}).join("")+'</ul></div>';
  h+='<div class="donebtns"><button class="ghost" id="doneHistory">See in History</button><button class="primary" id="doneClose">Done</button></div></div>';
  el.innerHTML=h; el.hidden=false; document.body.style.overflow="hidden";
  var b=document.getElementById("doneClose"); if(b) b.focus();
}
function closeDone(){var el=document.getElementById("donepop"); if(!el||el.hidden) return; el.hidden=true; el.innerHTML=""; document.body.style.overflow="";}
function toast(m){var t=document.getElementById("toast");t.textContent=m;t.classList.add("on");clearTimeout(toast._t);toast._t=setTimeout(function(){t.classList.remove("on");},2600);}

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
  tTotal=sec;tEnd=Date.now()+sec*1000; schedulePing(sec);
  document.getElementById("timer").classList.add("on");
  clearInterval(tInt);tick();tInt=setInterval(tick,250);
}
function tick(){
  var left=Math.max(0,Math.round((tEnd-Date.now())/1000));
  document.getElementById("tt").textContent=Math.floor(left/60)+":"+String(left%60).padStart(2,"0");
  document.getElementById("tbar").style.width=(left/tTotal*100)+"%";
  if(left<=0){clearInterval(tInt);document.getElementById("tt").textContent="Go";try{navigator.vibrate&&navigator.vibrate(200);}catch(e){}setTimeout(stopTimer,2500);}
}
function stopTimer(){if(Date.now()<tEnd-300) cancelPing();clearInterval(tInt);document.getElementById("timer").classList.remove("on");}

