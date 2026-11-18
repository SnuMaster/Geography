'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
require('../japan-2027/rail-departure-profiles');
const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ctx={URL,URLSearchParams,DepartureCore:require('../japan-2027/departure-core'),ConnectionCore:require('../japan-2027/connection-core'),TravelStore:{VERSION:'test'},BoundedCache:require('../japan-2027/lru-cache'),RailDepartureProfiles:globalThis.RailDepartureProfiles,RailStationDepartures:require('../japan-2027/rail-station-departures'),document:{addEventListener(){}},window:{TripPersonal:{station:(a,b)=>b?`${a}(${b})`:a}},esc:h};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../japan-2027/rail-departures.js'),'utf8')+';globalThis.api=RailDepartures;',ctx);
test('all Japanese route endpoints open encoded station searches; Korean KTX has no disruption links',()=>{
 for(const p of Object.values(ctx.RailDepartureProfiles.profiles)){
  if(p.country==='KR'){assert.equal(ctx.api.stationMapUrl(p,{name:p.from}),null);assert.equal(ctx.api.disruptionHtml(p),'');continue;}
  for(const stop of [{name:p.from,nameJa:p.fromJa},{name:p.to,nameJa:p.toJa}]){const u=new URL(ctx.api.stationMapUrl(p,stop));assert.equal(u.origin,'https://www.google.com');assert.equal(u.pathname,'/maps/search/');assert.equal(u.searchParams.get('api'),'1');assert.ok(u.searchParams.get('query').includes(stop.nameJa));assert.doesNotMatch(u.searchParams.get('query'),/[가-힣]/);assert.match(u.searchParams.get('query'),/日本$/);}
  assert.match(ctx.api.disruptionHtml(p),/지연 현황 확인하기/);assert.equal((ctx.api.disruptionHtml(p).match(/data-rail-station-map/g)||[]).length,1);assert.doesNotMatch(ctx.api.disruptionHtml(p),/<details|<summary/);const direct=new URL(ctx.api.departureMapUrl(p));assert.equal(direct.hostname,'www.google.com');assert.equal(direct.protocol,'https:');assert.match(ctx.api.disruptionHtml(p),/출발역 Google Maps/);
 }
});
test('Uguisudani keeps its exact Japanese name without the line text that triggered a different station',()=>{
 const p=ctx.RailDepartureProfiles.profiles['jr-east-yamanote-uguisudani-ikebukuro'];assert.equal(new URL(ctx.api.stationMapUrl(p,{name:p.from,nameJa:p.fromJa})).searchParams.get('query'),'鶯谷駅 日本');
});
test('only the origin is linked even when a boarded train supplies intermediate stops',()=>{
 const p=ctx.RailDepartureProfiles.profiles['fukuoka-hakata-ohori'],data=require('../japan-2027/'+p.file).profiles['fukuoka-hakata-ohori'].Weekday[0],html=ctx.api.disruptionHtml(p,[...data.stops,data.stops[0]]);
 assert.equal((html.match(/data-rail-station-map/g)||[]).length,1);assert.doesNotMatch(html,/祇園/);assert.match(html,/하카타/);assert.match(new URL(ctx.api.stationMapUrl(p,{name:'아카사카',nameJa:'赤坂'})).searchParams.get('query'),/福岡市/);assert.doesNotMatch(html,/departureAt|serviceDate|latitude|longitude|pickup|departure_time/);
});
test('untrusted station text cannot break out of the HTTPS link or execute markup',()=>{
 const p={country:'JP',line:'test',from:'<img onerror="bad()">',fromJa:'赤坂&x=1',to:'도착',toJa:'終点'};const html=ctx.api.disruptionHtml(p);assert.doesNotMatch(html,/<img|href="javascript:/);assert.match(html,/&lt;img/);assert.match(html,/noopener noreferrer/);const u=new URL(ctx.api.stationMapUrl(p,{nameJa:p.fromJa}));assert.equal(u.searchParams.has('x'),false);assert.equal(ctx.api.stationMapUrl(p,{}),null);
});

test('verified station departure links use Maps departure view and exclude account/tracking parameters',()=>{const data=require('../japan-2027/rail-station-departures');for(const link of Object.values(data.links)){const u=new URL(link);assert.equal(u.origin,'https://www.google.com');assert.match(u.pathname,/^\/maps\/place\//);assert.match(u.pathname,/!6m1!1v2/);for(const key of ['authuser','g_ep','entry','rclk'])assert.equal(u.searchParams.has(key),false);}const p=ctx.RailDepartureProfiles.profiles['skyliner-naritaairportterminal2and3-keiseiueno'];assert.match(ctx.api.departureMapUrl(p),/!6m1!1v2/);const mock={country:'JP',from:'처음 보는 역',fromJa:'未確認駅'};assert.equal(new URL(ctx.api.departureMapUrl(mock)).pathname,'/maps/search/');});
