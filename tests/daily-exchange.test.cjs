'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),FX=require('../japan-2027/daily-exchange');
const start=Date.parse('2026-11-02T10:00:00+09:00'),raw={date:'2026-10-30',base:'JPY',quote:'KRW',rate:8.4913};
const store=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};};
const response=data=>new Response(JSON.stringify(data));
test('JPY/KRW uses the stated fixing date, correct 100-yen scale and Korean/Japanese midnight',()=>{
 assert.equal(FX.format(FX.validRate(raw,start).rate),'849.13');assert.equal(FX.validRate(raw,start).date,'2026-10-30');
 assert.equal(FX.dayKey(Date.parse('2026-11-01T15:00:00Z')),'2026-11-02');
 for(const bad of [{...raw,quote:'JPY'},{...raw,rate:0},{...raw,rate:-1},{...raw,rate:Infinity},{...raw,rate:'8.4'},{...raw,date:'2026-02-30'},{...raw,date:'2026-11-03'}])assert.throws(()=>FX.validRate(bad,start));
 assert.throws(()=>FX.validRate(raw,start,start+3600000));
});
test('one automatic check per local date, including reload and weekends with an older fixing date',async()=>{
 let now=start,calls=0;const storage=store(),fetcher=async(url,options)=>{calls++;assert.equal(url,FX.ENDPOINT);assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');return response(raw);};
 const client=FX.createClient({storage,fetcher,now:()=>now});await client.refresh();await client.refresh();assert.equal(calls,1);
 const reloaded=FX.createClient({storage,fetcher,now:()=>now});await reloaded.refresh();assert.equal(calls,1);assert.equal(reloaded.state().rate.date,'2026-10-30');
 now=Date.parse('2026-11-03T00:00:00+09:00');await reloaded.refresh();assert.equal(calls,2);assert.equal(reloaded.state().rate.checkedAt,now);
 await reloaded.refresh({force:true});assert.equal(calls,3);
});
test('concurrent refresh shares one request and failed updates retain the last actual value and timestamp',async()=>{
 let release,calls=0,now=start;const gate=new Promise(r=>release=r),storage=store();
 const client=FX.createClient({storage,now:()=>now,fetcher:async()=>{calls++;await gate;return response(raw);}});
 const a=client.refresh(),b=client.refresh();assert.equal(client.state().busy,true);release();await Promise.all([a,b]);assert.equal(calls,1);assert.equal(client.state().busy,false);
 now+=86400000;const failed=FX.createClient({storage,now:()=>now,fetcher:async()=>new Response('',{status:503})});await failed.refresh();assert.equal(failed.state().rate.rate,raw.rate);assert.equal(failed.state().rate.checkedAt,start);assert.match(failed.state().error,/갱신/);
 const blank=FX.createClient({now:()=>now,fetcher:async()=>response({...raw,rate:0})});assert.equal(await blank.refresh(),null);assert.equal(blank.state().rate,null);
});
test('offline reads only a validated saved rate; blocked or corrupt storage never prevents the map from starting',async()=>{
 const storage=store();storage.setItem(FX.KEY,JSON.stringify({v:1,...raw,checkedAt:start-86400000}));
 const client=FX.createClient({storage,now:()=>start,online:()=>false,fetcher:()=>{throw Error('offline fetch');}});assert.equal((await client.refresh()).rate,raw.rate);assert.equal(client.state().offline,true);
 const noCache=FX.createClient({storage:{getItem(){return 'bad json';}},now:()=>start,online:()=>false});assert.equal(await noCache.refresh(),null);
 let calls=0;const blocked=FX.createClient({storage:{getItem(){throw Error('denied');},setItem(){throw Error('quota');}},now:()=>start,fetcher:async()=>{calls++;return response(raw);}});await blocked.refresh();await blocked.refresh();assert.equal(calls,1);assert.equal(blocked.state().rate.rate,raw.rate);
});
test('cross-tab updates cannot replace a newer rate with older or unverified data',()=>{
 const client=FX.createClient({storage:store(),now:()=>start});assert.equal(client.restore(JSON.stringify({v:1,...raw,checkedAt:start})),true);
 assert.equal(client.restore(JSON.stringify({v:1,...raw,rate:9,checkedAt:start-1})),false);assert.equal(client.restore(JSON.stringify({v:1,...raw,rate:null,checkedAt:start})),false);assert.equal(client.state().rate.rate,raw.rate);
});
