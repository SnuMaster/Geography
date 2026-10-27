'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const root=path.join(__dirname,'../japan-2027'),directory=path.join(root,'assets/offline-streets');
const T=require(path.join(root,'data-model')),P=require(path.join(root,'personal-trip')),Roads=require(path.join(root,'offline-roads'));

test('all prebuilt street maps match the current itinerary and their compressed hashes',{
 skip:process.env.OFFLINE_BUNDLE_OPTIONAL==='1'&&!fs.existsSync(path.join(directory,'manifest.json'))
},()=>{
 const read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),tokyo=read('tokyo-routes.json'),west=read('west-routes.json');
 const trip=P.patch(T.merge(read('data.json'),read('tokyo-data.json'),read('west-data.json')),{...tokyo,days:{...tokyo.days,...west.days}});
 const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json')));
 assert.equal(manifest.version,1);assert.equal(Object.keys(manifest.days).length,22);
 for(const day of trip.data.days){
  const entry=manifest.days[day.n],points=Roads.centres(day,trip.routes);assert.ok(entry,'missing day '+day.n);assert.deepEqual(entry.points,points);
  const bytes=fs.readFileSync(path.join(directory,entry.path));assert.equal(bytes.length,entry.bytes);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),entry.sha256);
  const raw=zlib.gunzipSync(bytes);assert.equal(raw.length,entry.expandedBytes);const data=JSON.parse(raw);
  assert.equal(data.version,1);assert.equal(data.day,day.n);assert.deepEqual(data.points,points);
  assert.ok(data.elements.some(e=>e.type==='way'&&e.tags?.highway&&e.nodes?.length>1&&e.nodes.length===e.geometry?.length),'missing usable road '+day.n);
 }
});
