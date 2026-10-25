'use strict';
// Time calculations only. Source arrival and departure times stay distinct.
// Calendar holidays must be supplied from a checked source by the caller.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DepartureCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DAY = 86400000;
  const MINUTE = 60000;
  const JST = 9 * 60 * MINUTE;
  const pad = n => String(n).padStart(2, '0');

  function parseTime(value) {
    if (typeof value !== 'string') return null;
    const match = /^(\d{1,2}):([0-5]\d)$/.exec(value);
    if (!match || Number(match[1]) > 47) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  }

  function japanDate(epoch) {
    if (!Number.isFinite(epoch)) return null;
    const date = new Date(epoch + JST);
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
  }

  function dateStart(date) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const [year, month, day] = date.split('-').map(Number);
    const utc = Date.UTC(year, month - 1, day);
    if (new Date(utc).toISOString().slice(0, 10) !== date) return null;
    return utc - JST;
  }

  function calendarFor(date, options = {}) {
    const start = dateStart(date);
    if (start === null) return null;
    const day = new Date(start + JST).getUTCDay();
    const holidays = options.holidays instanceof Set ? options.holidays : new Set(options.holidays || []);
    const monthDay = date.slice(5);
    const yearEnd = options.yearEndHoliday !== false && (monthDay >= '12-30' || monthDay <= '01-03');
    return day === 0 || day === 6 || holidays.has(date) || yearEnd ? 'SaturdayHoliday' : 'Weekday';
  }

  function scheduleCalendar(schedules, date, options) {
    if (Array.isArray(schedules.Daily)) return 'Daily';
    const combined = calendarFor(date, options);
    if (combined !== 'SaturdayHoliday') return combined;
    const day = new Date(dateStart(date) + JST).getUTCDay();
    const holidays = options.holidays instanceof Set ? options.holidays : new Set(options.holidays || []);
    const monthDay = date.slice(5);
    const yearEnd = options.yearEndHoliday !== false && (monthDay >= '12-30' || monthDay <= '01-03');
    const separate = day === 6 && !holidays.has(date) && !yearEnd ? 'Saturday' : 'SundayHoliday';
    return Array.isArray(schedules[separate]) ? separate : combined;
  }

  function serviceMinutes(value, boundary) {
    const minutes = parseTime(value);
    if (minutes === null) return null;
    return minutes < boundary * 60 ? minutes + 1440 : minutes;
  }

  function formatTime(epoch) {
    if (!Number.isFinite(epoch)) return '—';
    const date = new Date(epoch + JST);
    if (!Number.isFinite(date.getTime())) return '—';
    return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
  }

  function formatCountdown(milliseconds) {
    if (!Number.isFinite(milliseconds)) return '—';
    const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds % 3600 / 60);
    const remainder = seconds % 60;
    return hours ? `${hours}시간 ${pad(minutes)}분 ${pad(remainder)}초` : `${minutes}분 ${pad(remainder)}초`;
  }

  function dayLabel(epoch, now) {
    const date = japanDate(epoch);
    const today = japanDate(now);
    if (date === today) return '오늘';
    if (date === japanDate(now + DAY)) return '내일';
    return date;
  }

  function nextTrains(schedules, now, options = {}) {
    if (!schedules || !Number.isFinite(now)) return [];
    const boundary = Number.isInteger(options.serviceDayHour) && options.serviceDayHour >= 0 && options.serviceDayHour <= 6 ? options.serviceDayHour : 3;
    const limit = Number.isInteger(options.limit) ? Math.max(0, Math.min(options.limit, 20)) : 3;
    const lookAhead = Number.isInteger(options.lookAheadDays) ? Math.max(0, Math.min(options.lookAheadDays, 7)) : 2;
    const today = dateStart(japanDate(now));
    if (today === null) return [];
    const results = [];
    const seen = new Set();
    // Previous service day is required for post-midnight trains (00:xx / 24:xx).
    for (let offset = -1; offset <= lookAhead; offset++) {
      const start = today + offset * DAY;
      const serviceDate = japanDate(start);
      if (options.calendarFrom && serviceDate < options.calendarFrom) continue;
      if (options.calendarThrough && serviceDate > options.calendarThrough) continue;
      const serviceWeekday = new Date(start + JST).getUTCDay();
      const calendar = scheduleCalendar(schedules, serviceDate, options);
      const records = schedules[calendar];
      if (!Array.isArray(records)) continue;
      const overrides = new Map();
      const dateOverrides = schedules.dateOverrides?.[serviceDate];
      if (Array.isArray(dateOverrides)) {
        for (const record of dateOverrides) {
          if (record && typeof record === 'object' && typeof record.id === 'string') overrides.set(record.id, record);
        }
      }
      for (const baseline of records) {
        if (!baseline || typeof baseline !== 'object') continue;
        // Date-specific timetable exceptions only replace known services. Use
        // the service date, so 00:xx retains the preceding day's exception.
        const override = overrides.get(baseline.id);
        const record = override ? { ...baseline, ...override } : baseline;
        if (record.cancelled === true) continue;
        if (record.validFrom && serviceDate < record.validFrom) continue;
        if (record.validThrough && serviceDate > record.validThrough) continue;
        if (Array.isArray(record.daysOfWeek) && !record.daysOfWeek.includes(serviceWeekday)) continue;
        if (Array.isArray(record.excludedDates) && record.excludedDates.includes(serviceDate)) continue;
        if (Array.isArray(record.operatingDates) && !record.operatingDates.includes(serviceDate)) continue;
        const departure = serviceMinutes(record.departure, boundary);
        if (departure === null) continue;
        const departureAt = start + departure * MINUTE;
        // Timetables have minute precision: do not advertise boarding once that
        // departure minute starts. Delay information requires a separate feed.
        if (departureAt <= now) continue;
        const key = `${record.id || ''}|${departureAt}|${record.destination || ''}|${record.trainType || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        let arrival = serviceMinutes(record.arrival, boundary);
        if (arrival !== null && arrival > departure && arrival - departure > 720) arrival -= 1440;
        if (arrival !== null && arrival > departure) arrival = null;
        const destinationMinutes = value => {
          let minutes = serviceMinutes(value, boundary);
          if (minutes !== null && minutes < departure && departure - minutes > 720) minutes += 1440;
          return minutes !== null && minutes >= departure ? minutes : null;
        };
        const destinationArrival = destinationMinutes(record.destinationArrival);
        const destinationDeparture = destinationMinutes(record.destinationDeparture);
        const arrivalAt = arrival === null ? null : start + arrival * MINUTE;
        results.push({
          ...record,
          departureAt,
          arrivalAt,
          destinationArrivalAt: destinationArrival === null ? null : start + destinationArrival * MINUTE,
          destinationDepartureAt: destinationDeparture === null ? null : start + destinationDeparture * MINUTE,
          serviceDate,
          calendar,
          displayTime: formatTime(departureAt),
          dayLabel: dayLabel(departureAt, now),
          boardingStatus: arrivalAt !== null && arrivalAt <= now ? 'scheduled-stop' : 'scheduled',
          secondsUntilDeparture: Math.max(0, Math.ceil((departureAt - now) / 1000)),
          secondsUntilArrival: arrivalAt === null ? null : Math.max(0, Math.ceil((arrivalAt - now) / 1000))
        });
      }
    }
    return results.sort((a, b) => a.departureAt - b.departureAt || String(a.id || '').localeCompare(String(b.id || ''))).slice(0, limit);
  }

  return Object.freeze({ parseTime, japanDate, calendarFor, formatTime, formatCountdown, nextTrains });
});
