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
 const krw=value=>value.toLocaleString('ko-KR')+'원';
 function orderDetails(day,recommendation){
  const orders=(day.railOrders||[]).filter(o=>o.date===day.date);
  if(!orders.length)return null;
  const total=orders.reduce((sum,order)=>sum+order.shownKrw,0);
  return {
   kind:'공식 판매 대기 중',url:orders[0].source,
   orderSelection:JSON.stringify(orders.map(({date,service,departure,arrival,seat})=>[date,service,departure.time,arrival.time,seat])),
   note:`왕복 ${orders.length}편 신청 · 결제 화면 합계 ${krw(total)} · 발권 대기`,
   trips:orders.map(({service,departure,arrival,seat,shownKrw},index)=>
    `${index===0?'가는 편':'돌아오는 편'} · ${service} · ${departure.station} ${departure.time} → ${arrival.station} ${arrival.time} · ${seat} · 결제 화면 ${krw(shownKrw)}.`+
    (departure.platform?` 신청 화면의 출발 승강장 ${departure.platform}번.`:'')),
   instructions:['판매가 열리면 신청처의 발권 완료 메일과 좌석 정보를 확인하세요. 왕복 두 편 모두 발권을 확인한 뒤 완료로 체크하세요.',recommendation]
  };
 }

 function build(context,legacy){
  const days=context.days||[],find=key=>{for(const day of days)for(const variant of day.variants||[])for(const stop of variant.stops||[])if(stop.planKey===key)return {day,variant,stop};return null;};
  const copy=key=>{const r=legacy.find(i=>i.key===key);return r?structuredClone(r):null;};
  const items=[],push=x=>{if(x)items.push(x);};
  const anchor=(item,key)=>{if(!item)return null;const p=find(key);return p?{...item,day:p.day.n,variant:p.variant.id,stop:p.stop.name,date:date(p.day)+' · '+p.stop.time,stopKey:undefined}:null;};
  const departure=days.find(day=>day.n===1),outbound=departure?.travelBookings;
  if(departure){
   const [,returnMonth,returnDay]=(context.metadata?.returnDate||'').split('-').map(Number);
   const coverageDates=returnMonth&&returnDay?' · '+date(departure)+'~'+returnMonth+'/'+returnDay:'';
   items.push({
    key:'travel-insurance',group:'prep',kind:'가입 확인',name:'해외여행자 보험',day:departure.n,
    date:'출국 전'+coverageDates,note:'출국 전에 가입하고 한국 귀국까지 보장되는지 확인',
    url:'https://e-insmarket.or.kr/',
    source:'https://www.0404.go.kr/bbs/bbsPst/MST0000000000026/ATC0000000047498/detail',
    details:['보험 시작·종료 시각을 실제 출발과 귀국 일정에 맞추고, 해외 의료비 보장 한도와 제외 항목을 확인하세요.','가입증명서와 긴급지원 연락처를 휴대폰에 저장하세요.']
   },{
    key:'japan-travel-sim',group:'prep',kind:'구매·설치 확인',name:'일본 유심·eSIM',day:departure.n,
    date:date(departure)+' 일본 도착 전 준비',note:'기기 호환 여부와 여행 기간에 맞는 데이터 용량·유효기간 확인',
    url:'https://www.japan.travel/en/plan/wifi-and-connectivity/',
    source:'https://www.japan.travel/en/plan/airport-access/narita-airport/',
    details:['eSIM은 기기 지원 여부와 유효기간이 시작되는 조건을 확인한 뒤 판매처 안내에 따라 설치·활성화하세요.','실물 유심은 잠금이 해제된 휴대폰에서 사용할 수 있어요. 나리타 공항 도착층에서도 구매할 수 있어요.']
   });
   for(const variant of departure.variants||[]){
    const stationIndex=variant.stops.findIndex((stop,index)=>stop.name==='공항제2빌딩역'&&variant.stops[index+1]?.name==='게이세이우에노역');
    if(stationIndex<0)continue;
    items.push({
     key:'narita-skyliner-outbound',group:'rail',kind:'지정석 구매',name:'나리타 스카이라이너 편도',
     day:departure.n,variant:variant.id,leg:stationIndex+1,
     date:date(departure)+' · 나리타 T2 → 게이세이우에노',note:'전 좌석 지정석 · 공항 도착 후 나리타 제2터미널 지하 1층에서 구매 가능',
     url:'https://www.keisei.co.jp/keisei/tetudou/skyliner/us/skyliner/purchase.php',
     source:'https://www.keisei.co.jp/keisei/tetudou/skyliner/us/findus/skyliner.php',
     details:['입국 수속과 수하물 수령을 마치고 지하 1층 스카이라이너 매표소 또는 게이세이 안내센터에서 게이세이우에노행 좌석을 선택하세요.','온라인으로 먼저 구매했다면 구매 경로의 교환·좌석 지정 안내를 확인하세요. 승차권과 지정석이 준비되면 완료로 체크하세요.']
    });
    break;
   }
  }
  if(outbound?.length)items.push(...outbound);else push(copy('flight-tokyo'));
  push(copy('hotel-tokyo'));
  const ibuki=anchor(copy('ibuki'),'ibuki');if(ibuki){ibuki.date=date(days.find(d=>d.n===ibuki.day))+' · '+find('ibuki').stop.time+' 목표';ibuki.details=['1인 좌석·코스·음료와 세금·서비스료·취소 조건을 공식 예약 화면에서 확인하세요.','일정 시각은 목표이며 예약 완료를 뜻하지 않습니다.'];push(ibuki);}
  const skytree=anchor(copy('skytree'),'skytree');
  if(skytree){
   skytree.date=skytree.date.split(/[~-]/)[0]+' 입장 목표';
   skytree.note='일몰 무렵에 맞춰 덴보데크(350m) 시간 지정권 예매 권장';
   skytree.source='https://global-official-ticket.tokyo-skytree.jp/zt/faq';
   skytree.details=['공식 해외 판매처는 약 두 달 전부터 달력을 순차 오픈해요. 날짜와 덴보데크 입장 시각을 확인하세요.','덴보회랑(450m)은 선택 사항이에요. 공식 가격은 날짜에 따라 다르고 현장권은 잔여분에 한해 판매해요.'];
   push(skytree);
  }
  const firstDome=find('domeBags')||find('dome'),checkout=find('domeCheckout');
  if(firstDome&&checkout)push({key:'hotel-dome',group:'travel',kind:'필수',name:'도쿄 돔 호텔 · 3박',day:firstDome.day.n,variant:firstDome.variant.id,stop:firstDome.stop.name,date:date(firstDome.day)+' 체크인 → '+date(checkout.day)+' 체크아웃',note:'예약·결제 상태·오전 짐 보관 확인',url:'https://www.tokyodome-hotels.co.jp/',details:['예약 상품의 체크인·체크아웃 시각을 확인하세요.','체크인 전·체크아웃 후 짐 보관을 확인하세요. 예약 완료로 자동 처리하지 않습니다.']});
  items.push(...days.filter(day=>day.n!==1).flatMap(day=>day.travelBookings||[]));
  const last=days.find(d=>d.pendingReturn&&!d.travelBookings?.length);if(last)push({key:'flight-return-tokyo',group:'travel',kind:'필수',name:date(last)+' 저녁 한국 귀국 항공권 · 미정',day:last.n,date:date(last)+' 저녁 예정 · 편명·공항 미정',note:'출발 공항·편명·시각·수하물 확정 필요',details:['하네다·나리타 중 실제 예약한 공항과 터미널을 확인하세요.','현재 비행편·출발·도착 시각은 미정입니다. 예약 완료로 자동 처리하지 않습니다.']});
  const twelveDay=days.length===12;
  const start=context.metadata?.start||'2027-01-08';
  const fuji=find('fujiStation');
  if(fuji){
   const opening=saleOpening(fuji.day,start,10);
   const pending=orderDetails(fuji.day,'창가 좌석은 희망 사항이에요. 발권 메일에서 배정 좌석과 표 수령·탑승 방법을 확인하세요.');
   push({
    key:'fuji-excursion',group:'rail',kind:pending?.kind||'사전 예매 권장',name:'후지회유 왕복 지정석',
    day:fuji.day.n,variant:fuji.variant.id,stop:fuji.stop.name,date:date(fuji.day)+' · 신주쿠 ↔ 가와구치코',
    orderSelection:pending?.orderSelection,
    note:pending?.note||'전 좌석 지정석 · JR 동일본 에키넷에서 왕복 2편 예매',
    url:pending?.url||'https://www.eki-net.com/en/jreast-train-reservation/Top/Index',
    source:'https://www.jreast.co.jp/kippu/02.html',
    details:[opening[1],...(pending?.trips||[]),...(pending?.instructions||
     ['왕복 각각 신주쿠–가와구치코 전 구간의 승차권과 특급권을 확인하세요.'])],
    milestones:[opening]
   });
  }
  const nikko=find('nikkoStation');
  if(nikko){
   const opening=saleOpening(nikko.day,start,9);
   const visitsKegon=nikko.variant.stops.some(stop=>stop.planKey==='kegon');
   const pending=orderDetails(nikko.day,'특급권과 별도로 도부철도 기본 승차권이 필요해요.'+
    (visitsKegon?' 아래 주젠지·게곤폭포 프리패스에 기타센주↔도부닛코 기본 운임이 포함돼요.':''));
   const trips=pending?.trips||(twelveDay?[]:['가는 편 · 기타센주 → 도부닛코 리버티 게곤.','돌아오는 편 · 도부닛코 → 시모이마이치 일반열차, 시모이마이치 → 기타센주 스페이시아 X.']);
   push({
    key:'nikko-express',group:'rail',kind:pending?.kind||'사전 예매 권장',name:'닛코 특급 왕복 지정석',
    day:nikko.day.n,variant:nikko.variant.id,stop:nikko.stop.name,
    date:date(nikko.day)+' · 기타센주 ↔ 도부닛코',
    orderSelection:pending?.orderSelection,
    note:pending?.note||(twelveDay?'도부 철도에서 스페이시아 X 왕복 지정석 예매':'도부 철도에서 리버티·스페이시아 X 지정석 예매'),
    url:pending?.url||'https://tobu-japantrip-tickets.com/',
    source:'https://www.tobu.co.jp/en/express_info/purchase/?version=en',
    details:[opening[1],...trips,...(pending?.instructions||['기본 승차권과 특급권을 확인하고 좌석 종류를 선택하세요.'])],
    milestones:[opening]
   });
   if(visitsKegon)push({
    key:'nikko-maas-chuzenji-kegon',group:'rail',kind:'선택 구매',name:'도부 NIKKO MaaS · 주젠지·게곤폭포 디지털 프리패스',
    day:nikko.day.n,variant:nikko.variant.id,stop:nikko.stop.name,
    date:date(nikko.day)+' · 닛코·주젠지호',
    note:'기타센주 출발 성인 4,350엔 · 4일권 · 주젠지온센 버스 포함',
    url:'https://www.tobu-maas.jp/traffic-tickets/1562/details',
    source:'https://storage.userlocal.jp/chatbot/images/51426afe-1899-4498-b475-0e31648d8a6a.jpg',
    details:[
     '기타센주↔도부닛코 도부철도 기본 운임 왕복과 도부닛코역↔주젠지온센 버스가 포함돼요. 스페이시아 X 특급권은 별도로 필요해요.',
     '휴대폰에서 NIKKO MaaS를 열고 「デジタル中禅寺・華厳の滝フリーパス」의 출발역을 기타센주(北千住), 사용 시작일을 '+date(nikko.day)+'로 선택하세요.',
     '금액은 도부 공표 운임 기준이에요. 기타센주 출발과 결제 금액을 확인하고, 구매하면 완료로 체크하세요.'
    ]
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
  add('공항제2빌딩역','TOURIST PASMO','나리타 제2터미널 지하 1층 SKYLINER & KEISEI INFORMATION CENTER에서 살 수 있어요.','https://www.keisei.co.jp/keisei/tetudou/skyliner/us/findus/skyliner.php');
  entries.push({name:'도쿄 시내 일반 열차·지하철',note:'야마노테선·주오선 쾌속·도쿄메트로·유리카모메·도쿄 모노레일 등은 좌석 예약 없이 PASMO나 Suica로 타면 돼요.',url:'https://www.pasmo.co.jp/visitors/en/'});
  add('poni','포니피리카 저녁','일정의 일요일에는 예약을 받지 않아 현장에서 줄을 서면 돼요.','https://tabelog.com/tokyo/A1318/A131802/13164953/');
  add('gyoen','신주쿠교엔','1월 일반 방문은 현장 입장권을 살 수 있어요.','https://policies.env.go.jp/national-garden/shinjukugyoen/english/guide/information/');
  add('oishi','가와구치코 레드라인 버스','일반 노선버스라 좌석 예약 없이 정류장에서 탑승해요.','https://bus.fujikyu.co.jp/en/fujitour/kawaguchiko/');
  add('ropeway','가와구치코 파노라마 로프웨이','개인 탑승은 현장에서 표를 사고 대기해요.','https://www.mtfujiropeway.jp/guide/');
  add('toyosu','도요스 시장 일반 견학','일반 견학 통로는 예약 없이 방문할 수 있어요.','https://www.shijou.metro.tokyo.lg.jp/ja/info/0/kenngaku/kenngaku1');
  add('nikkoStation','닛코 주젠지온센 방면 버스','일반 도부 노선버스는 지정석 없이 정류장에서 탑승해요. 주젠지·게곤폭포 프리패스를 쓸 수 있고, 개별 승차는 겨울 공표 운임 기준 성인 편도 1,250엔이에요.','https://www.tobu-bus.com/pc/assets/pdf/nikko_rosen_winter_en.pdf?20261118=');
  add('kegon','게곤폭포 엘리베이터','현장에서 표를 살 수 있어요.','https://www.kegon.jp/info/');
  add('hamarikyu','하마리큐 은사정원','일반 입장권은 현장에서 살 수 있어요.','https://www.tokyo-park.or.jp/park/hama-rikyu/');
  add('mugitoro','아사쿠사 무기토로 점심','1층 평일 뷔페는 현장 선착순이에요. 당일 운영 공지를 확인하세요.','https://www.mugitoro.co.jp/en/reservation/');
  return entries;
 }
 return {build,onSite};
});
