"""Extract published, all-days train columns; never interpolate missing calls.

Input HTML is kept outside the repository. Re-download the exact source URLs
and verify the hashes before rebuilding. Conditional/temporary columns are
deliberately excluded from this basic reference network.
"""
from html.parser import HTMLParser
from pathlib import Path
import hashlib, json, re, os

ROOT = Path(__file__).resolve().parent
CACHE = Path(os.environ.get('TOKYO_TIMETABLE_CACHE', ROOT.parent.parent / 'tokyo-timetable-cache'))
SOURCES = {'west':'001d1p','east':'001u1p'}
manifest=json.loads((ROOT/'shinkansen-reference-inputs.json').read_text(encoding='utf8'))
for ref in manifest['files']:
 assert hashlib.sha256((CACHE/ref['name']).read_bytes()).hexdigest()==ref['sha256'], 'Changed source: '+ref['name']

class Rows(HTMLParser):
 def __init__(self):
  super().__init__(); self.rows=[]; self.row=None; self.cell=None
 def handle_starttag(self, tag, attrs):
  if tag=='tr': self.row=[]
  if tag in ('td','th') and self.row is not None: self.cell=[]
 def handle_data(self, text):
  if self.cell is not None: self.cell.append(text)
 def handle_endtag(self, tag):
  if tag in ('td','th') and self.cell is not None:
   self.row.append(''.join(self.cell).strip()); self.cell=None
  if tag=='tr' and self.row is not None: self.rows.append(self.row); self.row=None

names={'東京':'Tokyo','品川':'Shinagawa','新横浜':'ShinYokohama','小田原':'Odawara','熱海':'Atami'}
all_trains={}; provenance=[]
for direction,page in SOURCES.items():
 blob=(CACHE/f'shinkansen-{direction}.html').read_bytes()
 parser=Rows(); parser.feed(blob.decode('utf8'))
 blocks=[]
 for row in parser.rows:
  if row and row[0]=='列車番号': blocks.append([])
  if blocks: blocks[-1].append(row)
 for block in blocks:
  numbers=next(r for r in block if r[0]=='列車番号')
  labels=next(r for r in block if r[0]=='列車名')
  days=next(r for r in block if r[0]=='運転日')
  calls=[r for r in block if r and r[0] in names and r[1] in ('発','着')]
  assert all(len(r)==len(numbers) for r in [labels,days]+calls), 'Shifted timetable columns'
  for i in range(2,len(numbers)):
   if days[i]!='全日': continue
   tt=[]
   for row in calls:
    value=row[i]
    if not re.fullmatch(r'[0-2]\d[0-5]\d',value): continue
    station='JR-Central.TokaidoShinkansen.'+names[row[0]]
    if not tt or tt[-1]['s']!=station: tt.append({'s':station})
    tt[-1]['d' if row[1]=='発' else 'a']=value[:2]+':'+value[2:]
   if len(tt)<2 or not any(s['s'].endswith('.Tokyo') for s in tt): continue
   record={'id':'JR-Central.TokaidoShinkansen.'+numbers[i]+'.Daily','r':'JR-Central.TokaidoShinkansen','n':numbers[i], 'y':'JR-Central.LimitedExpress','nm':[{'ja':labels[i]}],'tt':tt,'officialSource':'https://timetables.jreast.co.jp/2611/timetable-v/'+page+'.html','sourceColumn':i-1,'sourceSha256':hashlib.sha256(blob).hexdigest(),'calendarBasis':'全日 · conditional columns excluded'}
   previous=all_trains.get(record['id'])
   assert previous is None or previous['tt']==tt, 'Ambiguous daily train times'
   all_trains[record['id']]=record
 provenance.append({'url':'https://timetables.jreast.co.jp/2611/timetable-v/'+page+'.html','sha256':hashlib.sha256(blob).hexdigest()})

# The westbound grid prints departures; the eastbound grid prints arrivals.
# Add only source-stated departures from the detailed stop tables. Never use
# an arrival as a fabricated departure or assume a one-minute dwell.
for ref in manifest['files']:
 if not ref['name'].startswith('shinkansen-train-'): continue
 parser=Rows(); parser.feed((CACHE/ref['name']).read_text(encoding='utf8'))
 number=next(r[1] for r in parser.rows if r and r[0]=='列車番号')
 record=all_trains.get('JR-Central.TokaidoShinkansen.'+number+'.Daily')
 if record is None: continue # conditional trains were not accepted by the grid
 for row in parser.rows:
  if not row or row[0] not in names: continue
  call=next((s for s in record['tt'] if s['s'].endswith('.'+names[row[0]])),None)
  if call is None: continue
  for clock,kind in re.findall(r'(\d{2}:\d{2})\s*([発着])',row[1]):
   field='d' if kind=='発' else 'a'
   assert field not in call or call[field]==clock, 'Inconsistent source stop time'
   call[field]=clock
 record['departureSource']=ref['url']; record['departureSourceSha256']=ref['sha256']

stations=json.loads((CACHE/'stations.json').read_bytes())
supplement=[]
for ja,en in names.items():
 s=next(s for s in stations if s['title']['ja']==ja and s['railway'].startswith('JR-East.'))
 supplement.append({'id':'JR-Central.TokaidoShinkansen.'+en,'railway':'JR-Central.TokaidoShinkansen','coord':s['coord'],'title':s['title'],'coordinateSource':'https://github.com/nagix/mini-tokyo-3d/tree/c708abea8bf05ab56137a50e52c032112b6f9beb/data/stations.json'})
result={'checkedAt':'2026-11-10','sourceClass':'official-current','travelDateVerified':False,'scope':'JR official November 2026 reference, all-days columns only; temporary trains not included. Departure-only station rows remain departure times, never invented arrivals.','sources':provenance,'stations':supplement,'trains':list(all_trains.values())}
output=(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n').encode('utf8')
(CACHE/'official-shinkansen.json').write_bytes(output)
manifest['compiledSha256']=hashlib.sha256(output).hexdigest()
(ROOT/'shinkansen-reference-inputs.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'trains':len(all_trains),'sources':provenance}))
