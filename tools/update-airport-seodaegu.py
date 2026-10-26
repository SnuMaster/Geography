#!/usr/bin/env python3
"""Rebuild airport geometry and the Busan-Seodaegu planning timetable.

Inputs are downloaded source files, never a home address. N02 coordinates remain
on consecutive source vertices; station markers are not appended to the track.
Usage: python tools/update-airport-seodaegu.py --n02 /tmp/n02-2024/UTF-8 --osm /tmp
"""
import argparse
import copy
import hashlib
import heapq
import json
import math
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'japan-2027'
DATE = '2026-10-26'
OLD_KEY, KEY = 'korail-busan-dongdaegu', 'korail-busan-seodaegu'
N02_URL = 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02-2024.html'


def read(path):
    return json.loads(path.read_text())


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n')


def distance(a, b):
    a, b = [tuple(map(math.radians, p)) for p in (a, b)]
    v = math.sin((b[0]-a[0])/2)**2 + math.cos(a[0])*math.cos(b[0])*math.sin((b[1]-a[1])/2)**2
    return 6371000 * 2 * math.atan2(math.sqrt(v), math.sqrt(max(0, 1-v)))


def shortest(graph, start, end):
    costs, previous, queue = {start: 0}, {}, [(0, start)]
    while queue:
        cost, a = heapq.heappop(queue)
        if cost != costs[a]:
            continue
        if a == end:
            break
        for b, length, source in graph[a]:
            if cost + length < costs.get(b, math.inf):
                costs[b] = cost + length
                previous[b] = a, source
                heapq.heappush(queue, (cost + length, b))
    if end not in costs:
        raise ValueError('Source geometry is disconnected; do not invent a connector')
    path, sources = [end], []
    while path[-1] != start:
        a, source = previous[path[-1]]
        path.append(a)
        sources.append(source)
    return path[::-1], sources[::-1], costs[end]


def airports(n02):
    files = [n02 / ('N02-24_' + kind + '.geojson') for kind in ('RailroadSection', 'Station')]
    features = [feature for file in files for feature in read(file)['features']]
    routes = read(ROOT / 'west-routes.json')
    evidence = {'checkedAt': DATE, 'source': N02_URL, 'licence': 'CC BY 4.0',
                'attribution': '国土交通省 国土数値情報 鉄道N02 (2024)',
                'sourceSha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in files},
                'method': 'Dijkstra over consecutive original N02 vertices, including station sections. No snapping, smoothing, or straight connectors to markers.',
                'routes': []}
    specs = [
        ('12-main', 1, ['東北線', '東海道線'], '東日本旅客鉄道', [35.7139,139.777], [35.6553,139.757]),
        ('12-main', 2, ['東京モノレール羽田線'], '東京モノレール', [35.6558,139.7567], [35.549461,139.78389]),
        ('18-main', 3, ['1号線(空港線)'], '福岡市', [33.5975,130.448], [33.5902,130.4207]),
    ]
    for day, index, lines, operator, start_ref, end_ref in specs:
        graph = defaultdict(list)
        for i, feature in enumerate(features):
            p, geometry = feature['properties'], feature['geometry']
            if p['N02_003'] not in lines or p['N02_004'] != operator:
                continue
            if geometry['type'] != 'LineString':
                raise ValueError(geometry['type'])
            coords = [(lat, lng) for lng, lat in geometry['coordinates']]
            for a, b in zip(coords, coords[1:]):
                graph[a].append((b, distance(a, b), i))
                graph[b].append((a, distance(a, b), i))
        start = min(graph, key=lambda p: distance(start_ref, p))
        end = min(graph, key=lambda p: distance(end_ref, p))
        coords, source_indices, length = shortest(graph, start, end)
        leg = routes['days'][day][index]
        part = leg['parts'][0]
        part.update(coords=coords, distanceM=round(length), geometryAccuracy='mapped', source=N02_URL,
                    geometrySource='国土交通省 N02(2024) 철도·역 선형 · ' + ' / '.join(lines) + ' · CC BY 4.0')
        leg.update(distanceM=round(length), geometryAccuracy='mapped', geometrySources=[N02_URL],
                   note='국토교통성 N02 철도 좌표를 따라 표시합니다. 승강장·개찰구·공항 터미널 내부 보행은 별도 확인. 지도 선로 거리와 영업거리는 다를 수 있습니다.')
        evidence['routes'].append({'day': day, 'legIndex': index+1, 'from': leg['from'], 'to': leg['to'],
                                  'vertexCount': len(coords), 'distanceM': round(length),
                                  'sourceFeatureIndices': sorted(set(source_indices)),
                                  'maximumSourceEdgeM': round(max(distance(a,b) for a,b in zip(coords,coords[1:])),1),
                                  'markerOffsetsM': [round(distance(start_ref,start),1),round(distance(end_ref,end),1)]})
    save(ROOT / 'west-routes.json', routes)
    save(ROOT / 'assets/routes/airport-access-sources.json', evidence)


