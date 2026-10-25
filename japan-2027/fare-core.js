'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FareCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const finite=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
 function quote(fare,leg={},options={}){
  const f=fare||{},currency=f.currency||null,baseAmount=finite(f.min)?f.min:null;
  const subway=(leg.parts||[]).some(p=>/^(TokyoMetro\.|Toei\.)/.test(p.lineId||''));
  const excluded=(leg.parts||[]).some(p=>['flight','ferry'].includes(p.mode));
  const eligible=currency==='JPY'&&!excluded&&subway&&(f.passEligible===true||(finite(f.passExtraMin)&&baseAmount!==null&&f.passExtraMin<baseAmount));
  const day=options.day??leg.dayNumber,applied=!!options.passEnabled&&day>=1&&day<=11&&eligible;
  const amount=baseAmount===null?null:applied?(f.passEligible===true?0:f.passExtraMin):baseAmount;
  // A quote or published tariff is not evidence of payment.
  const prepaid=f.paymentStatus==='prepaid'||f.prepaid===true;
  const status=amount===null?'unknown':prepaid?'prepaid':baseAmount===0?'free':applied&&amount===0?'pass-zero':applied?'pass-partial':'priced';
  return {currency,baseAmount,amount,passEligible:eligible,passApplied:applied,paymentStatus:prepaid?'prepaid':'unconfirmed',status};
 }
 function format(fare,leg,options){
  const q=quote(fare,leg,options),unit=q.currency==='KRW'?'원':q.currency==='JPY'?'엔':q.currency?` ${q.currency}`:'';
  if(q.status==='unknown')return '요금 미확인';
  const amount=q.amount.toLocaleString('ko-KR')+unit;
  if(q.status==='free')return '무료';
  if(q.status==='prepaid')return `선결제 · ${q.baseAmount.toLocaleString('ko-KR')}${unit}`;
  if(q.status==='pass-zero')return '패스 적용으로 추가부담 0엔';
  if(q.status==='pass-partial')return `패스 외 ${amount}`;
  return fare?.label||amount;
 }
 return Object.freeze({quote,format});
});
