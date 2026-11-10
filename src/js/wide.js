/* ---------- tablet and desktop mode (WP16, FR-15) ----------
   From 768 px wide the same app gets a side rail instead of the bottom tab bar (CSS), and three pages change shape:
   - Stats: cards side by side, a date range ("Dates"), compare up to 3 exercises, values on hover;
   - Plans: a week grid with days as columns, drag exercises between days, sets and reps edited in place,
     the exercise library in a side pane, undo and save (Ctrl+Z, Ctrl+S);
   - Workouts (on the Stats page): a table with filters, and tick several to delete them together.
   The phone layout is unchanged and stays the place to log a workout. Everything saves through save(), so the
   sync from WP3 carries big-screen changes to the phone. */
var WIDE_MQ=window.matchMedia?window.matchMedia("(min-width:768px)"):null;
function isWide(){ return !!(WIDE_MQ&&WIDE_MQ.matches); }
function wideApply(){
  document.body.classList.toggle("wide",isWide());
  if(typeof renderPlans==="function") renderPlans();
  if(typeof H!=="undefined"&&H&&!H.ex) renderHistory(true);
}
if(WIDE_MQ){ if(WIDE_MQ.addEventListener) WIDE_MQ.addEventListener("change",wideApply); else if(WIDE_MQ.addListener) WIDE_MQ.addListener(wideApply); }
if(document.body) document.body.classList.toggle("wide",isWide());

