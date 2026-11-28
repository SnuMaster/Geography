'use strict';

const red='https://bus.fujikyu.co.jp/fujitour/kawaguchiko/';
const winter='https://www.tobu-bus.com/pc/area/pdf/nikko_timetable_winter.pdf?20261118=';
const schedule=[
 {day:5,index:2,source:red,trips:[['11:45','12:12'],['12:00','12:27']]},
 {day:5,index:3,source:red,trips:[['13:27','13:35'],['13:42','13:50']]},
 {day:5,index:5,source:red,trips:[['15:20','15:26'],['15:35','15:41']],skip:{
  label:'로프웨이 생략 · 가와구치코 미술관 정류장 → 가와구치코역',
  trips:[['15:35','15:54'],['15:50','16:09']]
 }},
 {day:8,index:1,source:winter,period:'2026-12-01~2027-03-31',trips:[['11:10','11:55'],['11:35','12:20']]},
 {day:8,index:4,source:winter,period:'2026-12-01~2027-03-31',trips:[['15:30','16:06'],['15:50','16:26']]}
];

const itineraryNotes=[
 [5,2,'11:45 레드라인 목표 → 오이시공원 12:12 도착. 놓치면 12:00 → 12:27.'],
 [5,3,'13:27 가와구치코역 방면 버스 → 가와구치코 미술관 13:35. 놓치면 13:42 → 13:50.'],
 [5,5,'로프웨이는 미술관 정류장 15:20 출발편에 탈 수 있고 대기 줄이 짧을 때만. 건너뛰면 같은 정류장에서 15:35 → 15:54 또는 15:50 → 16:09 가와구치코역 직행.'],
 [5,6,'대기가 길면 로프웨이를 생략하고 가와구치코역으로 이동합니다. 후지회유 16:48 출발 우선.'],
 [8,1,'도부닛코역 11:10 → 주젠지온센 11:55 목표. 놓치면 11:35 → 12:20에 타고 게곤폭포 방문을 늦춥니다.'],
 [8,4,'주젠지온센 15:30 → 도부닛코역 16:06 목표. 다음 후보 15:50 → 16:26. 스페이시아 X 17:44 출발. 눈길과 교통 지연을 고려해 일찍 정류장으로 이동하세요.']
];

function apply(bundle){
 for(const {day,index,...times} of schedule){
  const leg=bundle.routes.days[day+'-main'][index];
  if(!leg?.busRoute)throw new Error('Missing scheduled bus for '+day+':'+index);
  leg.busTimetable=times;
 }
 for(const [day,index,note] of itineraryNotes){
  const details=bundle.data.days.find(d=>d.n===day).variants.find(v=>v.id==='main').stops[index].details;
  if(!details.thingsToDo.includes(note))details.thingsToDo.push(note);
 }
}

module.exports={apply};
