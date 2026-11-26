'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {gunzipSync}=require('node:zlib');
const Trip=require('../japan-2027/data-model');
const Roads=require('../japan-2027/offline-roads');

const root=path.join(__dirname,'../japan-2027');
const revision='20261126-tokyo-asakusa-1';
const checkedAt='2026-11-26';
const streets='https://www.openstreetmap.org/copyright';
const kappabashi='https://www.gotokyo.org/en/spot/59/index.html';
const mugitoro='https://www.mugitoro.co.jp/en/reservation/';
const river='https://www.gotokyo.org/en/spot/1795/index.html';
const skytree='https://www.tokyo-skytree.jp/ticket/';
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
 finish.time='19:20~20:10';
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
   {thingsToDo:['강변에서 스카이트리 사진을 찍고, 철교 옆 보행교를 건너 기타줏켄강 옆 미즈마치로 이어 걷는다.'],hours:'리버워크 07:00~22:00',reservationNote:'보행교는 예약 없이 이용'}),
  stop('solamachi','도쿄 소라마치','東京ソラマチ','shopping','14:40~15:45',[35.71022,139.80893],'https://en.www.tokyo-solamachi.jp/information/',
   '실내에서 카페에 들르거나 과자·기념품을 둘러본다.',
   {thingsToDo:['간식이나 작은 선물을 보고, 15:45쯤 스카이트리 4층 입구로 이동한다.'],costMin:null,costMax:null,costConfidence:'reference',costNote:'실제 구매비만 기록'}),
  stop('skytree','도쿄 스카이트리 전망대','東京スカイツリー','sight','16:00~17:15',[35.71006,139.81083],skytree,
   '16:00 입장 목표. 덴보데크 350m에서 해 질 무렵과 도쿄 야경을 본다.',
   {thingsToDo:['일몰 무렵 방문하려면 덴보데크 시간 지정권을 예매한다. 구름이 짙거나 표를 구하기 어렵다면 소라마치에서 쉬고 강변 야경을 본다.'],costMin:null,costMax:null,costConfidence:'variable',costNote:'날짜별 공식 입장권 가격 확인',reservationNote:'16:00 목표 · 사전 예매 권장, 현장권은 잔여분에 한함'}),
  stop('yoroiya','아사쿠사 요로이야','浅草名代らーめん 与ろゐ屋','food','17:50~18:45',[35.7127433,139.7967423],yoroiya,
   '아즈마바시로 강을 건너 아사쿠사에서 간장 라멘으로 저녁.',
   {thingsToDo:['기본 간장 라멘이나 유자 향이 나는 메뉴를 고른다.'],costMin:1000,costMax:1800,costConfidence:'estimate',hours:'평일 11:00~21:00 · 주문 마감 20:30',reservationNote:'일반 식사 · 현장 대기'}),
  finish
 ];
 const streetMap=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'assets/offline-streets/day-2.json.gz'))));
 const crossings={
  solamachi:[[35.7125951,139.8003128],[35.7116979,139.8021871],[35.71149,139.8032]],
  yoroiya:[[35.70992,139.79924],[35.71104,139.7978]]
 };
 const legs=stops.slice(1).map((s,i)=>walk(stops[i],s,streetMap,crossings[s.planKey]));
 let selectionId=Math.max(...variant.stops.map(s=>s.selectionId));
 for(const s of stops)if(s.selectionId==null)s.selectionId=++selectionId;
 const title='아사쿠사·스미다강·스카이트리';
 Object.assign(variant,{title,summary:title,focus:title,stops});
 Object.assign(day,{
  title,shortTitle:title,summary:title,focus:title,mapSummary:title,photoDay:2,
  mapLabel:{city:day.cityLabel,places:title},meals:['아사쿠사 무기토로','아사쿠사 요로이야'],
  note:'갓파바시 → 센소지 → 스미다강 → 스카이트리 → 아사쿠사 저녁',
  important:'전망대 16:00 입장 목표 · 무기토로 1층 평일 점심은 현장 접수 · 저녁 후 귀국 짐 정리'
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
