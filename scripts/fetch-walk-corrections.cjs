'use strict';
// One-time public POI route requests, bounded and cached. No GPS/private home data.
// FOSSGIS policy: meaningful User-Agent, at most one request per second.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../japan-2027'),cache=path.resolve(process.env.TOKYO_REPLAN_CACHE||path.join(__dirname,'../.tokyo-replan-cache'));
const bundle=require(root+'/trip-update.json'),transit=require('./tokyo-transit-corrections.json');
const key=(a,b)=>a.map(n=>Number(n).toFixed(7)).join(',')+'>'+b.map(n=>Number(n).toFixed(7)).join(',');
const requests=new Map();function add(a,b,mode='foot'){requests.set(mode+'|'+key(a,b),{a,b,mode});}
const snapshotFile=path.join(__dirname,'tokyo-walk-corrections.json');
if(fs.existsSync(snapshotFile))for(const [id,r]of Object.entries(JSON.parse(fs.readFileSync(snapshotFile,'utf8')).routes))add(r.from,r.to,id.split('|')[0]);
for(const legs of Object.values(bundle.routes.days))for(const leg of legs)if(!leg.private)for(const p of leg.parts){
 if(p.mode==='walk'&&p.geometryAccuracy==='schematic'&&p.distanceM>80)add(p.coords[0],p.coords.at(-1));
 if(p.mode==='bus'&&p.geometryAccuracy==='schematic'&&/Fuua|무료 셔틀/.test(p.line))add(p.coords[0],p.coords.at(-1),'car');
}
for(const [index,name]of [[1,'nikkoOutbound'],[4,'nikkoInbound']]){
 const old=bundle.routes.days['10-main'][index],route=transit[name];
 const entrance=transit.toshoguEntrance.point;
 add(index===1?old.parts[0].coords[0]:entrance,route.coords[0]);add(route.coords.at(-1),index===1?entrance:old.parts.at(-1).coords.at(-1));
}
(async()=>{
 fs.mkdirSync(cache,{recursive:true});const routes={},failed=[];
 for(const [id,r]of requests){const file=path.join(cache,'route-'+crypto.createHash('sha256').update(id).digest('hex').slice(0,16)+'.json');let data;
  try{
   if(fs.existsSync(file))data=JSON.parse(fs.readFileSync(file,'utf8'));
   else{const coordinates=[r.a,r.b].map(p=>p[1]+','+p[0]).join(';'),url=`https://routing.openstreetmap.de/routed-${r.mode}/route/v1/${r.mode}/${coordinates}?overview=full&geometries=geojson&steps=false`;
    const response=await fetch(url,{headers:{'User-Agent':'KISEKI-Geography-route-audit/1.0 (+https://github.com/SnuMaster/Geography)'},signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error('HTTP '+response.status);data=await response.json();fs.writeFileSync(file,JSON.stringify(data));
    await new Promise(resolve=>setTimeout(resolve,1100));
   }
   const route=data.routes?.[0];if(data.code!=='Ok'||!route?.geometry?.coordinates?.length||data.waypoints.some(w=>w.distance>125))throw Error('Unreliable endpoint snap');
   routes[id]={from:r.a,to:r.b,coords:route.geometry.coordinates.map(p=>[p[1],p[0]]),distanceM:Math.round(route.distance),durationMinutes:Math.ceil(route.duration/60),source:'https://routing.openstreetmap.de/about.html',geometrySource:r.mode==='foot'?'FOSSGIS OSRM foot · OpenStreetMap 보행 경로':'FOSSGIS OSRM car · 도로 참고선 · 실제 셔틀 경유로 미확인',geometryAccuracy:r.mode==='foot'?'mapped':'schematic',snapDistances:data.waypoints.map(w=>Math.round(w.distance)),responseSha256:crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex')};
   console.log(r.mode,route.geometry.coordinates.length,'points',Math.round(route.distance),'m');
  }catch(e){failed.push({id,reason:e.message});console.log('UNRESOLVED',id,e.message);}
 }
 fs.writeFileSync(path.join(__dirname,'tokyo-walk-corrections.json'),JSON.stringify({checkedAt:'2026-11-05',source:'https://routing.openstreetmap.de/about.html',copyright:'https://www.openstreetmap.org/copyright',license:'ODbL-1.0',routes,failed})+'\n');
 console.log(JSON.stringify({resolved:Object.keys(routes).length,failed:failed.length}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
