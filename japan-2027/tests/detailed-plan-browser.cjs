'use strict';
const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}const target=fs.existsSync(file)&&fs.statSync(file).isDirectory()?path.join(file,'index.html'):file;fs.readFile(target,(e,b)=>{if(e){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});res.end(b);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'chrome'});try{
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/japan-2027/?day=1&variant=main');
  await page.waitForFunction(()=>window.__routebook,{timeout:60000});
  const result=await page.evaluate(()=>{const r=window.__routebook,b=r.state;
   if(b.data.version!=='20261118-detailed-plan-1')throw Error('Old snapshot loaded');
   const out=[];
   for(const d of b.data.days){r.setDay(d.n);r.setVariant('main');const ss=r.getStops();
    if(ss.length!==d.variants[0].stops.length)throw Error('Missing day stops '+d.n);
    if(document.querySelectorAll('#stopList .stop-card').length!==ss.length)throw Error('Missing rendered cards '+d.n);
    const panel=document.querySelector('#itineraryScroll');if(panel.scrollWidth>panel.clientWidth+2)throw Error('Sidebar overflow '+d.n);
    const legs=b.routeData.days[d.n+'-main'];for(let i=0;i<legs.length;i++)r.selectLeg(i);
    out.push({day:d.n,stops:ss.length,legs:legs.length});
   }
   r.setDay(8);r.selectStop(2);
   return out;
  });
  assert.equal(result.length,15);assert.deepEqual(errors,[]);
  await page.screenshot({path:'qa-detailed-plan-'+width+'.png',fullPage:false});
  console.log(JSON.stringify({width,days:result}));await page.close();
 }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e.stack);server.close();process.exitCode=1;});
