'use strict';
// Reviewed adult OD fares, not geometry-distance estimates. Reverse ordinary fares
// use the same operator tariff. Never apply this registry to a different OD.
const checkedAt='2026-11-05';
const sources={
 metro:'https://www.tokyometro.jp/support/guide/operation/pdf/fare_202603.pdf',
 metroRules:'https://www.tokyometro.jp/ticket/types/regular/index.html',
 jr:'https://www.jreast.co.jp/2026unchin-kaitei/pamphlet/pageindices/index8.html',
 toei:'https://www.kotsu.metro.tokyo.jp/subway/fare/regular.html',
 yuri:'https://www.yurikamome.co.jp/company/news/b405570a69e5124744dcf7b90db48d69.pdf',
 tobu:'https://www.toburailway.cn/cms-pdf/news/20230308173821gOeil5pz8zABtXdhXxcI8g.pdf',
 minato:'https://www.mm21railway.co.jp/info/news/uploads/information_ticket_20230127.pdf',
 keio:'https://www.keio.co.jp/global/routes/stations/shibuya/',
 romance:'https://www.odakyu.jp/romancecar/charges/',
 mountain:'https://www.hakonenavi.jp/assets/file/hakone-tozan_fee_221001.pdf',
 mountainTimetable:'https://www.hakonenavi.jp/_wp/wp-content/uploads/2024/01/2023.pdf',
 ropeway:'https://www.hakonenavi.jp/transportation/ticket_info/fee/',
 nikko:'https://www.tobu.co.jp/pdf/transit_fare/spacia_nikko.pdf?20260326=',
 nikkoSeason:'https://www.tobu.co.jp/railway/special_express/transit_fare/seasonal_calendar.pdf?202609=',
 central:'https://www.jreast.co.jp/2026unchin-kaitei/pamphlet/pageindices/index11.html',
 enoden:'https://www.enoden.co.jp/en/tourism/access/'
};
const route=(a,b)=>'https://www.jorudan.co.jp/norikae/route/'+encodeURIComponent(a)+'_'+encodeURIComponent(b)+'.html';
const rows=[];
function add(operator,from,to,icYen,paperTicketYen,refs,basis='',extra={}){rows.push({operator,from,to,icYen,paperTicketYen,sources:refs,checkedAt,basis,...extra});}
for(const [a,b,ic,paper]of [['이리야','우에노',178,180],['이리야','아키하바라',178,180],['이리야','신바시',209,210],['이리야','긴자',209,210],['시부야','이리야',252,260],['이리야','기타센주',178,180],['고라쿠엔','메구로',209,210],['나카메구로','롯폰기',178,180]])add('TokyoMetro',a,b,ic,paper,[sources.metro,sources.metroRules],'메트로 역간 IC 운임표 · 메트로 내 환승은 한 번만 계산');
for(const [a,b,ic,paper,ja,jb]of [
 ['우에노','이케부쿠로',209,210,'上野','池袋'],['우에노','요코하마',616,620,'上野','横浜'],['사쿠라기초','우에노',616,620,'桜木町','上野'],
 ['아키하바라','기치조지',440,440,'秋葉原','吉祥寺'],['아키하바라','신주쿠',209,210,'秋葉原','新宿'],['우에노','하라주쿠',253,260,'上野','原宿'],
 ['하라주쿠','신주쿠',155,160,'原宿','新宿'],['신주쿠','시부야',199,200,'新宿','渋谷'],['아사쿠사바시','아키하바라',155,160,'浅草橋','秋葉原'],
 ['아키하바라','스이도바시',155,160,'秋葉原','水道橋'],['스이도바시','가마쿠라',1034,1040,'水道橋','鎌倉'],['스이도바시','도쿄',155,160,'水道橋','東京'],['아타미','기노미야',155,160,'熱海','来宮']
])add('JR-East',a,b,ic,paper,[sources.jr,route(ja,jb)],'2026-03-14 개정 IC 운임 · 개찰구를 나가지 않는 JR 환승은 통합 운임');
add('TobuTojo','이케부쿠로','가와고에',481,490,[sources.tobu,route('池袋','川越')],'도부 도조선 일반열차 · TJ라이너 별도 좌석요금 제외');
add('Minatomirai','요코하마','모토마치·주카가이',224,230,[sources.minato]);
add('Keio','시모키타자와','시부야',140,140,[sources.keio]);
add('Yurikamome','신바시','시조마에',388,390,[sources.yuri]);
add('Yurikamome','시조마에','다이바',325,330,[sources.yuri]);
add('Yurikamome','다이바','신바시',325,330,[sources.yuri]);
add('Toei','진보초','구라마에',178,180,[sources.toei,route('神保町','蔵前')],'바쿠로요코야마·히가시니혼바시 환승 · 통합 운임');
add('Toei','구라마에','아사쿠사바시',178,180,[sources.toei,route('蔵前','浅草橋')]);
add('Toei','롯폰기','가스가',272,280,[sources.toei,route('六本木','春日（東京）')],'도에이 대에도선 통합 운임 · 승차 방향과 환승은 현장 안내 확인');
add('Romancecar','신주쿠','하코네유모토',2461,2470,[sources.romance],'IC 승차운임 1,261 + 일반 특급권 1,200. 온라인 특급권은 1,150으로 50 절약. 예약·결제 미실행.',{baseIcYen:1261,reservedSurchargeYen:1200,ticketRequired:true,ticketLabel:'로망스카 일반 특급권 기준'});
add('HakoneTozan','하코네유모토','고라',460,460,[sources.mountain,sources.mountainTimetable]);
add('HakoneCable','고라','소운잔',430,430,[sources.mountain,sources.mountainTimetable],'케이블카 승차권 구입 기준',{ticketRequired:true,ticketLabel:'케이블카 별도 승차권 기준'});
add('HakoneRopeway','소운잔','오와쿠다니',3000,3000,[sources.ropeway],'왕복권 3,000을 올라가는 구간에서 한 번만 합산. 돌아오는 같은 구간은 0으로 중복 제외.',{ticketRequired:true,ticketLabel:'로프웨이 왕복권 · 한 번만 합산',sharedTicket:'hakone-ropeway-return'});
add('TobuNikko','기타센주','도부닛코',3043,3050,[sources.tobu,sources.nikko,sources.nikkoSeason],'2027-01-17은 공식 달력상 통상기. IC 기본 1,393 + 게곤·리버티 게곤 특급권 1,650. 스페시아 X·특별석 제외.',{baseIcYen:1393,reservedSurchargeYen:1650,ticketRequired:true,ticketLabel:'게곤·리버티 게곤 일반 지정석 기준',travelDate:'2027-01-17'});
add('JR-Central','도쿄','아타미',3740,3740,[sources.central,'https://ekitan.com/transit/fare/sf-2590/st-1506'],'일반 승차권 1,980 + 코다마·히카리 자유석 특급권 1,760. 재래선 운임과 다르며 IC 잔액만으로 신칸센 승차 불가. 도쿄에서 별도 티켓 구매 기준; 연결 재래선은 별도 IC 운임.',{baseTicketYen:1980,reservedSurchargeYen:1760,ticketRequired:true,ticketLabel:'신칸센 승차권 + 자유석 기준'});
add('Enoden','하세','가마쿠라',200,200,[sources.enoden]);
// Exact OD references reviewed for time-priority routes (2026-11-10).
for(const [a,b,ic,paper,ja,jb]of [
 ['신바시','아키하바라',199,200,'新橋','秋葉原'],['이케부쿠로','우구이스다니',209,210,'池袋','鶯谷'],
 ['우에노','기치조지',440,440,'上野','吉祥寺'],['우구이스다니','도쿄',199,200,'鶯谷','東京'],
 ['도쿄','아키하바라',155,160,'東京','秋葉原'],['우구이스다니','하라주쿠',253,260,'鶯谷','原宿'],
 ['하라주쿠','요요기',155,160,'原宿','代々木'],['하이지마','아키하바라',803,810,'拝島','秋葉原'],
 ['아사쿠사바시','모토야와타',253,260,'浅草橋','本八幡'],['바쿠로초','가마쿠라',1034,1040,'馬喰町','鎌倉']
])add('JR-East',a,b,ic,paper,[sources.jr,route(ja,jb)],'2026 개정 성인 IC 운임 · 같은 JR 개찰 내 환승은 통합',{checkedAt:'2026-11-10'});
for(const [a,b,ic,paper,ja,jb]of [
 ['이리야','도요스',209,210,'入谷（東京）','豊洲'],['히가시긴자','이리야',209,210,'東銀座','入谷（東京）'],
 ['이리야','아사쿠사',178,180,'入谷（東京）','浅草'],['닌교초','이리야',178,180,'人形町','入谷（東京）'],['롯폰기','히비야',178,180,'六本木','日比谷']
])add('TokyoMetro',a,b,ic,paper,[sources.metro,sources.metroRules,route(ja,jb)],'메트로 내 통합 운임 · 쓰키지–신토미초는 지정 환승 60분 이내',{checkedAt:'2026-11-10'});
for(const [a,b,ic,paper,ja,jb]of [
 ['이와모토초','신주쿠',220,220,'岩本町','新宿'],['이와모토초','진보초',178,180,'岩本町','神保町'],['구라마에','닌교초',178,180,'蔵前','人形町'],
 ['스이도바시','메구로',272,280,'水道橋','目黒'],['히비야','스이도바시',178,180,'日比谷','水道橋'],['스이도바시','바쿠로요코야마',178,180,'水道橋','馬喰横山']
])add('Toei',a,b,ic,paper,[sources.toei,route(ja,jb)],'도에이 내 통합 성인 IC 운임',{checkedAt:'2026-11-10'});
add('Yurikamome','도요스','시조마에',189,190,[sources.yuri],'성인 IC 편도',{checkedAt:'2026-11-10'});
add('TobuTojo','이케부쿠로','가와고에시',481,490,[sources.tobu,route('池袋','川越市')],'가와고에 특급은 일반 운임 · TJ라이너 제외',{checkedAt:'2026-11-10'});
add('Odakyu','시모키타자와','신주쿠',167,170,['https://www.odakyu.jp/ticket/about/index.html',route('下北沢','新宿')],'일반열차 IC 운임',{checkedAt:'2026-11-10'});
add('HakoneTozan','오다와라','하코네유모토',360,360,[sources.mountain],'일반열차 기본운임 · 로망스카 제외',{checkedAt:'2026-11-10'});
add('JR-Central','도쿄','오다와라',3280,3280,[sources.central,'https://ekitan.com/transit/shinkansen/section/sf-2590/st-1759'],'별도 승차권 1,520 + 코다마·히카리 자유석 1,760. 도쿄에서 별도 구입 기준; 연결 재래선 IC는 별도.',{baseTicketYen:1520,reservedSurchargeYen:1760,ticketRequired:true,ticketLabel:'신칸센 승차권 + 자유석 기준',checkedAt:'2026-11-10'});
add('Enoden','가마쿠라','유이가하마',200,200,['https://www.enoden.co.jp/tc/train/station/yuigahama/'],'성인 편도',{checkedAt:'2026-11-10'});
add('TokyoMetro','고라쿠엔','도쿄',178,180,[sources.metro,route('後楽園','東京')],'마루노우치선 통합 운임',{checkedAt:'2026-11-10'});
add('JR-East','도쿄','가마쿠라',1034,1040,[sources.jr,route('東京','鎌倉')],'2026 개정 IC 기본운임 · 그린차 제외',{checkedAt:'2026-11-10'});
add('TobuNikko','아사쿠사','도부닛코',3043,3050,[sources.tobu,sources.nikko,sources.nikkoSeason],'2027-01-17 통상기 · IC 기본 1,393 + 리버티 기누(시모이마이치까지) 특급권 1,650 + 일반열차 환승. 구간별 별도 특급권을 추가 구입하지 않는 계획.',{baseIcYen:1393,reservedSurchargeYen:1650,ticketRequired:true,ticketLabel:'리버티 기누 특급권 + 일반열차 연결',checkedAt:'2026-11-10'});

