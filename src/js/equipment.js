/* ---------- equipment ---------- */
/* [id, name, search aliases] grouped by the body area they mainly train */
var EQUIP=[
 {g:"Chest",items:[["flatbench","Flat bench","bench press"],["inclinebench","Incline bench",""],["declinebench","Decline bench",""],["chestpress","Seated chest press machine",""],["lyingpress","Lying chest press machine","plate loaded"],["pecdeck","Pec deck / fly machine","butterfly"],["inclinepressm","Incline press machine",""],["dipbelt","Dip belt","weighted dips"]]},
 {g:"Back",items:[["latpulldown","Lat pulldown machine","pull down"],["seatedrow","Seated cable row","low row"],["tbar","T-bar row","landmine row"],["pullupbar","Pull-up bar","chin up"],["assistpull","Assisted pull-up / dip machine","gravitron"],["romanchair","Back extension / Roman chair","hyperextension"],["reversehyper","Reverse hyper",""],["rowmachine","Chest-supported row machine","iso row"]]},
 {g:"Shoulders",items:[["shoulderpress","Shoulder press machine","overhead press"],["lateralm","Lateral raise machine","delts"],["reardelt","Rear delt machine","reverse fly"],["landmine","Landmine attachment",""],["uprightrowm","Shrug / upright row machine","traps"]]},
 {g:"Arms",items:[["ezbar","EZ curl bar","skull crusher"],["preacher","Preacher curl bench","scott"],["curlm","Bicep curl machine","biceps"],["tricepm","Tricep extension machine","triceps"],["dipstation","Dip station / parallel bars","dips"],["wristroller","Wrist roller","forearm grip"],["gripper","Hand grippers","forearm grip"],["fatgrips","Thick bar grips","fat gripz"]]},
 {g:"Legs & glutes",items:[["powerrack","Squat rack / power rack","cage"],["legpress","Leg press","sled press"],["hacksquat","Hack squat machine",""],["legext","Leg extension machine","quads"],["lyingcurl","Lying leg curl machine","hamstring"],["seatedcurl","Seated leg curl machine","hamstring"],["standcalf","Standing calf raise machine","calves"],["seatcalf","Seated calf raise machine","calves"],["hipthrustm","Hip thrust machine","glute bridge"],["glutekick","Glute kickback machine","glutes"],["abductor","Hip abductor / adductor machine","inner outer thigh"],["pendulum","Pendulum / belt squat machine",""],["ghd","Glute-ham developer (GHD)","nordic"],["plyobox","Plyo box","box jump step up"],["sled","Push / pull sled","prowler"]]},
 {g:"Core",items:[["abbench","Ab / decline sit-up bench","crunch"],["abwheel","Ab roller wheel",""],["captain","Captain's chair / knee raise station","vkr"],["abstraps","Hanging ab straps",""],["abcrunchm","Ab crunch machine",""],["torso","Rotary torso machine","obliques"],["medball","Medicine ball","slam ball"],["stabball","Stability / Swiss ball","exercise ball"],["bosu","BOSU ball","balance"]]},
 {g:"Full body",items:[["dumbbells","Dumbbells","db"],["barbell","Olympic barbell","bar"],["plates","Weight plates","discs"],["kettlebells","Kettlebells","kb"],["adjbench","Adjustable bench",""],["cablecross","Cable crossover","pulley"],["functional","Functional trainer / cable column","dual pulley"],["smith","Smith machine",""],["trapbar","Trap / hex bar","deadlift"],["bands","Resistance bands","loop band tube"],["trx","Suspension trainer (TRX)","straps"],["battleropes","Battle ropes",""],["bag","Punching bag","boxing heavy bag"],["sandbag","Sandbag",""],["multigym","Home multi-gym","station"],["weightvest","Weighted vest",""]]},
 {g:"Cardio",items:[["treadmill","Treadmill","run walk"],["bike","Stationary bike","exercise bike upright recumbent"],["spinbike","Spin bike","indoor cycle peloton"],["airbike","Air / assault bike","fan bike echo"],["rower","Rowing machine","row erg concept2"],["elliptical","Elliptical / cross trainer","cross-trainer"],["stairs","Stair climber","stepmill"],["skierg","Ski erg",""],["jumprope","Jump rope","skipping"],["curvedtread","Curved / manual treadmill","assault runner"]]},
 {g:"Bodyweight & mind-body",items:[["calisthenics","Calisthenics (bodyweight only)","no equipment street workout"],["rings","Gymnastic rings",""],["parallettes","Parallettes","push-up bars"],["yogamat","Yoga mat","yoga"],["yogablocks","Yoga blocks & strap","yoga"],["pilatesmat","Pilates mat","pilates"],["reformer","Pilates reformer","pilates"],["pilatesring","Pilates ring / magic circle","pilates"],["foamroller","Foam roller","mobility recovery"],["massageball","Massage / lacrosse ball","mobility recovery"],["stretchstrap","Stretching strap","mobility flexibility"]]}
];
/* locations: each one keeps its own gear list; the active one filters exercises */
function locState(){
  if(!S.locs||!Array.isArray(S.locs.list)||!S.locs.list.length){
    S.locs={active:"loc1",list:[{id:"loc1",name:"Gym",gear:Array.isArray(S.gear)?S.gear.slice():[]}]};
  }
  if(S.gear!==undefined) delete S.gear;   /* older single gear list moves into the first location */
  S.locs.list.forEach(function(l){if(!Array.isArray(l.gear))l.gear=[];});
  return S.locs;
}
function curLoc(){var L=locState();for(var i=0;i<L.list.length;i++)if(L.list[i].id===L.active)return L.list[i];L.active=L.list[0].id;return L.list[0];}
function gear(){return curLoc().gear;}
function setLoc(id){var L=locState(); if(L.list.some(function(l){return l.id===id;})){L.active=id;save();}}
var LOC_MODE=null, LOC_SUGG=["Gym","Home","Pilates studio","Hotel","Park","Office"];
function locById(id){var L=locState();for(var i=0;i<L.list.length;i++)if(L.list[i].id===id)return L.list[i];return null;}
/* which location a plan day is trained at (empty = not set, falls back to the location picked in Equipment) */
function dayLocOf(pid,did){var P=plansState();return (P.dayLoc&&P.dayLoc[pid]&&P.dayLoc[pid][did])||"";}
function dayLoc(pid,did){return locById(dayLocOf(pid,did))||curLoc();}
function setDayLoc(pid,did,id){var P=plansState(); if(!P.dayLoc) P.dayLoc={}; if(!P.dayLoc[pid]) P.dayLoc[pid]={}; if(id) P.dayLoc[pid][did]=id; else delete P.dayLoc[pid][did];}
function bLoc(){return (BD&&BD.loc&&locById(BD.loc))||curLoc();}
function bGear(){return bLoc().gear;}
function swapsFor(exId,g,inDay){
  var L=LIB[exId]; if(!L) return [];
  return Object.keys(LIB).map(function(k){return LIB[k];}).filter(function(o){return o.mg===L.mg&&o.id!==exId&&inDay.indexOf(o.id)<0&&!missingFor(o,g).length;})
    .sort(function(a,b){return (a.lab===L.lab?0:1)-(b.lab===L.lab?0:1);}).slice(0,3);
}
function locChips(attr,sel){
  var L=locState(); sel=sel||L.active;
  return L.list.map(function(l){return '<button class="chip sm" '+attr+'="'+l.id+'" aria-pressed="'+(l.id===sel)+'">'+esc(l.name)+' <span class="lcnt">'+l.gear.length+'</span></button>';}).join("");
}
function renderLocBar(){
  var box=document.getElementById("eqLoc"); if(!box) return;
  var L=locState(), cur=curLoc(), h='<div class="locbar"><span class="loclbl">Location</span><div class="locchips" role="group" aria-label="Location">'+locChips("data-loc")+
    (LOC_MODE==="add"?'':'<button class="chip sm locadd" id="locAdd">+ Add location</button>')+'</div>';
  if(LOC_MODE==="add"||LOC_MODE==="rename"){
    var used=L.list.map(function(l){return l.name.toLowerCase();});
    h+='<div class="locform"><label class="bname"><span>'+(LOC_MODE==="add"?'New location':'Rename '+esc(cur.name))+'</span><input id="locName" maxlength="24" value="'+(LOC_MODE==="rename"?esc(cur.name):'')+'" placeholder="e.g. Home, Pilates studio" autocomplete="off"></label>';
    if(LOC_MODE==="add") h+='<div class="locsugg">'+LOC_SUGG.filter(function(s){return used.indexOf(s.toLowerCase())<0;}).map(function(s){return '<button class="chip sm" data-locsugg="'+esc(s)+'">'+esc(s)+'</button>';}).join("")+'</div>';
    h+='<p class="wzerr" id="locErr" role="alert"></p><div class="locbtns"><button class="ghost" id="locCancel">Cancel</button><button class="primary" id="locSave">'+(LOC_MODE==="add"?'Add location':'Save name')+'</button></div></div>';
  } else {
    h+='<div class="locacts"><button class="linkbtn" id="locRename">Rename '+esc(cur.name)+'</button>'+(L.list.length>1?'<button class="linkbtn danger" id="locDel">Delete '+esc(cur.name)+'</button>':'')+'</div>';
  }
  box.innerHTML=h+'</div>';
  if(LOC_MODE){var i=document.getElementById("locName"); if(i){i.focus(); if(LOC_MODE==="rename") i.select();}}
}
function locClick(t){
  if(t.dataset.loc){setLoc(t.dataset.loc);LOC_MODE=null;renderLocBar();renderGear();var b=document.querySelector('[data-loc="'+t.dataset.loc+'"]');if(b)b.focus();return true;}
  if(t.dataset.bdloc&&BD){BD.loc=t.dataset.bdloc;BD.dirty=true;if(BD.wizard&&WZ)WZ.locs[WZ.cur]=BD.loc;renderBuilder();var b2=document.querySelector('[data-bdloc="'+BD.loc+'"]');if(b2)b2.focus();return true;}
  if(t.dataset.dayloc){setDayLoc(activePlan().id,DAYS[day].id,t.dataset.dayloc);save();setDayLocMenu(false);renderDay();toast(weekLong(DAYS[day].id)+": training at "+dayLoc(activePlan().id,DAYS[day].id).name);var db=document.getElementById("dayLocBtn");if(db)db.focus();return true;}
  if(t.id==="dayLocBtn"){var dm=document.getElementById("dayLocMenu");setDayLocMenu(dm&&dm.hidden);return true;}
  if(t.id==="dayLocSetup"){setDayLocMenu(false);setLoc(dayLoc(activePlan().id,DAYS[day].id).id);openEquip();return true;}
  if(t.dataset.swap){
    var pr=t.dataset.swap.split("|"), d=DAYS[day], src=dayToSrc(d), i=-1;
    src.ex.forEach(function(x,k){if(x.id===pr[0])i=k;}); if(i<0) return true;
    var from=LIB[pr[0]], to=LIB[pr[1]];
    src.ex[i]={id:to.id,sets:src.ex[i].sets,reps:to.reps,link:src.ex[i].link};
    setDaySource(d.id,src); OPEN[day+":"+to.id]=true; save(); renderAll(); toast("Swapped "+from.n+" for "+to.n); return true;
  }
  if(t.id==="locAdd"){LOC_MODE="add";renderLocBar();return true;}
  if(t.id==="locRename"){LOC_MODE="rename";renderLocBar();return true;}
  if(t.id==="locCancel"){LOC_MODE=null;renderLocBar();return true;}
  if(t.dataset.locsugg){var i=document.getElementById("locName");i.value=t.dataset.locsugg;i.focus();return true;}
  if(t.id==="locSave"){
    var L=locState(), v=(document.getElementById("locName").value||"").trim(), err=document.getElementById("locErr"), cur=curLoc();
    if(!v){err.textContent="Give the location a name.";return true;}
    if(L.list.some(function(l){return l.name.toLowerCase()===v.toLowerCase()&&!(LOC_MODE==="rename"&&l.id===cur.id);})){err.textContent="You already have a location with that name.";return true;}
    if(LOC_MODE==="add"){var nl={id:"l"+Date.now().toString(36),name:v,gear:[]};L.list.push(nl);L.active=nl.id;toast(v+" added. Pick its equipment");}
    else {cur.name=v;toast("Renamed");}
    LOC_MODE=null; save(); renderLocBar(); renderGear(); return true;
  }
  if(t.id==="locDel"){
    if(!confirmTap(t,"Delete "+curLoc().name,"Tap again to delete")) return true;
    var L2=locState(), gone=curLoc().name; L2.list=L2.list.filter(function(l){return l.id!==L2.active;}); L2.active=L2.list[0].id;
    save(); renderLocBar(); renderGear(); toast(gone+" deleted"); return true;
  }
  if(t.dataset.loccopy){var from=null;locState().list.forEach(function(l){if(l.id===t.dataset.loccopy)from=l;}); if(from){curLoc().gear=from.gear.slice();save();renderLocBar();renderGear();toast("Copied "+from.gear.length+" items from "+from.name);} return true;}
  return false;
}
function toggleGear(id){
  var g=gear(), k=g.indexOf(id);
  if(k>=0) g.splice(k,1); else g.push(id);
  save(); renderGear();
  var b=document.querySelector('[data-gear="'+id+'"]'); if(b) b.focus({preventScroll:true});
}
function openEquip(){
  var sh=document.getElementById("equip");
  sh.innerHTML='<div class="sheet-in"><div class="sheet-top"><h2 id="etitle">Equipment</h2><button class="chip" id="closeEquip">Close</button></div>'+
    '<p class="sub">Set up each place you train. Tap what’s there and it moves to My gear. Exercises are filtered by the location you pick.</p>'+
    '<div id="eqLoc"></div>'+
    '<div class="eqsearch"><input type="search" id="eqSearch" placeholder="Search, e.g. treadmill, yoga, cable" autocomplete="off" aria-label="Search equipment"><button class="linkbtn" id="clearSearch" hidden>Clear</button></div>'+
    '<div id="eqLists"></div></div>';
  sh.hidden=false; sh.scrollTop=0; document.body.style.overflow="hidden";
  LOC_MODE=null; renderLocBar(); renderGear(); sh.focus();
}
function closeEquip(){
  var sh=document.getElementById("equip"); if(!sh||sh.hidden) return;
  sh.hidden=true; sh.innerHTML=""; document.body.style.overflow="";
  if(BD&&BD.wizard){document.body.style.overflow="hidden";renderBuilder();return;}
  var b=document.getElementById("menuBtn"); if(b) b.focus();
}
function renderGear(){
  var box=document.getElementById("eqLists"); if(!box) return;
  var qi=document.getElementById("eqSearch"), q=(qi?qi.value:"").trim().toLowerCase();
  var cb=document.getElementById("clearSearch"); if(cb) cb.hidden=!q;
  var mine=gear(), nMine=0, nAll=0, mineH="", allH="";
  EQUIP.forEach(function(G){
    var hit=G.items.filter(function(it){ return !q || (it[1]+" "+it[2]+" "+G.g).toLowerCase().indexOf(q)>=0; });
    var have=hit.filter(function(it){return mine.indexOf(it[0])>=0;}), rest=hit.filter(function(it){return mine.indexOf(it[0])<0;});
    if(have.length){ nMine+=have.length; mineH+='<div class="eqgrp"><h4>'+esc(G.g)+'</h4><div class="eqchips">'+have.map(function(it){return '<button class="eqchip mine" data-gear="'+it[0]+'" aria-label="Remove '+esc(it[1])+' from my gear"><span aria-hidden="true">✓</span>'+esc(it[1])+'<span class="x" aria-hidden="true">×</span></button>';}).join("")+'</div></div>'; }
    if(rest.length){ nAll+=rest.length; allH+='<div class="eqgrp"><h4>'+esc(G.g)+'</h4><div class="eqchips">'+rest.map(function(it){return '<button class="eqchip" data-gear="'+it[0]+'" aria-label="Add '+esc(it[1])+' to my gear"><span aria-hidden="true">+</span>'+esc(it[1])+'</button>';}).join("")+'</div></div>'; }
  });
  var totalMine=mine.length;
  var h='<section class="eqsec mygear"><h3 class="psec">My gear at '+esc(curLoc().name)+' <span class="eqn">'+totalMine+'</span></h3>';
  var copyFrom=locState().list.filter(function(l){return l.id!==curLoc().id&&l.gear.length;});
  h+= nMine? mineH : '<p class="eqempty">'+(q&&totalMine?'None of your gear matches “'+esc(q)+'”.':'Nothing here yet. Tap equipment below to add it.')+'</p>'+
    (!totalMine&&!q&&copyFrom.length?'<div class="loccopy">'+copyFrom.map(function(l){return '<button class="chip sm" data-loccopy="'+l.id+'">Copy gear from '+esc(l.name)+'</button>';}).join("")+'</div>':'');
  h+='</section><section class="eqsec"><h3 class="psec">All equipment</h3>';
  h+= nAll? allH : '<p class="eqempty">'+(q?'No equipment matches “'+esc(q)+'”.':'You’ve added everything.')+'</p>';
  box.innerHTML=h+'</section>';
}
