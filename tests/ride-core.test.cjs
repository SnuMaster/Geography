'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Ride = require('../japan-2027/ride-core.js');
const Departures = require('../japan-2027/departure-core.js');
const at = value => Date.parse(value + '+09:00');
const day = '2027-01-08';
const standard = {
  id: 'service-1', departure: '10:00', destinationArrival: '10:20', stopTimeBasis: 'timetable',
  stops: [
    {id: 'a', name: '출발역', departure: '10:00'},
    {id: 'b', name: '중간역', arrival: '10:09', departure: '10:10'},
    {id: 'c', name: '도착역', arrival: '10:20'}
  ]
};
const normalized = (record = standard, schedules = null, options = {}) => Ride.trainsForDate(schedules || {Weekday: [record], SaturdayHoliday: [record]}, day, options)[0];

test('a chosen departed service remains available through the all-day selector', () => {
  const schedules = {Weekday: [standard], SaturdayHoliday: []};
  assert.equal(Departures.nextTrains(schedules, at(day + 'T10:05:00'), {lookAheadDays: 0}).length, 0);
  const trains = Ride.trainsForDate(schedules, day);
  assert.equal(trains.length, 1);
  assert.equal(trains[0].departureAt, at(day + 'T10:00:00'));
  assert.equal(Ride.candidates(schedules, at(day + 'T10:05:00'))[0].candidateState, 'riding');
});

test('calendar rules match the departure board across weekdays and separate weekends', () => {
  const schedules = {
    Weekday: [{...standard, id: 'weekday'}], Saturday: [{...standard, id: 'saturday'}],
    SundayHoliday: [{...standard, id: 'sunday'}], SaturdayHoliday: [{...standard, id: 'combined'}]
  };
  const options = {holidays: ['2027-01-11']};
  for (const date of ['2027-01-08', '2027-01-09', '2027-01-10', '2027-01-11']) {
    const ride = Ride.trainsForDate(schedules, date, options);
    const board = Departures.nextTrains(schedules, at(date + 'T09:50:00'), {...options, lookAheadDays: 0, limit: 1});
    assert.equal(ride[0].id, board[0].id);
    assert.equal(ride[0].calendar, board[0].calendar);
  }
});

test('daily Korean schedules use weekday restrictions, validity and operating dates', () => {
  const schedules = {Daily: [
    {...standard, id: 'fri', daysOfWeek: [5]},
    {...standard, id: 'mon', daysOfWeek: [1]},
    {...standard, id: 'expired', validThrough: '2027-01-07'},
    {...standard, id: 'future', validFrom: '2027-01-09'},
    {...standard, id: 'special', operatingDates: [day]},
    {...standard, id: 'excluded', excludedDates: [day]}
  ]};
  assert.deepEqual(Ride.trainsForDate(schedules, day, {holidays: [day]}).map(t => t.id).sort(), ['fri', 'special']);
  assert.deepEqual(Ride.trainsForDate(schedules, day, {calendarThrough: '2027-01-07'}), []);
  assert.deepEqual(Ride.trainsForDate(schedules, day, {calendarFrom: '2027-01-09'}), []);
});

test('date overrides retain cancellations and exact exceptional departure times', () => {
  const schedules = {Weekday: [standard, {...standard, id: 'cancel'}], dateOverrides: {[day]: [
    {id: standard.id, departure: '10:01', destinationArrival: '10:21', stops: [{name: 'A', departure: '10:01'}, {name: 'C', arrival: '10:21'}]},
    {id: 'cancel', cancelled: true}
  ]}};
  const trains = Ride.trainsForDate(schedules, day);
  assert.equal(trains.length, 1);
  assert.equal(trains[0].departureAt, at(day + 'T10:01:00'));
  assert.equal(trains[0].destinationAt, at(day + 'T10:21:00'));
});

test('an exceptional service never reuses unverified intermediate ordinary-day times', () => {
  const schedules = {Weekday: [standard], dateOverrides: {[day]: [{id: standard.id, departure: '10:01', destinationArrival: '10:21'}]}};
  const train = Ride.trainsForDate(schedules, day)[0];
  assert.equal(train.stops[0].departureAt, at(day + 'T10:01:00'));
  assert.equal(train.stops[1].eventAt, null);
  assert.equal(train.stops[2].arrivalAt, at(day + 'T10:21:00'));
  assert.equal(train.stopTimeBasis, 'partial');
});

