'use strict';
const fs=require('node:fs');
const path=require('node:path');
const T=require('../japan-2027/data-model');
const {points,rows}=require('./tokyo-airport-geometry.json');
const revision='20261125-tokyo-airports-2';
const date='2026-11-25';
const kobus='https://www.kobus.co.kr/';
const jeju='https://www.jejuair.net/ko/prepare/flight/viewScheduleInfo.do';
const narita='https://www.narita-airport.jp/en/access/train/railway-route-3/';
const peach='https://www.flypeach.com/en/lm/ai/airports/airportguide_international/hnd';
const metro='https://www.tokyometro.jp/support/guide/operation/pdf/fare_202603.pdf';
const jr='https://www.jreast.co.jp/2026unchin-kaitei/assets/pdf/kansen.pdf';
const mono='https://www.tokyo-monorail.co.jp/english/guidance/train_info.html';
const tokyo='https://www.gotokyo.org/en/destinations/northern-tokyo/yanaka-and-nezu/index.html';
const departureSource='https://www.anadd.co.kr/officetel/data/gongo01.pdf';
const roads='https://www.openstreetmap.org/copyright';
const copy=structuredClone;
const pt=s=>[s.lat,s.lng];
const start=p=>p.coords[0],end=p=>p.coords.at(-1);
function distance([a,b],[c,d]){
 const rad=Math.PI/180,value=Math.sin((c-a)*rad/2)**2+Math.cos(a*rad)*Math.cos(c*rad)*Math.sin((d-b)*rad/2)**2;
 return 12742000*Math.asin(Math.sqrt(value));
}
function fare(currency,value,source,basis='성인 편도 IC · 현재 공표 운임 기준',breakdown=[]){
 return {min:value,max:value,icYen:currency==='JPY'?value:null,paperTicketYen:null,currency,
  status:value===null?'unverified':currency==='KRW'?'selectedQuote':'exact',
  checkedAt:date,basis,confidence:currency==='KRW'?'user-reference':'source-verified',passEligible:false,sources:[source],breakdown};
}
const noFare=()=>fare('JPY',0,roads,'도보 추가 운임 없음');
function location(uid,name,jp,kind,time,coords,description,source,opt={}){
 const [lat,lng]=coords;
 const {dayOffset=0,thingsToDo=[],costMin=null,costMax=null,reservationTiming}=opt;
 return {uid,id:uid,name,jp,kind,time,lat,lng,area:'',description,source,dayOffset,coordinateAccuracy:'map-reference',
  timeConfidence:'planned',reservationTiming,
  details:{feature:description,thingsToDo,stayLabel:'계획 시각 기준',costMin,costMax,costCurrency:'JPY',
   costKind:kind==='food'?'food':kind==='shopping'?'shopping':'admission',costConfidence:costMin===null?'unknown':'estimate',
   reservationNote:reservationTiming||'실제 운영시간은 이용일 기준',sources:[source],sourceCheckedAt:date}};
}
function update(s,time,description,opt={}){
 delete s.start;delete s.end;
 Object.assign(s,{time,description,...opt});
 if(s.details)Object.assign(s.details,{feature:description});
 return s;
}
function part(key,a,b,mode,line,source,minutes,reverse=false){
 const p=copy(rows[key]);if(reverse)p.coords.reverse();
 return {...p,mode,line,source:p.source||source,from:a.name,to:b.name,durationMinutes:minutes??p.durationMinutes,
  geometryAccuracy:'mapped',geometrySource:p.geometrySource||(mode==='bus'?'OpenStreetMap 도로 참고 경로 · 실제 버스 운행 경로와 다를 수 있음':'OpenStreetMap · 보행 경로 참고')};
}
function walk(key,a,b,minutes){return part(key,a,b,'walk','도보',roads,minutes);}
function connector(a,b,from,to,minutes){
 return {mode:'walk',line:'역내·출입구 연결',from,to,coords:[a,b],distanceM:Math.round(distance(a,b)),durationMinutes:minutes,
  source:mono,geometryAccuracy:'schematic',geometrySource:'역내·출입구 연결 개략선 · 실제 통로는 현장 안내'};
}
function flight(a,b,operator,source,minutes){
 const p=pt(a),q=pt(b);
 return {mode:'flight',line:operator,source,from:a.name,to:b.name,coords:[p,q],distanceM:Math.round(distance(p,q)),
  durationMinutes:minutes,geometryAccuracy:'schematic',geometrySource:'공항 간 개략 항로 · 실제 비행 경로는 운항편마다 달라질 수 있음'};
}
function leg(a,b,parts,amount,minutes,summary='도보',travel){
 b.modeFromPrevious=parts.find(p=>p.mode!=='walk')?.mode||'walk';
 b.transportFromPrevious=summary;
 const distanceM=parts.reduce((n,p)=>n+p.distanceM,0);
 return {fromUid:a.uid,toUid:b.uid,from:a.name,to:b.name,parts,fare:amount,private:false,distanceM,
  walkDistanceM:parts.filter(p=>p.mode==='walk').reduce((n,p)=>n+p.distanceM,0),durationMinutes:minutes,
  durationLabel:minutes>=60?Math.floor(minutes/60)+'시간 '+(minutes%60?minutes%60+'분':''):minutes+'분',
  summary,note:'계획 이동 · 실제 운행과 소요시간은 이용일에 확인',...(travel&&{travel})};
}
function travel(depart,arrive,operator,source,notice){return {depart,arrive,operator,source,notice};}
function daySync(day,legs){
 const v=day.variants[0];let last=-1;
 for(const s of v.stops)last=Math.max(last,s.selectionId??-1);
 v.stops.forEach(s=>{if(s.selectionId==null)s.selectionId=++last;});
 v.schedule=v.stops.map(s=>[s.time,s.name,s.description]);
 day.schedule=v.schedule;day.rows=v.schedule;
 legs.forEach((l,i)=>{const a=v.stops[i],b=v.stops[i+1];Object.assign(l,{from:a.name,to:b.name,fromUid:a.uid,toUid:b.uid});});
}
function booking(key,day,name,when,url,details){
 return {key,group:'travel',kind:'필수',name,day,variant:'main',date:when,url,note:'선택 일정 · 예매 및 발권 상태 확인',details};
}
function apply(bundle){
 const {data,routes}=bundle,[out]=data.days,last=data.days.at(-1);
 if(out.travelBookings?.some(b=>b.key==='airport-bus-out'))return addDeparture(bundle);
 const ov=out.variants[0],ol=routes.days['1-main'];
 const lv=last.variants[0],ll=routes.days['12-main'];
 const [checkout,market,lunch,pickup]=lv.stops;
 const [fromBus,icn,nrt]=[
  location(ov.stops[0].uid,'동대구터미널','東大邱バスターミナル','bus','03:30~03:55',points.bus,'03:30까지 터미널 도착. 03:55 인천공항 T1행 심야 프리미엄 탑승. 70,600원.',kobus),
  location(ov.stops[1].uid,'인천국제공항 제1터미널','仁川国際空港 第1ターミナル','airport','08:15~11:30',points.icn,'08:15 버스 도착 예정. 국제선 수속 및 수하물 위탁 후 제주항공 7C1129 11:30 출발.',jeju),
  location(ov.stops[2].uid,'나리타공항 제3터미널','成田空港 第3ターミナル','airport','14:10~15:20',points.nrt,'14:10 도착. 입국심사·수하물·세관을 통과한 뒤 T2 철도역으로 이동.',narita)
 ];
 [fromBus,icn,nrt].forEach((s,i)=>s.selectionId=ov.stops[i].selectionId);
 ov.stops.splice(0,3,fromBus,icn,nrt);
 update(ov.stops[3],'15:35~15:50','제2터미널 지하 1층 공항제2빌딩역. 입국 수속이 끝난 뒤 탑승 가능한 스카이라이너 지정석 선택. 15:50은 계획 시각.');
 update(ov.stops[4],'16:40','스카이라이너 하차 목표. 도쿄메트로 우에노역으로 이동.');
 update(ov.stops[5],'16:50','히비야선 기타센주 방향 플랫폼으로 이동.');
 update(ov.stops[6],'17:05','이리야역 하차 후 숙소로 도보 이동.');
 update(ov.stops[7],'17:15~17:45','숙소 체크인과 짐 정리.');
 update(ov.stops[8],'18:00~18:45',ov.stops[8].description);
 const outbound='제주항공 7C1129 · 인천 T1 → 나리타 T3';
 const busOut='공항버스 · 동대구 → 인천 T1';
 ol[0]=leg(fromBus,icn,[part('airportBus',fromBus,icn,'bus',busOut,kobus,260)],fare('KRW',70600,kobus,'첨부 화면 · 심야 프리미엄 선택 요금'),260,busOut,
  travel('1/8 03:55','1/8 08:15',busOut,kobus,'심야 프리미엄. 08:15는 인천 T1 도착 예정 시각. 실제 예매와 터미널은 승차권 확인.'));
 ol[1]=leg(icn,nrt,[flight(icn,nrt,outbound,jeju,160)],fare('KRW',null,jeju,'출국편 운임 미입력'),160,outbound,
  travel('1/8 11:30','1/8 14:10',outbound,jeju,'첨부 화면 기준 위탁수하물 15 kg · 737 MAX 8 예정. 최종 운항 조건은 전자항공권 확인.'));
 ol[2]=leg(nrt,ov.stops[3],[walk('naritaWalk',nrt,ov.stops[3],15)],noFare(),15,'T3 → T2 철도역 도보');
 ol[2].distanceLabel='터미널 연결 통로';ol[2].note='T3 도착층 안내소에서 T2역 개찰구까지 공식 약 13분. 연결 통로 표지를 따라간다.';
 out.note='03:55 동대구 출발 · 11:30 인천발 7C1129 · 14:10 나리타 T3 도착 · 스카이라이너 요금 입력 보류';
 out.travelBookings=[
  booking('airport-bus-out',1,'동대구 → 인천공항 T1 공항버스','1/8 03:55 → 08:15',kobus,['심야 프리미엄 · 70,600원 · 03:30까지 터미널 도착']),
  booking('flight-tokyo',1,'제주항공 7C1129 · 인천 T1 → 나리타 T3','1/8 11:30 → 14:10',jeju,['위탁수하물 안내 15 kg · 최종 조건은 전자항공권 확인','11:30 출발 기준 버스 도착 예정 시각과 3시간 15분 간격'])
 ];
 daySync(out,ol);
 const loc=(key,name,jp,kind,time,geo,note,source,opt)=>location('t27-12-'+key,name,jp,kind,time,points[geo],note,source,opt);
 const yanaka=loc('yanaka','야나카 긴자','谷中ぎんざ','shopping','14:00~14:45','yanaka','유야케단단 계단과 상점가 산책. 소형 기념품이나 센베 한두 개만 가볍게 본다.',tokyo);
 const nezu=loc('nezu','네즈 신사','根津神社','sight','15:05~16:00','nezu','도리이 길·연못을 한 바퀴. 이른 일몰을 고려해 카페보다 먼저 방문.', 'https://www.gotokyo.org/en/spot/70/');
 const park=loc('uenoPark','우에노 공원','上野恩賜公園','sight','16:30~17:15','park','우에노 공원 산책. 추우면 우에노역 주변 카페에서 휴식.', 'https://www.gotokyo.org/en/spot/482/');
 const dinner=loc('dinner','마쓰야 이리야점','松屋 入谷店','food','18:00~19:00','dinner','규메시나 정식으로 이른 저녁. 대기가 있으면 이리야역 주변 가게나 편의점으로 전환.',ov.stops[8].source||tokyo,{costMin:500,costMax:1200});
 const hnd=loc('hanedaT3','하네다공항 제3터미널','羽田空港 第3ターミナル','airport','22:15~23:55','hnd','22:15 T3 도착 목표. 23:25 피치 카운터 수속 개시 기준. MM809는 다음 날인 1/20 01:55 출발, 수속 마감 01:05 기준.',peach);
 const arrival=loc('incheonT1','인천국제공항 제1터미널 · 1/20','仁川国際空港 第1ターミナル','airport','04:40~06:20','icn','04:40 도착. 입국심사 → 짐 수령 → 세관 → 1층 버스 승차장. 06:20 버스까지 100분, 놓치면 06:50 잔여석 확인.',kobus,{dayOffset:1});
 const dong=loc('dongdaegu','동대구터미널 · 1/20','東大邱バスターミナル','bus','10:26','bus','06:20 인천 T1발 프리미엄 버스 동대구 도착 예정. 58,800원.',kobus,{dayOffset:1});
 update(checkout,'08:00~10:00','08:00 기상 후 근처 편의점 또는 맥도날드에서 간단히 아침. 10:00까지 체크아웃하고 당일 짐 보관 가능 여부 확인.');
 update(market,'11:00~12:00','아메요코에서 선물용 과자·소품을 구경. 짐이 늘지 않게 소량 구매.');
 update(pickup,'19:45~20:45','숙소에서 짐을 찾고 수하물 무게와 여권을 확인한 뒤 20:45 하네다로 출발.');
 pickup.name='이리야 숙소 · 짐 수령';
 pickup.details.thingsToDo=['짐을 찾고 수하물 무게와 여권을 확인한다. 20:45까지 공항으로 출발한다.'];
 const metroHome=copy(ll[0].parts.slice(0,3));
 const yamanote=copy(rows.yamanote),monorail=copy(rows.monorail);
 const hndParts=[...metroHome,
  connector(end(metroHome.at(-1)),start(yamanote),'도쿄메트로 우에노','JR 우에노',8),
  yamanote,connector(end(yamanote),start(monorail),'JR 하마마쓰초','모노레일 하마마쓰초',8),
  monorail,connector(end(monorail),pt(hnd),'하네다 T3역','하네다 T3 출국층',8)];
 const breakdown=[
  {operator:'TokyoMetro',from:'이리야',to:'우에노',icYen:178,paperTicketYen:180,lineIds:['TokyoMetro.Hibiya'],sources:[metro]},
  {operator:'JR-East',from:'우에노',to:'하마마쓰초',icYen:209,paperTicketYen:210,lineIds:[yamanote.lineId],sources:[jr]},
  {operator:'TokyoMonorail',from:'모노레일 하마마쓰초',to:'하네다공항 제3터미널',icYen:519,paperTicketYen:520,lineIds:[monorail.lineId],sources:[mono]}
 ].map(p=>({...p,checkedAt:date,currency:'JPY',status:'exact',basis:'현재 공표 성인 편도 IC 운임'}));
 const accessFare=fare('JPY',906,mono,'히비야선 178 + JR 209 + 도쿄 모노레일 519 · 2027년 이용 전 재확인',breakdown);
 accessFare.paperTicketYen=910;accessFare.sources=[metro,jr,mono];
 accessFare.label='906 JP¥';accessFare.passExtraMin=accessFare.passExtraMax=728;
 for(const row of breakdown){const p=hndParts.find(p=>p.lineId===row.lineIds[0]);Object.assign(row,{fromJa:p.fromJa,toJa:p.toJa});}
 const inbound='피치항공 MM809 · 하네다 T3 → 인천 T1';
 const busBack='공항버스 · 인천 T1 → 동대구';
 const airBack=leg(hnd,arrival,[flight(hnd,arrival,inbound,peach,165)],fare('KRW',469000,peach,'첨부 화면의 수하물 포함 참고 운임 · 결제액 확인'),165,inbound,
  travel('1/20 01:55','1/20 04:40',inbound,peach,'1/19 밤 하네다 수속. 첨부 화면 기준 위탁수하물 20 kg · A320 계열. 469,000원 운임 기준.'));
 airBack.departureLocal='2027-01-20T01:55';
 const baseLegs=[...ll.slice(0,2)];
 const routeLegs=[
  ...baseLegs,
  leg(lunch,yanaka,[walk('lunchYanaka',lunch,yanaka)],noFare(),rows.lunchYanaka.durationMinutes),
  leg(yanaka,nezu,[walk('yanakaNezu',yanaka,nezu)],noFare(),rows.yanakaNezu.durationMinutes),
  leg(nezu,park,[walk('nezuPark',nezu,park)],noFare(),rows.nezuPark.durationMinutes),
  leg(park,dinner,[walk('parkDinner',park,dinner)],noFare(),rows.parkDinner.durationMinutes),
  leg(dinner,pickup,[walk('dinnerHotel',dinner,pickup)],noFare(),rows.dinnerHotel.durationMinutes),
  leg(pickup,hnd,hndParts,accessFare,75,'히비야선 → JR 야마노테선 → 도쿄 모노레일'),
  airBack,
  leg(arrival,dong,[part('airportBus',arrival,dong,'bus',busBack,kobus,246,true)],fare('KRW',58800,kobus,'첨부 화면 · 프리미엄 선택 요금'),246,busBack,
   travel('1/20 06:20','1/20 10:26',busBack,kobus,'프리미엄 · 인천 T1 기준. 수하물 수령이 늦어지면 06:50편 좌석 확인.'))
 ];
 lv.stops=[checkout,market,lunch,yanaka,nezu,park,dinner,pickup,hnd,arrival,dong];
 const title='우에노·야나카·네즈 · 하네다';
 Object.assign(lv,{title,summary:title,focus:title});
 Object.assign(last,{title,shortTitle:title,summary:title,focus:title,mapSummary:title,
  note:'1/19 시내 관광 후 밤에 하네다 T3로 이동. 1/20 01:55 피치 MM809, 06:20 인천 T1발 동대구행.',
  important:'1/19 22:15 하네다 T3 도착 목표 · 1/20 01:55 출발 · 04:40 인천 T1 · 06:20 버스. 입국·수하물에 걸리는 시간에 유의.',
  meals:[lunch.name,dinner.name],
  travelBookings:[
   booking('flight-return-tokyo',12,'피치항공 MM809 · 하네다 T3 → 인천 T1','1/20 01:55 → 04:40',peach,['1/19 밤 공항 이동 · 수속 23:25~01:05 현재 공식 기준','위탁수하물 20 kg 포함 참고 운임 469,000원 · 전자항공권 확인']),
   booking('airport-bus-back',12,'인천공항 T1 → 동대구 공항버스','1/20 06:20 → 10:26',kobus,['프리미엄 · 58,800원','항공기 예정 도착과 100분 간격 · 늦을 경우 06:50편 잔여석 확인'])
  ]});
 delete last.pendingReturn;
 routes.days['12-main']=routeLegs;
 daySync(last,routeLegs);
 Object.assign(data.metadata,{end:'2027-01-20',japanEnd:'2027-01-19',calendarDays:13,returnDate:'2027-01-20',returnStatus:'selected'});
 if(data.nightRows.length){data.nightRows[0]=[out.date,out.title,ov.stops.at(-1).time];data.nightRows[data.nightRows.length-1]=[last.date,last.title,'1/19 밤 하네다 · 1/20 새벽 귀국'];}
 return addDeparture(bundle);
}
function addDeparture(bundle){
 const {data,routes}=bundle,out=data.days[0],v=out.variants[0],legs=routes.days['1-main'];
 const uid='t27-12-d1-anadd-departure';
 if(v.stops[0].uid===uid)return bundle;
 const terminal=v.stops[0];
 const start=location(uid,'어나드범어아파트','','departure','03:05~03:10',
  points.departure,'03:05 차량 호출 준비. 03:10 단지 앞에서 출발해 03:30까지 동대구터미널 도착 목표.',departureSource);
 start.area='대구 수성구';
 const taxi='택시 · 어나드범어아파트 → 동대구터미널';
 const route=part('departureTaxi',start,terminal,'taxi',taxi,roads,12);
 legs.unshift(leg(start,terminal,[route],fare('KRW',null,roads,'미터 요금 · 호출 시 확인'),12,taxi));
 legs[0].durationLabel='약 12분 · 호출 여유 별도';
 v.stops.unshift(start);
 daySync(out,legs);
 out.note='03:10 어나드범어아파트 → 03:55 동대구 버스 → 11:30 인천발 7C1129 · 스카이라이너 요금 입력 보류';
 bundle.revision=data.version=data.metadata.revision=routes.version=revision;
 bundle.updatedAt='2026-11-25T14:30:00+09:00';
 return bundle;
}
if(require.main===module){
 const file=path.resolve(__dirname,'../japan-2027/trip-update.json');
 const bundle=apply(JSON.parse(fs.readFileSync(file,'utf8')));
 T.prepare(bundle.data,bundle.routes);
 fs.writeFileSync(file,JSON.stringify(bundle)+'\n');
}
module.exports={apply,revision};
