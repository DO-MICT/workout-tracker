/* ---------- Stats: charts at the top of the progress page ----------
   Volume per day/week/month, body weight from saved measurements, streak, weekly goal and insights.
   Reads the same workouts as the history list: the device log, or the database on the web. */
var ST={range:"week",all:null,sets:[],loading:false};
function stWorkout(w){ return {id:w.id,at:w.performed_at,vol:w.volume_kg!=null?+w.volume_kg:(w.sets?histVolume(w):0),dur:w.duration_sec||0,sample:w.source==="sample"}; }
function stSetsOf(w){ return (w.sets||[]).map(function(s){return {at:w.performed_at,n:s.exercise_name,mg:s.muscle_group,m:s.measure,w:s.weight,r:s.reps};}); }
function statsLoad(){
  ST.loading=true;
  var pend=WEB_MODE?wout():localWorkouts(), all=pend.map(stWorkout), sets=[];
  pend.forEach(function(w){sets=sets.concat(stSetsOf(w));});
  if(!WEB_MODE||!sb||!sbUser){ ST.all=all; ST.sets=sets; ST.loading=false; statsRefresh(); return; }
  var since=new Date(Date.now()-400*864e5).toISOString(), seen={};
  all.forEach(function(w){seen[w.id]=1;});
  Promise.all([
    sb.from("workouts").select("id,performed_at,duration_sec,volume_kg,source").gte("performed_at",since).order("performed_at",{ascending:false}).limit(2000),
    sb.from("workout_sets").select("workout_id,performed_at,exercise_name,muscle_group,measure,weight,reps").gte("performed_at",since).limit(20000)
  ]).then(function(r){
    if(r[0].error||r[1].error) throw r[0].error||r[1].error;
    (r[0].data||[]).forEach(function(w){ if(!seen[w.id]) all.push(stWorkout(w)); });
    (r[1].data||[]).forEach(function(s){ if(!seen[s.workout_id]) sets.push({at:s.performed_at,n:s.exercise_name,mg:s.muscle_group,m:s.measure,w:s.weight,r:s.reps}); });
    ST.all=all; ST.sets=sets; ST.loading=false; statsRefresh();
  }).catch(function(){ ST.all=all; ST.sets=sets; ST.loading=false; statsRefresh(); });
}
function statsRefresh(){ if(H&&!H.ex) renderHistory(true); }

/* ---------- periods ---------- */
var MON3=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function stMonday(d){ var x=new Date(d.getFullYear(),d.getMonth(),d.getDate()); x.setDate(x.getDate()-((x.getDay()+6)%7)); return x; }
function stAdd(d,days){ var x=new Date(d); x.setDate(x.getDate()+days); return x; }
function stPeriod(range,back){
  var now=new Date(), b=[], i;
  if(range==="week"){ var m=stAdd(stMonday(now),-7*back); for(i=0;i<7;i++) b.push({s:stAdd(m,i),e:stAdd(m,i+1),l:"MTWTFSS".charAt(i)}); }
  else if(range==="month"){ var m2=stAdd(stMonday(now),-21-28*back); for(i=0;i<4;i++){var s=stAdd(m2,7*i); b.push({s:s,e:stAdd(s,7),l:s.getDate()+" "+MON3[s.getMonth()]});} }
  else { var n=range==="q"?3:12, y=now.getFullYear(), mo=now.getMonth()-(n-1)-n*back;
    for(i=0;i<n;i++){var s2=new Date(y,mo+i,1); b.push({s:s2,e:new Date(y,mo+i+1,1),l:n===3?MON3[s2.getMonth()]:MON3[s2.getMonth()].charAt(0)});} }
  return {s:b[0].s,e:b[b.length-1].e,b:b};
}
function stIn(at,p){ var t=new Date(at); return t>=p.s&&t<p.e; }
function stNice(v){ if(v<=0) return 3; var raw=v/3, mag=Math.pow(10,Math.floor(Math.log10(raw))); var step=[1,2,2.5,5,10].map(function(k){return k*mag;}).filter(function(x){return x>=raw;})[0]; return step*3; }
function stK(v){ return v>=1000?(Math.round(v/100)/10)+"k":String(Math.round(v)); }
function stDelta(now,prev,unit,down){
  if(!prev) return "";
  var d=now-prev, up=d>=0, txt=unit==="%"?Math.abs(Math.round(d/prev*100))+"%":fmtNum(Math.abs(Math.round(d*10)/10))+" "+unit;
  if(unit==="%"&&Math.round(d/prev*100)===0) return '<span class="stdelta">Same</span>';
  var good=down?!up:up;
  return '<span class="stdelta'+(good?'':' bad')+'">'+(up?"↑ ":"↓ ")+txt+'</span>';
}
var ST_VS={week:"vs last week",month:"vs previous 4 weeks",q:"vs previous 3 months",year:"vs previous year"};
var ST_THIS={week:"this week",month:"last 4 weeks",q:"last 3 months",year:"last 12 months"};

