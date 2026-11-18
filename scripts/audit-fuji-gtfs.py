import io,zipfile,csv,json,urllib.request,hashlib
url='https://gtfs-jp.buskita.com/fjb/gtfs.zip'
raw=urllib.request.urlopen(url,timeout=60).read()
print('GTFS_SOURCE',url,'sha256',hashlib.sha256(raw).hexdigest(),flush=True)
z=zipfile.ZipFile(io.BytesIO(raw))
print('GTFS_FILES',z.namelist(),flush=True)
def rows(name):
 p=next((p for p in z.namelist() if p.endswith('/'+name) or p==name),None)
 if not p:return []
 return list(csv.DictReader(io.StringIO(z.read(p).decode('utf-8-sig'))))
for name in ['feed_info.txt','fare_attributes.txt','fare_rules.txt','stops.txt','routes.txt']:
 data=rows(name)
 print('GTFS_SCHEMA',name,'rows',len(data),'first',json.dumps(data[:1],ensure_ascii=False),flush=True)
 if name=='feed_info.txt':print('FEED_INFO',json.dumps(data,ensure_ascii=False),flush=True)
stops=rows('stops.txt');rules=rows('fare_rules.txt');attrs={r['fare_id']:r for r in rows('fare_attributes.txt')}
targets={}
for word in ['河口湖駅','自然生活館','河口湖美術館','ロープウェイ']:
 group=[s for s in stops if word in s['stop_name']]
 targets[word]=group
 print('MATCH_STOPS',word,json.dumps(group,ensure_ascii=False),flush=True)
for a,b in [('河口湖駅','自然生活館'),('自然生活館','河口湖美術館'),('河口湖美術館','ロープウェイ')]:
 origins={s.get('zone_id') or s['stop_id'] for s in targets[a]}
 dests={s.get('zone_id') or s['stop_id'] for s in targets[b]}
 found=[{**r,**attrs.get(r['fare_id'],{})} for r in rules if r.get('origin_id') in origins and r.get('destination_id') in dests]
 print('EXACT_FARES',a,b,json.dumps(found,ensure_ascii=False),flush=True)
print('RED_ROUTES',json.dumps([r for r in rows('routes.txt') if any('周遊' in str(v) or '自然生活館' in str(v) for v in r.values())],ensure_ascii=False),flush=True)
