import io,zipfile,csv,json,urllib.request,hashlib
url='https://gtfs-jp.buskita.com/fjb/gtfs.zip'
raw=urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'KISEKI-Fare-Verification/1.0 (github.com/SnuMaster/Geography)','Referer':'https://bus.fujikyu.co.jp/rosen/gtfs/'}),timeout=60).read()
z=zipfile.ZipFile(io.BytesIO(raw))
def rows(name):
 p=next((p for p in z.namelist() if p.endswith('/'+name) or p==name),None)
 return list(csv.DictReader(io.StringIO(z.read(p).decode('utf-8-sig')))) if p else []
stops={r['stop_id']:r for r in rows('stops.txt')}
trips=[t for t in rows('trips.txt') if t['route_id']=='80611']
times={}
for s in rows('stop_times.txt'):
 if any(t['trip_id']==s['trip_id'] for t in trips):times.setdefault(s['trip_id'],[]).append(s)
out={'source':url,'sourcePage':'https://bus.fujikyu.co.jp/rosen/gtfs/','checkedAt':'2026-11-18','sha256':hashlib.sha256(raw).hexdigest(),'feed':rows('feed_info.txt'),'routes':{}}
for key,origin,dest in [('fujiOut','0025','1857'),('fujiLunch','1857','1837'),('fujiRopeway','1837','0039')]:
 found=[]
 for t in trips:
  seq=sorted(times.get(t['trip_id'],[]),key=lambda s:int(s['stop_sequence']))
  for a,s in enumerate(seq):
   if stops[s['stop_id']]['zone_id']!=origin:continue
   for b in range(a+1,len(seq)):
    if stops[seq[b]['stop_id']]['zone_id']!=dest:continue
    ss=[]
    for st in seq[a:b+1]:
     p=stops[st['stop_id']];ss.append({'id':p['stop_id'],'name':p['stop_name'],'zone':p['zone_id'],'point':[float(p['stop_lat']),float(p['stop_lon'])],'arrival':st['arrival_time'],'departure':st['departure_time']})
    found.append({'trip_id':t['trip_id'],'direction_id':t.get('direction_id'),'stops':ss})
 if not found:raise Exception('No operator stop sequence '+key)
 found.sort(key=lambda x:len(x['stops']))
 out['routes'][key]=found[0]
 print('FUJI_SEQUENCE',key,json.dumps(found[0],ensure_ascii=False),flush=True)
with open('scripts/tokyo-fuji-reviewed-stops.json','w',encoding='utf-8') as f:json.dump(out,f,ensure_ascii=False,separators=(',',':'));f.write('\n')