def timetable():
    original = read(ROOT / ('timetables/' + OLD_KEY + '.json'))
    rows = []
    for source in original['profiles'][OLD_KEY]['Daily']:
        times = source.get('sourceStopTimes', {})
        if not times.get('서대구'):
            continue
        row = copy.deepcopy(source)
        row['stops'] = []
        for name in ['부산', '울산', '경주', '동대구', '서대구']:
            if not times.get(name):
                continue
            stop = {'id': 'KORAIL.'+name, 'name': name}
            if name == '부산':
                stop['departure'] = times[name]
            else:
                stop.update(time=times[name], timeKind='source-event')
            row['stops'].append(stop)
        rows.append(row)
    metadata = copy.deepcopy(original['metadata'][OLD_KEY])
    metadata.update(retrievedAt=DATE, verifiedSourceDate=DATE,
                    verification='Official KORAIL Gyeongbu up table: services stopping at both Busan and Seodaegu via the high-speed line. Gupo/Mulgeum/Miryang/Gyeongsan services excluded. Exact seconds and operating weekdays preserved.',
                    futureTravelNotice='2027-01-29 계획은 현재 공개된 2026-11-01 정규표 참고값. 예약·발권·여행일 운행 확정이 아니며 예매 시 재확인합니다.')
    metadata['rideStops'].update(retrievedAt=DATE, counts={'timetable': len(rows)})
    for source in metadata['sources']:
        selected = [r for r in rows if r['validFrom'] == source['revision']]
        source['selectedTrainRows'] = sum(len(r.get('sourceRows', [])) for r in selected)
        source['dailyDepartures'] = {str(day): sum(day in r['daysOfWeek'] for r in selected) for day in range(7)}
        source.pop('excluded', None)
    result = {'schemaVersion': 2, 'profiles': {KEY: {'Daily': rows}}, 'metadata': {KEY: metadata}}
    save(ROOT / ('timetables/' + KEY + '.json'), result)
    manifest_path = ROOT / 'rail-departure-profiles.js'
    text = manifest_path.read_text()
    manifest = json.loads(text.split('globalThis.RailDepartureProfiles=',1)[1].rstrip(';\n'))
    profile = manifest['profiles'].pop(OLD_KEY, None) or manifest['profiles'][KEY]
    profile.update(to='서대구', toJa='서대구', toCode='서대구', direction='서대구·서울·수서 방면', directionJa='서대구·서울·수서 방면',
                   file='timetables/'+KEY+'.json', sourceDate=DATE,
                   matches=[{'lineId':'KORAIL.GyeongbuHSR','from':'부산역','to':'서대구역 KTX'}])
    profile['metadata'].update(retrievedAt=DATE, verifiedSourceDate=DATE,
                               note=metadata['calendarNote'] + ' 서대구 정차편만 수록. 현재 공개표 참고이며 여행일 운행·좌석 확정 아님.')
    manifest['profiles'][KEY] = profile
    manifest['coverage']['baselineRecords'] += len(rows)-len(original['profiles'][OLD_KEY]['Daily']) if OLD_KEY in text else 0
    manifest_path.write_text("'use strict';\nglobalThis.RailDepartureProfiles=" + json.dumps(manifest,ensure_ascii=False,separators=(',',':')) + ';\n')


