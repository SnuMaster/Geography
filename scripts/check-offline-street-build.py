#!/usr/bin/env python3
"""Exercise PBF extraction and the day-map builder on a tiny connected fixture."""
import gzip
import json
import pathlib
import subprocess
import sys
import tempfile

with tempfile.TemporaryDirectory() as tmp:
    root = pathlib.Path(tmp)
    plan = root / 'plan.json'
    plan.write_text(json.dumps({'version':1, 'days':[{'day':1, 'points':[[35,139],[35,129]]}]}))
    source = root / 'fixture.osm'
    nodes = ''.join(f'<node id="{i}" lat="35.{i:04}" lon="139.00000"/>' for i in range(1,15))
    ways = ''.join(f'<way id="{i}"><nd ref="{i}"/><nd ref="{i+1}"/><tag k="highway" v="footway"/></way>' for i in range(1,14))
    nodes += ''.join(f'<node id="{i}" lat="35.{i-100:04}" lon="129.00000"/>' for i in range(101,115))
    ways += ''.join(f'<way id="{i}"><nd ref="{i}"/><nd ref="{i+1}"/><tag k="highway" v="footway"/></way>' for i in range(101,114))
    source.write_text('<osm version="0.6">'+nodes+ways+'</osm>')
    builder = pathlib.Path(__file__).with_name('build-offline-streets.py')
    coverage = root / 'coverage'
    subprocess.run([sys.executable,str(builder),'plan',str(plan),str(coverage)],check=True)
    extracted=[]
    for region in ('japan','korea'):
        path=root/(region+'.osm.pbf')
        subprocess.run(['osmium','extract','--strategy','complete_ways','--polygon',str(coverage/(region+'.geojson')),'-o',str(path),str(source)],check=True)
        extracted.append(str(path))
    out=root/'output'
    subprocess.run([sys.executable,str(builder),'build',str(plan),str(out),*extracted],check=True)
    data=json.loads(gzip.decompress((out/'day-1.json.gz').read_bytes()))
    manifest=json.loads((out/'manifest.json').read_text())
    assert len(data['elements'])==26 and len(data['elements'][0]['nodes'])==2
    assert manifest['days']['1']['points']==[[35,139],[35,129]]
    print('Offline street extract smoke test passed')
