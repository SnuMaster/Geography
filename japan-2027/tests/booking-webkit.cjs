'use strict';
// Exercises the checklist in WebKit, including its actual scrollable geometry.
const {webkit}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403).end();return;}const target=fs.existsSync(file)&&fs.statSync(file).isDirectory()?path.join(file,'index.html'):file;fs.readFile(target,(err,body)=>{if(err){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);});});
const assert=(ok,message)=>{if(!ok)throw Error(message);};
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await webkit.launch(),base=`http://127.0.0.1:${server.address().port}/japan-2027/`,failures=[];
 try{
  for(const [name,width,height] of [['iphone',390,844],['ipad-portrait',768,1024],['ipad-landscape',1366,1024]]){
   const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:2,isMobile:true,hasTouch:true,userAgent:name==='iphone'?'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1':'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto(base+'?day=14');await page.waitForSelector('#ridePanel',{state:'attached'});await page.locator('#bookingChecklistBtn').click();
    for(const filter of ['all','pending','done','all']){
     if(filter!=='all'||await page.locator('[data-booking-filter="done"]').getAttribute('aria-pressed')==='true')await page.locator(`[data-booking-filter="${filter}"]`).click();
     const m=await page.evaluate(()=>{const dialog=document.querySelector('#bookingChecklistDialog'),body=dialog.querySelector('.booking-dialog-body'),first=body.querySelector('.booking-item, .booking-empty'),dr=dialog.getBoundingClientRect(),br=body.getBoundingClientRect(),fr=first?.getBoundingClientRect(),cs=getComputedStyle(body);return {filter:dialog.querySelector('[data-booking-filter][aria-pressed=true]')?.dataset.bookingFilter,count:dialog.querySelectorAll('[data-booking-item]').length,dialog:{top:dr.top,bottom:dr.bottom,height:dr.height},body:{top:br.top,bottom:br.bottom,height:br.height,client:body.clientHeight,scroll:body.scrollHeight,flex:cs.flex},first:fr&&{top:fr.top,bottom:fr.bottom,height:fr.height},text:body.innerText.slice(0,80)};});
     console.log(name,filter,JSON.stringify(m));await page.screenshot({path:`qa-webkit-${name}-${filter}.png`});
     assert(m.filter===filter,'wrong filter');assert(m.body.client>=80,'checklist body collapsed');assert(m.first&&m.first.top<m.body.bottom&&m.first.bottom>m.body.top,'first result not visible in scroll area');assert(m.dialog.top>=-1&&m.dialog.bottom<=height+1,'dialog exceeds viewport');
    }
    await page.locator('[data-booking-complete="zutomayo"]').check();assert((await page.locator('#bookingChecklistCount').textContent()).includes('1 / 24'),'count did not update');
    await page.locator('[data-booking-filter="pending"]').click();assert(await page.locator('[data-booking-item="zutomayo"]').count()===0,'completed item still shown in pending');
    await page.locator('[data-booking-filter="done"]').click();assert(await page.locator('[data-booking-item="zutomayo"]').count()===1,'completed item missing in done');
    assert(errors.length===0,'page errors: '+errors.join(', '));
   }catch(e){failures.push(`${name}: ${e.message}`);console.error('FAIL',name,e.message,'errors',errors);}
   await context.close();
  }
 }finally{await browser.close();server.close();}
 if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}else console.log('All WebKit checklist layout and filter checks passed.');
})().catch(e=>{console.error(e);process.exit(1);});
