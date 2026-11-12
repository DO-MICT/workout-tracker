/* WP17 accessibility check (WCAG 2.2 AA, NFR-5). Run: node tests/a11y/audit.js  (needs playwright + axe-core, see a11y-check.yml)
   Opens the app in device-only mode, walks the main screens in light and dark, in every colour theme, on a phone and a desktop,
   and fails on: any axe WCAG A/AA violation, a tap target under 44 px, or text running off a phone screen at 200% text size. */
const {chromium}=require("playwright");
const fs=require("fs"), path=require("path"), http=require("http");
const axeSrc=fs.readFileSync(require.resolve("axe-core/axe.min.js"),"utf8");
const ROOT=path.resolve(__dirname,"../..");
const TYPES={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".svg":"image/svg+xml",".png":"image/png",".webmanifest":"application/manifest+json"};

/* each screen: how to get there from the one before */
const STEPS=[
  ["sign-up",""],
  ["workout","document.getElementById('onboard').hidden=true;syncTabs();S.dayView='focus';renderDay();"],
  ["workout started","focusClick(document.querySelector('.fx-go[data-fx=start]'));"],
  ["workout tools","focusClick(document.querySelector('.fx-more'));var h=document.querySelector('#fxSheet details.how');if(h)h.open=true;"],
  ["workout list","FX.tools=false;S.dayView='list';renderDay();var x=document.querySelector('details.ex');x.open=true;var h=x.querySelector('details.how');if(h)h.open=true;"],
  ["plans","goTab('plans')"],
  ["stats","goTab('stats');var s=document.querySelector('[data-stats=sample]');if(s)s.click()"],
  ["exercise progress","closeTabSheets();openHistory(DAYS[day].ex[0].id)"],
  ["gear","goTab('gear')"],
  ["more","goTab('more')"],
  ["profile","closeMore();openProfile()"],
  ["library","closeTabSheets();openLibrary()"],
  ["injury note","closeTabSheets();openNote(DAYS[day].ex[0].id)"],
  ["body check-in","closeNote();msOpen('start')"],
  ["body progress","msClose();bpOpen()"],
  ["new plan","closeTabSheets();bpClose();openWizard()"],
];
/* known, accepted exceptions: none yet. Add "screen|rule" with a reason if one is ever needed. */
const ALLOW=new Set([]);

function serve(){
  return new Promise(res=>{const s=http.createServer((q,r)=>{let f=path.join(ROOT,decodeURIComponent(q.url.split("?")[0]));
    if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end();return;}
    r.writeHead(200,{"content-type":TYPES[path.extname(f)]||"application/octet-stream"});fs.createReadStream(f).pipe(r);}).listen(0,"127.0.0.1",()=>res(s));});
}
/* visible tap targets in the top layer smaller than 44x44, counting the invisible ::before hit area (styles.css, WP17) */
function smallTargets(){
  const layers=[...document.querySelectorAll(".sheet,.donepop")].filter(x=>!x.hidden);
  const root=layers.length?layers[layers.length-1]:document.querySelector(".wrap");
  const out=[];
  root.querySelectorAll("button,a[href],input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea,summary,[role=button],[role=slider]").forEach(e=>{
    const r=e.getBoundingClientRect(); if(!r.width||!r.height||getComputedStyle(e).visibility==="hidden") return;
    if(e.closest("label")) return;                                  /* the whole label is the target */
    if(e.closest("p,li")&&getComputedStyle(e).display==="inline") return;   /* a link inside a sentence (WCAG 2.5.8 inline exception) */
    let w=r.width,h=r.height; const b=getComputedStyle(e,"::before");
    if(b.content&&b.content!=="none"&&b.position==="absolute"){w=Math.max(w,parseFloat(b.width)||0);h=Math.max(h,parseFloat(b.height)||0);}
    if(w<43.5||h<43.5) out.push((e.id?"#"+e.id:e.tagName.toLowerCase()+[...e.classList].map(c=>"."+c).join(""))+" "+Math.round(w)+"x"+Math.round(h)+" \""+(e.getAttribute("aria-label")||e.textContent||"").trim().slice(0,30)+"\"");
  });
  return [...new Set(out)];
}
/* anything (not in a scroller) poking out past the right edge of the screen */
function overflow(){
  const layers=[...document.querySelectorAll(".sheet")].filter(x=>!x.hidden);
  const root=layers.length?layers[layers.length-1]:document.querySelector(".wrap"), W=document.documentElement.clientWidth, out=[];
  const scrolls=e=>{for(let a=e.parentElement;a&&a!==root;a=a.parentElement){const o=getComputedStyle(a).overflowX;if(o==="auto"||o==="scroll")return true;}return false;};
  root.querySelectorAll("*").forEach(e=>{const r=e.getBoundingClientRect(); if(r.width&&r.right>W+1&&!e.closest("svg,table")&&!scrolls(e)) out.push((e.id?"#"+e.id:e.tagName.toLowerCase()+[...e.classList].map(c=>"."+c).join(""))+" ends at "+Math.round(r.right)+"px");});
  return [...new Set(out)].slice(0,5);
}

