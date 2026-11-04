'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),F=require('../japan-2027/fare-core'),{load}=require('../scripts/japan-qa.cjs');
test('Japanese railway subtotal excludes air, ferry, road, Korean rail and unrelated unknown segments',()=>{
 const leg=(mode,amount,currency='JPY',extra={})=>({parts:[{mode,...extra}],fare:{min:amount,max:amount,currency,status:'exact'}});
 const through={parts:[{mode:'rail'},{mode:'transfer'},{mode:'metro'},{mode:'walk'}],fare:{min:500,max:500,currency:'JPY',status:'exact'}};
 const legs=[leg('rail',300),leg('metro',200),leg('rail',2500),through,leg('flight',9120),leg('ferry',19900),leg('bus',230),leg('taxi',3000),leg('rail',16300,'KRW'),leg('rail',100,'JPY',{country:'KR',lineId:'KORAIL.GyeongbuHSR'}),leg('walk',null),leg('rail',null)];
 const before=JSON.stringify(legs),general=F.summarize(legs),rail=F.summarize(legs,{scope:'japan-rail'});assert.equal(rail.ic,3500);assert.equal(rail.krw,0);assert.equal(rail.unknown,1);assert.deepEqual(rail.extras,[]);assert.deepEqual(F.summarize(legs),general);assert.equal(JSON.stringify(legs),before);
 const metro={parts:[{mode:'metro',lineId:'TokyoMetro.Hibiya'}],fare:{currency:'JPY',min:178,max:178,status:'exact',passEligible:true}};assert.equal(F.summarize([metro],{scope:'japan-rail',day:1,pass:{enabled:true}}).ic,0);
});
test('actual entry and flight days retain Japanese rail costs while the Korean-only day contributes zero',()=>{const {routes}=load(),sum=key=>F.summarize(routes.days[key],{scope:'japan-rail'});assert.equal(sum('1-main').ic,3499);assert.equal(sum('1-main').unknown,0);assert.equal(sum('22-main').ic,0);assert.equal(sum('22-main').krw,0);assert.equal(F.summarize(routes.days['22-main']).krw,16300);});
test('daily IC list keeps JR transfers in one charge and preserves every source fare',()=>{
 const {routes}=load(),before=JSON.stringify(routes),rows=F.railItems(routes.days['3-main']);
 assert.deepEqual(rows.map(r=>r.icYen),[178,528,209,209,167,253]);
 assert.deepEqual(rows[1].lines,['주오·소부 각역정차','주오 선 쾌속']);assert.equal(rows[1].combined,true);assert.equal(rows[1].from,'아키하바라');assert.equal(rows[1].to,'무사시코가네이');
 assert.equal(rows.reduce((n,r)=>n+r.icYen,0),1544);assert.deepEqual(F.railItems(routes.days['22-main']),[]);
 for(const legs of Object.values(routes.days)){const items=F.railItems(legs),sum=F.summarize(legs,{scope:'japan-rail'});assert.equal(items.reduce((n,r)=>n+(r.icYen??0),0),sum.ic);}
 assert.equal(JSON.stringify(routes),before);
});
test('daily IC list never invents split fares or substitutes a paper fare for missing IC data',()=>{
 const leg={parts:[{mode:'rail',lineId:'test',line:'철도',from:'A',to:'B'}],fare:{currency:'JPY',min:300,icYen:300,breakdown:[{from:'A',to:'B',lineIds:['test'],icYen:250}]}};
 assert.deepEqual(F.railItems([leg]).map(r=>r.icYen),[300]);delete leg.fare.icYen;assert.equal(F.railItems([leg])[0].icYen,null);
 leg.parts.push({mode:'bus'});assert.deepEqual(F.railItems([leg]),[]);
});
