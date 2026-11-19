/* ---------- equipment ---------- */
/* [id, name, search aliases] grouped by the body area they mainly train */
var EQUIP=[
 {g:"Chest",items:[["flatbench","Flat bench","bench press"],["inclinebench","Incline bench",""],["declinebench","Decline bench",""],["chestpress","Seated chest press machine",""],["lyingpress","Lying chest press machine","plate loaded"],["pecdeck","Pec deck / fly machine","butterfly"],["inclinepressm","Incline press machine",""]]},
 {g:"Back",items:[["latpulldown","Lat pulldown machine","pull down"],["seatedrow","Seated cable row","low row"],["pullupbar","Pull-up bar","chin up"],["assistpull","Assisted pull-up / dip machine","gravitron"],["rowmachine","Chest-supported row machine","iso row"]]},
 {g:"Shoulders",items:[["shoulderpress","Shoulder press machine","overhead press"],["lateralm","Lateral raise machine","delts"],["reardelt","Rear delt machine","reverse fly"]]},
 {g:"Arms",items:[["ezbar","EZ curl bar","skull crusher"],["preacher","Preacher curl bench","scott"],["curlm","Bicep curl machine","biceps"],["tricepm","Tricep extension machine","triceps"],["dipstation","Dip station / parallel bars","dips"]]},
 {g:"Legs & glutes",items:[["powerrack","Squat rack / power rack","cage"],["legpress","Leg press","sled press"],["hacksquat","Hack squat machine",""],["legext","Leg extension machine","quads"],["lyingcurl","Lying leg curl machine","hamstring"],["seatedcurl","Seated leg curl machine","hamstring"],["standcalf","Standing calf raise machine","calves"],["seatcalf","Seated calf raise machine","calves"],["hipthrustm","Hip thrust machine","glute bridge"],["glutekick","Glute kickback machine","glutes"],["abductor","Hip abductor / adductor machine","inner outer thigh"],["plyobox","Plyo box","box jump step up"],["sled","Push / pull sled","prowler"]]},
 {g:"Core",items:[["abbench","Ab / decline sit-up bench","crunch"],["abwheel","Ab roller wheel",""],["captain","Captain's chair / knee raise station","vkr"],["abcrunchm","Ab crunch machine",""],["torso","Rotary torso machine","obliques"],["medball","Medicine ball","slam ball"],["stabball","Stability / Swiss ball","exercise ball"],["bosu","BOSU ball","balance"]]},
 {g:"Full body",items:[["dumbbells","Dumbbells","db"],["barbell","Olympic barbell","bar"],["plates","Weight plates","discs"],["kettlebells","Kettlebells","kb"],["adjbench","Adjustable bench",""],["cablecross","Cable crossover","pulley"],["functional","Functional trainer / cable column","dual pulley"],["smith","Smith machine",""],["trapbar","Trap / hex bar","deadlift"],["bands","Resistance bands","loop band tube"],["trx","Suspension trainer (TRX)","straps"],["battleropes","Battle ropes",""],["bag","Punching bag","boxing heavy bag"],["weightvest","Weighted vest",""]]},
 {g:"Cardio",items:[["treadmill","Treadmill","run walk"],["bike","Stationary bike","exercise bike upright recumbent"],["spinbike","Spin bike","indoor cycle peloton"],["airbike","Air / assault bike","fan bike echo"],["rower","Rowing machine","row erg concept2"],["elliptical","Elliptical / cross trainer","cross-trainer"],["stairs","Stair climber","stepmill"],["skierg","Ski erg",""],["jumprope","Jump rope","skipping"]]},
 {g:"Bodyweight & mind-body",items:[["yogamat","Fitness mat","yoga pilates mat floor"],["yogablocks","Yoga blocks & strap","yoga"],["foamroller","Foam roller","mobility recovery"],["massageball","Massage / lacrosse ball","mobility recovery"]]}
];
/* locations: each one keeps its own gear list; the active one filters exercises */
function locState(){
  if(!S.locs||!Array.isArray(S.locs.list)||!S.locs.list.length){
    S.locs={active:"loc1",list:[{id:"loc1",name:"Default",gear:Array.isArray(S.gear)?S.gear.slice():[]}]};
  }
  if(S.gear!==undefined) delete S.gear;   /* older single gear list moves into the first location */
  var moved=false;
  S.locs.list.forEach(function(l){
    if(!Array.isArray(l.gear))l.gear=[];
    /* gear deleted at launch: swap it for the kept item(s) once, then save so it syncs (GEAR_NOW in rules.js) */
    var now=GFDRules.gearNow(l.gear);
    if(now.join()!==l.gear.join()){ l.gear=now; moved=true; }
  });
  if(moved) setTimeout(save,0);
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
function locChips(attr,sel){
  var L=locState(); sel=sel||L.active;
  return L.list.map(function(l){return '<button class="chip sm" '+attr+'="'+l.id+'" aria-pressed="'+(l.id===sel)+'">'+esc(l.name)+(l.gear.length?' <span class="lcnt">'+l.gear.length+'</span>':'')+'</button>';}).join("");
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
  if(t.dataset.loc){setLoc(t.dataset.loc);LOC_MODE=null;gearChanged();var b=document.querySelector('[data-loc="'+t.dataset.loc+'"]');if(b)b.focus();return true;}
  if(t.dataset.bdloc&&BD){BD.loc=t.dataset.bdloc;BD.dirty=true;if(BD.wizard&&WZ)WZ.locs[WZ.cur]=BD.loc;renderBuilder();var b2=document.querySelector('[data-bdloc="'+BD.loc+'"]');if(b2)b2.focus();return true;}
  if(t.dataset.dayloc){setDayLoc(activePlan().id,DAYS[day].id,t.dataset.dayloc);save();setDayLocMenu(false);renderDay();toast(weekLong(DAYS[day].id)+": training at "+dayLoc(activePlan().id,DAYS[day].id).name);var db=document.getElementById("dayLocBtn");if(db)db.focus();return true;}
  if(t.id==="dayLocBtn"){var dm=document.getElementById("dayLocMenu");setDayLocMenu(dm&&dm.hidden);return true;}
  if(t.id==="dayLocSetup"){setDayLocMenu(false);setLoc(dayLoc(activePlan().id,DAYS[day].id).id);openEquip();return true;}
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
    LOC_MODE=null; save(); gearChanged(); return true;
  }
  if(t.id==="locDel"){
    if(!confirmTap(t,"Delete "+curLoc().name,"Tap again to delete")) return true;
    var L2=locState(), gone=curLoc().name; L2.list=L2.list.filter(function(l){return l.id!==L2.active;}); L2.active=L2.list[0].id;
    save(); gearChanged(); toast(gone+" deleted"); return true;
  }
  if(t.dataset.loccopy){var from=null;locState().list.forEach(function(l){if(l.id===t.dataset.loccopy)from=l;}); if(from){curLoc().gear=from.gear.slice();save();gearChanged();toast("Copied "+from.gear.length+" items from "+from.name);} return true;}
  return false;
}
/* gear or locations changed: redraw the sheet, the location counts and today's workout behind it,
   so the gear check and swap suggestions are right without switching locations */
