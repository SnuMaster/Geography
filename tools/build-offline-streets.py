#!/usr/bin/env python3
"""Build a bounded ODbL street extract around the saved itinerary, never live GPS.

This builder accepts only local public OSM files. It makes no network requests
and never submits itinerary coordinates to an external map service.
"""
import argparse
import json
import math
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LAT_STEP, LNG_STEP = .006, .008
EXCLUDED = {'construction', 'proposed', 'raceway', 'platform'}


def cells_for_trip():
    cells = set()
    for name in ['tokyo-routes.json', 'west-routes.json']:
        for legs in json.loads((ROOT/'japan-2027'/name).read_text())['days'].values():
            for leg in legs:
                for part in leg['parts']:
                    if part['mode'] not in ['walk', 'taxi'] or 'OSRM' not in part.get('geometrySource', ''):
                        continue
                    for a, b in zip(part['coords'], part['coords'][1:]):
                        count = max(1, math.ceil(math.hypot((a[0]-b[0])*111000, (a[1]-b[1])*91000)/200))
                        for i in range(count+1):
                            lat, lng = a[0]+(b[0]-a[0])*i/count, a[1]+(b[1]-a[1])*i/count
                            for dy in [-.0018, .0018]:
                                for dx in [-.0022, .0022]:
                                    cells.add((math.floor((lat+dy)/LAT_STEP), math.floor((lng+dx)/LNG_STEP)))
    return sorted(cells)


def corridor_filter():
    buckets = {}
    for name in ['tokyo-routes.json', 'west-routes.json']:
        for legs in json.loads((ROOT/'japan-2027'/name).read_text())['days'].values():
            for leg in legs:
                for part in leg['parts']:
                    if part['mode'] not in ['walk', 'taxi'] or 'OSRM' not in part.get('geometrySource', ''):
                        continue
                    for a, b in zip(part['coords'], part['coords'][1:]):
                        count = max(1, math.ceil(math.hypot((a[0]-b[0])*111000, (a[1]-b[1])*91000)/150))
                        for i in range(count+1):
                            lat, lng = a[0]+(b[0]-a[0])*i/count, a[1]+(b[1]-a[1])*i/count
                            buckets.setdefault((math.floor(lat/.004), math.floor(lng/.004)), set()).add((round(lat, 5), round(lng, 5)))
    def near(coord):
        lng, lat = coord
        y, x = math.floor(lat/.004), math.floor(lng/.004)
        for dy in [-1, 0, 1]:
            for dx in [-1, 0, 1]:
                for a, b in buckets.get((y+dy, x+dx), []):
                    if ((lat-a)*111000)**2+((lng-b)*91000)**2 <= 300**2:
                        return True
        return False
    return near


def make_feature(element):
    tags = element.get('tags', {})
    kind = tags.get('highway', '')
    if not kind or kind in EXCLUDED or tags.get('indoor') == 'yes' or (kind == 'service' and (tags.get('access') == 'private' or tags.get('service') in ['driveway', 'parking_aisle'])):
        return None
    props = {'class': 'crossing' if kind == 'crossing' or tags.get('footway') == 'crossing' else kind}
    name = tags.get('name:ko') or tags.get('name:ja') or tags.get('name')
    if name:
        props['name'] = name[:100]
    if element['type'] == 'node':
        geometry = {'type': 'Point', 'coordinates': [round(element['lon'], 5), round(element['lat'], 5)]}
    else:
        coords = []
        for point in element.get('geometry', []):
            if 'lat' not in point or 'lon' not in point:
                continue
            coord = [round(point['lon'], 5), round(point['lat'], 5)]
            if not coords or coords[-1] != coord:
                coords.append(coord)
        if len(coords) < 2:
            return None
        geometry = {'type': 'LineString', 'coordinates': coords}
    points = [geometry['coordinates']] if geometry['type'] == 'Point' else geometry['coordinates']
    bbox = [min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points)]
    return {'type': 'Feature', 'id': element['type'][0]+str(element['id']), 'bbox': bbox, 'properties': props, 'geometry': geometry}


