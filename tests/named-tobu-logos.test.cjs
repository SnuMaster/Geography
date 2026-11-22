'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),b=require('../japan-2027/trip-update.json');
const ctx={MODE:{rail:{color:'#477b95'},metro:{color:'#477b95'},bus:{color:'#477b95'}},esc:String,icon:x=>x,window:{TripPersonal:{displayParts:l=>l.parts}}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../japan-2027/rail-ui.js'),'utf8'),ctx);vm.runInContext(fs.readFileSync(require.resolve('../japan-2027/rail-departure-profiles.js'),'utf8'),ctx);
test('every named current Spacia X and Revaty piece has only the correct operator mark',()=>{
 const parts=Object.values(b.routes.days).flat().flatMap(l=>l.parts);
 for(const p of parts.filter(p=>/스페이시아 X/.test(p.serviceName||''))){assert.match(ctx.railBadge(p),/spacia-x.svg/);assert.equal(ctx.revatyLogo(p),'');}
 for(const p of parts.filter(p=>/Revaty/.test(p.serviceName||''))){assert.match(ctx.railBadge(p),/revaty.png/);assert.equal(ctx.spaciaXLogo(p),'');}
 const leg=b.routes.days['8-main'][5],ride=ctx.railMapParts(leg).find(p=>p.mapSymbol).mapSymbol;assert.match(ctx.railBadge(ride),/spacia-x.svg/);assert.doesNotMatch(ctx.railLegBadges(leg),/revaty.png/);
 const plain=leg.parts.find(p=>p.line==='닛코선');assert.equal(ctx.spaciaXLogo(plain),'');assert.equal(ctx.revatyLogo(plain),'');
});
test('generic Tobu section identity cannot invent a train brand',()=>{
 const p={mode:'rail',lineId:'Tobu.TobuSkytree',line:'도부 특급',from:'가스카베',to:'기타센주'};assert.equal(ctx.revatyLogo(p),'');assert.equal(ctx.spaciaXLogo(p),'');
});
