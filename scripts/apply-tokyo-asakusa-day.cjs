'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {gunzipSync}=require('node:zlib');
const Trip=require('../japan-2027/data-model');
const Roads=require('../japan-2027/offline-roads');

const root=path.join(__dirname,'../japan-2027');
const revision='20261126-tokyo-asakusa-2';
const checkedAt='2026-11-26';
const streets='https://www.openstreetmap.org/copyright';
const kappabashi='https://www.gotokyo.org/en/spot/59/index.html';
const mugitoro='https://www.mugitoro.co.jp/en/reservation/';
const river='https://www.gotokyo.org/en/spot/1795/index.html';
const mizumachi='https://en.www.tokyo-mizumachi.jp/';
const yoroiya='https://yoroiya.jp/';

function stop(key,name,jp,kind,time,coords,source,description,details){
 const uid='t27-12-d11-'+key;
 const [lat,lng]=coords;
 return {
  uid,id:uid,planKey:key,name,jp,kind,time,lat,lng,area:'도쿄',
  source,description,coordinateAccuracy:'map-reference',timeConfidence:'planned',
  details:{
   feature:description,stayLabel:'계획 시각 기준',costCurrency:'JPY',
   costKind:kind==='food'?'food':kind==='shopping'?'shopping':'admission',
   costMin:0,costMax:0,costConfidence:'official-current',sources:[source],sourceCheckedAt:checkedAt,
   ...details
  }
 };
}

function walk(a,b,map,waypoints=[]){
 const points=[[a.lat,a.lng],...waypoints,[b.lat,b.lng]];
 const sections=points.slice(1).map((point,i)=>{
  const result=Roads.findRoute(map,points[i],point);
  if(!result)throw Error('No mapped pedestrian route: '+a.name+' → '+b.name);
  return result;
 });
 const distanceM=Math.round(sections.reduce((total,p)=>total+p.distanceM,0));
 const durationMinutes=Math.ceil(distanceM/70);
 const coords=sections.flatMap((p,i)=>i?p.coords.slice(1):p.coords);
 const from=a.name,to=b.name;
 b.modeFromPrevious='walk';
 b.transportFromPrevious='도보 · 약 '+durationMinutes+'분';
 return {
  fromUid:a.uid,toUid:b.uid,from,to,summary:'도보',private:false,distanceM,
  walkDistanceM:distanceM,durationMinutes,durationLabel:'약 '+durationMinutes+'분',
  fare:{min:0,max:0,icYen:0,paperTicketYen:0,currency:'JPY',status:'exact',passEligible:false,breakdown:[],sources:[],basis:'도보 추가 운임 없음'},
  parts:[{mode:'walk',line:'도보',from,to,coords,distanceM,durationMinutes,geometryAccuracy:'mapped',geometrySource:'OpenStreetMap 저장 도로 · 보행 경로 탐색',source:streets}]
 };
}

