/* ---------- exercise animations (GFD illustrations, gfd-exercise-art.js) ----------
   The 30 exercises of the default 5-day split and the approved gym and mobility exercises (ART_GYM) have drawn start and end poses. artHtml(id) gives a placeholder;
   it is drawn once it scrolls into view (a closed <details> never does), then loops start -> end -> start.
   Frames are rendered once per exercise and theme and shown as cached SVG images. Tap to pause. */
var ART_STEPS=12, ART_MS=110, ART_HOLD=5, ART_CACHE={}, ART_LIVE=[], ART_TIMER=null, ART_IO=null;
/* approved illustrations (commercial gym and mobility) drawn by the newer generator (gfd-exercise-art-gym.js, loaded on first use;
   rebuild it with tools/build_gym_art.js when approved redraws come from the spec generator).
   Only ids listed here are shown; add an id once Deon approves it. [name, [start, end]] for the label before the script loads. */
var ART_GYM={
  assistdip:["Assisted dip", ["Knees on the pad, arms straight on the dip handles", "Lowered with a slight forward lean until the elbows reach about 90°"]],
  declinecablefly:["Decline cable fly", ["Head down on a decline bench, arms open", "Hands brought together over the lower chest"]],
  flatcablepress:["Flat bench cable press", ["Lying between low pulleys, handles beside the chest", "Pressed straight up over the chest"]],
  floorpress:["Barbell floor press", ["Lying on the floor in the rack, knees bent, bar locked out over the chest", "Bar lowered until the upper arms rest on the floor"]],
  isochestpress:["Iso-lateral chest press", ["Back on the pad, handles beside the chest", "Both arms pressed forward together"]],
  lowhighpress:["Low-to-high cable press", ["Back to low pulleys, handles beside the hips", "Pressed up and forward to eye level"]],
  machinechest:["Seated chest press machine", ["Sitting tall, back on the pad, handles beside the chest", "Handles pressed forward, arms nearly straight"]],
  multigymfly:["Multi-gym pec fly", ["Elbows out at shoulder height, forearms on the pads", "Pads squeezed together in front of the chest"]],
  multigympress:["Multi-gym chest press", ["Back on the pad, handles beside the chest", "Handles pressed forward"]],
  pinpress:["Pin press", ["Bar resting on the safety pins just above the chest", "Pressed up off the pins to straight arms"]],
  sacablepress:["Single-arm cable chest press", ["Back to the pulley, split stance, handle beside the chest", "One arm pressed straight forward"]],
  sachestpress:["Single-arm machine chest press", ["One handle beside the chest, other hand on the thigh", "One arm pressed forward, hips square"]],
  smithbench:["Smith machine bench press", ["Bar unracked, arms straight over the chest", "Bar lowered straight down to mid-chest"]],
  smithincline:["Smith machine incline bench press", ["On an incline bench, bar locked out over the upper chest", "Bar lowered straight down to the upper chest"]],
  widechestpress:["Wide chest press machine", ["Wide grip, handles level with the chest", "Pressed forward, elbows still wide"]],
  cablerot:["Standing cable rotation", ["Side-on to a chest-height pulley, arms straight toward it", "Turned away through the trunk, arms still straight"]],
  kneeraise:["Captain's chair knee raise", ["Forearms on the arm pads, back on the pad, legs hanging", "Knees raised to hip height"]],
  ghdsitup:["GHD sit-up", ["Sitting on the GHD pad, feet locked, leaning back below level", "Sat up past upright"]],
  sledsprint:["Sled sprint", ["Harness round the waist, sprinting, one knee up", "The other knee up, sled dragging behind"]],
  atlas:["Atlas stone load", ["Squatting over the stone, arms wrapped round it", "Stood up and extended the hips, stone over the platform edge"]],
  sledback:["Backward sled drag", ["Facing the sled, straps in the hands, sitting back", "Stepping backward, arms long"]],
  sledfwd:["Forward sled drag", ["Straps over the shoulders, sled behind, leaning forward", "Walking forward step by step"]],
  sledpush:["Sled push", ["Leaning into the sled posts, arms bent, one knee driving", "Driving through the other leg"]],
  yoke:["Yoke carry", ["Yoke on the upper back, hands on the uprights, one step", "Short quick step with the other leg"]],
  flatcablefly:["Flat bench cable fly", ["Lying on a bench between low pulleys, arms open", "Hands brought together over the chest"]],
  inccablefly:["Incline bench cable fly", ["Reclined on an incline bench, arms open", "Hands brought together over the upper chest"]],
  incablepress:["Incline bench cable press", ["Reclined on an incline bench, handles beside the upper chest", "Pressed up over the upper chest"]],
  midfly:["Mid-height cable fly", ["Split stance between the pulleys, arms open at chest height", "Hands brought together in front of the chest"]],
  sacablefly:["Single-arm cable fly", ["Side-on to one pulley, arm open at chest height", "Hand swept across to the middle of the chest"]],
  declinemach:["Decline chest press machine", ["Handles level with the lower chest", "Pressed forward and down"]],
  isodecline:["Iso-lateral decline press", ["Handles level with the lower chest", "Pressed forward and down"]],
  inclinemach:["Incline press machine", ["Leaning back, handles by the upper chest", "Pressed up and forward"]],
  isoincline:["Iso-lateral incline press", ["Leaning back, handles by the upper chest", "Pressed up and forward"]],
  pecdeckfly:["Pec deck fly", ["Elbows out at shoulder height, forearms on the pads", "Pads squeezed together in front of the chest"]],
  sapecdeck:["Single-arm pec deck fly", ["One forearm on its pad, out at shoulder height", "That pad brought across to the middle"]],
  crunch:["Cable rope crunch", ["Kneeling with the back to a high pulley, rope held by the ears", "Crunched down, hands still by the head, hips still"]],
  romanside:["45-degree side bend", ["Side-on over the 45° bench, hip on the pad, bent down sideways", "Side bent up until the body is in one line"]],
  powerjerk:["Power jerk", ["Bar on the front of the shoulders, standing", "Driven up, feet jumped out, caught overhead in a quarter squat"]],
  pushjerk:["Push jerk", ["Bar on the front of the shoulders, standing", "Driven up and caught overhead in a shallow squat"]],
  pushpress:["Push press", ["Bar on the front of the shoulders, standing", "Short dip and drive, bar pressed overhead"]],
  splitjerk:["Split jerk", ["Bar on the front of the shoulders, standing", "Driven up and caught overhead in a split stance"]],
  bbjumpsquat:["Barbell jump squat", ["Bar on the upper back, elbows down, squatted deep", "Jumped straight up, feet off the floor"]],
  thruster:["Barbell thruster", ["Bar on the front of the shoulders, standing", "Front squat, then driven straight up into a press"]],
  snatchbalance:["Snatch balance", ["Bar on the upper back, wide grip, standing", "Dropped under into a deep squat, bar locked out overhead"]],
  axledl:["Axle deadlift", ["Hips down, thick axle bar over the middle of the feet", "Stood up tall with the bar at the thighs"]],
  sledpull:["Sled rope pull", ["Staggered stance, one hand reaching forward on the rope", "Pulled back to the hip as the other hand reaches"]],
  logpress:["Log press", ["Log on the chest, hands on its handles, elbows up", "Dip and drive, log pressed overhead"]],
  tyreflip:["Tyre flip", ["Squatting low, fingers under the edge of the tyre, chest on it", "Stepped in and pushed it over, tyre tipping past upright"]],
  ninetyswitch:["90/90 hip switch", ["Sitting tall, both knees bent to 90 degrees and dropped to one side", "Knees swung over and dropped to the other side"]],
  activeslr:["Active straight leg raise", ["On your back, both legs long", "One straight leg lifted as high as it goes, the other stays flat"]],
  anklecircle:["Ankle circles", ["Standing on one leg, knee lifted, toes pointed", "Toes drawn round in a slow circle"]],
  armcircle:["Arm circles", ["Standing, arms straight out to the sides", "Hands drawn round in small circles"]],
  deepsquat:["Deep squat hold", ["Standing, feet a little wider than the hips", "Sitting deep between the heels, chest up, palms together"]],
  frankenstein:["Frankenstein walk", ["Standing tall, arms straight out in front", "One straight leg kicked up toward the hands"]],
  legswing:["Front-to-back leg swing", ["Standing on one leg, the other swung back", "Leg swung forward and up, knee soft"]],
  inchworm:["Inchworm", ["Folded forward, hands on the floor in front of the feet", "Hands walked out to a straight-arm plank"]],
  kneewall:["Knee-to-wall ankle mobilization", ["Facing the wall, front toes a hand from it, hands on the wall", "Front knee driven forward to touch the wall, heel stays down"]],
  wristrock:["Quadruped wrist rocks", ["Hands and knees, palms flat, fingers forward", "Shoulders rocked forward past the wrists, palms stay flat"]],
  kneedrop:["Lumbar rotations", ["On your back, knees bent, feet flat, arms out wide", "Both knees lowered to one side, shoulders stay down"]],
  scorpion:["Scorpion stretch", ["Face down, arms out wide, legs long", "One leg swung up and over the back, foot reaching toward the other hand"]],
  shouldercars:["Shoulder CARs", ["Arm long by the side, other hand on the hip", "Arm circled as wide as it goes, overhead and behind"]],
  spiderlunge:["Spiderman lunge", ["High plank, hands under the shoulders", "One foot stepped up outside the hand, hips sinking low"]],
  spinecars:["Spinal CARs", ["Spine rolled forward, chin to chest", "Spine arched back, chest lifted"]],
  hipcircle:["Standing hip circles", ["Hands on the hips, feet apart, hips pushed out to one side", "Hips circled round to the other side"]],
  hipgate:["Walking hip opener and closer", ["On one leg, knee lifted in front to hip height", "Knee opened out to the side, then lowered"]],
  kneehug:["Walking knee hug", ["Standing tall, arms by the sides", "One knee hugged to the chest, up on the toes of the other foot"]],
  quadpull:["Walking quad pull", ["Standing tall, arms by the sides", "Heel pulled to the seat, other arm reaching up"]],
  wallslide:["Wall slide", ["Facing the wall, forearms on it, elbows at shoulder height", "Forearms slid up the wall, arms reaching high"]],
  wristcircle:["Wrist circles", ["Forearms forward, hands bent back", "Hands circled round and bent down"]],
  banddisloc:["Band shoulder dislocate", ["Band held wide in front of the hips, arms straight", "Band taken up overhead and back behind the hips"]],
  lowhighfly:["Low-to-high cable fly", ["Pulleys low, arms down and out", "Hands swept up and together at upper chest height"]],
  woodchop:["Cable woodchop", ["Side-on to a high pulley, arms up toward it", "Pulled down and across to the opposite knee, turning through the trunk"]],
  lowhighchop:["Low-to-high cable woodchop", ["Side-on to a low pulley, hands low by the near knee", "Pulled up and across above the opposite shoulder"]],
  pallof:["Pallof press", ["Side-on to a chest-height pulley, handle at the chest", "Pressed straight out, trunk not turning"]],
  abmach:["Ab crunch machine", ["Seated, hands on the handles beside the head", "Crunched forward, hands still by the head, arms riding with the chest"]],
  torsorot:["Rotary torso machine", ["Seated, hands on the pad in front of the chest, turned to one side", "Turned through the trunk to the other side, hands still in front of the chest"]]
};
var ART_GYM_SRC="src/js/gfd-exercise-art-gym.js", ART_GYM_WAIT=null;
function hasArt(id){return !!((window.GFDArt&&GFDArt.EX[id])||ART_GYM.hasOwnProperty(id));}
/* the generator that draws this exercise; calls back once it is loaded */
function artEngine(id,done){
  if(window.GFDArt&&GFDArt.EX[id]) return done(GFDArt);
  if(window.GFDArtGym) return done(GFDArtGym);
  if(!ART_GYM_WAIT){
    ART_GYM_WAIT=[];
    var s=document.createElement("script");
    s.src=ART_GYM_SRC;
    s.onload=function(){var w=ART_GYM_WAIT; ART_GYM_WAIT=null; w.forEach(function(fn){fn(GFDArtGym);});};
    s.onerror=function(){ART_GYM_WAIT=null;};
    document.head.appendChild(s);
  }
  ART_GYM_WAIT.push(done);
}
function artTheme(){
  var t=document.documentElement.getAttribute("data-theme");
  if(t==="light"||t==="dark") return t;
  return window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";
}
function artStill(){return window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;}
function artHtml(id,cls){
  var ex=GFDArt.EX[id]||{name:ART_GYM[id][0],frames:ART_GYM[id][1]};
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
  artEngine(id,function(G){
    /* a cycle (sled drags, carries) runs t over 0..2, one full stride, and loops forward without easing or holds */
    var fr=G.framesOf(id), i=0, cyc=!!G.EX[id].cycle, last=cyc?2*ART_STEPS-1:ART_STEPS;
    c.cycle=cyc; c.hold=!!G.EX[id].hold;
    c.still=fr.map(function(f){return artUrl(G.render(id,theme,f.t,{view:f.view}));});
    function more(){
      var end=Math.min(i+3,last+1);
      for(;i<end;i++) c.anim.push(i===0?c.still[0]:artUrl(G.render(id,theme,i/ART_STEPS,{view:fr[0].view})));
      if(i<=last) return setTimeout(more,0);
      c.ready=true; c.wait.forEach(function(fn){fn(c);}); c.wait=[];
    }
    more();
  });
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
    el._art={img:el.firstChild,frames:c.anim,cycle:c.cycle,hold:c.hold,pos:0,paused:false,vis:true};
    if(ART_LIVE.indexOf(el)<0) ART_LIVE.push(el);
    artRun();
  });
}
/* one timer drives every visible animation: 0..ART_STEPS, a short hold, back down, a short hold (a cycle just loops; a held pose goes in, holds, and starts again) */
function artRun(){
  if(ART_TIMER) return;
  ART_TIMER=setInterval(function(){
    ART_LIVE=ART_LIVE.filter(function(el){return el.isConnected&&el._art;});
    if(!ART_LIVE.length){clearInterval(ART_TIMER);ART_TIMER=null;return;}
    var cyc=2*(ART_STEPS+ART_HOLD);
    ART_LIVE.forEach(function(el){
      var a=el._art; if(a.paused||!a.vis) return;
      if(a.cycle){a.pos=(a.pos+1)%a.frames.length;a.img.src=a.frames[a.pos];return;}
      if(a.hold){a.pos=(a.pos+1)%(3*ART_STEPS);var h=Math.min(a.pos,ART_STEPS);if(a.n!==h){a.n=h;a.img.src=a.frames[h];}return;}
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
