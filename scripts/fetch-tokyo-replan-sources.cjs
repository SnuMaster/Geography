'use strict';
// Public, pinned map inputs only. No API key, account or private location is used.
const fs=require('node:fs'),path=require('node:path');
const pin='68314fe92773aa4691075b79243f2010fc8e2836';
const cache=path.resolve(process.env.TOKYO_REPLAN_CACHE||path.join(__dirname,'../.tokyo-replan-cache'));
(async()=>{
 fs.mkdirSync(cache,{recursive:true});
 for(const name of ['stations','railways','coordinates']){
  const r=await fetch(`https://raw.githubusercontent.com/nagix/mini-tokyo-3d/${pin}/data/${name}.json`,{signal:AbortSignal.timeout(60000)});
  if(!r.ok)throw Error(`${name}: HTTP ${r.status}`);
  const data=await r.json();if(name==='coordinates'?!Array.isArray(data.railways):!Array.isArray(data))throw Error('Unexpected public map schema');
  fs.writeFileSync(path.join(cache,name+'.json'),JSON.stringify(data));
 }
 const points=require('./tokyo-replan-source-points.json');
 fs.writeFileSync(path.join(cache,'geocodes.json'),JSON.stringify(points.geocodes));
 fs.writeFileSync(path.join(cache,'place-coordinates.json'),JSON.stringify(points.referencePlaces));
 console.log('Pinned public map inputs ready. Run node scripts/build-tokyo-replan.cjs');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
