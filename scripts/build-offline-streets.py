#!/usr/bin/env python3
"""Build small ODbL street extracts for the public itinerary from Geofabrik PBFs.

Run `plan` first, then extract/filter each PBF with osmium-tool, then `build`.
Each coverage square extends beyond the app's 800m query circle in both axes.
"""
import datetime
import gzip
import hashlib
import json
import pathlib
import sys

import osmium
from shapely.geometry import LineString, Point, box, mapping
from shapely.ops import unary_union
from shapely.strtree import STRtree

PLAN = pathlib.Path(sys.argv[2])
plan = json.loads(PLAN.read_text())
days = plan['days']

def polygon(points):
    return unary_union([box(lon-.013, lat-.010, lon+.013, lat+.010) for lat, lon in points])

if sys.argv[1] == 'plan':
    out = pathlib.Path(sys.argv[3])
    out.mkdir(parents=True, exist_ok=True)
    for country, predicate in [('japan', lambda lon: lon >= 130), ('korea', lambda lon: lon < 130)]:
        points = [p for day in days for p in day['points'] if predicate(p[1])]
        if not points:
            raise SystemExit(f'No {country} coverage points')
        (out / f'{country}.geojson').write_text(json.dumps(mapping(polygon(points))))
    sys.exit(0)

if sys.argv[1] != 'build':
    raise SystemExit('Expected plan or build')

geometries = [polygon(day['points']) for day in days]
index = STRtree(geometries)
elements = [[] for _ in days]
seen = [set() for _ in days]
keep = {'highway', 'railway', 'access', 'foot', 'oneway:foot', 'name', 'name:ko'}

class Collector(osmium.SimpleHandler):
    def add(self, element, geometry):
        # Shapely 2 returns integer indices. Check intersections to avoid assigning
        # a long road to a day merely because its bounding rectangle overlaps.
        for i in index.query(geometry, predicate='intersects'):
            i = int(i)
            key = (element['type'], element['id'])
            if key not in seen[i]:
                seen[i].add(key)
                elements[i].append(element)

    def node(self, node):
        if 'amenity' not in node.tags or 'name' not in node.tags or not node.location.valid():
            return
        tags = {tag.k:tag.v for tag in node.tags if tag.k in keep}
        self.add({'type':'node', 'id':node.id, 'lat':node.location.lat,
                  'lon':node.location.lon, 'tags':tags}, Point(node.location.lon, node.location.lat))

    def way(self, way):
        tags = {tag.k:tag.v for tag in way.tags if tag.k in keep}
        if 'highway' not in tags and tags.get('railway') not in {'rail','subway','tram','light_rail'}:
            return
        refs = list(way.nodes)
        if len(refs) < 2 or any(not n.location.valid() for n in refs):
            return
        points = [(n.location.lon, n.location.lat) for n in refs]
        element = {'type':'way', 'id':way.id, 'nodes':[n.ref for n in refs],
                   'geometry':[{'lat':lat,'lon':lon} for lon,lat in points], 'tags':tags}
        self.add(element, LineString(points))

for source in sys.argv[4:]:
    print('Reading', source, flush=True)
    Collector().apply_file(source, locations=True)

out = pathlib.Path(sys.argv[3])
out.mkdir(parents=True, exist_ok=True)
generated = datetime.datetime.now(datetime.timezone.utc).isoformat()
manifest = {'version':1, 'generatedAt':generated,
            'source':'OpenStreetMap contributors, via Geofabrik regional extracts',
            'license':'https://www.openstreetmap.org/copyright', 'days':{}}
for day, items in zip(days, elements):
    roads = sum(1 for item in items if item['type']=='way' and 'highway' in item['tags'])
    if roads < 10:
        raise SystemExit(f"Day {day['day']} has too few roads: {roads}")
    payload = {'version':1, 'day':day['day'], 'generatedAt':generated,
               'points':day['points'], 'elements':items}
    data = json.dumps(payload, ensure_ascii=False, separators=(',',':')).encode()
    compressed = gzip.compress(data, compresslevel=9, mtime=0)
    filename = f"day-{day['day']}.json.gz"
    (out / filename).write_bytes(compressed)
    manifest['days'][str(day['day'])] = {'path':filename, 'sha256':hashlib.sha256(compressed).hexdigest(),
                                          'bytes':len(compressed), 'points':day['points']}
    print(f"Day {day['day']}: {roads} roads, {len(data)//1024} KiB JSON, {len(compressed)//1024} KiB gzip", flush=True)
(out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, separators=(',',':')))
