"""Extract reviewed bus/ropeway paths from cached OSM API map responses.
Public source geometry only; no coordinates are invented or interpolated.
"""
import hashlib
import heapq
import json
import math
import os
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
CACHE = Path(os.environ.get('TOKYO_REPLAN_CACHE', ROOT.parent / '.tokyo-replan-cache'))


def distance(a, b):
    p, q = map(math.radians, (a[0], b[0]))
    h = math.sin((p-q)/2)**2 + math.cos(p)*math.cos(q)*math.sin(math.radians(a[1]-b[1])/2)**2
    return 12742000*math.asin(min(1, math.sqrt(h)))


def tags(node):
    return {t.get('k'): t.get('v') for t in node.findall('tag')}


def load(area):
    data = (CACHE / ('osm-'+area+'.xml')).read_bytes()
    return {(e.tag, e.get('id')): e for e in ET.fromstring(data)}, hashlib.sha256(data).hexdigest()


def point(ix, node_id):
    n = ix[('node', node_id)]
    return [float(n.get('lat')), float(n.get('lon'))]


hakone, hakone_hash = load('hakone')
rope_relation = hakone[('relation', '8031585')]
rope_way = hakone[('way', '26776732')]
assert any(m.get('ref') == '26776732' and m.get('type') == 'way' for m in rope_relation.findall('member'))
assert tags(rope_way).get('aerialway') in ('gondola', 'cable_car')
rope = [point(hakone, n.get('ref')) for n in rope_way.findall('nd')]
# Orient the stored excerpt from Sounzan to Owakudani.
if distance(rope[-1], [35.24644444,139.03561111]) < distance(rope[0], [35.24644444,139.03561111]):
    rope.reverse()
nikko, nikko_hash = load('nikko')


def bus_path(rel_id, from_id, to_id):
    rel = nikko[('relation', rel_id)]
    assert tags(rel).get('ref') == 'C'
    member_nodes = {m.get('ref') for m in rel.findall('member') if m.get('type') == 'node'}
    assert from_id in member_nodes and to_id in member_nodes
    coords, graph = {}, {}
    for m in rel.findall('member'):
        w = nikko.get(('way', m.get('ref'))) if m.get('type') == 'way' else None
        if w is None or not tags(w).get('highway'):
            continue
        ids = [n.get('ref') for n in w.findall('nd')]
        if any(('node', n) not in nikko for n in ids):
            continue
        for n in ids:
            coords[n] = point(nikko, n)
            graph.setdefault(n, {})
        t = tags(w)
        one = t.get('oneway:bus', t.get('oneway:psv', t.get('oneway', 'no')))
        for a, b in zip(ids, ids[1:]):
            d = distance(coords[a], coords[b])
            if one != '-1':
                graph[a][b] = d
            if one not in ('yes', '1'):
                graph[b][a] = d
    origin, dest = point(nikko, from_id), point(nikko, to_id)
    start = min(coords, key=lambda n: distance(origin, coords[n]))
    end = min(coords, key=lambda n: distance(dest, coords[n]))
    assert distance(origin, coords[start]) < 100 and distance(dest, coords[end]) < 100
    pending, costs, previous = [(0, start)], {start: 0}, {}
    while pending:
        cost, n = heapq.heappop(pending)
        if cost != costs[n]:
            continue
        if n == end:
            break
        for nxt, step in graph[n].items():
            total = cost+step
            if total < costs.get(nxt, math.inf):
                costs[nxt], previous[nxt] = total, n
                heapq.heappush(pending, (total,nxt))
    assert end in costs and costs[end] < 5000, 'Bus route source must be connected'
    path, n = [], end
    while True:
        path.append(coords[n])
        if n == start:
            break
        n = previous[n]
    path.reverse()
    return {'coords': path, 'source': 'https://www.openstreetmap.org/relation/'+rel_id,
            'fromStopSource': 'https://www.openstreetmap.org/node/'+from_id,
            'toStopSource': 'https://www.openstreetmap.org/node/'+to_id,
            'fromStopPoint': origin, 'toStopPoint': dest,
            'officialSource': 'https://www.tobu-bus.com/pc/area/nikko/',
            'distanceM': round(costs[end]), 'geometryAccuracy': 'mapped',
            'geometrySource': 'OpenStreetMap 도부버스 C계통 도로 선형 · 니시산도입구 정류장 공식 안내 대조'}


result = {'checkedAt':'2026-11-05','license':'ODbL-1.0','copyright':'https://www.openstreetmap.org/copyright',
          'inputSha256':{'hakone':hakone_hash,'nikko':nikko_hash},
          'ropeway':{'coords':rope,'geometryAccuracy':'mapped','geometrySource':'OpenStreetMap 하코네 로프웨이 선형 · 소운잔–오와쿠다니',
                     'source':'https://www.openstreetmap.org/way/26776732'},
          'nikkoOutbound':bus_path('8170947','4310299597','2286822253'),
          'nikkoInbound':bus_path('8170948','611557626','5522324827')}
# Use the mapped stone-torii visitor entrance, not a geocoder's rear shrine point.
gate = nikko[('way','699013021')]
gate_points = [point(nikko,n.get('ref')) for n in gate.findall('nd')][:-1]
result['toshoguEntrance'] = {'point':[sum(p[i] for p in gate_points)/len(gate_points) for i in range(2)],
                            'source':'https://www.openstreetmap.org/way/699013021','label':'도쇼구 석조 도리이 입구'}
(ROOT/'tokyo-transit-corrections.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
for key in ['ropeway','nikkoOutbound','nikkoInbound']:
    print(key,len(result[key]['coords']),'source points')
