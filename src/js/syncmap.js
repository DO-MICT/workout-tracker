/* ---------- sync mapping (WP3) ----------
   Pure functions only: no DOM, no Supabase. store.js uses these; tests/syncmap.test.js runs them in Node.

   The screens keep working on the S object as before. This file turns S into records for the synced tables
   (architecture section 4.1) and back, and works out which fields changed:
   - toRecords(S, uid)      -> {key: {t, id, f}}  key = table + ":" + id, f = the record's fields
   - applyRecords(S, recs)  -> writes the synced parts of S from records (local-only parts are left alone)
   - fromServer(t, row)     -> a record from a sync_pull row, or null for a tombstone
   - diff(prev, next)       -> mutations for sync_push: only changed fields; prefs key by key
   - enqueue(queue, m)      -> merge a mutation into the waiting queue (one entry per record)
   - overlay(f, pending)    -> server fields with this device's waiting changes on top

   Where each part of S goes:
     user_settings  units (kg or lb, WP4), theme, palette, celebrate, plans.active, profile.rest, names; every other key of S that is
                    not local-only goes in prefs (prefs["profile.x"], prefs["plans.x"], prefs["locs.x"] for the
                    extra keys of those objects), so nothing is lost moving off the blob
     about_me       S.about
     locations      S.locs.list (order kept in sort, unknown fields in extra)
     plans          one record per custom plan (body.custom) and per edited built-in plan
                    (body.edits / body.meta), with body.dayLoc for either
     measurements   S.profile.hist, one row per value (a check-in is the rows with the same taken_at)
     exercise_notes nothing yet (setup cues, FR-4.9). S.notes are injury notes: health details, kept in
                    health_limits by health.js only with health consent (WP9), never here.
   Local only (never synced here): the in-progress workout (cur, last), the workout outbox (wout, wlog),
   account, who, v, ts, gearSeedV1, _sync (store.js's link between S and its saved sync state), and the injury notes
   with their upload queue (notes, healthQ, healthSync: health.js). */