/* weeks in a row with at least one workout (this week counts once you've trained) */
function stStreak(all){
  var weeks={}; all.forEach(function(w){weeks[stMonday(new Date(w.at)).getTime()]=1;});
  var m=stMonday(new Date()), n=0; if(!weeks[m.getTime()]) m=stAdd(m,-7);
  while(weeks[m.getTime()]){n++;m=stAdd(m,-7);}
  return n;
}
function statsStreakChip(){
  if(!ST.all||!ST.all.length) return '';
  var n=stStreak(ST.all);
  return '<span class="ststreak" aria-label="'+n+' week streak">'+ST_FLAME+n+'</span>';
}
var ST_FLAME='<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c.6 3.4 5 5.2 5 10a5 5 0 0 1-10 0c0-2.3 1.2-3.8 2.4-4.8-.1 2 .8 3.3 2 3.6C11 9 10.6 6 12 3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';

function statsHtml(){
  var all=ST.all, range=ST.range;
  var seg='<div class="stseg" role="group" aria-label="Time range">'+[["week","Week"],["month","Month"],["q","3 Months"],["year","Year"]].map(function(o){
    return '<button data-strange="'+o[0]+'" aria-pressed="'+(range===o[0])+'">'+o[1]+'</button>';}).join("")+'</div>';
  if(all===null) return seg+'<p class="eqempty">Loading…</p>';
  var hasSample=all.some(function(w){return w.sample;});
  if(!all.length){
    return '<div class="hempty stempty"><b>Your charts start with your first workout</b><p>Log your sets and tap <b>Complete workout</b>. Volume, streaks and your best lifts show up here.</p>'+
      (!WEB_MODE?'<button class="chip" data-stats="sample">Try it with sample workouts</button>':'')+'</div>';
  }
  var p=stPeriod(range,0), pp=stPeriod(range,1), h=seg;

  /* volume */
  var vols=p.b.map(function(b){var v=0;all.forEach(function(w){var t=new Date(w.at);if(t>=b.s&&t<b.e)v+=w.vol||0;});return v;});
  var tot=vols.reduce(function(a,b){return a+b;},0), prevTot=0;
  all.forEach(function(w){if(stIn(w.at,pp))prevTot+=w.vol||0;});
  var max=stNice(Math.max.apply(null,vols)), best=Math.max.apply(null,vols), today=new Date();
  h+='<section class="stcard"><div class="sthead"><div><span class="stlbl">Volume lifted</span><span class="stbig"><b>'+Math.round(tot).toLocaleString("en-ZA").replace(/,/g," ")+'</b> kg</span></div>'+
    '<div class="stright">'+stDelta(tot,prevTot,"%")+(prevTot?'<span class="stvs">'+ST_VS[range]+'</span>':'')+'</div></div>'+
    '<div class="stchart"><div class="stplot" role="img" aria-label="'+esc("Volume "+ST_THIS[range]+": "+p.b.map(function(b,i){return b.l+" "+Math.round(vols[i])+" kg";}).join(", "))+'">'+
    '<div class="stgrid"><i></i><i></i><i></i><i></i></div><div class="stbars">'+
    vols.map(function(v,i){var cls=!v?"zero":v===best?"best":""; var future=p.b[i].s>today;
      return '<div class="stcol"><div class="stbar '+cls+(future?' future':'')+'" style="height:'+(v?Math.max(4,v/max*100):3)+'%"></div></div>';}).join("")+
    '</div></div><div class="stax">'+[max,max*2/3,max/3,0].map(function(v){return '<span>'+stK(v)+'</span>';}).join("")+'</div>'+
    '<div class="stlabels" style="grid-template-columns:repeat('+p.b.length+',minmax(0,1fr))">'+p.b.map(function(b){return '<span>'+esc(b.l)+'</span>';}).join("")+'</div></div></section>';

  /* body weight from Profile › Measurements */
  var pts=prof().hist.filter(function(x){return x.v&&parseFloat(x.v.weight)>0&&stIn(x.d,p);}).map(function(x){return {t:new Date(x.d),v:parseFloat(x.v.weight)};});
  if(pts.length){
    var vs=pts.map(function(x){return x.v;}), lo=Math.floor(Math.min.apply(null,vs)-0.5), hi=Math.ceil(Math.max.apply(null,vs)+0.5), span=p.e-p.s;
    var xy=pts.map(function(x){return {x:(x.t-p.s)/span*100,y:8+(hi-x.v)/(hi-lo)*84};});
    var avg=vs.reduce(function(a,b){return a+b;},0)/vs.length;
    h+='<section class="stcard"><div class="sthead"><div><span class="stlbl">Body weight</span><span class="stbig"><b>'+fmtNum(Math.round(avg*10)/10)+'</b> kg avg</span></div>'+
      '<div class="stright">'+(pts.length>1?stDelta(vs[vs.length-1],vs[0],"kg",true)+'<span class="stvs">'+ST_THIS[range]+'</span>':'')+'</div></div>'+
      '<div class="stchart"><div class="stplot wt" role="img" aria-label="'+esc("Body weight "+ST_THIS[range]+": "+pts.map(function(x){return hDate(x.t.toISOString(),{day:"numeric",month:"short"})+" "+x.v+" kg";}).join(", "))+'">'+
      '<div class="stgrid three"><i></i><i></i><i></i></div>'+
      '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="'+xy.map(function(q){return q.x.toFixed(2)+","+q.y.toFixed(2);}).join(" ")+'" vector-effect="non-scaling-stroke"/></svg>'+
      xy.map(function(q){return '<i class="stdot" style="left:'+q.x.toFixed(2)+'%;top:'+q.y.toFixed(2)+'%"></i>';}).join("")+
      '</div><div class="stax three">'+[hi,(hi+lo)/2,lo].map(function(v){return '<span>'+fmtNum(v)+'</span>';}).join("")+'</div>'+
      '<div class="stlabels" style="grid-template-columns:repeat('+p.b.length+',minmax(0,1fr))">'+p.b.map(function(b){return '<span>'+esc(b.l)+'</span>';}).join("")+'</div></div></section>';
  } else {
    h+='<section class="stcard stnowt"><div><span class="stlbl">Body weight</span><p>No weight saved '+ST_THIS[range]+'. Capture your measurements to see the trend.</p></div><button class="chip" id="openMeasure">Capture</button></section>';
  }

  /* streak + weekly goal */
  var streak=stStreak(all), wk=stPeriod("week",0), done=all.filter(function(w){return stIn(w.at,wk);}).length;
  var goal=Math.max(1,Math.min(7,(DAYS&&DAYS.length)||3)), frac=Math.min(1,done/goal), C=2*Math.PI*24;
  var dayLeft=7-((new Date().getDay()+6)%7);
  h+='<div class="strow"><section class="stcard sthalf"><div><span class="stlbl">Streak</span><span class="stbig"><b>'+streak+'</b> week'+(streak===1?'':'s')+'</span><span class="stnote">'+(streak?'Keep it going':'Train this week to start one')+'</span></div>'+
    '<div class="string"><svg width="58" height="58" viewBox="0 0 58 58" aria-hidden="true"><circle cx="29" cy="29" r="24" class="sttrack"/><circle cx="29" cy="29" r="24" class="starc" stroke-dasharray="'+(C*frac).toFixed(1)+' '+C.toFixed(1)+'" transform="rotate(-90 29 29)"/></svg>'+ST_FLAME+'</div></section>'+
    '<section class="stcard sthalf stcol2"><span class="stlbl">Weekly goal</span><span class="stbig"><b>'+done+'</b> of '+goal+' workouts</span>'+
    '<div class="stprog"><i style="width:'+(frac*100).toFixed(0)+'%"></i></div><span class="stok">'+(done>=goal?'Goal hit':(goal-done)<=dayLeft?'On track':(goal-done)+' to go')+'</span></section></div>';

  /* insights for the chosen range */
  var inSets=ST.sets.filter(function(s){return stIn(s.at,p);}), top=null;
  inSets.forEach(function(s){ if((s.m||"w")==="w"&&s.w>0&&s.r>0&&(!top||s.w>top.w)) top=s; });
  var durs=all.filter(function(w){return stIn(w.at,p)&&w.dur>0;}).map(function(w){return w.dur;});
  var pdurs=all.filter(function(w){return stIn(w.at,pp)&&w.dur>0;}).map(function(w){return w.dur;});
  var avgD=durs.length?Math.round(durs.reduce(function(a,b){return a+b;},0)/durs.length/60):0;
  var pavgD=pdurs.length?Math.round(pdurs.reduce(function(a,b){return a+b;},0)/pdurs.length/60):0;
  h+='<h3 class="stsec">Insights</h3><div class="strow">'+
    '<section class="stcard sthalf stcol2"><span class="stlbl">Best lift</span>'+(top?'<b class="stname">'+esc(top.n||"")+'</b><span class="stbig sm"><b>'+fmtNum(top.w)+'</b> kg × '+fmtNum(top.r)+'</span>':'<span class="stnote">No weighted sets '+ST_THIS[range]+'</span>')+'</section>'+
    '<section class="stcard sthalf stcol2"><span class="stlbl">Avg session</span>'+(avgD?'<span class="stbig"><b>'+avgD+'</b> min</span>'+(pavgD&&pavgD!==avgD?'<span class="stnote">'+stDelta(avgD,pavgD,"min",true)+' '+ST_VS[range]+'</span>':''):'<span class="stnote">Not timed yet</span>')+'</section></div>';
  var mg={}, nSets=0;
  inSets.forEach(function(s){var k=s.mg||"Other"; mg[k]=(mg[k]||0)+1; nSets++;});
  if(nSets){
    var groups=Object.keys(mg).sort(function(a,b){return mg[b]-mg[a];}), shown=groups.slice(0,3), rest=groups.slice(3).reduce(function(a,k){return a+mg[k];},0);
    var parts=shown.map(function(k){return [k,mg[k]];}); if(rest) parts.push(["Other",rest]);
    var off=0, R=28, CC=2*Math.PI*R;
    h+='<section class="stcard stmuscle"><svg width="80" height="80" viewBox="0 0 76 76" aria-hidden="true"><g transform="rotate(-90 38 38)">'+parts.map(function(pt,i){
        var len=pt[1]/nSets*CC, c='<circle cx="38" cy="38" r="'+R+'" class="stseg'+i+'" stroke-dasharray="'+len.toFixed(2)+' '+CC.toFixed(2)+'" stroke-dashoffset="'+(-off).toFixed(2)+'"/>'; off+=len; return c;}).join("")+'</g></svg>'+
      '<div><span class="stlbl">Sets by muscle</span><ul>'+parts.map(function(pt,i){return '<li><i class="stkey'+i+'"></i>'+Math.round(pt[1]/nSets*100)+'% '+esc(pt[0])+'</li>';}).join("")+'</ul></div></section>';
  }
  if(hasSample) h+='<p class="stsample">Showing sample workouts. <button class="linkbtn" data-stats="clearsample">Remove sample data</button></p>';
  return h;
}

