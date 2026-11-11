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
 for(const name of ['히비야선','유라쿠초선','유리카모메선','入谷','築地','新富町','豊洲','市場前'])assert.ok(html.includes(name),name);
 const values=[...html.matchAll(/<small>(?:환승 포함 운임|환승 운임|선택 구간 IC 요금)<\/small><b>([\d,]+) JP¥<\/b>/g)].map(m=>Number(m[1].replaceAll(',','')));
 assert.deepEqual(values,[209,0,189]);assert.equal(values.reduce((a,b)=>a+b,0),398);
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

test('Fuji Excursion keeps its JR and Fujikyu endpoint numbers alongside the service mark',()=>{
 let count=0;for(const leg of bundle.routes.days['8-main'])if(leg.parts.some(p=>p.lineId==='Special.Direct'&&/후지회유/.test(p.line))){
  const html=render(8,leg);assert.equal((html.match(/src="assets\/operators\/fuji-excursion.svg"/g)||[]).length,1);
  assert.match(html,/FUJI EXCURSION/);assert.match(html,/역 번호 JC05/);assert.match(html,/역 번호 FJ18/);assert.doesNotMatch(html,/shinkansen-station-sign|operator-shinkansen/);count++;
 }
 assert.equal(count,2);
});
test('Nikko Revaty boards keep separate station codes and identify the logo as a planning candidate',()=>{
 for(const index of [0,5]){
  const leg=bundle.routes.days['10-main'][index],html=render(10,leg);
  assert.equal((html.match(/assets\/operators\/revaty.png/g)||[]).length,1);
  assert.match(html,/Revaty · 계획 후보/);
  for(const code of index===0?['TS09','TN23','TN25']:['TN25','TS09'])assert.ok(html.includes('역 번호 '+code));
  assert.match(html,/공개 시간표 참고 · 여행일 미검증/);
 }
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
 for(const [day,index,lastOrder]of [[4,0,3],[4,5,3],[10,0,3],[10,5,2]]){
  const leg=bundle.routes.days[day+'-main'][index],html=render(day,leg),orders=[...html.matchAll(/data-boarding-order="(\d+)"/g)].map(m=>Number(m[1]));
  assert.equal(Math.max(...orders),lastOrder,`${day} leg ${index}`);assert.match(html,/환승 없이 계속 탑승/);assert.match(html,/departure-through-note|data-through-continuation="true"/);assert.ok(html.includes('전체 이동 총액'));
 }
 const transfer=render(2,bundle.routes.days['2-main'][0]);assert.doesNotMatch(transfer,/환승 없이 계속 탑승/);assert.match(transfer,/3번째 탑승/);
 const interrupted=structuredClone(bundle.routes.days['4-main'][0]),at=interrupted.parts.findIndex(p=>p.throughService);interrupted.parts.splice(at+1,0,{mode:'transfer',from:'오다와라',to:'오다와라'});assert.match(render(4,interrupted),/4번째 탑승/);
});
test('empty fare components and empty activities disappear while meaningful supplements and activities remain',()=>{
 const ordinary=render(3,bundle.routes.days['3-main'][0]);assert.doesNotMatch(ordinary,/<dl class="departure-fare-components">\s*<\/dl>/);
 const romance=render(6,bundle.routes.days['6-main'][0]);assert.match(romance,/일반 승차권/);assert.match(romance,/자유석 특급권 별도 구매/);
 const place={kind:'sight',description:'특징',details:{feature:'특징',thingsToDo:['','   ']}};assert.doesNotMatch(ctx.detailHtml(place),/<b>할 것<\/b>|<ul>\s*<\/ul>/);
 place.details.thingsToDo=['정원 산책'];assert.match(ctx.detailHtml(place),/<b>할 것<\/b><ul><li>정원 산책<\/li>/);
 const blank=bundle.routes.days['1-main'].find(l=>l.fare?.displayBlank);assert.doesNotMatch(render(1,blank),/departure-fare-components/);
});



