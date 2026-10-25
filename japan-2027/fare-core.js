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
  for(const l of legs){if(!l)continue;const f=l.fare,q=quote(f,l,options);
   if(l.travel||['selectedQuote','publishedTariff'].includes(f?.status)){sum.extras.push(l);continue;}
   if(q.status==='unknown'||!['JPY','KRW'].includes(q.currency)){sum.unknown++;continue;}
   if(q.status==='prepaid'){sum.prepaid[q.currency]+=q.baseAmount;continue;}
   if(q.variable){const r=sum['variable'+q.currency];r.min+=q.amount;r.max+=q.maxAmount;continue;}
   if(q.currency==='KRW')sum.krw+=q.amount;else{sum.ic+=q.amount;sum.paper+=q.passApplied?q.amount:(f.paperTicketYen??q.baseAmount);}
  }
  if(options.includePass&&options.pass?.purchased)sum.passCost=PASS_PRICE;
  return sum;
 }
 return Object.freeze({quote,format,summarize,passWindow,PASS_PRICE});
});
