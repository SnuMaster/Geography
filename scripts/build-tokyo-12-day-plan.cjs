'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const M = require('./tokyo-plan-map-tools.cjs');
const T = require('../japan-2027/data-model.js');
const plan = require('./tokyo-12-day-plan.json');
const root = path.join(__dirname, '..');
const target = path.join(root, 'japan-2027/trip-update.json');
const revision = '20261124-tokyo-12-days';
const stamp = '2026-11-24';
const previous = JSON.parse(execFileSync('git', ['show', '0020c114d4ea810fd354b32eafb77c0dd18d0fb9:japan-2027/trip-update.json'], {cwd:root,maxBuffer:20*1024*1024}));
const oldRoutes = previous.routes.days;
const old = ref => {
  const [day,index] = ref.split(':').map(Number);
  return previous.data.days[day-1].variants[0].stops[index];
};
const copy = structuredClone;
const named = (name,jp,kind,lat,lng,source) => ({name,jp,kind,lat,lng,source,coordinateAccuracy:'map-reference'});
const representative = (base,name,kind,jp) => {
  const {lat,lng,source} = base;
  return {...named(name,jp,kind,lat,lng,source),coordinateNote:'주변 지역 대표 지점 · 실제 식당·입구는 현장에서 선택'};
};
const station = id => M.station(id);
const extra = {
  kamakura:station('JR-East.Yokosuka.Kamakura'),
  haseLunch:representative(station('Enoden.Enoden.Hase'),'하세역 주변 점심','food','長谷駅 周辺'),
  nishihama:named('가타세 니시하마 해변','片瀬西浜海岸','sight',35.31005,139.47807,'https://discover-fujisawa.jp/en/special/fuji/'),
  fujisawaDinner:representative(station('Enoden.Enoden.Fujisawa'),'후지사와역 주변 저녁','food','藤沢駅 周辺'),
  '10:7':{...old('10:7'),lat:35.303976,lng:139.481948,coordinateAccuracy:'map-reference',coordinateNote:'에노시마 벤텐바시 공개 대표 지점'},
  '8:3':{...old('8:3'),lat:36.7396889,lng:139.4929975,coordinateAccuracy:'map-reference',source:'https://chuzenjiko-cruise.com/access.html',coordinateNote:'주젠지호 동쪽 선착장 공개 대표 지점'},
  '14:6':{...old('14:6'),lat:35.681251,lng:139.764952,coordinateAccuracy:'map-reference',coordinateNote:'도쿄역 마루노우치 정면 광장 대표 지점'},
  parco:named('시부야 PARCO 6층','渋谷PARCO','shopping',35.662069,139.698781,'https://shibuya.parco.jp/floor/detail/?f=6f&type=type1'),
  nikkoLunch:representative({lat:36.739117,lng:139.499664,source:'https://www.nikko-kankou.org/features/52'},'주젠지온센 상점가 점심','food','中禅寺温泉'),
  kitte:named('KITTE 마루노우치 옥상 정원','KITTE丸の内','sight',35.679948,139.764674,'https://marunouchi.jp-kitte.jp/gb/information.jsp'),
  gift:named('도쿄 기프트 팔레트','東京ギフトパレット','shopping',35.681764,139.767583,'https://www.tokyoeki-1bangai.co.jp/tokyogiftpalette/'),
  towerDinner:representative(station('TokyoMetro.Hibiya.Kamiyacho'),'가미야초 주변 저녁','food','神谷町駅 周辺'),
  hotelCheckout:{...old('1:7'),name:'STAY&GO 이리야키타 · 체크아웃'},
  hotelPickup:{...old('1:7'),name:'이리야 숙소 · 짐 수령 및 공항 이동'}
};
const sources = {
  '10:4':'https://www.hasedera.jp/guide/',
  '10:7':'https://discover-fujisawa.jp/en/ssws__mst_area/enoshima/',
  '3:1':'https://www.gotokyo.org/jp/spot/624/index.html',
  '3:5':'https://bonus-track.net/store/%E6%9C%AC%E5%B1%8B-bb/',
  '4:1':'https://fng.or.jp/shinjuku/access/map/',
  '4:3':'https://www.meijijingu.or.jp/en/map/',
  '5:1':'https://www.fujikyu-railway.jp/fujikaiyuu/',
  '5:3':'https://www.town.fujikawaguchiko.lg.jp/ka/info.php?if_id=2346',
  '5:6':'https://www.mtfujiropeway.jp/guide/',
  '6:6':'https://www.gotokyo.org/jp/story/walks-and-tours/ueno/index.html',
  '6:7':'https://www.gotokyo.org/jp/spot/71/index.html',
  '13:5':'https://akihabara-radiokaikan.co.jp/floor-guide/',
  '13:4':'https://www.kandamyoujin.or.jp/keidai/',
  '7:1':'https://www.shijou.metro.tokyo.lg.jp/info/0/kenngaku/kenngaku1',
  '7:3':'https://www.toyosu-senkyakubanrai.jp/faq',
  '7:4':'https://www.unicorn-gundam-statue.jp/',
  '7:6':'https://www.gotokyo.org/jp/spot/39/index.html',
  '8:1':'https://www.tobu.co.jp/spaciax/guide/',
  '8:2':'https://www.kegon.jp/info/',
  '8:3':'https://www.nikko-kankou.org/features/52',
  '9:1':'https://www.tokyo-park.or.jp/park/hama-rikyu/',
  '9:2':'https://www.ito-ya.co.jp/ext/store/ginza/ginza/index.html',
  '9:8':'https://ginza-ibuki.com/menu/',
  '14:7':'https://www.tokyoeki-1bangai.co.jp/tokyocharacterstreet/',
  '12:8':'https://www.gotokyo.org/jp/destinations/southern-tokyo/tokyo-tower-and-around/index.html',
  '11:1':'https://www.gotokyo.org/jp/spot/170/index.html'
};
function makeStop(row,day,index,total) {
  const [ref,time,feature,activities,cost] = row;
  const s = copy(extra[ref] || old(ref));
  const base = s.details || {};
  const isStart = s.kind==='hotel' && index===0;
  const isEnd = s.kind==='hotel' && index===total-1 && day!==12;
  const description = feature || (isStart?'08:00쯤 기상 · 편의점이나 맥날에서 간단히 아침':isEnd?'숙소에서 휴식':s.description);
  const list = activities ? activities.split('|') : isStart ?
    [day===5||day===8?'전날 준비한 편의점 아침을 간단히 먹고 출발합니다.':'숙소 근처 편의점이나 이동 중 맥날에서 아침을 먹고 준비합니다.'] : isEnd ?
    ['숙소에 돌아와 쉬고 다음 날에 쓸 물건을 준비합니다.'] : base.thingsToDo||[];
  const [sourceDay] = ref.split(':').map(Number);
  if(day!==sourceDay) s.uid=s.id='t27-12-d'+day+'-'+(Number.isFinite(sourceDay)?ref.replace(':','-'):ref);
  s.selectionId=index;
  s.time=time;
  s.timeConfidence='planned';
  delete s.start;
  delete s.end;
  s.description=description;
  s.details={...base,feature:description,thingsToDo:list,stayLabel:'계획 시각 기준',
    sources:[...new Set([sources[ref],s.source,...(base.sources||[])].filter(Boolean))],sourceCheckedAt:stamp};
  if (cost) Object.assign(s.details,{costMin:cost[0],costMax:cost[1],costCurrency:'JPY',
    costKind:s.kind==='food'||ref==='6:7'||ref==='4:6'?'food':'admission',
    costConfidence:s.kind==='food'||ref==='6:7'||ref==='4:6'?'estimate':'official-current',
    costNote:ref==='5:6'||ref==='8:2'?'선택 이용 · 성인 왕복 요금':ref==='9:8'?'기본 코스 세금·서비스료 포함 예상 · 음료 별도':s.kind==='food'?'1인 식사 예산 · 현장 메뉴 확인':'공식 요금 · 방문일 확인'});
  if(ref==='9:8') s.details.reservationNote='1/16 18:00, 1인 좌석 예약 목표. 좌석과 취소 조건은 공식 예약 화면에서 확인하세요.';
  if(isStart||isEnd||day===12&&s.kind==='hotel') delete s.details.reservationNote;
  if(ref==='6:7'&&day===12) Object.assign(s.details,{costMin:null,costMax:null,costKind:'shopping',costNote:'구매 시 실제 비용 기록'});
  return s;
}
const rail = (line,from,to,opts) => M.rail(line,station(line+'.'+from),station(line+'.'+to),opts);
const metro = (line,from,to,opts) => rail('TokyoMetro.'+line,from,to,opts);
const jr = (line,from,to,opts) => rail('JR-East.'+line,from,to,opts);
const enoden = (a,b) => rail('Enoden.Enoden',a,b);
const hibiya = (a,b) => metro('Hibiya',a,b);
const ginza = (a,b) => metro('Ginza',a,b);
const range = (day,i) => copy(oldRoutes[day+'-main'][i]);
const publicRide = (day,i) => range(day,i).parts.filter(p=>['metro','rail','bus'].includes(p.mode));
const fromCoord = (coord,name) => ({lat:coord[0],lng:coord[1],name});
function reverse(part) {
  return {...copy(part),from:part.to,to:part.from,fromJa:part.toJa,toJa:part.fromJa,coords:part.coords.slice().reverse()};
}
function walked(a,b) {
  return M.walk(a,b);
}
function bind(a,b,parts,minutes,fare) {
  const plan = M.connection(a,b,{parts,minutes,fare:fare||M.unknown()});
  return {...plan};
}
function transferred(...segments) {
  return segments.flatMap((seg,i)=>{
    if (!i) return [seg];
    const before=segments[i-1],end=before.coords.at(-1),start=seg.coords[0];
    if(M.dist(end,start)<70)return [seg];
    return [walked(fromCoord(end,before.to),fromCoord(start,seg.from)),seg];
  });
}
const spacia = {serviceName:'스페이시아 X',throughService:'직통 열차 · 계속 탑승'};
const nikkoOutbound=publicRide(8,0).map(p=>p.mode==='rail'?{...p,...spacia}:p);
const nikkoReturn=[...nikkoOutbound.slice(1).reverse().map(reverse),reverse(nikkoOutbound[0])];
const nikkoDown = publicRide(8,4)[0];
const nikkoUp = publicRide(8,1)[0];
const cut = nikkoDown.coords.reduce((best,p,i)=>M.dist(p,nikkoUp.coords.at(-1))<M.dist(nikkoDown.coords[best],nikkoUp.coords.at(-1))?i:best,0);
const nikkoDownPoints=nikkoDown.coords.slice(cut);
const nikkoDownStops=nikkoDown.stopSequence.slice(nikkoDown.stopSequence.findIndex(s=>s.name==='中禅寺温泉'));
const nikkoDownBus={...nikkoDown,from:'中禅寺温泉',fromJa:'中禅寺温泉',coords:nikkoDownPoints,boardingStop:nikkoDownStops[0],stopSequence:nikkoDownStops,distanceM:Math.round(M.length(nikkoDownPoints)),durationMinutes:55};
function reverseNikkoBusFare(){
  const fare=range(8,1).fare;
  fare.breakdown=fare.breakdown.map(row=>({...row,from:row.to,to:row.from,fromJa:row.toJa,toJa:row.fromJa}));
  return fare;
}
const through = {throughService:'직통 열차 · 계속 탑승'};
const routesByPair = {
 '10:0>kamakura':()=>({parts:range(10,0).parts.slice(0,range(10,0).parts.findLastIndex(p=>p.mode==='rail')+1),minutes:100,fare:range(10,0).fare}),
 '10:2>10:4':()=>({parts:[enoden('Kamakura','Hase')],minutes:25}),
 '10:5>10:7':()=>({parts:[enoden('Hase','Enoshima')],minutes:40}),
 'nishihama>fujisawaDinner':()=>({parts:[enoden('Enoshima','Fujisawa')],minutes:35}),
 'fujisawaDinner>10:9':()=>({parts:transferred(jr('Tokaido','Fujisawa','Tokyo',through),jr('Takasaki','Tokyo','Ueno',through),hibiya('Ueno','Iriya')),minutes:86}),
 '3:0>3:1':()=>({parts:transferred(hibiya('Iriya','Ueno'),jr('Yamanote','Ueno','Kanda'),jr('ChuoRapid','Kanda','Kichijoji')),minutes:65}),
 '3:6>3:7':()=>({parts:transferred(rail('Keio.Inokashira','ShimoKitazawa','Shibuya'),ginza('Shibuya','Ueno'),hibiya('Ueno','Iriya')),minutes:67}),
 '4:0>4:1':()=>({parts:transferred(hibiya('Iriya','Ueno'),jr('Yamanote','Ueno','Shinjuku')),minutes:52}),
 '4:6>4:8':()=>({parts:transferred(ginza('Shibuya','Ueno'),hibiya('Ueno','Iriya')),minutes:52}),
 '5:0>5:1':()=>({parts:transferred(hibiya('Iriya','Ueno'),jr('Yamanote','Ueno','Shinjuku')),minutes:48}),
 '5:8>5:9':()=>({parts:transferred(jr('Yamanote','Shinjuku','Ueno'),hibiya('Ueno','Iriya')),minutes:46}),
 '6:0>6:6':()=>({parts:[hibiya('Iriya','Ueno')],minutes:23}),
 '13:8>6:9':()=>({parts:[hibiya('Akihabara','Iriya')],minutes:23}),
 '7:7>7:8':()=>({parts:transferred(rail('Yurikamome.Yurikamome','OdaibaKaihinkoen','Shimbashi'),ginza('Shimbashi','Ueno'),hibiya('Ueno','Iriya')),minutes:64}),
 '8:0>8:1':()=>({parts:transferred(...nikkoOutbound),minutes:140}),
 '8:3>8:5':()=>({parts:[nikkoDownBus],minutes:64,fare:reverseNikkoBusFare()}),
 '8:5>8:6':()=>({parts:transferred(...nikkoReturn),minutes:123}),
 '9:0>9:1':()=>({parts:[hibiya('Iriya','Tsukiji')],minutes:43}),
 '6:0>14:7':()=>({parts:transferred(hibiya('Iriya','Ueno'),jr('Yamanote','Ueno','Tokyo')),minutes:35}),
 'kitte>12:8':()=>({parts:[rail('Toei.Mita','Otemachi','Onarimon')],minutes:35}),
 'towerDinner>6:9':()=>({parts:[hibiya('Kamiyacho','Iriya')],minutes:37}),
 'hotelCheckout>6:7':()=>({parts:[hibiya('Iriya','Ueno')],minutes:28}),
 '6:8>hotelPickup':()=>({parts:[hibiya('Ueno','Iriya')],minutes:22})
};
const walkSource = 'https://routing.openstreetmap.de/about.html';
async function verifyWalk(part) {
  if (part.mode!=='walk'||part.geometryAccuracy!=='schematic'||part.distanceM<50) return part;
  const coords = [part.coords[0],part.coords.at(-1)];
  const query = coords.map(([lat,lng])=>lng+','+lat).join(';');
  const url = 'https://routing.openstreetmap.de/routed-foot/route/v1/driving/'+query+'?overview=full&geometries=geojson';
  try {
    const response=await fetch(url,{signal:AbortSignal.timeout(14000),headers:{'User-Agent':'KISEKI-Itinerary/1.0 (github.com/SnuMaster/Geography)'}});
    if(!response.ok) throw Error('HTTP '+response.status);
    const {routes} = await response.json();
    const [r] = routes||[];
    const geometry=r?.geometry?.coordinates?.map(([lng,lat])=>[lat,lng]);
    if(!geometry?.length||M.dist(geometry[0],coords[0])>75||M.dist(geometry.at(-1),coords[1])>75)throw Error('Far from public endpoint');
    const joined=[coords[0],...geometry,coords[1]];
    return {...part,line:'도보',coords:joined,distanceM:Math.round(M.length(joined)),durationMinutes:Math.ceil(r.duration/60),geometryAccuracy:'mapped',geometrySource:'OpenStreetMap / FOSSGIS 보행 참고 경로',source:walkSource};
  } catch(e) {
    console.warn('Walking map reference unavailable:',part.from,part.to,e.message);
    return part;
  }
}
async function makeLeg(a,b,left,right) {
  const key=left+'>'+right;
  const spec=routesByPair[key]?.();
  const [day,i]=left.split(':').map(Number),[toDay,j]=right.split(':').map(Number);
  let leg;
  if (spec) leg=bind(a,b,spec.parts,spec.minutes,spec.fare);
  else if (day===toDay&&j===i+1&&(day===1||M.dist(a,old(left))<2&&M.dist(b,old(right))<2)) leg=range(day,i);
  else leg=M.connection(a,b);
  const parts=[];
  for (const p of leg.parts) {
    const candidate=p.mode==='transfer'&&p.distanceM>120&&!leg.private ? walked(fromCoord(p.coords[0],p.from),fromCoord(p.coords.at(-1),p.to)) : p;
    const verified=await verifyWalk(candidate);
    parts.push(candidate===p||verified.geometryAccuracy!=='schematic'?verified:p);
  }
  leg={...leg,parts,fromUid:a.uid,toUid:b.uid,from:a.name,to:b.name};
  if(key==='5:1>5:2'){leg.minutes=leg.durationMinutes=118;leg.durationLabel='계획 약 118분';}
  if(key==='8:3>8:5'){
    const index=parts.findIndex(p=>p.mode==='bus');
    const duration=ps=>ps.reduce((total,p)=>total+p.durationMinutes,0);
    const accessMinutes=duration(parts.slice(0,index)),egressMinutes=duration(parts.slice(index+1));
    const busRoute=range(8,4).busRoute;
    leg.busRoute={...busRoute,boarding:nikkoDownBus.boardingStop,alighting:nikkoDownBus.alightingStop,stops:nikkoDownStops,accessMinutes,egressMinutes};
    leg.durationMinutes=accessMinutes+egressMinutes+nikkoDownBus.durationMinutes+busRoute.waitMinutes;
    leg.durationLabel='계획 약 '+leg.durationMinutes+'분 · 도보·대기 포함';
  }
  delete leg.timeComparison;
  if(spec) delete leg.routePreference;
  const mappedWalking=parts.filter(p=>p.mode==='walk'||p.mode==='transfer');
  if(!leg.private) {
    leg.distanceM=parts.reduce((n,p)=>n+(p.distanceM||0),0);
    leg.walkDistanceM=mappedWalking.reduce((n,p)=>n+(p.distanceM||0),0);
  }
  if(!spec&&day!==toDay&&parts.every(p=>p.mode==='walk'||p.mode==='transfer')){
    leg.durationMinutes=parts.reduce((n,p)=>n+(p.durationMinutes||0),0);
    leg.durationLabel='계획 약 '+leg.durationMinutes+'분';
  }
  b.modeFromPrevious=parts.find(p=>!['walk','transfer'].includes(p.mode))?.mode||'walk';
  b.transportFromPrevious=leg.summary+' · '+leg.durationLabel;
  return leg;
}
async function build(){
 const days=[], routes={};
 for(const p of plan){
  const n=p.day,d=copy(previous.data.days[n-1]),v=d.variants[0];
  const rows=n===1?[...Array.from({length:7},(_,i)=>['1:'+i,old('1:'+i).time]),...p.items]:p.items;
  const stops=rows.map((row,i)=>makeStop(row,n,i,rows.length));
  const legs=[];
  for (let i=1;i<stops.length;i++) legs.push(await makeLeg(stops[i-1],stops[i],rows[i-1][0],rows[i][0]));
  console.log('Prepared',n,p.title,stops.length,'stops');
  Object.assign(v,{title:p.title,summary:p.title,focus:p.title,stops});
  Object.assign(d,{title:p.title,shortTitle:p.title,summary:p.title,focus:p.title,mapSummary:p.title,cityLabel:p.city,cityEn:p.city,group:n===1||n===12?'korea':'tokyo',mapLabel:{city:p.city,places:p.title},photoDay:p.photo,
    meals:stops.filter(s=>s.kind==='food').map(s=>s.name),breakfast:n===1?'':'08:00쯤 기상 · 편의점 또는 맥날',breakfastNote:n===5||n===8?'전날 아침을 사두고 출발 전에 간단히 먹기.':'',
    note:'계획 시각 · 예약과 교통편은 이용일에 확인'});
  delete d.important;
  delete d.pendingReturn;
  delete d.fareAlternatives;
  if(n===5)d.important='후지회유 09:30 출발 / 16:48 귀환 목표. 로프웨이는 조망·대기 상황에 따라 선택.';
  if(n===8)d.important='스페이시아 X 09:13 출발 / 17:44 귀환 목표. 버스 운행이 불안정하면 신쿄·닛코 시내로 변경.';
  if(n===11)d.important='공연 가능일. 공연이 없으면 닛포리역에서 야나카긴자 자유 산책.';
  if(n===12){
    d.pendingReturn={date:'2027-01-19',period:'저녁',status:'unconfirmed',airport:null,flight:null,departure:null,arrival:null};
    d.important='귀국편·공항·터미널·시각 미정. 짐 보관 가능 여부 확인 후 항공편에 맞춰 이동.';
  }
  routes[n+'-main']=legs;
  days.push(d);
 }
 const metadata={...previous.data.metadata,id:'tokyo-20270108-19',revision,end:'2027-01-19',days:12,nights:11,planApprovedAt:stamp,
  cities:['도쿄','가마쿠라·에노시마','가와구치코','닛코'],mealBudget:'일반 식사 최대 2,000 JP¥ 목표 · 이부키 별도'};
 for (const key of ['fastestCheckedAt','fastestScope','fastestCoverage','reviewedBusLegs','unpricedPublicTransport']) delete metadata[key];
 const food={};
 for(const d of days)for(const s of d.variants[0].stops.filter(s=>s.kind==='food')){
   const info=s.details;
   food[s.planKey||s.uid]={name:s.name,jp:s.jp,area:s.area||'',order:info.feature,budget:info.costMin!=null?info.costMin.toLocaleString('ko-KR')+(info.costMax==null?' JP¥부터':(info.costMax===info.costMin?'':'~'+info.costMax.toLocaleString('ko-KR'))+' JP¥'):'현장 확인',
     hours:'여행일 영업 확인',note:info.thingsToDo.join(' '),url:info.sources[0]||''};
 }
 const bundle={revision,updatedAt:stamp,data:{...previous.data,version:revision,title:'KISEKI · 도쿄 11박 12일',metadata,days,food,nightRows:[]},routes:{...previous.routes,version:revision,days:routes}};
 const fares=require('./complete-tokyo-fares.cjs').apply(bundle);
 if(fares.missing.length)throw Error('Unverified fare OD: '+fares.missing.join(', '));
 console.log('Fare OD still to confirm:', fares.missing);
 T.prepare(bundle.data,bundle.routes);
 require('./apply-tokyo-bus-connections.cjs').apply(bundle);
 require('./apply-tokyo-airport-plan.cjs').apply(bundle);
 T.prepare(bundle.data,bundle.routes);
 for(const d of days){
   d.schedule=d.rows=d.variants[0].schedule;
   bundle.data.nightRows.push([d.date,d.title,d.n===12?'1/19 밤 하네다 · 1/20 새벽 귀국':(d.variants[0].stops.at(-1)?.time||'')]);
 }
 fs.writeFileSync(target,JSON.stringify(bundle)+'\n');
 console.log(T.counts(bundle.data,bundle.routes));
}
build().catch(e=>{console.error(e);process.exitCode=1;});
