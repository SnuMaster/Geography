'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),D=require('../japan-2027/departure-core');
const at=s=>Date.parse(s+'+09:00');
const schedules={Weekday:[{id:'first-w',departure:'05:00'},{id:'day',departure:'12:00'},{id:'last',departure:'24:30'}],SaturdayHoliday:[{id:'first-h',departure:'05:30'},{id:'day-h',departure:'12:30'},{id:'last-h',departure:'24:10'}]};
function status(now,table=schedules,options={}){const t=D.nextTrains(table,at(now),{...options,limit:1})[0];return {train:t,ended:D.isFirstTrain(t&&D.firstTrainForDate(table,t.serviceDate,options),t,at(now))};}
test('a post-midnight train remains normal until the actual final scheduled departure',()=>{
 const r=status('2026-10-29T00:05:00');assert.equal(r.train.id,'last');assert.equal(r.train.serviceDate,'2026-10-28');assert.equal(r.ended,false);
});
test('after the final departure, identify the next first train both before and after the 03:00 service boundary',()=>{
 for(const time of ['00:30:00','02:59:59','03:00:00','04:59:59']){const r=status('2026-10-29T'+time);assert.equal(r.train.id,'first-w');assert.equal(r.train.serviceDate,'2026-10-29');assert.equal(r.ended,true);}
});
test('the first departure boundary automatically restores the normal next-train state',()=>{
 assert.equal(status('2026-10-29T04:59:59').ended,true);const r=status('2026-10-29T05:00:00');assert.equal(r.train.id,'day');assert.equal(r.ended,false);
});
test('a large daytime timetable gap is not labelled service-ended',()=>{const r=status('2026-10-29T06:00:00');assert.equal(r.train.id,'day');assert.equal(r.ended,false);});
test('weekends, holidays and first-service cancellations use the actual next service calendar',()=>{
 const saturday=status('2026-10-31T02:00:00');assert.equal(saturday.train.id,'first-h');assert.equal(saturday.ended,true);
 const holiday=status('2026-11-03T04:00:00',schedules,{holidays:['2026-11-03']});assert.equal(holiday.train.id,'first-h');assert.equal(holiday.ended,true);
 const revised={...schedules,dateOverrides:{'2026-10-29':[{id:'first-w',cancelled:true}]}};const r=status('2026-10-29T04:00:00',revised);assert.equal(r.train.id,'day');assert.equal(r.ended,true);
});
test('late 27:xx services are not mistaken for the next service first train',()=>{
 const table={Daily:[{id:'first',departure:'05:00'},{id:'late',departure:'27:15'}]};const r=status('2026-10-29T03:00:00',table);assert.equal(r.train.id,'late');assert.equal(r.ended,false);assert.equal(D.firstTrainForDate(table,'2026-10-29').id,'first');
});
test('unusable, empty and malformed data cannot invent a first service or a closed state',()=>{
 assert.equal(D.firstTrainForDate(schedules,'2026-10-29',{validUntil:'2026-10-28'}),null);assert.equal(D.firstTrainForDate({Daily:[]},'2026-10-29'),null);assert.equal(D.firstTrainForDate(schedules,'invalid'),null);assert.equal(D.isFirstTrain(null,null,at('2026-10-29T04:00:00')),false);
});
test('source seconds stay eligible until that first train actually departs',()=>{
 const f=D.firstTrainForDate(schedules,'2026-10-29'),t={...f,departureAt:f.departureAt+30000};assert.equal(D.isFirstTrain(f,t,f.departureAt+20000),true);assert.equal(D.isFirstTrain(f,t,t.departureAt),false);assert.equal(D.isFirstTrain(f,{...t,id:'other'},f.departureAt-1),false);
});
test('service boundaries of 0 and 6 hours select only the requested service date',()=>{
 for(const h of [0,6]){const table={Daily:[{id:'first',departure:'07:00'},{id:'last',departure:'23:00'}]};const f=D.firstTrainForDate(table,'2026-10-29',{serviceDayHour:h});assert.equal(f.serviceDate,'2026-10-29');assert.equal(f.id,'first');}
});
