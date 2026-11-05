'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const bundle=require('../japan-2027/trip-update.json'),T=require('../japan-2027/data-model'),J=require('../japan-2027/journey-state'),F=require('../japan-2027/fare-core'),P=require('../japan-2027/personal-trip'),G=require('../japan-2027/location-core'),A=require('../japan-2027/assistant-core'),C=require('../japan-2027/command-core');
const {data,routes}=T.prepare(structuredClone(bundle.data),structuredClone(bundle.routes));
test('active trip is an atomic 15-day Jan8-Jan22 revision, not mixed with old west dates',()=>{
 assert.equal(data.metadata.id,'tokyo-20270108-22');assert.equal(data.metadata.nights,14);assert.equal(bundle.revision,data.version);assert.equal(bundle.revision,routes.version);assert.equal(data.days.length,15);
 for(const [i,d]of data.days.entries()){assert.equal(d.n,i+1);assert.equal(T.date(d.n),'2027-'+d.date.replace('/','-'));assert.ok(d.mapLabel);assert.ok(!/오사카|후쿠오카|고베|부산|교토|나라/.test(d.title));}
 assert.equal(J.read('https://example.com/?day=22&place=old',data.days,{}).day,1);
 assert.ok(!Object.keys(routes.days).some(k=>Number(k.split('-')[0])>15));
});
test('Skyliner keeps its real route and timetable identity, while every price component stays blank',()=>{
 const leg=routes.days['1-main'].find(l=>l.parts.some(p=>/스카이라이너/.test(p.line)));assert.ok(leg);assert.ok(leg.parts.some(p=>p.coords.length>100));assert.equal(leg.fare.displayBlank,true);
 for(const key of ['min','max','icYen','paperTicketYen'])assert.equal(leg.fare[key],null,key);
 assert.equal(F.format(leg.fare,leg),'');assert.deepEqual(leg.fare.breakdown,[]);
 const row=F.railItems([leg])[0];assert.equal(row.icYen,null);assert.equal(row.displayBlank,true);
 const other=routes.days['1-main'].filter(l=>l!==leg),sum=F.summarize(other,{scope:'japan-rail'}),withBlank=F.summarize(routes.days['1-main'],{scope:'japan-rail'});assert.equal(withBlank.ic,sum.ic);assert.equal(withBlank.unknown,sum.unknown+1);
 assert.ok(!data.days[0].variants[0].stops.some(s=>/2,?567|2,?580/.test(s.transportFromPrevious||'')));
});
test('shopping occurs three times and arrival remains a light neighborhood day',()=>{
 const day=n=>data.days.find(d=>d.n===n).variants[0].stops;
 assert.ok(day(1).some(s=>s.name==='돈키호테 아사쿠사점'));assert.ok(!day(1).some(s=>/도쿄역 마루노우치|KITTE/.test(s.name)));
 assert.ok(day(7).some(s=>s.name==='MEGA 돈키호테 시부야 본점'));assert.ok(day(12).some(s=>/보충 쇼핑/.test(s.name)));
 assert.ok(!day(5).some(s=>/건축박물관/.test(s.name)));const shim=day(5).find(s=>s.name==='시모키타자와');assert.equal(shim.start,'13:30');assert.ok(T.minutes(shim.end)-T.minutes(shim.start)>=270);
});
test('hotel transition and final return have no invented airport, flight, booking or arrival time',()=>{
 for(const n of [12,13,14,15])assert.equal(data.days[n-1].variants[0].stops.find(s=>s.kind==='hotel'&&/도쿄 돔/.test(s.name)).name,'도쿄 돔 호텔');
 assert.equal(data.days[11].date,'01/19');const last=data.days.at(-1);assert.equal(last.pendingReturn.status,'unconfirmed');assert.equal(last.pendingReturn.period,'저녁');
 for(const key of ['airport','flight','departure','arrival'])assert.equal(last.pendingReturn[key],null);
 assert.ok(!routes.days['15-main'].some(l=>l.parts.some(p=>['flight','ferry'].includes(p.mode))));assert.equal(last.variants[0].stops.at(-1).start,null);
});
test('all variant routes retain continuous endpoints, honest geometry and distinct item identities',()=>{
 const ids=new Set();for(const d of data.days)for(const v of d.variants){const ls=routes.days[d.n+'-'+v.id];assert.equal(ls.length,v.stops.length-1);
  for(const s of v.stops){assert.ok(s.uid.startsWith('t27-'));assert.ok(!ids.has(s.uid));ids.add(s.uid);if(s.kind==='home'){assert.equal(s.lat,null);assert.equal(s.lng,null);}else{assert.ok(Number.isFinite(s.lat));assert.ok(Number.isFinite(s.lng));}}
  for(const [i,l]of ls.entries()){assert.equal(l.fromUid,v.stops[i].uid);assert.equal(l.toUid,v.stops[i+1].uid);assert.ok(l.parts.length);
   if(v.stops[i].kind==='home'||v.stops[i+1].kind==='home'){assert.ok(l.private);assert.ok(l.parts.every(p=>p.coords.length===0));continue;}
   assert.ok(G.distance([v.stops[i].lat,v.stops[i].lng],l.parts[0].coords[0])<=70);
   assert.ok(G.distance([v.stops[i+1].lat,v.stops[i+1].lng],l.parts.at(-1).coords.at(-1))<=70);
   for(let j=1;j<l.parts.length;j++)assert.ok(G.distance(l.parts[j-1].coords.at(-1),l.parts[j].coords[0])<=70);
   for(const p of l.parts){assert.ok(p.source||p.geometryAccuracy==='private'||T.geometry(p).kind==='schematic'||p.geometrySource==='same-location');if(p.geometryAccuracy==='mapped')for(let j=1;j<p.coords.length;j++)assert.ok(G.distance(p.coords[j-1],p.coords[j])<2500,p.line);}
  }
 }
 const newRail=Object.values(routes.days).flat().flatMap(l=>l.parts).filter(p=>p.lineId==='Hakone.Ropeway');assert.ok(newRail.length);assert.ok(newRail.every(p=>p.geometryAccuracy==='schematic'&&T.geometry(p).kind==='schematic'));
});
test('weather and ticket alternatives remain optional and no planned stop gets another place visit record',()=>{
 assert.deepEqual(data.days[7].variants.map(v=>v.id),['main','brewery']);assert.deepEqual(data.days[10].variants.map(v=>v.id),['main','concert']);
 const stops=data.days[0].variants[0].stops,oldVisits={'1|main|d1-main-8':true};assert.equal(A.progress(stops,1,'main',oldVisits).done,0);
 P.registerStations(data.metadata.stationNames);assert.match(P.station('스이도바시'),/水道橋/);assert.match(P.station('도부닛코'),/東武日光/);
 assert.equal(P.station('도쿄메트로 우에노역'),'도쿄메트로 우에노역(上野)');assert.equal(P.station('게이세이우에노역'),'게이세이우에노역(京成上野)');
 assert.equal(P.station('게이세이 우에노'),'게이세이 우에노(京成上野)');
});
test('planned connections have enough time and preserve the fixed outbound flight',()=>{
 for(const d of data.days)for(const v of d.variants)assert.deepEqual(C.warnings(v.stops,routes.days[d.n+'-'+v.id]).filter(w=>['overlap','travel'].includes(w.type)),[],d.n+'-'+v.id);
 const flight=routes.days['1-main'].find(l=>l.travel);assert.match(flight.travel.depart,/11:10$/);assert.match(flight.travel.arrive,/13:20$/);
});