def write_chunks(elements, cells, destination, dates, retained=None):
    near = corridor_filter()
    prepared = {f['id']: f for f in retained or []}
    prepared.update((f['id'], f) for f in filter(None, (make_feature(e) for e in elements.values())))
    candidates = prepared.values()
    features = sorted((f for f in candidates if any(near(p) for p in ([f['geometry']['coordinates']] if f['geometry']['type'] == 'Point' else f['geometry']['coordinates']))), key=lambda f: (math.floor((f['bbox'][0]+f['bbox'][2])/2/.05), math.floor((f['bbox'][1]+f['bbox'][3])/2/.05), f['id']))
    for old in destination.glob('streets-*.json'):
        old.unlink()
    chunks, batch, size = [], [], 0
    current_region = None

    def flush():
        nonlocal batch, size
        if not batch:
            return
        name = f'streets-{len(chunks):03}.json'
        value = {'type': 'FeatureCollection', 'license': 'ODbL-1.0', 'features': batch}
        (destination/name).write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':'))+'\n')
        bbox = [min(f['bbox'][0] for f in batch), min(f['bbox'][1] for f in batch), max(f['bbox'][2] for f in batch), max(f['bbox'][3] for f in batch)]
        chunks.append({'file': 'assets/maps/offline-streets/'+name, 'bbox': bbox, 'features': len(batch)})
        batch, size = [], 0

    for feature in features:
        region = (math.floor((feature['bbox'][0]+feature['bbox'][2])/2/.05), math.floor((feature['bbox'][1]+feature['bbox'][3])/2/.05))
        if batch and region != current_region:
            flush()
        current_region = region
        text = json.dumps(feature, ensure_ascii=False, separators=(',', ':'))
        if batch and size+len(text.encode()) > 58000:
            flush()
        batch.append(feature)
        size += len(text.encode())
    flush()
    manifest = {'version': 1, 'attribution': '© OpenStreetMap contributors', 'license': 'ODbL-1.0',
                'licenseUrl': 'https://opendatacommons.org/licenses/odbl/1-0/', 'source': 'https://www.openstreetmap.org/copyright',
                'generatedAt': datetime.now(timezone.utc).isoformat(), 'osmBaseDates': sorted(dates), 'publicExtractSources': ['https://download.geofabrik.de/asia/japan/kanto.html', 'https://download.geofabrik.de/asia/south-korea.html'],
                'coverage': {'latStep': LAT_STEP, 'lngStep': LNG_STEP, 'cells': cells},
                'features': len(features), 'crossings': sum(f['properties']['class'] == 'crossing' for f in features), 'chunks': chunks}
    (destination/'index.json').write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':'))+'\n')
    print(json.dumps({'features': len(features), 'crossings': manifest['crossings'], 'chunks': len(chunks), 'cells': len(cells)}), flush=True)


def merge_public_pbf(path, elements, cells):
    import osmium
    padded = {(y+dy, x+dx) for y, x in cells for dy in [-1, 0, 1] for dx in [-1, 0, 1]}
    class Reader(osmium.SimpleHandler):
        def __init__(self):
            super().__init__()
            self.nodes = {}
        def node(self, node):
            lat, lng = node.location.lat, node.location.lon
            if (math.floor(lat/LAT_STEP), math.floor(lng/LNG_STEP)) not in padded:
                return
            self.nodes[node.id] = (lat, lng)
            if node.tags.get('highway') == 'crossing':
                elements.setdefault('n'+str(node.id), {'type': 'node', 'id': node.id, 'lat': lat, 'lon': lng, 'tags': dict(node.tags)})
        def way(self, way):
            if not way.tags.get('highway') or 'w'+str(way.id) in elements:
                return
            runs, current = [], []
            for node in way.nodes:
                coord = self.nodes.get(node.ref)
                if coord is None:
                    if len(current) >= 2:
                        runs.append(current)
                    current = []
                else:
                    current.append({'lat': coord[0], 'lon': coord[1]})
            if len(current) >= 2:
                runs.append(current)
            for i, geometry in enumerate(runs):
                key = str(way.id)+'_'+str(i)
                elements['w'+key] = {'type': 'way', 'id': key, 'geometry': geometry, 'tags': dict(way.tags)}
    header_reader = osmium.io.Reader(str(path), osmium.osm.NOTHING)
    source_date = header_reader.header().get('osmosis_replication_timestamp')
    header_reader.close()
    reader = Reader()
    reader.apply_file(str(path), locations=False)
    print(f'Local public extract processed: {len(reader.nodes)} relevant nodes; {len(elements)} public street elements', flush=True)
    return source_date


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cache', type=Path, required=True, help='Existing local public street JSON responses; no network access')
    parser.add_argument('--existing', type=Path, help='An already-built local street index to retain without re-reading its public regional source')
    parser.add_argument('--pbf', type=Path, action='append', default=[], help='A locally downloaded public regional OSM extract')
    args = parser.parse_args()
    cells = cells_for_trip()
    elements, dates = {}, set()
    retained = []
    if args.existing:
        previous = json.loads(args.existing.read_text())
        dates.update(previous.get('osmBaseDates', []))
        base = ROOT/'japan-2027'
        for chunk in previous['chunks']:
            retained.extend(json.loads((base/chunk['file']).read_text())['features'])
    for path in sorted(args.cache.glob('*.json')):
        value = json.loads(path.read_text())
        elements.update((e['type'][0]+str(e['id']), e) for e in value['elements'])
        dates.add(value.get('osm3s', {}).get('timestamp_osm_base', 'unknown'))
    print(f'Read {len(elements)} already-local public street records', flush=True)
    for path in args.pbf:
        source_date = merge_public_pbf(path, elements, cells)
        if source_date:
            dates.add(source_date)
    destination = ROOT/'japan-2027/assets/maps/offline-streets'
    destination.mkdir(parents=True, exist_ok=True)
    write_chunks(elements, cells, destination, dates, retained)


if __name__ == '__main__':
    main()
