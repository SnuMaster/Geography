'use strict';
/* Personal itinerary presentation and clearly labelled unverified Uber connections.
 * Raw rail schedules and the original reference routes stay untouched. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TripPersonal=api;})(globalThis,function(){
 const HOME=Object.freeze({name:'비공개 출발·도착지',kind:'home',lat:null,lng:null,address:'',privateLocation:true});

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
 const JA_TO_KO={
  '三ノ宮':'산노미야','中書島':'주쇼지마','中洲川端':'나카스카와바타','京都':'교토',
  '伏見桃山':'후시미모모야마','伏見稲荷':'후시미이나리','住吉':'스미요시','元町':'모토마치',
  '動物園前':'도부쓰엔마에','十三':'주조','博多':'하카타','大濠公園':'오호리코엔',
  '大阪':'오사카','大阪上本町':'오사카우에혼마치','大阪梅田':'오사카우메다','大阪難波':'오사카난바',
  '天王寺':'덴노지','天神橋筋六丁目':'덴진바시스지로쿠초메','宇治':'우지','山崎':'야마자키',
  '嵐山':'아라시야마','嵯峨嵐山':'사가아라시야마','布施':'후세','新今宮':'신이마미야',
  '桂':'가쓰라','梅田':'우메다','森ノ宮':'모리노미야','淀屋橋':'요도야바시',
  '清水五条':'기요미즈고조','祇園':'기온','祇園四条':'기온시조','西新':'니시진',
  '谷町四丁目':'다니마치욘초메','赤坂':'아카사카','近鉄奈良':'긴테쓰나라','難波':'난바'
 };
 function koreanForJapanese(name){
  const raw=String(name||'').trim(),plain=raw.replace(/駅$/,'');
  if(JA_TO_KO[plain])return JA_TO_KO[plain];
  for(const [ko,ja] of Object.entries(EXTRA_JA))if(ja===plain)return ko;
  for(const p of Object.values(globalThis.RailDepartureProfiles?.profiles||{})){
   if(p.country==='KR')continue;
   for(const end of ['from','to'])if(p[end+'Ja']===plain&&p[end])return p[end];
  }
  return null;
 }
 function station(name,japaneseOverride=null,country='JP'){
  const raw=String(name||'');
  if(country==='KR')return raw.replace(/\s*KTX$/,'').replace(/^(부산|서대구|동대구)$/,'$1역');
  if(/[（(][\u3040-\u30ff\u3400-\u9fff]/.test(raw))return raw;
  if(!/[가-힣]/.test(raw)){const ko=koreanForJapanese(raw);if(ko)return ko+'('+raw+')';}
  const ja=japaneseOverride||japanese(raw);
  return ja?raw+'('+ja+')':raw;
 }
 function stopName(stop){
  if(!stop||stop.kind!=='station')return stop?.name||'';
  const country=['대구','부산'].includes(stop.area)||(stop.lat>35&&stop.lng<129.7&&stop.lng>128.2)?'KR':'JP';
  return station(stop.name,null,country);
 }
 // Named Maps searches open place information; coordinate-only searches open a bare pin.
 function placeMapUrl(stop){
  if(!stop||stop.kind==='home'||stop.privateLocation||!String(stop.name||'').trim())return null;
  const url=new URL('https://www.google.com/maps/search/');url.searchParams.set('api','1');
  // Event viewing zones deliberately retain their verified reference point, not the mountain summit.
  if(stop.event&&Number.isFinite(stop.lat)&&Number.isFinite(stop.lng)&&Math.abs(stop.lat)<=90&&Math.abs(stop.lng)<=180){url.searchParams.set('query',stop.lat+','+stop.lng);return url.href;}
  const korean=['대구','부산'].includes(stop.area)||(stop.lat>34&&stop.lng<130),label=stopName(stop),parenthetical=label.match(/[（(]([^()（）]*[\u3040-\u30ff\u3400-\u9fff][^()（）]*)[)）]/)?.[1];
  let name=korean?stop.name:stop.jp||parenthetical||stop.name;
  if(!korean&&stop.kind==='station'&&!/[가-힣]/.test(name))name=name.replace(/駅$/,'')+'駅';
  const region=String(stop.address||stop.area||'').split(/\s*\/\s*/)[0].trim(),query=[name,region,korean?'대한민국':'日本'].filter(Boolean).join(' ');
  url.searchParams.set('query',query);return url.href;
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
  return {mode:'taxi',line:'Uber Taxi · 비공개 구간',from:from.name,to:to.name,coords:[],distanceM:null,durationMinutes:null,geometrySource:'비공개 출발·도착 구간 · 좌표 미보관',geometryAccuracy:'private',source:null};
 }
 function displayParts(leg){
  // Keep the chart-derived sea line and the two separate port connectors intact.
  // The original 86 sea coordinates remain unchanged and the schematic parts
  // are styled separately rather than presented as surveyed harbor tracks.
  return leg?.parts||[];
 }

 function patch(data,routes){
  const privateStrings=new Set();
  for(const day of data?.days||[])for(const variant of day.variants||[])for(const stop of variant.stops||[]){
   if(stop.kind==='home')for(const value of [stop.name,stop.address,stop.address?.match(/[가-힣]+(?:로|길)\s*\d+(?:-\d+)?/)?.[0]])if(value&&value!==HOME.name&&value.length>3)privateStrings.add(value);
   if(stop.modeFromPrevious==='taxi'&&stop.transportFromPrevious&&!/Uber/i.test(stop.transportFromPrevious))stop.transportFromPrevious=stop.transportFromPrevious.replace(/택시/g,'Uber Taxi');
  }
  for(const legs of Object.values(routes?.days||{}))for(const leg of legs||[]){if(!leg)continue;for(const part of leg.parts||[])if(part.mode==='taxi'&&part.line&&!/Uber/i.test(part.line))part.line=part.line.replace(/택시/g,'Uber Taxi');if(leg.parts?.some(p=>p.mode==='taxi')&&leg.summary&&!/Uber/i.test(leg.summary))leg.summary=leg.summary.replace(/택시/g,'Uber Taxi');}
  const firstVariant=data?.days?.find(d=>d.n===1)?.variants?.find(v=>v.id==='main'),first=firstVariant?.stops?.[0],airport=firstVariant?.stops?.[1];
  if(first&&airport){Object.assign(first,HOME,{time:'07:10-07:20',modeFromPrevious:'walk',transportFromPrevious:'비공개 출발지 · Uber Taxi 호출 준비'});airport.transportFromPrevious='비공개 출발지 → 대구국제공항 · Uber Taxi (호출 시 소요시간 확인)';}
  const last=data?.days?.find(d=>d.n===22)?.variants?.find(v=>v.id==='main'),lastLegs=routes?.days?.['22-main'];
  if(last&&lastLegs?.length){const station=last.stops.find(s=>s.uid==='d22-main-6');if(station)station.transportFromPrevious='부산 → 서대구 KTX-산천330 직통 · 현재표 참고';if(!last.stops.some(s=>s.uid==='d22-main-home')&&last.stops.at(-1)?.uid==='d22-main-6'){const from=last.stops.at(-1),home={...HOME,uid:'d22-main-home',id:'d22-main-home',area:'대구',time:'서대구역 하차 후 · 귀가 시각 미확정',modeFromPrevious:'taxi',transportFromPrevious:'서대구역 → 비공개 도착지 · Uber Taxi 호출'};last.stops.push(home);lastLegs.push({fromUid:from.uid,toUid:home.uid});}}
  // Redact old offline snapshots as well as newly loaded files, without dropping place UIDs or visit records.
  for(const day of data?.days||[])for(const variant of day.variants||[]){const stops=variant.stops||[];for(const stop of stops)if(stop.kind==='home'){Object.assign(stop,HOME,{description:'비공개 출발·도착지 · 주소와 좌표는 저장하지 않습니다.',source:null,precision:'private',coordinateNote:'주소·좌표·경로 미보관',mapQuery:''});stop.details={stayLabel:'현장 상황에 따라 조정',costStatus:'unknown',costLabel:'비공개 구간 · 앱에서 확인'};}
   const legs=routes?.days?.[day.n+'-'+variant.id]||[];for(const leg of legs){if(!leg)continue;const from=stops.find(s=>s.uid===leg.fromUid),to=stops.find(s=>s.uid===leg.toUid);if(from?.kind!=='home'&&to?.kind!=='home')continue;const ids={fromUid:leg.fromUid,toUid:leg.toUid};for(const key of Object.keys(leg))delete leg[key];Object.assign(leg,ids,{from:from?.name||HOME.name,to:to?.name||HOME.name,private:true,parts:[taxiPart(from||HOME,to||HOME)],fare:fare(),distanceM:null,walkDistanceM:0,durationMinutes:null,distanceLabel:'비공개 구간 · 거리 미확인',durationLabel:'소요시간은 앱에서 확인',summary:'Uber Taxi · 비공개 출발·도착 구간',note:'주소·좌표·이동 경로는 저장하지 않습니다.'});}
  }
  function scrub(value){if(!value||typeof value!=='object')return;for(const key of Object.keys(value)){if(typeof value[key]==='string'){for(const text of privateStrings)value[key]=value[key].split(text).join(HOME.name);}else scrub(value[key]);}}
  scrub(data);scrub(routes);return {data,routes};
 }
 return {HOME,station,stopName,japanese,placeMapUrl,patch,distance,displayParts};
});