function gearChanged(){
  renderLocBar(); renderGear();
  if(document.getElementById("day")&&typeof DAYS!=="undefined"&&DAYS&&DAYS[day]) renderDay();
}
function toggleGear(id){
  var g=gear(), k=g.indexOf(id);
  if(k>=0) g.splice(k,1); else g.push(id);
  save(); gearChanged();
  var b=document.querySelector('[data-gear="'+id+'"]'); if(b) b.focus({preventScroll:true});
}
function openEquip(){
  var sh=document.getElementById("equip");
  sh.innerHTML='<div class="sheet-in"><div class="sheet-top"><h2 id="etitle">Equipment</h2><button class="chip" id="closeEquip">Close</button></div>'+
    '<p class="sub">Set up each place you train. Tap what’s there. Exercises are filtered by the location you pick, once you pick something.</p>'+
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
}
/* The picker shows six groups (Pick.png). Ids stay as they are; this only says where each one is listed.
   Anything not named here lands in Other, so a new catalogue item still shows up. */
var EQ_PICK=[
 ["Weights and Cables","dumbbells kettlebells plates bumperplates medball bands weightvest cablecross functional anklestrap ezcablebar latbar maggrip singlehandle straightbar ropeattach tricepv vhandle rowbar"],
 ["Benches","flatbench inclinebench declinebench adjbench preacher abbench"],
 ["Bars","barbell ezbar trapbar pullupbar dipstation powerrack captain"],
 ["Machines","chestpress lyingpress pecdeck inclinepressm platechest latpulldown seatedrow assistpull rowmachine backextm chesttbar dyrowm highrowm lowrowm shrugm shoulderpress lateralm reardelt curlm tricepm legpress seatlegpress hacksquat legext lyingcurl seatedcurl standcalf seatcalf hipthrustm glutekick abductor abcrunchm torso smith sled"],
 ["Cardio","treadmill bike recumbent spinbike airbike rower elliptical stairs skierg jumprope"],
 ["Other",""]
];
function eqPickGroups(q){
  var of={}, out=EQ_PICK.map(function(g){g[1].split(" ").forEach(function(id){if(id)of[id]=g[0];});return {g:g[0],items:[]};});
  EQUIP.forEach(function(G){G.items.forEach(function(it){
    var name=of[it[0]]||"Other", row=out.filter(function(o){return o.g===name;})[0];
    if(!q||(it[1]+" "+it[2]+" "+G.g+" "+name).toLowerCase().indexOf(q)>=0) row.items.push(it);
  });});
  return out;
}
/* thumbnail: the GFD logo as a placeholder for every item until real renders exist (see art/complete_equipment) */
function eqThumb(){return '<svg viewBox="0 0 100 100" width="40" height="40" aria-hidden="true"><rect width="100" height="100" rx="22" fill="#D4FF3A"/><circle cx="50" cy="50" r="37" fill="none" stroke="#0D0F12" stroke-width="8"/><text x="50" y="60" text-anchor="middle" font-family="Archivo,sans-serif" font-weight="900" font-size="30" fill="#0D0F12">GFD</text></svg>';}
/* Equipment not set (nothing picked) means every exercise is available and nothing is filtered or flagged.
   The first pick turns filtering on for that location. Bodyweight needs no pick: it is always available. */
