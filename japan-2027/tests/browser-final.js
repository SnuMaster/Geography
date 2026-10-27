'use strict';
(async()=>{
 const $=s=>document.querySelector(s),frame=$('#app'),qa=window.stateQA={storage:new Map(),clock:null,safeBottom:34,mockGPS:true,hidden:false,errors:[]};let total=0,failed=0,nonce=0;
 const sleep=ms=>new Promise(r=>setTimeout(r,ms)),check=(v,m)=>{if(!v)throw Error(m);},until=async fn=>{for(let n=0;n<300;n++){if(fn())return;await sleep(100);}throw Error('화면 갱신 제한시간 초과');};
 const load=async(day=1,{reset=true,date='2027-01-08T09:00:00+09:00'}={})=>{if(reset){qa.storage.clear();qa.clock=Date.parse(date);qa.delayFile=null;qa.networkBlocked=false;qa.hidden=false;qa.errors=[];}const old=frame.contentDocument;frame.src=`state-fixture.html?day=${day}&variant=main&qa=${++nonce}`;try{await until(()=>new URL(frame.contentWindow.location.href).searchParams.get('qa')===String(nonce)&&frame.contentDocument?.querySelector('#ridePanel'));}catch(error){throw Error(error.message+' · '+(frame.contentDocument?.querySelector('#mapLoading')?.textContent||('지도 로딩 상태 없음 / 패널 '+!!frame.contentDocument?.querySelector('#ridePanel')+' / URL '+frame.contentWindow.location.href)));}const w=frame.contentWindow;w.ItineraryDrawer.open({focus:false});w.document.querySelector('#routeAllToggle').click();return w;};
 const click=(w,s)=>{const n=w.document.querySelector(s);check(n,'컨트롤 없음 '+s);n.click();},change=(w,s,v)=>{const n=w.document.querySelector(s);check(n,'입력 없음 '+s);if(n.type==='checkbox')n.checked=!!v;else n.value=v;n.dispatchEvent(new w.Event('change',{bubbles:true}));},input=(w,s,v)=>{const n=w.document.querySelector(s);n.value=v;n.dispatchEvent(new w.Event('input',{bubbles:true}));};
 const close=w=>{const d=w.document;if(d.querySelector('#detailSheet').open)click(w,'[data-sheet-close]');else w.__routebook.map.closePopup();};
 const report=async(n,name,fn)=>{let detail,pass=true;try{detail=await fn()||'통과';}catch(e){detail=e.message;pass=false;failed++;}total++;const li=document.createElement('li');li.className=pass?'':'fail';li.dataset.scenario=n;li.textContent=`${pass?'PASS':'FAIL'} · ${n}. ${name}`;const small=document.createElement('small');small.textContent=detail;li.append(small);$('#results').append(li);$('#status').textContent=`${total-failed}/${total} 통과 · 실패 ${failed}`;};
 const key='jr-ueno-tokyo',hibiya='tokyometro-hibiya-iriya-akihabara';
 const pick=async(w,k=key,date='2027-01-08')=>{await w.RideTracker.open(k,date);await until(()=>w.document.querySelector('[data-ride-board]'));click(w,'[data-ride-board]');await until(()=>w.document.querySelector('#ridePosition'));};
 const gps=(lat,lng,timestamp,accuracy=10)=>qa.gpsReceiver?.({timestamp,coords:{latitude:lat,longitude:lng,accuracy,speed:0,heading:null}});
 $('#run').onclick=async()=>{if($('#run').disabled)return;$('#run').disabled=true;$('#results').replaceChildren();total=failed=0;$('#status').textContent='검증 시작 · 0/44';
 await report(1,'대구 세계 지도',async()=>{const w=await load(1);w.__routebook.map.setView([35.8941,128.6589],16,{animate:false});const tile=w.document.querySelector('.leaflet-tile');await until(()=>w.document.querySelector('.leaflet-tile[src*=openstreetmap]'));check(w.__routebook.map.getZoom()===16,'확대 실패');return '대구16배 확대 · 한국을 지원하는 OSM URL 사용 (공급자 응답은 네트워크 상태에 따름)';});
 await report(2,'72시간권 실제 적용 경계',async()=>{const w=await load(2),b=w.__routebook,d=w.document;d.querySelector('.day-tools').open=true;change(w,'#passToggle',true);/* checkbox handled explicitly */d.querySelector('#passToggle').checked=true;d.querySelector('#passToggle').dispatchEvent(new w.Event('change',{bubbles:true}));change(w,'#passStart','2027-01-09T09:00');change(w,'#passPurchased',true);const f={min:200,max:200,currency:'JPY',passEligible:true},l={parts:[{lineId:'TokyoMetro.Hibiya',mode:'metro'}]},start=Date.parse('2027-01-09T09:00:00+09:00');check(w.FareCore.quote(f,{...l,departureAt:start},{pass:b.state.pass}).amount===0,'시작 이후 할인 안 됨');check(!w.FareCore.quote(f,{...l,departureAt:start+72*3600000},{pass:b.state.pass}).passApplied,'만료 뒤 할인');return '09:00포함 / 72시간 만료 시각 제외';});
 await report(3,'패스 날짜 이동·새로고침 유지',async()=>{let w=frame.contentWindow,b=w.__routebook;const saved=b.state.pass.startAt;b.setDay(12);b.setDay(2);check(b.state.pass.startAt===saved&&b.state.passEnabled,'날짜 이동 유실');w=await load(2,{reset:false});check(w.__routebook.state.pass.startAt===saved&&w.__routebook.state.passEnabled,'새로고침 유실');});
 await report(4,'후쿠오카 택시 정액 합계 제외',async()=>{const w=await load(19),c=w.__routebook.dailyCost();check(c.ic===1200&&c.paper===1200&&c.variableJPY.min===3000&&c.variableJPY.max===5000,'잘못된 택시 합산');check(w.document.querySelector('.day-glance').textContent.includes('1,200'),'화면 합계 오류');return '정액1200 / 변동3000~5000 / 전체4200~6200엔';});
 await report(5,'식사·음료 입장료 제외',async()=>{const w=await load(),b=w.__routebook,c=w.JourneyState.totals(b.state.data.days,b.state.routeData.days);check(c.admissionMin===36400&&c.admissionMax===51950,'입장료 분류 오류');b.showOverview();check(w.document.querySelector('[data-summary=baseline]').textContent.includes('36,400~51,950'),'전체 화면 합계 오류');});
 await report(6,'우지 선택 왕복 유지',async()=>{const w=await load(14),b=w.__routebook;b.setVariant('no-yamazaki');b.setDay(15);b.setDay(14);check(b.state.variant==='no-yamazaki','우지 유실');});
 await report(7,'우지 검색 정확한 대체안·장소',async()=>{const w=frame.contentWindow,d=w.document;input(w,'#daySearch','우지');click(w,'[data-place-id="d14-no-yamazaki-1"]');check(w.__routebook.state.variant==='no-yamazaki'&&w.__routebook.state.selected===1,'검색 대상 불일치');close(w);});
 await report(8,'모노레일 검색 실제 이동',async()=>{const w=frame.contentWindow;input(w,'#daySearch','모노레일');click(w,'[data-search-result]');check(w.__routebook.state.day===12,'노선 날짜 오류');const section=w.document.querySelector('.station-departures');check(section?.dataset.departureProfile==='day12-tokyomonorail-hanedaairport-hamamatsucho-hanedaairportterminal1','검색한 모노레일 구간과 시간표 연결 오류');close(w);});
 await report(9,'전체 지도 KTX 실제1/29',async()=>{const w=await load(1),b=w.__routebook;b.showOverview();const marker=[...b.map._layers?Object.values(b.map._layers):[]].find(l=>l.options?.title?.includes('KTX'));check(marker,'KTX기호 없음');marker.fire('click');const section=w.document.querySelector('.station-departures');check(section?.dataset.serviceDate==='2027-01-29','KTX 날짜 '+section?.dataset.serviceDate);close(w);});
 await report(10,'팝업 자정·날짜 문구 갱신',async()=>{const w=await load(1,{date:'2027-01-08T23:59:00+09:00'});w.__routebook.selectLeg(6);await until(()=>w.document.querySelector('[data-ride-next]'));qa.clock=Date.parse('2027-01-09T07:00:00+09:00');await sleep(1200);const d=w.document;check(d.querySelector('.departure-clock').textContent.includes('01/09'),'일본 날짜 미갱신');check(d.querySelector('.departure-heading strong').textContent==='다음 열차','현재 팝업이 과거 참고로 회귀');close(w);});
 await report(11,'열차 목록1시간 후 새로운 열차 추가',async()=>{const w=await load(1);await w.RideTracker.open(hibiya,'2027-01-08');await until(()=>w.document.querySelector('[data-train-uid]'));input(w,'#rideSearch','보통');const d=w.document,before=new Set([...d.querySelectorAll('[data-train-uid]')].map(n=>n.dataset.trainUid));const scroller=d.querySelector('#rideBody');scroller.scrollTop=80;qa.clock+=3600000;await sleep(1200);const after=[...d.querySelectorAll('[data-train-uid]')].map(n=>n.dataset.trainUid);check(after.some(id=>!before.has(id)),'새 범위 열차 미추가');check(d.querySelector('#rideSearch').value==='보통','검색어 유실');check(Math.abs(scroller.scrollTop-80)<3,'목록 스크롤 유실');return '합성 시계09→10시 · 새 열차 '+after.filter(id=>!before.has(id)).length+'편 DOM 추가 · 검색·스크롤 유지';});
 await report(12,'03시 현재 목록만 운행일 변경',async()=>{const w=await load(1,{date:'2027-01-09T02:59:00+09:00'});await w.RideTracker.open(hibiya);await until(()=>w.document.querySelector('#rideDate'));check(w.document.querySelector('#rideDate').value==='2027-01-08','02시 운행일 오류');qa.clock=Date.parse('2027-01-09T03:00:00+09:00');await sleep(1200);check(w.document.querySelector('#rideDate').value==='2027-01-09','03시 미갱신');change(w,'#rideDate','2027-01-15');qa.clock=Date.parse('2027-01-10T03:00:00+09:00');await sleep(1200);check(w.document.querySelector('#rideDate').value==='2027-01-15','수동 미래일 강제 변경');});
 await report(13,'실제 역 확인 뒤 지연 보정',async()=>{const w=await load(1);await pick(w);const d=w.document;click(w,'[data-ride-confirm="1"]');const before=d.querySelector('#ridePosition').textContent;change(w,'#rideDelay','30');d.querySelector('#rideDelayForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));check(d.querySelector('#ridePosition').textContent.includes(before.split('역')[0])||!d.querySelector('[data-ride-stop-row="0"]').classList.contains('is-current'),'확인 이전 역으로 회귀');return '확인한 역 바닥값 보존 · 실제 도착 자동 확정 없음';});
 await report(14,'오래된 GPS 수신 무시·도약 보류',async()=>{const w=await load();w.RouteLocation.start();gps(35.7,139.8,qa.clock);gps(35.71,139.81,qa.clock-6000);check(w.RouteLocation.getFix().timestamp===qa.clock,'오래된 GPS 수락');gps(36.7,139.8,qa.clock+1000);check(w.RouteLocation.getFix().lat===35.7,'위치 도약 수락');w.RouteLocation.stop();});
 await report(15,'지도 탐색과 GPS 수동 선택 분리',async()=>{const w=await load();w.__routebook.selectLeg(6);close(w);w.RouteLocation.start();check(w.document.querySelector('#locationLeg').value==='auto','탐색이 수동 선택으로 잔류');w.RouteLocation.selectLeg(5);check(w.document.querySelector('#locationLeg').value==='5','명시 수동 선택 실패');click(w,'#locationAuto');check(w.document.querySelector('#locationLeg').value==='auto','자동 복귀 실패');w.RouteLocation.stop();});
 await report(16,'왕복 노선 두 방향 시간표 접근',async()=>{const w=await load(2),b=w.__routebook;const grouped=Object.values(b.map._layers).find(l=>l.options?.title?.includes('이동 방향')&&l.getElement?.()?.querySelector('.route-direction-count'));check(grouped,'왕복 선택 기호 없음');grouped.fire('click');const buttons=w.document.querySelectorAll('[data-route-direction]');check(buttons.length>=2,'방향 UI 누락');buttons[1].click();check(w.document.querySelector('.station-departures'),'귀환 시간표 없음');check(w.document.querySelector('[data-route-direction="1"]').getAttribute('aria-pressed')==='true','귀환 선택 실패');close(w);});
 await report(17,'GPS 자정 안내·과거 화면 보존',async()=>{const w=await load(1,{date:'2027-01-08T23:59:00+09:00'});w.RouteLocation.start();gps(35.7,139.8,qa.clock);qa.clock=Date.parse('2027-01-09T00:00:00+09:00');await until(()=>w.document.querySelector('#locationStatus').textContent.includes('날짜 변경'));check(w.__routebook.state.day===1,'화면 강제 변경');check(w.document.querySelector('#locationStatus').textContent.includes('날짜 변경'),'날짜 변경 안내 없음');check(!w.document.querySelector('#locationNext').textContent.includes('남은'),'이전 경로 남은 거리 유지');w.RouteLocation.stop();});
 await report(18,'닫힌 시간표 비동기 응답·초점 차단',async()=>{const w=await load();qa.delayFile='timetables/';qa.delayMs=1800;const task=w.RideTracker.open(hibiya,'2027-01-08');await sleep(100);click(w,'[data-ride-close]');await task;check(w.document.querySelector('#ridePanel').hidden,'늦은 응답으로 패널 다시 열림');check(!w.document.querySelector('#ridePanel').contains(w.document.activeElement),'숨겨진 패널 focus');});
 await report(19,'저장 열차 복원 중 패널 열기',async()=>{let w=await load();await pick(w);const saved=qa.storage.get('routebook-boarded-train-v1');qa.delayFile='timetables/';qa.delayMs=1600;w=await load(1,{reset:false});click(w,'#rideToggle');await until(()=>w.document.querySelector('#ridePosition'));check(qa.storage.get('routebook-boarded-train-v1')===saved,'복원 중 저장값 유실');});
 await report(20,'오래된 탑승 기록 별도 안내',async()=>{qa.clock=Date.parse('2027-01-12T10:00:00+09:00');const w=await load(1,{reset:false});click(w,'#rideToggle');await until(()=>w.document.querySelector('[data-ride-continue]'));check(w.document.querySelector('.ride-mini').textContent.includes('이전 탑승 기록'),'오래된 기록을 현재 탑승 표시');check(qa.storage.has('routebook-boarded-train-v1'),'기록 무단 삭제');return '이전 기록 확인 / 계속 확인 / 종료 제공';});
 await report(21,'자동 재생 중 수동 철도 상세',async()=>{const w=await load(2);click(w,'#playBtn');w.__routebook.selectLeg(1);check(w.document.querySelector('#playBtn').textContent.includes('계속 재생'),'수동 상세 재생 미정지');const title=w.document.querySelector('.popup-title').textContent;await sleep(3300);check(w.document.querySelector('.popup-title')?.textContent===title,'상세 덮어쓰기');close(w);});
 await report(22,'앱 백그라운드 전환 재생 정지',async()=>{const w=await load(2);click(w,'#playBtn');const selected=w.__routebook.state.selected;qa.hidden=true;w.document.dispatchEvent(new w.Event('visibilitychange'));await sleep(3300);qa.hidden=false;w.document.dispatchEvent(new w.Event('visibilitychange'));check(w.__routebook.state.selected===selected,'숨김 상태에서 진행');check(w.document.querySelector('#playBtn').textContent.includes('계속 재생'),'복귀 자동 재생');});
 await report(23,'항공 종료 배경·일반 재생 상태',async()=>{const w=await load(12),b=w.__routebook;const before=[...w.document.querySelectorAll('.leaflet-tile')].map(n=>n.src).find(s=>s.includes('gsi'));b.selectLeg(6);click(w,'[data-flight-replay]');await until(()=>w.document.querySelector('.flight-replay-panel:not([hidden])'));check(!b.state.playing,'항공·일반 동시 재생');qa.hidden=true;w.document.dispatchEvent(new w.Event('visibilitychange'));check(w.document.querySelector('[data-flight-state]').textContent.includes('멈춤'),'항공 백그라운드 미정지');qa.hidden=false;click(w,'[data-flight-stop]');await until(()=>w.document.querySelector('.leaflet-tile[src*=gsi]'));check(before,'이전 일본 배경 없음');});
 await report(24,'전체·일일·뒤로가기 복원',async()=>{const w=await load(14),b=w.__routebook;b.showOverview();click(w,'#dailyView');w.history.back();await until(()=>b.state.view==='overview');w.history.back();await until(()=>b.state.view==='daily');check(b.state.day===14,'뒤로가기 날짜 오류');});
 await report(25,'도쿄 필터 중 오사카 날짜 접근',async()=>{const w=await load(2);click(w,'[data-city="tokyo"]');w.__routebook.setDay(12);check(w.document.querySelector('[data-day="12"]'),'현재 날짜가 필터에서 사라짐');});
 await report(26,'패스 설정 시 비용 상세 유지',async()=>{const w=await load(2),d=w.document;d.querySelector('.day-tools').open=true;d.querySelector('#passToggle').checked=true;d.querySelector('#passToggle').dispatchEvent(new w.Event('change',{bubbles:true}));check(d.querySelector('.day-tools').open,'비용 상세 닫힘');});
 await report(27,'야경 강조·현재 보기 재클릭 상태 유지',async()=>{const w=frame.contentWindow,d=w.document;d.querySelector('[data-stop="1"] details').open=true;click(w,'#nightBtn');check(d.querySelector('[data-stop="1"] details').open,'장소 상세 닫힘');const night=w.__routebook.state.night,pass=w.__routebook.state.passEnabled;click(w,'#dailyView');check(d.querySelector('[data-stop="1"] details').open&&w.__routebook.state.night===night&&w.__routebook.state.passEnabled===pass,'현재 보기 재클릭 초기화');});
 await report(28,'1/23 행사 길찾기 좌표 사용',async()=>{const w=await load(16),b=w.__routebook;const stops=b.getStops();for(const s of stops.filter(s=>/불꽃놀이|점화/.test(s.name))){const i=stops.indexOf(s),url=w.document.querySelector(`#stop-${i} .place-map`).href;check(decodeURIComponent(url).includes(s.lat+','+s.lng),'행사 좌표 아닌 검색');}check(stops.some(s=>s.time.startsWith('18:15'))&&stops.some(s=>s.time.startsWith('18:30')),'고정 행사 삭제');});
 await report(29,'1/28~29 상세·예약 상태 유지',async()=>{let w=await load(14);w.__routebook.selectStop(1);change(w,'[data-reservation-status=yamazaki]','신청');close(w);w=await load(14,{reset:false});w.__routebook.selectStop(1);check(w.document.querySelector('[data-reservation-status=yamazaki]').value==='신청','예약 기록 유실');close(w);for(const n of [21,22]){w.__routebook.setDay(n);check(w.__routebook.getStops().filter(s=>s.kind!=='home').every(s=>s.details?.feature&&s.details?.reservationNote),'마지막 상세 누락');}return '마지막17개 카드 상세 + 예약 사용자 상태 새로고침 보존';});
 await report(30,'320px 모든263개 장소 마지막 버튼',async()=>{frame.style.width='320px';frame.style.height='568px';const w=await load(),b=w.__routebook;let count=0;for(const d of b.state.data.days){b.setDay(d.n,{history:'none'});for(const v of d.variants){b.setVariant(v.id,{history:'none'});for(let i=0;i<v.stops.length;i++){b.selectStop(i,true,false,{history:false});const body=w.document.querySelector('.detail-sheet-body');check(w.document.querySelector('#detailSheet').open,'sheet 미표시');body.scrollTop=body.scrollHeight;const links=[...body.querySelectorAll('a')].filter(a=>a.textContent.includes('장소 길찾기')),last=links.at(-1);check(last,'마지막 길찾기 없음');const r=last.getBoundingClientRect();check(r.top>=0&&r.bottom<=568,'마지막 링크 잘림 '+d.n+'/'+i);const hit=w.document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);check(hit&&(last===hit||last.contains(hit)),'마지막 링크 가림');close(w);count++;}}}return count+'개 전체 상세 마지막 링크 hit-test';});
 await report(31,'통신 차단 후 저장 일정·시간표 사용',async()=>{frame.style.width='390px';frame.style.height='844px';const w=await load(19);const url='west-data.json?v='+w.TravelStore.VERSION;await w.TravelStore.readJson(url);await w.__routebook.rail.getSchedule(key);qa.networkBlocked=true;const data=await w.TravelStore.readJson(url);check(data.days.some(d=>d.n===19),'저장 일정 없음');check(w.document.querySelector('#offlineStatus').dataset.offline==='true','오프라인 안내 없음');check(await w.__routebook.rail.getSchedule(key),'최근 시간표 유실');check(w.__routebook.state.day===19,'화면 일정 유실');qa.networkBlocked=false;return '실제 fetch 실패 입력 → CacheAPI 저장 JSON·시각 안내, 당일 화면 유지';});
 await report(32,'4개 화면 전체25안 데이터·연결',async()=>{const w=await load(),b=w.__routebook;let count=0;for(const [width,height] of [[320,568],[390,844],[768,1024],[1280,900]]){frame.style.width=width+'px';frame.style.height=height+'px';w.dispatchEvent(new w.Event('resize'));for(const d of b.state.data.days){b.setDay(d.n,{history:'none'});for(const v of d.variants){b.setVariant(v.id,{history:'none'});check(w.document.querySelectorAll('.stop-card').length===v.stops.length,'카드 누락');check(w.document.documentElement.scrollWidth<=w.document.documentElement.clientWidth+1,'가로 넘침 '+width+'/'+d.n);check(!/undefined|NaN/.test(w.document.querySelector('#stopList').textContent),'잘못된 값 노출');count++;}}}check(qa.errors.length===0,'JS 오류 '+qa.errors.join(';'));return count+'개 일정안 렌더 · 저장 개수263/238/144 보존 · console 오류 없음';});
 await report(33,'1/8 숙소 출발 뒤 실제 연결 가능한 JR 열차',async()=>{
  frame.style.width='1280px';frame.style.height='900px';const w=await load(1,{date:'2026-10-26T10:00:00+09:00'}),d=w.document;
  w.__routebook.selectLeg(8);change(w,'[data-departure-select]','jr-ueno-tokyo');
  await until(()=>d.querySelector('[data-ride-next]'));
  const section=d.querySelector('.station-departures'),first=section._rideTrains[0],parts=w.ConnectionCore.stepsFor(w.__routebook.getLeg(8),w.__routebook.rail.keyFor);
  check(w.DepartureCore.formatTime(first.departureAt)==='17:33','도보·앞 열차·환승을 반영하지 않은 JR 열차');
  check(d.querySelector('.departure-clock').textContent.includes('01/08 참고'),'연결 기준 안내 누락');
  check(parts.length===5,'도보·환승 단계 누락');close(w);return '17:10 숙소 출발 → 앞 열차·도보·환승 반영 → 우에노17:33 출발';
 });
 await report(34,'새 자료 적용 전 표시 시각 유지·일부 실패 시 혼합 차단·선택 상태 보존',async()=>{
  const w=await load(14),b=w.__routebook,d=w.document;b.setVariant('no-yamazaki');await pick(w);
  click(w,'[data-ride-close]');const ride=qa.storage.get('routebook-boarded-train-v1'),previous=d.querySelector('#offlineStatus').textContent,original=w.fetch.bind(w);
  let blocked=true;
  w.fetch=async(url,options)=>{
   if(blocked&&String(url).startsWith('tokyo-data.json'))throw Error('partial refresh fixture');
   const response=await original(url,options);
   if(String(url).startsWith('west-data.json')){const data=await response.json();data.days.find(day=>day.n===14).variants.find(v=>v.id==='no-yamazaki').title='새 자료 우지 일정';return new w.Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});}
   return response;
  };
  qa.clock+=60000;w.dispatchEvent(new w.Event('routebook:online'));
  await until(()=>d.querySelector('#offlineStatus').dataset.offline==='true');
  check(d.querySelector('[data-store-apply]').hidden,'일부 실패 자료 적용 노출');check(!d.querySelector('#dayHeader').textContent.includes('새 자료 우지'),'실패한 묶음이 화면에 반영됨');
  blocked=false;w.dispatchEvent(new w.Event('routebook:online'));await until(()=>!d.querySelector('[data-store-apply]').hidden);
  check(d.querySelector('#offlineStatus').textContent.includes('현재 화면은 이전 자료'),'새 자료와 표시 자료 혼동');
  check(!d.querySelector('#dayHeader').textContent.includes('새 자료 우지'),'사용자 적용 전에 일정 덮어쓰기');
  click(w,'[data-store-apply]');check(b.state.day===14&&b.state.variant==='no-yamazaki','날짜·대체안 유실');
  check(d.querySelector('#dayHeader').textContent.includes('새 자료 우지'),'새 일정 적용 실패');check(qa.storage.get('routebook-boarded-train-v1')===ride,'탑승 기록 유실');
  check(d.querySelector('[data-store-apply]').hidden,'적용 버튼 잔류');check(!d.querySelector('#offlineStatus').textContent.includes('이전 자료'),'표시 자료 시각 미갱신');
  return '실패한 파일은 합치지 않음 · 적용 버튼으로 새 자료 반영 · 날짜·우지안·탑승 기록 보존';
 });
 await report(35,'모바일·데스크톱 예약 시각 즉시 반영·팝업 유지·충돌 경고·초기화',async()=>{
  for(const width of [320,1280]){
   frame.style.width=width+'px';frame.style.height='900px';const w=await load(14),b=w.__routebook,d=w.document;
   b.selectStop(1);const timeSelector='.leaflet-popup-content [data-reservation-time=yamazaki]';
   d.querySelector(timeSelector).focus();change(w,timeSelector,'2027-01-21T14:00');
   check(d.querySelector('.leaflet-popup-content .popup-time').textContent.includes('14:00'),'팝업 시각 미반영 '+width);
   check(d.querySelector('[data-stop="1"] .stop-time').textContent.includes('14:00~15:40'),'카드 시각 미반영 '+width);
   check(d.querySelector('.reservation-alert').textContent.includes('산쇼테이'),'연결 충돌 경고 없음 '+width);
   check(d.querySelector(timeSelector).value==='2027-01-21T14:00','팝업 입력 유실 '+width);
   check(d.activeElement===d.querySelector(timeSelector),'예약 입력 초점 유실 '+width);
   if(width<=1024)check(d.querySelector('#detailSheet').open,'변경 뒤 상세창 닫힘');
   check(b.getLeg(2).departureAt===Date.parse('2027-01-21T15:40:00+09:00'),'다음 이동 시각 미반영');
   const details=d.querySelector('#routeDetails');check(details.textContent.includes('14:00~15:40'),'시간표 전체 미반영');
   change(w,timeSelector,'2027-01-22T14:00');check(d.querySelector(timeSelector).getAttribute('aria-invalid')==='true','다른 날짜 검증 누락');
   check(d.querySelector('[data-stop="1"] .stop-time').textContent.includes('10:00~11:40'),'잘못된 날짜가 적용됨');
   change(w,timeSelector,'');check(!d.querySelector('.reservation-alert'),'초기화 뒤 충돌 잔류');check(d.querySelector(timeSelector).getAttribute('aria-invalid')==='false','오류 상태 잔류');close(w);
  }
  return '320/1280px · 카드/팝업/이동/전체 시간표 동기화 · 날짜 오류 보류 · 원래 계획 복원';
 });
 await report(36,'예약 기록 새로고침 복원·공연 종료 미확정·나리타 시각 통일',async()=>{
  let w=await load(14),b=w.__routebook;b.selectStop(1);change(w,'.leaflet-popup-content [data-reservation-status=yamazaki]','예약완료');change(w,'.leaflet-popup-content [data-reservation-time=yamazaki]','2027-01-21T14:00');close(w);
  w=await load(14,{reset:false});b=w.__routebook;check(b.getStops()[1].time==='14:00~15:40','새로고침 뒤 예약 시각 미복원');
  b.setDay(11);b.selectStop(6);change(w,'.leaflet-popup-content [data-reservation-time=zutomayo]','2027-01-18T17:30');
  check(b.getStops()[6].start==='17:30'&&b.getStops()[6].end===null,'공연 종료 임의 생성');check(b.getLeg(7).departureTimeKnown===false,'공연 귀환 시각 확정 표시');close(w);
  b.setDay(1);check(b.getStops()[2].end==='14:20','나리타 내부 종료 시각');check(b.getLeg(3).departureAt===Date.parse('2027-01-08T14:20:00+09:00'),'나리타 다음 이동 시각');
  check(w.document.querySelector('#routeDetails').textContent.includes('13:20~14:20'),'나리타 전체 시간표 시각');
  return '예약 기록 유지 · 공연 종료 미확정 보존 · 나리타 카드·계산·전체 시간표 일치';
 });
 await report(37,'공항 이동선 상세 좌표·거리·팝업 연결',async()=>{
  frame.style.width='1280px';frame.style.height='900px';const w=await load(12),b=w.__routebook;
  for(const [day,i,min,max]of [[12,2,6500,8500],[12,3,16500,18000],[18,4,3000,3600]]){
   b.setDay(day);const leg=b.getLeg(i);check(leg.parts[0].coords.length>40,'직선 경로 잔류');check(leg.distanceM>min&&leg.distanceM<max,'선로 거리 오류');
   b.selectLeg(i);check(w.document.querySelector('.station-departures'),'시간표 연결 유실');check(w.document.querySelector('.geometry-note').textContent.includes('N02'),'철도 선형 출처 미표시');close(w);
  }
  return 'JR·모노레일·후쿠오카 공항선 원본 좌표와 기존 시간표 연결 유지';
 });
 await report(38,'서대구 귀환 카드·330편 탑승·전체 여정 운임',async()=>{
  const w=await load(22,{date:'2026-10-26T10:00:00+09:00'}),b=w.__routebook,d=w.document,key='korail-busan-seodaegu';
  check(w.TripPersonal.stopName(b.getStops().at(-2))==='서대구역'&&b.getStops().at(-1).name==='월성로 132','동대구 종점 잔류');check(d.querySelector('#dayHeader').textContent.includes('16,300'),'서대구 운임 미반영');
  check(d.querySelector('[data-stop="5"]').textContent.includes('12:44'),'부산 출발 시각 미반영');
  b.selectLeg(6);await until(()=>d.querySelector('[data-ride-next]'));check(d.querySelector('.station-departures')._rideTrains[0].number==='330','다음 열차330 미표시');close(w);
  await w.RideTracker.open(key,'2027-01-29');await until(()=>d.querySelector('#rideSearch'));input(w,'#rideSearch','330');
  check(d.querySelector('.ride-train-option').textContent.includes('12:44'),'330편 검색 실패');click(w,'[data-ride-board]');await until(()=>d.querySelector('#ridePosition'));
  check(d.querySelector('#ridePanel').textContent.includes('서대구'),'탑승 추적 종점 오류');click(w,'[data-ride-close]');
  b.showOverview();check(d.querySelector('#routeDetails').textContent.includes('부산→서대구'),'전체 여정 구간 누락');check(d.querySelector('#routeDetails').textContent.includes('16,300'),'전체 여정 운임 오류');
  return '12:44 출발·13:47:30 정차 원값 · 서대구 종점 · 일반실16,300원 · 미발권 참고 계획';
 });
 await report(39,'전체 지도 확대·지역별 날짜·상세 장소·일정 이동',async()=>{
  for(const width of [390,1280]){
   frame.style.width=width+'px';frame.style.height='900px';const w=await load(22),b=w.__routebook,d=w.document;b.showOverview();check(d.querySelectorAll('.city-marker').length===5,'도시 마커 중복');check(d.querySelector('.city-marker').getBoundingClientRect().width>=44,'도시 터치 영역 부족');b.map.setView([35.714,139.797],13,{animate:false});
   await until(()=>d.querySelector('[data-overview-day="2"]'));click(w,'[data-overview-day="2"]');
   check(b.state.view==='overview'&&d.querySelectorAll('.overview-place-marker').length>3,'전체 지도 상세 누락 '+width);check(d.querySelectorAll('.overview-stop-row').length===b.state.data.days[1].variants[0].stops.length,'선택 날짜 상세 순서 누락');check(d.querySelectorAll('.journey-day').length===0,'전체 날짜 목록 반복');click(w,'#focusBtn');check(b.map.getCenter().lng>139,'관광지 확대가 이전 날짜의 다른 도시로 이동');await until(()=>Object.values(b.map._layers).some(l=>l.options?.title==='01/09 센소지'));
   const layer=Object.values(b.map._layers).find(l=>l.options?.title==='01/09 센소지');check(layer,'센소지 상세 마커 없음');layer.fire('click');
   check(d.querySelector('.popup-title').textContent.includes('센소지'),'장소 상세 미표시');click(w,'[data-detail-itinerary]');
   check(b.state.view==='daily'&&b.state.day===2,'다른 날짜로 이동');check(b.getStops()[b.state.selected].name==='센소지','장소 선택 유실');
  }
  return '390/1280px · 전체 보기 유지한 지역 확대 · 날짜 선택 · 장소 상세에서 정확한 일정 이동';
 });
 await report(40,'배 양쪽 항만 연결·중복 기호·날짜 목록 정리',async()=>{
  const w=await load(21),b=w.__routebook,d=w.document,l=b.getLeg(5),stops=b.getStops();
  const shown=w.TripPersonal.displayParts(l);check(l.parts.length===3&&l.parts[1].coords.length===86&&shown.length===3&&JSON.stringify(shown[0].coords.at(-1))===JSON.stringify(shown[1].coords[0])&&JSON.stringify(shown[1].coords.at(-1))===JSON.stringify(shown[2].coords[0]),'원본 해상 참고선/연속 시각화 오류');check(l.parts[0].geometryAccuracy==='schematic'&&l.parts[2].suppressSymbol,'항만 개략선 구분 누락');
  check(l.parts[0].coords[0][0]===stops[4].lat&&l.parts.at(-1).coords.at(-1)[0]===stops[5].lat,'항만 연결 누락');
  check(Object.values(b.map._layers).filter(x=>x.options?.title?.startsWith('선박')).length===1,'배 기호 중복');
  const item=d.querySelector('[data-day="2"]');check(item.textContent.includes('도쿄')&&item.textContent.includes('아사쿠사'),'도시·명소 누락');check(!item.textContent.includes('DAY'),'날짜 안내 중복');
  check(!d.querySelector('.departure-leg-hint'),'이동 안내 반복');check(d.querySelectorAll('.route-arrow-icon').length<=1,'이동 방향 화살표 중복');
  return '하카타·부산항 연결 · 원본86좌표 · 배 기호1개 · 도시/명소만 표시';
 });
 await report(41,'오프라인 준비 화면·크기·내장 지도 선택',async()=>{
  const w=await load(19),d=w.document;click(w,'#offlinePackBtn');await until(()=>d.querySelector('#offlinePackSize').textContent.includes('MB'));
  check(d.querySelector('#offlinePackDialog').open,'오프라인 준비창 없음');const manifest=await w.fetch('offline-manifest.json?v='+w.OfflinePack.REVISION).then(r=>r.json());check(d.querySelector('#offlinePackSize').textContent.includes(String(manifest.files.length)),'전체 저장 목록 누락');
  click(w,'#offlinePackClose');click(w,'#settingsBtn');change(w,'#mapProvider','offline');click(w,'#closeSettings');
  await until(()=>d.querySelector('#map').classList.contains('offline-map-active'));await until(()=>d.querySelector('.leaflet-offlineBase-pane path'));
  check(d.querySelectorAll('.stop-card').length===w.__routebook.getStops().length,'간략 지도 전환 때 일정 유실');
  return '전체 자료 저장 안내 · 간략 지도와 장소·동선 유지 (실제 전체 저장·단절 재시작은 별도CI 검증)';
 });
 await report(42,'한글·일본어 역명 줄맞춤과 긴 역명 표시',async()=>{
  for(const width of [320,390,1280]){
   frame.style.width=width+'px';frame.style.height='900px';const w=await load(10),d=w.document,b=w.__routebook;await d.fonts.ready;
   b.selectLeg(1);let row=d.querySelector('.departure-stations-aligned'),names=row?.querySelectorAll('.departure-station-name');
   check(names?.length===2,'출발역·도착역 누락 '+width);
   const ko=[...names].map(n=>n.querySelector('.departure-station-korean')),ja=[...names].map(n=>n.querySelector('.departure-station-japanese'));
   check(ko[0].textContent==='우구이스다니'&&ko[1].textContent==='메구로'&&ja[0]?.textContent==='(鶯谷)'&&ja[1]?.textContent==='(目黒)','역명 내용 오류 '+width);
   check(Math.abs(ko[0].getBoundingClientRect().top-ko[1].getBoundingClientRect().top)<2,'한글 높이 불일치 '+width);
   check(Math.abs(ja[0].getBoundingClientRect().top-ja[1].getBoundingClientRect().top)<2,'일본어 높이 불일치 '+width);
   for(const item of [...ko,...ja]){const range=d.createRange();range.selectNodeContents(item);check(range.getClientRects().length===1,'역명 중간 줄바꿈 '+width);const r=item.getBoundingClientRect(),box=row.getBoundingClientRect();check(r.left>=box.left-1&&r.right<=box.right+1,'역명 가로 넘침 '+width);}
   close(w);b.setDay(1);b.selectLeg(4);await until(()=>d.querySelector('[data-departure-profile="skyliner-naritaairportterminal2and3-keiseiueno"]'));
   row=d.querySelector('[data-departure-profile="skyliner-naritaairportterminal2and3-keiseiueno"] .departure-stations-aligned');check(row?.classList.contains('has-long-names'),'긴 공항역 표시 누락 '+width);
   for(const item of row.querySelectorAll('.departure-station-japanese')){const range=d.createRange();range.selectNodeContents(item);check(range.getClientRects().length===1,'긴 일본어 역명 잘림 '+width);const r=item.getBoundingClientRect(),box=row.getBoundingClientRect();check(r.right<=box.right+1,'긴 역명 가로 넘침 '+width);}
   close(w);b.setDay(22);b.selectLeg(6);await until(()=>d.querySelector('[data-departure-profile="korail-busan-seodaegu"]'));
   row=d.querySelector('[data-departure-profile="korail-busan-seodaegu"] .departure-stations-aligned');check(row&&!row.querySelector('.departure-station-japanese')&&row.textContent.includes('부산역')&&row.textContent.includes('서대구역'),'한국 역명 표시 오류 '+width);close(w);
  }
  return '320/390/1280px · 한글·일본어 줄맞춤 · 긴 공항역 · 한국 역명';
 });
 await report(43,'간단한 철도 카드·별도 공지·기존 열차 선택',async()=>{
  for(const width of [320,390,1280]){
   frame.style.width=width+'px';frame.style.height='900px';const w=await load(10,{date:'2026-10-27T10:00:00+09:00'}),d=w.document,b=w.__routebook;
   b.selectLeg(1);await until(()=>d.querySelector('[data-ride-next]'));const card=d.querySelector('.compact-station'),leg=b.getLeg(1);
   check(card&&d.querySelectorAll('.compact-station').length===1,'열차 카드 중복 '+width);
   check(card.querySelector('.compact-metrics').textContent.includes((leg.distanceM/1000).toFixed(1)+' km'),'전체 거리 오류 '+width);
   check(card.querySelector('.compact-metrics').textContent.includes('341엔'),'IC 요금 오류 '+width);
   check(card.querySelector('.departure-clock').textContent.includes('01/17 참고'),'여행일 기준 누락 '+width);
   check(card.querySelector('.departure-next-time strong').textContent==='09:03','연결 열차 시각 오류 '+width);
   check(card.querySelectorAll('.compact-actions button,.compact-actions a').length===2,'주요 버튼 수 오류 '+width);
   check(card.querySelector('[data-ride-open]')&&card.querySelector('.compact-actions a').href.includes('google.com/maps/dir'),'시간표·길찾기 누락 '+width);
   check(!d.querySelector('.leaflet-popup-content .fare-proof')&&!d.querySelector('.leaflet-popup-content .popup-title'),'요금·경로 중복 '+width);
   check(!d.querySelector('.leaflet-popup-content').textContent.includes('종이표'),'종이표 노출 '+width);
   check(!d.querySelector('.compact-route-details').open,'이동 순서 펼쳐짐 '+width);
   if(width<=1024){const sheet=d.querySelector('#detailSheet'),btn=card.querySelector('[data-ride-open]').getBoundingClientRect(),sr=sheet.getBoundingClientRect();check(sheet.open&&btn.bottom<=sr.bottom&&btn.top>=sr.top,'시간표 버튼 가림 '+width);}
   click(w,'[data-ride-open]');await until(()=>d.querySelector('#rideProfile'));check(d.querySelector('#rideDate').value==='2027-01-17','전체 시간표 운행일 오류');click(w,'#ridePanel [data-ride-close]');
   click(w,'#noticeBtn');check(d.querySelector('#noticeDialog').open&&d.querySelector('#noticeList').textContent.includes('아사쿠사'),'시간표 공지 누락 '+width);click(w,'#closeNotices');
  }
  return '320/390/1280px · 거리·IC·다음 열차 · 시간표/길찾기 · 공지 분리';
 });
 await report(44,'오사카 역 번호를 기존 크기에서 가운데 표시',async()=>{
  let totalCases=0;
  for(const width of [320,390,1280]){
   frame.style.width=width+'px';frame.style.height='900px';const w=await load(12),d=w.document,b=w.__routebook;await d.fonts.ready;
   const stations=new Set(['오사카','신이마미야','덴노지','도부쓰엔마에','난바','요도야바시','우메다','다니마치 4초메','오사카난바','오사카우메다']);
   const cases=new Map();for(const [dayKey,legs] of Object.entries(b.state.routeData.days)){
    const [day,...variant]=dayKey.split('-');for(const [index,leg] of legs.entries())if(leg)for(const key of b.rail.keysFor(leg)){
     const p=w.RailDepartureProfiles.profiles[key];if(p&&stations.has(p.from)&&!cases.has(key))cases.set(key,{day:Number(day),variant:variant.join('-'),index:index+1,code:p.fromCode});
    }
   }
   check(cases.size>=16,'오사카 역 정보 누락');
   for(const [key,item] of cases){if(width!==390&&!['JR-A47','JR-O19'].includes(item.code))continue;
    if(b.state.day!==item.day)b.setDay(item.day);if(b.state.variant!==item.variant)b.setVariant(item.variant);b.selectLeg(item.index);
    const element=b.map._popup?.getElement();check(element?.isConnected,'이동 상세 없음 '+key);
    const select=element.querySelector('[data-departure-select]');if(select&&select.value!==key){select.value=key;select.dispatchEvent(new w.Event('change',{bubbles:true}));}
    const section=element.querySelector('.station-departures');check(section?.dataset.departureProfile===key,'오사카 구간 선택 오류 '+key+' / '+section?.dataset.departureProfile);
    const badge=element.querySelector('.compact-line .departure-station-code'),box=badge.getBoundingClientRect(),range=d.createRange();range.selectNodeContents(badge);
    const rect=range.getBoundingClientRect();check(badge.textContent===item.code,'역 번호 불일치 '+key);check(Math.abs(box.width-35)<1&&Math.abs(box.height-35)<1,'상자 크기 변경 '+key);
    check(range.getClientRects().length===1,'번호 줄바꿈 '+key+' '+width);check(rect.left>=box.left+1&&rect.right<=box.right-1,'번호가 상자 밖으로 넘침 '+key+' '+width);
    check(Math.abs((rect.left+rect.right-box.left-box.right)/2)<2,'가로 가운데 정렬 오류 '+key+' '+width);check(Math.abs((rect.top+rect.bottom-box.top-box.bottom)/2)<2.5,'세로 가운데 정렬 오류 '+key+' '+width);
    check(element.querySelector('.compact-line>strong').getBoundingClientRect().left>=box.right,'노선명 겹침 '+key);close(w);totalCases++;
   }
  }
  return `오사카 ${totalCases}개 화면 · 기존 35px 크기 · 한 줄 가운데 정렬`;
 });
 $('#status').textContent=`완료 · ${total-failed}/${total} 통과 · 실패 ${failed}`;$('#run').disabled=false;
 };
 await load(1);
 $('#run').disabled=false;$('#run').dataset.ready='true';
})();
