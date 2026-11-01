'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
require('../japan-2027/rail-departure-profiles');
const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ctx={URL,URLSearchParams,DepartureCore:require('../japan-2027/departure-core'),ConnectionCore:require('../japan-2027/connection-core'),TravelStore:{VERSION:'test'},BoundedCache:require('../japan-2027/lru-cache'),RailDepartureProfiles:globalThis.RailDepartureProfiles,document:{addEventListener(){}},window:{TripPersonal:{station:(a,b)=>b?`${a}(${b})`:a}},esc:h};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../japan-2027/rail-departures.js'),'utf8')+';globalThis.api=RailDepartures;',ctx);
test('all Japanese route endpoints open encoded station searches; Korean KTX has no disruption links',()=>{
 for(const p of Object.values(ctx.RailDepartureProfiles.profiles)){
  if(p.country==='KR'){assert.equal(ctx.api.stationMapUrl(p,{name:p.from}),null);assert.equal(ctx.api.disruptionHtml(p),'');continue;}
  for(const stop of [{name:p.from,nameJa:p.fromJa},{name:p.to,nameJa:p.toJa}]){const u=new URL(ctx.api.stationMapUrl(p,stop));assert.equal(u.origin,'https://www.google.com');assert.equal(u.pathname,'/maps/search/');assert.equal(u.searchParams.get('api'),'1');assert.ok(u.searchParams.get('query').includes(stop.nameJa));assert.ok(u.searchParams.get('query').includes(p.line));assert.match(u.searchParams.get('query'),/日本$/);}
  assert.match(ctx.api.disruptionHtml(p),/지연 현황 확인하기/);assert.match(ctx.api.disruptionHtml(p),/자동 반영되지/);
 }
});
test('intermediate stops are linked and deduplicated without transmitting GPS, dates or train IDs',()=>{
 const p=ctx.RailDepartureProfiles.profiles['fukuoka-hakata-ohori'],data=require('../japan-2027/'+p.file).profiles['fukuoka-hakata-ohori'].Weekday[0],html=ctx.api.disruptionHtml(p,[...data.stops,data.stops[0]]);
 assert.equal((html.match(/data-rail-station-map/g)||[]).length,data.stops.length);assert.match(html,/祇園/);assert.match(new URL(ctx.api.stationMapUrl(p,{name:'아카사카',nameJa:'赤坂'})).searchParams.get('query'),/福岡市/);assert.doesNotMatch(html,/departureAt|serviceDate|latitude|longitude|pickup|departure_time/);
});
test('untrusted station text cannot break out of the HTTPS link or execute markup',()=>{
 const p={country:'JP',line:'test',from:'<img onerror="bad()">',fromJa:'赤坂&x=1',to:'도착',toJa:'終点'};const html=ctx.api.disruptionHtml(p);assert.doesNotMatch(html,/<img|href="javascript:/);assert.match(html,/&lt;img/);assert.match(html,/noopener noreferrer/);const u=new URL(ctx.api.stationMapUrl(p,{nameJa:p.fromJa}));assert.equal(u.searchParams.has('x'),false);assert.equal(ctx.api.stationMapUrl(p,{}),null);
});
