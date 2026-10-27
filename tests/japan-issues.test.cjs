'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const OfflineRoads=require('../japan-2027/offline-roads'),GPS=require('../japan-2027/location-core'),Personal=require('../japan-2027/personal-trip');
require('../japan-2027/rail-departure-profiles');

test('Japanese-only route and fare station names gain Korean labels without changing Korean stations',()=>{
 assert.equal(Personal.station('動物園前'),'도부쓰엔마에(動物園前)');
 assert.equal(Personal.station('淀屋橋'),'요도야바시(淀屋橋)');
 assert.equal(Personal.station('伏見稲荷'),'후시미이나리(伏見稲荷)');
 assert.equal(Personal.station('부산역',null,'KR'),'부산역');
 assert.equal(Personal.station('도쿄(東京)'),'도쿄(東京)');
});
test('charted ferry points remain unchanged with both separately marked port connectors',()=>{
 const data=require('../japan-2027/west-routes.json'),leg=data.days['21-main'][4],parts=Personal.displayParts(leg);
 assert.equal(parts.length,3);assert.deepEqual(parts[1].coords,require('../japan-2027/assets/routes/return-route-sources.json').camellia.sourceOverview.coords);
 assert.equal(parts[0].geometryAccuracy,'schematic');assert.equal(parts[2].geometryAccuracy,'schematic');assert.equal(parts[1].geometryAccuracy,'reference');
});
test('street downloads use coarse public itinerary areas and include both variants',()=>{
 const d={n:11,variants:[{id:'main',stops:[{lat:35.71234,lng:139.78234}]},{id:'alt',stops:[{lat:35.81234,lng:139.88234}]}]};
 const points=OfflineRoads.centres(d,{days:{}});assert.equal(points.length,2);assert.notDeepEqual(points[0],[35.71234,139.78234]);
 for(const p of points)for(const n of p)assert.ok(Math.abs(n*50-Math.round(n*50))<1e-9);
 const q=OfflineRoads.query(points);assert.match(q,/highway/);assert.match(q,/railway/);assert.ok(!q.includes('35.71234'));
});
test('offline walking path uses only connected accessible OSM ways and respects pedestrian one-way',()=>{
 const way=(id,nodes,geo,tags={highway:'footway'})=>({type:'way',id,nodes,geometry:geo.map(x=>({lat:x[0],lon:x[1]})),tags});
 const pts=[[35,139],[35.0005,139],[35.001,139],[35.001,139.0005]];
 const data={elements:[way(1,[1,2,3],pts.slice(0,3)),way(2,[3,4],pts.slice(2),{highway:'footway','oneway:foot':'yes'}),way(3,[1,4],[pts[0],pts[3]],{highway:'footway',access:'private'})]};
 const route=OfflineRoads.findRoute(data,pts[0],pts[3]);assert.ok(route);assert.equal(route.coords.length,4);
 assert.equal(OfflineRoads.findRoute(data,pts[3],pts[0]),null);
 assert.equal(OfflineRoads.findRoute(data,[34,139],pts[3]),null);
});
test('applying refreshed trip data reapplies the loaded flight reference',()=>{
 const source=fs.readFileSync(require.resolve('../japan-2027/app.js'),'utf8');
 const f=source.slice(source.indexOf('function applyFlightRouteReferences'),source.indexOf('\nfunction selectLeg'));
 const update=source.slice(source.indexOf('function applyTripUpdate'),source.indexOf('\nasync function main'));
 const payload=require('../japan-2027/flight-route-overrides.json'),ref=payload.flights[0],start=ref.airportReferenceCoordinates[0],end=ref.airportReferenceCoordinates[1];
 const old={days:{'1-main':[{parts:[{mode:'flight',coords:[start,end],distanceM:1}],travel:{}}]}};
 const state={data:{days:[]},routeData:null},ctx={state,flightRouteReferences:payload,window:{FlightPlayback:{core:{distance:GPS.distance}}},screenSnapshot:()=>({}),DetailView:{close(){}},stopPlay(){},$:()=>({disabled:false}),preparePersonalTrip(){},JourneyState:{preferences:()=>({})},navigateScreen(){},TravelStore:{useSnapshot(){}},announce(){}};
 vm.createContext(ctx);vm.runInContext(f+'\n'+update+'\napplyTripUpdate({data:{days:[]},routes:sourceRoutes,sourceSignature:"test"});',Object.assign(ctx,{sourceRoutes:old}));
 const part=state.routeData.days['1-main'][0].parts[0];assert.equal(part.flightTrack.flightNumber,'TW251');assert.equal(part.coords.length,ref.coords.length);
});

test('offline street save only marks data stored after a valid response and can read it offline',async()=>{
 const source=fs.readFileSync(require.resolve('../japan-2027/offline-roads.js'),'utf8');let call=0,requestBody='',cache=new Map();
 const ctx={RouteMatch:GPS,URL,URLSearchParams,Response,AbortController,setTimeout,clearTimeout,document:{baseURI:'https://example.test/japan-2027/'},navigator:{onLine:true},
 caches:{open:async()=>({match:async k=>cache.get(k)?.clone(),put:async(k,v)=>cache.set(k,v.clone())})},
 fetch:async(url,opts)=>{call++;requestBody=opts.body.toString();if(call===1)return new Response('{}',{status:503});return new Response(JSON.stringify({elements:[{type:'way',id:1,nodes:[1,2],geometry:[{lat:35.71,lon:139.77},{lat:35.711,lon:139.77}],tags:{highway:'footway'}}]}),{status:200});}};
 vm.createContext(ctx);vm.runInContext(source,ctx);const day={n:1,variants:[{id:'main',stops:[{lat:35.71234,lng:139.78234}]}]};
 await assert.rejects(ctx.OfflineRoads.save(day,{days:{}}),/503/);assert.equal(await ctx.OfflineRoads.get(1),null);
 const result=await ctx.OfflineRoads.save(day,{days:{}});assert.equal(result.elements.length,1);assert.ok(!decodeURIComponent(requestBody).includes('35.71234'));
 ctx.navigator.onLine=false;assert.equal((await ctx.OfflineRoads.get(1)).elements.length,1);await assert.rejects(ctx.OfflineRoads.save(day,{days:{}}),/인터넷/);
});
