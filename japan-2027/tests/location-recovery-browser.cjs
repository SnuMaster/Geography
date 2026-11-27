'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const file=path.resolve(root,'.'+pathname.replace(/^\/japan-2027\//,'/'),pathname.endsWith('/')?'index.html':'');
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 try{
  const bytes=await fs.readFile(file);
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});
  res.end(bytes);
 }catch(_){res.writeHead(404).end();}
});

async function recovery(page,url){
 await page.addInitScript(()=>{
  const NativeDate=Date;
  let now=NativeDate.parse('2027-01-18T12:00:00+09:00'),hidden=false;
  window.Date=class extends NativeDate{
   constructor(...args){super(...(args.length?args:[now]));}
   static now(){return now;}
  };
  Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
  const watches=[],cleared=[];
  Object.defineProperty(navigator,'geolocation',{configurable:true,value:{
   watchPosition(success,error,options){return watches.push({success,error,options})-1;},
   clearWatch(id){cleared.push(id);}
  }});
  window.gpsQA={
   show(value){hidden=!value;document.dispatchEvent(new Event('visibilitychange'));},
   lifecycle(type){document.dispatchEvent(new Event(type));},
   page(type,persisted){window.dispatchEvent(new PageTransitionEvent(type,{persisted}));},
   clock(value){now=typeof value==='string'?Date.parse(value):now+value;},
   send(id,latitude,longitude,accuracy=8,age=0){
    watches[id].success({timestamp:now-age,coords:{latitude,longitude,accuracy}});
   },
   error(id,code){watches[id].error({code});},
   requests:()=>watches.map(w=>w.options.maximumAge),
   isHighAccuracy:id=>watches[id].options.enableHighAccuracy,
   cleared:()=>cleared.slice()
  };
 });
 await page.goto(url);
 await page.waitForFunction(()=>window.__routebook);
 const button=page.locator('#locationBtn');
 const state=()=>page.locator('#locationCard').getAttribute('data-state');
 const readFix=()=>page.evaluate(()=>RouteLocation.getFix());
 await button.click();
 await page.evaluate(()=>gpsQA.send(0,35.71423,139.79630));
 await page.locator('.gps-location-marker').waitFor();
 await page.evaluate(()=>{RouteLocation.pauseFollow();gpsQA.show(false);gpsQA.clock(40000);gpsQA.show(true);});
 assert.deepEqual(await page.evaluate(()=>gpsQA.requests()),[5000,0],'returning to the app requests a fresh fix');
 assert.deepEqual(await page.evaluate(()=>gpsQA.cleared()),[0],'one watcher remains after resume');
 assert.equal(await state(),'stale');
 assert.equal(await page.locator('#locationNext').textContent(),'');
 await page.evaluate(()=>gpsQA.send(0,35.70,139.78));
 assert.equal((await readFix()).lat,35.71423,'late fixes from the old watcher are ignored');
 await page.evaluate(()=>{gpsQA.clock(3000);gpsQA.send(1,35.725,139.806);});
 assert.equal((await readFix()).lat,35.725,'jump filter does not trap reacquisition against an old fix');
 assert.notEqual(await state(),'stale');
 assert.equal(await page.evaluate(()=>RouteLocation.getStatus().following),false,'resume preserves manual map exploration');

 await page.evaluate(()=>{gpsQA.page('pagehide',true);gpsQA.clock(45000);gpsQA.page('pageshow',true);});
 assert.deepEqual(await page.evaluate(()=>gpsQA.requests()),[5000,0,0],'back/forward cache restore reacquires opted-in tracking');
 await page.evaluate(()=>gpsQA.send(2,35.7251,139.8061));
 await page.evaluate(()=>gpsQA.error(2,1));
 assert.equal(await button.getAttribute('aria-pressed'),'false');
 assert.equal(await readFix(),null);
 assert.equal(await page.locator('.gps-location-marker').count(),0);
 await page.evaluate(()=>{gpsQA.show(false);gpsQA.show(true);});
 assert.equal(await page.evaluate(()=>gpsQA.requests().length),3,'denied tracking never restarts on focus');

 await page.evaluate(()=>{gpsQA.clock('2027-01-20T11:15:00+09:00');__routebook.setDay(1);});
 await button.click();
 assert.equal(await page.evaluate(()=>__routebook.state.day),12,'overnight homebound legs are part of day 12');
 await page.evaluate(()=>gpsQA.error(3,3));
 assert.equal(await page.evaluate(()=>gpsQA.isHighAccuracy(4)),false,'first timeout falls back to a standard location request');
 await page.evaluate(()=>gpsQA.error(4,2));
 await page.locator('#locationRetry').click();
 assert.equal(await page.evaluate(()=>gpsQA.isHighAccuracy(5)),true,'retry starts a fresh high-accuracy request');
 await page.evaluate(()=>gpsQA.send(5,35.8779,128.6289));
 await page.locator('.gps-location-marker').waitFor();
 await page.evaluate(()=>gpsQA.clock(40000));
 await page.waitForFunction(()=>gpsQA.requests().length===7,null,{timeout:8000});
 assert.equal(await state(),'stale','a silent watcher is restarted after the last fix expires');
 assert.match(await page.locator('#locationAccuracy').textContent(),/마지막 위치/);
 await page.evaluate(()=>gpsQA.send(6,35.8792,128.6281));
 assert.equal((await readFix()).lat,35.8792);
 await page.locator('#locationStop').click();
 assert.equal(await button.getAttribute('aria-pressed'),'false');
 await page.evaluate(()=>{gpsQA.page('pagehide',true);gpsQA.page('pageshow',true);});
 assert.equal(await page.evaluate(()=>gpsQA.requests().length),7,'stopped tracking never restarts on restore');

 await button.click();
 await page.evaluate(()=>{gpsQA.show(false);gpsQA.send(7,35.8792,128.6281);gpsQA.show(true);});
 assert.equal(await readFix(),null,'ignore the first location while the permission prompt hides the screen');
 assert.equal((await page.evaluate(()=>gpsQA.requests())).at(-1),0);
 await page.evaluate(()=>gpsQA.send(8,35.8792,128.6281));
 await page.locator('.gps-location-marker').waitFor();
 await page.evaluate(()=>{gpsQA.lifecycle('freeze');gpsQA.clock(3000);gpsQA.lifecycle('resume');});
 assert.equal(await page.evaluate(()=>gpsQA.requests().length),10,'a frozen tab requests a new fix');
 await page.evaluate(()=>gpsQA.send(9,35.87,128.63,8,1000));
 assert.equal((await readFix()).lat,35.8792,'a pre-resume cached fix cannot refresh the marker');
 await page.evaluate(()=>gpsQA.error(9,3));
 assert.equal(await page.evaluate(()=>gpsQA.isHighAccuracy(10)),false,'a stalled resume with an old fix also uses standard accuracy');
 await page.evaluate(()=>{gpsQA.clock(500);gpsQA.send(10,35.87,128.63);});
 assert.equal((await readFix()).lat,35.87,'resume recovers immediately even when the previous marker was far away');
 await page.evaluate(()=>{gpsQA.clock(35000);window.dispatchEvent(new Event('focus'));});
 assert.equal(await state(),'stale','focus recovers a stale watch when the browser omitted visibility changes');
 assert.equal(await page.evaluate(()=>gpsQA.isHighAccuracy(11)),true);
 await page.locator('#locationStop').click();
}

(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  for(const width of [390,1440]){
   const page=await browser.newPage({viewport:{width,height:900},isMobile:width<700});
   await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
   await recovery(page,origin+'/japan-2027/?day=11&variant=main');
   await page.close();
   console.log(width+'px: first fix, provider timeout, stale position, resume, permission revocation and overnight date passed');
  }
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
