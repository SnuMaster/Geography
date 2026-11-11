'use strict';
// Trim existing line geometry in the order of the train's published calls.
// Repeated interchange coordinates and closed loops must not select an
// arbitrary first occurrence or the geographically shorter, opposite service.
function referencePath(coords,stops,distance,{endpointTolerance=350,stopTolerance=450}={}){
 if(coords.length<2||stops.length<2)return [];
 function ends(point){const runs=[];let run=[];for(let i=0;i<coords.length;i++){
  const d=distance(coords[i],point);if(d<=endpointTolerance)run.push({i,d});
  else if(run.length){runs.push(run);run=[];}
 }if(run.length)runs.push(run);return runs.map(r=>r.reduce((a,b)=>a.d<=b.d?a:b).i);}
 const candidates=[],closed=distance(coords[0],coords.at(-1))<100;
 for(const a of ends(stops[0]))for(const b of ends(stops.at(-1))){
  const direct=a<=b?coords.slice(a,b+1):coords.slice(b,a+1).reverse();candidates.push(direct);
  if(closed)candidates.push(a<=b?[...coords.slice(0,a+1).reverse(),...coords.slice(b).reverse()]:[...coords.slice(a),...coords.slice(0,b+1)]);
 }
 function follows(path){let at=0;for(const stop of stops){let best={d:Infinity,i:at};for(let i=at;i<path.length;i++){const d=distance(path[i],stop);if(d<best.d)best={d,i};}if(best.d>stopTolerance)return false;at=best.i;}return true;}
 const length=ps=>ps.slice(1).reduce((n,p,i)=>n+distance(ps[i],p),0);
 return candidates.filter(p=>p.length>1&&follows(p)).sort((a,b)=>length(a)-length(b))[0]||[];
}
module.exports={referencePath};