function apply(bundle){
 if(bundle.revision===revision)return bundle;
 const {data,routes}=bundle;
 const day=data.days.find(d=>d.n===11&&d.date==='01/18');
 if(data.metadata.id!=='tokyo-20270108-19'||!day)throw Error('Expected the active 12-day Tokyo itinerary');
 const variant=day.variants.find(v=>v.id==='main');
 const [hotel]=variant.stops;
 const finish=variant.stops.at(-1);
 hotel.time='08:00~09:30';
 finish.time='18:00~18:50';
 const stops=[
  hotel,
  stop('kappabashi','갓파바시 도구 거리','かっぱ橋道具街','shopping','10:00~10:55',[35.71418,139.7887],kappabashi,
   '주방용품 거리에서 그릇·젓가락·음식 모형을 둘러본다.',
   {thingsToDo:['가마아사 상점에서 일본 조리도구를 구경하고, 작은 그릇이나 젓가락을 선물로 본다.'],costMin:null,costMax:null,costConfidence:'reference',costNote:'실제 구매비만 기록',sources:[kappabashi,'https://kama-asa.co.jp/en/pages/shops']}),
  stop('sensoji','센소지·나카미세','浅草寺・仲見世','sight','11:15~12:05',[35.71479,139.79666],'https://www.senso-ji.jp/english/',
   '센소지 본당과 오층탑을 본 뒤 나카미세를 따라 가미나리몬 쪽으로 내려간다.',
   {thingsToDo:['본당 앞에서 오층탑을 보고, 나카미세에서 닌교야키나 센베 가게를 둘러본다.'],reservationNote:'일반 참배·상점가 산책은 예약 없이 이용'}),
  stop('mugitoro','아사쿠사 무기토로','浅草むぎとろ','food','12:25~13:15',[35.7090647,139.7967924],mugitoro,
   '1층 평일 무기토로 뷔페에서 보리밥과 간 참마로 점심.',
   {thingsToDo:['1층 현장 접수. 휴무 공지가 있거나 대기가 길면 가미나리몬 주변 소바·정식으로 바꾼다.'],costMin:1650,costMax:1650,hours:'평일 11:00~14:30 · 최종 입장 14:00',reservationNote:'1층 평일 뷔페는 현장 선착순 · 최신 운영일은 공식 공지 확인'}),
  stop('sumidaWalk','스미다 공원·리버워크','隅田公園・すみだリバーウォーク','sight','13:30~14:15',[35.71275,139.79973],river,
   '스미다강 서쪽 산책로에서 사진을 찍고 리버워크로 강을 건너 미즈마치로 이동.',
   {thingsToDo:['강변에서 사진을 찍고 철교 옆 보행교를 건너 기타줏켄강 옆 미즈마치로 이어 걷는다.'],hours:'리버워크 07:00~22:00',reservationNote:'보행교는 예약 없이 이용'}),
  stop('mizumachi','도쿄 미즈마치','東京ミズマチ','shopping','14:30~16:05',[35.7113014,139.8027241],mizumachi,
   '웨스트 존에서 카페에 들르고 기타줏켄강을 따라 작은 가게를 둘러본다.',
   {thingsToDo:['스미다공원 앞 LAND_A에서 커피나 간식을 먹고 강변 가게를 구경한다.'],costMin:null,costMax:null,costConfidence:'reference',costNote:'실제 구매비만 기록',sources:[mizumachi,'https://land-a.jp/access/']}),
  stop('yoroiya','아사쿠사 요로이야','浅草名代らーめん 与ろゐ屋','food','16:30~17:25',[35.7127433,139.7967423],yoroiya,
   '아즈마바시로 강을 건너 아사쿠사에서 간장 라멘으로 저녁.',
   {thingsToDo:['기본 간장 라멘이나 유자 향이 나는 메뉴를 고른다.'],costMin:1000,costMax:1800,costConfidence:'estimate',hours:'평일 11:00~21:00 · 주문 마감 20:30',reservationNote:'일반 식사 · 현장 대기'}),
  finish
 ];
 const streetMap=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'assets/offline-streets/day-2.json.gz'))));
 const crossings={
  mizumachi:[[35.7125951,139.8003128],[35.7116979,139.8021871]],
  yoroiya:[[35.70992,139.79924],[35.71104,139.7978]]
 };
 const legs=stops.slice(1).map((s,i)=>walk(stops[i],s,streetMap,crossings[s.planKey]));
 const selectionByUid=new Map(variant.stops.map(s=>[s.uid,s.selectionId]));
 let selectionId=Math.max(...selectionByUid.values());
 for(const s of stops)s.selectionId=selectionByUid.get(s.uid)??++selectionId;
 const title='아사쿠사·스미다강';
 Object.assign(variant,{title,summary:title,focus:title,stops});
 Object.assign(day,{
  title,shortTitle:title,summary:title,focus:title,mapSummary:title,photoDay:2,
  mapLabel:{city:day.cityLabel,places:title},meals:['아사쿠사 무기토로','아사쿠사 요로이야'],
  note:'갓파바시 → 센소지 → 스미다강 → 미즈마치 → 아사쿠사 저녁',
  important:'무기토로 1층 평일 점심은 현장 접수 · 미즈마치 산책 뒤 16:30 저녁 · 숙소에서 귀국 짐 정리'
 });
 routes.days['11-main']=legs;
 Trip.prepare({...data,days:[day]},routes);
 day.schedule=day.rows=variant.schedule;
 const nightIndex=data.nightRows.findIndex(row=>row[0]===day.date);
 if(nightIndex>=0)data.nightRows[nightIndex]=[day.date,title,finish.time];
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
