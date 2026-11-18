'use strict';
// Apply the user-approved plan to the atomic map bundle. Raw legacy schedules
// remain intact. All new map points are public facilities, never private homes.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const plan=require('./tokyo-detailed-plan.json'),root=path.resolve(__dirname,'../japan-2027');
const baseline=JSON.parse(cp.execFileSync('git',['show','14c47cdfd4a6d839d4ee24d93810b7f4f9997959:japan-2027/trip-update.json'],{maxBuffer:20e6}).toString('utf8'));
const M=require('./tokyo-plan-map-tools.cjs'),{T,clone,point,dist,station,stations,HOTEL,DOME}=M;
const routes={},days=[],registry={},resolved={},roads={};
const revision=plan.revision,stamp='2026-11-18';
const oldPlaces=[...baseline.data.days.flatMap(d=>d.variants.flatMap(v=>v.stops)),...['data.json','tokyo-data.json','west-data.json'].flatMap(f=>JSON.parse(fs.readFileSync(root+'/'+f)).days.flatMap(d=>d.variants.flatMap(v=>v.stops)))];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function json(url){let error;for(let i=0;i<3;i++){try{const r=await fetch(url,{headers:{'User-Agent':'KISEKI-Public-Itinerary/1.0 (github.com/SnuMaster/Geography)'},signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error('HTTP '+r.status);return await r.json();}catch(e){error=e;await sleep(1200*(i+1));}}throw error;}
const cacheFile=path.join(M.cache,'detailed-points.json');
const saved=fs.existsSync(cacheFile)?JSON.parse(fs.readFileSync(cacheFile)):{};
async function resolve(key,entry){
 if(saved[key]?.address===entry.address)return saved[key];
 const exact=oldPlaces.find(s=>s.lat&&s.lng&&(s.name===entry.name||s.jp===entry.jp)&&s.coordinateAccuracy!=='approximate');
 if(exact)return {...clone(exact),address:entry.address,source:exact.source||exact.details?.sources?.[0]||'https://maps.gsi.go.jp/'};
 // Address search is deliberately described as an address representative, not
 // an invented exact storefront entrance. Ambiguous results fail the build.
 const url='https://msearch.gsi.go.jp/address-search/AddressSearch?q='+encodeURIComponent(entry.address);
 const rows=await json(url);await sleep(1100);
 if(!Array.isArray(rows)||rows.length!==1||!rows[0].geometry?.coordinates)throw Error('Ambiguous public address '+key+' '+JSON.stringify(rows).slice(0,300));
 const [lng,lat]=rows[0].geometry.coordinates;if(!(lat>34&&lat<38&&lng>137&&lng<141))throw Error('Outside trip area '+key);
 return {lat,lng,address:entry.address,source:url,coordinateAccuracy:'address-reference',coordinateNote:'국토지리원 공개 주소 대표 좌표 · 매장·시설 실제 출입구는 현장 안내 확인'};
}
function detail(s,p={}){const text=p.note||s.description||'주변 구경·산책. 운영·휴무는 방문 전 확인.';return {feature:text,thingsToDo:[text],stayLabel:'계획 시각 기준',costMin:p.costMin??null,costMax:p.costMax??null,costCurrency:'JPY',costKind:['food','cafe','shopping'].includes(s.kind)?s.kind:'admission',costConfidence:s.kind==='food'?'estimate':p.costMin===0?'free-reference':'reference',costNote:s.kind==='food'?'1인 식사 예상 예산 · 음료·추가 주문·2027 메뉴 가격 별도 확인':s.kind==='shopping'?'실제 구매 금액만 기록':'방문일 요금·유료 구역 확인',reservationNote:'계획 일정 · 예약 완료 아님. 혼잡한 식당은 예약 가능 여부 확인; 긴 현장 대기는 생략.',sources:[s.source].filter(Boolean),sourceCheckedAt:stamp};}
function item(key,time){
 let s;
 if(key==='hotel')s={...clone(HOTEL),description:'STAY&GO 이리야키타 숙박 · 1/19 체크아웃까지. 숙박 예약·비용은 확인서 기준.'};
 else if(key.startsWith('dome')){s={...clone(DOME),description:'도쿄 돔 호텔 · 1/19~1/22 3박 계획. 체크인·짐 보관은 예약 확인서와 호텔 안내 기준.'};if(key==='domeBags')s.name='도쿄 돔 호텔 · 짐 맡기기';if(key==='domeCheckin')s.name='도쿄 돔 호텔 · 체크인·휴식';if(key==='domeCheckout')s.name='도쿄 돔 호텔 · 체크아웃·짐 보관';if(key==='domePickup'){s.name='도쿄 돔 호텔 · 짐 수령·공항 이동 준비';s.description='1/22 저녁 한국 귀국 예정 · 공항·항공사·편명·터미널·시각 미정. 항공편을 확정한 뒤 실제 이동 경로 추가.';}}
 else if(key==='fujiShinjuku')s=clone(baseline.data.days[7].variants[0].stops[1]);
 else if(key==='fujiStation')s=clone(baseline.data.days[7].variants[0].stops[2]);
 else if(key==='nikkoStation')s=station('Tobu.Nikko.TobuNikko');
 else if(key==='free')s={...clone(HOTEL),name:'자유시간 · 공연 가능일',kind:'rest',description:'1/18은 비워 둡니다. 늦잠·세탁·휴식 후 공연 티켓을 확보한 경우에만 공연장 이동. 장소·시간 확정 전 의무 관광·식당 예약 없음.',coordinateNote:'휴식일의 숙소 대표 지점 · 공연장 위치 아님'};
 else if(key==='ginzaRest')s={...clone(registry.muji),name:'긴자 실내 휴식·카페 선택',kind:'rest',description:'이부키 예약 목표 시각 전 휴식. 카페는 현장 선택 · 특정 업장 예약 없음.',coordinateNote:'긴자 지역 대표 지점 · 특정 카페 위치 아님'};
 else s=clone(registry[key]);
 if(!s)throw Error('Unknown plan point '+key);
 s.time=time;s.planKey=key;delete s.start;delete s.end;delete s.reservationKey;delete s.reservationTiming;
 if(!s.details||['free','ginzaRest'].includes(key)||key.startsWith('dome'))s.details=detail(s);
 if(key==='ibuki')s.details.reservationNote='긴자 이부키 유지 · 1인 좌석 예약 목표, 현재 예약 확정 아님. 기본 식사 18,150 JP¥ 예상, 음료 별도.';
 return s;
}
const roadKey=(mode,a,b)=>[mode,...point(a).map(n=>Number(n).toFixed(7)),...point(b).map(n=>Number(n).toFixed(7))].join('|');
async function road(mode,a,b){
 const k=roadKey(mode,a,b);if(roads[k])return roads[k];
 const distance=dist(a,b);if(distance<20)return null;
 const url='https://routing.openstreetmap.de/routed-'+mode+'/route/v1/driving/'+point(a).slice().reverse().join(',')+';'+point(b).slice().reverse().join(',')+'?overview=full&geometries=geojson&steps=false';
 try{const d=await json(url),r=d.routes?.[0];if(d.code!=='Ok'||!r?.geometry?.coordinates?.length)throw Error('No road');
 const coords=r.geometry.coordinates.map(([lng,lat])=>[lat,lng]);
 if(dist(coords[0],a)>180||dist(coords.at(-1),b)>180)throw Error('Road snap too far');
 const p={mode:mode==='foot'?'walk':'bus',line:mode==='foot'?'도보':'버스 · 도로 참고 경로',from:a.name,to:b.name,coords,distanceM:Math.round(r.distance),durationMinutes:Math.ceil(r.duration/60),geometryAccuracy:'mapped',geometrySource:'OpenStreetMap / FOSSGIS '+(mode==='foot'?'보행':'도로')+' 참고 경로 · 실제 통제·운행 확인',source:url};roads[k]=p;return clone(p);
 }catch(e){console.warn('Route unavailable',mode,a.name,b.name,e.message);return null;}finally{await sleep(1100);}
}
function walk(a,b){const k=roadKey('foot',a,b);if(roads[k])return {...clone(roads[k]),from:a.name,to:b.name};return M.walk(a,b);}
function connection(a,b,spec){
 if(spec)return M.connection(a,b,spec);
 const meters=dist(a,b);
 if(meters<20)return {...M.connection(a,b,[walk(a,b)]),planningRequired:false};
 if(meters<=3000){const p=walk(a,b);if(p.geometryAccuracy!=='schematic')return {...M.connection(a,b,[p]),planningRequired:meters>1200};}
 const part={...M.connector(a,b,'대중교통 경로 확인 필요'),durationMinutes:Math.max(15,Math.ceil(meters/400)),geometrySource:'장소 사이 계획 연결 · 실제 교통 선형 미확정'};
 return {...M.connection(a,b,{parts:[part],fare:M.unknown(),minutes:part.durationMinutes,summary:'대중교통 경로 확인 필요'}),planningRequired:true};
}
function railway(id,from,to,extra={}){return M.rail(id,from,to,extra);}
function baselineLeg(day,index){const l=clone(baseline.routes.days[day+'-main'][index]);delete l.timeComparison;return l;}
function addDay(p,ss,ls,id='main',label='기본 일정'){
 ss=ss.map((s,i)=>({...s,uid:'t27-p1118-d'+p.n+'-'+id+'-'+i,id:'t27-p1118-d'+p.n+'-'+id+'-'+i,selectionId:i,timeConfidence:'planned'}));
 const legs=ss.slice(1).map((s,i)=>ls?.[i]||connection(ss[i],s));
 legs.forEach((l,i)=>{l.fromUid=ss[i].uid;l.toUid=ss[i+1].uid;ss[i+1].modeFromPrevious=l.parts.find(p=>!['walk','transfer'].includes(p.mode))?.mode||'walk';ss[i+1].transportFromPrevious=l.summary+' · '+l.durationLabel;});
 const variant={id,label,title:p.title,summary:p.title,focus:p.title,stops:ss};
 const d={n:p.n,date:'01/'+String(p.n+7).padStart(2,'0'),weekday:['일','월','화','수','목','금','토'][new Date(Date.UTC(2027,0,p.n+7)).getUTCDay()],title:p.title,shortTitle:p.title,city:'TOKYO',cityLabel:p.city,cityEn:p.city,group:p.n===1||p.n===15?'korea':'tokyo',section:'TOKYO',summary:p.title,focus:p.title,mapSummary:p.title,variants:[variant],meals:ss.filter(s=>s.kind==='food').map(s=>s.name),routes:[],note:'2026-11-18 승인 상세 일정 · 계획 시각·예약 여부 구분',breakfast:'',breakfastNote:'',mapLabel:{city:p.city,places:p.title},photoDay:({1:2,2:1,3:3,4:6,5:8,6:1,7:1,8:0,9:1,10:7,11:1,12:10,13:11,14:1,15:1})[p.n]};
 routes[p.n+'-'+id]=legs;days.push(d);return d;
}
(async()=>{
 for(const [key,p]of Object.entries(plan.catalog)){const s=await resolve(key,p);resolved[key]=s;registry[key]={...s,name:p.name,jp:p.jp,kind:p.kind,area:p.address,description:p.note||'산책·주변 구경. 영업·휴무는 방문 전 확인.'};registry[key].details=detail(registry[key],p);console.log('Point',key,registry[key].lat,registry[key].lng);}
 fs.writeFileSync(cacheFile,JSON.stringify(resolved));
 // Build every stop before routing; no geocoding request includes a private home.
 const prepared=plan.days.map(p=>({p,ss:p.stops.map(([k,t])=>item(k,t))}));
 const unique=[...new Map(prepared.flatMap(d=>d.ss).filter(s=>s.lat&&s.lng).map(s=>[point(s).join(','),s])).values()];
 // Reuse reviewed street geometry first. Only missing short public paths query
 // the pedestrian router; request pacing follows the public server policy.
 for(const s of unique){const byName=new Map();for(const st of stations.filter(st=>dist(s,[st.coord[1],st.coord[0]])<1500).sort((a,b)=>dist(s,[a.coord[1],a.coord[0]])-dist(s,[b.coord[1],b.coord[0]]))){if(!byName.has(st.title.ja))byName.set(st.title.ja,st);}
  for(const st of [...byName.values()].slice(0,3)){const at=station(st.id),p=walk(s,at);if(p.geometryAccuracy==='schematic'&&p.distanceM>30){const result=await road('foot',s,at);if(result)roads[roadKey('foot',at,s)]={...clone(result),from:at.name,to:s.name,coords:result.coords.slice().reverse()};}}
 }
 for(const {ss}of prepared)for(let i=1;i<ss.length;i++){const a=ss[i-1],b=ss[i],m=dist(a,b);if(m>20&&m<=3000&&walk(a,b).geometryAccuracy==='schematic')await road('foot',a,b);}
 for(const {p,ss}of prepared){
  if(p.n===1){
   const v=clone(baseline.data.days[0].variants[0]),stops=v.stops.slice(0,8);
   stops[7].time='16:30-17:30';
   const dinner={...clone(HOTEL),name:'숙소 근처 저녁 · 이리야',kind:'food',time:'17:40-18:30',description:'첫날은 숙소 근처 정식·면류로 가볍게. 1인 1,000~1,500 JP¥ · 긴 현장 대기 없이 선택.',coordinateNote:'숙소 주변 대표 지점 · 식당 현장 선택'};
   dinner.details=detail(dinner,{costMin:1000,costMax:1500});
   const donki=clone(M.DONKI);donki.time='19:00-20:00';donki.description='첫 번째 쇼핑 · 여행 중 쓸 생활용품·세면용품·간식만. 센소지 관광은 추가하지 않음.';
   const finish=item('hotel','20:30-21:00');
   const ls=clone(baseline.routes.days['1-main'].slice(0,7));const sky=ls.find(l=>l.fare?.displayBlank||l.parts.some(p=>/스카이라이너/.test(p.line)));if(sky)sky.fare=M.unknown(true);
   const extra=[dinner,donki,finish];for(const s of extra){const prev=stops.at(-1);if(dist(prev,s)>20&&walk(prev,s).geometryAccuracy==='schematic')await road('foot',prev,s);ls.push(connection(prev,s));stops.push(s);}addDay(p,stops,ls);continue;
  }
  const ls=ss.slice(1).map((s,i)=>connection(ss[i],s));
  if(p.n===5){
   ls[0]=baselineLeg(8,0);ls[1]=baselineLeg(8,1);ls[7]=baselineLeg(8,7);ls[8]=M.connection(ss[8],ss[9],{parts:baselineLeg(8,10).parts.filter(p=>['rail','metro'].includes(p.mode)),minutes:75,fare:M.unknown()});
   for(const i of [2,3,4,5,6]){const a=ss[i],b=ss[i+1];if(dist(a,b)>1500){const roadPart=await road('car',a,b);if(roadPart){Object.assign(roadPart,{line:'가와구치코 관광버스 · 정류장·시각 확인',lineId:'Fujikyu.Kawaguchiko.Red',durationMinutes:Math.max(20,roadPart.durationMinutes+15),geometrySource:roadPart.geometrySource+' · 정류장 승하차 경로 미확정'});ls[i]=M.connection(a,b,{parts:[roadPart],fare:M.unknown(),minutes:roadPart.durationMinutes});}}}
  }
  if(p.n===8){
   const a=station('TokyoMetro.Hibiya.Iriya'),k=station('TokyoMetro.Hibiya.KitaSenju'),tb=station('Tobu.Nikko.TobuDobutsuKoen'),n=station('Tobu.Nikko.TobuNikko');
   const out=[railway('TokyoMetro.Hibiya',a,k),railway('Tobu.TobuSkytree',station('Tobu.TobuSkytree.KitaSenju'),station('Tobu.TobuSkytree.TobuDobutsuKoen'),{line:'도부 특급 · 닛코 방면',throughService:true}),railway('Tobu.Nikko',tb,n,{line:'도부 특급 · 닛코 방면',throughService:true})];
   ls[0]=M.connection(ss[0],ss[1],{parts:out,minutes:150,fare:M.unknown()});
   ls[5]=M.connection(ss[5],ss[6],{parts:out.slice().reverse().map(p=>({...clone(p),from:p.to,to:p.from,fromJa:p.toJa,toJa:p.fromJa,coords:p.coords.slice().reverse()})),minutes:160,fare:M.unknown()});
   for(const i of [1,3,4]){const a=ss[i],b=ss[i+1],r=await road('car',a,b);if(r){Object.assign(r,{line:'도부버스 닛코 · 주젠지호·유모토 방면',lineId:'TobuBus.Nikko.C',durationMinutes:Math.max(i===4?65:i===1?55:30,r.durationMinutes+15),geometrySource:r.geometrySource+' · 겨울 운행·정류장·시각 확인'});ls[i]=M.connection(a,b,{parts:[r],fare:M.unknown(),minutes:r.durationMinutes});}}
  }
  const d=addDay(p,ss,ls);
  if(p.n===8)d.important='겨울 설경 · 버스·결빙·제설 상태를 우선 확인. 산본마쓰는 당일 조건이 좋을 때만; 불가하면 주젠지호 주변 식사 후 일찍 귀환. 도쇼구·미제설 센조가하라 트레킹은 기본 일정 제외.';
  if(p.n===11){d.important='1/18 공연 가능성을 위해 비운 날. 공연장·티켓·시각 미확정; 고정 관광과 식당 예약 없음.';routes['11-main'].forEach(l=>{l.durationMinutes=0;l.durationLabel='자유시간';l.summary='휴식 · 이동 없음';l.parts=[];l.fare=M.free();});}
  if(p.n===15){d.pendingReturn={date:'2027-01-22',period:'저녁',status:'unconfirmed',airport:null,flight:null,departure:null,arrival:null};d.important='귀국편·공항·터미널·시각 미정. 도쿄돔시티 일정은 항공편 확정 후 축소·생략 가능. 오사카 일정 없음.';}
 }
 const data={version:revision,title:'KISEKI · 도쿄 14박 15일',metadata:{...clone(baseline.data.metadata),revision,start:'2027-01-08',end:'2027-01-22',days:15,nights:14,cities:['도쿄','요코하마','가와구치코','닛코','가마쿠라·에노시마'],returnStatus:'unconfirmed',skylinerFare:'blank',planApprovedAt:stamp,mealBudget:'일반 식사 최대 2,000 JP¥ 목표 · 미도리·이부키 특별식 별도'},days,food:clone(baseline.data.food),nightRows:[]};
 const bundle={revision,updatedAt:stamp,data,routes:{version:revision,days:routes,distanceBasis:'핀 고정 철도 선형·OpenStreetMap 보행·도로 참고 경로. 대표 지점 연결은 개략선으로 구분.',sources:[...baseline.routes.sources,'https://routing.openstreetmap.de/about.html']}};
 require(root+'/rail-departure-profiles.js');
 const report=require('./tokyo-fastest-planner.cjs').apply(bundle,{walk,connector:M.connector,rail:railway,connection,unknown:M.unknown,interval:T.interval,minutes:T.minutes,setTime:T.setTime,formatTime:T.formatTime,distance:dist,planUncovered:true,networkOptions:{includeShinkansen:false}});
 require('./tokyo-fare-references.cjs').apply(bundle);
 // New OD identities keep historic personal expenses/checkmarks on their old
 // cards. Departure comparisons are references, never 2027 live guarantees.
 T.prepare(bundle.data,bundle.routes);
 for(const d of days){const v=d.variants[0];d.schedule=v.schedule;d.rows=v.schedule;data.nightRows.push([d.date,d.title,v.stops.at(-1).time]);}
 fs.writeFileSync(root+'/trip-update.json',JSON.stringify(bundle)+'\n');
 fs.writeFileSync(__dirname+'/tokyo-detailed-plan-report.json',JSON.stringify({revision,places:resolved,planning:report,counts:T.counts(data,bundle.routes),warnings:M.warnings},null,2)+'\n');
 console.log(JSON.stringify({revision,days:days.length,points:Object.keys(resolved).length,planning:report.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{})}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
