'use strict';
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./data-model'):root.TripData);if(typeof module==='object'&&module.exports)module.exports=api;else root.ReservationCore=api;})(globalThis,function(T){
 const plans=new WeakMap(),declined=new Set(['낙선','예약 불가']);
 function parseTime(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return null;
  const [date,time]=value.split('T'),epoch=Date.parse(value+':00+09:00');
  if(!Number.isFinite(epoch)||new Date(epoch+9*3600000).toISOString().slice(0,16)!==value||T.minutes(time)===null)return null;
  return {date,time,minute:T.minutes(time)};
 }
 function restore(data){
  for(const d of data.days)for(const v of d.variants){delete v.reservationWarnings;for(const s of v.stops){const plan=plans.get(s);if(plan)Object.assign(s,plan);delete s.reservationTiming;}}
 }
 function travelMinutes(leg){
  if(!leg)return null;
  const known=Number.isFinite(leg.durationMinutes)?leg.durationMinutes:null;
  const parts=leg.parts||[],sum=parts.every(p=>Number.isFinite(p.durationMinutes))?parts.reduce((n,p)=>n+p.durationMinutes,0):null;
  return known===null?sum:sum===null?known:Math.max(known,sum);
 }
 function apply(data,routes,records={}){
  restore(data);
  for(const d of data.days)for(const v of d.variants){
   v.reservationWarnings=[];const legs=routes.days[`${d.n}-${v.id}`]||[];
   for(const [i,s]of v.stops.entries()){
    if(!s.reservationKey)continue;
    if(!plans.has(s))plans.set(s,{time:s.time,start:s.start,end:s.end,timeConfidence:s.timeConfidence});
    const plan=plans.get(s),record=records?.[s.reservationKey]||{},value=record.time,parsed=parseTime(value),messages=[];
    const timing=s.reservationTiming={applied:false,messages,baseTime:plan.time,status:record.status||'미신청'};
    if(!value){if(['예약완료','티켓 확보'].includes(record.status))messages.push('확정 시각 미입력 · 기존 계획 시각을 표시합니다.');continue;}
    if(declined.has(record.status)){messages.push(`${record.status} 상태라 입력 시각을 일정에 반영하지 않습니다. 예약 상태를 확인하거나 대체안을 선택하세요.`);continue;}
    if(!parsed){timing.error=true;messages.push('예약 시각 형식을 확인하세요. 일본 현지 날짜와 시각을 입력해 주세요.');continue;}
    if(parsed.date!==T.date(d.n)){timing.error=true;messages.push(`예약 날짜 ${parsed.date}가 일정 날짜 ${T.date(d.n)}와 다릅니다. 시각을 반영하지 않았습니다.`);continue;}
    const original=T.interval(plan),duration=original.start&&original.end?T.minutes(original.end)-T.minutes(original.start):null;
    const end=duration!==null&&duration>=0?T.formatTime(parsed.minute+duration):null;
    if(duration!==null&&duration>=0&&!end){timing.error=true;messages.push('계획 체류시간을 더하면 다음 날짜가 됩니다. 예약 시각과 이후 일정을 확인하세요.');continue;}
    T.setTime(s,parsed.time,end);s.timeConfidence='user-confirmed-start';timing.applied=true;timing.durationMinutes=duration;
    if(end===null)messages.push('종료 시각 미확정 · 이후 이동·숙소 복귀 열차는 확정 시각으로 계산하지 않습니다.');
    const previous=v.stops[i-1],next=v.stops[i+1],before=previous&&T.interval(previous),after=next&&T.interval(next);
    const check=(fromTime,toTime,leg,name)=>{
     if(!fromTime||!toTime)return;
     const travel=travelMinutes(leg),gap=T.minutes(toTime)-T.minutes(fromTime);
     if(travel===null){messages.push(`${name} 이동시간 미확인 · 예약 시각과 연결 가능한지 확인하세요.`);return;}
     if(gap<travel)messages.push(`${name} 일정과 충돌 · ${fromTime}→${toTime}, 계획 이동 ${travel}분을 포함하면 ${travel-gap}분 부족합니다.`);
    };
    if(before?.unknownEnd)messages.push('앞 일정의 종료 시각이 미확정입니다. 예약 시각까지 이동 가능한지 확인하세요.');
    else check(before?.end,s.start,legs[i-1],previous?.name||'앞');
    check(s.end,after?.start,legs[i],next?.name||'다음');
   }
   for(const s of v.stops)for(const message of s.reservationTiming?.messages||[])v.reservationWarnings.push({key:s.reservationKey,name:s.name,message});
  }
  return {data,routes};
 }
 return {parseTime,apply,restore,travelMinutes};
});
