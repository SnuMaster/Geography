'use strict';
const fs=require('node:fs');
const path=require('node:path');
const Trip=require('../japan-2027/data-model');

const revision='20261126-tokyo-rail-orders-1';
const fujikyu='https://www.fujikyu-railway.jp/en/fujikaiyuu/';
const spacia='https://www.tobu.co.jp/spaciax/en/guide/';
const spaciaFare='https://www.tobu.co.jp/railway/special_express/transit_fare/spacia/index.html';
const winter='https://www.tobu-bus.com/pc/area/pdf/nikko_timetable_winter_en.pdf?20261118=';
const minutesBetween=(start,end)=>Trip.minutes(end)-Trip.minutes(start);
const stopTime=(stop,time)=>{stop.time=time;};

function reviseStop(stop,time,description,tasks){
 stopTime(stop,time);
 stop.description=stop.details.feature=description;
 stop.details.thingsToDo=tasks;
}

function duration(leg,minutes,label='계획 약 '+minutes+'분'){
 Object.assign(leg,{minutes,durationMinutes:minutes,durationLabel:label});
}

function order(day,leg,service,departure,arrival,seat,shownKrw,source){
 return {date:day.date,leg,service,departure,arrival,seat,shownKrw,source};
}

function train(leg,booking,parts,times,summary){
 for(const [i,part] of parts.entries()){
  const value=minutesBetween(times[i],times[i+1]);
  Object.assign(part,{durationMinutes:value,minutes:value});
 }
 leg.summary=summary||booking.service+' · 직통';
}

function bus(leg,origin,trips,{source=leg.busTimetable.source,skip,label}={}){
 Object.assign(leg.busTimetable,{source,trips});
 if(skip)leg.busTimetable.skip.trips=skip;
 const [depart,arrival]=trips[0],part=leg.parts.find(p=>p.mode==='bus');
 const {boarding,alighting,accessMinutes,egressMinutes}=leg.busRoute;
 const leave=Trip.interval(origin).end;
 const waiting=minutesBetween(leave,depart)-accessMinutes;
 if(waiting<0)throw Error('No time to board at '+boarding.name);
 for(const point of [boarding,part.boardingStop]){
  point.departure=depart+':00';
  if(point.arrival)point.arrival=point.departure;
 }
 for(const point of [alighting,part.alightingStop]){
  point.arrival=arrival+':00';
  if(point.departure)point.departure=point.arrival;
 }
 leg.busRoute.waitMinutes=waiting;
 part.durationMinutes=minutesBetween(depart,arrival);
 if(label){
  leg.summary=part.line=label;
  leg.busRoute.geometryBasis+=' · 계획편과 공통 정류장 구간';
 }
 const value=minutesBetween(leave,arrival)+egressMinutes;
 duration(leg,value,'계획 약 '+value+'분 · 도보·대기 포함');
}

function tobuReferenceFare(leg,seat,surcharge,extra=0){
 const fare=leg.fare,row=fare.breakdown.find(r=>r.operator==='TobuNikko');
 const ic=row.baseIcYen,paper=row.basePaperTicketYen,total=surcharge+extra;
 Object.assign(row,{
  icYen:ic+total,paperTicketYen:paper+total,reservedSurchargeYen:total,
  ticketLabel:'스페이시아 X '+seat+' 특급권 · 기본 운임 별도',
  basis:`도부닛코–기타센주 기본 IC ${ic.toLocaleString('ko-KR')}엔 + ${seat} 특급 ${surcharge.toLocaleString('ko-KR')}엔${extra?' + 1인 특별좌석 '+extra+'엔':''} · 통상기 공표 비교 요금`,
  sources:[...new Set([...row.sources,spaciaFare,spacia])]
 });
 const min=fare.breakdown.reduce((sum,r)=>sum+r.icYen,0);
 Object.assign(fare,{
  min,max:min,icYen:min,paperTicketYen:fare.breakdown.reduce((sum,r)=>sum+r.paperTicketYen,0),
  label:min.toLocaleString('ko-KR')+' JP¥',passExtraMin:row.icYen,passExtraMax:row.icYen,
  basis:'성인 편도 · 기본 IC 운임 + 신청 좌석의 공표 특급권 비교 요금',
  sources:[...new Set([...fare.sources,spaciaFare,spacia])]
 });
}

