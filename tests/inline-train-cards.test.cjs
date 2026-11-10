'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
require('../japan-2027/rail-departure-profiles');
const bundle=require('../japan-2027/trip-update.json'),F=require('../japan-2027/fare-core');
const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const station=(a,b)=>b?`${a}(${b})`:a;
const ctx={URL,URLSearchParams,DepartureCore:require('../japan-2027/departure-core'),TravelStore:{VERSION:'test'},BoundedCache:require('../japan-2027/lru-cache'),RailDepartureProfiles:globalThis.RailDepartureProfiles,FareCore:F,TripPersonal:{station},document:{addEventListener(){}},window:{TripPersonal:{station}},esc:h,icon:h,MODE:{rail:{icon:"train"}}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../japan-2027/rail-ui.js'),'utf8')+'\n'+fs.readFileSync(require.resolve('../japan-2027/rail-departures.js'),'utf8')+';globalThis.api=RailDepartures;',ctx);
const render=(day,leg)=>ctx.api.html(day,leg,null,{fare:F.format(leg.fare,leg),displayBlank:!!leg.fare.displayBlank},true);
test('Toyosu transfer renders three full station boards and charges the shared Metro fare once',()=>{
 const leg=bundle.routes.days['2-main'][0],html=render(2,leg);
 assert.equal((html.match(/class="departure-sequence-step"/g)||[]).length,3);
 for(const name of ['히비야선','긴자선','유리카모메선','入谷','銀座','新橋','市場前'])assert.ok(html.includes(name),name);
 const values=[...html.matchAll(/<small>(?:환승 포함 운임|환승 운임|선택 구간 IC 요금)<\/small><b>([\d,]+) JP¥<\/b>/g)].map(m=>Number(m[1].replaceAll(',','')));
 assert.deepEqual(values,[209,0,388]);assert.equal(values.reduce((a,b)=>a+b,0),597);
 assert.doesNotMatch(html,/<select|시간표 확인 필요/);
 assert.equal((html.match(/data-departure-profile=/g)||[]).length,3);assert.match(html,/공개 시간표 참고 · 여행일 미검증/);
});
test('every active rail leg has a detailed board, including unknown timetables in mixed legs',()=>{
 let mixed=0;
 for(const [id,legs]of Object.entries(bundle.routes.days))for(const leg of legs){
  const parts=leg.parts.filter(p=>['rail','metro'].includes(p.mode));if(!parts.length)continue;
  const html=render(Number(id.split('-')[0]),leg);assert.match(html,/departure-stations-aligned/,id);
  const missing=parts.filter(p=>!ctx.api.keyFor(leg,p));for(const p of missing)assert.ok(html.includes(h(p.line)),`${id}: ${p.line}`);
  if(missing.length&&ctx.api.keysFor(leg).length){mixed++;assert.match(html,/data-departure-profile=/);assert.match(html,/departure-unscheduled/);}
 }
 assert.ok(mixed>0);
});
test('existing supported Skyliner board is preserved and its fare stays blank',()=>{
 const leg=bundle.routes.days['1-main'].find(l=>l.fare?.displayBlank),metrics={fare:'',displayBlank:true};
 assert.equal(ctx.api.html(1,leg,null,metrics,true),ctx.api.html(1,leg,null,metrics));
 const html=render(1,leg);assert.match(html,/data-departure-profile=/);assert.match(html,/data-ride-choose=/);assert.doesNotMatch(html,/2,567|2,580|<b>0 JP¥<\/b>/);
});
test('untrusted station names remain escaped and unsupported lines have no fabricated train controls',()=>{
 const leg={parts:[{mode:'rail',line:'<img onerror=bad()>',lineId:'unknown',from:'<script>',fromJa:'<入口>',to:'도착',toJa:'終点',distanceM:1000}],distanceM:1000,fare:{currency:'JPY'}};
 const html=render(2,leg);assert.doesNotMatch(html,/<script>|<img onerror|data-ride-choose|data-departure-clock/);assert.match(html,/&lt;入口&gt;/);assert.match(html,/확인 필요/);
});

// Execute the application's real popup and place renderers, so inline-only
// coverage cannot hide a different renderer dropping unsupported connections.
const appSource=fs.readFileSync(require.resolve('../japan-2027/app.js'),'utf8');
Object.assign(ctx,{state:{day:6},stationLabel:station,fareOptions:()=>({}),fareText:F.format,distanceText:n=>Number.isFinite(n)?(n/1000).toFixed(1)+' km':'확인 필요',TripData:{geometry:()=>({label:'저장된 경로'})},cleanDesc:s=>s.description||'',costText:()=> '비용 미확인'});
ctx.MODE.walk={icon:'walk'};ctx.MODE.transfer={icon:'walk'};
vm.runInContext(appSource.slice(appSource.indexOf('function legHtml('),appSource.indexOf('function applyTokyoData('))+'\n'+appSource.slice(appSource.indexOf('function detailHtml('),appSource.indexOf('function legDirectionsUrl(')),ctx);
test('map detail preserves every rail segment from mixed supported/unsupported itineraries',()=>{
 for(const day of [3,4,5,6,7,10,12]){
  const leg=bundle.routes.days[day+'-main'][0],html=ctx.legHtml(leg);
  for(const part of leg.parts.filter(p=>['rail','metro'].includes(p.mode))){
   const key=ctx.api.keyFor(leg,part),shown=key?ctx.RailDepartureProfiles.profiles[key]:part,label=h(shown.line+' '+shown.from);
   assert.ok(html.includes('aria-label="'+label+' 출발역 열차 정보"')||html.includes('aria-label="'+label+' 구간 정보"'),day+': '+label);
  }
 }
});
test('explicit contiguous through services keep one boarding number without hiding their route or zero continuation fare',()=>{
 for(const [day,lastOrder]of [[4,3],[6,3],[10,2]])for(const index of [0,bundle.routes.days[day+'-main'].length-1]){
  const leg=bundle.routes.days[day+'-main'][index],html=render(day,leg),orders=[...html.matchAll(/data-boarding-order="(\d+)"/g)].map(m=>Number(m[1]));
  assert.equal(Math.max(...orders),lastOrder,`${day} leg ${index}`);assert.match(html,/환승 없이 계속 탑승/);assert.match(html,/departure-through-note|data-through-continuation="true"/);assert.ok(html.includes('전체 이동 총액'));
 }
 const transfer=render(2,bundle.routes.days['2-main'][0]);assert.doesNotMatch(transfer,/환승 없이 계속 탑승/);assert.match(transfer,/3번째 탑승/);
 const interrupted=structuredClone(bundle.routes.days['6-main'][0]),at=interrupted.parts.findIndex(p=>p.throughService);interrupted.parts.splice(at+1,0,{mode:'transfer',from:'오다와라',to:'오다와라'});assert.match(render(6,interrupted),/4번째 탑승/);
});
test('empty fare components and empty activities disappear while meaningful supplements and activities remain',()=>{
 const ordinary=render(3,bundle.routes.days['3-main'][0]);assert.doesNotMatch(ordinary,/<dl class="departure-fare-components">\s*<\/dl>/);
 const romance=render(6,bundle.routes.days['6-main'][0]);assert.match(romance,/IC 기본운임/);assert.match(romance,/특급·지정석권 별도 구매/);
 const place={kind:'sight',description:'특징',details:{feature:'특징',thingsToDo:['','   ']}};assert.doesNotMatch(ctx.detailHtml(place),/<b>할 것<\/b>|<ul>\s*<\/ul>/);
 place.details.thingsToDo=['정원 산책'];assert.match(ctx.detailHtml(place),/<b>할 것<\/b><ul><li>정원 산책<\/li>/);
 const blank=bundle.routes.days['1-main'].find(l=>l.fare?.displayBlank);assert.doesNotMatch(render(1,blank),/departure-fare-components/);
});



test('every active train board has a line emblem and two separate station-number badges',()=>{
 for(const [id,legs]of Object.entries(bundle.routes.days))for(const leg of legs){
  if(!leg.parts.some(p=>['rail','metro'].includes(p.mode)))continue;
  const html=render(Number(id.split('-')[0]),leg),sections=(html.match(/<section class="station-departures/g)||[]).length;
  assert.ok(sections>0);assert.equal((html.match(/class="departure-endpoint-code/g)||[]).length,sections*2,id);
  assert.equal((html.match(/departure-stations-numbered/g)||[]).length,sections,id);
 }
 const g=ctx.railLineBadge({lineId:'TokyoMetro.Ginza',line:'긴자선',from:'시부야',fromCode:'G01'});assert.match(g,/>G<\/span>/);assert.doesNotMatch(g,/>G01<\/span>/);
});

test('station numbers respect both ends of through services and never borrow conventional numbers for Shinkansen',()=>{
 const profiles=Object.values(ctx.RailDepartureProfiles.profiles);
 for(const [line,from,to,expected]of [['JR 우에노도쿄라인 · 도카이도선 직통','우에노','요코하마',['JU02','JT05']],['JR 우에노도쿄라인 · 도카이도선 직통','요코하마','우에노',['JT05','JU02']],['로망스카 · 하코네 직통','신주쿠','하코네유모토',['OH01','OH51']],['게곤·리버티 게곤 · 닛코 직통','기타센주','도부닛코',['TS09','TN25']]]){
  const p=profiles.find(p=>p.line===line&&p.from===from&&p.to===to);assert.ok(p);assert.deepEqual(['from','to'].map(side=>ctx.railStationNumber(p,side).code),expected);
 }
 let missing=0;for(const leg of Object.values(bundle.routes.days).flat())for(const p of leg.parts.filter(p=>['rail','metro'].includes(p.mode)))for(const side of ['from','to']){const n=ctx.railStationNumber(p,side);if(!n.code){missing++;assert.equal(p.lineId,'JR-Central.TokaidoShinkansen');}else assert.match(n.code,/^[A-Z]{1,3}\d{2}$/);}
 assert.equal(missing,4);
 const unknown={lineId:'JR-Central.TokaidoShinkansen',from:'도쿄',to:'아타미'};assert.equal(ctx.railStationNumber(unknown).code,null);assert.equal(ctx.railStationNumber(unknown,'to').code,null);
});


test('JR endpoint numbers stay square while Metro numbers stay circular and private railways retain rounded marks',()=>{
 const y=render(3,bundle.routes.days['3-main'][0]);for(const code of ['JY05','JY13'])assert.ok(y.includes('endpoint-square')&&new RegExp('class="departure-endpoint-code endpoint-square"[^>]*>'+code+'<').test(y),code);
 const m=render(2,bundle.routes.days['2-main'][0]);for(const code of ['H19','H09','G09','G08'])assert.ok(new RegExp('class="departure-endpoint-code endpoint-circle"[^>]*>'+code+'<').test(m),code);
 for(const code of ['U01','U14'])assert.ok(new RegExp('class="departure-endpoint-code endpoint-rounded"[^>]*>'+code+'<').test(m),code);
 const through=render(4,bundle.routes.days['4-main'][0]);for(const code of ['JU02','JT05'])assert.ok(new RegExp('class="departure-endpoint-code endpoint-square"[^>]*>'+code+'<').test(through),code);
});
