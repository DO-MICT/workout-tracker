/* ---------- spacing fallback for old Android WebViews (flex gap) ----------
   The app spaces flex rows and columns with CSS `gap`. WebViews older than Chrome 84 (still found on some Android 10
   phones, e.g. a Huawei P30 lite with Chrome 80) ignore `gap` on flex containers, so buttons and rows touch.
   On those only, this copies each flex container's gap into margins on its children, and keeps doing so as the
   screen re-renders. Browsers that support flex gap never run any of it.
   Rules: a margin the page already sets is never changed (auto margins included): the gap then goes on the other
   item's side instead. Hidden and absolutely placed children are skipped. Test it on a modern browser with ?fgap=force (zeroes the real gap, then fills it in). */
(function(){
  var force=/[?&]fgap=force\b/.test(location.search);
  function supported(){
    var d=document.createElement("div");
    d.style.cssText="display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden";
    d.appendChild(document.createElement("div")); d.appendChild(document.createElement("div"));
    document.body.appendChild(d); var ok=d.scrollHeight===1; d.remove(); return ok;
  }
  var PROPS=["marginTop","marginRight","marginBottom","marginLeft"];
  function px(v){ var n=parseFloat(v); return isFinite(n)?n:0; }

  /* undo what we set last time, so a re-run starts from the page's own styles */
  function reset(el){
    if(!el.__fg) return;
    PROPS.forEach(function(p){ if(el.__fg.hasOwnProperty(p)) el.style[p]=el.__fg[p]; });
    el.__fg=null;
  }
  function set(el,prop,val){
    if(!el.__fg) el.__fg={};
    if(!el.__fg.hasOwnProperty(prop)) el.__fg[prop]=el.style[prop];
    el.style[prop]=val;
  }
  /* for each item: true when it starts a new line (it begins left of where the item before it ended;
     comparing tops would be fooled by align-items:center) */
  function lineStarts(kids){
    var prevRight=null;
    return kids.map(function(kk){ var r=kk[0].getBoundingClientRect(), st=prevRight===null||r.left<prevRight-0.5; prevRight=r.right; return st; });
  }
  var touched=[];
  function apply(){
    touched.forEach(reset); touched=[];
    var all=document.body.getElementsByTagName("*");
    for(var i=0;i<all.length;i++){
      var c=all[i]; if(c instanceof SVGElement) continue;
      var cs=getComputedStyle(c), disp=cs.display;
      if(disp!=="flex"&&disp!=="inline-flex") continue;
      var rg, cg;
      if(c.__fgGap){ rg=c.__fgGap[0]; cg=c.__fgGap[1]; }
      else { rg=px(cs.rowGap); cg=px(cs.columnGap);
        if(force){ c.__fgGap=[rg,cg]; c.style.rowGap="0px"; c.style.columnGap="0px"; } }
      if(!rg&&!cg) continue;
      var dir=cs.flexDirection, col=dir.indexOf("column")===0, rev=dir.indexOf("reverse")>0, wrap=cs.flexWrap!=="nowrap";
      /* flex items: element children, plus loose text (a button's label next to its icon is a text node) */
      var items=[], kids=[];
      for(var k=0;k<c.childNodes.length;k++){
        var ch=c.childNodes[k];
        if(ch.nodeType===3){ if(/\S/.test(ch.nodeValue)) items.push(null); continue; }
        if(ch.nodeType!==1) continue;
        var kcs=getComputedStyle(ch);
        if(kcs.display==="none"||kcs.position==="absolute"||kcs.position==="fixed") continue;
        items.push([ch,kcs]); kids.push([ch,kcs]);
      }
      if(items.length<2) continue;
      if(!wrap){
        /* one line: the gap goes before each item, or after the one before it when the item is loose text */
        var g=col?rg:cg; if(!g) continue;
        var before=col?(rev?"marginBottom":"marginTop"):(rev?"marginRight":"marginLeft");
        var after=col?(rev?"marginTop":"marginBottom"):(rev?"marginLeft":"marginRight");
        for(var j=1;j<items.length;j++){
          var it=items[j], pv=items[j-1];
          /* before this item if it has no margin there, else after the previous one (an auto margin reads as px,
             so a margin we didn't set is never changed) */
          if(it&&px(it[1][before])===0){ set(it[0],before,g+"px"); touched.push(it[0]); }
          else if(pv&&px(pv[1][after])===0){ set(pv[0],after,g+"px"); touched.push(pv[0]); }
          /* loose text next to an item with its own small margin (a chip's ×, a checkbox): add the gap to that margin */
          else if(it&&!pv&&!it[0].__fg){ set(it[0],before,(px(it[1][before])+g)+"px"); touched.push(it[0]); }
          else if(!it&&pv&&!pv[0].__fg){ set(pv[0],after,(px(pv[1][after])+g)+"px"); touched.push(pv[0]); }
          /* else: both sides already have margins, or two text runs in a row: leave it */
        }
      } else if(!col&&!rev){
        /* wrapping rows: the column gap goes before each item that isn't first on its line, the row gap above every
           line but the first. Lines can change once the margins are in, so measure again (up to three times). */
        var starts=null;
        for(var pass=0;pass<3;pass++){
          var now=lineStarts(kids);
          if(starts&&now.join()===starts.join()) break;
          starts=now;
          kids.forEach(function(kk,ix){
            reset(kk[0]);
            if(cg&&!starts[ix]&&px(kk[1].marginLeft)===0){ set(kk[0],"marginLeft",cg+"px"); touched.push(kk[0]); }
          });
        }
        if(rg){
          var first=true;
          kids.forEach(function(kk,ix){
            if(ix>0&&starts[ix]) first=false;
            if(!first&&px(kk[1].marginTop)===0){ set(kk[0],"marginTop",rg+"px"); touched.push(kk[0]); }
          });
        }
      }
    }
  }
  var queued=false;
  function soon(){ if(queued) return; queued=true; setTimeout(function(){ queued=false; apply(); },60); }
  function start(){
    if(!force&&supported()) return;
    document.documentElement.classList.add("nofgap");
    apply();
    if(window.MutationObserver) new MutationObserver(function(list){
      for(var i=0;i<list.length;i++){
        var m=list[i];
        if(m.type==="attributes"){ soon(); return; }
        /* a clock or counter changing its text doesn't move anything: skip those */
        var nodes=Array.prototype.slice.call(m.addedNodes).concat(Array.prototype.slice.call(m.removedNodes));
        for(var n=0;n<nodes.length;n++) if(nodes[n].nodeType===1){ soon(); return; }
      }
    }).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["class","hidden"]});
    window.addEventListener("resize",soon);
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",start); else start();
})();
