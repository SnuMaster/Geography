'use strict';
// Planned connections only: these are not live vehicle positions or guaranteed transfers.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ConnectionCore=api;})(globalThis,function(){
 const MINUTE=60000;
 const rail=p=>['rail','metro'].includes(p.mode);
 function stepsFor(leg,keyFor){
  const steps=[];
  for(const part of leg.parts||[]){
   const key=rail(part)?keyFor(leg,part):null;
   const minutes=Number.isFinite(part.durationMinutes)?part.durationMinutes:null;
   if(part.mode==='transfer'&&minutes===0)continue;
   const previous=steps.at(-1);
   // Adjacent color/line boundaries on a through service are one boarding.
   if(key&&previous?.key===key){previous.minutes=(previous.minutes??0)+(minutes??0);continue;}
   steps.push({key,mode:part.mode,minutes,from:part.from,to:part.to,
    accessKnown:!(rail(part)&&(/개략|대표점 연결/.test(part.geometrySource||'')||part.geometry?.kind==='schematic'))});
  }
  return steps;
 }
 function dependencies(steps,target){const end=steps.findIndex(s=>s.key===target);return end<0?[]:[...new Set(steps.slice(0,end+1).map(s=>s.key).filter(Boolean))];}
 function readyAt(steps,target,startAt,lookup){
  if(!Number.isFinite(startAt))return {status:'unknown-start'};
  if(!steps.some(s=>s.key===target))return {status:'outside-route'};
  let cursor=startAt,walkingMinutes=0,estimated=false;const connections=[];
  for(const step of steps){
   if(rail(step)){
    if(!step.key||!step.accessKnown)return {status:'unknown-access'};
    // One minute is reserved after reaching each platform, including the first.
    const queryAt=cursor+MINUTE-1;
    if(step.key===target)return {status:'ready',readyAt:cursor,queryAt,walkingMinutes,estimated,connections};
    const result=lookup(step.key,queryAt);
    if(result.status!=='ready')return result;
    const train=result.train;
    const arrival=Number.isFinite(train.destinationArrivalAt)?train.destinationArrivalAt:train.destinationDepartureAt;
    if(!Number.isFinite(arrival)||arrival<train.departureAt)return {status:'unknown-arrival'};
    connections.push({key:step.key,departureAt:train.departureAt,arrivalAt:arrival,number:train.number||''});
    estimated ||= train.stopTimeBasis==='estimated';cursor=arrival;
   }else{
    if(!['walk','transfer'].includes(step.mode)||!Number.isFinite(step.minutes)||step.minutes<0)return {status:'unknown-access'};
    walkingMinutes+=step.minutes;cursor+=step.minutes*MINUTE;
   }
  }
  return {status:'outside-route'};
 }
 function planReference(leg,now,mode='auto'){
  const localDate=at=>new Date(at+9*60*MINUTE).toISOString().slice(0,10);
  const today=localDate(now),serviceDate=localDate(now-3*60*MINUTE),planned=leg.departureTimeKnown===false?null:leg.departureAt;
  const currentDay=[today,serviceDate].includes(leg.serviceDate),live=mode==='now'||currentDay;
  const startAt=mode==='now'?now:Number.isFinite(planned)?live?Math.max(planned,now):planned:null;
  return {startAt,live,serviceDate:mode==='now'?serviceDate:leg.serviceDate,label:mode==='now'?'지금 출발 기준':currentDay?'여행일 · 현재 시각 반영':'여행일 참고'};
 }
 function planNext(leg,key,reference,keyFor,lookup){
  const ready=readyAt(stepsFor(leg,keyFor),key,reference.startAt,lookup);
  if(ready.status!=='ready')return {...ready,reference};
  return {...lookup(key,ready.queryAt),reference,queryAt:ready.queryAt,readyAt:ready.readyAt};
 }
 return {stepsFor,dependencies,readyAt,planReference,planNext};
});
