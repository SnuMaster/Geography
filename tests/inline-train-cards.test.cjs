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
 assert.doesNotMatch(html,/<select|departure-loading|data-ride-choose|data-departure-profile=/);
 assert.equal((html.match(/시간표 확인 필요/g)||[]).length,3);assert.equal((html.match(/실시간 정보 미지원/g)||[]).length,3);
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

