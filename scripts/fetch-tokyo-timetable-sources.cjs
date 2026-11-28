'use strict';
// Fetch only pinned public snapshots; never needs an API key or account.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const input=require('./tokyo-timetable-source-files.json'),cable=require('./hakone-cable-timetable.json');
const cache=path.resolve(process.env.TOKYO_TIMETABLE_CACHE||path.join(__dirname,'../../tokyo-timetable-cache'));
async function get(name,url,sha){const target=path.join(cache,name);let bytes=fs.existsSync(target)?fs.readFileSync(target):null;if(!bytes){const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(name+': HTTP '+r.status);bytes=Buffer.from(await r.arrayBuffer());}if(crypto.createHash('sha256').update(bytes).digest('hex')!==sha)throw Error('Source changed; review before rebuilding: '+name);fs.writeFileSync(target,bytes);}
(async()=>{fs.mkdirSync(cache,{recursive:true});for(let i=0;i<input.files.length;i+=4)await Promise.all(input.files.slice(i,i+4).map(f=>get(f.name,'https://raw.githubusercontent.com/nagix/mini-tokyo-3d/'+input.pin+'/'+f.path,f.sha256)));await get('hakone-202603.pdf',cable.source,cable.sourceSha256);console.log('Verified '+input.files.length+' pinned JSON snapshots and the official Hakone PDF');})().catch(e=>{console.error(e.message);process.exitCode=1;});