test('every active train board has a line emblem and only verified station-number badges',()=>{
 for(const [id,legs]of Object.entries(bundle.routes.days))for(const leg of legs){
  if(!leg.parts.some(p=>['rail','metro'].includes(p.mode)))continue;
  const html=render(Number(id.split('-')[0]),leg),sections=(html.match(/<section class="station-departures/g)||[]).length;
  assert.ok(sections>0);for(const section of html.match(/<section class="station-departures[\s\S]*?<\/section>/g)||[])assert.equal((section.match(/class="departure-endpoint-code/g)||[]).length,section.includes('도카이도 신칸센')?0:2,id);
  assert.equal((html.match(/departure-stations-numbered/g)||[]).length,sections,id);
 }
 const g=ctx.railLineBadge({lineId:'TokyoMetro.Ginza',line:'긴자선',from:'시부야',fromCode:'G01'});assert.match(g,/>G<\/span>/);assert.doesNotMatch(g,/>G01<\/span>/);
});

test('Shinkansen boards use compact station signs in both directions without invented numbers',()=>{
 const labels={'東京':['とうきょう','Tokyo'],'小田原':['おだわら','Odawara'],'熱海':['あたみ','Atami']};
 let checked=0;for(const [id,legs]of Object.entries(bundle.routes.days))for(const leg of legs)for(const p of leg.parts.filter(p=>p.lineId==='JR-Central.TokaidoShinkansen')){
  const html=ctx.api.html(Number(id.split('-')[0]),leg,p,{fare:F.format(leg.fare,leg)},true);assert.match(html,/assets\/operators\/shinkansen.svg/);
  assert.doesNotMatch(html,/departure-endpoint-code|is-unknown|공식 역 번호 미확인/);
  assert.ok(html.includes(p.from));assert.ok(html.includes(p.to));assert.match(html,/departure-arrow/);
  assert.equal((html.match(/class="shinkansen-station-sign"/g)||[]).length,2);
  for(const name of [p.fromJa,p.toJa])for(const label of [name,...labels[name]])assert.ok(html.includes('>'+label+'</span>'),label);
  checked++;
 }
 assert.equal(checked,4);
});

test('unmapped Shinkansen stations fall back to escaped names without invented sign readings',()=>{
 const source=bundle.routes.days['14-main'].find(l=>l.parts.some(p=>p.lineId==='JR-Central.TokaidoShinkansen')),leg=structuredClone(source),part=leg.parts.find(p=>p.lineId==='JR-Central.TokaidoShinkansen');
 part.from='<script>';part.fromJa='<未知>';const html=ctx.api.html(14,leg,part,{},true);
 assert.doesNotMatch(html,/<script>|departure-endpoint-code/);assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;未知&gt;/);assert.equal((html.match(/class="shinkansen-station-sign"/g)||[]).length,1);
 const ordinary=render(2,bundle.routes.days['2-main'][0]);assert.doesNotMatch(ordinary,/shinkansen-station-sign/);assert.match(ordinary,/역 번호 H19/);
});

test('station numbers respect both ends of through services and never borrow conventional numbers for Shinkansen',()=>{
 const profiles=Object.values(ctx.RailDepartureProfiles.profiles);
 for(const [from,to,expected]of [['우에노','요코하마',['JU02','JT05']],['요코하마','우에노',['JT05','JU02']],['기타센주','시모이마이치',['TS09','TN23']],['도부닛코','기타센주',['TN25','TS09']]]){
  const p=profiles.find(p=>p.throughParts?.length>1&&p.from===from&&p.to===to);assert.ok(p);assert.deepEqual(['from','to'].map(side=>ctx.railStationNumber(p,side).code),expected);
 }
 let missing=0;for(const leg of Object.values(bundle.routes.days).flat())for(const p of leg.parts.filter(p=>['rail','metro'].includes(p.mode)))for(const side of ['from','to']){const n=ctx.railStationNumber(p,side);if(!n.code){missing++;assert.equal(p.lineId,'JR-Central.TokaidoShinkansen');}else assert.match(n.code,/^[A-Z]{1,3}\d{2}$/);}
 assert.equal(missing,8);
 const unknown={lineId:'JR-Central.TokaidoShinkansen',from:'도쿄',to:'아타미'};assert.equal(ctx.railStationNumber(unknown).code,null);assert.equal(ctx.railStationNumber(unknown,'to').code,null);
});


