'use strict';
const assert=require('node:assert/strict'),{chromium,webkit}=require('playwright'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../..'),origin='https://records.test';
(async()=>{
 const m=await import('../../assistant-worker/worker.mjs'),spaces=new Map(),env={ALLOWED_ORIGINS:origin,SESSION_SECRET:'fixture-records-secret-at-least-32-chars',MODEL:'gpt-6-luna'};
 const engine=process.env.ASSISTANT_BROWSER==='webkit'?webkit:chromium,browser=await engine.launch({headless:true,channel:engine===chromium&&process.env.CI?'chrome':undefined});
 env.BUDGET={idFromName:x=>x,get:id=>{if(!spaces.has(id)){const memory=new Map();let queue=Promise.resolve();const tx={get:async k=>structuredClone(memory.get(k)),put:async(k,v)=>memory.set(k,structuredClone(v)),delete:async k=>memory.delete(k)};spaces.set(id,new m.BudgetGate({storage:{transaction:fn=>{const p=queue.then(()=>fn(tx));queue=p.catch(()=>{});return p;}}},env));}return {fetch:(url,init)=>spaces.get(id).fetch(new Request(url,init))};}};
 const errors=[],requests=[];
 async function device(width){
  const c=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
  await c.route(origin+'/**',async r=>{const req=r.request(),u=new URL(req.url());
   if(/^\/(account|records|me|models|usage)(\/|$)/.test(u.pathname)){requests.push(u.pathname);const response=await m.default.fetch(new Request(req.url(),{method:req.method(),headers:{...req.headers(),origin},body:req.method()==='POST'?req.postData():undefined}),env);return r.fulfill({status:response.status,body:await response.text(),headers:Object.fromEntries(response.headers)});}
   if(u.pathname.endsWith('/assistant-config.js'))return r.fulfill({contentType:'text/javascript',body:`globalThis.TravelAssistantConfig={enabled:true,apiBase:'${origin}'};`});
   const target=path.resolve(root,'.'+u.pathname+(u.pathname.endsWith('/')?'index.html':''));if(!target.startsWith(root+path.sep)||u.pathname.includes('/assistant-worker/'))return r.fulfill({status:403});return r.fulfill({path:target});
  });
  const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/japan-2027/?day=15&variant=main&place=d15-main-1');await p.waitForFunction(()=>window.CommandCenter&&window.__routebook?.state?.data&&document.querySelector('#personalSyncNow'));return {c,p};
 }
 try{
  const d1=await device(1280),d2=await device(390),a=d1.p,b=d2.p;
  await a.evaluate(()=>TravelAssistant.updatePersonal(p=>{p.expenses=[TravelAssistantCore.expense(15,'JPY',500,'식비','sync fixture'),TravelAssistantCore.lodgingExpense(12,18,'JPY',6000,'stay sync fixture')];p.visits['15|main|d15-main-1']=true;}));
  await a.evaluate(()=>DetailView.close());await a.locator('#ccRecords').click();await a.locator('#ccNote').fill('PC note fixture');await a.locator('#ccSaveNote').click();
  await a.locator('#ccFile').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1kAAAAASUVORK5CYII=','base64')});await a.waitForFunction(()=>document.querySelector('#ccFiles').textContent.includes('fixture.png'));
  await a.evaluate(()=>TravelAssistant.account('register',{username:'alpha',password:'1234'}));await a.waitForFunction(()=>PersonalSync.statusText().includes('동기화 완료'));
  await b.evaluate(()=>TravelAssistant.account('login',{username:'alpha',password:'1234'}));await b.waitForFunction(()=>TravelAssistant.getPersonal().expenses[0]?.amount===500).catch(async e=>{console.log(await b.evaluate(()=>({status:PersonalSync.statusText(),scope:AccountRecords.scope(),expenses:TravelAssistant.getPersonal().expenses.length})));throw e;});assert.equal(await b.evaluate(()=>AccountRecords.storage.getItem('routebook-command-v1').includes('PC note fixture')),true);
  assert.deepEqual(await b.evaluate(()=>TravelAssistant.getPersonal().expenses[1].allocation),{startDay:12,endDay:18});assert.equal(await b.evaluate(()=>TravelAssistantCore.expenses(TravelAssistant.getPersonal().expenses,15).daily.JPY),1500);
  await b.evaluate(()=>DetailView.close());await b.locator('#ccRecords').click();await b.locator('details').filter({has:b.locator('#ccFileOwner')}).locator('summary').first().click();await b.locator('#ccFileOwner').selectOption('day:15|main');await b.waitForFunction(()=>document.querySelector('#ccFiles').textContent.includes('fixture.png'));
  const stableBefore=await a.evaluate(async()=>(await TravelAssistant.recordsRequest('/records')).revision);await a.evaluate(async()=>{for(let i=0;i<3;i++)await PersonalSync.sync();});const stableAfter=await a.evaluate(async()=>(await TravelAssistant.recordsRequest('/records')).revision);assert.equal(stableAfter,stableBefore,'unchanged attachments must not create phantom revisions');
  await d1.c.setOffline(true);await a.evaluate(()=>TravelAssistant.updatePersonal(p=>p.expenses[0].amount=600));await b.evaluate(()=>TravelAssistant.updatePersonal(p=>p.expenses[0].amount=700));await b.waitForFunction(()=>PersonalSync.statusText().includes('동기화 완료'));
  await d1.c.setOffline(false);await a.waitForFunction(()=>!document.querySelector('#personalSyncConflict').hidden);assert.equal(await a.evaluate(()=>TravelAssistant.getPersonal().expenses[0].amount),600);
  await a.locator('#personalSyncServer').click();await a.waitForFunction(()=>TravelAssistant.getPersonal().expenses[0]?.amount===700);
  await a.evaluate(()=>TravelAssistant.logout());await a.waitForFunction(()=>TravelAssistant.getPersonal().expenses.length===0);await a.evaluate(()=>TravelAssistant.account('register',{username:'bravo',password:'1234'}));await a.waitForFunction(()=>PersonalSync.statusText().includes('동기화 완료'));assert.equal(await a.evaluate(()=>TravelAssistant.getPersonal().expenses.length),0);assert.equal(await a.evaluate(()=>AccountRecords.storage.getItem('routebook-command-v1')),null);
  await a.evaluate(()=>TravelAssistant.logout());await a.evaluate(()=>TravelAssistant.account('login',{username:'alpha',password:'1234'}));await a.waitForFunction(()=>TravelAssistant.getPersonal().expenses[0]?.amount===700);
  assert.deepEqual(errors,[]);assert.equal(requests.some(x=>['/chat','/analyze'].includes(x)),false);console.log(engine.name()+': desktop/mobile notes, expenses, visits, attachment, offline conflict approval, logout and account isolation passed');await d1.c.close();await d2.c.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
