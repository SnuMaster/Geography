'use strict';
const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{if(new URL(req.url,'http://localhost').pathname==='/japan-2027/index.html'){res.writeHead(308,{Location:'/japan-2027/'}).end();return;}const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}const target=fs.existsSync(file)&&fs.statSync(file).isDirectory()?path.join(file,'index.html'):file;fs.readFile(target,(e,b)=>{if(e){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});res.end(b);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'chrome'});try{
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];
  await page.addInitScript(()=>{if(!localStorage.getItem('routebook-reservations-v1'))localStorage.setItem('routebook-reservations-v1',JSON.stringify({'flight-tokyo':{complete:true,ticket:{flight:'TW251'}},'flight-return-tokyo':{complete:true},'fuji-excursion':{complete:true,memo:'열차표 메모'}}));});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/japan-2027/?day=1&variant=main');
  await page.waitForFunction(()=>window.__routebook,null,{timeout:15000}).catch(async err=>{throw Error((await page.locator('#mapLoading').textContent().catch(()=>''))+' '+errors.join(' / '),{cause:err});});
  await page.waitForFunction(()=>window.__routebook.state.routeData.days['12-main'][8].parts[0].flightTrack?.flightNumber==='MM809');
  const geo=await page.evaluate(()=>{
   const [a,b]=__routebook.getLeg(1).parts[0].coords;
   return [a,a.map((x,i)=>x+(b[i]-x)/3)].map(([latitude,longitude])=>({latitude,longitude,accuracy:8}));
  });
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation(geo[0]);
  await page.locator('#locationBtn').click();
  await page.waitForFunction(p=>RouteLocation.getFix()?.lat===p.latitude,geo[0]);
  await page.context().setGeolocation(geo[1]);
  await page.waitForFunction(p=>Object.values(__routebook.map._layers).some(layer=>{
   if(!layer.getElement?.()?.classList.contains('gps-location-marker'))return false;
   const dot=layer.getLatLng();
   return dot.lat===p.latitude&&dot.lng===p.longitude;
  }),geo[1]);
  await page.locator('#locationStop').click();
  assert.equal(await page.locator('.gps-location-marker').count(),0);
  await page.locator('#bookingChecklistBtn').evaluate(el=>el.click());
  const bookingCheck=await page.evaluate(()=>{
   const item=document.querySelector('[data-booking-item="fuji-excursion"]'),date=item?.querySelector('.booking-date')?.textContent||'';
   if(!date.includes('1/12'))throw Error('Wrong visible Fuji date '+date);
   const railGroup=item.closest('.booking-group'),nikko=railGroup.querySelector('[data-booking-item="nikko-express"]');
   if(!item.textContent.includes('12/12 10:00')||!nikko?.textContent.includes('12/15 09:00'))throw Error('Missing rail sale openings');
   if(!item.textContent.includes('공식 판매 대기 중')||!nikko.textContent.includes('공식 판매 대기 중')||!item.textContent.includes('78,032원')||!nikko.textContent.includes('47,100원'))throw Error('Pending rail orders are missing');
   if(item.querySelector('input').checked||nikko.querySelector('input').checked)throw Error('Pending rail ticket was marked confirmed');
   if(item.querySelector('[data-booking-memo]').value!=='열차표 메모')throw Error('Existing railway booking memo disappeared');
   const pass=railGroup.querySelector('[data-booking-item="nikko-pass-all-area"]');
   if(!pass||!/8,000(?:엔|\s+JP¥)/.test(pass.textContent)||!pass.textContent.includes('기타센주')||pass.querySelector('[data-booking-complete]').checked)throw Error('Wrong optional Nikko Pass purchase card');
   pass.querySelector('[data-booking-complete]').click();
   const changed=ReservationUI.getAssistantBookings();
   if(!changed.find(x=>x.key==='nikko-pass-all-area').confirmed||changed.find(x=>x.key==='nikko-express').confirmed)throw Error('Nikko Pass completion changed the train reservation');
   document.querySelector('[data-booking-item="nikko-pass-all-area"] [data-booking-complete]').click();
   const onSite=document.querySelector('#bookingOnSite');
   onSite.querySelector('summary').click();
   if(!onSite.open||!onSite.textContent.includes('나리타 스카이라이너')||onSite.querySelector('input'))throw Error('Wrong on-site purchase guide');
   document.querySelector('[data-booking-item="fuji-excursion"] [data-booking-complete]').click();
   if(!document.querySelector('#bookingOnSite').open)throw Error('On-site guide closed after checking a booking');
   if(!ReservationUI.getAssistantBookings().find(x=>x.key==='fuji-excursion')?.confirmed)throw Error('New booking completion did not save');
   document.querySelector('[data-booking-item="fuji-excursion"] [data-booking-complete]').click();
   let jump=null;const fn=e=>jump=e.detail;window.addEventListener('routebook:booking-jump',fn);
   document.querySelector('[data-booking-jump="fuji-excursion"]').click();window.removeEventListener('routebook:booking-jump',fn);
   return jump;
  });assert.equal(bookingCheck?.day,5);assert.equal(bookingCheck?.stop,'가와구치코역');
  await page.waitForFunction(()=>window.__routebook.state.day===5);
  await page.locator('#bookingChecklistBtn').evaluate(el=>el.click());
  const result=await page.evaluate(()=>{const r=window.__routebook,b=r.state;
   if(b.data.version!=='20261126-tokyo-rail-orders-1')throw Error('Old snapshot loaded');
   const bookings=ReservationUI.getAssistantBookings(),by=Object.fromEntries(bookings.map(x=>[x.key,x]));
   if(by['fuji-excursion']?.day!==5||by['nikko-express']?.day!==8)throw Error('Wrong booking dates');
   if(by['fuji-excursion'].status!=='공식 판매 대기 중'||by['nikko-express'].status!=='공식 판매 대기 중')throw Error('Wrong rail request status');
   if(bookings.some(x=>/hakone|ishikawa/.test(x.key)))throw Error('Retired booking remains');
   const ibuki=document.querySelector('[data-booking-item="ibuki"] .booking-date')?.textContent||'';
   if(!ibuki.includes('18:00'))throw Error('Ibuki time mismatch '+ibuki);
   const skytree=document.querySelector('[data-booking-item="skytree"]');
   if(!skytree?.textContent.includes('1/18 · 16:00')||document.querySelector('[data-booking-item="zutomayo"]'))throw Error('Wrong Jan 18 bookings');
   for(const [key,expected] of [['flight-tw251-20270108','TW251'],['flight-mm809-20270120','MM809'],['airport-bus-back-0650','06:50']]){
    const text=document.querySelector('[data-booking-item="'+key+'"]')?.textContent||'';
    if(!text.includes(expected))throw Error('New booking missing '+key);
   }
   const oldFlight=document.querySelector('[data-booking-item="flight-tw251-20270108"]');
   if(oldFlight.querySelector('input').checked||oldFlight.querySelector('.booking-ticket-fields'))throw Error('Old booking checkout migrated to the new flight');
   document.querySelector('[data-booking-jump="flight-mm809-20270120"]').click();
   if(r.state.day!==12||!document.querySelector('[data-leg="9"].search-highlight')?.textContent.includes('MM809'))throw Error('Return flight booking jump failed');
   r.setDay(1);
   if(r.getStops()[0]?.name!=='월성로 132')throw Error('First departure stop was overwritten');
   if(r.getLeg(1).parts[0].geometryAccuracy!=='mapped'||r.getLeg(1).parts[0].coords.length<100)throw Error('Departure taxi route is not mapped');
   r.selectLeg(2);
   if(!r.map._popup?.getElement()?.textContent.includes('1/8 11:10'))throw Error('Outbound flight schedule missing');
   r.map.closePopup();
   const pasmo=r.getStops().findIndex(s=>s.visitLabel==='TOURIST PASMO 구매');
   const pasmoPin=r.map.getContainer().querySelector('.leaflet-marker-icon[title*="TOURIST PASMO"]');
   if(pasmo<0||!pasmoPin)throw Error('Missing Tourist PASMO station pin');
   document.querySelector('#stopList [data-stop="'+pasmo+'"]').click();
   const pasmoPopup=r.map._popup?.getElement(),floorMap=pasmoPopup?.querySelector('a[href$="img_map_narita_2-3sta.webp"]');
   if(!pasmoPopup?.textContent.includes('SKYLINER & KEISEI INFORMATION CENTER')||!floorMap?.textContent.includes('B1 판매 위치 지도'))throw Error('Missing PASMO counter or floor map');
   r.map.closePopup();
   r.setDay(12);
   if(!document.querySelector('#stopList')?.textContent.includes('야나카 긴자'))throw Error('Missing last city day');
   r.selectLeg(9);
   if(!r.map._popup?.getElement()?.textContent.includes('1/20 01:55'))throw Error('Overnight flight date missing');
   if(!r.map._popup?.getElement()?.querySelector('.flight-track-source a')?.href.endsWith('/data/playback/42b68444'))throw Error('MM809 flight reference missing');
   r.selectLeg(10);
   const busPopup=r.map._popup?.getElement()?.textContent||'';
   if(!busPopup.includes('06:50')||!busPopup.includes('10:56')||!busPopup.includes('10B-3')||!busPopup.includes('동대구터미널 1층 하차장'))throw Error('Wrong return bus timetable or stops');
   const [station,destination]=r.getStops().slice(-2);
   const taxi=b.routeData.days['12-main'].at(-1);
   if(station.name!=='동대구역 택시 승강장'||destination.name!=='월성로 132'||destination.dayOffset!==1||taxi.parts[0].mode!=='taxi'||taxi.parts[0].geometryAccuracy!=='mapped'||taxi.parts[0].coords.length<100)throw Error('Missing return taxi');
   if(by['flight-mm809-20270120']?.day!==12||by['hotel-dome'])throw Error('Wrong lodging or return booking');
   const out=[];
   for(const d of b.data.days){r.setDay(d.n);r.setVariant('main');const ss=r.getStops();
    if(ss.length!==d.variants[0].stops.length)throw Error('Missing day stops '+d.n);
    if(d.n>2&&!document.querySelector('.day-breakfast')?.textContent.includes('08:00'))throw Error('Missing morning plan');
    if(document.querySelectorAll('#stopList .stop-card').length!==ss.length)throw Error('Missing rendered cards '+d.n);
    const panel=document.querySelector('#itineraryScroll');if(panel.scrollWidth>panel.clientWidth+2)throw Error('Sidebar overflow '+d.n);
    const legs=b.routeData.days[d.n+'-main'];for(let i=0;i<legs.length;i++)r.selectLeg(i+1);
    for(const [i,l]of legs.entries())if(l.busRoute){r.selectLeg(i+1);const box=r.map._popup?.getElement()?.querySelector('.bus-boarding-info');if(!box||!box.textContent.includes(l.busRoute.boarding.name)||!box.textContent.includes(l.busRoute.alighting.name))throw Error('Missing bus boarding details '+l.legId);if(l.busTimetable&&!box.querySelector('.bus-timetable')?.textContent.includes(l.busTimetable.trips[0][0]))throw Error('Missing official bus schedule '+l.legId);r.map.closePopup();}
    const photo={7:'odaiba',8:'nikko',10:'day-10',11:'day-2'}[d.n];
    if(photo&&!document.querySelector('#kisekiHeroPhoto').src.endsWith('/'+photo+'.jpg'))throw Error('Wrong itinerary photo '+d.n);
    if([5,8].includes(d.n)){const meal=ss.find(s=>s.planKey===(d.n===5?'fujiDinner':'nikkoDinner'));if(!meal||meal.details.costMax>2000)throw Error('Missing budget dinner');}
    out.push({day:d.n,stops:ss.length,legs:legs.length});
   }
   r.setDay(11);
   if(!document.querySelector('#stopList')?.textContent.includes('스카이트리 전망대')||r.getStops().some(s=>s.planKey==='free'))throw Error('Wrong Jan 18 route');
   r.setDay(2);
   if(r.getStops().length||document.querySelector('#stopList .stop-card')||!document.querySelector('#stopList')?.textContent.includes('비워뒀어요')||!document.querySelector('#playBtn').disabled)throw Error('Day 2 is not empty');
   for(const [day,leg,name,when] of [[5,2,'후지회유 15호','10:30'],[5,8,'후지회유 48호','17:41'],[8,1,'스페이시아 X 5호','10:12'],[8,6,'스페이시아 X 12호','17:44']]){
    r.setDay(day);r.selectLeg(leg);
    const order=r.map._popup?.getElement()?.querySelector('[data-rail-order]')?.textContent||'';
    if(!order.includes(name)||!order.includes(when))throw Error('Missing requested train in map details: '+name);
   }
   const el=r.map._popup?.getElement();if(!el?.querySelector('.operator-spacia-x')||el.querySelector('.operator-revaty'))throw Error('Wrong return train logo');
   return out;
  });
  assert.equal(result.length,12);assert.deepEqual(errors,[]);
  await page.waitForFunction(()=>[...document.querySelectorAll('.operator-spacia-x')].some(img=>img.complete&&img.naturalWidth>0));
  await page.screenshot({path:'qa-trip-review-'+width+'.png',fullPage:false});
  await page.evaluate(async()=>{
   window.__routebook.setDay(8);
   const previous=await TravelStore.snapshot();
   previous.data.days[7].photoDay=7;
   await TravelStore.saveSnapshot(previous.data,previous.routes,'previous-itinerary-photo');
  });
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#kisekiHeroPhoto')?.src.endsWith('/nikko.jpg'));
  const context=page.context();
  const externalStreet=[];
  await context.route(/overpass/,route=>{externalStreet.push(route.request().url());return route.abort();});
  await page.locator('#offlinePackBtn').evaluate(el=>el.click());
  await page.locator('#offlinePackSize').filter({hasText:/전체 \d+개 자료/}).waitFor();
  await page.locator('#offlinePackStart').click();
  await page.waitForFunction(()=>OfflinePack.record()?.complete,null,{timeout:45000}).catch(async error=>{throw Error(await page.locator('#offlinePackStatus').textContent(),{cause:error});});
  const stale=await page.evaluate(async()=>{
   const old=await fetch('assets/offline-streets/manifest.json').then(r=>r.json());
   const trip=window.__routebook.state,day=trip.data.days[1];
   const cache=await caches.open('trip-street-data-v1');
   await cache.put(new URL('offline-streets/day-2.json',document.baseURI),new Response(JSON.stringify({version:1,day:2,points:old.days['2'].points,elements:[{type:'way'}],savedAt:Date.now()})));
   return OfflineRoads.get(day,trip.routeData);
  });
  assert.equal(stale,null);
  await page.locator('#offlineStreetSize').filter({hasText:/MB/}).waitFor();
  await page.locator('#offlineStreetStart').click();
  await page.locator('#offlineStreetStatus').filter({hasText:/12\/12일 저장 완료/}).waitFor({timeout:45000}).catch(async error=>{throw Error(await page.locator('#offlineStreetStatus').textContent(),{cause:error});});
  assert.deepEqual(externalStreet,[]);
  const redirects=await page.evaluate(async()=>{
   const shell=await caches.open('routebook-shell-'+OfflinePack.REVISION);
   const rootUrl=new URL('./',document.baseURI),indexUrl=new URL('index.html',document.baseURI);
   const values=await Promise.all([shell.match(rootUrl),shell.match(indexUrl)]);
   await shell.delete(rootUrl);
   return values.map(response=>response?.redirected);
  });
  assert.deepEqual(redirects,[false,true]);
  await context.setOffline(true);
  const response=await page.reload({waitUntil:'domcontentloaded'});
  assert.equal(response.fromServiceWorker(),true);
  await page.waitForFunction(()=>window.__routebook?.state.data.days.length===12);
  assert.equal(await page.evaluate(()=>OfflinePack.verifyStored()),true);
  const stored=await page.evaluate(async()=>{
   const r=window.__routebook,trip=r.state;
   const maps=await Promise.all(trip.data.days.map(d=>OfflineRoads.get(d,trip.routeData)));
   r.setDay(8);
   r.map.setView([36.74,139.5],15);
   return maps.filter(m=>m?.elements.some(e=>e.tags?.highway)).length;
  });
  assert.equal(stored,12);
  await page.waitForFunction(()=>document.querySelector('#map').classList.contains('offline-map-active')&&window.__routebook.map.getPane('offlineRoads')?.querySelector('canvas'));
  await page.waitForFunction(()=>{const img=document.querySelector('#kisekiHeroPhoto');return img?.src.endsWith('/nikko.jpg')&&img.naturalWidth>0;});
  console.log(JSON.stringify({width,days:result,offlineMaps:stored}));await page.close();
 }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e.stack);server.close();process.exitCode=1;});
