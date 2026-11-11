'use strict';
// Public official references for offline build-time research. The complete
// official tables are not copied into the public site's timetable packs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const refs=require('./shinkansen-reference-inputs.json'),cache=path.resolve(process.env.TOKYO_TIMETABLE_CACHE||path.join(__dirname,'../../tokyo-timetable-cache'));
(async()=>{fs.mkdirSync(cache,{recursive:true});for(let i=0;i<refs.files.length;i+=4)await Promise.all(refs.files.slice(i,i+4).map(async ref=>{
 const target=path.join(cache,ref.name);let bytes=fs.existsSync(target)?fs.readFileSync(target):null;
 if(!bytes){const r=await fetch(ref.url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Official reference unavailable: '+r.status);bytes=Buffer.from(await r.arrayBuffer());}
 if(crypto.createHash('sha256').update(bytes).digest('hex')!==ref.sha256)throw Error('Official reference changed; review before rebuilding '+ref.name);
 fs.writeFileSync(target,bytes);
}));console.log('Verified '+refs.files.length+' official reference pages (build cache only)');})().catch(e=>{console.error(e.message);process.exitCode=1;});
