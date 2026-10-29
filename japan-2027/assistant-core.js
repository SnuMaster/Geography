'use strict';
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./data-model'):root.TripData);if(typeof module==='object'&&module.exports)module.exports=api;else root.TravelAssistantCore=api;})(globalThis,function(T){
 const STORE='routebook-assistant-v1',categories=['식비','교통비','입장료','쇼핑','기타'];
 const packing=['여권','교통권','충전기','보조배터리','예약 확인','필수 서류','여행 보험','상비약','겨울 외투'];
 function load(storage){try{const v=JSON.parse(storage.getItem(STORE)||'{}');return {visits:v.visits||{},expenses:Array.isArray(v.expenses)?v.expenses:[],packing:v.packing||{},adjustments:v.adjustments||[],budget:v.budget||{JPY:0,KRW:0}};}catch(_){return {visits:{},expenses:[],packing:{},adjustments:[],budget:{JPY:0,KRW:0}};}}
 function save(storage,value){storage.setItem(STORE,JSON.stringify(value));}
 const visitKey=(day,variant,uid)=>`${day}|${variant}|${uid}`;
 function progress(stops,day,variant,records){const done=stops.filter(s=>records[visitKey(day,variant,s.uid)]===true).length;return {done,remaining:stops.length-done,total:stops.length};}
 function next(stops,day,variant,records){return stops.find(s=>!records[visitKey(day,variant,s.uid)])||null;}
 // All external context uses this whitelist. Never spread source stops, routes or reservation records.
 function publicStop(s){if(!s)return null;return {id:s.uid,name:s.kind==='home'?'비공개 출발·도착지':s.name,jp:s.kind==='home'?undefined:s.jp,time:s.time,kind:s.kind,reservationKey:s.reservationKey||null};}
 function stationLabel(part,value,station){const label=station(value)||'',kr=part.coords?.[0]?.[1]<130&&part.coords?.[0]?.[0]>34;return !kr&&['rail','metro'].includes(part.mode)&&label&&!/[（(][\u3040-\u30ff\u3400-\u9fff]/.test(label)?label+' (日本語 확인 필요)':label;}
 function route(leg,station=x=>x){if(!leg)return null;return {id:leg.legId,index:leg.legIndex,status:'저장된 여행 계획',realtime:'실시간 정보 미지원',departureAt:leg.departureAt,arrivalAt:leg.arrivalAt,durationMinutes:leg.durationMinutes??null,durationLabel:leg.durationLabel,walkDistanceM:leg.walkDistanceM??null,fare:leg.fare?{min:leg.fare.min,max:leg.fare.max,currency:leg.fare.currency,status:leg.fare.status,checkedAt:leg.fare.checkedAt,sources:(leg.fare.sources||[]).filter(x=>typeof x==='string').slice(0,2)}:null,parts:(leg.parts||[]).map(p=>({mode:p.mode,line:p.line,from:stationLabel(p,p.from,station),to:stationLabel(p,p.to,station),durationMinutes:p.durationMinutes,source:p.source||null,geometry:p.geometry?.label})),travel:leg.travel?{operator:leg.travel.operator,depart:leg.travel.depart,arrive:leg.travel.arrive,source:leg.travel.source,notice:leg.travel.notice}:null};}
 function context({day,variant,selected,leg,records,personal,online,now=Date.now(),station}){const stops=variant.stops,n=next(stops,day.n,variant.id,personal.visits);return {day:day.n,variant:variant.id,date:T.date(day.n),localTime:new Date(now+9*3600000).toISOString().slice(0,19)+'+09:00',online,selected:publicStop(stops[selected]),next:publicStop(n),progress:progress(stops,day.n,variant.id,personal.visits),stops:stops.map(publicStop),route:leg&&variant.stops.some(s=>s.kind==='home'&&(s.uid===leg.fromUid||s.uid===leg.toUid))?{id:leg.legId,status:'비공개 출발·도착 구간'}:route(leg,station),bookings:[...new Set(stops.map(s=>s.reservationKey).filter(Boolean))].map(key=>({key,status:records[key]?.status||'미신청',time:records[key]?.time||null,confirmed:['예약완료','티켓 확보'].includes(records[key]?.status)}))};}
 function expenses(items,day,budget={}){const sums={JPY:0,KRW:0},daily={JPY:0,KRW:0};for(const x of items)if(['JPY','KRW'].includes(x.currency)&&Number.isFinite(x.amount)&&x.amount>=0){sums[x.currency]+=x.amount;if(x.day===day)daily[x.currency]+=x.amount;}return {total:sums,daily,remaining:{JPY:(budget.JPY||0)-sums.JPY,KRW:(budget.KRW||0)-sums.KRW}};}
 function expense(day,currency,amount,category){amount=Number(amount);if(!Number.isInteger(day)||day<1||day>22||!['JPY','KRW'].includes(currency)||!Number.isSafeInteger(amount)||amount<=0||amount>100000000||!categories.includes(category))throw Error('날짜·통화·정수 금액·분류를 확인하세요.');return {id:globalThis.crypto.randomUUID(),day,currency,amount,category};}
 function adjustments(stops,legs,minutes,records,start=0){
  if(!Number.isInteger(minutes)||minutes<1||minutes>720)throw Error('지연은 1~720분으로 입력하세요.');
  return ['순서 유지','체류 단축','선택 방문 생략'].map((label,option)=>{let previousEnd=null,skipped=false;
   const rows=stops.slice(start).map((s,j)=>{const i=start+j,t=T.interval(s),planned=T.minutes(t.start),end=T.minutes(t.end),travel=legs[i-1]?.durationMinutes??null,fixed=!!s.reservationKey||['airport','port','station'].includes(s.kind)||!!legs[i]?.travel||!!legs[i-1]?.travel||['flight','ferry'].includes(s.modeFromPrevious),unknown=planned===null||(j>0&&(previousEnd===null||!Number.isFinite(travel))),earliest=planned===null?null:j===0?planned+minutes:unknown?null:Math.max(planned,previousEnd+travel),duration=planned!==null&&end!==null?Math.max(0,end-planned):null,skip=option===2&&!fixed&&!skipped&&j>0&&s.kind==='sight';
    if(skip)skipped=true;
    const stay=duration===null?null:skip?0:!fixed&&option===1?Math.max(0,duration-Math.min(15,Math.floor(duration/3))):duration;
    const shift=earliest===null?null:Math.max(0,earliest-planned),conflict=fixed&&shift>0;
    let proposed=fixed?s.time:'계산 불가 · 날짜 경계/시각 미확정';
    if(!fixed&&earliest!==null&&T.formatTime(earliest)){const finish=stay===null?null:T.formatTime(earliest+stay);proposed=T.formatTime(earliest)+(finish&&finish!==T.formatTime(earliest)?'~'+finish:stay===null?'~종료 미확정':'');}
    if(skip)proposed='방문 생략 제안 · 기존 연결 경로는 유지';
    previousEnd=unknown||earliest===null||stay===null?null:Math.max(earliest,fixed?planned:earliest)+stay;
    return {id:s.uid,name:s.name,original:s.time,proposed,fixed,conflict,lateMinutes:shift,unknown,skip,travelMinutes:travel,bookingStatus:s.reservationKey?records[s.reservationKey]?.status||'미신청':null};
   });return {label,delayMinutes:minutes,rows,note:'저장된 이동시간·체류·여유 기준 제안 · 고정 일정 충돌은 이용 가능 보장이 아닙니다. 시각 미확정 이후는 계산을 보류합니다. 원본 일정은 변경하지 않습니다.'};
  });
 }
 function rest(stop,nextStop,leg){const end=T.interval(stop||{}).end,start=T.interval(nextStop||{}).start,travel=leg?.durationMinutes;if(!end||!start||!Number.isFinite(travel))return null;return Math.max(0,T.minutes(start)-T.minutes(end)-travel-10);}
 function uber(stop,clientId){if(!stop||stop.kind==='home'||!Number.isFinite(stop.lat)||!Number.isFinite(stop.lng)||!clientId)return null;const u=new URL('https://m.uber.com/looking');u.searchParams.set('client_id',clientId);u.searchParams.set('drop[0]',JSON.stringify({latitude:stop.lat,longitude:stop.lng,addressLine1:stop.name}));return u.href;}
 function validAction(action,days){return action?.type==='open_place_on_map'&&days.some(d=>d.n===action.day&&d.variants.some(v=>v.id===action.variant&&v.stops.some(s=>s.uid===action.placeId)));}
 return {STORE,categories,packing,load,save,visitKey,progress,next,publicStop,route,context,expenses,expense,adjustments,rest,uber,validAction};
});
