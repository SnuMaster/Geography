'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
(async()=>{
 const pages=['https://bus.fujikyu.co.jp/fujitour/kawaguchiko/','https://bus.fujikyu.co.jp/rosen/shuyu'];
 for(const url of pages){const r=await fetch(url);const t=await r.text();console.log('PAGE',url,r.status);console.log([...new Set([...t.matchAll(/(?:href|src)=["']([^"']+)["']/g)].map(m=>m[1]).filter(s=>/pdf|shuyu|fare|unchin|kawaguchiko|\.png|\.jpg/.test(s)))].join('\n'));}
 const docs=[
 ['nikko','https://www.tobu-bus.com/uploads/files/'+encodeURIComponent('日光運賃改定３')+'.pdf','1'],
 ['fuji-old','https://www.fujikyubus.co.jp/pdf/rosen/fare_honsha_202410.pdf',''],
 ['fuji','https://bus.fujikyu.co.jp/pdf/rosen/fare_honsha_202410.pdf','']
 ];
 for(const [name,url,page]of docs){try{const r=await fetch(url);console.log('PDF',name,url,r.status);if(!r.ok)continue;const bytes=Buffer.from(await r.arrayBuffer());fs.writeFileSync('/tmp/'+name+'.pdf',bytes);console.log('SHA256',name,crypto.createHash('sha256').update(bytes).digest('hex'));const args=['-layout',...(page?['-f',page,'-l',page]:[]),'/tmp/'+name+'.pdf','-'];const txt=cp.execFileSync('pdftotext',args,{encoding:'utf8',maxBuffer:10e6});console.log('LAYOUT',name);console.log(txt.slice(0,50000));}catch(e){console.log(name,e.message);}}
})().catch(e=>{console.error(e);process.exitCode=1;});
