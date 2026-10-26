'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),GPS=require('../japan-2027/location-core');
const now=100000,fix={lat:35.7,lng:139.8,accuracy:10,timestamp:now,speed:0,heading:null};
test('compass uses absolute data and rejects arbitrary relative alpha',()=>{
 assert.equal(GPS.compassHeading({alpha:90,absolute:false}),null);
 assert.equal(GPS.compassHeading({alpha:90,absolute:true}),270);
 assert.equal(GPS.compassHeading({webkitCompassHeading:0,webkitCompassAccuracy:8}),0);
 assert.equal(GPS.compassHeading({webkitCompassHeading:359,webkitCompassAccuracy:8},90),89);
 assert.equal(GPS.compassHeading({webkitCompassHeading:20,webkitCompassAccuracy:-1}),null);
 assert.equal(GPS.compassHeading({webkitCompassHeading:20,webkitCompassAccuracy:60}),null);
});
test('fresh compass is distinct from GPS course and stationary GPS cannot invent a direction',()=>{
 assert.deepEqual(GPS.displayHeading(fix,{degrees:0,timestamp:now},now),{degrees:0,source:'compass'});
 assert.equal(GPS.displayHeading({...fix,heading:90},null,now),null);
 assert.deepEqual(GPS.displayHeading({...fix,speed:1,heading:90},null,now),{degrees:90,source:'gps'});
 assert.equal(GPS.displayHeading({...fix,speed:1,heading:null},null,now),null);
 assert.equal(GPS.displayHeading({...fix,speed:1,heading:-1},null,now),null);
});
test('stale or inaccurate location and stale compass remove unsupported direction',()=>{
 assert.equal(GPS.displayHeading(fix,{degrees:90,timestamp:now},now+30001),null);
 assert.equal(GPS.displayHeading({...fix,accuracy:121},{degrees:90,timestamp:now},now),null);
 assert.equal(GPS.displayHeading(fix,{degrees:90,timestamp:now-10001},now),null);
 assert.deepEqual(GPS.displayHeading({...fix,speed:1,heading:180},{degrees:90,timestamp:now-10001},now),{degrees:180,source:'gps'});
 assert.equal(GPS.directionName(0),'북');assert.equal(GPS.directionName(90),'동');assert.equal(GPS.directionName(359),'북');assert.equal(GPS.directionName(null),'');
});
