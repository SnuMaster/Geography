'use strict';
const fs=require('node:fs'),path=require('node:path'),T=require('../japan-2027/data-model'),G=require('../japan-2027/location-core');
const clone=x=>JSON.parse(JSON.stringify(x)),point=s=>[s.lat,s.lng];
function connector(a,b){return {mode:'transfer',line:'출입구·주소 대표점 연결',from:a.name||'',to:b.name||'',coords:[point(a),point(b)],distanceM:Math.round(G.distance(point(a),point(b))),durationMinutes:0,geometryAccuracy:'schematic',geometrySource:'주소 대표점과 보행 경로 연결 · 실제 출입구 현장 확인',source:'https://maps.gsi.go.jp/'};}
function foot(a,b,r){
 const p={mode:'walk',line:'도보',from:a.name,to:b.name,coords:clone(r.coords),distanceM:r.distanceM,durationMinutes:r.durationMinutes,geometryAccuracy:'mapped',geometrySource:'OpenStreetMap / FOSSGIS 보행 경로 · 실제 출입구·통제 확인',source:r.source},parts=[],first={lat:p.coords[0][0],lng:p.coords[0][1]},last={lat:p.coords.at(-1)[0],lng:p.coords.at(-1)[1]};
 if(G.distance(point(a),point(first))>2)parts.push(connector(a,first));parts.push(p);if(G.distance(point(last),point(b))>2)parts.push(connector(last,b));return parts;
}
function recalc(l){l.distanceM=l.parts.reduce((n,p)=>n+(p.distanceM||0),0);l.walkDistanceM=l.parts.filter(p=>['walk','transfer'].includes(p.mode)).reduce((n,p)=>n+(p.distanceM||0),0);return l;}
function apply(bundle,evidence){
 const added=[];
 for(const m of evidence.meals){
  const d=bundle.data.days.find(d=>d.n===m.n),v=d.variants.find(v=>v.id==='main');if(v.stops.some(s=>s.planKey===m.key))continue;
  const hotel=v.stops.at(-1),legs=bundle.routes.days[d.n+'-'+v.id],last=legs.at(-1),before=last.durationMinutes;
  if(hotel.kind!=='hotel')throw Error('Unexpected final hotel');
  const source='https://msearch.gsi.go.jp/address-search/AddressSearch?q='+encodeURIComponent(m.address);
  const meal={lat:m.lat,lng:m.lng,address:m.address,name:m.name,jp:m.jp,kind:'food',area:'이리야',time:m.time,planKey:m.key,foodKey:m.key,uid:'t27-p1118-d'+m.n+'-main-'+m.key,id:'t27-p1118-d'+m.n+'-main-'+m.key,source,coordinateAccuracy:'address-reference',coordinateNote:'국토지리원 공개 주소 대표점 · 실제 매장 출입구 현장 확인',verifiedAt:evidence.checkedAt,description:m.note,timeConfidence:'planned',modeFromPrevious:'metro',transportFromPrevious:last.summary,details:{feature:m.note,thingsToDo:['규동·정식 중 예산 안에서 선택','긴 대기는 생략하고 포장·인근 식당으로 전환'],stayLabel:'40분',costMin:m.min,costMax:m.max,costCurrency:'JPY',costKind:'food',costConfidence:'estimate',costNote:'대표 메뉴 현재 공표 가격 포함 · 실제 주문·2027 가격 별도',hours:m.hours,soloNote:'1인 식사 · 사전 예약 없이 방문',reservationNote:'긴 현장 대기는 계획하지 않습니다.',sources:[m.official,m.menu,source],sourceCheckedAt:evidence.checkedAt}};
  const at=last.parts.findLastIndex(p=>['rail','metro'].includes(p.mode));if(at<0)throw Error('Missing return rail');
  const railEnd=last.parts[at].coords.at(-1),railStation={lat:railEnd[0],lng:railEnd[1],name:last.parts[at].to},tail=foot(railStation,meal,m.paths.stationToMeal),oldTail=last.parts.slice(at+1);
  last.parts=[...last.parts.slice(0,at+1),...tail];last.to=meal.name;last.toUid=meal.uid;
  const delta=tail.reduce((n,p)=>n+p.durationMinutes,0)-oldTail.reduce((n,p)=>n+(p.durationMinutes||0),0);last.durationMinutes=Math.max(1,before+delta);last.durationLabel='계획 약 '+last.durationMinutes+'분';recalc(last);
  if(last.timeComparison){last.timeComparison.totalMinutes=last.durationMinutes;last.timeComparison.walkingMinutes=Math.max(0,last.timeComparison.walkingMinutes+delta);}
  last.note+=' 이리야 하차 후 저녁 식당까지 도보. 철도 운임·열차 구간 유지.';
  v.stops.splice(v.stops.length-1,0,meal);hotel.time=m.hotelTime;hotel.modeFromPrevious='walk';hotel.transportFromPrevious='저녁 식사 후 숙소까지 도보';
  const parts=foot(meal,hotel,m.paths.mealToHotel),free={min:0,max:0,icYen:0,paperTicketYen:0,currency:'JPY',status:'free',label:'무료',basis:'도보 · 추가 운임 없음',sources:[],breakdown:[]};
  legs.push(recalc({fromUid:meal.uid,toUid:hotel.uid,from:meal.name,to:hotel.name,parts,fare:free,private:false,durationMinutes:parts.reduce((n,p)=>n+p.durationMinutes,0),durationLabel:'도보 약 '+parts.reduce((n,p)=>n+p.durationMinutes,0)+'분',summary:'도보',note:'저녁 식당 → 숙소 · 보행 참고 경로'}));
  bundle.data.food[m.key]={name:m.name,jp:m.jp,area:m.address,order:'규동·정식 중 선택',budget:m.min+'–'+m.max+' JP¥',hours:m.hours,note:m.note,url:m.official};added.push(m.key);
 }
 T.prepare(bundle.data,bundle.routes);for(const d of bundle.data.days){const v=d.variants[0];d.schedule=v.schedule;d.rows=v.schedule;}
 bundle.data.nightRows=bundle.data.days.map(d=>[d.date,d.title,d.variants[0].stops.at(-1)?.time||'']);bundle.data.metadata.reviewRevision='20261118-review-fixes-4';
 return {added};
}
module.exports={apply,foot,connector};
if(require.main===module){const f=path.join(__dirname,'../japan-2027/trip-update.json'),b=JSON.parse(fs.readFileSync(f));console.log(JSON.stringify(apply(b,require('./tokyo-review-meals.json'))));fs.writeFileSync(f,JSON.stringify(b)+'\n');}
