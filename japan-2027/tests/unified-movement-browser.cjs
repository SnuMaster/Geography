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
  const result=await page.evaluate(()=>{
   const r=window.__routebook,report=[];
   function audit(leg){
    const items=routeVisuals.filter(v=>v.day===leg.dayNumber&&v.variant===leg.variant&&v.index===leg.legIndex),hits=items.filter(v=>v.role==='movement-hit'),lines=items.filter(v=>v.role==='movement-line'),plan=movementMapPlan(leg);
    if(hits.length!==(plan.parts.length?1:0))throw Error('Split hit target '+leg.legId);
    if(!hits.length)return;
    if(new Set(lines.map(v=>v.layer.options.color)).size!==1)throw Error('Split color '+leg.legId);
    if(JSON.stringify(hits[0].layer.getLatLngs().map(ps=>ps.map(p=>[p.lat,p.lng])))!==JSON.stringify(plan.parts.map(p=>p.coords)))throw Error('Geometry changed '+leg.legId);
    const hit=hits[0].layer;
    hit.fire('mouseover',{containerPoint:r.map.getSize().divideBy(2),originalEvent:{pointerType:'mouse'}});
    if(!lines.every(v=>v.layer.options.weight===7&&v.layer.options.opacity===1))throw Error('Partial highlight '+leg.legId);
    const tip=document.querySelector('#railHoverCard');
    if(tip.hidden||!tip.textContent.includes(leg.from)||!tip.textContent.includes(leg.to))throw Error('Partial tooltip '+leg.legId);
    hit.fire('mouseout');
    for(const v of lines)if(v.layer.options.weight!==v.baseStyle.weight||v.layer.options.opacity!==v.baseStyle.opacity)throw Error('Stuck highlight '+leg.legId);
   }
   for(const d of r.state.data.days){r.setDay(d.n);const legs=r.state.routeData.days[d.n+'-main'];for(const leg of legs){r.focusLeg(leg.legIndex);audit(leg);}report.push({day:d.n,movements:legs.length});}
   r.command.allRoutes(true);
   for(const legs of Object.values(r.state.routeData.days))for(const leg of legs)audit(leg);
   const leg=r.state.routeData.days['10-main'][0],hit=routeVisuals.find(v=>v.role==='movement-hit'&&v.day===10&&v.index===1).layer;
   hit.fire('click',{latlng:hit.getBounds().getCenter()});
   if(r.focusedContext().day.n!==10||r.focusedIndex()!==1)throw Error('Overview click did not select full movement');
   r.map.closePopup();r.setDay(10);r.focusLeg(1,{fit:true});
   const daily=routeVisuals.find(v=>v.role==='movement-hit'&&v.day===10&&v.index===1).layer;
   daily.fire('click',{latlng:daily.getBounds().getCenter()});
   if(r.focusedIndex()!==1)throw Error('Daily click selection failed');
   const popup=r.map._popup;if(!popup||popup.options.routeLegIndex!==1)throw Error('Missing whole-movement popup');
   if(typeof popup.getContent()!=='string'||!popup.getContent().includes('departure-sequence'))throw Error('Only partial boarding details opened');
   r.map.closePopup();
   return report;
  });
  assert.equal(result.length,15);assert.deepEqual(errors,[]);
  await page.screenshot({path:'qa-unified-movement-'+width+'.png',fullPage:false});
  console.log(JSON.stringify({width,days:result}));await page.close();
 }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e.stack);server.close();process.exitCode=1;});
