/* ---------- exercise animations (GFD illustrations, gfd-exercise-art.js) ----------
   The 30 exercises of the default 5-day split have drawn start and end poses. artHtml(id) gives a placeholder;
   it is drawn once it scrolls into view (a closed <details> never does), then loops start -> end -> start.
   Frames are rendered once per exercise and theme and shown as cached SVG images. Tap to pause. */
var ART_STEPS=12, ART_MS=110, ART_HOLD=5, ART_CACHE={}, ART_LIVE=[], ART_TIMER=null, ART_IO=null;
function hasArt(id){return !!(window.GFDArt&&GFDArt.EX[id]);}
function artTheme(){
  var t=document.documentElement.getAttribute("data-theme");
  if(t==="light"||t==="dark") return t;
  return window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";
}
function artStill(){return window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;}
function artHtml(id,cls){
  var ex=GFDArt.EX[id];
  return '<div class="exart'+(cls?" "+cls:"")+'" data-art="'+id+'" role="img" aria-label="'+esc(ex.name+": "+ex.frames[0]+", then "+ex.frames[1].charAt(0).toLowerCase()+ex.frames[1].slice(1))+'"></div>';
}
/* the illustration for an exercise, or the old stick figure for exercises without one */
function exFigure(id,f,cls){
  if(hasArt(id)) return artHtml(id,cls);
  var g=figure(f); return g?'<div class="fig'+(cls?" "+cls:"")+'">'+g+'</div>':"";
}
function artUrl(svg){return URL.createObjectURL(new Blob([svg],{type:"image/svg+xml"}));}
/* frame urls for one exercise and theme; built a few at a time so the page stays responsive */
function artFrames(id,theme,done){
  var k=id+"|"+theme, c=ART_CACHE[k];
  if(c&&c.ready) return done(c);
  if(c){c.wait.push(done);return;}
  c=ART_CACHE[k]={ready:false,wait:[done],anim:[],still:[]};
  var fr=GFDArt.framesOf(id), i=0;
  c.still=fr.map(function(f){return artUrl(GFDArt.render(id,theme,f.t,{view:f.view}));});
  function more(){
    var end=Math.min(i+3,ART_STEPS+1);
    for(;i<end;i++) c.anim.push(i===0?c.still[0]:artUrl(GFDArt.render(id,theme,i/ART_STEPS,{view:fr[0].view})));
    if(i<=ART_STEPS) return setTimeout(more,0);
    c.ready=true; c.wait.forEach(function(fn){fn(c);}); c.wait=[];
  }
  more();
}
function artDraw(el){
  var id=el.dataset.art, theme=artTheme();
  el.dataset.theme=theme;
  artFrames(id,theme,function(c){
    if(!el.isConnected||el.dataset.theme!==theme) return;
    if(artStill()){
      el.classList.add("still");
      el.innerHTML='<img alt="" src="'+c.still[0]+'"><img alt="" src="'+c.still[1]+'">';
      return;
    }
    el.classList.remove("still");
    el.innerHTML='<img alt="" src="'+c.anim[0]+'">';
    el._art={img:el.firstChild,frames:c.anim,pos:0,paused:false,vis:true};
    if(ART_LIVE.indexOf(el)<0) ART_LIVE.push(el);
    artRun();
  });
}
/* one timer drives every visible animation: 0..ART_STEPS, a short hold, back down, a short hold */
function artRun(){
  if(ART_TIMER) return;
  ART_TIMER=setInterval(function(){
    ART_LIVE=ART_LIVE.filter(function(el){return el.isConnected&&el._art;});
    if(!ART_LIVE.length){clearInterval(ART_TIMER);ART_TIMER=null;return;}
    var cyc=2*(ART_STEPS+ART_HOLD);
    ART_LIVE.forEach(function(el){
      var a=el._art; if(a.paused||!a.vis) return;
      a.pos=(a.pos+1)%cyc;
      var p=a.pos, n=p<=ART_STEPS?p:p<ART_STEPS+ART_HOLD?ART_STEPS:p<=2*ART_STEPS+ART_HOLD?2*ART_STEPS+ART_HOLD-p:0;
      if(a.n!==n){a.n=n;a.img.src=a.frames[n];}
    });
  },ART_MS);
}
/* call after putting artHtml() on the page */
function artScan(root){
  var els=(root||document).querySelectorAll(".exart:not([data-seen])");
  if(!els.length) return;
  if(!ART_IO&&"IntersectionObserver" in window){
    ART_IO=new IntersectionObserver(function(es){es.forEach(function(e){
      var el=e.target;
      if(el._art) el._art.vis=e.isIntersecting;
      else if(e.isIntersecting&&!el.dataset.theme) artDraw(el);
    });},{rootMargin:"120px"});
  }
  Array.prototype.forEach.call(els,function(el){el.dataset.seen="1"; if(ART_IO) ART_IO.observe(el); else artDraw(el);});
}
/* redraw in the other colours when the theme changes */
function artRetheme(){
  var th=artTheme();
  document.querySelectorAll(".exart[data-theme]").forEach(function(el){if(el.dataset.theme!==th){el._art=null;artDraw(el);}});
}
document.addEventListener("click",function(e){
  var el=e.target.closest&&e.target.closest(".exart");
  if(el&&el._art){el._art.paused=!el._art.paused;el.classList.toggle("paused",el._art.paused);}
});
if(window.matchMedia){
  var artMq=matchMedia("(prefers-color-scheme: dark)");
  if(artMq.addEventListener) artMq.addEventListener("change",artRetheme);
}
/* pick up art wherever a render puts it */
if("MutationObserver" in window){
  var artQueued=false;
  new MutationObserver(function(){
    if(artQueued) return; artQueued=true;
    requestAnimationFrame(function(){artQueued=false;artScan();});
  }).observe(document.body,{childList:true,subtree:true});
}