function operator(p){const id=p.lineId||'';if(/로망스카/.test(p.line||''))return 'Romancecar';if(id.startsWith('JR-East.'))return 'JR-East';if(id.startsWith('JR-Central.'))return 'JR-Central';if(id.startsWith('TokyoMetro.'))return 'TokyoMetro';if(id.startsWith('Toei.'))return 'Toei';if(id==='Tobu.Tojo')return 'TobuTojo';if(id.startsWith('Tobu.'))return 'TobuNikko';if(id==='OdakyuHakone.HakoneTozan')return 'HakoneTozan';if(id==='Hakone.Cable')return 'HakoneCable';if(id==='Hakone.Ropeway')return 'HakoneRopeway';return id.split('.')[0];}
function groups(parts){const out=[];for(const p of parts.filter(p=>['rail','metro'].includes(p.mode))){const op=operator(p),last=out.at(-1);if(last?.operator===op)last.parts.push(p);else out.push({operator:op,parts:[p]});}return out;}
function find(op,a,b){return rows.find(r=>r.operator===op&&(r.from===a&&r.to===b||r.from===b&&r.to===a));}
function apply(bundle){let updated=0;const missing=[];
 for(const [key,legs]of Object.entries(bundle.routes.days))for(const [index,leg]of legs.entries()){
  if(leg.fare?.displayBlank||leg.fare?.status!=='unverified')continue;
  const gs=groups(leg.parts);if(!gs.length||leg.parts.some(p=>!['rail','metro','walk','transfer'].includes(p.mode)))continue;
  const breakdown=gs.map(g=>{const a=g.parts[0],b=g.parts.at(-1),r=find(g.operator,a.from,b.to);if(!r||g.operator==='TobuNikko'&&g.parts.some(p=>/Spacia.?X|스페이시아.?X|スペーシア.?X/i.test(p.serviceName||'')))return null;
   const row={...r,from:a.from,to:b.to,fromJa:a.fromJa,toJa:b.toJa,lineIds:[...new Set(g.parts.map(p=>p.lineId))],currency:'JPY',status:'exact'};
   if(row.sharedTicket&&a.from==='오와쿠다니'){if(!legs.slice(0,index).some(l=>l.fare?.breakdown?.some(x=>x.sharedTicket===row.sharedTicket&&x.icYen===3000)))throw Error('Return fare needs its outbound round-trip ticket');Object.assign(row,{icYen:0,paperTicketYen:0,ticketLabel:'출발 구간에서 계산한 왕복권에 포함',basis:'같은 날 소운잔 출발 때 왕복권을 구매하는 계획 기준 · 왕복권 미구매 시 별도 편도권 2,000 필요'});}
   return row;
  });
  if(breakdown.some(x=>!x)){missing.push(key+'#'+index);continue;}
  // Apply the documented Metro–Toei IC transfer discount only at reviewed
  // interchanges used by this plan, within the 60-minute transfer allowance.
  for(let j=1;j<breakdown.length;j++){const a=breakdown[j-1],b=breakdown[j],pair=[a.operator,b.operator].sort().join('+'),join=[a.toJa,b.fromJa].sort().join('+');
   if(pair!=='Toei+TokyoMetro'||!['人形町+人形町','日比谷+日比谷','岩本町+秋葉原'].includes(join))continue;
   b.beforeTransferDiscountIcYen=b.icYen;b.transferDiscountYen=70;b.icYen-=70;b.paperTicketYen-=70;b.sources.push('https://www.kotsu.metro.tokyo.jp/subway/fare/discount.html');b.basis+=' · 메트로–도에이 지정 환승 할인 70 JP¥ 반영 (같은 IC 카드·60분 이내)';
  }
  const total=breakdown.reduce((s,r)=>s+r.icYen,0),paper=breakdown.reduce((s,r)=>s+r.paperTicketYen,0),covered=breakdown.filter(r=>['TokyoMetro','Toei'].includes(r.operator)).reduce((s,r)=>s+r.icYen,0);
  leg.fare={min:total,max:total,icYen:total,paperTicketYen:paper,currency:'JPY',status:'exact',label:total.toLocaleString('ko-KR')+' JP¥',checkedAt,confidence:'source-verified',basis:'성인 편도 · IC 운임 + 명시한 별도 티켓. 2027 변경 가능 · 패스 할인 미적용.',passEligible:covered===total,passExtraMin:total-covered,passExtraMax:total-covered,sources:[...new Set(breakdown.flatMap(r=>r.sources))],breakdown};updated++;
 }
 // The Nikko bus fare is separate from the Japanese railway subtotal. Its
 // C-route road geometry is kept separate from the pedestrian shrine approach.
 for(const index of [1,4]){const leg=bundle.routes.days['10-main'][index];if(!leg.parts.some(p=>p.mode==='bus'))throw Error('Nikko bus leg changed');leg.fare={min:350,max:350,icYen:350,paperTicketYen:350,currency:'JPY',status:'exact',label:'350 JP¥',checkedAt,passEligible:false,passExtraMin:350,passExtraMax:350,breakdown:[],sources:['https://www.tobu-bus.com/uploads/files/'+encodeURIComponent('日光運賃改定')+'.pdf','https://www.tobu-bus.com/pc/area/nikko/'],basis:'도부닛코역 ↔ 니시산도입구(西参道入口) 성인 편도 350. 사찰까지는 도보 연결. 저장한 C계통 도로 선형·사찰 입구 보행로를 구분하며 당일 운행은 현장 확인.',confidence:'official-reference'};leg.note+=' 니시산도입구(西参道入口) 정류장까지 버스 · 사찰 구역은 도보 연결. 버스 편도 350 JP¥.';}
 bundle.data.metadata.faresCheckedAt=checkedAt;bundle.data.metadata.farePolicy='adult-ic-plus-explicit-tickets';
 const odaiba=bundle.data.days.find(d=>d.n===2),yuri=bundle.routes.days['2-main'].flatMap(l=>l.fare?.breakdown||[]).filter(r=>r.operator==='Yurikamome').reduce((n,r)=>n+r.icYen,0);odaiba.important='유리카모메 IC 합계 '+yuri.toLocaleString('ko-KR')+' JP¥ · 1일권 820 JP¥과 비교. 다른 운영사 운임 별도 · 패스 자동 적용 없음.';
 odaiba.fareAlternatives=[{name:'유리카모메 1일권',amount:820,currency:'JPY',source:'https://www.yurikamome.co.jp/ride-guidance/fare.html',checkedAt,normalFare:yuri,saving:Math.max(0,yuri-820),autoApplied:false}];
 const hakone=bundle.data.days.find(d=>d.n===6);hakone.important='로프웨이 왕복권 3,000 JP¥을 출발 때 한 번 계산. 로망스카는 IC 기본운임 외 특급권 필요 · 온라인 특급권은 편도 50 JP¥ 저렴. 하코네 프리패스 2일권(신주쿠 출발) 7,100 JP¥ + 특급권 별도와 비교 후 선택. 패스 구입·예약은 자동 처리하지 않습니다.';
 hakone.fareAlternatives=[{name:'하코네 프리패스 · 2일권',amount:7100,currency:'JPY',source:'https://www.odakyu-freepass.jp/hakone/buy.html',checkedAt,includes:'신주쿠–하코네 기본 승차권·현지 지정 교통',excludes:'로망스카 특급권·신주쿠까지의 JR·메트로',autoApplied:false}];
 if(bundle.routes.days['6-main'].some(l=>l.parts.some(p=>p.lineId==='JR-Central.TokaidoShinkansen'))){hakone.important='시간 우선: 도쿄–오다와라 신칸센 경유. 신칸센은 별도 승차권·특급권 필요, IC 잔액만으로 승차 불가. 로프웨이 왕복권은 출발 때 한 번 합산. 여행일 운행·예매 재확인.';hakone.fareAlternatives=[];const stop=hakone.variants[0].stops[1];stop.description='도쿄–오다와라 신칸센에서 하코네 등산선 일반열차로 환승. 승차권·특급권과 여행일 운행 확인.';stop.details.feature=stop.description;}
 return {updated,missing};
}
module.exports={apply,groups,rows,checkedAt};