/* re-render without losing the text box someone is typing in */
function keepFocus(fn){
  var a=document.activeElement, id=a&&a.id, s=null, e=null;
  try{ if(id&&a.setSelectionRange&&a.type!=="number"&&a.type!=="date"){ s=a.selectionStart; e=a.selectionEnd; } }catch(x){}
  fn();
  if(!id) return;
  var b=document.getElementById(id); if(!b) return;
  b.focus({preventScroll:true});
  try{ if(s!==null&&b.setSelectionRange) b.setSelectionRange(s,e); }catch(x){}
}
function isoDay(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function parseDay(v){ var m=/^(\d{4})-(\d\d)-(\d\d)$/.exec(v||""); return m?new Date(+m[1],+m[2]-1,+m[3]):null; }

/* ======================= Stats: date range ======================= */
function stDatesDefault(){
  if(parseDay(ST.from)&&parseDay(ST.to)) return;
  var t=new Date(); ST.to=isoDay(t); ST.from=isoDay(stAdd(t,-55));
}
/* the picked dates, split into days (up to 2 weeks), weeks (up to 4 months) or months */
function stCustomPeriod(back){
  stDatesDefault();
  var s=parseDay(ST.from), e=stAdd(parseDay(ST.to),1);
  if(!(e>s)){ var x=s; s=stAdd(e,-1); e=stAdd(x,1); }
  var span=Math.round((e-s)/864e5);
  if(back){ s=stAdd(s,-span*back); e=stAdd(e,-span*back); }
  var b=[], d;
  if(span<=14){ for(d=s;d<e;d=stAdd(d,1)) b.push({s:d,e:stAdd(d,1),l:String(d.getDate()),k:"day"}); }
  else if(span<=120){ for(d=s;d<e;d=stAdd(d,7)){ var we=stAdd(d,7); b.push({s:d,e:we<e?we:e,l:d.getDate()+" "+MON3[d.getMonth()],k:"week"}); } }
  else { d=new Date(s.getFullYear(),s.getMonth(),1);
    while(d<e){ var ne=new Date(d.getFullYear(),d.getMonth()+1,1); b.push({s:d<s?s:d,e:ne<e?ne:e,l:MON3[d.getMonth()]+(span>400?" "+String(d.getFullYear()).slice(2):""),k:"month"}); d=ne; } }
  return {s:s,e:e,b:b};
}
function stTipLabel(b){
  if(b.k==="day"||(!b.k&&ST.range==="week")) return hDate(b.s.toISOString(),{weekday:"short",day:"numeric",month:"short"});
  if(b.k==="week"||(!b.k&&ST.range==="month")) return "Week of "+hDate(b.s.toISOString(),{day:"numeric",month:"short"});
  return hDate(b.s.toISOString(),{month:"long",year:"numeric"});
}
function stDatesHtml(){
  stDatesDefault();
  var today=isoDay(new Date());
  return '<div class="stdates"><label>From <input type="date" id="stFrom" value="'+esc(ST.from)+'" max="'+today+'"></label>'+
    '<label>To <input type="date" id="stTo" value="'+esc(ST.to)+'" max="'+today+'"></label>'+
    '<div class="stquick" role="group" aria-label="Quick ranges">'+[[6,"6 weeks"],[13,"3 months"],[26,"6 months"]].map(function(o){return '<button class="chip sm" data-stquick="'+o[0]+'">'+o[1]+'</button>';}).join("")+'</div></div>';
}

/* ======================= Stats: compare exercises ======================= */
var CMP_MAX=3;
/* weighted exercises logged in the range, most sets first */
function cmpOptions(p){
  var n={}; ST.sets.forEach(function(s){ if(s.n&&(s.m||"w")==="w"&&s.w>0&&stIn(s.at,p)) n[s.n]=(n[s.n]||0)+1; });
  return Object.keys(n).sort(function(a,b){return n[b]-n[a]||(a<b?-1:1);});
}
function statsCompareHtml(p){
  var head='<section class="stcard stcmp"><div class="sthead"><div><span class="stlbl">Compare exercises</span><span class="stbig sm"><b>Top weight</b> per workout</span></div></div>';
  if(!can("stats.full")) return head+'<p class="stnote">Put up to 3 lifts on one chart and see how they move together. Part of full stats.</p><button class="chip" data-pro="stats">See Pro</button></section>';
  var opts=cmpOptions(p);
  if(!ST.cmpSet) ST.cmp=opts.slice(0,2);   /* until someone picks, show the two most trained lifts in the range */
  var sel=ST.cmp, wu=U(), conv=function(v){return GFDRules.fromKg(v,wu,1);};
  var h=head+'<div class="cmpctl">'+sel.map(function(nm,i){
      return '<span class="cmpchip"><i class="cmpkey k'+i+'" aria-hidden="true"></i>'+esc(nm)+'<button class="cmprm" data-stcmprm="'+i+'" aria-label="Remove '+esc(nm)+' from the chart">×</button></span>';}).join("");
  var left=opts.filter(function(o){return sel.indexOf(o)<0;});
  if(sel.length<CMP_MAX&&left.length) h+='<select id="stCmpAdd" aria-label="Add an exercise to compare"><option value="">+ Add exercise</option>'+left.slice(0,60).map(function(o){return '<option>'+esc(o)+'</option>';}).join("")+'</select>';
  h+='</div>';
  if(!opts.length) return h+'<p class="stnote">No weighted sets '+ST_THIS[ST.range]+'. Pick another range.</p></section>';
  /* one point per workout day: the heaviest set */
  var series=sel.map(function(nm){
    var by={}; ST.sets.forEach(function(s){ if(s.n===nm&&(s.m||"w")==="w"&&s.w>0&&stIn(s.at,p)){ var k=isoDay(new Date(s.at)); if(!by[k]||s.w>by[k].w) by[k]={t:new Date(s.at),w:+s.w}; } });
    return {n:nm,pts:Object.keys(by).sort().map(function(k){return {t:by[k].t,v:conv(by[k].w)};})};
  }).filter(function(s){return s.pts.length;});
  if(!series.length) return h+'<p class="stnote">Add an exercise to see it here.</p></section>';
  var all=[]; series.forEach(function(s){s.pts.forEach(function(q){all.push(q.v);});});
  var lo=Math.min.apply(null,all), hi=Math.max.apply(null,all); if(hi===lo){hi+=1;lo=Math.max(0,lo-1);}
  var raw=(hi-lo)/3, mag=Math.pow(10,Math.floor(Math.log10(raw))), step=[1,2,2.5,5,10].map(function(k){return k*mag;}).filter(function(v){return v>=raw;})[0];
  lo=Math.max(0,Math.floor(lo/step)*step); hi=Math.ceil(hi/step)*step;
  var W=640,Hh=230,pl=44,pr=128,pt=12,pb=26, span=p.e-p.s;
  var X=function(t){return pl+(t-p.s)/span*(W-pl-pr);}, Y=function(v){return pt+(hi-v)*(Hh-pt-pb)/(hi-lo);};
  var ticks=[]; for(var tv=lo;tv<=hi+step/2;tv+=step) ticks.push(Math.round(tv*100)/100);
  var svg='<svg viewBox="0 0 '+W+' '+Hh+'" class="cmpsvg" role="img" aria-label="'+esc("Top weight per workout "+ST_THIS[ST.range]+" for "+series.map(function(s){return s.n;}).join(", ")+". Table below.")+'">'+
    ticks.map(function(v){return '<line x1="'+pl+'" x2="'+(W-pr)+'" y1="'+Y(v).toFixed(1)+'" y2="'+Y(v).toFixed(1)+'" class="hgrid"/><text x="'+(pl-6)+'" y="'+(Y(v)+4).toFixed(1)+'" text-anchor="end" class="hax">'+fmtNum(v)+'</text>';}).join("")+
    '<text x="'+pl+'" y="'+(Hh-6)+'" class="hax">'+esc(hDate(p.s.toISOString(),{day:"numeric",month:"short"}))+'</text>'+
    '<text x="'+(W-pr)+'" y="'+(Hh-6)+'" text-anchor="end" class="hax">'+esc(hDate(stAdd(p.e,-1).toISOString(),{day:"numeric",month:"short"}))+'</text>'+
    '<line class="cmpx" x1="0" x2="0" y1="'+pt+'" y2="'+(Hh-pb)+'" visibility="hidden"/>';
  /* direct labels at the end of each line, nudged apart so they never overlap */
  var ends=series.map(function(s,i){var q=s.pts[s.pts.length-1];return {i:sel.indexOf(s.n),y:Y(q.v),x:X(q.t),n:s.n,v:q.v};}).sort(function(a,b){return a.y-b.y;});
  for(var k=1;k<ends.length;k++) if(ends[k].y-ends[k-1].y<15) ends[k].y=ends[k-1].y+15;
  series.forEach(function(s){
    var i=sel.indexOf(s.n);
    svg+='<path class="cmpline k'+i+'" d="'+s.pts.map(function(q,j){return (j?"L":"M")+X(q.t).toFixed(1)+" "+Y(q.v).toFixed(1);}).join(" ")+'"/>'+
      s.pts.map(function(q){return '<circle class="cmpdot k'+i+'" cx="'+X(q.t).toFixed(1)+'" cy="'+Y(q.v).toFixed(1)+'" r="4"/>';}).join("");
  });
  ends.forEach(function(e){ var nm=e.n.length>17?e.n.slice(0,16)+"…":e.n; svg+='<text class="cmplbl" x="'+(W-pr+8)+'" y="'+(e.y+4).toFixed(1)+'"><tspan class="cmpv">'+fmtNum(e.v)+'</tspan> '+esc(nm)+'</text>'; });
  svg+='</svg>';
  /* hover data: every point's x, date and values (wideChartHover reads it) */
  var dates={}; series.forEach(function(s){s.pts.forEach(function(q){var k=isoDay(q.t); (dates[k]=dates[k]||{t:q.t,v:{}}).v[s.n]=q.v;});});
  var hov=Object.keys(dates).sort().map(function(k){var d=dates[k];return {x:+(X(d.t)/W*100).toFixed(2),l:hDate(d.t.toISOString(),{weekday:"short",day:"numeric",month:"short"}),
    r:sel.filter(function(n){return d.v[n]!=null;}).map(function(n){return [sel.indexOf(n),n,fmtNum(d.v[n])+" "+wu];})};});
  h+='<div class="cmpchart" data-hover="'+esc(JSON.stringify(hov))+'">'+svg+'<div class="cmptip" hidden></div></div>';
  h+='<details class="cmptable"><summary>Show as a table</summary><table><thead><tr><th>Date</th>'+series.map(function(s){return '<th>'+esc(s.n)+' ('+wu+')</th>';}).join("")+'</tr></thead><tbody>'+
    Object.keys(dates).sort().reverse().map(function(k){var d=dates[k];return '<tr><td>'+esc(hDate(d.t.toISOString(),{day:"numeric",month:"short",year:"numeric"}))+'</td>'+series.map(function(s){return '<td>'+(d.v[s.n]!=null?fmtNum(d.v[s.n]):'–')+'</td>';}).join("")+'</tr>';}).join("")+
    '</tbody></table></details></section>';
  return h;
}
/* crosshair + tooltip on the compare chart */
document.addEventListener("mousemove",function(e){
  var box=e.target.closest&&e.target.closest(".cmpchart");
  document.querySelectorAll(".cmpchart").forEach(function(c){ if(c!==box){ var t=c.querySelector(".cmptip"); if(t&&!t.hidden){t.hidden=true;c.querySelector(".cmpx").setAttribute("visibility","hidden");} } });
  if(!box) return;
  var pts; try{ pts=JSON.parse(box.dataset.hover||"[]"); }catch(x){ return; }
  if(!pts.length) return;
  var r=box.getBoundingClientRect(), px=(e.clientX-r.left)/r.width*100, best=pts[0];
  pts.forEach(function(q){ if(Math.abs(q.x-px)<Math.abs(best.x-px)) best=q; });
  var tip=box.querySelector(".cmptip"), ln=box.querySelector(".cmpx"), vbx=best.x/100*640;
  ln.setAttribute("x1",vbx); ln.setAttribute("x2",vbx); ln.setAttribute("visibility","visible");
  tip.innerHTML='<b>'+esc(best.l)+'</b>'+best.r.map(function(o){return '<span><i class="cmpkey k'+o[0]+'"></i>'+esc(o[1])+' <b>'+esc(o[2])+'</b></span>';}).join("");
  tip.hidden=false;
  tip.style.left=Math.min(best.x,70)+"%"; tip.style.transform=best.x>70?"translateX(-100%)":"translateX(8px)";
});

/* ======================= Workouts table (Stats page) ======================= */
function histFilters(){ if(!H.f) H.f={q:"",plan:"",from:"",to:""}; if(!H.sel) H.sel={}; return H.f; }
function histFiltered(rows){
  var f=histFilters(), q=f.q.trim().toLowerCase(), from=parseDay(f.from), to=parseDay(f.to);
  return rows.filter(function(w){
    if(q&&[w.day_title,w.plan_name,w.location_name].join(" ").toLowerCase().indexOf(q)<0) return false;
    if(f.plan&&(w.plan_name||"")!==f.plan) return false;
    var t=new Date(w.performed_at);
    if(from&&t<from) return false;
    if(to&&t>=stAdd(to,1)) return false;
    return true;
  });
}
function histTableHtml(all){
  var f=histFilters(), rows=histFiltered(all), plans={};
  all.forEach(function(w){ if(w.plan_name) plans[w.plan_name]=1; });
  Object.keys(H.sel).forEach(function(id){ if(!all.some(function(w){return w.id===id;})) delete H.sel[id]; });
  var nSel=rows.filter(function(w){return H.sel[w.id];}).length, allOn=rows.length&&nSel===rows.length;
  var h='<div class="htfilters" role="search" aria-label="Filter workouts">'+
    '<input type="search" id="hfQ" value="'+esc(f.q)+'" placeholder="Search workouts" aria-label="Search workouts" autocomplete="off">'+
    '<select id="hfPlan" aria-label="Plan"><option value="">All plans</option>'+Object.keys(plans).sort().map(function(p){return '<option'+(p===f.plan?' selected':'')+'>'+esc(p)+'</option>';}).join("")+'</select>'+
    '<label>From <input type="date" id="hfFrom" value="'+esc(f.from)+'"></label><label>To <input type="date" id="hfTo" value="'+esc(f.to)+'"></label>'+
    ((f.q||f.plan||f.from||f.to)?'<button class="linkbtn" data-hfclear="1">Clear filters</button>':'')+'</div>';
  if(H.more) h+='<p class="hsmall">Filters look at the '+all.length+' workouts loaded so far. <button class="linkbtn" data-hloadall="1"'+(H.loadAll?' disabled':'')+'>'+(H.loadAll?'Loading…':'Load all')+'</button></p>';
  h+='<div class="htbulk" role="status">'+(nSel?'<b>'+nSel+' selected</b><button class="chip sm danger" data-hbulkdel="1">Delete '+nSel+' workout'+(nSel>1?'s':'')+'</button><button class="linkbtn" data-hbulkclear="1">Clear</button>':'<span>Tick workouts to delete several at once.</span>')+'</div>';
  if(!rows.length) return h+'<p class="eqempty">No workouts match these filters.</p>';
  h+='<table class="htable"><thead><tr><th class="htc"><input type="checkbox" id="hSelAll" aria-label="Select all shown workouts"'+(allOn?' checked':'')+'></th>'+
    '<th>Date</th><th>Workout</th><th>Plan</th><th>Where</th><th class="num">Sets</th><th class="num">Volume</th><th class="num">Time</th><th><span class="vh">Open</span></th></tr></thead><tbody>';
  rows.forEach(function(w){
    var open=!!H.open[w.id];
    h+='<tr class="'+(open?'open ':'')+(H.sel[w.id]?'sel':'')+'"><td class="htc"><input type="checkbox" data-hsel="'+esc(w.id)+'" aria-label="Select '+esc((w.day_title||"Workout")+", "+hDate(w.performed_at))+'"'+(H.sel[w.id]?' checked':'')+'></td>'+
      '<td>'+esc(hDate(w.performed_at,{weekday:"short",day:"numeric",month:"short",year:"numeric"}))+'</td>'+
      '<td><b>'+esc(w.day_title||"Workout")+'</b>'+(w.pending?' <em class="htag">'+(w.edited?'Edit waiting to sync':'Waiting to sync')+'</em>':'')+(w.source==="import"?' <em class="htag imp">From before history</em>':'')+'</td>'+
      '<td>'+esc(w.plan_name||"")+'</td><td>'+esc(w.location_name||"")+'</td>'+
      '<td class="num">'+(w.set_count||0)+'</td><td class="num">'+(+w.volume_kg>0?esc(fmtKg(w.volume_kg)):'')+'</td><td class="num">'+esc(fmtDur(w.duration_sec))+'</td>'+
      '<td><button class="chip sm" data-htog="'+esc(w.id)+'" aria-expanded="'+open+'">'+(open?'Close':'Sets')+'</button></td></tr>';
    if(open) h+='<tr class="htdetail"><td></td><td colspan="8">'+histBodyHtml(w)+'</td></tr>';
  });
  return h+'</tbody></table>';
}
function histBulkDelete(btn){
  var ids=histFiltered(histRows()).filter(function(w){return H.sel[w.id];}).map(function(w){return w.id;});
  if(!ids.length) return;
  if(!confirmTap(btn,btn.textContent,"Tap again to delete "+ids.length)) return;
  btn.disabled=true;
  var done=0, failed=0, chain=Promise.resolve();
  ids.forEach(function(id){ chain=chain.then(function(){ return histDelete(id).then(function(){ done++; if(H){ H.rows=(H.rows||[]).filter(function(w){return w.id!==id;}); delete H.sel[id]; delete H.open[id]; } },function(){ failed++; }); }); });
  chain.then(function(){
    recChanged(); statsLoad(); if(H) renderHistory(true);
    toast(failed?done+" deleted, "+failed+" couldn’t be deleted. Check your connection":done+" workout"+(done>1?"s":"")+" deleted");
  });
}
function wideHistoryClick(t){
  if(!H) return false;
  if(t.dataset.htog){ var id=t.dataset.htog; if(H.open[id]){ delete H.open[id]; if(H.del===id) H.del=null; if(H.edit&&H.edit.id===id) H.edit=null; } else { H.open[id]=true; histOpenSets(id); }
    renderHistory(true); var b=document.querySelector('[data-htog="'+id+'"]'); if(b) b.focus({preventScroll:true}); return true; }
  if(t.dataset.hbulkdel){ histBulkDelete(t); return true; }
  if(t.dataset.hbulkclear){ H.sel={}; renderHistory(true); return true; }
  if(t.dataset.hfclear){ H.f={q:"",plan:"",from:"",to:""}; renderHistory(true); var q=document.getElementById("hfQ"); if(q) q.focus(); return true; }
  if(t.dataset.hloadall){ H.loadAll=true; histMore(); renderHistory(true); return true; }
  return false;
}

/* ======================= Plans: week grid ======================= */
var PG=null; /* {id, d:{ids:[], days:{dayId:{title,ex:[{id,sets,reps,link}]}}}, orig, undo:[], redo:[], dirty, q, mg, target, editing, drag} */
function pgLoad(id){
  var days={}, ids=[];
  buildDaysFor(id).forEach(function(d){ ids.push(d.id); days[d.id]=dayToSrc(d); });
  WEEK.forEach(function(w){ if(!days[w.id]) days[w.id]={title:"Rest day",ex:[]}; });
  var d={ids:ids,days:days};
  PG={id:id,d:d,orig:JSON.stringify(d),undo:[],redo:[],dirty:false,q:PG?PG.q:"",mg:PG?PG.mg:"",target:ids[0]||"mon",editing:null,drag:null};
}
function pgSnap(){ PG.undo.push(JSON.stringify(PG.d)); if(PG.undo.length>60) PG.undo.shift(); PG.redo=[]; }
function pgChanged(){ PG.dirty=JSON.stringify(PG.d)!==PG.orig; }
function pgUndo(redo){
  var from=redo?PG.redo:PG.undo, to=redo?PG.undo:PG.redo; if(!from.length){ toast(redo?"Nothing to redo":"Nothing to undo"); return; }
  to.push(JSON.stringify(PG.d)); PG.d=JSON.parse(from.pop()); PG.editing=null; pgChanged(); renderPlans();
  toast(redo?"Redone":"Undone");
}
function pgOrder(ids){ return WEEK.map(function(w){return w.id;}).filter(function(id){return ids.indexOf(id)>=0;}); }
function pgFix(day){ var ex=PG.d.days[day].ex; if(ex.length) ex[ex.length-1].link=false; }
function pgEnsureOn(day){
  if(PG.d.ids.indexOf(day)<0){ PG.d.ids=pgOrder(PG.d.ids.concat([day])); if(PG.d.days[day].title==="Rest day") PG.d.days[day].title="Workout"; }
}
/* move one exercise; idx is the place in the target list before the move */
function pgMove(from,k,to,idx){
  var src=PG.d.days[from].ex, item=src[k]; if(!item) return;
  if(from===to&&(idx===k||idx===k+1)) return;
  pgSnap();
  src.splice(k,1); if(k>0&&src[k-1]) src[k-1].link=false; item.link=false;
  if(from===to&&idx>k) idx--;
  var dst=PG.d.days[to].ex; idx=Math.max(0,Math.min(idx,dst.length));
  if(idx>0&&dst[idx-1].link) dst[idx-1].link=false;
  dst.splice(idx,0,item); pgEnsureOn(to); pgFix(from); pgFix(to); pgChanged();
}
function pgAdd(exId,to,idx){
  var L=LIB[exId]; if(!L) return;
  pgSnap(); var dst=PG.d.days[to].ex; if(idx==null) idx=dst.length;
  if(idx>0&&dst[idx-1]&&dst[idx-1].link) dst[idx-1].link=false;
  dst.splice(idx,0,{id:exId,sets:L.sets||3,reps:L.reps||"10"}); pgEnsureOn(to); pgFix(to); pgChanged();
}
function pgSave(){
  if(!PG||!PG.dirty) { toast("No changes to save"); return; }
  if(planLocked(PG.id)){ proOffer("plans"); return; }
  var id=PG.id, ids=pgOrder(PG.d.ids), days={}, P=plansState(), cp=customById(id);
  if(!ids.length){ toast("Keep at least one training day"); return; }
  ids.forEach(function(d){ var s=PG.d.days[d], o={title:(s.title||"").trim().slice(0,28)||(s.ex.length?"Workout":"Rest day"),ex:s.ex.map(function(x,k,a){return {id:x.id,sets:Math.max(1,Math.min(10,+x.sets||1)),reps:String(x.reps||"").trim().slice(0,12)||(LIB[x.id]&&LIB[x.id].reps)||"10",link:!!x.link&&k<a.length-1};})}; if(s.opt) o.opt=true; days[d]=o; });
  if(cp){ cp.dayIds=ids; cp.days=days; }
  else {
    /* built-in: store only what differs from the original (same rule as the guided setup) */
    var t=tmplById(id); if(!P.meta) P.meta={};
    var m=Object.assign({},P.meta[id]||{}); delete m.dayIds;
    if(ids.join()!==tmplDayIds(t).join()) m.dayIds=ids;
    delete P.meta[id]; delete P.edits[id];
    var orig={}; buildDaysFor(id).forEach(function(d){ orig[d.id]=JSON.stringify(dayToSrc(d)); });
    if(Object.keys(m).length) P.meta[id]=m;
    var ed={}; ids.forEach(function(d){ if(!orig[d]||JSON.stringify(days[d])!==orig[d]) ed[d]=days[d]; });
    if(Object.keys(ed).length) P.edits[id]=ed;
  }
  save(); PG.dirty=false; var keep={q:PG.q,mg:PG.mg,target:PG.target}; pgLoad(id); Object.assign(PG,keep);
  renderAll(); renderPlans(); toast("Plan saved. It’s on your phone as soon as it syncs");
}
function pgLibList(){
  var q=(PG.q||"").trim().toLowerCase();
  var list=Object.keys(LIB).map(function(id){return LIB[id];}).filter(function(L){
    if(PG.mg&&L.mg!==PG.mg) return false;
    return !q||(L.n+" "+L.mg).toLowerCase().indexOf(q)>=0;
  });
  list.sort(function(a,b){ return a.n<b.n?-1:1; });
  return list;
}
var PG_GRIP='<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.6" fill="currentColor"/><circle cx="15" cy="6" r="1.6" fill="currentColor"/><circle cx="9" cy="12" r="1.6" fill="currentColor"/><circle cx="15" cy="12" r="1.6" fill="currentColor"/><circle cx="9" cy="18" r="1.6" fill="currentColor"/><circle cx="15" cy="18" r="1.6" fill="currentColor"/></svg>';
function renderPlanGrid(sh){
  var act=activePlan().id, plans=allPlans();
  if(!PG||!planById(PG.id)) { PG=null; pgLoad(act); }
  else if(!PG.dirty) { var keep={q:PG.q,mg:PG.mg,target:PG.target,undo:PG.undo,redo:PG.redo}; pgLoad(PG.id); Object.assign(PG,keep); }   /* pick up changes synced from the phone */
  var id=PG.id, p=planById(id), ro=planLocked(id)||id==="coles", edited=planEdited(id);
  var h='<div class="sheet-in pgwrap"><div class="sheet-top"><h2 id="pltitle">Workout plans</h2><button class="chip" id="closePlans">Close</button></div>'+planCapHtml();
  h+='<div class="pg"><nav class="pglist" aria-label="Your plans">'+plans.map(function(q){
    return '<button class="pgplan'+(q.id===id?' on':'')+'" data-pgsel="'+q.id+'" aria-pressed="'+(q.id===id)+'"><span>'+esc(q.name)+'</span>'+(q.id===act?'<em class="pltag">Active</em>':planLocked(q.id)?'<em class="ttag">Read only</em>':'')+'</button>';
  }).join("")+'<button class="pgplan pgnew" id="newPlan">+ New plan</button></nav>';
  /* the selected plan */
  h+='<section class="pgmain" aria-labelledby="pgname">';
  if(PL_REN===id) h+='<div class="plren"><input id="plName" maxlength="32" value="'+esc(p.name)+'" aria-label="Plan name"><button class="chip sm" data-saveren="'+id+'">Save</button></div>';
  else h+='<div class="pghead"><h3 id="pgname">'+esc(p.name)+'</h3>'+(id===act?'<span class="pltag">Active</span>':'')+(edited?'<em class="pgedited">Edited</em>':'')+'</div>';
  h+='<div class="placts">'+(id===act?'':'<button class="chip sm primarychip" data-useplan="'+id+'">Use this plan</button>')+
    (id==="coles"?'':'<button class="chip sm" data-dupplan="'+id+'">Duplicate</button>')+
    (p.builtin?'':'<button class="chip sm" data-renplan="'+id+'">Rename</button><button class="chip sm danger" data-delplan="'+id+'">Delete</button>')+
    (p.builtin&&edited&&id!=="coles"?'<button class="chip sm" data-resetplan="'+id+'">Reset edits</button>':'')+
    (ro?'':'<button class="chip sm" data-editplan="'+id+'">Guided setup</button>')+'</div>';
  if(id==="coles"){
    h+='<p class="pldesc">'+esc(p.desc||"")+' Cole’s Session builds a fresh workout each day, so there is no week to plan.</p></section></div></div>';
    sh.innerHTML=h; return;
  }
  if(planLocked(id)) h+='<p class="plcap">This plan is read only on Free. <button class="linkbtn" data-pro="plans">Unlimited plans with Pro</button></p>';
  h+='<div class="pgbar'+(PG.dirty?' dirty':'')+'" role="status">'+(ro?'<span>Read only</span>':PG.dirty?'<span><b>Unsaved changes</b></span><button class="ghost sm" data-pgdiscard="1">Discard</button><button class="chip sm primarychip" data-pgsave="1">Save changes</button>':'<span>All changes saved</span>')+
    (ro?'':'<span class="pgkeys">Drag exercises between days · <kbd>Alt</kbd>+arrows move the selected card · <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo · <kbd>Ctrl</kbd>+<kbd>S</kbd> save · <kbd>/</kbd> search</span>')+
    '<span class="pgundo"><button class="linkbtn" data-pgundo="1"'+(PG.undo.length&&!ro?'':' disabled')+'>Undo</button><button class="linkbtn" data-pgredo="1"'+(PG.redo.length&&!ro?'':' disabled')+'>Redo</button></span></div>';
  h+='<div class="pgweek'+(ro?' ro':'')+'">';
  WEEK.forEach(function(w){
    var on=PG.d.ids.indexOf(w.id)>=0, d=PG.d.days[w.id];
    h+='<div class="pgcol'+(on?'':' off')+(PG.target===w.id?' pgtarget':'')+'" data-pgcol="'+w.id+'"><div class="pgch"><b>'+w.short+'</b>'+
      (ro?'':'<button class="linkbtn pgtoggle" data-pgday="'+w.id+'" aria-label="'+(on?'Make '+w.long+' a rest day':'Train on '+w.long)+'">'+(on?'Rest':'Train')+'</button>')+'</div>';
    if(on) h+=ro?'<p class="pgtitle">'+esc(d.title)+'</p>':'<input class="pgtitle" id="pgt-'+w.id+'" data-pgtitle="'+w.id+'" maxlength="28" value="'+esc(d.title)+'" aria-label="'+w.long+' workout name">';
    else h+='<p class="pgrest">Rest day</p>';
    h+='<ol class="pgex" data-pgdrop="'+w.id+'" aria-label="'+w.long+' exercises">';
    d.ex.forEach(function(x,k){
      var L=LIB[x.id]||{n:x.id,mg:""}, key=w.id+'|'+k, linked=x.link, inLink=k>0&&d.ex[k-1].link;
      h+='<li class="pgcard'+(linked||inLink?' linked':'')+'" '+(ro?'':'draggable="true" ')+'data-pgcard="'+key+'" tabindex="0" aria-label="'+esc(L.n+", "+x.sets+" sets of "+x.reps)+'">'+
        '<div class="pgcn">'+(ro?'':'<span class="pggrip">'+PG_GRIP+'</span>')+'<b>'+esc(L.n)+'</b>'+(ro?'':'<button class="pgrm" data-pgrm="'+key+'" aria-label="Remove '+esc(L.n)+' from '+w.long+'">×</button>')+'</div>'+
        '<div class="pgcf">'+(ro?'<span>'+esc(x.sets+" × "+x.reps)+'</span>':
          '<input type="number" min="1" max="10" id="pgs-'+key.replace("|","-")+'" data-pgf="'+key+'|sets" value="'+esc(x.sets)+'" aria-label="'+esc(L.n)+' sets" title="Sets">'+
          '<span aria-hidden="true">×</span><input id="pgr-'+key.replace("|","-")+'" data-pgf="'+key+'|reps" maxlength="12" value="'+esc(x.reps)+'" aria-label="'+esc(L.n)+' reps" title="Reps">'+(k<d.ex.length-1?'<button class="pglink" data-pglink="'+key+'" aria-pressed="'+!!linked+'" title="Superset with the next exercise" aria-label="Superset '+esc(L.n)+' with the next exercise"><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button>':''))+'</div></li>';
    });
    h+='</ol>'+(ro?'':'<button class="linkbtn pgaddhere" data-pgtarget="'+w.id+'">+ Add to '+w.short+'</button>')+'</div>';
  });
  h+='</div></section>';
  /* library pane */
  if(!ro){
    var list=pgLibList(), shown=list.slice(0,60);
    h+='<aside class="pglib" aria-label="Exercise library"><h3>Add exercises</h3>'+
      '<label class="pgto">Add to <select id="pgTarget">'+WEEK.map(function(w){return '<option value="'+w.id+'"'+(PG.target===w.id?' selected':'')+'>'+w.long+'</option>';}).join("")+'</select></label>'+
      '<input type="search" id="pgQ" value="'+esc(PG.q)+'" placeholder="Search exercises" aria-label="Search exercises" autocomplete="off">'+
      '<select id="pgMg" aria-label="Muscle group"><option value="">All muscle groups</option>'+MGS.map(function(m){return '<option'+(PG.mg===m?' selected':'')+'>'+m+'</option>';}).join("")+'</select>'+
      '<p class="hsmall">'+list.length+' exercise'+(list.length===1?'':'s')+(list.length>shown.length?', first '+shown.length+' shown':'')+'. Drag one onto a day, or tap Add.</p>'+
      '<ul class="pglibl">'+shown.map(function(L){return '<li draggable="true" data-pglib="'+L.id+'"><span><b>'+esc(L.n)+'</b><em>'+esc(L.mg||"")+'</em></span><button class="chip sm" data-pgadd="'+L.id+'" aria-label="Add '+esc(L.n)+' to '+esc(weekLong(PG.target))+'">Add</button></li>';}).join("")+'</ul></aside>';
  }
  h+='</div></div>';
  var st=sh.scrollTop; sh.innerHTML=h; sh.scrollTop=st;
  if(PL_REN){var i=document.getElementById("plName"); if(i){i.focus();i.select();}}
}
function pgRender(focusSel){ keepFocus(renderPlans); if(focusSel){ var el=document.querySelector(focusSel); if(el) el.focus({preventScroll:false}); } }
function widePlansClick(t){
  if(!PG||!isWide()||document.getElementById("plans").hidden) return false;
  if(t.dataset.pgsel){
    if(t.dataset.pgsel===PG.id) return true;
    if(PG.dirty&&!confirmTap(t,t.textContent,"Discard changes?")) return true;
    PL_REN=null; pgLoad(t.dataset.pgsel); renderPlans(); var b=document.querySelector('[data-pgsel="'+PG.id+'"]'); if(b) b.focus(); return true;
  }
  if(t.dataset.pgsave){ pgSave(); return true; }
  if(t.dataset.pgdiscard){ if(!confirmTap(t,"Discard","Tap again to discard")) return true; pgLoad(PG.id); renderPlans(); toast("Changes discarded"); return true; }
  if(t.dataset.pgundo){ pgUndo(false); return true; }
  if(t.dataset.pgredo){ pgUndo(true); return true; }
  if(t.dataset.pgday){
    var d=t.dataset.pgday, on=PG.d.ids.indexOf(d)>=0;
    if(on&&PG.d.ids.length===1){ toast("Keep at least one training day"); return true; }
    pgSnap();
    if(on) PG.d.ids=PG.d.ids.filter(function(x){return x!==d;}); else pgEnsureOn(d);
    pgChanged(); pgRender('[data-pgday="'+d+'"]'); return true;
  }
  if(t.dataset.pgrm){ var q=t.dataset.pgrm.split("|"), ex=PG.d.days[q[0]].ex; pgSnap(); var gone=ex.splice(+q[1],1)[0]; if(+q[1]>0&&ex[+q[1]-1]) ex[+q[1]-1].link=ex[+q[1]-1].link&&!!gone.link; pgFix(q[0]); pgChanged(); pgRender('[data-pgtarget="'+q[0]+'"]'); return true; }
  if(t.dataset.pglink){ var r=t.dataset.pglink.split("|"), x=PG.d.days[r[0]].ex[+r[1]]; pgSnap(); x.link=!x.link; pgChanged(); pgRender('[data-pglink="'+t.dataset.pglink+'"]'); return true; }
  if(t.dataset.pgtarget){ PG.target=t.dataset.pgtarget; pgRender("#pgQ"); return true; }
  if(t.dataset.pgadd){ var L=LIB[t.dataset.pgadd]; pgAdd(t.dataset.pgadd,PG.target); pgRender('[data-pgadd="'+t.dataset.pgadd+'"]'); toast((L?L.n:"Exercise")+" added to "+weekLong(PG.target)); return true; }
  return false;
}
function pgInput(el){
  if(!PG||!el.dataset) return false;
  if(el.dataset.pgf){
    var p=el.dataset.pgf.split("|"), x=PG.d.days[p[0]]&&PG.d.days[p[0]].ex[+p[1]]; if(!x) return true;
    if(PG.editing!==el.dataset.pgf){ pgSnap(); PG.editing=el.dataset.pgf; }
    x[p[2]]=p[2]==="sets"?(el.value===""?"":Math.max(1,Math.min(10,+el.value||1))):el.value.slice(0,12);
    pgChanged(); pgBarOnly(); return true;
  }
  if(el.dataset.pgtitle){
    if(PG.editing!=="t"+el.dataset.pgtitle){ pgSnap(); PG.editing="t"+el.dataset.pgtitle; }
    PG.d.days[el.dataset.pgtitle].title=el.value.slice(0,28); pgChanged(); pgBarOnly(); return true;
  }
  if(el.id==="pgQ"){ PG.q=el.value; keepFocus(renderPlans); return true; }
  return false;
}
/* typing only refreshes the save bar, so the box keeps focus */
function pgBarOnly(){
  var bar=document.querySelector(".pgbar"); if(!bar) return;
  var was=bar.classList.contains("dirty"); if(was===PG.dirty) { var u=bar.querySelector("[data-pgundo]"); if(u) u.disabled=!PG.undo.length; return; }
  keepFocus(renderPlans);
}
document.addEventListener("focusout",function(e){ if(PG&&e.target&&e.target.dataset&&(e.target.dataset.pgf||e.target.dataset.pgtitle)) PG.editing=null; });

/* drag and drop: cards between days, library rows onto a day */
function pgDropIndex(list,y){
  var cards=Array.prototype.filter.call(list.children,function(c){return c.dataset.pgcard;});
  for(var i=0;i<cards.length;i++){ var r=cards[i].getBoundingClientRect(); if(y<r.top+r.height/2) return i; }
  return cards.length;
}
function pgClearDrop(){ document.querySelectorAll(".pgdropline").forEach(function(x){x.remove();}); document.querySelectorAll(".pgcol.over").forEach(function(x){x.classList.remove("over");}); }
document.addEventListener("dragstart",function(e){
  if(!PG) return;
  var c=e.target.closest&&e.target.closest("[data-pgcard],[data-pglib]"); if(!c) return;
  PG.drag=c.dataset.pgcard?{card:c.dataset.pgcard}:{lib:c.dataset.pglib};
  try{ e.dataTransfer.effectAllowed=c.dataset.pgcard?"move":"copy"; e.dataTransfer.setData("text/plain",c.dataset.pgcard||c.dataset.pglib); }catch(x){}
  c.classList.add("dragging");
});
document.addEventListener("dragend",function(e){ if(e.target.classList) e.target.classList.remove("dragging"); pgClearDrop(); if(PG) PG.drag=null; });
document.addEventListener("dragover",function(e){
  if(!PG||!PG.drag) return;
  var col=e.target.closest&&e.target.closest("[data-pgcol]"); if(!col) return;
  e.preventDefault();
  var list=col.querySelector("[data-pgdrop]"), idx=pgDropIndex(list,e.clientY);
  if(col.dataset.dropat===String(idx)&&col.classList.contains("over")) return;
  pgClearDrop(); col.classList.add("over"); col.dataset.dropat=idx;
  var line=document.createElement("li"); line.className="pgdropline"; line.setAttribute("aria-hidden","true");
  var cards=Array.prototype.filter.call(list.children,function(c){return c.dataset.pgcard;});
  list.insertBefore(line,cards[idx]||null);
});
document.addEventListener("drop",function(e){
  if(!PG||!PG.drag) return;
  var col=e.target.closest&&e.target.closest("[data-pgcol]"); if(!col){ pgClearDrop(); return; }
  e.preventDefault();
  var to=col.dataset.pgcol, list=col.querySelector("[data-pgdrop]");
  pgClearDrop();
  var idx=pgDropIndex(list,e.clientY), dr=PG.drag; PG.drag=null;
  if(dr.card){ var p=dr.card.split("|"); pgMove(p[0],+p[1],to,idx); renderPlans(); }
  else if(dr.lib){ PG.target=to; pgAdd(dr.lib,to,idx); renderPlans(); }
});

/* ======================= keyboard ======================= */
document.addEventListener("keydown",function(e){
  var mod=e.ctrlKey||e.metaKey, tag=(e.target&&e.target.tagName)||"", typing=/^(INPUT|TEXTAREA|SELECT)$/.test(tag);
  var plansOpen=PG&&isWide()&&!document.getElementById("plans").hidden;
  if(mod&&!e.altKey&&(e.key==="s"||e.key==="S")){
    e.preventDefault();
    if(plansOpen&&PG.dirty){ pgSave(); return; }
    if(typeof H!=="undefined"&&H&&H.edit){ histEditSave(); return; }
    toast("Everything else saves as you go"); return;
  }
  if(!plansOpen) return;
  if(mod&&!typing&&(e.key==="z"||e.key==="Z")){ e.preventDefault(); pgUndo(e.shiftKey); return; }
  if(mod&&!typing&&(e.key==="y"||e.key==="Y")){ e.preventDefault(); pgUndo(true); return; }
  if(e.key==="/"&&!typing){ var q=document.getElementById("pgQ"); if(q){ e.preventDefault(); q.focus(); q.select(); } return; }
  var card=e.target.closest&&e.target.closest("[data-pgcard]");
  if(card&&e.target===card&&e.altKey&&/^Arrow/.test(e.key)&&!document.querySelector(".pgweek.ro")){
    e.preventDefault();
    var p=card.dataset.pgcard.split("|"), day=p[0], k=+p[1], ids=WEEK.map(function(w){return w.id;}), di=ids.indexOf(day), to=day, idx=k;
    if(e.key==="ArrowUp") idx=k-1; else if(e.key==="ArrowDown") idx=k+2;
    else { var nd=ids[di+(e.key==="ArrowLeft"?-1:1)]; if(!nd) return; to=nd; idx=PG.d.days[nd].ex.length; }
    if(idx<0||idx>PG.d.days[to].ex.length) return;
    pgMove(day,k,to,idx);
    var nk=to===day?(e.key==="ArrowUp"?k-1:k+1):PG.d.days[to].ex.length-1;
    renderPlans(); var nc=document.querySelector('[data-pgcard="'+to+'|'+nk+'"]'); if(nc) nc.focus();
    return;
  }
  if(card&&e.target===card&&(e.key==="Delete"||e.key==="Backspace")){ e.preventDefault(); var b=card.querySelector("[data-pgrm]"); if(b) b.click(); }
});
document.addEventListener("input",function(e){
  var el=e.target; if(!el) return;
  if(pgInput(el)) return;
  if(typeof H!=="undefined"&&H&&el.id==="hfQ"){ histFilters().q=el.value; keepFocus(function(){renderHistory(true);}); }
});
document.addEventListener("change",function(e){
  var el=e.target; if(!el) return;
  if(el.id==="stFrom"||el.id==="stTo"){ if(!parseDay(el.value)) return; ST[el.id==="stFrom"?"from":"to"]=el.value; keepFocus(function(){renderHistory(true);}); return; }
  if(el.id==="stCmpAdd"&&el.value){ ST.cmp=(ST.cmp||[]).concat([el.value]).slice(0,CMP_MAX); ST.cmpSet=true; renderHistory(true); var s=document.getElementById("stCmpAdd")||document.querySelector("[data-stcmprm]"); if(s) s.focus(); return; }
  if(PG&&el.id==="pgTarget"){ PG.target=el.value; keepFocus(renderPlans); return; }
  if(PG&&el.id==="pgMg"){ PG.mg=el.value; keepFocus(renderPlans); return; }
  if(typeof H==="undefined"||!H) return;
  if(el.dataset&&el.dataset.hsel){ var id=el.dataset.hsel; histFilters(); if(el.checked) H.sel[id]=true; else delete H.sel[id]; keepFocus(function(){renderHistory(true);}); var cb=document.querySelector('[data-hsel="'+id+'"]'); if(cb) cb.focus({preventScroll:true}); return; }
  if(el.id==="hSelAll"){ histFilters(); histFiltered(histRows()).forEach(function(w){ if(el.checked) H.sel[w.id]=true; else delete H.sel[w.id]; }); keepFocus(function(){renderHistory(true);}); return; }
  if(el.id==="hfPlan"||el.id==="hfFrom"||el.id==="hfTo"){ histFilters()[{hfPlan:"plan",hfFrom:"from",hfTo:"to"}[el.id]]=el.value; keepFocus(function(){renderHistory(true);}); return; }
});
function wideClick(t){
  if(t.dataset.stquick){ var wk=+t.dataset.stquick, td=new Date(); ST.to=isoDay(td); ST.from=isoDay(stAdd(td,-wk*7+1)); renderHistory(true); var b=document.querySelector('[data-stquick="'+wk+'"]'); if(b) b.focus({preventScroll:true}); return true; }
  if(t.dataset.stcmprm!==undefined){ ST.cmp=(ST.cmp||[]).filter(function(x,i){return i!==+t.dataset.stcmprm;}); ST.cmpSet=true; renderHistory(true); var a=document.getElementById("stCmpAdd"); if(a) a.focus({preventScroll:true}); return true; }
  if(wideHistoryClick(t)) return true;
  if(widePlansClick(t)) return true;
  return false;
}
/* runs before the app's own click handler (day.js), so the grid's buttons never reach the phone-only handlers */
document.addEventListener("click",function(e){
  var t=e.target.closest&&e.target.closest("button"); if(!t) return;
  if(wideClick(t)){ e.stopImmediatePropagation(); }
},true);
