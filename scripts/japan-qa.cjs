'use strict';
const fs=require('node:fs'),path=require('node:path'),root=path.join(__dirname,'../japan-2027'),T=require(root+'/data-model'),G=require(root+'/location-core'),D=require(root+'/departure-core'),J=require(root+'/journey-state');
require(root+'/rail-departure-profiles');
function load(){const read=f=>JSON.parse(fs.readFileSync(path.join(root,f)));const data=T.merge(read('data.json'),read('tokyo-data.json'),read('west-data.json')),routes={days:{...read('tokyo-routes.json').days,...read('west-routes.json').days}};return T.prepare(data,routes);}
function audit(){const {data,routes}=load(),errors=[],warnings=[],schematic=[],profiles=globalThis.RailDepartureProfiles.profiles,validity={};let used=0;
 const add=(list,type,id,detail)=>list.push({type,id,detail});
 for(const d of data.days){if(d.date!==`01/${String(d.n+7).padStart(2,'0')}`)add(errors,'date',d.n,d.date);for(const v of d.variants){const key=`${d.n}-${v.id}`,legs=routes.days[key];if(!legs||legs.length!==v.stops.length-1)add(errors,'route-count',key,legs?.length);
  let cafe=0;
  v.stops.forEach((s,i)=>{const id=`${key}:${i}`,t=T.interval(s),start=T.minutes(t.start),end=T.minutes(t.end);if(!Number.isFinite(s.lat)||!Number.isFinite(s.lng)||Math.abs(s.lat)>90||Math.abs(s.lng)>180)add(errors,'coordinate',id,s.name);if(!s.details)add(errors,'details-missing',id,s.name);if(start!==null&&end!==null&&end<start)add(errors,'time-reversal',id,s.time);
   if(s.kind==='cafe'&&start!==null&&end!==null)cafe=Math.max(cafe,end-start);
   const det=s.details||{};if(Number.isFinite(det.costMin)&&Number.isFinite(det.costMax)&&det.costMin>det.costMax)add(errors,'cost-range',id,s.name);
   if(['food','cafe'].includes(s.kind)&&/교통·숙박비 별도|실제 발권편·운항시간 우선/.test(JSON.stringify(det)))add(errors,'detail-type',id,s.name);
   if(i&&start!==null){const prev=T.minutes(T.interval(v.stops[i-1]).end),l=legs?.[i-1];if(prev!==null&&start<prev)add(warnings,'schedule-overlap',id,`${v.stops[i-1].name} → ${s.name}`);
    const walking=(l?.parts||[]).filter(p=>p.mode==='walk').reduce((n,p)=>n+p.distanceM/80,0);if(prev!==null&&start-prev+2<walking)add(warnings,'walking-time',id,`계획 ${start-prev}분 / 경로 보행 약${Math.ceil(walking)}분`);
   }
  });
  if(cafe<60)add(errors,'cafe-under-60',key,cafe);
  for(const l of legs||[]){if(!l)continue;const id=l.legId,coords=l.parts.flatMap(p=>p.coords||[]),a=v.stops[l.legIndex-1],b=v.stops[l.legIndex],startError=coords.length?G.distance([a.lat,a.lng],coords[0]):Infinity,endError=coords.length?G.distance([b.lat,b.lng],coords.at(-1)):Infinity;
   if(startError>300||endError>300)add(warnings,'endpoint-offset',id,`출발 ${Math.round(startError)}m / 도착 ${Math.round(endError)}m`);
   if(['rail','metro','walk','taxi','bus'].includes(l.parts[0]?.mode)&&a.lng<130&&b.lng<130&&a.lat>34&&b.lat>34&&l.fare.currency!=='KRW')add(errors,'domestic-currency',id,l.fare.currency);
   for(let pi=0;pi<l.parts.length;pi++){const p=l.parts[pi],pid=id+':'+pi;let length=0,maxJump=0;for(let j=0;j<p.coords.length;j++){const c=p.coords[j];if(!c.every(Number.isFinite)||Math.abs(c[0])>90||Math.abs(c[1])>180)add(errors,'route-coordinate',pid,c);if(j){const n=G.distance(p.coords[j-1],c);length+=n;maxJump=Math.max(maxJump,n);}}
    if(!['flight','ferry'].includes(p.mode)&&maxJump>2500)add(warnings,'route-gap',pid,Math.round(maxJump));if(p.distanceM>100&&Math.abs(length-p.distanceM)>Math.max(100,p.distanceM*.25))add(warnings,'route-length',pid,`좌표 ${Math.round(length)}m / 표시 ${p.distanceM}m`);
    if(T.geometry(p).kind==='schematic')schematic.push({id:pid,day:d.n,variant:v.id,from:p.from,to:p.to,mode:p.mode,source:p.geometrySource||'미확인'});
    if(['rail','metro'].includes(p.mode)){used++;if(!p.lineId)add(errors,'line-id',pid,p.line);const matches=Object.entries(profiles).filter(([key,f])=>(f.matches||[{lineId:f.lineId,from:f.from,to:f.to}]).some(m=>(m.lineId??null)===(p.lineId??null)&&m.from===p.from&&m.to===p.to&&(!m.line||m.line===p.line)));if(!matches.length&&!Object.values(profiles).some(f=>f.throughParts?.some(m=>m.lineId===p.lineId&&m.from===p.from&&m.to===p.to)))add(errors,'profile-match',pid,`${p.lineId} ${p.from} → ${p.to}`);}
   }
  }
 }}
 for(const [key,p] of Object.entries(profiles)){const v=D.validity(p,'2027-01-21');(validity[v.confidence]??=[]).push({key,line:p.line,from:p.from,to:p.to,sourceDate:p.sourceDate,validUntil:p.validUntil});}
 const total=J.totals(data.days,routes.days);return {baselineCommit:'7c9f511fab378d4101782b72e0395774ebb04a7b',counts:T.counts(data,routes),admission:{min:total.admissionMin,max:total.admissionMax},errors,warnings,schematic,timetableProfiles:validity,usedRailParts:used};
}
if(require.main===module){const result=audit();if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,'qa-data-report.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({counts:result.counts,admission:result.admission,errors:result.errors,warnings:result.warnings.length,schematic:result.schematic.length,profiles:Object.fromEntries(Object.entries(result.timetableProfiles).map(([k,v])=>[k,v.length]))},null,2));if(result.errors.length)process.exitCode=1;}
module.exports={audit,load};
