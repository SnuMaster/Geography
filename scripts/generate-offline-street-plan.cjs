'use strict';
// Generate exactly the same coarse coverage points used by OfflineRoads in the app.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),app=path.join(root,'japan-2027');
const Roads=require(path.join(app,'offline-roads.js'));
const {data,routes}=require(path.join(app,'trip-update.json'));
const days=data.days.map(d=>({day:d.n,points:Roads.centres(d,routes)}));
if(days.length!==12||days.some(d=>!d.points.length))throw new Error('All 12 days need coverage points');
fs.writeFileSync(process.argv[2]||'offline-street-plan.json',JSON.stringify({version:1,days}));