function fujiDay(day,legs){
 const s=day.variants[0].stops;
 const out=order(day,2,'후지회유 15호',{station:'신주쿠',time:'10:30',platform:'10'},{station:'가와구치코',time:'12:24'},'일반 객차 지정석 · 창가 희망',39016,fujikyu);
 const back=order(day,8,'후지회유 48호',{station:'가와구치코',time:'17:41'},{station:'신주쿠',time:'19:48'},'일반 객차 지정석 · 창가 희망',39016,fujikyu);
 day.railOrders=[out,back];
 stopTime(s[0],'08:00~09:05');
 reviseStop(s[1],'10:00~10:30','후지회유 15호 · 신주쿠 10:30 출발',[
  '10:30 신주쿠 → 12:24 가와구치코. 신청 화면의 신주쿠 승강장은 10번이에요.',
  '발권 확인 후 탑승 차량 번호와 현장 승강장 안내를 확인하세요.'
 ]);
 reviseStop(s[2],'12:24~12:40','후지회유 15호 도착 · 레드라인으로 환승',[
  '12:45 레드라인 → 오이시공원 13:12. 다음 후보는 13:00 → 13:27.'
 ]);
 stopTime(s[3],'13:15~13:50');
 s[3].details.thingsToDo[3]='13:57 레드라인 → 가와구치코 미술관 14:05. 다음 후보는 14:12 → 14:20.';
 stopTime(s[4],'14:20~15:00');
 stopTime(s[5],'15:15~15:29');
 s[5].details.thingsToDo[2]='미술관 정류장 15:35편으로 로프웨이 입구에 15:41 도착. 줄이 길면 15:50 → 16:09 또는 16:05 → 16:24 버스로 가와구치코역에 바로 가세요.';
 reviseStop(s[6],'15:45~16:35','선택 방문 · 조망이 좋고 대기가 짧을 때만 로프웨이 이용',[
  '운행·마지막 하행편을 현장에서 보고, 16:35까지 내려올 수 있을 때만 탑승하세요.',
  '대기가 길거나 시야가 나쁘면 생략하고 가와구치코역에 17:00 전후 도착을 우선하세요.'
 ]);
 reviseStop(s[7],'17:00~17:41','후지회유 48호 · 가와구치코 17:41 출발',['17:41 가와구치코 → 19:48 신주쿠. 발권 메일과 출발 승강장을 확인하세요.']);
 reviseStop(s[8],'19:48','후지회유 48호 도착 · 야마노테선으로 이동',['우에노 방향 야마노테선에 탄 뒤 히비야선으로 갈아탑니다.']);
 stopTime(s[9],'20:40~21:15');stopTime(s[10],'21:25~21:40');
 train(legs[1],out,legs[1].parts.filter(p=>p.mode==='rail'),['10:30','12:24']);duration(legs[1],114,'열차 1시간 54분');
 train(legs[7],back,legs[7].parts.filter(p=>p.mode==='rail'),['17:41','19:48']);duration(legs[7],127,'열차 2시간 7분');
 bus(legs[2],s[2],[['12:45','13:12'],['13:00','13:27']]);
 bus(legs[3],s[3],[['13:57','14:05'],['14:12','14:20']]);
 bus(legs[5],s[5],[['15:35','15:41'],['15:50','15:56']],{skip:[['15:50','16:09'],['16:05','16:24']]});
 day.important='후지회유 15호 10:30 출발 · 48호 17:41 귀환. 로프웨이는 조망·대기 상황을 보고 선택.';
}

