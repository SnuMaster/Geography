'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const specs=[{"key":"fujiDinner","n":5,"name":"마쓰야 이리야점","jp":"松屋 入谷店","address":"東京都台東区北上野2-31-6","lat":35.719444,"lng":139.784729,"time":"19:30-20:10","hotelTime":"20:25-20:55","min":480,"max":1200,"official":"https://pkg.navitime.co.jp/matsuyafoods2/spot/detail?code=0000000394","menu":"https://www.matsuyafoods-holdings.co.jp/2026/10/09/14408/","note":"가와구치코 귀환 후 저녁. 규메시 보통 480 JP¥ 공표가 기준, 정식·추가 메뉴 포함 1,200 JP¥ 이내 목표. 발권기 주문·1인 식사. 붐비면 포장 또는 가까운 정식집으로 전환.","hours":"현재 공식 24시간 · 임시 휴무·여행일 메뉴 재확인 · 22시 이후 심야 할증 안내"},{"key":"nikkoDinner","n":8,"name":"요시노야 이리야점","jp":"吉野家 入谷店","address":"東京都台東区入谷1-6-6","lat":35.720219,"lng":139.784393,"time":"18:30-19:10","hotelTime":"19:25-19:55","min":498,"max":1200,"official":"https://stores.yoshinoya.com/yoshinoya/spot/detail?code=ysn_061438","menu":"https://www.yoshinoya.com/menu/gyudon/gyu-don/","note":"닛코 귀환 후 저녁. 규동 보통 매장 식사 498 JP¥ 공표가 기준, 사이드 포함 1,200 JP¥ 이내 목표. 1인 식사·예약 없이 방문. 붐비면 포장 또는 인근 식당으로 전환.","hours":"현재 공식 매일 05:00~다음 날 02:00 · 임시 휴무·여행일 메뉴 재확인"}];
async function get(url){const r=await fetch(url,{headers:{'User-Agent':'KISEKI-Public-Itinerary/1.0 (github.com/SnuMaster/Geography)'},signal:AbortSignal.timeout(55000)});if(!r.ok)throw Error(url+' HTTP '+r.status);return r;}
(async()=>{
 const out={checkedAt:'2026-11-18',meals:[]},hotel={lat:35.722305,lng:139.785553},exit={lat:35.72058,lng:139.784528};
 for(const s of specs){
  const row={...s,paths:{}};
  for(const [label,a,b]of [['stationToMeal',exit,s],['mealToHotel',s,hotel]]){
   const url='https://routing.openstreetmap.de/routed-foot/route/v1/driving/'+a.lng+','+a.lat+';'+b.lng+','+b.lat+'?overview=full&geometries=geojson&steps=false';
   const j=await(await get(url)).json(),r=j.routes?.[0];if(j.code!=='Ok'||!r?.geometry?.coordinates?.length)throw Error('Missing footpath '+s.key);
   row.paths[label]={coords:r.geometry.coordinates.map(([lng,lat])=>[lat,lng]),distanceM:Math.round(r.distance),durationMinutes:Math.max(1,Math.ceil(r.duration/60)),source:url};
  }out.meals.push(row);
 }
 fs.writeFileSync('scripts/tokyo-review-meals.json',JSON.stringify(out,null,2)+'\n');console.log('MEAL_PATHS',JSON.stringify(out.meals.map(s=>({key:s.key,paths:Object.fromEntries(Object.entries(s.paths).map(([k,p])=>[k,{distanceM:p.distanceM,durationMinutes:p.durationMinutes}]))}))));
 const url='https://www.tobu.co.jp/spaciax/assets/img/index/_svg/logo_02.svg',svg=await(await get(url)).text();if(!svg.includes('<svg')||/<script|<foreignObject|onload=|javascript:/i.test(svg))throw Error('Unsafe logo');
 fs.writeFileSync('japan-2027/assets/operators/spacia-x.svg',svg);console.log('SPACIA_LOGO',svg.length,crypto.createHash('sha256').update(svg).digest('hex'));
 for(const [label,q]of [['NIKKO','[out:json][timeout:30];relation["route"="bus"](36.65,139.35,36.85,139.75);out tags;'],['FUJI','[out:json][timeout:30];relation["route"="bus"](35.49,138.72,35.54,138.79);out tags;']]){
  for(const server of ['https://overpass.kumi.systems/api/interpreter','https://overpass-api.de/api/interpreter']){
   try{const r=await fetch(server,{method:'POST',headers:{'User-Agent':'KISEKI-Public-Itinerary/1.0 (github.com/SnuMaster/Geography)','Content-Type':'application/x-www-form-urlencoded'},body:'data='+encodeURIComponent(q),signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error('HTTP '+r.status);console.log(label+'_RELATIONS',await r.text());break;}catch(e){console.log('OVERPASS_ERROR',server,label,e.message);}
  }
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
