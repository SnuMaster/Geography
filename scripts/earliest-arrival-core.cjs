'use strict';
// Connection scan over source timetable events. Costs are minutes only: fares
// and the number of transfers never override an earlier destination arrival.
function earliestArrival({connections,transfers=new Map(),origins,destinations,departure,horizon=360,boardingMinutes=1}){
 const labels=new Map(),boarded=new Map();let best=null;
 const relax=(station,time,node)=>{
  const old=labels.get(station);if(time>departure+horizon||old&&(time>old.time||time===old.time&&node.quality>=old.node.quality))return;
  labels.set(station,{time,node});
  const queue=[station];while(queue.length){const a=queue.shift(),label=labels.get(a),end=destinations.get(a);
   if(end&&(!best||label.time+end.minutes<best.arrival||label.time+end.minutes===best.arrival&&label.node.quality+end.minutes<best.node.quality))best={arrival:label.time+end.minutes,node:{kind:'egress',...end,from:a,start:label.time,end:label.time+end.minutes,quality:label.node.quality+end.minutes,previous:label.node}};
   for(const edge of transfers.get(a)||[]){const at=label.time+edge.minutes,quality=label.node.quality+edge.minutes,old=labels.get(edge.to);if(at>departure+horizon||old&&(at>old.time||at===old.time&&quality>=old.node.quality))continue;labels.set(edge.to,{time:at,node:{kind:'transfer',...edge,from:a,start:label.time,end:at,quality,previous:label.node}});queue.push(edge.to);}
  }
 };
 for(const origin of origins)relax(origin.station,departure+origin.minutes,{kind:'access',...origin,start:departure,end:departure+origin.minutes,quality:origin.minutes});
 for(const c of connections){
  if(c.departure<departure)continue;if(c.departure>departure+horizon||best&&c.departure>=best.arrival)break;
  const label=labels.get(c.from);let trip=boarded.get(c.trip);
  if(!trip){const prior=(c.previousTrips||[]).map(id=>boarded.get(id)).filter(t=>t?.completed<=c.departure).sort((a,b)=>a.quality-b.quality)[0];if(prior){trip={from:c.from,start:c.departure,previous:prior.completedNode,first:c,continued:true,quality:prior.quality};boarded.set(c.trip,trip);}}
  // Equal-arrival paths use fewer boardings, then less walking as tie-breaks.
  // Reboarding this train later can eliminate a pointless out-and-back detour.
  if(label&&label.time+boardingMinutes<=c.departure&&(!trip||label.node.quality+10000<trip.quality)){trip={from:c.from,start:c.departure,previous:label.node,first:c,quality:label.node.quality+10000};boarded.set(c.trip,trip);}
  if(!trip)continue;
  // Every arrival is a published stop event. The last connection is retained
  // for reconstruction; waiting and walking are represented explicitly.
  const node={kind:'ride',from:trip.from,to:c.to,start:trip.start,end:c.arrival,trip:c.trip,first:trip.first,last:c,continued:!!trip.continued,quality:trip.quality,previous:trip.previous};
  if(c.final){trip.completed=c.arrival;trip.completedNode=node;}
  relax(c.to,c.arrival,node);
 }
 if(!best)return null;const steps=[];for(let node=best.node;node;node=node.previous)steps.unshift(node);return {departure,arrival:best.arrival,durationMinutes:best.arrival-departure,steps};
}
module.exports={earliestArrival};
