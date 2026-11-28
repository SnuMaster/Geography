'use strict';
// Exact operator OD evidence for the approved Nov 18 plan. No distance-based
// fare guesses, automatic pass purchase or reserved-seat booking.
const fs=require('node:fs'),path=require('node:path'),refs=require('./tokyo-fare-references.cjs'),evidence=require('./tokyo-complete-fare-evidence.json');
const clone=x=>JSON.parse(JSON.stringify(x));
const motor=p=>['rail','metro','bus'].includes(p.mode),rail=p=>['rail','metro'].includes(p.mode);
function signature(leg){return leg.parts.filter(motor).map(p=>[p.mode,p.lineId,p.fromJa||p.from,p.toJa||p.to]);}
function findRow(g,date){
 const a=g.parts[0],b=g.parts.at(-1),x=/Spacia.?X|스페이시아.?X|スペーシア.?X/i.test(g.parts.map(p=>p.serviceName||'').join(' '));
 const matches=r=>r.operator===g.operator&&((r.fromJa===a.fromJa&&r.toJa===b.toJa)||(r.fromJa===b.toJa&&r.toJa===a.fromJa));
 const fresh=evidence.rail.find(r=>matches(r)&&(!r.servicePattern||new RegExp(r.servicePattern,'i').test(g.parts.map(p=>p.serviceName||'').join(' ')))&&(!r.travelDate||r.travelDate===date)&&(!x||r.servicePattern));
 const r=fresh||(!x&&refs.rows.find(r=>r.operator===g.operator&&(r.from===a.from&&r.to===b.to||r.from===b.to&&r.to===a.from)));
 if(!r)return null;
 return {...clone(r),from:a.from,to:b.to,fromJa:a.fromJa,toJa:b.toJa,lineIds:[...new Set(g.parts.map(p=>p.lineId))],currency:'JPY',status:'exact',sourceClass:'published-current',travelDateVerified:false};
}
function amount(components){
 const min=components.reduce((n,c)=>n+c.icYen,0),paper=components.reduce((n,c)=>n+c.paperTicketYen,0);
 const covered=components.filter(c=>['TokyoMetro','Toei'].includes(c.operator)).reduce((n,c)=>n+c.icYen,0);
 return {min,max:min,icYen:min,paperTicketYen:paper,currency:'JPY',status:'exact',label:min.toLocaleString('ko-KR')+' JP¥',checkedAt:evidence.checkedAt,confidence:'source-verified',sourceClass:'published-current',travelDateVerified:false,basis:'성인 편도 IC 운임 + 명시한 별도 티켓 · 현재 공표 운임 기준 · 2027 운임 개정 시 달라질 수 있음 · 패스 자동 적용 없음',passEligible:covered===min,passExtraMin:min-covered,passExtraMax:min-covered,sources:[...new Set(components.flatMap(c=>c.sources))],breakdown:components};
}
function apply(bundle){
 if(!['tokyo-20270108-22','tokyo-20270108-19'].includes(bundle.data.metadata.id))throw Error('Wrong itinerary');
 const updated=[],missing=[];
 for(const d of bundle.data.days)for(const v of d.variants){const key=d.n+'-'+v.id,date='2027-'+d.date.replace('/','-'),legs=bundle.routes.days[key];
  for(const [index,leg]of legs.entries()){
   if(leg.private||leg.fare?.displayBlank||leg.fare?.currency==='KRW'||!leg.parts.some(motor))continue;
   if(leg.fare?.icYen!=null&&leg.fare.status!=='unverified')continue;
   let cs;
   const buses=leg.parts.filter(p=>p.mode==='bus');
   if(buses.length){
    const r=evidence.bus.find(r=>JSON.stringify(r.signature)===JSON.stringify(signature(leg)));
    if(!r){missing.push(key+'#'+index);continue;}
    cs=clone(r.components);
   }else{
    cs=refs.groups(leg.parts).map(g=>findRow(g,date));
    if(!cs.length||cs.some(c=>!c)){missing.push(key+'#'+index);continue;}
    for(let i=1;i<cs.length;i++){
     const a=cs[i-1],b=cs[i],operators=[a.operator,b.operator].sort().join('+'),join=[a.toJa,b.fromJa].sort().join('+');
     if(operators==='Toei+TokyoMetro'&&['岩本町+秋葉原','日比谷+日比谷','人形町+人形町'].includes(join)){
      Object.assign(b,{beforeTransferDiscountIcYen:b.icYen,transferDiscountYen:70});b.icYen-=70;b.paperTicketYen-=70;b.sources.push(evidence.transferDiscountSource);b.basis+=' · 같은 IC·지정 환승 60분 이내 70 JP¥ 할인';
     }
    }
   }
   leg.fare=amount(cs);
   if(buses.length){leg.note+=' 운임 계산 정류장: '+cs.map(c=>c.from+' → '+c.to).join(' / ')+'. 정류장 접근 도보는 추가 운임 없음.';leg.fare.basis+=' · 버스 IC·현금 동일 운임';}
   updated.push({key,index,from:leg.from,to:leg.to,icYen:leg.fare.icYen,components:cs.map(c=>({operator:c.operator,from:c.from,to:c.to,icYen:c.icYen,reservedSurchargeYen:c.reservedSurchargeYen||0,transferDiscountYen:c.transferDiscountYen||0}))});
  }
 }
 // The already-priced outbound Tobu express has the same normal-season price
 // on Jan 15. Correct the inherited Jan 17 date, without changing its train.
 for(const l of bundle.routes.days['8-main']||[])for(const r of l.fare?.breakdown||[])if(r.operator==='TobuNikko'&&r.travelDate==='2027-01-17'){
  r.travelDate='2027-01-15';r.checkedAt=evidence.checkedAt;r.basis=r.basis.replaceAll('2027-01-17','2027-01-15');l.fare.checkedAt=evidence.checkedAt;
 }
 const rope=bundle.data.days.flatMap(d=>d.variants.flatMap(v=>v.stops)).find(s=>s.planKey==='ropeway');
 if(rope&&bundle.data.metadata.days===15){Object.assign(rope.details,{costMin:1200,costMax:1200,costKind:'experience',costConfidence:'official-reference',costNote:'2026-11-01 개정 개인 성인 왕복권 1,200 JP¥ · 선택 이용 · 교통카드 잔액으로 내는 버스·전철 운임과 별도',sourceCheckedAt:evidence.checkedAt});rope.details.sources=[...new Set([...rope.details.sources,evidence.ropewaySource])];rope.description='선택 방문 · 개인 성인 왕복권 1,200 JP¥. 강풍·대기·운휴 시 생략. 구입·예약은 자동 처리하지 않음.';rope.details.feature=rope.description;}
 const toyosu=bundle.data.days.find(d=>d.variants[0].stops.some(s=>s.planKey==='toyosu'));if(toyosu&&bundle.data.metadata.days===15){const yuri=bundle.routes.days[toyosu.n+'-main'].flatMap(l=>l.fare.breakdown||[]).filter(r=>r.operator==='Yurikamome').reduce((n,r)=>n+r.icYen,0);toyosu.important='유리카모메 개별 IC 합계 '+yuri.toLocaleString('ko-KR')+' JP¥ · 1일권 820 JP¥과 비교. 다른 운영사 운임 별도 · 패스 자동 적용 없음.';toyosu.fareAlternatives=[{name:'유리카모메 1일권',amount:820,currency:'JPY',source:'https://www.yurikamome.co.jp/ride-guidance/fare.html',checkedAt:evidence.checkedAt,normalFare:yuri,saving:Math.max(0,yuri-820),autoApplied:false}];}
 bundle.data.metadata.faresCheckedAt=evidence.checkedAt;bundle.data.metadata.fareRevision=evidence.revision;
 bundle.data.metadata.farePolicy='adult-ic-plus-explicit-tickets';bundle.data.metadata.unpricedPublicTransport=missing.length;
 return {updated,missing};
}
module.exports={apply,signature};
if(require.main===module){
 const file=path.resolve(__dirname,'../japan-2027/trip-update.json'),bundle=JSON.parse(fs.readFileSync(file));
 const result=apply(bundle);if(result.missing.length)throw Error('Unpriced public transport: '+result.missing.join(', '));
 fs.writeFileSync(file,JSON.stringify(bundle)+'\n');
 fs.writeFileSync(path.join(__dirname,'tokyo-complete-fare-report.json'),JSON.stringify({revision:evidence.revision,checkedAt:evidence.checkedAt,...result},null,2)+'\n');
 console.log(JSON.stringify(result,null,2));
}
