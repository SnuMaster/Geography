#!/usr/bin/env python3
"""Attach source-backed boarding-to-alighting stop times to Tokyo profiles.

Run with --source-dir pointing at the saved research inputs. The input bundle
contains tokyo-raw-source.json (Mini Tokyo 3D commit below),
tokyo-all-profiles.json, skyliner-current-lines.json, skyliner-new-lines.json,
and Geography/japan-2027/day1-timetables.json for checked holiday dates.

Only stops and their provenance are added. Departures, calendars, validity,
and existing per-date timetable corrections are preserved. Official seasonal
Fuji stop tables below are factual transcriptions of the linked notices.
"""
from __future__ import annotations

import argparse
import copy
import datetime as dt
import json
import re
from collections import Counter
from pathlib import Path

SNAPSHOT = '68314fe92773aa4691075b79243f2010fc8e2836'
SOURCE = 'https://github.com/nagix/mini-tokyo-3d/tree/' + SNAPSHOT + '/data'
FUJI_SOURCE = {
    '93': 'https://www.fujikyu-railway.jp/news/info.php?no=829',
    '94': 'https://www.fujikyu-railway.jp/news/info.php?no=829',
    '81': 'https://www.fujikyu-railway.jp/news/info.php?no=830',
    '78': 'https://www.fujikyu-railway.jp/news/info.php?no=830',
}
FUJI_OUTBOUND_IDS = [
    'JR-East.ChuoRapid.Shinjuku', 'JR-East.ChuoRapid.Tachikawa',
    'JR-East.ChuoRapid.Hachioji', 'Fujikyu.Fujikyu.Otsuki',
    'Fujikyu.Fujikyu.Tsurubunkadaigakumae', 'Fujikyu.Fujikyu.Shimoyoshida',
    'Fujikyu.Fujikyu.MtFuji', 'Fujikyu.Fujikyu.FujikyuHighland',
    'Fujikyu.Fujikyu.Kawaguchiko',
]
# The official 2026-10-22 notices label intermediate values as departures.
# In particular, 81 Tachikawa 09:31 and 78 Tachikawa 18:02 supersede
# the older snapshot's 09:30 / 18:03; no arrival values are inferred.
FUJI_TIMES = {
    '93': ['11:34', '12:01', '12:09', '12:42', '13:00', '13:18', '13:25', '13:28', '13:31'],
    '94': ['15:39', '15:42', '15:47', '15:54', '16:10', '16:29', '17:06', '17:15', '17:45'],
    '81': ['09:02', '09:31', '09:42', '10:20', '10:39', '11:03', '11:10', '11:13', '11:15'],
    '78': ['16:12', '16:15', '16:20', '16:25', '16:40', '17:23', '17:53', '18:02', '18:29'],
}


def normalized(s):
    return re.sub(r'\.\d+$', '', s)


def same_station(a, b):
    # Through services use different line prefixes for the same physical stop.
    return normalized(a).rsplit('.', 1)[-1] == normalized(b).rsplit('.', 1)[-1]


def minute(value):
    if not value:
        return None
    h, m, *s = map(int, value.split(':'))
    return h * 60 + m + ((s[0] / 60) if s else 0) + (1440 if h < 3 else 0)