/* ---------- sample data (preview only: the device log, never the web database) ---------- */
function statsSample(){
  var L=wlog(), P=prof(), now=Date.now(), days=DAYS&&DAYS.length?DAYS:[], base={};
  if(!days.length) return;
  var pattern=[0,1,3,4,5];
  for(var wk=12;wk>=0;wk--){
    var mon=stAdd(stMonday(new Date()),-7*wk);
    pattern.slice(0,Math.min(days.length,wk%3===0?3:4)).forEach(function(off,k){
      var at=stAdd(mon,off); at.setHours(17,30,0,0); if(at.getTime()>now) return;
      var d=days[k%days.length], sets=[];
      d.ex.slice(0,6).forEach(function(ex,j){
        if(!base[ex.id]) base[ex.id]=20+((ex.id.length*7+j*11)%50);
        var w=Math.round((base[ex.id]+(12-wk)*0.8)*2)/2;
        for(var i=0;i<Math.min(ex.sets||3,4);i++) sets.push({exercise_id:ex.id,exercise_name:ex.n,muscle_group:ex.mg||(LIB[ex.id]&&LIB[ex.id].mg)||null,exercise_order:j,set_no:i+1,measure:ex.lab||"w",weight:(ex.lab||"w")==="w"?w:null,reps:8+(i%2),done:true,group_tag:null});
      });
      L.push({id:"sample-"+at.getTime(),performed_at:at.toISOString(),started_at:new Date(at.getTime()-(48+k*3)*60000).toISOString(),duration_sec:(48+k*3+(wk%4))*60,
        plan_id:activePlan().id,plan_name:activePlan().name,day_id:d.id,day_title:d.title,location_id:null,location_name:null,source:"sample",app_version:APP_VERSION,who:S.who||0,sets:sets});
    });
  }
  L.sort(function(a,b){return a.performed_at<b.performed_at?-1:1;});
  for(var i=0;i<12;i++){ var dt=new Date(now-(84-i*7)*864e5); P.hist.push({d:dt.toISOString(),v:{weight:String(Math.round((86.4-i*0.35+(i%3?0.2:0))*10)/10)},sample:1}); }
  P.hist.sort(function(a,b){return a.d<b.d?-1:1;});
  save();
}
function statsClearSample(){
  S.wlog=wlog().filter(function(w){return w.source!=="sample";});
  prof().hist=prof().hist.filter(function(x){return !x.sample;});
  save();
}
function statsClick(t){
  if(t.dataset.strange){ST.range=t.dataset.strange;renderHistory(true);var b=document.querySelector('[data-strange="'+ST.range+'"]');if(b)b.focus({preventScroll:true});return true;}
  if(t.dataset.stats==="sample"){statsSample();histReload();statsLoad();toast("Sample workouts added");return true;}
  if(t.dataset.stats==="clearsample"){statsClearSample();histReload();statsLoad();toast("Sample data removed");return true;}
  return false;
}
