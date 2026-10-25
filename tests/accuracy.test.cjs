'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const base='../japan-2027/';
require(base+'rail-departure-profiles.js');
const routeDays={...require(base+'tokyo-routes.json').days,...require(base+'west-routes.json').days};
const run=require(base+'tests/accuracy-cases.js');
test('six accuracy bug regressions',async t=>{
 const results=await run({Fare:require(base+'fare-core.js'),Departure:require(base+'departure-core.js'),Ride:require(base+'ride-core.js'),Location:require(base+'location-core.js'),manifest:globalThis.RailDepartureProfiles,routeDays});
 for(const r of results)await t.test(r.name,()=>assert.equal(r.pass,true,r.detail));
});

test('all 102 manifest source dates and revision boundaries match timetable files',()=>{
 const path=require('node:path');
 for(const [key,p] of Object.entries(globalThis.RailDepartureProfiles.profiles)){
  const data=JSON.parse(fs.readFileSync(path.join(__dirname,base,p.file),'utf8')),m=data.metadata[key];
  assert.ok(data.profiles[key],key);
  assert.equal(p.sourceDate,m.verifiedSourceDate||m.retrievedAt,key);
  if(m.knownUpcomingRevision)assert.ok(p.validUntil&&p.validUntil<m.knownUpcomingRevision,key);
 }
});
