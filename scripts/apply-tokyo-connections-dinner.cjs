'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {gunzipSync}=require('node:zlib');
const Trip=require('../japan-2027/data-model');
const {walk}=require('./apply-tokyo-asakusa-day.cjs');

const root=path.join(__dirname,'../japan-2027');
const revision='20261127-tokyo-connections-dinner-1';
const checkedAt='2026-11-27';
const skylinerTimetable='https://www.keisei.co.jp/keisei/tetudou/skyliner/jp/traffic/skyliner_timetable_1123.php';
const airportBusTimetable='https://airportbus.or.kr/bus/schedule.php?area=regional';
const restaurant='https://shop.bsp-j.com/detail/Be_shibuya/';
const restaurantBooking='https://booking.resty.jp/webrsv/search/s014205602/28188?isfixshop=true';
const restaurantCourses='https://tabelog.com/tokyo/A1303/A130301/13249575/party/';

function addSkylinerBackup(day,legs){
 const variant=day.variants[0];
 const leg=legs.find(l=>l.fare?.displayBlank&&l.summary.includes('스카이라이너'));
 const station=variant.stops.find(s=>s.uid===leg.fromUid);
 const backup={
  text:'14:42 스카이라이너 38호를 놓치면 40호 (나리타 T2 15:02 → 게이세이우에노 15:43). 공개 시간표 기준이며 이용일 운행과 지정석을 확인하세요.',
  source:skylinerTimetable
 };
 station.description=station.description.replace('수속이 늦으면 다음 편 확인.',backup.text);
 station.details.feature=station.description;
 station.details.thingsToDo[2]='스카이라이너 지정석권도 확인한다. '+backup.text;
 station.details.sourceCheckedAt=checkedAt;
 station.connectionBackup=leg.connectionBackup=backup;
}

function addAirportBusBackups(day,legs){
 const bus=legs.find(l=>l.travel?.depart==='1/20 06:50');
 const terminal=day.variants[0].stops.find(s=>s.uid===bus.fromUid);
 const booking=day.travelBookings.find(b=>b.key==='airport-bus-back-0650');
 const backup='06:50편을 놓치면 같은 10B-3 승차장의 동대구 직통 07:20편 또는 08:00편을 확인하세요. 공개 시간표 기준이며 이용일 운행과 좌석은 예매 화면에서 확인하세요.';
 terminal.description+=' '+backup;
 terminal.details.feature=terminal.description;
 terminal.details.sourceCheckedAt=checkedAt;
 bus.travel.notice+=' '+backup;
 booking.details.push(backup);
 booking.source=airportBusTimetable;
}

function addDinner(data,day,legs){
 const variant=day.variants[0];
 const [centerGai,hotel]=variant.stops.slice(-2);
 const uid='t27-12-d4-bebuya';
 const description='센터가이에서 걸어가 BEBU-YA 시부야점에서 야키니쿠 저녁. 18:40 입장 목표 · 무한리필 90분.';
 const dinner={
  id:uid,uid,planKey:'bebuya',name:'BEBU-YA 시부야점',jp:'和牛焼肉食べ放題 BeBu-Ya 渋谷店',
  kind:'food',area:'도쿄',time:'18:40~20:10',lat:35.66156369,lng:139.6976769,
  address:'東京都渋谷区宇田川町31-1 HULIC & New SHIBUYA 5F',
  source:restaurant,coordinateAccuracy:'map-reference',timeConfidence:'planned',description,
  selectionId:Math.max(...variant.stops.map(s=>s.selectionId))+1,
  details:{
   feature:description,
   thingsToDo:['HULIC & New SHIBUYA 5층. 무한리필 90분, 주문 마감은 시작 70분 후.'],
   typicalStayMin:90,stayLabel:'90분',hours:'저녁 16:00~23:00 · 이용일 확인',
   costCurrency:'JPY',costKind:'food',costMin:4000,costMax:null,costLabel:'4,000엔부터',
   costConfidence:'official-current',costNote:'세금 포함 · 코스별 요금과 음료 요금 확인',
   reservationNote:'1명 사전 예약 권장 · 예약 가능 여부는 공식 예약 화면에서 확인',
   sources:[restaurant,restaurantBooking,restaurantCourses],sourceCheckedAt:checkedAt
  }
 };
 const streetMap=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'assets/offline-streets/tokyo-12/day-4.json.gz'))));
 const toDinner=walk(centerGai,dinner,streetMap);
 const toHotel=legs.at(-1);
 const [oldAccess]=toHotel.parts;
 const [lat,lng]=oldAccess.coords.at(-1);
 const [access]=walk(dinner,{name:oldAccess.to,lat,lng},streetMap).parts;
 toHotel.parts[0]=access;
 toHotel.from=dinner.name;
 toHotel.fromUid=dinner.uid;
 toHotel.distanceM+=access.distanceM-oldAccess.distanceM;
 toHotel.walkDistanceM+=access.distanceM-oldAccess.distanceM;
 toHotel.durationMinutes+=access.durationMinutes-oldAccess.durationMinutes;
 toHotel.minutes=toHotel.durationMinutes;
 toHotel.durationLabel='계획 약 '+toHotel.durationMinutes+'분';
 hotel.transportFromPrevious=toHotel.summary+' · '+toHotel.durationLabel;
 hotel.time='21:10~21:35';
 variant.stops.splice(-1,0,dinner);
 legs.splice(-1,0,toDinner);
 day.meals.push(dinner.name);
 const night=data.nightRows.find(row=>row[0]===day.date);
 night[2]=hotel.time;
 data.metadata.mealBudget='일반 식사 최대 2,000 JP¥ 목표 · 이부키·BEBU-YA 별도';
}

function apply(bundle){
 if(bundle.revision===revision)return bundle;
 const {data,routes}=bundle;
 const [outbound,dinner,returnDay]=[1,4,12].map(n=>data.days.find(d=>d.n===n));
 if(data.metadata.id!=='tokyo-20270108-19'||outbound?.date!=='01/08'||dinner?.date!=='01/11'||returnDay?.date!=='01/19'){
  throw Error('Expected the active 12-day Tokyo itinerary');
 }
 addSkylinerBackup(outbound,routes.days['1-main']);
 addDinner(data,dinner,routes.days['4-main']);
 addAirportBusBackups(returnDay,routes.days['12-main']);
 Trip.prepare({...data,days:[outbound,dinner,returnDay]},routes);
 for(const day of [outbound,dinner,returnDay])day.schedule=day.rows=day.variants[0].schedule;
 bundle.revision=data.version=data.metadata.revision=routes.version=revision;
 bundle.updatedAt=new Date().toISOString();
 return bundle;
}

if(require.main===module){
 const file=path.join(root,'trip-update.json');
 const bundle=apply(JSON.parse(fs.readFileSync(file,'utf8')));
 fs.writeFileSync(file,JSON.stringify(bundle)+'\n');
}
module.exports={apply,revision};