(async()=>{
  const srv=await serve(), url="http://127.0.0.1:"+srv.address().port+"/app.html";
  const browser=await chromium.launch(), fails=[];
  const runs=[];
  for(const pal of ["","flow","drift","glow"]) for(const scheme of ["light","dark"]) runs.push({pal,scheme,vp:"phone"});
  runs.push({pal:"",scheme:"light",vp:"desktop"},{pal:"",scheme:"dark",vp:"desktop"},{pal:"",scheme:"light",vp:"phone",big:true});
  for(const run of runs){
    const tag=(run.pal||"volt")+"/"+run.scheme+"/"+run.vp+(run.big?"/200% text":"");
    const ctx=await browser.newContext({viewport:run.vp==="phone"?{width:390,height:844}:{width:1280,height:900},colorScheme:run.scheme,hasTouch:run.vp==="phone"});
    const p=await ctx.newPage();
    await p.addInitScript(o=>{window.claude={use:()=>Promise.resolve(null)};   /* device-only mode: no sign-in */
      try{if(o.pal)localStorage.setItem("split5-palette",o.pal);}catch(e){}
      if(o.big)document.addEventListener("DOMContentLoaded",()=>{document.documentElement.style.fontSize="200%";});},run);
    p.on("pageerror",e=>fails.push(tag+" page error: "+e.message));
    await p.goto(url); await p.waitForTimeout(1200);
    for(const [name,js] of STEPS){
      if(js){try{await p.evaluate(js);}catch(e){fails.push(tag+" "+name+": couldn't open ("+e.message.split("\n")[0]+")");continue;} await p.waitForTimeout(350);}
      if(run.big){ const o=await p.evaluate(overflow); if(o.length) fails.push(tag+" "+name+": off the screen: "+o.join("; ")); continue; }
      await p.evaluate(axeSrc);
      const v=await p.evaluate(async()=>(await axe.run(document,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]}})).violations
        .map(x=>({id:x.id,help:x.help,nodes:x.nodes.slice(0,3).map(n=>n.target.join(" ")+" ("+(((n.any[0]||n.all[0]||{}).message)||"").slice(0,90)+")")})));
      v.filter(x=>!ALLOW.has(name+"|"+x.id)).forEach(x=>fails.push(tag+" "+name+": "+x.id+" - "+x.help+": "+x.nodes.join("; ")));
      if(run.vp==="phone"&&!run.pal&&run.scheme==="light"){const s=await p.evaluate(smallTargets); if(s.length) fails.push(tag+" "+name+": tap targets under 44 px: "+s.join("; "));}
    }
    await ctx.close();
  }
  await browser.close(); srv.close();
  if(fails.length){ console.log(fails.length+" accessibility problem(s):\n- "+fails.join("\n- ")); process.exit(1); }
  console.log("Accessibility check passed: "+STEPS.length+" screens x "+runs.length+" setups.");
})();
