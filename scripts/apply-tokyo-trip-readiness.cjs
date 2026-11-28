'use strict';
const fs=require('node:fs');
const path=require('node:path');
const Trip=require('../japan-2027/data-model');

const revision='20261127-tokyo-trip-readiness-1';
const holidaySource='https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html';
const gardenSource='https://policies.env.go.jp/national-garden/shinjukugyoen/english/guide/information/';

function apply(bundle){
 if(bundle.revision===revision)return bundle;
 const {data,routes}=bundle;
 Trip.publicAirportTransfers(data,routes);
 const [out,holiday,back]=[1,4,12].map(n=>data.days.find(day=>day.n===n));
 if(data.metadata.id!=='tokyo-20270108-19'||holiday?.date!=='01/11')throw Error('Expected the active Tokyo itinerary');
 const garden=holiday.variants[0].stops.find(stop=>stop.name==='신주쿠교엔');
 holiday.publicHoliday={name:'성년의 날',source:holidaySource,timetable:'토요일·공휴일 열차 시간표'};
 holiday.important='성년의 날 공휴일 · 신주쿠교엔 10:00 방문 · 열차는 토요일·공휴일 시간표를 확인하세요.';
 garden.details.hours='1/11 월요일 공휴일 개원 · 09:00~16:30 (입장 16:00까지) · 1/12 휴원 (공식 정기 규칙 기준)';
 garden.details.sources=[...new Set([gardenSource,...garden.details.sources])];
 garden.details.sourceCheckedAt='2026-11-27';

 const sky=routes.days['1-main'].find(leg=>leg.connectionBackup);
 const outStops=out.variants[0].stops;
 const first=outStops.findIndex(stop=>stop.uid===sky.toUid)+1;
 Object.assign(sky.connectionBackup,{
  options:[{depart:'15:02',label:'15:02 스카이라이너 40호',arrive:'15:43'}],
  checkpoints:outStops.slice(first,first+3).map(stop=>stop.uid)
 });
 const bus=routes.days['12-main'].find(leg=>leg.travel?.depart==='1/20 06:50');
 const backStops=back.variants[0].stops;
 const terminal=backStops.find(stop=>stop.uid===bus.fromUid);
 bus.connectionBackup={
  text:terminal.description.slice(terminal.description.indexOf('06:50편을 놓치면')),
  source:bus.travel.source,
  options:['07:20','08:00'].map(depart=>({depart,label:depart+' 동대구 직통'})),
  checkpoints:backStops.slice(-2).map(stop=>stop.uid)
 };
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
