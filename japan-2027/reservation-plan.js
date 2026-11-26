'use strict';
// Derive booking dates from the active itinerary instead of maintaining a
// second independent calendar. User completion records keep their stable keys.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ReservationPlan=api;})(globalThis,function(){
 const date=day=>day.date.split('/').map(Number).join('/');
 function saleOpening(day,start,hour){
  const [startYear,startMonth]=start.split('-').map(Number);
  const [month,dayOfMonth]=day.date.split('/').map(Number);
  const year=startYear+Number(month<startMonth);
  const monthEnd=new Date(Date.UTC(year,month-1,0)).getUTCDate();
  const opening=dayOfMonth<=monthEnd
   ?new Date(Date.UTC(year,month-2,dayOfMonth))
   :new Date(Date.UTC(year,month-1,1));
  const time=String(hour).padStart(2,'0')+':00';
  return [opening.toISOString().slice(0,10)+'T'+time+':00+09:00',
   (opening.getUTCMonth()+1)+'/'+opening.getUTCDate()+' '+time+' · 지정석 발매 기준 (일본 시각)'];
 }

 function build(context,legacy){
  const days=context.days||[],find=key=>{for(const day of days)for(const variant of day.variants||[])for(const stop of variant.stops||[])if(stop.planKey===key)return {day,variant,stop};return null;};
  const copy=key=>{const r=legacy.find(i=>i.key===key);return r?structuredClone(r):null;};
  const items=[],push=x=>{if(x)items.push(x);};
  const anchor=(item,key)=>{if(!item)return null;const p=find(key);return p?{...item,day:p.day.n,variant:p.variant.id,stop:p.stop.name,date:date(p.day)+' · '+p.stop.time,stopKey:undefined}:null;};
  const outbound=days.find(day=>day.n===1)?.travelBookings;
  if(outbound?.length)items.push(...outbound);else push(copy('flight-tokyo'));
  push(copy('hotel-tokyo'));
  const ibuki=anchor(copy('ibuki'),'ibuki');if(ibuki){ibuki.date=date(days.find(d=>d.n===ibuki.day))+' · '+find('ibuki').stop.time+' 목표';ibuki.details=['1인 좌석·코스·음료와 세금·서비스료·취소 조건을 공식 예약 화면에서 확인하세요.','일정 시각은 목표이며 예약 완료를 뜻하지 않습니다.'];push(ibuki);}
  const firstDome=find('domeBags')||find('dome'),checkout=find('domeCheckout');
  if(firstDome&&checkout)push({key:'hotel-dome',group:'travel',kind:'필수',name:'도쿄 돔 호텔 · 3박',day:firstDome.day.n,variant:firstDome.variant.id,stop:firstDome.stop.name,date:date(firstDome.day)+' 체크인 → '+date(checkout.day)+' 체크아웃',note:'예약·결제 상태·오전 짐 보관 확인',url:'https://www.tokyodome-hotels.co.jp/',details:['예약 상품의 체크인·체크아웃 시각을 확인하세요.','체크인 전·체크아웃 후 짐 보관을 확인하세요. 예약 완료로 자동 처리하지 않습니다.']});
  items.push(...days.filter(day=>day.n!==1).flatMap(day=>day.travelBookings||[]));
  const last=days.find(d=>d.pendingReturn&&!d.travelBookings?.length);if(last)push({key:'flight-return-tokyo',group:'travel',kind:'필수',name:date(last)+' 저녁 한국 귀국 항공권 · 미정',day:last.n,date:date(last)+' 저녁 예정 · 편명·공항 미정',note:'출발 공항·편명·시각·수하물 확정 필요',details:['하네다·나리타 중 실제 예약한 공항과 터미널을 확인하세요.','현재 비행편·출발·도착 시각은 미정입니다. 예약 완료로 자동 처리하지 않습니다.']});
  const twelveDay=days.length===12;
  const start=context.metadata?.start||'2027-01-08';
  const fuji=find('fujiStation');
  if(fuji){
   const opening=saleOpening(fuji.day,start,10);
   const trips=twelveDay&&date(fuji.day)==='1/12'
    ?['가는 편 · 후지회유 11호, 신주쿠 09:30 → 가와구치코 11:28.','돌아오는 편 · 후지회유 44호, 가와구치코 16:48 → 신주쿠 18:48.']
    :[];
   push({
    key:'fuji-excursion',group:'rail',kind:'사전 예매 권장',name:'후지회유 왕복 지정석',
    day:fuji.day.n,variant:fuji.variant.id,stop:fuji.stop.name,date:date(fuji.day)+' · 신주쿠 ↔ 가와구치코',
    note:'전 좌석 지정석 · JR 동일본 에키넷에서 왕복 2편 예매',
    url:'https://www.eki-net.com/en/jreast-train-reservation/Top/Index',
    source:'https://www.jreast.co.jp/kippu/02.html',
    details:[opening[1]+' · JR 일반 발매는 승차 한 달 전 10:00입니다.',...trips,
     '왕복 각각 신주쿠–가와구치코 전 구간의 승차권과 특급권을 확인하세요. 실제 운행편과 좌석은 예매 화면에서 확인하세요.'],
    milestones:[opening]
   });
  }
  const nikko=find('nikkoStation');
  if(nikko){
   const opening=saleOpening(nikko.day,start,9);
   const trips=twelveDay
    ?['가는 편 · 스페이시아 X 3호, 기타센주 09:13 → 도부닛코 10:50.','돌아오는 편 · 스페이시아 X 12호, 도부닛코 17:44 → 기타센주 19:21.']
    :['가는 편 · 기타센주 → 도부닛코 리버티 게곤.','돌아오는 편 · 도부닛코 → 시모이마이치 일반열차, 시모이마이치 → 기타센주 스페이시아 X.'];
   push({
    key:'nikko-express',group:'rail',kind:'사전 예매 권장',name:'닛코 특급 왕복 지정석',
    day:nikko.day.n,variant:nikko.variant.id,stop:nikko.stop.name,
    date:date(nikko.day)+' · 기타센주 ↔ 도부닛코',
    note:twelveDay?'전 좌석 지정석 · 도부 철도에서 스페이시아 X 3호·12호 예매':'도부 철도에서 리버티·스페이시아 X 지정석 예매',
    url:'https://tobu-japantrip-tickets.com/',
    source:'https://www.tobu.co.jp/en/express_info/purchase/?version=en',
    details:[opening[1]+' · 도부 특급 발매는 승차 한 달 전 09:00입니다.',...trips,
     '왕복 특급권에서 스탠더드 좌석을 선택하세요. 기본 운임도 별도로 필요하며, 실제 운행편과 좌석은 예매 화면에서 확인하세요.'],
    milestones:[opening]
   });
  }
  if(find('free')){const show=copy('zutomayo');if(show){const free=find('free');push({...show,day:free.day.n,variant:'concert',kind:'선택',date:date(free.day)+' · 공연 가능일',note:'티켓·공연 확정 시에만 일정 추가',stopKey:undefined,details:[...show.details,'현재 일정은 자유시간이며 공연장 이동·관람을 확정하지 않았습니다.']});}}
  return items;
 }
 function onSite({days=[],metadata}){
  if(metadata?.id!=='tokyo-20270108-19'||days.length!==12)return [];
  const entries=[];
  const add=(key,name,note,url)=>{
   const day=days.find(d=>d.variants.some(v=>v.stops.some(s=>s.planKey===key||s.name===key)));
   if(day)entries.push({name,date:date(day),note,url});
  };
  add('공항제2빌딩역','나리타 스카이라이너','전 좌석 지정석. 입국 수속 후 나리타 제2터미널 지하 1층 게이세이 창구에서 게이세이우에노행 좌석을 사세요. TOURIST PASMO도 같은 층 안내센터에서 살 수 있어요.','https://www.keisei.co.jp/keisei/tetudou/skyliner/us/skyliner/purchase.php');
  entries.push({name:'도쿄 시내 일반 열차·지하철',note:'야마노테선·주오선 쾌속·도쿄메트로·유리카모메·도쿄 모노레일 등은 좌석 예약 없이 PASMO나 Suica로 타면 돼요.',url:'https://www.pasmo.co.jp/visitors/en/'});
  add('poni','포니피리카 저녁','일정의 일요일에는 예약을 받지 않아 현장에서 줄을 서면 돼요.','https://tabelog.com/tokyo/A1318/A131802/13164953/');
  add('gyoen','신주쿠교엔','1월 일반 방문은 현장 입장권을 살 수 있어요.','https://policies.env.go.jp/national-garden/shinjukugyoen/english/guide/information/');
  add('oishi','가와구치코 레드라인 버스','일반 노선버스라 좌석 예약 없이 정류장에서 탑승해요.','https://bus.fujikyu.co.jp/en/fujitour/kawaguchiko/');
  add('ropeway','가와구치코 파노라마 로프웨이','개인 탑승은 현장에서 표를 사고 대기해요.','https://www.mtfujiropeway.jp/guide/');
  add('toyosu','도요스 시장 일반 견학','일반 견학 통로는 예약 없이 방문할 수 있어요.','https://www.shijou.metro.tokyo.lg.jp/ja/info/0/kenngaku/kenngaku1');
  add('nikkoStation','닛코 주젠지온센 방면 버스','일반 도부 노선버스는 지정석 없이 정류장에서 탑승해요.','https://www.tobu.co.jp/en/access/nikko/bus_nikko.html?version=en');
  add('kegon','게곤폭포 엘리베이터','현장에서 표를 살 수 있어요.','https://www.kegon.jp/info/');
  add('hamarikyu','하마리큐 은사정원','일반 입장권은 현장에서 살 수 있어요.','https://www.tokyo-park.or.jp/park/hama-rikyu/');
  return entries;
 }
 return {build,onSite};
});