def korea_geometry(osm):
    files = [osm / 'gyeongbu-hsr.xml', osm / 'seodaegu-map.xml'] + sorted(osm.glob('daegu-map-*.xml'))
    nodes, ways = {}, {}
    for file in files:
        root = ET.parse(file).getroot()
        for node in root.findall('node'):
            nodes[int(node.get('id'))] = (float(node.get('lat')), float(node.get('lon')))
        for way in root.findall('way'):
            ways[int(way.get('id'))] = ([int(n.get('ref')) for n in way.findall('nd')],
                                      {t.get('k'):t.get('v') for t in way.findall('tag')})
    graph = defaultdict(list)
    # The source labels Seodaegu's actual platform access track as a siding.
    # Include that named station track, not yards or arbitrary sidings.
    platform_ways = {888333755, 888333757}
    for wid, (ids, tags) in ways.items():
        if tags.get('railway') != 'rail' or tags.get('service') in ['yard','spur']:
            continue
        if tags.get('service') == 'siding' and wid not in platform_ways:
            continue
        for a,b in zip(ids,ids[1:]):
            if a not in nodes or b not in nodes:
                raise ValueError('Missing original OSM node')
            length = distance(nodes[a],nodes[b])
            if tags.get('oneway') != '-1':
                graph[a].append((b,length,wid))
            if tags.get('oneway') != 'yes':
                graph[b].append((a,length,wid))
    ids, source_ways, length = shortest(graph,1768990671,8259053344)
    coords = [nodes[n] for n in ids]
    sources = read(ROOT / 'assets/routes/return-route-sources.json')
    old = sources['ktx']
    note = 'OSM 선로를 부산→울산→경주→동대구→서대구 순으로 연결한 지도 참고 경로입니다. 대구 시내는 서대구 정차선으로 이어집니다. 실제 열차의 승강장·분기기 운용·당일 주행 궤적을 확정하지 않습니다. 터널 일부는 원본 좌표가 성깁니다.'
    old.update(version='20261026-seodaegu-osm-1',checkedAt=DATE,to='서대구역',via=['울산역','경주역','동대구역'],
               coords=coords,distanceM=round(length),note=note,
               geometrySource='OpenStreetMap source railway ways: Gyeongbu HSL then Seodaegu stopping tracks via central Daegu',
               sourceNodeIds=ids,sourceWayIds=source_ways,
               sourceMetadata={'rawFilesSha256':{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in files}},
               method={'graph':'Only consecutive original OSM nodes. Original oneway direction respected. Crossovers included; yards/spurs excluded. Only the Seodaegu platform siding is allowed.',
                       'algorithm':'Dijkstra from Busan source mainline node 1768990671 to Seodaegu source stop_position node 8259053344. No fabricated connectors.',
                       'sourceTrackDirection':'Busan to Seodaegu, consistent with original oneway tags',
                       'endpointSelection':'Source rail nodes; station POIs are not appended.'})
    old['sources'] = ['https://api.openstreetmap.org/api/0.6/relation/6094351/full',
                      'https://api.openstreetmap.org/api/0.6/map?bbox=128.535,35.875,128.555,35.890'] + [
                      'https://api.openstreetmap.org/api/0.6/map?bbox='+box for box in [
                          '128.555,35.87,128.575,35.895','128.575,35.87,128.595,35.895',
                          '128.595,35.87,128.615,35.895','128.615,35.875,128.635,35.885']
                      ] + ['https://www.openstreetmap.org/copyright']
    station_refs = [('부산역',[35.1155532,129.0425868]),('울산역',[35.5513139,129.1379303]),
                    ('경주역',[35.7982689,129.1389632]),('동대구역',[35.8794,128.6284]),('서대구역',[35.8813221,128.5402289])]
    proximity = []
    for name, reference in station_refs:
        i = min(range(len(coords)),key=lambda i:distance(reference,coords[i]))
        proximity.append({'name':name,'referenceCoord':reference,'minimumVertexDistanceM':round(distance(reference,coords[i]),1),'coordIndex':i})
    if [p['coordIndex'] for p in proximity] != sorted(p['coordIndex'] for p in proximity):
        raise ValueError('Wrong station order')
    if any(p['minimumVertexDistanceM'] > 250 for p in proximity):
        raise ValueError('Route misses a required station')
    old['validation'] = {'vertexCount':len(coords),'edgeCount':len(source_ways),'distinctWayCount':len(set(source_ways)),
                         'allEdgesAdjacentInOriginalWay':True,'allEdgesRailwayRail':True,'fabricatedConnectors':0,
                         'sourceGapCount':0,'oppositeOnewayEdges':0,'repeatedNodeCount':len(ids)-len(set(ids)),
                         'routePassesStationOrder':True,'stationProximity':proximity,
                         'maximumOriginalEdgeLengthM':round(max(distance(a,b) for a,b in zip(coords,coords[1:])),1)}
    sources['checkedAt'] = DATE
    save(ROOT / 'assets/routes/return-route-sources.json',sources)
    routes = read(ROOT / 'west-routes.json')
    leg = routes['days']['22-main'][5]
    leg.update(to='서대구역 KTX',distanceM=round(length),durationMinutes=64,durationLabel='약64분 · 330편 참고',
               summary='KTX-산천 330 · 울산·경주·동대구 경유',note=note,geometrySources=old['sources'],via=['울산','경주','동대구'])
    leg['parts'][0].update(to='서대구역 KTX',coords=coords,distanceM=round(length),durationMinutes=64,
                           line='KTX 경부고속선 · 울산·경주·동대구 경유',geometryAccuracy='mapped',
                           geometrySource='©OpenStreetMap 경부고속선·서대구 정차선 선형 · 부산→울산→경주→동대구→서대구',
                           source='https://www.openstreetmap.org/node/8259053344')
    leg['fare'].update(min=16300,max=16300,passExtraMin=16300,passExtraMax=16300,label='16,300원',checkedAt=DATE,
                       basis='2026.9.1 공식 운임표: 부산↔서대구 울산·경주 고속선 일반실16,300원. 330편 현재표 참고이며 여행일 발권 요금·할인은 예매 시 확인.',
                       sources=['https://www.srail.or.kr/cms/article/view.do?pageId=TK0502000000&postNo=909',
                                'https://www.srail.or.kr/cms/attach/download.do?pageId=TK0502000000&atchNo=180'])
    save(ROOT / 'west-routes.json',routes)