(function(root){
  "use strict";
  var LOCAL={v:1,who:1,cur:1,last:1,wout:1,wlog:1,account:1,ts:1,gearSeedV1:1,_sync:1,notes:1,healthQ:1,healthSync:1};
  var MAPPED={units:1,names:1,theme:1,palette:1,celebrate:1,about:1,locs:1,plans:1,profile:1};
  var FIELDS={
    user_settings:["units","theme","palette","celebrate","active_plan","rest_default","display_names","prefs"],
    about_me:["train","level","goal","days_per_week"],
    locations:["local_id","name","gear","sort","extra"],
    plans:["local_id","name","source_template","body"],
    measurements:["taken_at","site","side","value"],
    exercise_notes:["exercise_id","note","kind"]
  };
  var BILATERAL={uarm:1,larm:1,thighs:1,calves:1};
  var NS="6f1c2a52-9d3e-5b7a-8c41-0e5d7b2f9a63";   /* GFD namespace for record ids; never change it */

  /* ---- ids: UUID v5 (SHA-1), so the same user + old id always gives the same record id ---- */
  function sha1(bytes){
    var h0=0x67452301,h1=0xEFCDAB89,h2=0x98BADCFE,h3=0x10325476,h4=0xC3D2E1F0;
    var ml=bytes.length, n=((ml+8)>>6)+1, w=new Array(n*16), i;
    for(i=0;i<w.length;i++) w[i]=0;
    for(i=0;i<ml;i++) w[i>>2]|=bytes[i]<<(24-(i%4)*8);
    w[ml>>2]|=0x80<<(24-(ml%4)*8);
    w[n*16-1]=ml*8;
    var W=new Array(80);
    for(var b=0;b<w.length;b+=16){
      var a=h0,bb=h1,c=h2,d=h3,e=h4;
      for(i=0;i<80;i++){
        if(i<16) W[i]=w[b+i]; else { var x=W[i-3]^W[i-8]^W[i-14]^W[i-16]; W[i]=(x<<1)|(x>>>31); }
        var f,k;
        if(i<20){f=(bb&c)|(~bb&d);k=0x5A827999;} else if(i<40){f=bb^c^d;k=0x6ED9EBA1;}
        else if(i<60){f=(bb&c)|(bb&d)|(c&d);k=0x8F1BBCDC;} else {f=bb^c^d;k=0xCA62C1D6;}
        var t=(((a<<5)|(a>>>27))+f+e+k+W[i])|0;
        e=d;d=c;c=(bb<<30)|(bb>>>2);bb=a;a=t;
      }
      h0=(h0+a)|0;h1=(h1+bb)|0;h2=(h2+c)|0;h3=(h3+d)|0;h4=(h4+e)|0;
    }
    var out=[]; [h0,h1,h2,h3,h4].forEach(function(v){out.push(v>>>24&255,v>>>16&255,v>>>8&255,v&255);});
    return out;
  }
  function utf8(s){
    var out=[]; try{ s=unescape(encodeURIComponent(s)); }catch(e){ s=s.replace(/[^\x00-\x7f]/g,"?"); }
    for(var i=0;i<s.length;i++) out.push(s.charCodeAt(i));
    return out;
  }
  function hex(b){return b.map(function(x){return (x+256).toString(16).slice(1);}).join("");}
  var UUID_CACHE={};
  function uuidv5(name,ns){
    ns=ns||NS; var ck=ns+"|"+name; if(UUID_CACHE[ck]) return UUID_CACHE[ck];
    var nb=[], h=ns.replace(/-/g,""), i;
    for(i=0;i<32;i+=2) nb.push(parseInt(h.substr(i,2),16));
    var d=sha1(nb.concat(utf8(name))).slice(0,16);
    d[6]=(d[6]&15)|0x50; d[8]=(d[8]&63)|0x80;
    var x=hex(d), u=x.slice(0,8)+"-"+x.slice(8,12)+"-"+x.slice(12,16)+"-"+x.slice(16,20)+"-"+x.slice(20);
    UUID_CACHE[ck]=u; return u;
  }
  function recId(uid,kind,local){return uuidv5(uid+":"+kind+":"+local);}

  /* ---- helpers ---- */
  function clone(v){return v===undefined?undefined:JSON.parse(JSON.stringify(v));}
  /* stable JSON: same data -> same text whatever the key order (the database reorders jsonb keys) */
  function canon(v){
    if(v===undefined||v===null) return "null";
    if(Array.isArray(v)) return "["+v.map(canon).join(",")+"]";
    if(typeof v==="object") return "{"+Object.keys(v).filter(function(k){return v[k]!==undefined;}).sort().map(function(k){return JSON.stringify(k)+":"+canon(v[k]);}).join(",")+"}";
    return JSON.stringify(v);
  }
  function isObj(v){return !!v&&typeof v==="object"&&!Array.isArray(v);}
  function str(v,n){return (v===undefined||v===null||v==="")?null:String(v).slice(0,n);}
  function isoOf(d){var t=new Date(d);return isNaN(t)?null:t.toISOString();}
  function num(v){if(v===undefined||v===null||v==="")return null;var n=parseFloat(String(v).replace(",","."));return isFinite(n)?n:null;}

  /* ---- S -> records ---- */
  function toRecords(S,uid){
    var R={}; S=S||{};
    function put(t,id,f){R[t+":"+id]={t:t,id:id,f:f};}
    var prefs={};
    Object.keys(S).forEach(function(k){ if(!LOCAL[k]&&!MAPPED[k]&&S[k]!==undefined&&k.indexOf(".")<0) prefs[k]=clone(S[k]); });
    var prof=isObj(S.profile)?S.profile:{};
    Object.keys(prof).forEach(function(k){ if(k!=="hist"&&k!=="rest"&&prof[k]!==undefined) prefs["profile."+k]=clone(prof[k]); });
    var P=isObj(S.plans)?S.plans:null;
    if(P) Object.keys(P).forEach(function(k){ if(["active","custom","edits","meta","dayLoc"].indexOf(k)<0&&P[k]!==undefined) prefs["plans."+k]=clone(P[k]); });
    var L=isObj(S.locs)?S.locs:null;
    if(L) Object.keys(L).forEach(function(k){ if(k!=="list"&&L[k]!==undefined) prefs["locs."+k]=clone(L[k]); });
    var rest=num(prof.rest);
    put("user_settings",uid,{
      units:S.units==="lb"?"lb":"kg",   /* never null: the column defaults to kg and can't be empty */
      theme:str(S.theme,20), palette:str(S.palette,20), celebrate:str(S.celebrate,20),
      active_plan:P?str(P.active,80):null,
      rest_default:(rest!==null&&rest>=0&&rest<=600)?Math.round(rest):null,
      display_names:Array.isArray(S.names)?clone(S.names):null,
      prefs:prefs
    });
    if(isObj(S.about)){
      var A=S.about, dd=num(A.days);
      put("about_me",uid,{train:str(A.train,40),level:str(A.level,40),goal:str(A.goal,40),
        days_per_week:(dd!==null&&dd>=1&&dd<=7)?Math.round(dd):null});
    }
    if(L&&Array.isArray(L.list)) L.list.forEach(function(l,i){
      if(!l||l.id===undefined||l.id===null||l.id==="") return;
      var extra={}; Object.keys(l).forEach(function(k){ if(k!=="id"&&k!=="name"&&k!=="gear"&&l[k]!==undefined) extra[k]=clone(l[k]); });
      put("locations",recId(uid,"loc",String(l.id)),{local_id:String(l.id).slice(0,80),name:str(l.name,80),
        gear:(Array.isArray(l.gear)?l.gear:[]).filter(function(g){return typeof g==="string"&&g;}),sort:i,extra:extra});
    });
    if(P){
      var ids={}, order=[];
      function add(id){ if(id!==undefined&&id!==null&&id!==""&&!ids[id]){ids[id]=1;order.push(String(id));} }
      (Array.isArray(P.custom)?P.custom:[]).forEach(function(c){ if(c) add(c.id); });
      ["edits","meta","dayLoc"].forEach(function(k){ if(isObj(P[k])) Object.keys(P[k]).forEach(add); });
      order.forEach(function(id){
        var cust=null, pos=-1;
        (Array.isArray(P.custom)?P.custom:[]).forEach(function(c,i){ if(c&&String(c.id)===id&&!cust){cust=c;pos=i;} });
        var body={};
        if(cust){ body.custom=clone(cust); body.pos=pos; }
        else {
          if(isObj(P.edits)&&P.edits[id]!==undefined) body.edits=clone(P.edits[id]);
          if(isObj(P.meta)&&P.meta[id]!==undefined) body.meta=clone(P.meta[id]);
        }
        if(isObj(P.dayLoc)&&P.dayLoc[id]!==undefined) body.dayLoc=clone(P.dayLoc[id]);
        var nm=cust?cust.name:(body.meta&&body.meta.name);
        put("plans",recId(uid,"plan",id),{local_id:id.slice(0,80),name:str(nm,120),source_template:cust?null:id.slice(0,80),body:body});
      });
    }
    (Array.isArray(prof.hist)?prof.hist:[]).forEach(function(e){
      if(!e||!isObj(e.v)) return; var at=isoOf(e.d); if(!at) return;
      Object.keys(e.v).forEach(function(k){
        var n=num(e.v[k]); if(n===null||n<0||n>10000) return;
        var site=k, side=null;
        if(BILATERAL[k]) side="right";
        else if(/L$/.test(k)&&BILATERAL[k.slice(0,-1)]){ site=k.slice(0,-1); side="left"; }
        put("measurements",recId(uid,"m",at+":"+k),{taken_at:at,site:site.slice(0,20),side:side,value:Math.round(n*100)/100});
      });
    });
    return R;
  }

  /* ---- records -> S ---- */
  function byTable(recs,t){ return Object.keys(recs).map(function(k){return recs[k];}).filter(function(r){return r&&r.t===t;}); }
  function applyRecords(S,recs){
    var st=byTable(recs,"user_settings")[0];
    if(!st) return S;   /* nothing on the server yet: keep what's here */
    var f=st.f||{}, prefs=isObj(f.prefs)?f.prefs:{};
    var oldNames=S.names;
    Object.keys(S).forEach(function(k){ if(!LOCAL[k]) delete S[k]; });
    Object.keys(prefs).forEach(function(k){ if(k.indexOf(".")<0) S[k]=clone(prefs[k]); });
    function sub(prefix){ var o={}; Object.keys(prefs).forEach(function(k){ if(k.indexOf(prefix+".")===0) o[k.slice(prefix.length+1)]=clone(prefs[k]); }); return o; }
    if(f.units==="lb") S.units="lb";
    if(f.theme!=null) S.theme=f.theme;
    if(f.palette!=null) S.palette=f.palette;
    if(f.celebrate!=null) S.celebrate=f.celebrate;
    S.names=Array.isArray(f.display_names)?clone(f.display_names):(Array.isArray(oldNames)?oldNames:["You","Partner"]);
    /* about */
    var ab=byTable(recs,"about_me")[0];
    if(ab){ var a=ab.f||{}, o={}; if(a.train!=null)o.train=a.train; if(a.level!=null)o.level=a.level; if(a.goal!=null)o.goal=a.goal; if(a.days_per_week!=null)o.days=a.days_per_week; S.about=o; }
    /* profile: rest, measurements, the rest from prefs */
    var prof=sub("profile");
    if(f.rest_default!=null) prof.rest=f.rest_default;
    var groups={};
    byTable(recs,"measurements").forEach(function(r){
      var m=r.f, at=isoOf(m.taken_at); if(!at) return;
      var key=m.side==="left"?m.site+"L":m.site;
      var v=+m.value; (groups[at]=groups[at]||{})[key]=Math.round(v*10)/10===v?v.toFixed(1):String(v);
    });
    var hist=Object.keys(groups).sort().map(function(d){return {d:d,v:groups[d]};});
    if(hist.length) prof.hist=hist;
    if(Object.keys(prof).length) S.profile=prof;
    /* locations */
    var locs=byTable(recs,"locations").sort(function(a,b){return (a.f.sort||0)-(b.f.sort||0);});
    var lx=sub("locs");
    if(locs.length){
      lx.list=locs.map(function(r){ var l=clone(r.f.extra)||{}; l.id=r.f.local_id; l.name=r.f.name==null?"":r.f.name; l.gear=clone(r.f.gear)||[]; return l; });
    }
    if(Object.keys(lx).length) S.locs=lx;
    /* plans */
    var px=sub("plans"), plans=byTable(recs,"plans");
    if(f.active_plan!=null||plans.length||Object.keys(px).length){
      px.active=f.active_plan!=null?f.active_plan:"split5"; px.custom=[]; px.edits={};
      var cust=[];
      plans.forEach(function(r){
        var b=r.f.body||{}, id=r.f.local_id;
        if(b.custom){ cust.push({pos:+b.pos||0,c:clone(b.custom)}); }
        else {
          if(b.edits!==undefined) px.edits[id]=clone(b.edits);
          if(b.meta!==undefined){ px.meta=px.meta||{}; px.meta[id]=clone(b.meta); }
        }
        if(b.dayLoc!==undefined){ px.dayLoc=px.dayLoc||{}; px.dayLoc[id]=clone(b.dayLoc); }
      });
      px.custom=cust.sort(function(a,b){return a.pos-b.pos;}).map(function(x){return x.c;});
      S.plans=px;
    }
    return S;
  }

  /* ---- server rows ---- */
  function fromServer(t,row){
    if(!FIELDS[t]||!row||row.deleted_at) return null;
    var f={};
    FIELDS[t].forEach(function(k){ var v=row[k]; f[k]=v===undefined?null:clone(v); });
    if(t==="measurements"){ f.taken_at=isoOf(f.taken_at); f.value=num(f.value); }
    if(t==="user_settings"&&!isObj(f.prefs)) f.prefs={};
    if(t==="locations"){ if(!Array.isArray(f.gear)) f.gear=[]; if(!isObj(f.extra)) f.extra={}; f.sort=+f.sort||0; }
    if(t==="plans"&&!isObj(f.body)) f.body={};
    return {t:t,id:row.id,f:f};
  }

  /* ---- what changed ---- */
  function diff(prev,next){
    var out=[]; prev=prev||{}; next=next||{};
    Object.keys(next).forEach(function(key){
      var a=prev[key], b=next[key];
      if(!a){ out.push({t:b.t,id:b.id,op:"upsert",f:clone(b.f)}); return; }
      var ch={}, n=0;
      var keys={}; Object.keys(a.f).concat(Object.keys(b.f)).forEach(function(k){keys[k]=1;});
      Object.keys(keys).forEach(function(k){
        if(k==="prefs"){
          var pa=a.f.prefs||{}, pb=b.f.prefs||{}, pd={}, m=0, pk={};
          Object.keys(pa).concat(Object.keys(pb)).forEach(function(x){pk[x]=1;});
          Object.keys(pk).forEach(function(x){ if(canon(pa[x])!==canon(pb[x])){ pd[x]=pb[x]===undefined?null:clone(pb[x]); m++; } });
          if(m){ ch.prefs=pd; n++; }
        } else if(canon(a.f[k])!==canon(b.f[k])){ ch[k]=b.f[k]===undefined?null:clone(b.f[k]); n++; }
      });
      if(n) out.push({t:b.t,id:b.id,op:"upsert",f:ch});
    });
    Object.keys(prev).forEach(function(key){ if(!next[key]) out.push({t:prev[key].t,id:prev[key].id,op:"delete"}); });
    return out;
  }
  function mergeF(a,b){
    var o=clone(a)||{};
    Object.keys(b||{}).forEach(function(k){
      if(k==="prefs"&&isObj(o.prefs)&&isObj(b.prefs)) Object.keys(b.prefs).forEach(function(x){o.prefs[x]=clone(b.prefs[x]);});
      else o[k]=clone(b[k]);
    });
    return o;
  }
  function enqueue(Q,m){
    var key=m.t+":"+m.id, q=Q[key];
    if(m.op==="delete") Q[key]={t:m.t,id:m.id,op:"delete"};
    else if(!q||q.op==="delete") Q[key]={t:m.t,id:m.id,op:"upsert",f:clone(m.f)};
    else q.f=mergeF(q.f,m.f);
    return Q;
  }
  /* server fields with this device's waiting changes on top (a null in pending prefs removes the key) */
  function overlay(f,pending){
    var o=mergeF(f,pending);
    if(isObj(o.prefs)) Object.keys(o.prefs).forEach(function(k){ if(o.prefs[k]===null) delete o.prefs[k]; });
    return o;
  }

  var M={toRecords:toRecords,applyRecords:applyRecords,fromServer:fromServer,diff:diff,enqueue:enqueue,overlay:overlay,
    canon:canon,uuidv5:uuidv5,recId:recId,FIELDS:FIELDS,LOCAL:LOCAL};
  if(typeof module!=="undefined"&&module.exports) module.exports=M; else root.GFDSync=M;
})(typeof window!=="undefined"?window:this);
