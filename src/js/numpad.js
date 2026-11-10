/* One-thumb number boxes (Deon, 10 Nov): hold a box and slide up or down to change it; tap it to type on the GFD keypad.
   Any <input> rendered with numAttrs() takes part. On a touch screen the phone keyboard stays away (readonly + inputmode none)
   and our own keypad opens instead; with a mouse and keyboard the box types as normal.
   Every change is written into the box and fires a normal "input" event, so the screen's own save code runs unchanged.
   "Next" walks to the next box in the same .numgrp (weight, reps, next set); the last one says Done and sends Enter. */
var NUMPAD=(function(){ try{ return window.matchMedia("(pointer:coarse)").matches; }catch(e){ return false; } })();
/* step: how much one notch of a slide changes the box; dec: decimals allowed when typing; unit: shown on the keypad */
function numAttrs(step,dec,unit){
  return ' data-num="'+step+'|'+(dec||0)+'|'+esc(unit||"")+'" autocomplete="off"'+(NUMPAD?' readonly inputmode="none"':' inputmode="'+(dec?'decimal':'numeric')+'"');
}
/* the usual step for a unit label, so callers can just pass the label they show */
function numFor(unit){
  var u=String(unit||"").replace("+","");
  var T={kg:[0.5,2],lb:[0.5,2],km:[0.1,2],min:[1,1],sec:[1,0],reps:[1,0],cm:[0.5,1]}[u]||[1,2];
  return numAttrs(T[0],T[1],u);
}
var NP={press:null,scrub:null,pad:null,until:0};
function npSpec(el){ var p=(el.getAttribute("data-num")||"").split("|"); return {step:+p[0]||1,dec:+p[1]||0,unit:p[2]||""}; }
function npFmt(v){ return String(+(+v).toFixed(2)); }
function npNum(el){ var n=parseFloat(String(el.value).replace(",",".")); return isNaN(n)?null:n; }
function npSet(el,text){ if(el.value===text) return; el.value=text; el.dispatchEvent(new Event("input",{bubbles:true})); }
function npBuzz(){ try{ platform.buzz(6); }catch(e){} }
function npBox(t){ return t&&t.tagName==="INPUT"&&t.hasAttribute("data-num")&&!t.disabled?t:null; }

/* ---------- hold to scroll ---------- */
function npBubble(){
  var b=document.getElementById("npBubble");
  if(!b){ b=document.createElement("div"); b.id="npBubble"; b.setAttribute("aria-hidden","true"); b.hidden=true;
    b.innerHTML='<span class="np-side" id="npUp"></span><span class="np-now" id="npNow"></span><span class="np-unit" id="npUnit"></span><span class="np-side" id="npDn"></span>';
    document.body.appendChild(b); }
  return b;
}
function npBubbleShow(){
  var s=NP.scrub, v=npNum(s.el); if(v==null) v=0;
  document.getElementById("npNow").textContent=npFmt(v); document.getElementById("npUnit").textContent=s.sp.unit;
  document.getElementById("npUp").textContent=npFmt(v+s.sp.step); document.getElementById("npDn").textContent=v-s.sp.step>=0?npFmt(v-s.sp.step):"";
}
/* a short slide moves one notch per 15px; past 150px it speeds up for big jumps.
   Fine steps (0.1, like body weight) speed up much harder, so big jumps are still one slide. */
function npSteps(d,fine){ var a=Math.abs(d), s=a<=150?a/15:fine?10+Math.pow((a-150)/6,1.6):10+(a-150)/6; return Math.round(s)*(d<0?-1:1); }
function npScrubStart(){
  var p=NP.press, el=p.el, sp=npSpec(el), v=npNum(el);
  if(v==null){ var ph=parseFloat(String(el.placeholder||"").replace(",",".")); v=isNaN(ph)?0:ph; }
  npClose(true);
  if(document.activeElement===el) el.blur();
  NP.scrub={el:el,sp:sp,y:p.y,base:Math.round((v==null?0:v)/sp.step),d:0,start:el.value};
  try{ el.setPointerCapture(p.id); }catch(e){}
  el.classList.add("np-live");
  var b=npBubble(); b.hidden=false; npBubbleShow(); npBuzz();
  var r=el.getBoundingClientRect();
  b.style.left=Math.max(8,Math.min(window.innerWidth-140,r.left+r.width/2-66))+"px";
  b.style.top=Math.max(8,r.top-b.offsetHeight-14)+"px";
}
function npScrubMove(y){
  var s=NP.scrub, d=npSteps(s.y-y,s.sp.step<0.5); if(d===s.d) return; s.d=d;
  npSet(s.el,npFmt(Math.max(0,s.base+d)*s.sp.step)); npBubbleShow(); npBuzz();
}
function npScrubEnd(){
  var s=NP.scrub; NP.scrub=null; s.el.classList.remove("np-live"); npBubble().hidden=true; NP.until=Date.now()+450;
  if(s.el.value!==s.start){ s.el.dispatchEvent(new Event("change",{bubbles:true})); s.el.classList.remove("np-saved"); void s.el.offsetWidth; s.el.classList.add("np-saved"); }
}
/* capture phase, so screens that stop pointerdown on their own boxes (body check-in) still get this */
document.addEventListener("pointerdown",function(e){
  var el=npBox(e.target); if(!el||!NUMPAD||e.pointerType==="mouse"||NP.press) return;
  NP.press={el:el,id:e.pointerId,x:e.clientX,y:e.clientY};
  NP.press.timer=setTimeout(function(){ if(NP.press&&NP.press.el===el&&!NP.scrub) npScrubStart(); },180);
},true);
document.addEventListener("pointermove",function(e){
  var p=NP.press; if(!p||e.pointerId!==p.id) return;
  if(NP.scrub){ npScrubMove(e.clientY); return; }
  if(Math.abs(e.clientX-p.x)>10||Math.abs(e.clientY-p.y)>10){ clearTimeout(p.timer); NP.press=null; } /* a swipe: the page scrolls */
},true);
function npUp(e){ var p=NP.press; if(!p||e.pointerId!==p.id) return; clearTimeout(p.timer); NP.press=null; if(NP.scrub) npScrubEnd(); }
document.addEventListener("pointerup",npUp,true);
document.addEventListener("pointercancel",npUp,true);
/* once a hold has started, the slide belongs to the number, not the page */
document.addEventListener("touchmove",function(e){ if(NP.scrub&&e.cancelable) e.preventDefault(); },{passive:false,capture:true});
document.addEventListener("contextmenu",function(e){ if(NUMPAD&&(npBox(e.target)||NP.scrub)) e.preventDefault(); },true);