def plan():
    data = read(ROOT / 'data.json')
    day = next(d for d in data['days'] if d['n']==22)
    day.update(title='부산에서 쉬고 서대구행 기차',focus='부산역 근처에서 아침·카페·짐 회수를 마치고 12:44 서대구 정차편을 목표로 귀가한다.',
               cityEn='BUSAN → SEODAEGU',shortTitle='부산 카페·서대구 귀환',mapSummary='부산역 주변 → 서대구역',
               important='부산12:44 → 서대구13:47:30 정차 · KTX-산천330 현재 공개표 참고. 2027/1/29 운행·좌석·발매가는 예매 시 재확인.',
               routes=['부산→서대구 직통 고속선 KTX-산천330(수서행) 계획. 울산·경주·동대구 경유, 동대구에서 내리지 않고 서대구까지 간다.',
                       '현재 공개된 2026/11/1 개정표 기준12:44 출발·13:47:30 정차. 2027/1/29 운행 확정·예약·발권은 아니며 예매 시 재확인한다.',
                       '서대구역 하차 후 택시·대중교통으로 귀가. 하차 후 이동시간·운임은 별도 확인한다.'],
               note='카페1시간과 짐 회수 일정을 유지한다. 부산역에는12:10 전후 도착해12:20까지 승강장에서 대기하고12:44 열차를 목표로 한다. 서대구 하차 후 귀가한다.')
    variant = day['variants'][0]
    station, destination = variant['stops'][-2:]
    station.update(time='12:10~12:20',start='12:10',end='12:20',
                   description='12:20까지 승강장 대기. 12:44 서대구 정차 KTX-산천330(수서행) 현재표 참고. 여행일 운행·좌석 재확인.')
    station['details'].update(feature=station['description'],reservationNote='2027/1/29 예매 개시 후 서대구 정차 여부·열차번호·좌석 재확인. 현재표 참고·미발권.')
    destination.update(name='서대구역 KTX',lat=35.8813666,lng=128.5417368,address='대구광역시 서구 와룡로527',
                       time='13:48~14:00',start='13:48',end='14:00',precision='OpenStreetMap station POI',
                       source='https://www.openstreetmap.org/node/8259053324',coordinateNote='서대구역 역 대표점. 실제 승강장·출구와는 다를 수 있습니다.',
                       transportFromPrevious='부산 → 서대구 KTX-산천330 직통 · 현재표 참고',timeConfidence='current-timetable-reference',
                       description='공식 현재표330편 서대구 정차13:47:30 기준, 13:48 전후 하차·출구 이동 후 귀가. 2027/1/29 운행 확정·예약·발권 아님.')
    destination['details'].update(feature=destination['description'],thingsToDo=['서대구 정차 안내를 확인하고 하차','출구에서 귀가 교통편 선택'],
                                  typicalStayMin=12,stayLabel='13:48 전후 하차·출구 이동',hours='현재표 정차13:47:30 · 여행일 운행 재확인',
                                  reservationNote='2026/11/1 정규표의 KTX-산천330 참고. 2027/1/29 예매 시 운행·시각·좌석을 확인.',sourceCheckedAt=DATE,
                                  sources=['https://www.korail.com/file/cubedata/COMMON/jfile/202610/13/202610131a130b1ac0b200.xlsx','https://www.korail.com/ticket/search/general'])
    variant['schedule'] = [[s['time'],s['name'],s['description']] for s in variant['stops']]
    day['schedule'] = day['rows'] = variant['schedule']
    save(ROOT / 'data.json',data)
    evidence = read(ROOT / 'fare-evidence.json')
    evidence['korea'].update(to='서대구',via='울산·경주·동대구 고속선',adultOrdinaryOneWayKRW=16300,checkedAt=DATE,
                             sheet='11-1. 수서~(서대구)~부산',cells={'B65':'서대구','C65':'부산','D5':'일반실','D65':16300},
                             notes=['2026.9.1 공식 KTX 운임표의 부산↔서대구 고속선 일반실16,300원. 330편은 수서행으로11-1시트를 대조했다.',
                                    '구포 경유편 운임12,100원과 구분. 2027/1/29 운행·좌석·할인·발권 요금은 예매 시 확인.'])
    save(ROOT / 'fare-evidence.json',evidence)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--n02', type=Path, required=True)
    parser.add_argument('--osm', type=Path, required=True, help='Directory of the source XML files listed in return-route-sources.json')
    args = parser.parse_args()
    airports(args.n02)
    timetable()
    korea_geometry(args.osm)
    plan()
