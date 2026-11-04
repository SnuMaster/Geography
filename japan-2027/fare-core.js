'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FareCore=api;})(globalThis,function(){
 const finite=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
 const PASS_PRICE=2000;
 function passWindow(pass={}){const startAt=Number.isFinite(pass.startAt)&&Math.abs(pass.startAt)<8.64e15-72*3600000?pass.startAt:null;return {startAt,expiresAt:startAt===null?null:startAt+72*3600000,price:PASS_PRICE,simulation:!!pass.enabled&&startAt===null};}
 function quote(fare,leg={},options={}){
  const f=fare||{},currency=f.currency||null,baseAmount=finite(f.min)?f.min:null,variable=f.status==='variable';
  const subway=(leg.parts||[]).some(p=>/^(TokyoMetro\.|Toei\.)/.test(p.lineId||''));
  const excluded=(leg.parts||[]).some(p=>['flight','ferry','taxi'].includes(p.mode));
  const eligible=currency==='JPY'&&!variable&&!excluded&&subway&&(f.passEligible===true||(finite(f.passExtraMin)&&baseAmount!==null&&f.passExtraMin<baseAmount));
  const pass=options.pass||{enabled:!!options.passEnabled},window=passWindow(pass),day=options.day??leg.dayNumber;
  const simulation=!!pass.enabled&&window.startAt===null;
  const boundaryUncertain=window.startAt!==null&&Number.isFinite(leg.arrivalAt)&&Number.isFinite(leg.departureAt)&&((leg.departureAt<window.startAt&&leg.arrivalAt>window.startAt)||(leg.departureAt<window.expiresAt&&leg.arrivalAt>window.expiresAt));
  const inWindow=!boundaryUncertain&&window.startAt!==null&&Number.isFinite(leg.departureAt)&&leg.departureAt>=window.startAt&&leg.departureAt<window.expiresAt;
  const applied=!!pass.enabled&&eligible&&(simulation?(day>=1&&day<=22):inWindow);
  const amount=baseAmount===null?null:applied?(f.passEligible===true?0:f.passExtraMin):baseAmount;
  const prepaid=f.paymentStatus==='prepaid'||f.prepaid===true;
  const status=amount===null?'unknown':prepaid?'prepaid':variable?'range':baseAmount===0?'free':applied&&amount===0?'pass-zero':applied?'pass-partial':'priced';
  return {currency,baseAmount,amount,maxAmount:finite(f.max)?f.max:amount,variable,simulation:applied&&simulation,passEligible:eligible,passUncertain:eligible&&!!pass.enabled&&boundaryUncertain,passApplied:applied,paymentStatus:prepaid?'prepaid':'unconfirmed',status};
 }
 function format(fare,leg,options){
  const q=quote(fare,leg,options),unit=q.currency==='KRW'?'원':q.currency==='JPY'?'엔':q.currency?` ${q.currency}`:'';
  if(q.status==='unknown')return '요금 미확인';
  const amount=q.amount.toLocaleString('ko-KR')+unit,prefix=q.simulation?'가상 비교 · ':'';
  if(q.status==='free')return '무료';
  if(q.status==='prepaid')return `선결제 · ${q.baseAmount.toLocaleString('ko-KR')}${unit}`;
  if(q.status==='range')return `${q.amount.toLocaleString('ko-KR')}~${q.maxAmount.toLocaleString('ko-KR')}${unit} 예상`;
  if(q.status==='pass-zero')return prefix+'패스 적용으로 추가부담 0엔';
  if(q.status==='pass-partial')return prefix+`패스 외 ${amount}`;
  return (q.passUncertain?'패스 경계 · 승차 시각 확인 필요 · ':'')+(fare?.label||amount);
 }
 function summarize(legs,options={}){
  const sum={ic:0,paper:0,krw:0,unknown:0,extras:[],prepaid:{JPY:0,KRW:0},variableJPY:{min:0,max:0},variableKRW:{min:0,max:0},passCost:0};
  for(const l of legs){if(!l)continue;const f=l.fare,parts=l.parts||[];
   // The sidebar's Japanese rail subtotal counts each railway OD fare once, including its walking transfers.
   if(options.scope==='japan-rail'&&!japanRail(l))continue;
   const q=quote(f,l,options);
   if(options.scope!=='japan-rail'&&(l.travel||['selectedQuote','publishedTariff'].includes(f?.status))){sum.extras.push(l);continue;}
   if(q.status==='unknown'||!['JPY','KRW'].includes(q.currency)){sum.unknown++;continue;}
   if(q.status==='prepaid'){sum.prepaid[q.currency]+=q.baseAmount;continue;}
   if(q.variable){const r=sum['variable'+q.currency];r.min+=q.amount;r.max+=q.maxAmount;continue;}
   if(q.currency==='KRW')sum.krw+=q.amount;else{sum.ic+=q.amount;sum.paper+=q.passApplied?q.amount:(f.paperTicketYen??q.baseAmount);}
  }
  if(options.includePass&&options.pass?.purchased)sum.passCost=PASS_PRICE;
  return sum;
 }
 function japanRail(leg){return leg?.fare?.currency==='JPY'&&leg.parts?.some(p=>['rail','metro'].includes(p.mode))&&leg.parts.every(p=>['rail','metro','walk','transfer'].includes(p.mode)&&(!p.country||p.country==='JP')&&!/^KORAIL[.]/i.test(p.lineId||''));}
 // Keep operator OD fares together: changing trains does not always mean paying a second fare.
 function groupParts(g,parts){const from=g.from||g.from_,candidates=[];for(let a=0;a<parts.length;a++)if(parts[a].from===from)for(let b=a;b<parts.length;b++)if(parts[b].to===g.to){const range=parts.slice(a,b+1);if(!g.lineIds||g.lineIds.length&&g.lineIds.every(id=>range.some(p=>p.lineId===id))&&range.every(p=>g.lineIds.includes(p.lineId)))candidates.push(range);}return candidates.length===1?candidates[0]:null;}
 function railItems(legs){return legs.flatMap((leg,index)=>{
  if(!japanRail(leg))return [];
  const parts=leg.parts.filter(p=>['rail','metro'].includes(p.mode)),fare=leg.fare,groups=Array.isArray(fare.breakdown)?fare.breakdown:[];
  const split=groups.length>0&&finite(fare.icYen)&&groups.every(g=>finite(g.icYen)&&(!g.currency||g.currency==='JPY')&&groupParts(g,parts))&&groups.reduce((sum,g)=>sum+g.icYen,0)===fare.icYen&&parts.every(p=>groups.filter(g=>groupParts(g,parts).includes(p)).length===1);
  return (split?groups:[{from:parts[0].from,to:parts.at(-1).to,icYen:finite(fare.icYen)?fare.icYen:null,checkedAt:fare.checkedAt}]).map(g=>{
   const services=split?groupParts(g,parts):parts,components=finite(g.baseIcYen)&&finite(g.reservedSurchargeYen)&&g.baseIcYen+g.reservedSurchargeYen===g.icYen?{baseIcYen:g.baseIcYen,reservedSurchargeYen:g.reservedSurchargeYen}:{};
   return {legIndex:index+1,from:g.from||g.from_,to:g.to,fromJa:g.fromJa,toJa:g.toJa,lines:[...new Set(services.map(p=>p.line).filter(Boolean))],lineIds:[...new Set(services.map(p=>p.lineId).filter(Boolean))],icYen:g.icYen,combined:services.length>1,checkedAt:g.checkedAt||fare.checkedAt||null,sources:(g.sources||fare.sources||[]).map(s=>typeof s==='string'?s:s?.url).filter(s=>{try{return new URL(s).protocol==='https:';}catch{return false;}}),...components};
  });
 });}
 // Match the station board to actual itinerary parts; reverse boards do not inherit a forward fare.
 function boardingFare(leg,profile){const parts=(leg?.parts||[]).filter(p=>['rail','metro'].includes(p.mode)),matches=profile.throughParts||profile.matches||[profile.match||profile],selected=parts.filter(p=>matches.some(m=>m.lineId===p.lineId&&m.from===p.from&&m.to===p.to));if(!selected.length)return null;const rows=railItems([leg]),groups=rows.map(r=>({row:r,parts:groupParts(r,parts)})).filter(g=>g.parts?.some(p=>selected.includes(p)));if(!groups.length||!selected.every(p=>groups.some(g=>g.parts.includes(p)))||groups.some(g=>!finite(g.row.icYen)))return null;const joined=groups.some(g=>g.parts.some(p=>!selected.includes(p)));return {amount:groups.reduce((sum,g)=>sum+g.row.icYen,0),joined,rows:groups.map(g=>g.row),distanceM:selected.every(p=>finite(p.distanceM))?selected.reduce((sum,p)=>sum+p.distanceM,0):null};}
 return Object.freeze({quote,format,summarize,passWindow,PASS_PRICE,railItems,boardingFare});
});
