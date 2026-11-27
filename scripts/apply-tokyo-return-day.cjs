'use strict';
const fs=require('node:fs');
const path=require('node:path');
const Trip=require('../japan-2027/data-model');

const revision='20261127-tokyo-return-day-1';
const busCompany='경북고속';
const busSource='https://vocados.github.io/en/bus-schedules/incheon-airport-terminal-1-to-dongdaegu/';

function apply(bundle){
 if(bundle.revision===revision)return bundle;
 const {data,routes}=bundle;
 const day=data.days.at(-1),variant=day?.variants[0];
 if(data.metadata.id!=='tokyo-20270108-19'||day?.n!==12||day.date!=='01/19'||!variant)throw Error('Expected the January 19–20 combined itinerary');
 const legs=routes.days['12-main'];
 const flightIndex=legs.findIndex(leg=>leg.travel?.depart==='1/20 01:55');
 if(flightIndex<0||variant.stops[flightIndex]?.uid!=='t27-12-hanedaT3')throw Error('Expected Peach MM809 from Haneda Terminal 3');
 const terminal=variant.stops[flightIndex],stops=variant.stops.splice(flightIndex+1),returnLegs=legs.splice(flightIndex);
 const [flight,bus]=returnLegs;
 if(bus.travel?.depart!=='1/20 06:50')throw Error('Expected the 06:50 Dongdaegu bus');

 const departure=structuredClone(terminal);
 departure.uid=departure.id='t27-12-d13-haneda-departure';
 departure.selectionId=0;
 departure.time='00:00~01:55';
 delete departure.modeFromPrevious;
 delete departure.transportFromPrevious;
 departure.description=departure.details.feature='전날 밤에 도착한 하네다 T3에서 01:55 피치항공 MM809 탑승. 체크인 마감 01:05 기준.';
 departure.details.costMin=departure.details.costMax=0;
 departure.details.costLabel='항공권 별도';
 terminal.description=terminal.details.feature='22:15 하네다 T3 도착 목표. 23:25부터 피치항공 카운터에서 출국 수속. MM809는 다음 날 01:55 출발.';
 flight.fromUid=departure.uid;
 for(const stop of stops)stop.dayOffset=0;
 bus.parts.find(part=>part.mode==='bus').operatorBrand='kyungbuk-express';
 bus.travel.notice+=' '+busCompany+' · 06:50 공개 배차 기준. 이용일 운수사는 발권 화면에서 확인.';
 bus.travel.operatorSource=busSource;

 const title='하네다 → 인천 → 동대구';
 const returnVariant={...variant,title,label:title,summary:title,focus:title,stops:[departure,...stops],schedule:[]};
 const returnDay={
  n:13,date:'01/20',weekday:'수',title,shortTitle:title,city:'KOREA',cityLabel:'귀국',cityEn:'Korea',group:'korea',section:'KOREA',
  summary:title,focus:title,mapSummary:title,mapLabel:{city:'귀국',places:title},photoDay:'return',
  variants:[returnVariant],meals:[],routes:[],
  note:'하네다 T3에서 피치항공 MM809 탑승 후 인천 T1에서 동대구 직통 공항버스로 환승.',
  important:'01:55 하네다 T3 출발 · 04:40 인천 T1 도착 · 06:50 동대구 직통 버스 · 10:56 동대구터미널 도착 목표.',
  travelBookings:day.travelBookings.map(booking=>({...booking,day:13,leg:booking.leg-flightIndex}))
 };
 const busBooking=returnDay.travelBookings.find(booking=>booking.key==='airport-bus-back-0650');
 busBooking.details=[...busBooking.details,busCompany+' · 06:50 공개 배차 기준. 이용일 운수사는 발권 화면에서 확인.'];
 delete day.travelBookings;
 day.group='tokyo';
 day.cityLabel='도쿄';
 day.cityEn='Tokyo';
 day.mapLabel={city:'도쿄',places:'이리야 체크아웃·시내 관광·하네다 T3'};
 day.note='시내 관광 후 18:30 숙소에서 짐을 찾고 20:45 이리야 출발 · 하네다 T3에서 출국 수속.';
 day.important='18:30 짐 수령 · 20:45 이리야 출발 · 22:15 하네다 T3 도착 목표 · 23:25 피치항공 수속 시작 기준.';
 data.days.push(returnDay);
 routes.days['13-main']=returnLegs;
 data.nightRows.splice(-1,1,[day.date,day.title,terminal.time],[returnDay.date,returnDay.title,stops.at(-1).time]);
 data.title='KISEKI · 도쿄 11박 13일';
 data.metadata.days=data.days.length;
 Trip.prepare({...data,days:[day,returnDay]},routes);
 for(const changed of [day,returnDay])changed.schedule=changed.rows=changed.variants[0].schedule;
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
