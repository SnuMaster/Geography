'use strict';
// Day 1 prototype. Google Maps URLs open Google's current results; no arrival
// predictions are copied, cached, or presented as received by Routebook.
const DayOneDepartures=(()=>{
 const profiles={
  '우에노|이리야':{
   from:'우에노',fromJa:'上野',fromCode:'H18',to:'이리야',toJa:'入谷',toCode:'H19',
   direction:'기타센주 방면',directionJa:'北千住方面',numbering:'H18',directionId:'0',station:'ueno'
  },
  '이리야|우에노':{
   from:'이리야',fromJa:'入谷',fromCode:'H19',to:'우에노',toJa:'上野',toCode:'H18',
   direction:'나카메구로 방면',directionJa:'中目黒方面',numbering:'H19',directionId:'1',station:'iriya'
  }
 };
 function match(part){return part?.lineId==='TokyoMetro.Hibiya'?profiles[`${part.from}|${part.to}`]||null:null;}
 function supported(day,leg,part){return day===1&&(part?!!match(part):leg.parts.some(p=>!!match(p)));}
 function links(p){
  // Use the station name and ward, rather than a similarly named business POI.
  // These are planned stations; the link never transmits the user's GPS fix.
  const directions=new URL('https://www.google.com/maps/dir/');
  directions.search=new URLSearchParams({api:'1',origin:`${p.fromJa}駅 東京都台東区`,destination:`${p.toJa}駅 東京都台東区`,travelmode:'transit',hl:'ko'}).toString();
  const station=new URL(`https://www.tokyometro.jp/station/${p.station}/index.html`);
  const timetable=new URL('https://transfer.tokyometro.jp/website/timetable');
  timetable.search=new URLSearchParams({numbering:p.numbering,direction:p.directionId,lang:'ko'}).toString();
  return {directions:directions.href,station:station.href,timetable:timetable.href};
 }
 function html(day,leg,part){
  if(!supported(day,leg,part))return '';
  const picked=part?[part]:leg.parts.filter(p=>match(p));
  return picked.map(q=>{
   const p=match(q),u=links(p);
   return `<section class="station-departures" aria-label="${esc(p.from)} 출발역 열차 정보">
    <div class="departure-heading"><span>출발역 열차 정보</span><small>Google 지도에서 열림 ↗</small></div>
    <div class="departure-stations"><span class="departure-station-code">${p.fromCode}</span><strong>${esc(p.from)}<small>${esc(p.fromJa)}</small></strong><span class="departure-arrow">→</span><strong>${esc(p.to)}<small>${esc(p.toJa)} · ${p.toCode}</small></strong></div>
    <div class="departure-direction">히비야선 · <b>${esc(p.direction)}</b><span>${esc(p.directionJa)}</span></div>
    <a class="departure-google" href="${esc(u.directions)}" target="_blank" rel="noopener noreferrer">다음 열차·도착 시각 확인 ${icon('arrowUpRight')}</a>
    <div class="departure-secondary"><a href="${esc(u.station)}" target="_blank" rel="noopener noreferrer">공식 출발역 안내 ↗</a><a href="${esc(u.timetable)}" target="_blank" rel="noopener noreferrer">공식 시간표 ↗</a></div>
    <p class="departure-notice">시각은 Google 지도에서 확인해요. 이 화면에는 실시간 도착 정보가 수신되지 않아요. 여행일 검색은 Google 지도에서 2027.1.8로 바꿔 주세요.</p>
   </section>`;
  }).join('');
 }
 return {supported,html};
})();