test('00:xx belongs to the previous operating day and seconds survive normalization', () => {
  const record = {id: 'night', departure: '23:58', stops: [
    {name: 'A', departure: '23:58'}, {name: 'B', time: '00:04:30'}, {name: 'C', time: '00:12:30'}
  ], stopTimeBasis: 'timetable'};
  const train = normalized(record);
  assert.equal(train.stops[1].timeAt, at('2027-01-09T00:04:30'));
  assert.equal(train.destinationEventKind, 'source-event');
  assert.equal(Ride.progress(train, at('2027-01-09T00:00:00')).remainingMs, 12.5 * 60000);
  assert.equal(Ride.serviceDateForNow(at('2027-01-09T00:05:00')), day);
  const onlyFriday = {Weekday: [record], SaturdayHoliday: []};
  assert.equal(Ride.candidates(onlyFriday, at('2027-01-09T00:05:00'))[0].serviceDate, day);
});

test('24:xx and a journey crossing the 03:00 boundary remain monotonic', () => {
  const train = normalized({id: 'late', departure: '26:58', stops: [
    {name: 'A', departure: '26:58'}, {name: 'B', time: '03:02'}, {name: 'C', arrival: '03:12'}
  ]});
  assert.equal(train.departureAt, at('2027-01-09T02:58:00'));
  assert.equal(train.stops[1].timeAt, at('2027-01-09T03:02:00'));
  assert.equal(train.destinationAt, at('2027-01-09T03:12:00'));
});

test('current station only appears within a supported arrival/departure interval', () => {
  const train = normalized();
  const between = Ride.progress(train, at(day + 'T10:05:00'));
  assert.equal(between.currentStop, null);
  assert.equal(between.previousStop.id, 'a');
  assert.equal(between.nextStop.id, 'b');
  assert.equal(between.nextEventKind, 'arrival');
  const stopped = Ride.progress(train, at(day + 'T10:09:30'));
  assert.equal(stopped.currentStop.id, 'b');
  assert.equal(stopped.nextStop.id, 'c');
  assert.equal(stopped.remainingStops, 1);
  const departed = Ride.progress(train, at(day + 'T10:10:00'));
  assert.equal(departed.currentStop, null);
  assert.equal(departed.previousStop.id, 'b');
});

test('departure-only stop records are not renamed arrival or given invented dwell', () => {
  const train = normalized({id: 'departure-only', departure: '10:00', destinationDeparture: '10:20', stops: [
    {name: 'A', departure: '10:00'}, {name: 'B', departure: '10:10'}, {name: 'C', departure: '10:20'}
  ]});
  const before = Ride.progress(train, at(day + 'T10:09:00'));
  assert.equal(before.nextEventKind, 'departure');
  assert.equal(before.destinationEventKind, 'departure');
  assert.equal(before.currentStop, null);
  const atB = Ride.progress(train, at(day + 'T10:10:00'));
  assert.equal(atB.currentStop, null);
  assert.equal(atB.previousStop.name, 'B');
  assert.equal(train.destinationArrivalAt, null);
});

test('an express train counts only its actual stop pattern', () => {
  const train = normalized({...standard, stops: [standard.stops[0], standard.stops[2]]});
  const state = Ride.progress(train, at(day + 'T10:05:00'));
  assert.equal(state.remainingStops, 1);
  assert.equal(state.nextStop.name, '도착역');
});

