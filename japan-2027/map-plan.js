'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MapPlan=api;})(globalThis,function(){
 const labels={
  1:['대구·도쿄','출국 · 도쿄역'],2:['도쿄','아사쿠사 · 스카이트리'],3:['도쿄','건축박물관 · 기치조지 · 시모키타'],
  4:['가와고에','창고 거리 · 도키노카네'],5:['도쿄','쓰키지 · 하마리큐 · 사케 정보관'],6:['도쿄','신주쿠교엔 · 도청 · 시부야'],
  7:['가마쿠라','하세데라 · 대불 · 시치리가하마'],8:['가와구치코','후지산 · 오이시공원'],9:['도쿄','국립박물관 · 네즈 · 야나카'],
  10:['도쿄','정원미술관 · 롯폰기 · 도쿄타워'],11:['도쿄·이치카와','진보초 · 구라마에 · 공연'],12:['도쿄·오사카','항공 이동 · 난바 · 도톤보리'],
  13:['교토','후시미이나리 · 기요미즈데라 · 기온'],14:['야마자키·교토','증류소 · 아라시야마'],15:['고베','주조자료관 · 난킨마치 · 포트타워'],
  16:['나라','나라마치 · 야마야키'],17:['오사카','오사카성 · 주거박물관 · 하루카스'],18:['오사카·후쿠오카','항공 이동 · 하카타 구도심'],
  19:['후쿠오카','오호리공원 · 성터 · 타워'],20:['후쿠오카','백년장 · 히라마츠 · 나카강'],21:['후쿠오카·부산','뉴 카멜리아 · 부산항'],22:['부산·서대구','초량 · 브라운핸즈 · 귀가']
 };
 function label(day,variant){
  if(day.n===8&&variant.id==='brewery')return {city:'후사',places:'이시카와 주조'};
  if(day.n===11&&variant.id==='no-concert')return {city:'도쿄',places:'진보초 · 구라마에 · 국립신미술관'};
  if(day.n===14&&variant.id==='no-yamazaki')return {city:'우지·교토',places:'뵤도인 · 아라시야마'};
  const [city,places]=labels[day.n]||[day.cityLabel,day.shortTitle];return {city,places};
 }
 function variant(day,preferences){return day.variants.find(v=>v.id===preferences[day.n])||day.variants[0];}
 function inside(s,b){return s.lat>=b.south&&s.lat<=b.north&&s.lng>=b.west&&s.lng<=b.east;}
 function groups(stops){const map=new Map();stops.forEach((s,index)=>{const key=s.lat.toFixed(5)+','+s.lng.toFixed(5);if(!map.has(key))map.set(key,{stop:s,indices:[]});map.get(key).indices.push(index);});return [...map.values()];}
 function context(days,preferences,bounds,center,preferred){
  const visible=days.map(day=>({day,variant:variant(day,preferences)})).filter(x=>x.variant.stops.some(s=>inside(s,bounds)));
  const score=x=>Math.min(...x.variant.stops.filter(s=>inside(s,bounds)).map(s=>Math.hypot((s.lat-center.lat)*1.2,s.lng-center.lng)*( ['sight','cafe','food'].includes(s.kind)?1:4)));
  const focus=visible.find(x=>x.day.n===preferred)||visible.slice().sort((a,b)=>score(a)-score(b)||a.day.n-b.day.n)[0]||null;
  return {visible,focus};
 }
 return {label,variant,inside,groups,context};
});
