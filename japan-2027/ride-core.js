'use strict';
// A chosen service is a timetable reference, never a live vehicle-location feed.
(function (root, factory) {
  const calendar = typeof module === 'object' && module.exports ? require('./departure-core.js') : root.DepartureCore;
  const api = factory(calendar);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RideCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (DepartureCore) {
  const DAY = 86400000, MINUTE = 60000, JST = 9 * 60 * MINUTE;
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function dateStart(date) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const [y, m, d] = date.split('-').map(Number), value = Date.UTC(y, m - 1, d);
    return finite(value) && new Date(value).toISOString().slice(0, 10) === date ? value - JST : null;
  }
  function localDate(epoch) {
    return finite(epoch) && finite(new Date(epoch + JST).getTime()) ? new Date(epoch + JST).toISOString().slice(0, 10) : null;
  }
  function boundaryFor(options) {
    return Number.isInteger(options.serviceDayHour) && options.serviceDayHour >= 0 && options.serviceDayHour <= 6 ? options.serviceDayHour : 3;
  }
  function serviceDateForNow(now, serviceDayHour = 3) {
    return localDate(now - boundaryFor({serviceDayHour}) * 60 * MINUTE);
  }
  function secondsOf(value) {
    if (typeof value !== 'string') return null;
    const match = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/.exec(value);
    return match && Number(match[1]) <= 47 ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] || 0) : null;
  }
  function serviceAt(value, start, boundary) {
    let seconds = secondsOf(value);
    if (seconds === null) return null;
    if (seconds < boundary * 3600) seconds += 86400;
    return start + seconds * 1000;
  }
  function after(value, start, boundary, minimum) {
    let at = serviceAt(value, start, boundary);
    if (at === null) return null;
    if (at < minimum && minimum - at > 12 * 60 * MINUTE) at += DAY;
    return at >= minimum ? at : null;
  }
  function calendarFor(schedules, date, options) {
    if (Array.isArray(schedules.Daily)) return 'Daily';
    const combined = DepartureCore.calendarFor(date, options);
    if (combined !== 'SaturdayHoliday') return combined;
    const weekday = new Date(dateStart(date) + JST).getUTCDay();
    const holidays = options.holidays instanceof Set ? options.holidays : new Set(options.holidays || []);
    const monthDay = date.slice(5), yearEnd = options.yearEndHoliday !== false && (monthDay >= '12-30' || monthDay <= '01-03');
    const separate = weekday === 6 && !holidays.has(date) && !yearEnd ? 'Saturday' : 'SundayHoliday';
    return Array.isArray(schedules[separate]) ? separate : combined;
  }
  function eventFor(stop) {
    if (finite(stop?.arrivalAt)) return {at: stop.arrivalAt, kind: 'arrival'};
    if (finite(stop?.timeAt)) return {at: stop.timeAt, kind: 'source-event'};
    if (finite(stop?.departureAt)) return {at: stop.departureAt, kind: 'departure'};
    return {at: null, kind: null};
  }
  function endEventFor(train, stops) {
    const last = stops[stops.length - 1];
    if (finite(train.destinationArrivalAt)) return {at: train.destinationArrivalAt, kind: 'arrival'};
    const event = eventFor(last);
    if (event.at !== null) return event;
    return finite(train.destinationDepartureAt) ? {at: train.destinationDepartureAt, kind: 'departure'} : {at: null, kind: null};
  }

  function normalizeStops(record, start, boundary, times, options) {
    const fallback = [
      {id: options.fromId || 'origin', name: options.fromName || record.from || '출발역', arrival: record.arrival, departure: record.departure},
      {id: options.toId || 'destination', name: options.toName || record.to || '하차역', arrival: record.destinationArrival, departure: record.destinationDeparture}
    ];
    const raw = Array.isArray(record.stops) && record.stops.length >= 2 ? record.stops : fallback;
    const stops = [];
    let cursor = times.departureAt;
    for (let i = 0; i < raw.length; i++) {
      const value = raw[i];
      if (!value || typeof value !== 'object') continue;
      const stop = {...value, id: String(value.id || `stop-${i}`), name: String(value.name || value.nameJa || `정차역 ${i + 1}`)};
      if (!Array.isArray(stop.coord) || stop.coord.length !== 2 || !stop.coord.every(finite) || Math.abs(stop.coord[0]) > 90 || Math.abs(stop.coord[1]) > 180) delete stop.coord;
      if (i === 0) {
        let sourceArrival = serviceAt(value.arrival, start, boundary);
        if (sourceArrival !== null && sourceArrival > times.departureAt && sourceArrival - times.departureAt > 12 * 60 * MINUTE) sourceArrival -= DAY;
        stop.arrivalAt = times.arrivalAt ?? (sourceArrival !== null && sourceArrival <= times.departureAt ? sourceArrival : null);
        stop.departureAt = times.departureAt;
        stop.timeAt = serviceAt(value.time, start, boundary);
        if (stop.timeAt !== null && stop.timeAt > stop.departureAt) stop.timeAt = null;
      } else {
        stop.arrivalAt = after(value.arrival, start, boundary, cursor);
        stop.timeAt = after(value.time, start, boundary, stop.arrivalAt ?? cursor);
        stop.departureAt = after(value.departure, start, boundary, stop.timeAt ?? stop.arrivalAt ?? cursor);
        if (i === raw.length - 1) {
          if (finite(times.destinationArrivalAt) && times.destinationArrivalAt >= cursor) stop.arrivalAt = times.destinationArrivalAt;
          if (finite(times.destinationDepartureAt) && times.destinationDepartureAt >= (stop.arrivalAt ?? cursor)) stop.departureAt = times.destinationDepartureAt;
        }
      }
      const event = eventFor(stop);
      stop.eventAt = event.at;
      stop.eventKind = event.kind;
      stops.push(stop);
      cursor = Math.max(cursor, stop.arrivalAt ?? cursor, stop.timeAt ?? cursor, stop.departureAt ?? cursor);
    }
    return stops;
  }

  function trainsForDate(schedules, serviceDate, options = {}) {
    if (!schedules || typeof schedules !== 'object' || !DepartureCore) return [];
    const start = dateStart(serviceDate);
    if (start === null || !DepartureCore.validity(options, serviceDate).usable) return [];
    const calendar = calendarFor(schedules, serviceDate, options), records = schedules[calendar];
    if (!Array.isArray(records)) return [];
    const boundary = boundaryFor(options), weekday = new Date(start + JST).getUTCDay(), overrides = new Map(), seen = new Set();
    const dateOverrides = schedules.dateOverrides?.[serviceDate];
    for (const record of Array.isArray(dateOverrides) ? dateOverrides : []) {
      if (record && typeof record.id === 'string') overrides.set(record.id, record);
    }
    const results = [];
    for (const baseline of records) {
      if (!baseline || typeof baseline !== 'object') continue;
      const override = overrides.get(baseline.id);
      let record = override ? {...baseline, ...override} : baseline;
      // An exceptional departure cannot safely reuse intermediate stop times
      // from an ordinary-day service unless the exception supplies them too.
      if (override && !Array.isArray(override.stops) && Array.isArray(baseline.stops) && ['departure', 'destinationArrival', 'destinationDeparture'].some(key => Object.hasOwn(override, key) && override[key] !== baseline[key])) {
        record = {...record, stops: baseline.stops.map(stop => ({...stop, arrival: null, departure: null, time: null})), stopTimeBasis: 'partial', stopTimeNote: '날짜별 예외 시각이 적용된 열차예요. 확인되지 않은 중간역 시각은 표시하지 않아요.'};
      }
      if (record.cancelled === true || (record.validFrom && serviceDate < record.validFrom) || (record.validThrough && serviceDate > record.validThrough) || (record.validUntil && serviceDate > record.validUntil)) continue;
      if (Array.isArray(record.daysOfWeek) && !record.daysOfWeek.includes(weekday)) continue;
      if (Array.isArray(record.excludedDates) && record.excludedDates.includes(serviceDate)) continue;
      if (Array.isArray(record.operatingDates) && !record.operatingDates.includes(serviceDate)) continue;
      const departureAt = serviceAt(record.departure, start, boundary);
      if (departureAt === null) continue;
      const id = String(record.id || `${record.number || record.destination || 'train'}-${record.departure}`);
      const uid = `${id}|${serviceDate}|${departureAt}`;
      if (seen.has(uid)) continue;
      seen.add(uid);
      let arrivalAt = serviceAt(record.arrival, start, boundary);
      if (arrivalAt !== null && arrivalAt > departureAt && arrivalAt - departureAt > 12 * 60 * MINUTE) arrivalAt -= DAY;
      if (arrivalAt !== null && arrivalAt > departureAt) arrivalAt = null;
      const times = {
        arrivalAt, departureAt,
        destinationArrivalAt: after(record.destinationArrival, start, boundary, departureAt),
        destinationDepartureAt: after(record.destinationDeparture, start, boundary, departureAt)
      };
      const stops = normalizeStops(record, start, boundary, times, options);
      const train = {...record, ...times, id, uid, serviceDate, calendar, stops};
      const end = endEventFor(train, stops);
      train.destinationAt = end.at;
      train.destinationEventKind = end.kind;
      train.stopTimeBasis = ['timetable', 'estimated', 'partial'].includes(record.stopTimeBasis) ? record.stopTimeBasis : (Array.isArray(record.stops) && stops.every(s => s.eventAt !== null) ? 'timetable' : 'partial');
      train.hasUntimedStops = stops.some(stop => stop.eventAt === null);
      if (train.hasUntimedStops && train.stopTimeBasis === 'timetable') train.stopTimeBasis = 'partial';
      train.displayTime = DepartureCore.formatTime(departureAt);
      results.push(train);
    }
    return results.sort((a, b) => a.departureAt - b.departureAt || a.id.localeCompare(b.id));
  }

  function candidates(schedules, now, options = {}) {
    if (!finite(now)) return [];
    const today = dateStart(localDate(now));
    if (today === null) return [];
    const past = finite(options.pastMinutes) ? Math.max(0, options.pastMinutes) : 180;
    const future = finite(options.futureMinutes) ? Math.max(0, options.futureMinutes) : 90;
    const limit = Number.isInteger(options.limit) ? clamp(options.limit, 0, 2000) : 120;
    const result = [], seen = new Set();
    for (let offset = -1; offset <= 1; offset++) {
      for (const train of trainsForDate(schedules, localDate(today + offset * DAY), options)) {
        const ongoing = train.departureAt <= now && finite(train.destinationAt) && train.destinationAt >= now;
        if (!ongoing && (train.departureAt < now - past * MINUTE || train.departureAt > now + future * MINUTE)) continue;
        if (seen.has(train.uid)) continue;
        seen.add(train.uid);
        result.push({...train, candidateState: train.departureAt > now ? 'upcoming' : ongoing ? 'riding' : 'departed'});
      }
    }
    // A busy line must not fill the limit with the oldest departures and hide
    // the train the passenger is boarding now. Limit by relevance, then display
    // the retained candidates in chronological order.
    return result.sort((a, b) => Number(b.candidateState === 'riding') - Number(a.candidateState === 'riding') || Math.abs(a.departureAt - now) - Math.abs(b.departureAt - now)).slice(0, limit).sort((a, b) => a.departureAt - b.departureAt || a.id.localeCompare(b.id));
  }

  function isValidTrain(train) {
    return !!train && typeof train === 'object' && typeof train.id === 'string' && dateStart(train.serviceDate) !== null && finite(train.departureAt) && Array.isArray(train.stops) && train.stops.length >= 2 && train.stops.every(stop => stop && typeof stop.name === 'string' && ['arrivalAt', 'departureAt', 'timeAt'].every(key => stop[key] === null || stop[key] === undefined || finite(stop[key])));
  }

  function progress(train, now, adjustment = {}) {
    const empty = {phase: 'unknown', currentStop: null, currentStopIndex: null, previousStop: null, nextStop: null, nextStopIndex: null, nextEventAt: null, nextEventKind: null, destinationAt: null, destinationEventKind: null, remainingMs: null, remainingStops: null, progressFraction: null, elapsedMs: null, basis: 'partial', adjustmentSeconds: 0, confirmation: null, stops: [], positionKnown: false};
    if (!isValidTrain(train) || !finite(now)) return empty;
    const delaySeconds = finite(adjustment.delaySeconds) ? clamp(adjustment.delaySeconds, -86400, 86400) : 0;
    const confirmedIndex = Number.isInteger(adjustment.confirmedStopIndex) && adjustment.confirmedStopIndex >= 0 && adjustment.confirmedStopIndex < train.stops.length ? adjustment.confirmedStopIndex : null;
    let shift = delaySeconds * 1000, confirmation = null;
    if (confirmedIndex !== null && finite(adjustment.confirmedAt) && adjustment.confirmedAt <= now) {
      const stop = train.stops[confirmedIndex];
      const anchor = adjustment.confirmedEventKind === 'departure'
        ? {at: finite(stop.departureAt) ? stop.departureAt : null, kind: 'departure'}
        : eventFor(stop);
      if (anchor.at !== null) shift += adjustment.confirmedAt - anchor.at;
      confirmation = {index: confirmedIndex, stop, at: adjustment.confirmedAt, ageMs: now - adjustment.confirmedAt, applied: anchor.at !== null, sourceEventKind: anchor.kind};
    }
    const shifted = value => finite(value) ? value + shift : null;
    const stops = train.stops.map((stop, index) => {
      // An observed event is immutable. Delay changes only the future forecast.
      const originalEvent = eventFor(stop);
      const field = kind => {
        const value=stop[kind];
        if (!finite(value)) return null;
        if (!confirmation) return shifted(value);
        if (index < confirmation.index) return value;
        if (index === confirmation.index) {
          const anchor=confirmation.sourceEventKind==='departure'?stop.departureAt:originalEvent.at;
          if (value === anchor) return confirmation.at;
          if (value < anchor) return value;
        }
        return Math.max(confirmation.at, shifted(value));
      };
      const item = {...stop, arrivalAt: field('arrivalAt'), departureAt: field('departureAt'), timeAt: field('timeAt')};
      const event = eventFor(item);
      return {...item, eventAt: event.at, eventKind: event.kind};
    });
    const departureAt = stops[0].departureAt;
    const originalEnd = endEventFor(train, train.stops), destinationAt = confirmation?.index===stops.length-1 ? confirmation.at : confirmation&&originalEnd.at!==null ? Math.max(confirmation.at,shifted(originalEnd.at)) : shifted(originalEnd.at), destinationEventKind = originalEnd.kind;
    const baseBasis = train.stopTimeBasis || 'partial';
    const result = {...empty, stops, departureAt, destinationAt, destinationEventKind, baseBasis, basis: confirmation || delaySeconds !== 0 ? 'manual' : baseBasis, adjustmentSeconds: shift / 1000, confirmation, elapsedMs: Math.max(0, now - departureAt)};
    if (destinationAt !== null) {
      result.remainingMs = Math.max(0, destinationAt - now);
      if (destinationAt > departureAt) result.progressFraction = clamp((now - departureAt) / (destinationAt - departureAt), 0, 1);
    }
    if(confirmation&&result.progressFraction!==null)result.progressFraction=Math.max(result.progressFraction,confirmation.index/(stops.length-1));
    if (confirmation && !confirmation.applied) {
      // The passenger supplied a location with no corresponding source time.
      // Retain that index as the last observed position, but do not advance it
      // using an uncalibrated clock or claim arrival from a stale terminal time.
      result.phase = 'unknown';
      result.previousStop = stops[confirmation.index];
      result.remainingMs = null; result.remainingStops = null;
      result.destinationAt = null; result.destinationEventKind = null;
      result.progressFraction = null; result.elapsedMs = null;
      const nextIndex = confirmation.index + 1;
      if (nextIndex < stops.length) {
        result.nextStopIndex = nextIndex; result.nextStop = stops[nextIndex];
      }
      if (confirmation.ageMs < 1000) {
        result.currentStopIndex = confirmation.index;
        result.currentStop = stops[confirmation.index];
        result.positionKnown = true;
        result.remainingStops = stops.length - 1 - confirmation.index;
      }
      return result;
    }
    if (now < departureAt && (!confirmation || confirmation.index === 0)) {
      result.phase = 'waiting';
      result.nextStop = stops[0]; result.nextStopIndex = 0;
      result.nextEventAt = departureAt; result.nextEventKind = 'departure';
      result.remainingStops = Math.max(0, stops.length - 1);
      const first = stops[0];
      if (first.arrivalAt !== null && now >= first.arrivalAt && first.departureAt !== null && now < first.departureAt) {
        result.currentStop = first; result.currentStopIndex = 0; result.positionKnown = true;
      }
      return result;
    }
    if (destinationAt !== null && now >= destinationAt) {
      result.phase = 'arrived'; result.currentStopIndex = stops.length - 1;
      // Passing the final scheduled event does not assert live presence there.
      result.previousStop = stops[stops.length - 1];
      result.remainingStops = 0; result.progressFraction = 1;
      const last = stops[stops.length - 1];
      if (last.arrivalAt !== null && last.departureAt !== null && now >= last.arrivalAt && now < last.departureAt) { result.currentStop = last; result.positionKnown = true; }
      if (confirmation && confirmation.index === stops.length - 1 && confirmation.ageMs < 1000 && delaySeconds === 0) {result.currentStop = last; result.positionKnown = true;}
      return result;
    }
    result.phase = 'riding';
    let previousIndex = confirmation?.index ?? 0, currentIndex = null;
    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      if (stop.eventAt !== null && stop.eventAt <= now && i >= previousIndex) previousIndex = i;
      if (i >= (confirmation?.index ?? 0) && stop.arrivalAt !== null && stop.departureAt !== null && stop.arrivalAt <= now && now < stop.departureAt) currentIndex = i;
    }
    // A user confirmation locates the train at that instant, without creating dwell.
    if (confirmation && confirmation.ageMs < 1000) {
      currentIndex = confirmation.index; previousIndex = confirmation.index;
    }
    result.previousStop = stops[previousIndex] || null;
    const confirmationPending=!!confirmation && previousIndex===confirmation.index && confirmation.ageMs>=1000 && (delaySeconds!==0 || stops[previousIndex].eventAt===null);
    if(confirmationPending)currentIndex=null;
    result.confirmationPending=confirmationPending;
    if (currentIndex !== null) {result.currentStopIndex = currentIndex; result.currentStop = stops[currentIndex]; result.positionKnown = true;}
    const nextIndex = (currentIndex ?? previousIndex) + 1;
    if (nextIndex < stops.length) {
      result.nextStopIndex = nextIndex; result.nextStop = stops[nextIndex];
      result.nextEventAt = result.nextStop.eventAt; result.nextEventKind = result.nextStop.eventKind;
      result.remainingStops = stops.length - 1 - (currentIndex ?? previousIndex);
      result.positionKnown = result.positionKnown || (result.previousStop.eventAt !== null && result.nextEventAt !== null);
    } else {
      result.remainingStops = 0;
      if (destinationAt === null) result.phase = 'unknown';
    }
    if(result.confirmationPending)result.positionKnown=false;
    return result;
  }

  function itineraryMatch(days, profileKey, serviceDate, keysFor, preferred='') {
    if(dateStart(serviceDate)===null)return null;
    const matches=[];
    for(const [dayKey,legs] of Object.entries(days||{})){
      const n=Number(dayKey.split('-')[0]);
      const date=localDate(dateStart('2027-01-08')+(n-1)*DAY);
      if(date!==serviceDate)continue;
      for(let index=0;index<legs.length;index++)if(legs[index]&&keysFor(legs[index]).includes(profileKey))matches.push({dayKey,leg:legs[index],index});
    }
    return matches.find(m=>m.dayKey===preferred)||matches[0]||null;
  }
  return Object.freeze({itineraryMatch, trainsForDate, candidates, progress, isValidTrain, serviceDateForNow});
});
