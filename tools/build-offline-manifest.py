#!/usr/bin/env python3
"""Build the exact same-origin offline package, with size and SHA-256 per file."""
import hashlib
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'japan-2027'
revision = '20261027-streetmaps-3'
worker = (root / 'sw.js').read_text()
shell = re.search(r'const FILES=(\[.*?\]);', worker).group(1)
shell = json.loads(shell.replace("'", '"'))
manifest_text = (root / 'rail-departure-profiles.js').read_text()
profiles = json.loads(manifest_text.split('globalThis.RailDepartureProfiles=', 1)[1].rstrip(';\n'))['profiles']
data = ['data.json','tokyo-data.json','tokyo-routes.json','west-data.json','west-routes.json',
        'flight-route-overrides.json','assets/maps/offline-land.json','fare-evidence.json',
        'assets/routes/flight-route-sources.json','assets/routes/return-route-sources.json']
data += [profile['file'] for profile in profiles.values()]
files = []
for kind, names in [('shell', shell), ('json', data)]:
    for name in sorted(set(names)-{'./'}):
        content = (root/name).read_bytes()
        files.append({'path': name,'kind': kind,'bytes': len(content),'sha256': hashlib.sha256(content).hexdigest()})
value = {'revision': revision, 'totalBytes': sum(f['bytes'] for f in files), 'files': files}
(root/'offline-manifest.json').write_text(json.dumps(value,ensure_ascii=False,separators=(',', ':'))+'\n')
print(f"Offline package: {len(files)} files, {value['totalBytes']/1048576:.1f} MiB")