function gearSet(list){return !!(list&&list.length);}
function renderGear(){
  var box=document.getElementById("eqLists"); if(!box) return;
  var qi=document.getElementById("eqSearch"), q=(qi?qi.value:"").trim().toLowerCase();
  var cb=document.getElementById("clearSearch"); if(cb) cb.hidden=!q;
  var mine=gear(), h='', n=0;
  h+='<p class="eqstate">'+(gearSet(mine)?mine.length+' selected at '+esc(curLoc().name)+'. Exercises are matched to these.':'Nothing picked yet, so every exercise shows. Pick what you have to filter them.')+'</p>';
  if(!q||"bodyweight".indexOf(q)>=0) h+='<div class="eqgrid"><div class="eqtile on fixed" role="img" aria-label="Bodyweight, always available"><span class="eqth"><svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true" fill="currentColor"><circle cx="24" cy="9" r="5"/><path d="M8 18h32v4H28v8l5 12h-4l-5-10-5 10h-4l5-12v-8H8z"/></svg></span><span class="eqnm">Bodyweight</span></div></div>';
  eqPickGroups(q).forEach(function(G){
    if(!G.items.length) return; n+=G.items.length;
    h+='<h4 class="eqgh">'+esc(G.g)+'</h4><div class="eqgrid">'+G.items.map(function(it){
      var on=mine.indexOf(it[0])>=0;
      return '<button class="eqtile'+(on?' on':'')+'" data-gear="'+it[0]+'" aria-pressed="'+on+'"><span class="eqth">'+eqThumb(G.g)+'</span><span class="eqnm">'+esc(it[1])+'</span></button>';
    }).join("")+'</div>';
  });
  if(!n&&q) h+='<p class="eqempty">No equipment matches “'+esc(q)+'”.</p>';
  var copyFrom=locState().list.filter(function(l){return l.id!==curLoc().id&&l.gear.length;});
  if(!gearSet(mine)&&!q&&copyFrom.length) h+='<div class="loccopy">'+copyFrom.map(function(l){return '<button class="chip sm" data-loccopy="'+l.id+'">Copy equipment from '+esc(l.name)+'</button>';}).join("")+'</div>';
  box.innerHTML=h;
}