test('delay and a manual station confirmation shift from the original timetable once', () => {
  const train = normalized();
  const delayed = Ride.progress(train, at(day + 'T10:10:00'), {delaySeconds: 180});
  assert.equal(delayed.nextEventAt, at(day + 'T10:12:00'));
  assert.equal(delayed.destinationAt, at(day + 'T10:23:00'));
  assert.equal(delayed.basis, 'manual');
  const confirmedAt = at(day + 'T10:12:00');
  const confirmed = Ride.progress(train, confirmedAt, {confirmedStopIndex: 1, confirmedAt});
  assert.equal(confirmed.currentStop.name, '중간역');
  assert.equal(confirmed.adjustmentSeconds, 180);
  assert.equal(confirmed.destinationAt, at(day + 'T10:23:00'));
  assert.equal(Ride.progress(train, at(day + 'T10:14:00'), {confirmedStopIndex: 1, confirmedAt}).currentStop, null);
  assert.equal(train.stops[1].arrivalAt, at(day + 'T10:09:00'));
});

test('manual confirmation without an arrival time lasts only at the confirmation instant', () => {
  const train = normalized({id: 'dep', departure: '10:00', stops: [
    {name: 'A', departure: '10:00'}, {name: 'B', departure: '10:10'}, {name: 'C', departure: '10:20'}
  ]});
  const confirmedAt = at(day + 'T10:13:00'), adjustment = {confirmedStopIndex: 1, confirmedAt};
  assert.equal(Ride.progress(train, confirmedAt, adjustment).currentStop.name, 'B');
  assert.equal(Ride.progress(train, confirmedAt + 1000, adjustment).currentStop, null);
  assert.equal(Ride.progress(train, confirmedAt + 1000, adjustment).confirmation.ageMs, 1000);
  const endConfirmation = {confirmedStopIndex: 2, confirmedAt};
  assert.equal(Ride.progress(train, confirmedAt, endConfirmation).currentStop.name, 'C');
  assert.equal(Ride.progress(train, confirmedAt + 1000, endConfirmation).currentStop, null);
});

test('an explicit departure confirmation anchors departure rather than origin arrival', () => {
  const train = normalized({...standard, arrival: '10:00', departure: '10:02', stops: [
    {name: 'A', arrival: '10:00', departure: '10:02'}, standard.stops[1], standard.stops[2]
  ]});
  const now = at(day + 'T10:10:00');
  const departed = Ride.progress(train, now, {confirmedStopIndex: 0, confirmedAt: now, confirmedEventKind: 'departure'});
  assert.equal(departed.departureAt, now);
  assert.equal(departed.phase, 'riding');
  assert.equal(departed.adjustmentSeconds, 8 * 60);
  assert.equal(departed.destinationAt, at(day + 'T10:28:00'));
  assert.equal(departed.confirmation.sourceEventKind, 'departure');
  const arrived = Ride.progress(train, now, {confirmedStopIndex: 0, confirmedAt: now});
  assert.equal(arrived.departureAt, at(day + 'T10:12:00'));
  assert.equal(arrived.phase, 'waiting');
});

test('an untimed manual stop retains its position floor without fabricating a time correction', () => {
  const train = normalized({id: 'partial-confirmed', departure: '10:00', stopTimeBasis: 'partial', stops: [
    {name: 'A', departure: '10:00'}, {name: 'B'}, {name: 'C', time: '10:20'}
  ]});
  const confirmedAt = at(day + 'T10:10:00'), adjustment = {confirmedStopIndex: 1, confirmedAt};
  const instant = Ride.progress(train, confirmedAt, adjustment);
  assert.equal(instant.currentStop.name, 'B');
  assert.equal(instant.confirmation.applied, false);
  for (const now of [confirmedAt + 1000, at(day + 'T10:25:00')]) {
    const state = Ride.progress(train, now, adjustment);
    assert.equal(state.phase, 'unknown');
    assert.equal(state.currentStop, null);
    assert.equal(state.previousStop.name, 'B');
    assert.equal(state.nextStop.name, 'C');
    assert.equal(state.positionKnown, false);
    assert.equal(state.nextEventAt, null);
    assert.equal(state.remainingMs, null);
    assert.equal(state.remainingStops, null);
    assert.equal(state.destinationAt, null);
    assert.equal(state.progressFraction, null);
  }
});

