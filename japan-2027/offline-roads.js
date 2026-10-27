(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./location-core'):root.RouteMatch);if(typeof module==='object'&&module.exports)module.exports=api;else root.OfflineRoads=api;})(typeof globalThis!=='undefined'?globalThis:this,function(GPS){
 'use strict';
 const CACHE='trip-street-data-v1',ENDPOINTS=['https://overpass.private.coffee/api/interpreter','https://overpass-api.de/api/interpreter'],RADIUS=800;
 const validPoint=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=90&&Math.abs(p[1])<=180;
 function centres(day,routeData){
  const result=[];function add(p){if(!validPoint(p))return;const coarse=p.map(x=>Math.round(x*100)/100);if(!result.some(q=>q[0]===coarse[0]&&q[1]===coarse[1]))result.push(coarse);}
  for(const variant of day?.variants||[]){
   for(const stop of variant.stops||[])if(Number.isFinite(stop.lat)&&Number.isFinite(stop.lng))add([stop.lat,stop.lng]);
   for(const leg of routeData?.days?.[`${day.n}-${variant.id}`]||[])for(const part of leg.parts||[]){
    if(part.mode!=='walk')continue;let last=null;for(const p of part.coords||[])if(validPoint(p)&&(!last||GPS.distance(last,p)>500)){add(p);last=p;}
   }
  }
  if(result.length>45)throw Error('지도 범위가 너무 넓어요. 구간별로 저장해야 합니다.');
  return result;
 }
 function query(points){
  if(!points.length||points.some(p=>!validPoint(p))||points.length>45)throw Error('저장할 지도 범위를 찾을 수 없어요.');
  const clauses=points.map(p=>{const at=p.map(n=>n.toFixed(5)).join(',');return `way(around:${RADIUS},${at})[highway];way(around:${RADIUS},${at})[railway~"^(rail|subway|tram|light_rail)$"];node(around:${RADIUS},${at})[amenity][name];`;}).join('');
  return `[out:json][timeout:90][maxsize:134217728];(${clauses});out body geom;`;
 }
 function id(day){return new URL('offline-streets/day-'+Number(day)+'.json',document.baseURI).href;}
 async function get(day){try{const cache=await caches.open(CACHE),r=await cache.match(id(day));if(!r)return null;const value=await r.json();return value?.version===1&&value.day===Number(day)&&Array.isArray(value.elements)&&value.elements.length?value:null;}catch(_){return null;}}
 async function fetchGroup(points,signal){
  let value=null,lastError=null;
  for(const endpoint of ENDPOINTS){
   if(signal?.aborted)throw new DOMException('중단','AbortError');
   const timeout=new AbortController(),timer=setTimeout(()=>timeout.abort(),45000),cancel=()=>timeout.abort();signal?.addEventListener('abort',cancel,{once:true});
   try{
    const response=await fetch(endpoint,{method:'POST',body:new URLSearchParams({data:query(points)}),signal:timeout.signal,credentials:'omit'});
    if(!response.ok)throw Error('지도 서버 응답 '+response.status);
    const data=await response.json();if(data.remark)throw Error('지도 자료가 일부만 도착했어요.');
    if(!Array.isArray(data.elements)||!data.elements.some(e=>e.type==='way'&&e.tags?.highway&&Array.isArray(e.geometry)))throw Error('도로 자료가 비어 있어요.');
    value=data;break;
   }catch(error){if(signal?.aborted)throw new DOMException('중단','AbortError');lastError=error;}
   finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
  }
  if(!value)throw Error('지도 서버 연결 실패 · '+(lastError?.name==='AbortError'?'응답 시간 초과':lastError?.message||'다시 시도해 주세요.'));
  return value.elements.filter(e=>e.type==='way'&&Array.isArray(e.geometry)||e.type==='node'&&Number.isFinite(e.lat)&&Number.isFinite(e.lon));
 }
 async function save(day,routeData,{signal,progress}={}){
  if(!navigator.onLine)throw Error('상세 지도를 저장하려면 인터넷이 필요해요.');
  const points=centres(day,routeData),cache=await caches.open(CACHE),groups=[];
  for(let i=0;i<points.length;i+=2)groups.push(points.slice(i,i+2));
  const all=new Map(),chunkKeys=[];
  for(let i=0;i<groups.length;i++){
   if(signal?.aborted)throw new DOMException('중단','AbortError');
   const group=groups[i],key=id(day.n)+'?grid='+encodeURIComponent(group.map(p=>p.join(',')).join(';'));chunkKeys.push(key);let saved=null;
   try{const response=await cache.match(key);if(response){const value=await response.json();if(Date.now()-value.savedAt<30*86400000&&Array.isArray(value.elements))saved=value.elements;}}catch(_){}
   if(!saved){saved=await fetchGroup(group,signal);await cache.put(key,new Response(JSON.stringify({savedAt:Date.now(),elements:saved}),{headers:{'Content-Type':'application/json'}}));}
   for(const e of saved)all.set(e.type+':'+e.id,e);progress?.(i+1,groups.length);
   if(i+1<groups.length)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve();},1500),cancel=()=>{clearTimeout(timer);reject(new DOMException('중단','AbortError'));};signal?.addEventListener('abort',cancel,{once:true});});
  }
  const payload={version:1,day:day.n,savedAt:Date.now(),points,elements:[...all.values()]};
  if(!payload.elements.length)throw Error('도로 자료가 비어 있어 저장하지 않았어요.');
  await cache.put(id(day.n),new Response(JSON.stringify(payload),{headers:{'Content-Type':'application/json'}}));for(const key of chunkKeys)try{await cache.delete?.(key);}catch(_){}return payload;
 }

 function walkable(tags={}){
  const road=tags.highway;if(!road||/^(motorway|motorway_link|trunk|trunk_link|construction|proposed|raceway)$/.test(road))return false;
  if(/^(no|private)$/.test(tags.access||'')&&!/^(yes|designated|permissive)$/.test(tags.foot||''))return false;
  return !/^(no|private)$/.test(tags.foot||'');
 }
 function graph(data){
  const nodes=new Map();
  for(const w of data?.elements||[]){if(w.type!=='way'||!walkable(w.tags)||!Array.isArray(w.nodes)||w.nodes.length!==w.geometry?.length)continue;
   for(let i=0;i<w.nodes.length;i++){const g=w.geometry[i];if(!Number.isFinite(g?.lat)||!Number.isFinite(g?.lon))continue;const key=String(w.nodes[i]);if(!nodes.has(key))nodes.set(key,{point:[g.lat,g.lon],edges:[]});}
   for(let i=1;i<w.nodes.length;i++){const a=nodes.get(String(w.nodes[i-1])),b=nodes.get(String(w.nodes[i]));if(!a||!b)continue;const m=GPS.distance(a.point,b.point);if(m>300||m<0.2)continue;
    const direction=w.tags?.['oneway:foot'];if(direction!=='-1')a.edges.push([String(w.nodes[i]),m]);if(direction!=='yes'&&direction!=='1')b.edges.push([String(w.nodes[i-1]),m]);
   }
  }
  return nodes;
 }
 function findRoute(data,start,end){
  if(!validPoint(start)||!validPoint(end))return null;const nodes=graph(data);let a=null,b=null,ad=Infinity,bd=Infinity;
  for(const [k,v] of nodes){let d=GPS.distance(start,v.point);if(d<ad){a=k;ad=d;}d=GPS.distance(end,v.point);if(d<bd){b=k;bd=d;}}
  // Do not draw speculative links across roads or between disconnected datasets.
  if(!a||!b||ad>30||bd>30)return null;
  const heap=[],push=(key,score)=>{let i=heap.length;heap.push({key,score});while(i){let p=(i-1)>>1;if(heap[p].score<=score)break;heap[i]=heap[p];i=p;}heap[i]={key,score};},pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){let i=0;while(true){let l=i*2+1;if(l>=heap.length)break;let r=l+1,c=r<heap.length&&heap[r].score<heap[l].score?r:l;if(heap[c].score>=last.score)break;heap[i]=heap[c];i=c;}heap[i]=last;}return top;};
  const dist=new Map([[a,0]]),prev=new Map(),closed=new Set();push(a,GPS.distance(nodes.get(a).point,nodes.get(b).point));
  while(heap.length){const current=pop().key;if(closed.has(current))continue;if(current===b)break;closed.add(current);for(const [next,cost] of nodes.get(current).edges){const d=dist.get(current)+cost;if(d<(dist.get(next)??Infinity)){dist.set(next,d);prev.set(next,current);push(next,d+GPS.distance(nodes.get(next).point,nodes.get(b).point));}}}
  if(!dist.has(b)||dist.get(b)>GPS.distance(start,end)*4+1500)return null;
  const path=[];for(let at=b;at;at=prev.get(at)){path.push(nodes.get(at).point);if(at===a)break;}path.reverse();if(path.length<2)return null;return {coords:path,distanceM:dist.get(b),startOffsetM:ad,endOffsetM:bd};
 }
 return {CACHE,centres,query,get,save,graph,findRoute,walkable};
});
