'use strict';
const fs=require('node:fs');
const path=require('node:path');
const Trip=require('../japan-2027/data-model');
const {applyRoute}=require('./apply-review-buses.cjs');
const CompleteFares=require('./complete-tokyo-fares.cjs');
const reviewed=require('./tokyo-reviewed-bus-geometry.json');
const direct=require('./tokyo-fuji-station-return-geometry.json');

const revision='20261127-tokyo-final-day-edits-1';
const checkedAt='2026-11-27';
const redLine='https://bus.fujikyu.co.jp/fujitour/kawaguchiko/';

function placeNote(stop,description,thingsToDo){
 stop.description=stop.details.feature=description;
 stop.details.thingsToDo=thingsToDo;
}

function updateFuji(day,legs){
 const {stops}=day.variants[0];
 const index=stops.findIndex(stop=>stop.planKey==='ropeway');
 if(index<1||stops[index+1]?.planKey!=='fujiStation')throw Error('Expected the lake-to-station itinerary');
 const origin=stops[index-1],station=stops[index+1],leg=legs[index-1];
 origin.time='15:15~15:40';
 placeNote(origin,'북쪽 호숫가 산책 후 미술관 정류장에서 가와구치코역행 레드라인 탑승.',[
  '15:40까지 호숫가를 걷고 가와구치코 미술관 정류장(河口湖美術館)으로 이동해요.',
  '기본 15:50 → 가와구치코역 16:09 · 대체 16:05 → 16:24. 운영사 공개 시간표 기준이에요.'
 ]);
 origin.details.sources=[...new Set([...origin.details.sources,redLine])];
 station.time='16:15~17:41';
 placeNote(station,'가와구치코역 복귀 · 후지회유 48호 17:41 출발.',[
  '역에서 발권·탑승 차량·승강장을 확인해요.',
  '17:41 가와구치코 → 19:48 신주쿠.'
 ]);

 const previous=reviewed.routes.find(row=>row.key==='5-main'&&row.index===index-1);
 const {stops:busStops}=direct;
 const boarding=busStops[0],alighting=busStops.at(-1);
 const waitMinutes=Trip.minutes(boarding.departure.slice(0,5))-Trip.minutes(Trip.interval(origin).end)-previous.walkIn.durationMinutes;
 if(waitMinutes<0)throw Error('Insufficient time to reach the Kawaguchiko bus');
 applyRoute(leg,origin,station,{...previous,...direct,boarding,alighting,waitMinutes},checkedAt);
 leg.to=station.name;
 leg.toUid=station.uid;
 leg.minutes=leg.durationMinutes;
 leg.fare=null;
 leg.busTimetable={source:redLine,trips:[['15:50','16:09'],['16:05','16:24']]};
 station.transportFromPrevious=leg.summary+' · '+leg.durationLabel;
 stops.splice(index,1);
 legs.splice(index,1);
 for(const order of day.railOrders)if(order.leg>index+1)order.leg--;
 day.important='후지회유 15호 10:30 출발 · 미술관 정류장 15:50 레드라인 → 가와구치코역 16:09 · 후지회유 48호 17:41 출발.';
 return leg;
}

function updateNikko(day,legs){
 const leg=legs.find(l=>l.busTimetable?.trips[0][0]==='15:50');
 if(!leg)throw Error('Expected the Nikko return bus');
 const [[depart,arrive],[backupDepart,backupArrive]]=leg.busTimetable.trips;
 const trainTime=day.railOrders.find(order=>order.leg===leg.legIndex+1).departure.time;
 const margin=Trip.minutes(trainTime)-Trip.minutes(backupArrive);
 leg.connectionBackup={
  text:`주젠지온센 → 도부닛코역 · 기본 ${depart} → ${arrive} · 대체 ${backupDepart} → ${backupArrive}. 대체편 이용 시 ${trainTime} 스페이시아 X까지 시간표상 ${margin}분.`,
  source:leg.busTimetable.source
 };
}

function updateLuggage(day){
 const {stops}=day.variants[0],checkout=stops.find(stop=>stop.uid==='t27-12-d12-hotelCheckout');
 const pickup=stops.find(stop=>stop.uid==='t27-12-d12-hotelPickup');
 placeNote(checkout,'10:00까지 체크아웃. 당일 짐 보관과 18:30 수령 가능 여부를 숙소에 미리 확인.',[
  '체크아웃 전에 프런트에 짐을 맡길 수 있는지와 수령 시간을 확인해요.'
 ]);
 placeNote(pickup,'18:30부터 숙소 프런트에서 짐을 찾아요.',[
  '19:00까지 짐을 찾고 여권과 수하물을 확인해요.'
 ]);
}

function apply(bundle){
 if(bundle.revision===revision)return bundle;
 const {data,routes}=bundle;
 const [fuji,nikko,returnDay]=[5,8,12].map(n=>data.days.find(day=>day.n===n));
 if(data.metadata.id!=='tokyo-20270108-19'||fuji?.date!=='01/12'||nikko?.date!=='01/15'||returnDay?.date!=='01/19'){
  throw Error('Expected the active 12-day Tokyo itinerary');
 }
 const changed=updateFuji(fuji,routes.days['5-main']);
 const fares=CompleteFares.apply(bundle);
 if(fares.missing.length||changed.fare?.icYen!==370)throw Error('Unverified Kawaguchiko return fare');
 changed.fare.checkedAt=checkedAt;
 updateNikko(nikko,routes.days['8-main']);
 updateLuggage(returnDay);
 Trip.prepare({...data,days:[fuji,returnDay]},routes);
 for(const day of [fuji,returnDay])day.schedule=day.rows=day.variants[0].schedule;
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
