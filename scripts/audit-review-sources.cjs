'use strict';
const fs=require('node:fs'),https=require('node:https');
const agent={'User-Agent':'KISEKI-Public-Itinerary/1.0 (github.com/SnuMaster/Geography)'};
async function get(url){const r=await fetch(url,{headers:agent,signal:AbortSignal.timeout(55000)});if(!r.ok)throw Error(url+' HTTP '+r.status);return await r.text();}
(async()=>{
 for(const [key,address]of [['matsuya','東京都台東区北上野2-31-6'],['yoshinoya','東京都台東区入谷1-6-6']]){try{const url='https://msearch.gsi.go.jp/address-search/AddressSearch?q='+encodeURIComponent(address);console.log('POINT',key,address,await get(url));}catch(e){console.log('ERR',e.message);}}
 for(const url of ['https://www.tobu.co.jp/spaciax/','https://tobu-bus-nikko.mobustation.jp/','https://bus.fujikyu.co.jp/fujitour/kawaguchiko/']){try{const html=await get(url);console.log('HTML',url,JSON.stringify([...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(m=>m[1]).filter(x=>/\.(?:js|svg|json)|logo|route|map/i.test(x))));}catch(e){console.log('ERR',e.message);}}
 const q='[out:json][timeout:40];relation["route"="bus"](36.65,139.35,36.85,139.75);out tags;';
 try{const json=await get('https://overpass-api.de/api/interpreter?data='+encodeURIComponent(q));console.log('NIKKO_RELATIONS',json);}catch(e){console.log('ERR',e.message);}
 const q2='[out:json][timeout:40];relation["route"="bus"](35.49,138.72,35.54,138.79);out tags;';
 try{console.log('FUJI_RELATIONS',await get('https://overpass-api.de/api/interpreter?data='+encodeURIComponent(q2)));}catch(e){console.log('ERR',e.message);}
})().catch(e=>{console.error(e);process.exitCode=1;});