/* ---------- tap to type on the GFD keypad ---------- */
function npNext(el){
  var g=el.closest(".numgrp"); if(!g) return null;
  var all=[].slice.call(g.querySelectorAll("input[data-num]")).filter(function(x){ return !x.disabled&&x.offsetParent!==null; });
  return all[all.indexOf(el)+1]||null;
}
function npKey(k,cls,label){ return '<button type="button" class="np-key'+(cls?' '+cls:'')+'" data-npk="'+k+'"'+(label?' aria-label="'+label+'"':'')+'>'+k+'</button>'; }
function npOpen(el){
  if(NP.pad&&NP.pad.el===el) return;
  npClose(true);
  var sp=npSpec(el), nx=npNext(el), pad=document.getElementById("npPad");
  if(!pad){ pad=document.createElement("div"); pad.id="npPad"; pad.setAttribute("role","group"); pad.hidden=true; document.body.appendChild(pad); }
  NP.pad={el:el,sp:sp,buf:null,start:el.value};
  pad.setAttribute("aria-label",(el.getAttribute("aria-label")||"Number")+" keypad");
  pad.innerHTML='<div class="np-in"><div class="np-top"><span class="np-lbl">'+esc(el.getAttribute("aria-label")||"")+'</span><span class="np-read" aria-live="polite"><b id="npRead">'+esc(el.value||"0")+'</b> '+esc(sp.unit)+'</span></div><div class="np-keys">'+
    npKey("1")+npKey("2")+npKey("3")+'<button type="button" class="np-key np-back" data-npk="back" aria-label="Delete">⌫</button>'+
    npKey("4")+npKey("5")+npKey("6")+'<button type="button" class="np-key np-go" data-npk="go">'+(nx?"Next":"Done")+'</button>'+
    npKey("7")+npKey("8")+npKey("9")+(sp.dec?npKey(".","","Decimal point"):'<span></span>')+npKey("0","np-zero")+'</div></div>';
  pad.hidden=false; document.body.classList.add("np-open");
  el.classList.add("np-typing");
  try{ el.setSelectionRange(0,el.value.length); }catch(e){}
  var room=window.innerHeight-pad.offsetHeight-16, bot=el.getBoundingClientRect().bottom;
  if(bot>room) el.scrollIntoView({block:"center",behavior:"smooth"});
}
function npClose(keep){
  var P=NP.pad; if(!P) return; NP.pad=null;
  var pad=document.getElementById("npPad"); if(pad) pad.hidden=true;
  document.body.classList.remove("np-open"); P.el.classList.remove("np-typing");
  if(!keep&&P.el.value!==P.start) npSet(P.el,P.start);
  if(P.el.value!==P.start) P.el.dispatchEvent(new Event("change",{bubbles:true}));
  if(document.activeElement===P.el) P.el.blur();
}
function npType(k){
  var P=NP.pad; if(!P) return; var el=P.el, b=P.buf;
  if(k==="go"){
    var nx=npNext(el); npClose(true);
    if(nx){ nx.focus({preventScroll:true}); npOpen(nx); }
    else el.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true}));
    return;
  }
  if(k==="back") b=b==null?"":b.slice(0,-1);
  else if(k==="."){ if(b==null||b==="") b="0."; else if(b.indexOf(".")<0) b+="."; else return; }
  else { b=b==null||b==="0"?k:b+k; var pt=b.split("."); if(pt[0].length>4||(pt[1]||"").length>P.sp.dec) return; }
  P.buf=b; npSet(el,b); npBuzz();
  var rd=document.getElementById("npRead"); if(rd) rd.textContent=b||"0";
  try{ el.setSelectionRange(b.length,b.length); }catch(e){}
}
document.addEventListener("focusin",function(e){
  var el=npBox(e.target); if(!el||!NUMPAD) return;
  if(Date.now()<NP.until||NP.scrub){ el.blur(); return; }
  npOpen(el);
});
/* keep focus in the box while a key is pressed, and close when anything else is tapped */
document.addEventListener("pointerdown",function(e){
  if(!NP.pad) return;
  if(e.target.closest&&e.target.closest("#npPad")){ e.preventDefault(); return; }
  if(npBox(e.target)) return;
  npClose(true);
});
document.addEventListener("click",function(e){
  var k=e.target.closest&&e.target.closest("[data-npk]"); if(!k) return;
  e.preventDefault(); npType(k.getAttribute("data-npk"));
});
document.addEventListener("keydown",function(e){
  if(NP.pad&&e.key==="Escape"){ npClose(false); e.stopPropagation(); }
},true);
document.addEventListener("focusout",function(e){
  if(NP.pad&&e.target===NP.pad.el) setTimeout(function(){ if(NP.pad&&document.activeElement!==NP.pad.el&&!(document.activeElement&&document.activeElement.closest&&document.activeElement.closest("#npPad"))) npClose(true); },0);
});
