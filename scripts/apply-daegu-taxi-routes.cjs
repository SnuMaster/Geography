'use strict';
const fs=require('node:fs');
const path=require('node:path');
const Trip=require('../japan-2027/data-model');
const {distance}=require('../japan-2027/location-core');
const routesByDirection=require('./daegu-taxi-geometry.json');

const revision='20261126-tokyo-daegu-taxi-1';
const airportAccess='https://www.airport.co.kr/daegu/cms/frCon/index.do?CONTENTS_NO=4&MENU_ID=160';
const stationStand='https://www.openstreetmap.org/node/8221905787';
const point=s=>[s.lat,s.lng];
const length=coords=>Math.round(coords.slice(1).reduce((total,p,i)=>total+distance(coords[i],p),0));

function setPoint(stop,[lat,lng],note){
 Object.assign(stop,{lat,lng,coordinateAccuracy:'map-reference',coordinateNote:note});
}

function applyDrive(leg,{coords,distanceM,durationSeconds}){
 const durationMinutes=Math.round(durationSeconds/60);
 Object.assign(leg.parts[0],{
  coords,distanceM,durationMinutes,geometryAccuracy:'mapped',
  geometrySource:'OpenStreetMap · BRouter 자동차 경로',
  source:'https://www.openstreetmap.org/copyright'
 });
 Object.assign(leg,{
  distanceM,durationMinutes,durationLabel:'도로 기준 약 '+durationMinutes+'분',
  note:'자동차 도로 기준 · 실제 택시 경로·소요시간은 당일 교통과 기사 안내에 따라 달라질 수 있어요.'
 });
 delete leg.distanceLabel;
}

function apply(bundle){
 if(bundle.revision===revision)return bundle;
 const {data,routes}=bundle;
 const [departure]=data.days;
 const arrival=data.days.at(-1);
 if(data.metadata.id!=='tokyo-20270108-19'||arrival.n!==12)throw Error('Expected current Tokyo itinerary');
 const [outbound,flight]=routes.days['1-main'];
 const [,walk,returnTaxi]=routes.days['12-main'].slice(-3);
 const [pickup,airport]=departure.variants[0].stops;
 const [stand,home]=arrival.variants[0].stops.slice(-2);
 const {outbound:out,returnTaxi:back}=routesByDirection;
 if(![outbound,returnTaxi].every(l=>l.parts[0]?.mode==='taxi')||flight.parts[0]?.mode!=='flight'||walk.toUid!==stand.uid)throw Error('Unexpected taxi connections');

 const pickupNote='단지 앞 차량 통행로 기준. 실제 승하차 위치는 기사에게 확인.';
 setPoint(pickup,out.coords[0],pickupNote);
 setPoint(home,back.coords.at(-1),pickupNote);
 setPoint(airport,out.coords.at(-1),'여객터미널 1층 앞 차량 진입도로 기준.');
 airport.description='08:20 여객터미널 1층 앞 하차 목표. 국제선 체크인·수하물 위탁·출국 수속 후 11:10 TW251 탑승.';
 airport.details.feature=airport.description;
 airport.details.sources=[...new Set([airportAccess,...(airport.details.sources||[])])];
 setPoint(stand,back.coords[0],'동대구역 동쪽 고가 진입로의 택시 승강장 기준.');
 stand.description='버스 하차 후 현장 표지를 따라 동대구역 동쪽 택시 승강장으로 이동해 11:10 전후 탑승.';
 stand.details.feature=stand.description;
 stand.details.sources=[...new Set([stationStand,...(stand.details.sources||[])])];

 applyDrive(outbound,out);
 applyDrive(returnTaxi,back);
 airport.transportFromPrevious='택시 · '+outbound.durationLabel;
 home.transportFromPrevious='택시 · '+returnTaxi.durationLabel;
 const flightPart=flight.parts[0];
 flightPart.coords[0]=point(airport);
 flight.distanceM=flightPart.distanceM=length(flightPart.coords);
 const walkPart=walk.parts[0];
 walkPart.coords[walkPart.coords.length-1]=point(stand);
 walk.distanceM=walk.walkDistanceM=walkPart.distanceM=length(walkPart.coords);

 for(const day of [departure,arrival]){
  Trip.prepare({...data,days:[day]},routes);
  day.schedule=day.rows=day.variants[0].schedule;
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
