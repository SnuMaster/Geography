'use strict';

// Reuse exact itinerary grids from the Geofabrik extracts and download the
// remaining grids from OpenStreetMap. Keep raw responses outside the repository.
const fs=require('node:fs');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {gzipSync,gunzipSync}=require('node:zlib');
const {createHash}=require('node:crypto');
const run=promisify(execFile);
const root=path.join(__dirname,'../japan-2027');
const base=path.join(root,'assets/offline-streets');
const destination=path.join(base,'tokyo-12');
const Road=require(path.join(root,'offline-roads'));
const trip=require(path.join(root,'trip-update.json'));
const previous=require(path.join(base,'manifest.json'));
const keys=['highway','railway','access','foot','oneway:foot','name','name:ko'];
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function near(point,item){
 const [lat,lon]=point;
 const inside=p=>Math.abs(p.lat-lat)<=.010&&Math.abs(p.lon-lon)<=.013;
 if(item.type==='node')return inside(item);
 if(item.type!=='way'||!item.geometry)return false;
 return item.geometry.some((p,i,all)=>{
  if(inside(p))return true;
  if(i===0)return false;
  const q=all[i-1];
  return Math.min(p.lat,q.lat)<=lat+.010&&Math.max(p.lat,q.lat)>=lat-.010&&
    Math.min(p.lon,q.lon)<=lon+.013&&Math.max(p.lon,q.lon)>=lon-.013;
 });
}

const road=item=>item?.type==='way'&&item.tags?.highway&&item.nodes?.length>1&&item.nodes.length===item.geometry?.length;

async function box(cache,bounds){
 const cacheFile=path.join(cache,bounds.join('_')+'.json');
 if(fs.existsSync(cacheFile))return JSON.parse(fs.readFileSync(cacheFile)).elements;
 const {stdout}=await run('curl.exe',[
  '-fLsS','--max-time','25','-A','KisekiTravelPlanner/1.0 (offline itinerary map preparation)',
  'https://api.openstreetmap.org/api/0.6/map.json?bbox='+bounds.join(',')
 ],{maxBuffer:64*1024*1024,encoding:'utf8'});
 const {elements}=JSON.parse(stdout);
 if(!Array.isArray(elements))throw Error('Invalid OpenStreetMap response for '+bounds.join(','));
 fs.writeFileSync(cacheFile,stdout);
 await wait(1500);
 return elements;
}

async function extract(cache,[lat,lon]){
 const south=+(lat-.010).toFixed(5),north=+(lat+.010).toFixed(5);
 const west=+(lon-.013).toFixed(5),east=+(lon+.013).toFixed(5);
 let items;
 try{items=await box(cache,[west,south,east,north]);}
 catch(error){
  if(!/400|509|maximum/i.test(error.stderr||''))throw error;
  console.log('Using smaller boxes for '+[lat,lon].join(','));
  items=[];
  for(const [w,e] of [[west,lon],[lon,east]])for(const [s,n] of [[south,lat],[lat,north]])items.push(...await box(cache,[w,s,e,n]));
 }
 const nodes=new Map(items.filter(i=>i.type==='node').map(({id,lat,lon})=>[id,{lat,lon}]));
 const roads=[];
 for(const {type,id,lat,lon,tags,nodes:refs} of items){
  if(type==='node'&&tags?.name&&tags.amenity){
   roads.push({type,id,lat,lon,tags:tags['name:ko']?{name:tags.name,'name:ko':tags['name:ko']}:{name:tags.name}});
   continue;
  }
  if(type!=='way'||!refs||(!tags?.highway&&!/^(rail|subway|tram|light_rail)$/.test(tags?.railway)))continue;
  const geometry=refs.map(ref=>nodes.get(ref));
  if(geometry.length<2||geometry.some(p=>!p))continue;
  roads.push({type,id,nodes:refs,geometry,tags:Object.fromEntries(keys.filter(k=>tags[k]).map(k=>[k,tags[k]]))});
 }
 return roads;
}

async function main(){
 const cache=process.argv[2];
 if(!cache)throw Error('Pass a directory for raw OpenStreetMap responses');
 fs.mkdirSync(cache,{recursive:true});
 const previousDetailed=fs.existsSync(path.join(destination,'manifest.json'))?require(path.join(destination,'manifest.json')):null;
 const days=trip.data.days.map(d=>({day:d.n,points:Road.centres(d,trip.routes)}));
 const changed=days.filter(({day,points})=>{
  const entry=previousDetailed?.days[day];
  return !entry||JSON.stringify(entry.points)!==JSON.stringify(points)||!fs.existsSync(path.join(destination,entry.path));
 });
 if(!changed.length)return;
 const sources=new Map(),known=new Map();
 for(const entry of Object.values(previous.days))for(const point of entry.points)if(!sources.has(point.join(',')))sources.set(point.join(','),entry.path);
 for(const entry of Object.values(previousDetailed?.days||{}))for(const point of entry.points){
  const file=path.join('tokyo-12',entry.path);
  if(!sources.has(point.join(','))&&fs.existsSync(path.join(base,file)))sources.set(point.join(','),file);
 }
 const available=new Map(),missing=[];
 for(const point of changed.flatMap(d=>d.points)){
  const key=point.join(',');
  if(known.has(key))continue;
  known.set(key,point);
  const src=sources.get(key);
  if(src){if(!available.has(src))available.set(src,[]);available.get(src).push(point);}
  else missing.push(point);
 }
 const grid=new Map();
 for(const [file,points] of available){
  const payload=JSON.parse(gunzipSync(fs.readFileSync(path.join(base,file))));
  for(const point of points)grid.set(point.join(','),payload.elements.filter(item=>near(point,item)));
 }
 for(const point of missing){
  let elements;
  for(let attempt=0;attempt<3;attempt++){
   try{elements=await extract(cache,point);break;}
   catch(error){if(attempt===2)throw error;await wait(3000*(attempt+1));}
  }
  const key=point.join(',');
  grid.set(key,elements);
  console.log('OpenStreetMap grid '+key+' · '+elements.filter(road).length+' roads');
 }
 fs.mkdirSync(destination,{recursive:true});
 const generatedAt=new Date().toISOString();
 const manifest={version:1,generatedAt,source:'OpenStreetMap contributors via Geofabrik and OpenStreetMap API',license:'ODbL-1.0',attribution:'https://www.openstreetmap.org/copyright',days:{...previousDetailed?.days}};
 for(const {day,points} of changed){
  const unique=new Map();
  for(const point of points){
   const elements=grid.get(point.join(','));
   if(elements.filter(item=>road(item)&&near(point,item)).length<3)throw Error('Missing usable road geometry for '+point.join(','));
   for(const el of elements)unique.set(el.type+':'+el.id,el);
  }
  const raw=Buffer.from(JSON.stringify({version:1,day,generatedAt,points,elements:[...unique.values()]}));
  const bytes=gzipSync(raw,{level:9}),filename='day-'+day+'.json.gz';
  fs.writeFileSync(path.join(destination,filename),bytes);
  manifest.days[day]={path:filename,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,expandedBytes:raw.length,points};
  console.log('Detailed streets · day '+day+' · '+points.length+' grids · '+bytes.length+' bytes');
 }
 fs.writeFileSync(path.join(destination,'manifest.json'),JSON.stringify(manifest)+'\n');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
