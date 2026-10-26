'use strict';
(async()=>{
 const $=s=>document.querySelector(s),frame=$('#app'),results=$('#results');let total=0,failed=0;
 window.stateQA={storage:new Map(),clock:null,delayFile:null};
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const until=async(fn)=>{for(let n=0;n<100;n++){if(fn())return;await sleep(100);}throw new Error('화면 갱신 제한시간 초과');};
 const check=(v,m)=>{if(!v)throw new Error(m);};
 const result=(name,pass,detail='')=>{total++;if(!pass)failed++;const li=document.createElement('li');li.className=pass?'pass':'fail';li.textContent=(pass?'PASS · ':'FAIL · ')+name;const small=document.createElement('small');small.textContent=detail;li.append(small);results.append(li);$('#status').textContent=`${total-failed}/${total} 통과 · 실패 ${failed}`;};
 const files=await Promise.all(['tokyo-routes.json','west-routes.json'].map(f=>fetch('../'+f).then(r=>r.json()))),routeDays={...files[0].days,...files[1].days};
 const load=async(day=1)=>{window.stateQA.storage.clear();await new Promise(resolve=>{frame.onload=resolve;frame.src='state-fixture.html?day='+day+'&qa='+Date.now();});await until(()=>frame.contentDocument?.querySelector('#ridePanel'));const w=frame.contentWindow;w.ItineraryDrawer.open({focus:false});return w;};
 const click=(w,s)=>{const el=w.document.querySelector(s);check(el,'버튼 없음 '+s);el.click();};
 const change=(w,s,value)=>{const el=w.document.querySelector(s);check(el,'입력 없음 '+s);el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));};
 const record=async(name,fn)=>{try{result(name,true,await fn());}catch(e){result(name,false,e.message);}};
 $('#mobile').onclick=()=>frame.width=390;$('#desktop').onclick=()=>frame.width=1180;
 $('#run').onclick=async()=>{
  $('#run').disabled=true;total=failed=0;results.textContent='';
  try{
   const pure=await runAccuracyCases({Fare:FareCore,Departure:DepartureCore,Ride:RideCore,Location:RouteMatch,manifest:RailDepartureProfiles,routeDays});pure.forEach(r=>result(r.name,r.pass,r.detail));
   for(const width of [1180,390]){
    frame.width=width;const label=width===390?'모바일 390px':'데스크톱 1180px';
    await record(label+' · 1 패스/전체 여정 + 항공 재생',async()=>{
     const w=await load(1),d=w.document;d.querySelector('.day-tools').open=true;const box=d.querySelector('#passToggle');box.checked=true;box.dispatchEvent(new w.Event('change',{bubbles:true}));
     check(d.querySelector('[data-leg="2"]').textContent.includes('311,300원'),'항공료 0 또는 통화 오류');click(w,'[data-leg="2"]');await until(()=>d.querySelector('[data-flight-replay]'));check(d.querySelector('.travel-fare').textContent.includes('311,300원'),'팝업 항공료 오류');click(w,'[data-flight-replay]');await until(()=>d.querySelector('[data-flight-state]')?.textContent.includes('재생 중'));click(w,'[data-flight-pause]');check(d.querySelector('[data-flight-state]').textContent.includes('멈춤'),'항공 일시정지 실패');click(w,'[data-flight-pause]');check(d.querySelector('[data-flight-state]').textContent.includes('재생 중'),'항공 재개 실패');click(w,'[data-flight-restart]');check(d.querySelector('[data-flight-percent]').textContent==='0%','항공 처음부터 실패');click(w,'[data-flight-stop]');click(w,'#overviewView');
     const expected=[['TW251','311,300원'],['JAL','12,090엔'],['ANA','9,120엔'],['뉴 카멜리아','19,900엔']];
     for(const [title,amount] of expected){const control=[...d.querySelectorAll('.rail-map-symbol')].find(el=>(el.getAttribute('aria-label')||'').includes(title));check(control,'전체 여정 항로 버튼 없음 '+title);control.click();await until(()=>d.querySelector('.travel-fare')?.textContent.includes(amount));check(d.querySelector('.travel-fare').textContent.includes(amount),'전체 여정 금액 오류 '+title);}
     return 'KRW/JPY 원액 유지 · 재생/일시정지/종료 정상';
    });
    await record(label+' · 2 역 확인 후 지연 UI',async()=>{
     const w=await load(1),d=w.document;let now=Date.parse('2027-01-08T08:24:00+09:00');w.Date.now=()=>now;click(w,'#rideToggle');await until(()=>d.querySelector('#rideProfile'));change(w,'#rideProfile','skyliner-naritaairportterminal2and3-keiseiueno');change(w,'#rideDate','2027-01-08');await until(()=>d.querySelector('[data-ride-board]'));click(w,'[data-ride-board="0"]');await until(()=>d.querySelector('[data-ride-confirm="1"]'));click(w,'[data-ride-confirm="1"]');now+=60000;d.querySelector('.ride-correction').open=true;d.querySelector('#rideDelay').value='30';d.querySelector('#rideDelayForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
     check(d.querySelector('#ridePosition').textContent.includes('닛뽀리역 확인 완료'),'확인한 역으로 고정되지 않음');check(d.querySelector('#ridePosition').textContent.includes('이후 위치 확인 필요'),'불확실 상태 누락');return d.querySelector('#ridePosition').textContent;
    });
    await record(label+' · 3 팝업 유지 중 JST 자정 재렌더',async()=>{
     const w=await load(1),d=w.document;let now=Date.parse('2027-01-08T23:59:00+09:00');w.Date.now=()=>now;const original=w.fetch.bind(w),key='metro-ueno-iriya';
     w.fetch=(url,options)=>String(url).startsWith('timetables/'+key+'.json')?Promise.resolve(new w.Response(JSON.stringify({schemaVersion:2,profiles:{[key]:{Weekday:[{id:'midnight-fixture',departure:'07:30',destinationArrival:'07:40'}],SaturdayHoliday:[{id:'midnight-fixture',departure:'07:30',destinationArrival:'07:40'}]}}}),{status:200,headers:{'Content-Type':'application/json'}})):original(url,options);
     click(w,'[data-leg="6"]');await until(()=>d.querySelector('.departure-next-time strong'));const before=d.querySelector('.departure-next-time strong').textContent;check(before==='내일 07:30','자정 전 재현 실패 '+before);now=Date.parse('2027-01-09T07:00:00+09:00');await until(()=>d.querySelector('.departure-next-time strong')?.textContent==='07:30');const journey=d.querySelector('.departure-journey').textContent;check(!journey.includes('내일'),'도착 문구 내일 잔류');$('#popupProof').textContent=label+' · '+before+' → '+d.querySelector('.departure-next-time strong').textContent+' / '+journey;return '같은 열차·팝업 유지 · 출발/도착/탑승 버튼 재렌더';
    });
    await record(label+' · 4 선택 열차 운행일 지도 연결',async()=>{
     const w=await load(1),d=w.document;click(w,'#rideToggle');await until(()=>d.querySelector('#rideProfile'));change(w,'#rideProfile','metro-iriya-ueno');change(w,'#rideDate','2027-01-14');await until(()=>d.querySelector('[data-ride-board]'));click(w,'[data-ride-board="0"]');await until(()=>d.querySelector('[data-ride-map]'));click(w,'[data-ride-map]');check(new URL(w.location.href).searchParams.get('day')==='7','선택 운행일과 다른 날짜 지도');return '1/14 열차 → DAY 07 (1/14)';
    });
    await record(label+' · 5 아사쿠사 카드·팝업·열차 선택 차단',async()=>{
     const w=await load(2),d=w.document;check(d.querySelector('#stopList .timetable-warning')?.textContent.includes('갱신 필요'),'일정 카드 경고 누락');const warning=d.querySelector('#stopList .timetable-warning'),leg=warning&&d.querySelector('[data-leg="'+warning.dataset.warningLeg+'"]');check(leg,'아사쿠사 카드 없음');leg.click();await until(()=>d.querySelector('.station-departures'));check(d.querySelector('.station-departures .timetable-warning')?.textContent.includes('갱신 필요'),'팝업 경고 누락');check(!d.querySelector('[data-ride-next]'),'유효하지 않은 열차 탑승 노출');click(w,'[data-ride-open]');await until(()=>d.querySelector('#rideTrainList')?.textContent.includes('갱신 필요'));return '카드·팝업·선택 목록 모두 갱신 필요 표시';
    });
    await record(label+' · 6 GPS 중복 경로 보류·수동 선택',async()=>{
     const w=await load(1),d=w.document,segments=RouteMatch.build(routeDays['1-main']);let fixture=null;
     for(const s of segments){const p=[(s.a[0]+s.b[0])/2,(s.a[1]+s.b[1])/2],r=RouteMatch.resolve(p,segments,{accuracy:10});if(r.ambiguous&&r.candidates.every(c=>c.distanceM<40)){fixture={p,r};break;}}
     check(fixture,'실제 일정 중복 좌표 없음');let callback;Object.defineProperty(w,'isSecureContext',{configurable:true,value:true});Object.defineProperty(w.navigator,'geolocation',{configurable:true,value:{watchPosition(fn){callback=fn;return 1;},clearWatch(){}}});click(w,'#locationBtn');check(callback,'GPS 시작 실패');callback({coords:{latitude:fixture.p[0],longitude:fixture.p[1],accuracy:10,heading:null,speed:0},timestamp:w.Date.now()});check(d.querySelector('#locationStatus').textContent.includes('현재 구간'),'중복선 임의 선택');check(!d.querySelector('#locationNext').textContent.includes('km'),'불확실 남은 거리 노출');change(w,'#locationLeg',String(fixture.r.candidates[0].legIndex));check(!d.querySelector('#locationStatus').textContent.includes('현재 구간'),'수동 선택 미반영');return '합성 GPS를 실제 하루 경로에 입력 · 자동 보류 후 직접 선택';
    });
    await record(label+' · 회귀 22일 일정 렌더링',async()=>{
     const w=await load(1),d=w.document;
     for(let day=1;day<=22;day++){const buttons=[...d.querySelectorAll('#dayList button')];buttons[day-1].click();check(d.querySelector('#stopList').children.length>0,'빈 일정 DAY '+day);check(d.querySelector('#dayHeader').textContent.includes('DAY '+String(day).padStart(2,'0')),'날짜 렌더 오류 DAY '+day);}
     return '22일 모두 카드·지도·날짜 전환 정상';
    });
   }
  }catch(e){result('검증 실행',false,e.message);}finally{$('#run').disabled=false;$('#status').dataset.complete='true';}
 };
 $('#run').disabled=false;$('#run').dataset.ready='true';
})();
