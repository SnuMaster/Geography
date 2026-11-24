'use strict';
const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}const target=fs.existsSync(file)&&fs.statSync(file).isDirectory()?path.join(file,'index.html'):file;fs.readFile(target,(e,b)=>{if(e){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});res.end(b);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'chrome'});try{
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/japan-2027/?day=1&variant=main');
  await page.waitForFunction(()=>window.__routebook,null,{timeout:15000}).catch(async err=>{throw Error((await page.locator('#mapLoading').textContent().catch(()=>''))+' '+errors.join(' / '),{cause:err});});
  await page.locator('#bookingChecklistBtn').evaluate(el=>el.click());
  const bookingCheck=await page.evaluate(()=>{
   const item=document.querySelector('[data-booking-item="fuji-excursion"]'),date=item?.querySelector('.booking-date')?.textContent||'';
   if(!date.includes('1/12'))throw Error('Wrong visible Fuji date '+date);
   item.querySelector('[data-booking-complete]').click();
   if(!ReservationUI.getAssistantBookings().find(x=>x.key==='fuji-excursion')?.confirmed)throw Error('New booking completion did not save');
   document.querySelector('[data-booking-item="fuji-excursion"] [data-booking-complete]').click();
   let jump=null;const fn=e=>jump=e.detail;window.addEventListener('routebook:booking-jump',fn);
   document.querySelector('[data-booking-jump="fuji-excursion"]').click();window.removeEventListener('routebook:booking-jump',fn);
   return jump;
  });assert.equal(bookingCheck?.day,5);assert.equal(bookingCheck?.stop,'가와구치코역');
  await page.waitForFunction(()=>window.__routebook.state.day===5);
  await page.locator('#bookingChecklistBtn').evaluate(el=>el.click());
  const result=await page.evaluate(()=>{const r=window.__routebook,b=r.state;
   if(b.data.version!=='20261124-tokyo-12-days')throw Error('Old snapshot loaded');
   const bookings=ReservationUI.getAssistantBookings(),by=Object.fromEntries(bookings.map(x=>[x.key,x]));
   if(by['fuji-excursion']?.day!==5||by['nikko-express']?.day!==8)throw Error('Wrong booking dates');
   if(bookings.some(x=>/hakone|ishikawa/.test(x.key)))throw Error('Retired booking remains');
   const ibuki=document.querySelector('[data-booking-item="ibuki"] .booking-date')?.textContent||'';
   if(!ibuki.includes('18:00'))throw Error('Ibuki time mismatch '+ibuki);
   ReservationUI.closeChecklist();
   if(by['flight-return-tokyo']?.day!==12||by['hotel-dome'])throw Error('Wrong lodging or return booking');
   const out=[];
   for(const d of b.data.days){r.setDay(d.n);r.setVariant('main');const ss=r.getStops();
    if(ss.length!==d.variants[0].stops.length)throw Error('Missing day stops '+d.n);
    if(d.n>1&&!document.querySelector('.day-breakfast')?.textContent.includes('08:00'))throw Error('Missing morning plan');
    if(document.querySelectorAll('#stopList .stop-card').length!==ss.length)throw Error('Missing rendered cards '+d.n);
    const panel=document.querySelector('#itineraryScroll');if(panel.scrollWidth>panel.clientWidth+2)throw Error('Sidebar overflow '+d.n);
    const legs=b.routeData.days[d.n+'-main'];for(let i=0;i<legs.length;i++)r.selectLeg(i+1);
    for(const [i,l]of legs.entries())if(l.busRoute){r.selectLeg(i+1);const box=r.map._popup?.getElement()?.querySelector('.bus-boarding-info');if(!box||!box.textContent.includes(l.busRoute.boarding.name)||!box.textContent.includes(l.busRoute.alighting.name))throw Error('Missing bus boarding details '+l.legId);r.map.closePopup();}
    if([5,8].includes(d.n)){const meal=ss.find(s=>s.planKey===(d.n===5?'fujiDinner':'nikkoDinner'));if(!meal||meal.details.costMax>2000)throw Error('Missing budget dinner');}
    out.push({day:d.n,stops:ss.length,legs:legs.length});
   }
   r.setDay(2);
   const temple=[...document.querySelectorAll('#stopList .stop-card')].find(el=>el.textContent.includes('하세데라'));
   if(!temple?.textContent.includes('미하라시다이'))throw Error('Place detail did not render');
   r.setDay(8);r.selectLeg(6);
   const el=r.map._popup?.getElement();if(!el?.querySelector('.operator-spacia-x')||el.querySelector('.operator-revaty'))throw Error('Wrong return train logo');
   return out;
  });
  assert.equal(result.length,12);assert.deepEqual(errors,[]);
  await page.waitForFunction(()=>[...document.querySelectorAll('.operator-spacia-x')].some(img=>img.complete&&img.naturalWidth>0));
  await page.screenshot({path:'qa-trip-review-'+width+'.png',fullPage:false});
  console.log(JSON.stringify({width,days:result}));await page.close();
 }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e.stack);server.close();process.exitCode=1;});
