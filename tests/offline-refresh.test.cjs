'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function fixture(){
 const files=new Map(),listeners=new Map(),events=[],storage=new Map();
 const label={dataset:{},textContent:''},button={dataset:{},hidden:true,addEventListener(type,fn){this[type]=fn;}},bar={dataset:{},textContent:'',querySelector(selector){return this.initialized?(selector==='[data-store-label]'?label:button):null;},append(){this.initialized=true;}};
 let fetcher=async()=>new Response('{"revision":"new"}');
 const cache={match:async id=>files.get(id)?.clone(),put:async(id,response)=>files.set(id,response.clone()),keys:async()=>[...files.keys()].map(url=>new Request(url)),delete:async id=>files.delete(id.url||id)};
 const window={frameElement:false,addEventListener(type,fn){listeners.set(type,fn);},dispatchEvent(event){events.push(event);listeners.get(event.type)?.(event);}};
 const ctx={window,document:{baseURI:'https://example.test/japan-2027/',querySelector:()=>bar,createElement:tag=>tag==='span'?label:button,addEventListener(){}},navigator:{onLine:true},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},caches:{open:async()=>cache},fetch:(...args)=>fetcher(...args),URL,Response,Request,AbortController,Event,CustomEvent,Date,JSON,Map,Set,setTimeout,clearTimeout};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../japan-2027/offline.js'),'utf8'),ctx);
 return {store:window.TravelStore,bar,label,button,events,files,setFetch(fn){fetcher=fn;}};
}
test('background downloads cannot relabel the currently displayed old trip as freshly applied',async()=>{
 const f=fixture(),oldAt=Date.parse('2026-10-24T09:00:00+09:00');f.store.useSnapshot({updatedAt:oldAt});const before=f.label.textContent;
 const url='https://example.test/japan-2027/data.json?v=test';f.files.set(url,new Response('{"revision":"old"}'));
 const data=await f.store.readJson(url,{networkOnly:true});assert.equal(data.revision,'new');assert.equal(f.label.textContent,before);assert.equal(f.button.hidden,true);
 const fresh={data:{revision:'new'},routes:{days:{}},updatedAt:Date.now()};f.store.offerSnapshot(fresh);
 assert.match(f.label.textContent,/현재 화면은 이전 자료/);assert.ok(f.label.textContent.includes('2026. 10. 24.'));assert.equal(f.button.hidden,false);
 f.button.click();assert.equal(f.events.at(-1).type,'routebook:apply-trip-update');assert.equal(f.events.at(-1).detail,fresh);
 f.store.useSnapshot(fresh);assert.equal(f.button.hidden,true);assert.doesNotMatch(f.label.textContent,/이전 자료/);
});
test('atomic refresh rejects a failed network file instead of silently mixing its old cache',async()=>{
 const f=fixture(),url='https://example.test/japan-2027/west-data.json?v=test';f.files.set(url,new Response('{"revision":"old"}'));f.setFetch(async()=>{throw Error('offline');});
 await assert.rejects(f.store.readJson(url,{networkOnly:true}),/offline/);
 assert.equal((await f.store.readJson(url)).revision,'old');assert.equal(f.bar.dataset.offline,'true');
});
test('timetable downloads leave an offered trip update and its focused button intact',async()=>{
 const f=fixture();f.store.useSnapshot({updatedAt:1234567890000});f.store.offerSnapshot({updatedAt:Date.now()});const button=f.button;
 await f.store.readJson('timetables/test.json');assert.equal(f.button,button);assert.equal(f.button.hidden,false);assert.match(f.label.textContent,/현재 화면은 이전 자료/);
});
test('complete snapshots retain their source signature for the next startup',async()=>{
 const f=fixture(),saved=await f.store.saveSnapshot({days:[1]}, {days:{}},'source-revision');
 assert.equal(saved.sourceSignature,'source-revision');const restored=await f.store.snapshot();assert.equal(restored.sourceSignature,'source-revision');
});

test('first startup from per-file fallbacks keeps the actual older verification time',async()=>{
 const f=fixture(),a='https://example.test/japan-2027/data.json?v=test',b='https://example.test/japan-2027/routes.json?v=test';
 await f.store.readJson(a);const earlier=f.store.checkedAt([a]);await new Promise(resolve=>setTimeout(resolve,5));await f.store.readJson(b);
 f.setFetch(async()=>{throw Error('offline');});await f.store.readJson(a);
 assert.equal(f.store.checkedAt([a,b]),earlier);assert.equal(f.store.checkedAt([a,'unknown.json']),null);
 const snapshot=await f.store.saveSnapshot({days:[]},{days:{}},'signature',earlier);assert.equal(snapshot.updatedAt,earlier);
});
test('complete offline timetable downloads remain pinned beyond the ordinary recent-file limit',async()=>{
 const f=fixture(),paths=Array.from({length:20},(_,i)=>'timetables/route-'+i+'.json');
 for(const p of paths)f.files.set('https://example.test/japan-2027/'+p+'?v=test',new Response('{}'));
 f.store.pinFiles(paths);await f.store.trimTimetables();assert.equal(f.files.size,20);
 f.store.pinFiles([]);await f.store.trimTimetables();assert.equal(f.files.size,12);
});