test('JR numbers use the official stacked frame and station abbreviations while other railway shapes stay distinct',()=>{
 const assertJr=(html,code,abbreviation)=>{
  assert.match(html,new RegExp('class="departure-endpoint-code endpoint-square jr-station-number has-station-abbreviation"[^>]*aria-label="역 번호 '+code+' · '+abbreviation+'"[^>]*><span class="jr-station-tab" aria-hidden="true">'+abbreviation+'</span><span class="jr-station-frame" aria-hidden="true"><span class="jr-station-line">'+code.slice(0,2)+'</span><span class="jr-station-digits">'+code.slice(2)+'</span>'));
 };
 const y=render(3,bundle.routes.days['3-main'][0]);assert.match(y,/역 번호 JY06/);assert.match(y,/jr-station-line\"[^>]*>JY/);assertJr(y,'JY13','IKB');assert.doesNotMatch(y,/>IBK</);
 const m=render(2,bundle.routes.days['2-main'][0]);for(const code of ['H19','H11','Y20','Y22'])assert.ok(new RegExp('class="departure-endpoint-code endpoint-circle"[^>]*>'+code+'<').test(m),code);
 for(const code of ['16','14'])assert.match(m,new RegExp('endpoint-circle operator-station-number operator-filled[^>]*[\\s\\S]*?<span class="operator-station-line">U</span><span class="operator-station-digits">'+code+'</span>'));
 const through=render(4,bundle.routes.days['4-main'][0]);assertJr(through,'JU02','UEN');assertJr(through,'JT05','YHM');
 assert.equal(ctx.jrStationAbbreviation({from:'우구이스다니',fromJa:'鶯谷'}),null);
 assert.equal(ctx.jrStationAbbreviation({from:'이케부쿠로',to:'우에노'},'to'),'UEN');
});

test('collapsed train cards retain visible limitations and move controls and sources into separate disclosures',()=>{
 for(const [id,legs]of Object.entries(bundle.routes.days))for(const leg of legs){
  const html=render(Number(id.split('-')[0]),leg);
  for(const section of html.match(/<section class="station-departures[\s\S]*?<\/section>/g)||[]){
   assert.match(section,/<details class="departure-timetable"><summary>(?:시간표·탑승 선택|운행 안내)<\/summary>/,id);
   assert.doesNotMatch(section,/<details[^>]*\bopen(?:[ =>]|$)/,id);
   const status=section.match(/<p class="departure-data-status">([^<]+)<\/p>/);
   assert.ok(status&&/실시간 (지연 미반영|정보 미지원)/.test(status[1]),id);
   assert.ok(section.indexOf(status[0])<section.indexOf('<details'),id);
   if(section.includes('data-departure-profile=')){
    assert.match(section,/<details class="departure-timetable">[\s\S]*data-departure-body[\s\S]*data-ride-choose=[\s\S]*<\/details>/,id);
    assert.match(section,/<details class="departure-reference"><summary>자료 정보<\/summary>[\s\S]*자료 확인/,id);
   }
   for(const cls of ['departure-fare-basis','departure-fare-components','departure-fare-sources','departure-schedule-source'])if(section.includes('class="'+cls+'"')){
    const start=section.indexOf('<details class="departure-reference">'),end=section.indexOf('</details>',start);
    assert.ok(start>=0&&section.indexOf('class="'+cls+'"')>start&&section.indexOf('class="'+cls+'"')<end,id+': '+cls);
   }
   assert.match(section,/<div class="departure-quick-links"><a[^>]+>길찾기 ↗<\/a>/,id);
  }
 }
});

test('official Odakyu and Minatomirai station layouts remain distinct from map line emblems',()=>{
 const odakyuLeg=bundle.routes.days['5-main'].find(l=>l.parts.some(p=>p.lineId==='Odakyu.Odawara'));
 const oh=render(5,odakyuLeg);for(const code of ['07','01'])assert.match(oh,new RegExp('endpoint-circle operator-station-number operator-outline[^>]*[\\s\\S]*?<span class="operator-station-line">OH</span><span class="operator-station-digits">'+code+'</span>'));
 const minatoLeg=bundle.routes.days['4-main'].find(l=>l.parts.some(p=>p.lineId==='Minatomirai.Minatomirai'));
 const mm=render(4,minatoLeg);assert.match(mm,/endpoint-square operator-station-number operator-filled/);for(const code of ['01','06'])assert.match(mm,new RegExp('<span class="operator-station-line">MM</span><span class="operator-station-digits">'+code+'</span>'));
 for(const id of ['Odakyu.Odawara','OdakyuHakone.HakoneTozan','Hakone.Cable','Hakone.Ropeway'])assert.equal(ctx.railInfo({lineId:id}).stationShape||ctx.railInfo({lineId:id}).shape,'circle');
 assert.match(ctx.railLineBadge({lineId:'Odakyu.Odawara',line:'오다큐',from:'시모키타자와'}),/>OH<\/span>/);
 assert.match(ctx.railLineBadge({lineId:'Minatomirai.Minatomirai',line:'미나토미라이',from:'요코하마'}),/>MM<\/span>/);
});

test('Tobu Nikko through-service endpoints keep the blue TS and orange TN station identities',()=>{
 const part={lineId:'Tobu.Nikko',line:'도부 특급',from:'가스카베',fromJa:'春日部',to:'시모이마이치',toJa:'下今市'};
 const from=ctx.railStationNumber(part),to=ctx.railStationNumber(part,'to');assert.equal(from.code,'TS27');assert.equal(from.lineId,'Tobu.TobuSkytree');assert.equal(to.code,'TN23');assert.equal(to.lineId,'Tobu.Nikko');assert.notEqual(ctx.railInfo(from).color,ctx.railInfo(to).color);
});

test('reviewed private-railway endpoints keep their official numbers without timetable pack fallback',()=>{
 for(const [lineId,from,code]of [['Tobu.Tojo','이케부쿠로','TJ01'],['Keio.Inokashira','기치조지','IN17'],['Keio.Inokashira','시모키타자와','IN05'],['Enoden.Enoden','가마쿠라','EN15'],['Enoden.Enoden','하세','EN12'],['Hakone.Cable','소운잔','OH62']])assert.equal(ctx.railStationNumber({lineId,from}).code,code);
});