function nikkoDay(day,legs){
 const s=day.variants[0].stops;
 const out=order(day,1,'스페이시아 X 5호',{station:'기타센주',time:'10:12'},{station:'도부닛코',time:'11:49'},'콕핏 라운지 1석',23200,spacia);
 const back=order(day,6,'스페이시아 X 12호',{station:'도부닛코',time:'17:44'},{station:'기타센주',time:'19:21'},'프리미엄 좌석',23900,spacia);
 day.railOrders=[out,back];
 stopTime(s[0],'08:00~09:25');
 reviseStop(s[1],'11:49~12:10','스페이시아 X 5호 도착 · 주젠지온센 방향 버스 환승',[
  '10:12 기타센주 → 11:49 도부닛코. YK 12:15편 → 주젠지온센 13:00.',
  '다음 YK편은 12:45 → 13:30. 이 편을 타면 호숫가 시간을 줄이세요.',
  '산 위 버스 운행이 불안정하면 신쿄 주변과 닛코 시내 점심·카페로 조정하세요.'
 ]);
 stopTime(s[2],'13:10~13:55');stopTime(s[3],'14:05~14:45');stopTime(s[4],'14:55~15:30');
 s[4].details.thingsToDo[2]='주젠지온센 15:50 → 도부닛코역 16:26 목표. 다음 후보는 16:30 → 17:06. 스페이시아 X 17:44 출발을 우선하세요.';
 reviseStop(s[5],'16:35~17:44','스페이시아 X 12호 · 도부닛코 17:44 출발',['17:44 도부닛코 → 19:21 기타센주. 버스 지연과 승강장 이동에 여유를 두세요.']);
 stopTime(s[6],'19:55~20:30');stopTime(s[7],'20:45~21:00');
 train(legs[0],out,legs[0].parts.filter(p=>p.mode==='rail'),['10:12','10:33','11:49'],'히비야선 → 스페이시아 X 5호');
 train(legs[5],back,legs[5].parts.filter(p=>p.mode==='rail'),['17:44','19:00','19:21'],'스페이시아 X 12호 → 히비야선');
 duration(legs[0],minutesBetween('09:25','11:49'));duration(legs[5],123);
 tobuReferenceFare(legs[0],'콕핏 라운지',1940,500);tobuReferenceFare(legs[5],'프리미엄',2520);
 bus(legs[1],s[1],[['12:15','13:00'],['12:45','13:30']],{source:winter,label:'도부버스 YK · 주젠지온센 경유 유모토온센행'});
 bus(legs[4],s[4],[['15:50','16:26'],['16:30','17:06']],{source:winter,label:'도부버스 YK · 도부닛코역 방면'});
 day.important='스페이시아 X 5호 10:12 출발 · 12호 17:44 귀환. 버스 운행이 불안정하면 신쿄·닛코 시내로 변경.';
}

function apply(bundle){
 if(bundle.revision===revision)return bundle;
 const {data,routes}=bundle;
 if(data.metadata.id!=='tokyo-20270108-19'||data.days.length!==12)throw Error('Expected current 12-day itinerary');
 for(const [n,edit] of [[5,fujiDay],[8,nikkoDay]]){
  const day=data.days.find(d=>d.n===n),legs=routes.days[n+'-main'];
  edit(day,legs);
  const stops=day.variants[0].stops;
  for(const [i,leg] of legs.entries())stops[i+1].transportFromPrevious=leg.summary+' · '+leg.durationLabel;
  day.note='신청한 열차 시각 기준 · 탑승 전 발권 확인. 버스는 공표 시간표 기준.';
  Trip.prepare({...data,days:[day]},routes);
  day.schedule=day.rows=day.variants[0].schedule;
  data.nightRows.find(row=>row[0]===day.date)[2]=stops.at(-1).time;
 }
 bundle.revision=data.version=data.metadata.revision=routes.version=revision;
 bundle.updatedAt=new Date().toISOString();
 return bundle;
}

if(require.main===module){
 const file=path.resolve(__dirname,'../japan-2027/trip-update.json');
 const bundle=apply(JSON.parse(fs.readFileSync(file,'utf8')));
 fs.writeFileSync(file,JSON.stringify(bundle)+'\n');
}
module.exports={apply,revision};
