"""Extract connected railway paths from MLIT N02-25 (stdlib only).

Input: downloaded N02-25_GML.zip in TOKYO_REPLAN_CACHE.
Source: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02-2025.html
License: CC BY 4.0. Output is a processed excerpt, not live train tracking.
"""
import hashlib
import heapq
import json
import math
import os
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent
CACHE = Path(os.environ.get('TOKYO_REPLAN_CACHE', ROOT.parent / '.tokyo-replan-cache'))
ARCHIVE = CACHE / 'N02-25_GML.zip'
SOURCE = 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02-2025.html'


def distance(a, b):
    lat1, lat2 = math.radians(a[1]), math.radians(b[1])
    h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(math.radians(b[0]-a[0])/2)**2
    return 6371000 * 2 * math.asin(min(1, math.sqrt(h)))


def path_for(sections, stations, line, operator, start, end):
    selected = [f for f in sections + stations if f['properties'].get('N02_003') == line and f['properties'].get('N02_004') == operator]
    graph = {}
    for f in selected:
        assert f['geometry']['type'] == 'LineString'
        points = [tuple(p[:2]) for p in f['geometry']['coordinates']]
        for a, b in zip(points, points[1:]):
            cost = distance(a, b)
            graph.setdefault(a, {})[b] = cost
            graph.setdefault(b, {})[a] = cost
    def station_point(name):
        candidates = [f for f in selected if f['properties'].get('N02_005') == name]
        assert len(candidates) == 1, (line, name, len(candidates))
        c = candidates[0]['geometry']['coordinates']
        return tuple(c[len(c)//2][:2])
    a, b = station_point(start), station_point(end)
    pending, costs, previous = [(0, a)], {a: 0}, {}
    while pending:
        cost, node = heapq.heappop(pending)
        if cost != costs[node]:
            continue
        if node == b:
            break
        for nxt, step in graph[node].items():
            total = cost + step
            if total < costs.get(nxt, math.inf):
                costs[nxt] = total
                previous[nxt] = node
                heapq.heappush(pending, (total, nxt))
    assert b in costs, 'Disconnected source geometry: no invented gap connectors allowed'
    coords, node = [], b
    while True:
        coords.append([node[1], node[0]])
        if node == a:
            break
        node = previous[node]
    coords.reverse()
    return {'fromJa': start, 'toJa': end, 'coords': coords, 'source': SOURCE,
            'geometrySource': '국토교통성 국토수치정보 N02-25 철도 · 가공한 선형 (2025-12-31 기준)',
            'sourceLine': line, 'sourceOperator': operator,
            'distanceM': round(costs[b]), 'geometryAccuracy': 'mapped'}


with zipfile.ZipFile(ARCHIVE) as archive:
    def read(kind):
        return json.loads(archive.read('N02-25_GML/UTF-8/N02-25_' + kind + '.geojson'))['features']
    sections, stations = read('RailroadSection'), read('Station')
    lines = {
        'JR-Central.TokaidoShinkansen': path_for(sections, stations, '東海道新幹線', '東海旅客鉄道', '東京', '熱海'),
        'Hakone.Cable': path_for(sections, stations, '鋼索線', '小田急箱根', '強羅', '早雲山')
    }
output = {'source': SOURCE, 'license': 'CC BY 4.0', 'checkedAt': '2026-11-05',
          'datasetDate': '2025-12-31', 'archiveSha256': hashlib.sha256(ARCHIVE.read_bytes()).hexdigest(), 'lines': lines}
(ROOT / 'tokyo-rail-geometry.json').write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf-8')
for key, line in lines.items():
    print(key, len(line['coords']), 'points,', line['distanceM'], 'm')