def calendar_of(train):
    return re.search(r'\.(Weekday|SaturdayHoliday)(?:\.|$)', train['id'])[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, required=True)
    parser.add_argument('--site', type=Path, default=Path(__file__).resolve().parents[1] / 'japan-2027')
    args = parser.parse_args()
    source_dir = args.source_dir
    raw = json.loads((source_dir / 'tokyo-raw-source.json').read_text())
    profiles = {p['key']: p for p in json.loads((source_dir / 'tokyo-all-profiles.json').read_text())['profiles']}
    stations = {s['id']: s for s in raw['data/stations.json']}
    trains = {t['id']: t for k, values in raw.items() if '/train-timetables/' in k for t in values}
    holidays = set(json.loads((source_dir / 'Geography/japan-2027/day1-timetables.json').read_text())['holidays'])

    def station_event(event):
        sid = normalized(event['s'])
        s = stations.get(event['s']) or stations.get(sid)
        stop = {'id': sid, 'name': (s or {}).get('title', {}).get('ko') or (s or {}).get('title', {}).get('ja') or sid.rsplit('.', 1)[-1]}
        if s:
            if s.get('title', {}).get('ja'):
                stop['nameJa'] = s['title']['ja']
            if s.get('coord'):
                stop['coord'] = [s['coord'][1], s['coord'][0]]
        if event.get('a'):
            stop['arrival'] = event['a']
        if event.get('d'):
            stop['departure'] = event['d']
        return stop

    def endpoint(sid, label, arrival=None, departure=None):
        result = station_event({'s': sid, 'a': arrival, 'd': departure})
        if result['name'] == sid.rsplit('.', 1)[-1]:
            result['name'] = label
        return result

    def append_events(left, right):
        result = copy.deepcopy(left)
        for event in right:
            if result and same_station(result[-1]['s'], event['s']):
                # Merge the preceding segment's arrival and continuation's
                # departure at a line boundary or at Osaki on the loop.
                merged = result[-1]
                if event.get('a') and not merged.get('a'):
                    merged['a'] = event['a']
                if event.get('d'):
                    merged['d'] = event['d']
            else:
                result.append(copy.deepcopy(event))
        return result

    def onward(train, start, target, visited=()):
        if len(visited) > 5 or train['id'] in visited:
            return None
        events = train['tt'][start:]
        for i, event in enumerate(events):
            if i > 0 and same_station(event['s'], target):
                return events[:i + 1]
        for nid in train.get('nt', []):
            nxt = trains.get(nid)
            if not nxt or calendar_of(nxt) != calendar_of(train):
                continue
            if nxt['r'] == train['r'] and nxt['d'] != train['d']:
                continue
            if nxt.get('pt') and train['id'] not in nxt['pt']:
                continue
            if nxt['tt'] and same_station(nxt['tt'][0]['s'], target):
                return append_events(events, nxt['tt'][:1])
            found = onward(nxt, 0, target, visited + (train['id'],))
            if found:
                return append_events(events, found)
        return None

    def raw_sequence(p, record):
        train = trains.get(record['id'])
        if not train:
            return None
        indices = [i for i, e in enumerate(train['tt']) if same_station(e['s'], p['sourceFromId']) and e.get('d')]
        # Choosing by departure avoids selecting the wrong pass around a loop.
        indices.sort(key=lambda i: train['tt'][i].get('d') != record.get('departure'))
        for i in indices:
            found = onward(train, i, p['sourceToId'])
            if found:
                return [station_event(e) for e in found]
        return None

    def validate(stops, record, key):
        assert len(stops) >= 2, (key, record['id'], 'not enough endpoints')
        if record.get('departure'):
            assert stops[0].get('departure') == record['departure'], (key, record['id'], 'origin departure')
        if record.get('destinationArrival'):
            assert stops[-1].get('arrival') == record['destinationArrival'], (key, record['id'], 'destination arrival')
        if record.get('destinationDeparture'):
            assert stops[-1].get('departure') == record['destinationDeparture'], (key, record['id'], 'destination departure')
        previous = -1
        for stop in stops:
            for field in ('arrival', 'departure'):
                value = minute(stop.get(field))
                if value is not None:
                    assert value >= previous, (key, record['id'], 'nonmonotonic', stop, previous)
                    previous = value

    def standard_stops(p, record):
        if record['id'].startswith('Official.FujiExcursion.'):
            number = record['id'].split('.')[2]
            ids = FUJI_OUTBOUND_IDS if number in ('93', '81') else list(reversed(FUJI_OUTBOUND_IDS))
            stops = [station_event({'s': sid, 'd' if i < len(ids)-1 else 'a': time}) for i, (sid, time) in enumerate(zip(ids, FUJI_TIMES[number]))]
            return stops, 'timetable', '공식 임시열차 공지의 정차역별 시각입니다. 중간역은 출발시각만 제공하며, 공지된 운행일에만 활성화됩니다.'
        stops = raw_sequence(p, record)
        if stops:
            changed = (record.get('departure') is not None and stops[0].get('departure') != record['departure']) or (record.get('destinationArrival') is not None and stops[-1].get('arrival') != record['destinationArrival']) or (record.get('destinationDeparture') is not None and stops[-1].get('departure') != record['destinationDeparture'])
            if changed and len(stops) > 2:
                # Never shift or interpolate intermediate times after an
                # independently corrected endpoint without a matching source.
                stops = None
            else:
                for field, value in [('arrival', record.get('arrival')), ('departure', record.get('departure'))]:
                    stops[0].pop(field, None)
                    if value is not None:
                        stops[0][field] = value
                for field, value in [('arrival', record.get('destinationArrival')), ('departure', record.get('destinationDeparture'))]:
                    stops[-1].pop(field, None)
                    if value is not None:
                        stops[-1][field] = value
                return stops, 'timetable', '열차별 원본 정차 순서와 시각입니다. 도착시각이 없는 역은 출발시각만 표시합니다.'
        return [
            endpoint(p['sourceFromId'], p['from'], record.get('arrival'), record.get('departure')),
            endpoint(p['sourceToId'], p['to'], record.get('destinationArrival'), record.get('destinationDeparture')),
        ], 'partial', '이 열차의 중간 정차역 시각을 확인할 수 없어 승차·하차역의 확인된 시각만 표시합니다.'

    def calendar_date(date):
        return 'SaturdayHoliday' if date.weekday() >= 5 or date.isoformat() in holidays or date.strftime('%m-%d') >= '12-30' or date.strftime('%m-%d') <= '01-03' else 'Weekday'

    def sky_rows(name):
        lines = json.loads((source_dir / name).read_text())
        result = {'Weekday': {}, 'SaturdayHoliday': {}}
        inbound = False
        calendar = None
        for _, line in sorted(lines.items(), key=lambda pair: int(pair[0])):
            if line.startswith('### 上り'):
                inbound = True
            if not inbound:
                continue
            if line.startswith('#### 平日'):
                calendar = 'Weekday'
            elif line.startswith('#### 土曜'):
                calendar = 'SaturdayHoliday'
            cells = [cell.strip() for cell in line.split('|')]
            if calendar and len(cells) == 7 and cells[0].isdigit():
                result[calendar][cells[0]] = cells
        assert all(len(rows) == 44 for rows in result.values()), {k:len(v) for k,v in result.items()}
        return result

    sky_current = sky_rows('skyliner-current-lines.json')
    sky_new = sky_rows('skyliner-new-lines.json')

    def sky_stops(row):
        ids = ['Keisei.NaritaSkyAccess.NaritaAirportTerminal2and3', 'Keisei.NaritaSkyAccess.ShinKamagaya', 'Keisei.NaritaSkyAccess.Aoto', 'Keisei.NaritaSkyAccess.Nippori', 'Keisei.NaritaSkyAccess.KeiseiUeno']
        stops = []
        for i, (sid, value) in enumerate(zip(ids, row[2:])):
            if value == '-':
                continue
            h, m = map(int, value.split(':'))
            stops.append(station_event({'s': sid, 'd' if i == 0 else 'a': f'{h:02d}:{m:02d}'}))
        return stops

    counts = Counter()
    override_count = 0
    partial = []
    bytes_before = bytes_after = 0
    for key, p in profiles.items():
        path = args.site / 'timetables' / (key + '.json')
        payload = json.loads(path.read_text())
        schedules = payload['profiles'][key]
        bases = {}
        for calendar, records in schedules.items():
            if not isinstance(records, list):
                continue
            for record in records:
                # Idempotence: old enrichment never feeds back into decisions.
                for field in ('stops', 'stopTimeBasis', 'stopTimeNote'):
                    record.pop(field, None)
                if key.startswith('skyliner-'):
                    number = re.search(r'(\d+)호', record['number'])[1]
                    stops, basis, note = sky_stops(sky_current[calendar][number]), 'timetable', '게이세이 공식 시간표입니다. 승차역은 출발시각, 중간 정차역과 하차역은 도착시각만 제공됩니다.'
                else:
                    stops, basis, note = standard_stops(p, record)
                validate(stops, record, key)
                record.update(stops=stops, stopTimeBasis=basis, stopTimeNote=note)
                bases[record['id']] = record
                counts[basis] += 1
                counts['stops'] += len(stops)
                if basis == 'partial':
                    partial.append((key, record['id']))
        if key.startswith('skyliner-'):
            date = dt.date(2026, 11, 21)
            while date <= dt.date(2027, 2, 28):
                calendar = calendar_date(date)
                for record in schedules[calendar]:
                    number = re.search(r'(\d+)호', record['number'])[1]
                    updated_stops = sky_stops(sky_new[calendar][number])
                    if record['stops'] == updated_stops:
                        continue
                    overrides = schedules.setdefault('dateOverrides', {}).setdefault(date.isoformat(), [])
                    override = next((r for r in overrides if r['id'] == record['id']), None)
                    if override is None:
                        override = {'id': record['id']}
                        overrides.append(override)
                    override.update(stops=updated_stops, stopTimeBasis='timetable', stopTimeNote='2026-11-21 개정 게이세이 공식 시간표의 정차역별 시각입니다. 중간역 출발시각은 미제공입니다.')
                    # A departure change must already have been verified in
                    # the existing calendar exception. Intermediate-only
                    # changes simply add a stops override.
                    merged = {**record, **override}
                    validate(updated_stops, merged, key)
                date += dt.timedelta(days=1)
        for date, overrides in schedules.get('dateOverrides', {}).items():
            for override in overrides:
                base = bases.get(override['id'])
                if not base:
                    continue
                merged = {**base, **override}
                if key.startswith('skyliner-'):
                    if 'stops' not in override:
                        number = re.search(r'(\d+)호', base['number'])[1]
                        source = sky_new if date >= '2026-11-21' else sky_current
                        override.update(stops=sky_stops(source[calendar_date(dt.date.fromisoformat(date))][number]), stopTimeBasis='timetable', stopTimeNote=base['stopTimeNote'])
                else:
                    for field in ('stops', 'stopTimeBasis', 'stopTimeNote'):
                        merged.pop(field, None)
                    stops, basis, note = standard_stops(p, merged)
                    override.update(stops=stops, stopTimeBasis=basis, stopTimeNote=note)
                validate(override['stops'], {**base, **override}, key)
                override_count += 1
        meta = payload.setdefault('metadata', {}).setdefault(key, {})
        meta['rideStops'] = {
            'source': SOURCE,
            'sourceCommit': SNAPSHOT,
            'retrievedAt': '2026-10-25',
            'scope': '승차역부터 하차역까지 해당 열차가 실제 정차하는 역만 연결. 원본 nt 연결로 동일 차량의 직통·순환 구간을 이어 붙임.',
            'timeFields': 'arrival와 departure는 원문에서 제공하는 필드만 사용. 좌표는 원본 stations.json의 경위도를 위도·경도 순으로 변환.',
            'license': 'Mini Tokyo 3D, MIT; existing attribution is preserved.',
        }
        if key.startswith('fujiexcursion-'):
            meta['rideStops']['officialSeasonalSources'] = sorted(set(FUJI_SOURCE.values()))
            meta['rideStops']['officialSeasonalChecked'] = '2026-10-25'
        if key.startswith('skyliner-'):
            meta['rideStops']['officialSources'] = [
                'https://www.keisei.co.jp/keisei/tetudou/skyliner/jp/traffic/skyliner_timetable.php',
                'https://www.keisei.co.jp/keisei/tetudou/skyliner/jp/traffic/skyliner_timetable_1121.php',
            ]
            meta['rideStops']['revisionNote'] = '2026-11-21 이후 휴일 160호 신카마가야 도착 및 62호 닛포리 도착의 변경도 정차역별 dateOverrides로 반영.'
        bytes_before += path.stat().st_size
        path.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n')
        bytes_after += path.stat().st_size
    print(json.dumps({'profiles': len(profiles), 'baseRecords': counts['timetable'] + counts['partial'], 'counts': dict(counts), 'dateOverrides': override_count, 'partialRecords': partial, 'bytesBefore': bytes_before, 'bytesAfter': bytes_after}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
