'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const T=require('../japan-2027/data-model'),R=require('../japan-2027/reservation-core'),load=require('../scripts/japan-qa.cjs').load;
const day=(data,n)=>data.days.find(d=>d.n===n),yama=data=>day(data,14).variants[0].stops[1];
function apply(trip,records){R.restore(trip.data);T.prepare(trip.data,trip.routes);R.apply(trip.data,trip.routes,records);T.prepare(trip.data,trip.routes);return trip;}
test('legacy cached Narita fields are normalized to the displayed 14:20 end, including the outgoing leg and full schedule',()=>{
 const s={time:'13:20~14:20',start:'13:20',end:'14:40'};assert.equal(T.interval(s).end,'14:20');
 const {data,routes}=load(),v=day(data,1).variants[0];assert.equal(v.stops[2].end,'14:20');
 assert.equal(routes.days['1-main'][2].departureAt,Date.parse('2027-01-08T14:20:00+09:00'));assert.equal(v.schedule[2][0],v.stops[2].time);
});
test('all 263 cards, normalized fields and expanded schedule rows share one time source',()=>{
 const {data}=load();let count=0;
 for(const d of data.days)for(const v of d.variants)for(const [i,s]of v.stops.entries()){
  const t=T.interval(s);assert.equal(s.start,t.start);assert.equal(s.end,t.end);assert.equal(v.schedule[i][0],s.time);count++;
 }
 assert.equal(count,263);
});
test('a confirmed Yamazaki 14:00 start updates card, both adjacent leg clocks and the expanded schedule; incompatible lunch is flagged',()=>{
 const trip=apply(load(),{yamazaki:{status:'예약완료',time:'2027-01-21T14:00'}}),s=yama(trip.data),v=day(trip.data,14).variants[0];
 assert.equal(s.time,'14:00~15:40');assert.equal(s.start,'14:00');assert.equal(s.end,'15:40');assert.equal(s.timeConfidence,'user-confirmed-start');
 assert.equal(trip.routes.days['14-main'][0].arrivalAt,Date.parse('2027-01-21T14:00:00+09:00'));
 assert.equal(trip.routes.days['14-main'][1].departureAt,Date.parse('2027-01-21T15:40:00+09:00'));
 assert.equal(v.schedule[1][0],s.time);assert.ok(v.reservationWarnings.some(w=>w.message.includes('산쇼테이')&&w.message.includes('부족')));
});
test('changing, reapplying and clearing a reservation never compounds offsets and restores the original plan',()=>{
 const trip=load();apply(trip,{yamazaki:{time:'2027-01-21T14:00'}});apply(trip,{yamazaki:{time:'2027-01-21T15:00'}});assert.equal(yama(trip.data).end,'16:40');
 apply(trip,{yamazaki:{time:'2027-01-21T14:00'}});assert.equal(yama(trip.data).end,'15:40');
 apply(trip,{});assert.equal(yama(trip.data).time,'10:00~11:40');assert.equal(yama(trip.data).timeConfidence,'target');assert.equal(day(trip.data,14).variants[0].reservationWarnings.length,0);
});
test('a different date, malformed date and a visit extending into the next day are not applied',()=>{
 for(const time of ['2027-01-22T14:00','2027-02-30T14:00','2027-01-21T23:30','invalid']){
  const trip=apply(load(),{yamazaki:{time}}),s=yama(trip.data);assert.equal(s.time,'10:00~11:40',time);assert.equal(s.reservationTiming.applied,false);assert.equal(s.reservationTiming.error,true);assert.ok(s.reservationTiming.messages.length);
 }
});
test('declined bookings and confirmed bookings without a time stay visibly distinct from applied confirmed times',()=>{
 for(const status of ['낙선','예약 불가']){const trip=apply(load(),{yamazaki:{status,time:'2027-01-21T14:00'}});assert.equal(yama(trip.data).reservationTiming.applied,false);assert.match(yama(trip.data).reservationTiming.messages[0],/반영하지/);}
 const trip=apply(load(),{yamazaki:{status:'예약완료',time:''}});assert.match(yama(trip.data).reservationTiming.messages[0],/확정 시각 미입력/);
});
test('unknown concert end remains unknown after changing admission time; no return train clock is fabricated',()=>{
 const trip=apply(load(),{zutomayo:{status:'티켓 확보',time:'2027-01-18T17:30'}}),v=day(trip.data,11).variants[0],s=v.stops[6];
 assert.equal(s.start,'17:30');assert.equal(s.end,null);assert.match(s.time,/종료 시각 미확정/);assert.match(v.reservationWarnings[0].message,/종료 시각 미확정/);
 assert.equal(trip.routes.days['11-main'][6].departureAt,null);assert.equal(trip.routes.days['11-main'][6].departureTimeKnown,false);
});
test('reservation updates leave the Uji alternative and all other public itinerary content intact',()=>{
 const trip=load(),uji=JSON.stringify(day(trip.data,14).variants[1].stops),before=JSON.stringify(day(trip.data,16));apply(trip,{yamazaki:{time:'2027-01-21T14:00'}});
 assert.equal(JSON.stringify(day(trip.data,14).variants[1].stops),uji);const copy=JSON.parse(JSON.stringify(day(trip.data,16)));delete copy.variants[0].reservationWarnings;assert.equal(JSON.stringify(copy),before);
});
test('local datetime parsing is independent of the host timezone and rejects impossible calendar dates',()=>{
 assert.deepEqual(R.parseTime('2027-01-21T14:00'),{date:'2027-01-21',time:'14:00',minute:840});
 for(const s of ['2027-02-29T14:00','2027-01-21T24:00','2027-01-21T14:60','2027-01-21T14:00Z'])assert.equal(R.parseTime(s),null);
});