test('an untimed confirmation supersedes an already-passed destination event', () => {
  const train = normalized({id: 'late-partial', departure: '10:00', destinationArrival: '10:20', stops: [
    {name: 'A', departure: '10:00'}, {name: 'B'}, {name: 'C', arrival: '10:20'}
  ]});
  const confirmedAt = at(day + 'T10:30:00');
  assert.equal(Ride.progress(train, confirmedAt).phase, 'arrived');
  const state = Ride.progress(train, confirmedAt + 1000, {confirmedStopIndex: 1, confirmedAt});
  assert.equal(state.phase, 'unknown');
  assert.equal(state.previousStop.name, 'B');
  assert.equal(state.nextStop.name, 'C');
  assert.equal(state.remainingMs, null);
});

test('waiting, countdown boundary and final event crossing stay stable', () => {
  const train = normalized();
  assert.equal(Ride.progress(train, at(day + 'T09:59:59')).phase, 'waiting');
  assert.equal(Ride.progress(train, at(day + 'T10:00:00')).phase, 'riding');
  assert.equal(Ride.progress(train, at(day + 'T10:19:59')).remainingMs, 1000);
  const ended = Ride.progress(train, at(day + 'T10:20:00'));
  assert.equal(ended.phase, 'arrived');
  assert.equal(ended.remainingMs, 0);
  assert.equal(ended.progressFraction, 1);
  assert.equal(ended.currentStop, null, 'a passed planned event does not assert live station presence');
});

test('missing times preserve unknown state and never generate a numeric countdown', () => {
  const train = normalized({id: 'partial', departure: '10:00', stopTimeBasis: 'partial', stops: [
    {name: 'A', departure: '10:00'}, {name: 'B'}, {name: 'C'}
  ]});
  const state = Ride.progress(train, at(day + 'T10:05:00'));
  assert.equal(state.remainingMs, null);
  assert.equal(state.nextEventAt, null);
  assert.equal(state.nextStop.name, 'B');
  assert.equal(state.positionKnown, false);
  assert.equal(state.progressFraction, null);
  assert.equal(Ride.progress(null, Date.now()).phase, 'unknown');
  assert.equal(Ride.isValidTrain({...train, departureAt: NaN}), false);
});

test('a long-running service stays selectable outside the recent-departure window', () => {
  const long = {...standard, destinationArrival: '15:00', stops: [{name: 'A', departure: '10:00'}, {name: 'C', arrival: '15:00'}]};
  const candidates = Ride.candidates({Weekday: [long]}, at(day + 'T14:00:00'), {pastMinutes: 30});
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].candidateState, 'riding');
});

test('candidate limits prioritize ongoing and nearby services on frequent lines', () => {
  const trains = Array.from({length: 181}, (_, i) => ({id: 't' + i, departure: '10:' + String(i % 60).padStart(2, '0')}));
  for (let i = 0; i < trains.length; i++) trains[i].departure = `${10 + Math.floor(i / 60)}:${String(i % 60).padStart(2, '0')}`;
  const result = Ride.candidates({Weekday: trains}, at(day + 'T13:00:00'), {limit: 3});
  assert.deepEqual(result.map(t => t.departure), ['12:58', '12:59', '13:00']);
});

test('invalid dates, malformed source events and unsupported calendars produce no invented data', () => {
  assert.deepEqual(Ride.trainsForDate({Weekday: [standard]}, '2027-02-30'), []);
  assert.deepEqual(Ride.trainsForDate({Weekday: [{...standard, departure: '48:00'}]}, day), []);
  const train = normalized({...standard, stops: [{name: 'A', departure: '10:00'}, {name: 'B', departure: '09:59'}, {name: 'C', arrival: '10:20'}]});
  assert.equal(train.stops[1].eventAt, null);
  assert.equal(Ride.progress(train, at(day + 'T10:05:00')).nextEventAt, null);
});

test('train list time state crosses departure and terminal without claiming actual arrival',()=>{
 const train=normalized();
 assert.equal(Ride.timeStatus(train,at(day+'T09:59:59')),'출발 전');
 assert.equal(Ride.timeStatus(train,at(day+'T10:00:00')),'출발 예정 시각 지남 · 실제 위치 확인 필요');
 assert.equal(Ride.timeStatus(train,at(day+'T10:20:00')),'예정 시각 지남 · 실제 위치 확인 필요');
});
