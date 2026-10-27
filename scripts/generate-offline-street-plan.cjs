'use strict';
// Generate exactly the same coarse coverage points used by OfflineRoads in the app.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),app=path.join(root,'japan-2027');
const TripData=require(path.join(app,'data-model.js'));
const Personal=require(path.join(app,'personal-trip.js'));
const Roads=require(path.join(app,'offline-roads.js'));
const read=name=>JSON.parse(fs.readFileSync(path.join(app,name),'utf8'));
const route=read('tokyo-routes.json'),westRoute=read('west-routes.json');
const {data,routes}=Personal.patch(TripData.merge(read('data.json'),read('tokyo-data.json'),read('west-data.json')),
 {...route,days:{...route.days,...westRoute.days}});
const days=data.days.map(d=>({day:d.n,points:Roads.centres(d,routes)}));
if(days.length!==22||days.some(d=>!d.points.length))throw new Error('All 22 days need coverage points');
fs.writeFileSync(process.argv[2]||'offline-street-plan.json',JSON.stringify({version:1,days}));
