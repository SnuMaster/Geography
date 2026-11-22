'use strict';
const fs=require('node:fs');
const headers={'User-Agent':'KISEKI-Public-Itinerary/1.0 (github.com/SnuMaster/Geography)'};
async function get(url){const r=await fetch(url,{headers,signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error(url+' HTTP '+r.status);return r;}
function extract(data,id){
 const by=new Map(data.elements.map(e=>[e.type+'/'+e.id,e])),r=by.get('relation/'+id),nodes=new Map(data.elements.filter(e=>e.type==='node').map(e=>[e.id,e]));
 const at=e=>e?.type==='node'?[e.lat,e.lon]:e?.nodes?.length?[e.nodes.reduce((s,id)=>s+nodes.get(id).lat,0)/e.nodes.length,e.nodes.reduce((s,id)=>s+nodes.get(id).lon,0)/e.nodes.length]:null;
 const stops=r.members.filter(m=>/stop|platform/.test(m.role)).map(m=>{const e=by.get(m.type+'/'+m.ref);return {id:m.ref,type:m.type,role:m.role,name:e?.tags?.name||'',point:at(e)};}).filter(s=>s.point);
 const ways=r.members.filter(m=>m.type==='way'&&!/stop|platform/.test(m.role)).map(m=>({id:m.ref,role:m.role,nodes:by.get('way/'+m.ref)?.nodes||[]}));
 const chains=[];let chain=[];
 for(let i=0;i<ways.length;i++){
  let seq=ways[i].nodes.slice();if(!seq.length)continue;
  if(chain.length){const end=chain.at(-1);if(seq.at(-1)===end)seq.reverse();if(seq[0]===end){chain.push(...seq.slice(1));continue;}chains.push(chain);chain=[];}
  const next=ways[i+1]?.nodes||[];if(next.includes(seq[0])&&!next.includes(seq.at(-1)))seq.reverse();
  chain=seq;
 }if(chain.length)chains.push(chain);
 return {relationId:id,tags:r.tags,source:'https://www.openstreetmap.org/relation/'+id,sourceApi:'https://api.openstreetmap.org/api/0.6/relation/'+id+'/full.json',checkedAt:'2026-11-18',stops,chains:chains.map(c=>c.map(id=>{const n=nodes.get(id);return [n.lat,n.lon];})),wayIds:ways.map(w=>w.id)};
}
(async()=>{
 const result={checkedAt:'2026-11-18',license:'OpenStreetMap ODbL',routes:{}};
 for(const [key,id]of [['nikkoCout',8170947],['nikkoYout',8269069],['nikkoYin',8269070]]){
  const data=await(await get('https://api.openstreetmap.org/api/0.6/relation/'+id+'/full.json')).json();result.routes[key]=extract(data,id);
  console.log('BUS_ROUTE',key,JSON.stringify({relation:id,chains:result.routes[key].chains.map(c=>c.length),stops:result.routes[key].stops.map(s=>({name:s.name,role:s.role,point:s.point}))}));await new Promise(r=>setTimeout(r,1100));
 }
 const q='[out:json][timeout:35];relation["route"="bus"]["name"~"河口湖|Kawaguchiko|レッド|Red"](35.49,138.72,35.54,138.79);out tags;';
 try{const r=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{...headers,'Content-Type':'application/x-www-form-urlencoded'},body:'data='+encodeURIComponent(q),signal:AbortSignal.timeout(50000)});if(!r.ok)throw Error('HTTP '+r.status);const json=await r.json();console.log('FUJI_RELATIONS',JSON.stringify(json.elements));result.fujiCandidates=json.elements;}catch(e){console.log('FUJI_QUERY_ERROR',e.message);}
 fs.writeFileSync('scripts/tokyo-reviewed-bus-sources.json',JSON.stringify(result)+'\n');
})().catch(e=>{console.error(e);process.exitCode=1;});
