'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'../japan-2027'),revision='20261111-nonjr-review-1';
// Git and Pages checkouts use LF for these files. Hash the same bytes on
// Windows, otherwise a clean checkout can invalidate the offline manifest.
for(const name of ['index.html','sw.js']){const f=path.join(root,name),text=fs.readFileSync(f,'utf8');fs.writeFileSync(f,text.replaceAll('\r\n','\n'));}
const shell=JSON.parse(fs.readFileSync(path.join(root,'sw.js'),'utf8').match(/const FILES=(\[.*?\]);/)[1].replaceAll("'",'"'));
require(path.join(root,'rail-departure-profiles.js'));
const previous=JSON.parse(fs.readFileSync(path.join(root,'offline-manifest.json'),'utf8'));
// Generated timetable packs are replaced as OD paths change. Reuse only
// permanent data files from the previous manifest, then add current profiles.
const generated=name=>/^timetables\/tokyo27-(?:[a-f0-9]{14}|hakone-cable)\.json$/.test(name);
const data=['trip-update.json',...previous.files.filter(f=>f.kind==='json'&&!generated(f.path)).map(f=>f.path),...Object.values(globalThis.RailDepartureProfiles.profiles).map(p=>p.file)];
const files=[];for(const [kind,names]of [['shell',shell],['json',data]])for(const name of [...new Set(names)].filter(x=>x!=='./').sort()){const bytes=fs.readFileSync(path.join(root,name));files.push({path:name,kind,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}
fs.writeFileSync(path.join(root,'offline-manifest.json'),JSON.stringify({revision,totalBytes:files.reduce((n,f)=>n+f.bytes,0),files})+'\n');
console.log(`Offline package: ${files.length} files, hashes regenerated`);
