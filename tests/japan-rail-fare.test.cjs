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
