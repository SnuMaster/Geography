'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const MapPlan=require('../japan-2027/map-plan'),{load}=require('../scripts/japan-qa.cjs');
test('zoomed Tokyo overview exposes actual visible days, keeps an explicit date and has no duplicate place pins',()=>{
 const {data}=load(),bounds={south:35.68,north:35.74,west:139.75,east:139.82};
 const context=MapPlan.context(data.days,{},bounds,{lat:35.714,lng:139.797},2);
 assert.equal(context.focus.day.n,2);assert.ok(context.visible.some(x=>x.day.n===11));assert.ok(!context.visible.some(x=>x.day.n===19));
 const groups=MapPlan.groups(context.focus.variant.stops);assert.ok(groups.length<context.focus.variant.stops.length);assert.equal(groups.flatMap(g=>g.indices).length,context.focus.variant.stops.length);
 const fukuoka=MapPlan.context(data.days,{}, {south:33.55,north:33.65,west:130.3,east:130.5},{lat:33.59,lng:130.4},2);assert.ok(fukuoka.focus.day.n>=18&&fukuoka.focus.day.n<=21);
});
test('date labels name the actual city and selected alternative without itinerary boilerplate',()=>{
 const{data}=load();for(const day of data.days)for(const v of day.variants){const l=MapPlan.label(day,v);assert.ok(l.city&&l.places);assert.ok(!/DAY|NIGHTS/.test(l.city+l.places));}
 const day=data.days.find(d=>d.n===14),v=MapPlan.variant(day,{14:'no-yamazaki'});assert.equal(MapPlan.label(day,v).city,'우지·교토');
});
test('ferry connects both terminals, preserves all original chart points and discloses schematic harbor links',()=>{
 const{data,routes}=load(),stops=data.days.find(d=>d.n===21).variants[0].stops,leg=routes.days['21-main'][4],parts=leg.parts;
 assert.equal(parts.length,3);assert.deepEqual(parts[0].coords[0],[stops[4].lat,stops[4].lng]);assert.deepEqual(parts.at(-1).coords.at(-1),[stops[5].lat,stops[5].lng]);
 assert.deepEqual(parts[0].coords.at(-1),parts[1].coords[0]);assert.deepEqual(parts[1].coords.at(-1),parts[2].coords[0]);
 assert.deepEqual(parts[1].coords,require('../japan-2027/assets/routes/return-route-sources.json').camellia.sourceOverview.coords);
 for(const p of [parts[0],parts[2]]){assert.equal(p.geometryAccuracy,'schematic');assert.equal(p.suppressSymbol,true);assert.match(p.geometrySource,/개략/);}
});
test('offline manifest covers every active timetable and matches the exact shipped shell and data bytes',()=>{
 const root=path.join(__dirname,'../japan-2027'),m=require('../japan-2027/offline-manifest.json');require('../japan-2027/rail-departure-profiles');
 for(const p of Object.values(globalThis.RailDepartureProfiles.profiles))assert.ok(m.files.some(f=>f.path===p.file));
 for(const f of m.files){assert.ok(!f.path.includes('://'));const bytes=fs.readFileSync(path.join(root,f.path));assert.equal(bytes.length,f.bytes,f.path);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),f.sha256,f.path);}
 assert.equal(m.totalBytes,m.files.reduce((n,f)=>n+f.bytes,0));assert.ok(m.files.some(f=>f.path==='assets/maps/offline-land.json'));
});

function packFixture(){
 const revision='20261027-streetmaps-2',base='https://example.test/japan-2027/',memory=new Map(),files=new Map(),storage=new Map(),nodes=new Map(),events=[];
 const entries=[{path:'index.html',kind:'shell',text:'<!doctype html><title>offline</title>'},{path:'data.json',kind:'json',text:'{"days":[1,22]}'}].map(f=>({...f,bytes:Buffer.byteLength(f.text),sha256:crypto.createHash('sha256').update(f.text).digest('hex')}));
 const manifest={revision,totalBytes:entries.reduce((n,f)=>n+f.bytes,0),files:entries};let fail=false,corrupt=false,finalized=0;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',disabled:false,hidden:false,value:0});return nodes.get(id);};
 const cache=name=>{if(!files.has(name))files.set(name,new Map());const values=files.get(name);return {match:async id=>values.get(id)?.clone(),put:async(id,r)=>values.set(id,r.clone())};};
 const ctx={window:{frameElement:false,dispatchEvent:e=>events.push(e),addEventListener(){}},document:{baseURI:base,querySelector:node,addEventListener(){}},location:new URL(base),URL,Response,Request,DOMException,AbortController,Event,Date,Map,Set,JSON,Uint8Array,crypto:crypto.webcrypto,setTimeout,clearTimeout,
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},caches:{open:async n=>cache(n)},navigator:{serviceWorker:{register:async()=>({active:{scriptURL:base+'sw.js?v='+revision},update:async()=>{}}),ready:Promise.resolve()}},
  TravelStore:{VERSION:'public-v1',readJson:async()=>manifest,cache:async()=>cache('public'),pinFiles:paths=>memory.set('pins',paths)},
  fetch:async url=>{if(fail&&url==='data.json')throw Error('offline');const f=entries.find(f=>f.path===url);return new Response(corrupt&&url==='data.json'?'bad':f.text);}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../japan-2027/offline-pack.js'),'utf8'),ctx);const api=ctx.window.OfflinePack;api.configure({finalize:async()=>{finalized++;}});
 return {api,files,storage,nodes,events,memory,finalized:()=>finalized,setFail:v=>fail=v,setCorrupt:v=>corrupt=v};
}
test('offline preparation never marks a failed download complete and can resume without losing saved files',async()=>{
 const f=packFixture();f.setFail(true);assert.equal(await f.api.start(),false);assert.equal(f.api.record().complete,false);assert.equal(f.finalized(),0);assert.match(f.nodes.get('#offlinePackStatus').textContent,/저장 실패/);
 f.setFail(false);assert.equal(await f.api.start(),true);assert.equal(f.api.record().complete,true);assert.equal(f.finalized(),1);assert.equal(await f.api.verifyStored(),true);
 assert.ok(f.memory.get('pins').includes('data.json'));
});
test('offline preparation rejects mismatched content and downgrades a ready badge if cached files were evicted',async()=>{
 const f=packFixture();f.setCorrupt(true);assert.equal(await f.api.start(),false);assert.equal(f.finalized(),0);
 f.setCorrupt(false);assert.equal(await f.api.start(),true);f.files.get('public').clear();assert.equal(await f.api.verifyStored(),false);assert.equal(f.api.record().complete,false);
});
