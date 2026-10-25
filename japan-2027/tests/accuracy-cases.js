'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory;else root.runAccuracyCases=factory;})(globalThis,async function({Fare,Departure,Ride,Location,manifest,routeDays}){
 const results=[];
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const test=(name,fn)=>{try{const detail=fn();results.push({name,pass:true,detail:detail||'통과'});}catch(error){results.push({name,pass:false,detail:error.message});}};
 const at=s=>Date.parse(s+'+09:00'),day='2027-01-08';
 const metro={dayNumber:1,parts:[{mode:'metro',lineId:'TokyoMetro.Hibiya'}]};
 const fare={currency:'JPY',min:180,passEligible:true,passExtraMin:0};
 test('1 · 항공·선박·KTX 원래 통화와 금액 / 전체 여정 패스 전환',()=>{
  let count=0;for(const [key,legs] of Object.entries(routeDays))for(const leg of legs){if(!leg)continue;const n=Number(key.split('-')[0]),q=Fare.quote(leg.fare,leg,{day:n,passEnabled:true});
   const nonTokyo=n>11||leg.fare.currency!=='JPY'||leg.parts.some(p=>['flight','ferry'].includes(p.mode))||!leg.parts.some(p=>/^(TokyoMetro\.|Toei\.)/.test(p.lineId||''));
   if(nonTokyo){check(q.amount===leg.fare.min,key+' '+leg.from+' 금액 변형');check(q.currency===leg.fare.currency,'통화 변형');count++;}
  }return count+'개 비대상 구간 보존';
 });
 test('1 · 무료 / 패스 추가부담 0 / 미확인 / 선결제 구분',()=>{
  const labels=[Fare.format({...fare,min:0},metro),Fare.format(fare,metro,{day:1,passEnabled:true}),Fare.format({...fare,min:null},metro),Fare.format({...fare,paymentStatus:'prepaid'},metro)];
  check(new Set(labels).size===4,'상태가 같은 문구로 표시됨');check(labels[3].startsWith('선결제'),'선결제 미표시');check(!Fare.format({...fare,status:'selectedQuote'},metro).includes('선결제'),'견적을 선결제로 오인');return labels.join(' / ');
 });
 test('1 · 혼합 JR 구간은 패스 제외 요금 유지',()=>{const f={...fare,min:377,passEligible:false,passExtraMin:199};check(Fare.quote(f,{...metro,parts:[...metro.parts,{mode:'rail',lineId:'JR-East.Takasaki'}]},{day:1,passEnabled:true}).amount===199,'JR 금액 소실');});
 const schedules={Weekday:[{id:'abc',departure:'10:00',destinationArrival:'10:20',stopTimeBasis:'timetable',stops:[{name:'A',departure:'10:00'},{name:'B',arrival:'10:09',departure:'10:10'},{name:'C',arrival:'10:20'}]}]};
 const train=Ride.trainsForDate(schedules,day)[0],confirmedAt=at(day+'T10:12:00');
 test('2 · B역 확인 뒤 +30분 지연으로 A→B 회귀 금지',()=>{
  const p=Ride.progress(train,confirmedAt+60000,{confirmedStopIndex:1,confirmedAt,delaySeconds:1800});check(p.previousStop?.name==='B','이전 역으로 회귀');check(p.nextStop?.name==='C','다음 역 회귀');check(p.stops[1].arrivalAt===confirmedAt,'확인 시각이 변함');check(p.stops[0].departureAt===train.departureAt,'과거 시각이 변함');check(p.confirmationPending&&!p.positionKnown,'불확실한 이후 위치를 단정');check(p.progressFraction>=.5,'진행률이 확인한 역 이전으로 이동');return 'B역 확인 완료 · 이후 위치 확인 필요';
 });
 test('2 · 음수 보정·큰 지연에도 확인 역보다 뒤로 가지 않음',()=>{for(const delaySeconds of [-7200,-60,0,60,14400])for(const delta of [0,1000,60000,1800000]){const p=Ride.progress(train,confirmedAt+delta,{confirmedStopIndex:1,confirmedAt,delaySeconds});check(p.nextStopIndex===null||p.nextStopIndex>=2,'다음 역이 B 이전');check(p.currentStopIndex===null||p.currentStopIndex>=1,'현재 역 회귀');check(!p.previousStop||p.previousStop.name!=='A','A로 회귀');}});
 test('2 · 시각 없는 B역 확인은 이후 추정 위치를 만들지 않음',()=>{const t=Ride.trainsForDate({Weekday:[{id:'u',departure:'10:00',stops:[{name:'A',departure:'10:00'},{name:'B'},{name:'C',arrival:'10:20'}]}]},day)[0];const p=Ride.progress(t,confirmedAt+3600000,{confirmedStopIndex:1,confirmedAt,delaySeconds:1800});check(p.previousStop.name==='B'&&p.remainingMs===null&&!p.positionKnown,'시각 없는 위치를 단정');});
 test('3 · JST 자정 뒤 출발·도착 문구와 렌더 키 갱신',()=>{const departure=at('2027-01-09T07:30:00'),arrival=departure+600000,before=at('2027-01-08T23:59:00'),after=at('2027-01-09T07:00:00'),trains=[{id:'t',departureAt:departure}];check(Departure.timeLabel(departure,before)==='내일 07:30','전날 문구');check(Departure.timeLabel(departure,after)==='07:30','내일 문구 잔류');check(Departure.timeLabel(arrival,after)==='07:40','도착 문구 잔류');check(Departure.renderSignature(trains,before)!==Departure.renderSignature(trains,after),'렌더 키 날짜 누락');return '내일 07:30 → 07:30 · 도착 07:40';});
 test('3 · 심야 00시 열차는 전날 운행일 보존',()=>{const t=Departure.nextTrains({Weekday:[{id:'night',departure:'24:10'}]},at('2027-01-09T00:00:00'),{limit:1})[0];check(t.serviceDate===day,'심야 운행일 변경');});
 test('4 · 같은 구간을 다른 날에도 방문하면 serviceDate로 지도 선택',()=>{const leg={keys:['same']},days={'1-main':[leg],'2-main':[leg],'2-alt':[leg]};const f=l=>l.keys;check(Ride.itineraryMatch(days,'same','2027-01-09',f,'1-main').dayKey==='2-main','첫 날짜 오선택');check(Ride.itineraryMatch(days,'same','2027-01-09',f,'2-alt').dayKey==='2-alt','같은 날짜 대안 누락');check(Ride.itineraryMatch(days,'same','2027-01-10',f)===null,'일치 없는데 다른 날짜 선택');});
 test('5 · 102개 프로필 유효기간·출처 날짜 점검',()=>{const entries=Object.entries(manifest.profiles);check(entries.length===102,'프로필 누락');for(const [key,p] of entries){check(Object.hasOwn(p,'validFrom')&&(!p.validFrom||/^\d{4}-\d{2}-\d{2}$/.test(p.validFrom)),'validFrom 상태 누락 '+key);check(/^\d{4}-\d{2}-\d{2}$/.test(p.sourceDate),'sourceDate 누락 '+key);check(Object.hasOwn(p,'validUntil'),'종료일 상태 누락 '+key);check(!p.validUntil||p.validUntil>=p.validFrom,'역전 기간 '+key);}return entries.length+'개 · 종료일 미공개는 확정으로 간주하지 않음';});
 test('5 · 아사쿠사선 4개 프로필은 2027년 1월 시각·탑승 차단',()=>{const entries=Object.entries(manifest.profiles).filter(([k])=>k.startsWith('toei-asakusa-'));check(entries.length===4,'아사쿠사 프로필 누락');for(const [key,p] of entries){const options={...p,calendarThrough:manifest.calendarThrough};check(!Departure.validity(options,day).usable,'유효기간 무시 '+key);check(Ride.trainsForDate(schedules,day,options).length===0,'유효하지 않은 탑승 열차 생성');check(Departure.nextTrains(schedules,at(day+'T09:00:00'),options).length===0,'유효하지 않은 다음 열차 생성');}return '여행일 시간표 갱신 필요 · 유효 종료 2026-11-20';});
 test('5 · 유효기간 경계·미래 시작·상한 날짜 차단',()=>{const o={validFrom:day,validUntil:'2027-01-09'};check(Departure.validity(o,day).usable,'시작일 제외');check(Departure.validity(o,'2027-01-09').usable,'종료일 제외');check(!Departure.validity(o,'2027-01-07').usable,'시작일 이전 허용');check(!Departure.validity(o,'2027-01-10').usable,'종료일 이후 허용');});
 const legs=[{to:'B',parts:[{mode:'rail',coords:[[35,139],[35,139.01],[35,139.02]]}]},{to:'A',parts:[{mode:'rail',coords:[[35,139.02],[35,139.01],[35,139]]}]}],segments=Location.build(legs),point=[35,139.01];
 test('6 · 왕복 중복선·정지 상태에서는 자동 선택 보류',()=>{const r=Location.resolve(point,segments,{accuracy:10});check(r.ambiguous&&r.match===null,'임의로 편도 선택');return '현재 구간 선택 필요 · 남은 거리 표시 보류';});
 test('6 · 최근 GPS 방향으로 왕복 구분',()=>{check(Location.resolve(point,segments,{heading:90,accuracy:10}).match.legIndex===0,'동행 방향 오인');check(Location.resolve(point,segments,{heading:270,accuracy:10}).match.legIndex===1,'서행 방향 오인');});
 test('6 · 현재 선택 구간·이미 지난 구간·연속 진행 반영',()=>{check(Location.resolve(point,segments,{manualLeg:1,heading:90}).match.legIndex===1,'수동 선택 무시');check(Location.resolve(point,segments,{selectedLeg:1}).match.legIndex===1,'선택 구간 무시');check(Location.resolve(point,segments,{passedLegs:[0]}).match.legIndex===1,'지난 구간 재선택');const p=Location.resolve(point,segments,{manualLeg:1}).match;check(Location.resolve(point,segments,{previousMatch:p}).match.legIndex===1,'이전 진행 무시');});
 test('6 · 같은 구간의 먼 교차 지점으로 남은 거리 점프 차단',()=>{const p=Location.resolve(point,segments,{manualLeg:1}).match;const r=Location.resolve([35,139.019],segments,{manualLeg:1,previousMatch:p,maxAdvanceM:250});check(!r.match||r.match.alongM>=p.alongM-80,'진행 역전');check(Location.assess(p,{accuracy:500,timestamp:Date.now()}).kind==='uncertain','정확도 낮음 차단');});
 test('회귀 · 다음 열차 평일·공휴일 및 한계 시각',()=>{const sch={Weekday:[{id:'w',departure:'07:30'}],SaturdayHoliday:[{id:'h',departure:'08:30'}]};check(Departure.nextTrains(sch,at('2027-01-08T07:00:00'))[0].id==='w','평일 계산');check(Departure.nextTrains(sch,at('2027-01-11T07:00:00'),{holidays:['2027-01-11']})[0].id==='h','공휴일 계산');});
 return results;
});
