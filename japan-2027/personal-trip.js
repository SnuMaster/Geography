'use strict';
/* Personal itinerary presentation and clearly labelled unverified Uber connections.
 * Raw rail schedules and the original reference routes stay untouched. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TripPersonal=api;})(globalThis,function(){
 const HOME={name:'월성로 132',address:'대구광역시 달서구 월성로 132',lat:35.82714053912,lng:128.52280068514};
 const EXTRA_JA={
  '공항제2빌딩':'空港第２ビル','게이세이우에노':'京成上野','신바시':'新橋',
  '모토마치주카가이':'元町・中華街','간나이':'関内','하세':'長谷',
  '가타세에노시마':'片瀬江ノ島','후지사와':'藤沢','센다기':'千駄木',
  '가구라자카':'神楽坂','이이다바시':'飯田橋','나카메구로':'中目黒',
  '히가시긴자':'東銀座','기온시조':'祇園四条','고베':'神戸',
  '오사카조코엔':'大阪城公園','구시다진자마에':'櫛田神社前',
  '도진마치':'唐人町','덴노지':'天王寺','요도야바시':'淀屋橋',
  '하카타':'博多','오사카난바':'大阪難波','우메다':'梅田',
  '신주쿠':'新宿','이리야':'入谷','우에노':'上野',
  '나카오카치마치':'仲御徒町','가와구치코':'河口湖',
  '가마쿠라':'鎌倉','오카치마치':'御徒町',
  '가미야초':'神谷町','가와고에':'川越',
  '아사쿠사':'浅草','하마마쓰초':'浜松町',
  '에비스':'恵比寿','가구라자카':'神楽坂',
  '가미야초':'神谷町','긴테쓰나라':'近鉄奈良',
  '신이마미야':'新今宮','산노미야':'三ノ宮','공항제2빌딩':'空港第２ビル','가타세에노시마':'片瀬江ノ島','후지사와':'藤沢','하세':'長谷','구라마에':'蔵前','미타':'三田','아카사카':'赤坂','니시진':'西新'
 };
 function normalized(s){
  return String(s||'').replace(/^(?:JR\s+|도쿄메트로\s+|도에이\s+|도부\s+|에노덴\s+|게이세이\s+)/,'')
   .replace(/역(?:\s*·.*|\s+.*)?$/,'').replace(/\s+/g,'').trim();
 }
 function japanese(name){
  if(EXTRA_JA[normalized(name)])return EXTRA_JA[normalized(name)];
  const profiles=globalThis.RailDepartureProfiles?.profiles;
  for(const p of Object.values(profiles||{})){
   if(p.country==='KR')continue;
   for(const end of ['from','to'])if(normalized(p[end])===normalized(name)&&p[end+'Ja'])return p[end+'Ja'];
  }
  return null;
 }
 function station(name,japaneseOverride=null,country='JP'){
  const raw=String(name||'');
  if(country==='KR')return raw.replace(/\s*KTX$/,'').replace(/^(부산|서대구|동대구)$/,'$1역');
  if(/[（(][\u3040-\u30ff\u3400-\u9fff]/.test(raw))return raw;
  const ja=japaneseOverride||japanese(raw);
  return ja?raw+'('+ja+')':raw;
 }
 function stopName(stop){
  if(!stop||stop.kind!=='station')return stop?.name||'';
  const country=['대구','부산'].includes(stop.area)||(stop.lat>35&&stop.lng<129.7&&stop.lng>128.2)?'KR':'JP';
  return station(stop.name,null,country);
 }
 function distance(a,b){
  const rad=Math.PI/180,dl=(b.lat-a.lat)*rad,dn=(b.lng-a.lng)*rad;
  const q=Math.sin(dl/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dn/2)**2;
  return Math.round(6371000*2*Math.asin(Math.sqrt(q)));
 }
 function fare(){
  return {min:null,max:null,icYen:null,paperTicketYen:null,currency:'KRW',
   status:'unverified',label:'Uber 앱에서 확인',checkedAt:'2026-10-26',
   basis:'배차 가능 여부·실제 운임·소요시간은 출발 당시 Uber 앱에서 확인.',
   passEligible:false,passExtraMin:0,passExtraMax:0,sources:[],breakdown:[],confidence:'unknown'};
 }
 function taxiPart(from,to){
  return {mode:'taxi',line:'Uber Taxi · 택시 호출',from:from.name,to:to.name,
   coords:[[from.lat,from.lng],[to.lat,to.lng]],distanceM:distance(from,to),
   durationMinutes:null,geometrySource:'두 장소 대표점의 직선 연결 · 실제 도로 경로/주행거리 아님',
   geometryAccuracy:'schematic'};
 }
 function displayParts(leg){
  if(!leg?.parts?.some(p=>p.mode==='ferry'))return leg?.parts||[];
  const parts=leg.parts.filter(p=>p.mode==='ferry');
  if(!parts.length)return leg.parts;
  const coords=[];for(const p of parts)for(const pt of p.coords||[])if(!coords.length||Math.abs(coords.at(-1)[0]-pt[0])>1e-8||Math.abs(coords.at(-1)[1]-pt[1])>1e-8)coords.push(pt);
  return [{...parts.find(p=>p.geometryAccuracy!=='schematic')||parts[0],coords,suppressSymbol:false,
   distanceM:parts.reduce((n,p)=>n+(p.distanceM||0),0),
   geometryAccuracy:'reference',
   line:'뉴 카멜리아호 · 하카타항 → 부산항 · 참고 항로',
   geometrySource:'FRA 조사 지도 해상 86개 좌표 + 양쪽 항만 연결 개략선. 하나의 연속된 표시선이며 실제 항적·항만 진입 항로가 아닙니다.'}];
 }
 function patch(data,routes){
  // Every planned taxi transfer is requested via Uber, including Japanese city taxis.
  for(const day of data?.days||[])for(const variant of day.variants||[])for(const stop of variant.stops||[]){
   if(stop.modeFromPrevious==='taxi'&&stop.transportFromPrevious&&!/Uber/i.test(stop.transportFromPrevious))
    stop.transportFromPrevious=stop.transportFromPrevious.replace(/택시/g,'Uber Taxi');
  }
  for(const legs of Object.values(routes?.days||{}))for(const leg of legs||[]){
   if(!leg)continue;
   for(const part of leg.parts||[])if(part.mode==='taxi'&&part.line&&!/Uber/i.test(part.line))part.line=part.line.replace(/택시/g,'Uber Taxi');
   if(leg.parts?.some(p=>p.mode==='taxi')&&leg.summary&&!/Uber/i.test(leg.summary))leg.summary=leg.summary.replace(/택시/g,'Uber Taxi');
  }
  const firstDay=data?.days?.find(d=>d.n===1),first=firstDay?.variants?.find(v=>v.id==='main')?.stops?.[0];
  const airport=firstDay?.variants?.find(v=>v.id==='main')?.stops?.[1],firstLeg=routes?.days?.['1-main']?.[0];
  if(first&&airport&&firstLeg&&firstLeg.parts?.[0]?.mode==='taxi'){
   Object.assign(first,{name:HOME.name,kind:'home',lat:HOME.lat,lng:HOME.lng,address:HOME.address,
    time:'07:10-07:20',modeFromPrevious:'walk',transportFromPrevious:'자택 출발 · Uber Taxi 호출 준비',
    description:'대구공항 08:20 도착 목표. 택시 호출·실제 소요시간을 확인하고 여유 있게 출발하세요.',
    precision:'building representative point',coordinateNote:'건물 대표 좌표. 승차 위치는 Uber 앱에서 확인.'});
   airport.transportFromPrevious='월성로 132 → 대구국제공항 · Uber Taxi (호출 시 소요시간 확인)';
   const p=taxiPart(first,airport);firstLeg.from=first.name;firstLeg.to=airport.name;
   firstLeg.parts=[p];firstLeg.summary='Uber Taxi · 월성로 132 → 대구국제공항';
   firstLeg.distanceM=p.distanceM;firstLeg.walkDistanceM=0;
   firstLeg.distanceLabel='직선 참고 · 실제 주행거리 미확인';
   firstLeg.durationMinutes=0;firstLeg.durationLabel='소요시간 미확정';
   firstLeg.fare=fare();firstLeg.note='기존 동대구역 택시 경로는 자택 출발과 맞지 않아 사용하지 않습니다. Uber 앱에서 도로 경로·배차·운임을 확인하세요.';
  }
  const lastDay=data?.days?.find(d=>d.n===22),v=lastDay?.variants?.find(v=>v.id==='main');
  const lastLegs=routes?.days?.['22-main'];
  if(v&&lastLegs?.length){
   const stationStop=v.stops.find(s=>s.uid==='d22-main-6');
   if(stationStop){
    // Keep the raw operator profile names stable: matching a published timetable
    // requires "서대구역 KTX", while stopName() displays only "서대구역".
    stationStop.transportFromPrevious='부산 → 서대구 KTX-산천330 직통 · 현재표 참고';
   }
   if(!v.stops.some(s=>s.uid==='d22-main-home')&&v.stops.at(-1)?.uid==='d22-main-6'){
    const from=v.stops.at(-1),home={...HOME,uid:'d22-main-home',id:'d22-main-home',kind:'home',area:'대구',
     time:'서대구역 하차 후 · 귀가 시각 미확정',modeFromPrevious:'taxi',
     transportFromPrevious:'서대구역 → 월성로 132 · Uber Taxi 호출',
     description:'서대구역에서 Uber 앱으로 택시를 호출하세요. 이동시간·요금은 실시간 확인.',
     source:'https://www.uber.com/global/ko/r/cities/daegu-daegu-kr/',
     coordinateNote:'대표 좌표와 직선 참고 경로이며 실제 택시 이동 경로가 아닙니다.'};
    const part=taxiPart(from,home);
    v.stops.push(home);lastLegs.push({fromUid:from.uid,toUid:home.uid,from:from.name,to:home.name,
     parts:[part],fare:fare(),distanceM:part.distanceM,walkDistanceM:0,
     distanceLabel:'직선 참고 · 실제 주행거리 미확인',durationMinutes:0,durationLabel:'소요시간 미확정',
     summary:'Uber Taxi · 서대구역 → 월성로 132',
     note:'택시 배차와 도로 경로는 Uber 앱에서 확인. 선은 실제 도로/차량 궤적이 아닙니다.'});
   }
  }
  return {data,routes};
 }
 return {HOME,station,stopName,japanese,patch,distance,displayParts};
});
