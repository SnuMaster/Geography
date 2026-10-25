#!/usr/bin/env python3
"""Enrich existing route timetables with source-backed stop sequences.

Usage: python tools/enrich-west-ride-stops.py --detail-dir /tmp/west-stops --fetch
Requires PyMuPDF and lxml. Existing cached operator pages are reused; --fetch
explicitly permits fetching missing official source pages and Keihan PDFs. URLs
for individual trains are retained in the committed timetable records. Optional
--source-dir accepts the original operator PDF/profile-manifest directory.

Official October 2026 snapshot station orders and standard metro durations are
embedded below for reproducibility. They are estimates, not per-train times.
When live source pages change, departure/station mismatches remain partial and
are reported; this script never silently upgrades the calendar validity.
"""
import argparse
import copy
import json
import re
import hashlib
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen
from collections import Counter
from functools import lru_cache
from pathlib import Path

import fitz
from lxml import html

ROOT = Path(__file__).resolve().parents[1] / 'japan-2027' / 'timetables'
parser = argparse.ArgumentParser()
parser.add_argument('--source-dir', type=Path)
parser.add_argument('--detail-dir', type=Path, required=True)
parser.add_argument('--fetch', action='store_true', help='Fetch missing official source pages into the cache')
args = parser.parse_args()
DETAIL = args.detail_dir
SRC = args.source_dir or DETAIL

PROFILE_STATIONS = {
    'fukuoka-airport': ('福岡空港', '博多', 'K13'),
    'fukuoka-akasaka-hakata': ('赤坂', '博多', 'K07'),
    'fukuoka-hakata-gion': ('博多', '祇園', 'K11'),
    'fukuoka-hakata-nakasu': ('博多', '中洲川端', 'K11'),
    'fukuoka-hakata-ohori': ('博多', '大濠公園', 'K11'),
    'fukuoka-nakasu-akasaka': ('中洲川端', '赤坂', 'K09'),
    'fukuoka-nakasu-hakata': ('中洲川端', '博多', 'K09'),
    'fukuoka-nishijin-hakata': ('西新', '博多', 'K04'),
    'kansai-hankyu-arashiyama-katsura': ('嵐山', '桂', 'HK98'),
    'kansai-hankyu-katsura-osakaumeda': ('桂', '大阪梅田', 'HK81'),
    'kansai-hanshin-sumiyoshi-motomachi': ('住吉', '元町', 'HS24'),
    'kansai-hanshin-umeda-sumiyoshi': ('大阪梅田', '住吉', 'HS01'),
    'kansai-jr-kyoto-sagaarashiyama': ('京都', '嵯峨嵐山', 'JR-E01'),
    'kansai-jr-kyoto-uji': ('京都', '宇治', 'JR-D01'),
    'kansai-jr-osaka-kyoto': ('大阪', '京都', 'JR-A47'),
    'kansai-jr-osaka-yamazaki': ('大阪', '山崎', 'JR-A47'),
    'kansai-jr-sannomiya-osaka': ('三ノ宮', '大阪', 'JR-A61'),
    'kansai-jr-shinimamiya-morinomiya': ('新今宮', '森ノ宮', 'JR-O19'),
    'kansai-jr-uji-kyoto': ('宇治', '京都', 'JR-D09'),
    'kansai-jr-yamazaki-kyoto': ('山崎', '京都', 'JR-A36'),
    'kansai-keihan-fushimiinari-chushojima': ('伏見稲荷', '中書島', 'KH34'),
    'kansai-keihan-fushimimomoyama-kiyomizugojo': ('伏見桃山', '清水五条', 'KH29'),
    'kansai-keihan-gionshijo-yodoyabashi': ('祇園四条', '淀屋橋', 'KH39'),
    'kansai-keihan-yodoyabashi-fushimiinari': ('淀屋橋', '伏見稲荷', 'KH01'),
    'kansai-kintetsu-namba-nara': ('大阪難波', '近鉄奈良', 'A01'),
    'kansai-kintetsu-nara-namba': ('近鉄奈良', '大阪難波', 'A28'),
    'kansai-metro-dobutsuenmae-namba': ('動物園前', '難波', 'M22'),
    'kansai-metro-dobutsuenmae-tennoji': ('動物園前', '天王寺', 'M22'),
    'kansai-metro-dobutsuenmae-tennoji-alias': ('動物園前', '天王寺', 'M22'),
    'kansai-metro-dobutsuenmae-umeda': ('動物園前', '梅田', 'M22'),
    'kansai-metro-dobutsuenmae-yodoyabashi': ('動物園前', '淀屋橋', 'M22'),
    'kansai-metro-namba-dobutsuenmae': ('難波', '動物園前', 'M20'),
    'kansai-metro-tanimachi4-tenjimbashi6': ('谷町四丁目', '天神橋筋六丁目', 'T23'),
    'kansai-metro-tennoji-dobutsuenmae-alias': ('天王寺', '動物園前', 'M23'),
    'kansai-metro-tennoji-yodoyabashi': ('天王寺', '淀屋橋', 'M23'),
    'kansai-metro-umeda-dobutsuenmae': ('梅田', '動物園前', 'M16'),
    'kansai-metro-umeda-namba': ('梅田', '難波', 'M16'),
    'kansai-metro-yodoyabashi-dobutsuenmae': ('淀屋橋', '動物園前', 'M17'),
    'korail-busan-dongdaegu': ('부산', '동대구', '부산'),
}
OSAKA_STANDARD_MINUTES = {'動物園前|大国町': 2, '動物園前|天王寺': 2, '動物園前|心斎橋': 6, '動物園前|本町': 8, '動物園前|梅田': 13, '動物園前|淀屋橋': 10, '動物園前|難波': 4, '天王寺|動物園前': 2, '天王寺|大国町': 4, '天王寺|心斎橋': 8, '天王寺|本町': 10, '天王寺|淀屋橋': 12, '天王寺|難波': 6, '梅田|動物園前': 14, '梅田|大国町': 11, '梅田|心斎橋': 7, '梅田|本町': 5, '梅田|淀屋橋': 3, '梅田|難波': 9, '淀屋橋|動物園前': 11, '淀屋橋|大国町': 8, '淀屋橋|心斎橋': 4, '淀屋橋|本町': 2, '淀屋橋|難波': 6, '谷町四丁目|中崎町': 8, '谷町四丁目|南森町': 4, '谷町四丁目|天満橋': 1, '谷町四丁目|天神橋筋六丁目': 10, '谷町四丁目|東梅田': 6, '難波|動物園前': 5, '難波|大国町': 2}
HANSHIN_STATIONS = ['大阪梅田', '福島', '野田', '淀川', '姫島', '千船', '杭瀬', '大物', '尼崎', '出屋敷', '尼崎センタープール前', '武庫川', '鳴尾・武庫川女子大前', '甲子園', '久寿川', '今津', '西宮', '香櫨園', '打出', '芦屋', '深江', '青木', '魚崎', '住吉', '御影', '石屋川', '新在家', '大石', '西灘', '岩屋', '春日野道', '神戸三宮', '元町']

def cached_json(name, default):
    path=DETAIL/name
    return json.loads(path.read_text()) if path.exists() else default

PROFILES = {k:dict(key=k,fromJa=v[0],toJa=v[1],fromCode=v[2]) for k,v in PROFILE_STATIONS.items()}
INDEX = cached_json('index.json', {})
KIN_INDEX = cached_json('kintetsu-index.json', {})
KIN_LINKS = cached_json('kintetsu-links.json', {})

def osaka_duration_url(fr,to):
    def name(n):return {'梅田':'梅田(地下鉄)','難波':'なんば(地下鉄)'}.get(n,n)+'／地下鉄'
    params={'val_from':name(fr),'val_to':name(to),'val_yyyymm':'202610','val_dd':'26','val_hh':'12','val_mm':'00','exp_type':'departure','transfer_time':'2','search_target':'train'}
    return 'https://kensaku.osakametro.co.jp/route/ja/web/dia/result?'+urlencode(params)

OSAKA_DURATIONS = cached_json('osaka-durations.json', {
    k:{'minutes':v,'url':osaka_duration_url(*k.split('|'))} for k,v in OSAKA_STANDARD_MINUTES.items()
})

def source_file(url, filename, directory=DETAIL):
    path=directory/filename
    if not path.exists():
        if not args.fetch:
            raise FileNotFoundError(f'Missing source {path}. Run with --fetch to retrieve {url}')
        path.parent.mkdir(parents=True,exist_ok=True)
        request=Request(quote(url,safe=':/?&=%'),headers={'User-Agent':'Mozilla/5.0 (timetable source verification)'})
        with urlopen(request,timeout=40) as response:path.write_bytes(response.read())
    return path

KO = {
    '大阪':'오사카','大阪梅田':'오사카우메다','京都':'교토','新大阪':'신오사카',
    '山崎':'야마자키','嵯峨嵐山':'사가아라시야마','宇治':'우지','三ノ宮':'산노미야',
    '新今宮':'신이마미야','森ノ宮':'모리노미야','桂':'가쓰라','嵐山':'아라시야마',
    '大阪難波':'오사카난바','近鉄奈良':'긴테쓰나라','淀屋橋':'요도야바시',
    '伏見稲荷':'후시미이나리','中書島':'주쇼지마','伏見桃山':'후시미모모야마',
    '清水五条':'기요미즈고조','祇園四条':'기온시조','住吉':'스미요시','元町':'모토마치',
    '梅田':'우메다','本町':'혼마치','心斎橋':'신사이바시','難波':'난바','なんば':'난바',
    '大国町':'다이코쿠초','動物園前':'도부쓰엔마에','天王寺':'덴노지',
    '天神橋筋六丁目':'덴진바시스지로쿠초메','中崎町':'나카자키초','東梅田':'히가시우메다',
    '南森町':'미나미모리마치','天満橋':'덴마바시','谷町四丁目':'다니마치욘초메',
    '福岡空港':'후쿠오카공항','東比恵':'히가시히에','博多':'하카타','祇園':'기온',
    '中洲川端':'나카스카와바타','天神':'덴진','赤坂':'아카사카','大濠公園':'오호리코엔',
    '唐人町':'도진마치','西新':'니시진','藤崎':'후지사키','室見':'무로미','姪浜':'메이노하마',
    '鶴橋':'쓰루하시','生駒':'이코마','学園前':'가쿠엔마에','大和西大寺':'야마토사이다이지',
    '新大宮':'신오미야','近鉄日本橋':'긴테쓰닛폰바시','大阪上本町':'오사카우에혼마치',
    '北浜':'기타하마','京橋':'교바시','丹波橋':'단바바시','東福寺':'도후쿠지',
    '七条':'시치조','十三':'주소','高槻':'다카쓰키','高槻市':'다카쓰키시',
}

def norm_name(s):
    return re.sub(r'\s+', '', s).replace('衹','祇').replace('\U000e0100','').replace('(阪急)','').replace('（阪急）','')

def stop(name, namespace, **fields):
    ja=norm_name(name)
    return dict(id=namespace+'.'+ja, name=KO.get(ja,ja), nameJa=ja, **{k:v for k,v in fields.items() if v is not None})

def seconds(value):
    if not value:return None
    m=re.fullmatch(r'(\d{1,2}):([0-5]\d)(?::([0-5]\d))?',value)
    if not m:return None
    hh,mm,ss=map(int,[m[1],m[2],m[3] or 0])
    return (hh+(24 if hh<4 else 0))*3600+mm*60+ss

def clock(value):
    h,m=divmod(value,60)
    return f'{h%24:02d}:{m:02d}'

def same_time(a,b):
    return seconds(a)==seconds(b)

def clip(stops, profile, record):
    fr,to=norm_name(profile['fromJa']),norm_name(profile['toJa'])
    for i,s in enumerate(stops):
        if norm_name(s['nameJa'])!=fr or not same_time(s.get('departure'),record['departure']):continue
        for j in range(i+1,len(stops)):
            if norm_name(stops[j]['nameJa'])==to:
                result=copy.deepcopy(stops[i:j+1])
                # Validate source sequence, retaining arrival/departure meaning.
                previous=None
                for st in result:
                    for field in ['arrival','departure','time']:
                        if not st.get(field):continue
                        v=seconds(st[field])
                        if previous is not None and v<previous:
                            raise ValueError(('nonmonotonic',record['id'],st,previous,v))
                        previous=v
                return result
    return None

@lru_cache(maxsize=None)
def train_detail(url):
    if not url:return None,None
    file=INDEX.get(url) or KIN_INDEX.get(url) or (hashlib.sha256(url.encode()).hexdigest()+'.html')
    doc=html.fromstring(source_file(url,file).read_bytes());stops=[];number=None
    if 'jr-odekake.net' in url:
        for tr in doc.xpath('//tbody[@class="train-details"]/tr'):
            if '列車番号' in tr.text_content():
                number=' / '.join(dict.fromkeys(td.text_content().strip() for td in tr.xpath('./td') if td.text_content().strip()))
        for tr in doc.xpath('//tbody[@class="time-details"]/tr[not(@class="remarks")]'):
            tds=tr.xpath('./td')
            if len(tds)<2:continue
            name=tds[0].text_content().strip();fields={}
            # A through service may change train number: the source then places
            # its continuation in a second time column on the same station row.
            for div in tr.xpath('./td[@class="text"]/div'):
                text=re.sub(r'\s+','',div.text_content())
                m=re.fullmatch(r'(\d{1,2}:\d{2})(着|発)',text)
                if m:fields['arrival' if m[2]=='着' else 'departure']=m[1].zfill(5)
            if fields:stops.append(stop(name,'JR-West',**fields))
    elif 'hankyu.co.jp' in url:
        for tr in doc.xpath('//tr[contains(@class,"t_bd")]'):
            tds=tr.xpath('./td');name=tds[0].text_content().strip();text=tds[1].text_content();fields={}
            for kind,tm in re.findall(r'(到着|出発)、(\d{1,2}:\d{2})',text):
                fields['arrival' if kind=='到着' else 'departure']=tm.zfill(5)
            if fields:stops.append(stop(name,'Hankyu',**fields))
    elif 'kintetsu.co.jp' in url:
        for tr in doc.xpath('//tr'):
            tds=tr.xpath('./td')
            if len(tds)!=3 or not tds[0].xpath('./a[contains(@href,"T2?") or contains(@href,"T5?")]'):continue
            name=tds[0].text_content().strip();fields={}
            for td,kind in [(tds[1],'arrival'),(tds[2],'departure')]:
                m=re.search(r'(\d{1,2})[：:](\d{2})',td.text_content())
                if m:fields[kind]=f'{int(m[1]):02d}:{m[2]}'
            if fields:stops.append(stop(name,'Kintetsu',**fields))
    return stops,number

def spans(page):
    return [s for b in page.get_text('dict')['blocks'] for l in b.get('lines',[]) for s in l['spans']]

@lru_cache(maxsize=None)
def keihan_page(file_no,page_no):
    path=source_file(f'https://www.keihan.co.jp/traffic/time-fare/pdf/time01-{file_no}.pdf',f'kansai-keihan-all-{file_no}.pdf',SRC)
    document=fitz.open(path);page=document[page_no-1];sp=spans(page)
    left=[s for s in sp if s['bbox'][0]<100]
    dest_y=next(s['bbox'][1] for s in left if '行先駅' in s['text'])
    heads=sorted([s for s in sp if s['bbox'][0]>115 and abs(s['bbox'][1]-dest_y)<2],key=lambda s:s['bbox'][0])
    centers=[(s['bbox'][0]+s['bbox'][2])/2 for s in heads]
    chars=[c for b in page.get_text('rawdict')['blocks'] for l in b.get('lines',[]) for s in l['spans'] for c in s['chars']]
    def cells(y):
        buckets={}
        for c in chars:
            if c['bbox'][0]<115 or abs(c['bbox'][1]-y)>2:continue
            x=(c['bbox'][0]+c['bbox'][2])/2;ix=min(range(len(centers)),key=lambda k:abs(centers[k]-x))
            if abs(centers[ix]-x)>17:continue
            buckets.setdefault(ix,[]).append((x,c['c']))
        out={i:''.join(c for _,c in sorted(a)).strip() for i,a in buckets.items()}
        return {i:t.zfill(5) for i,t in out.items() if re.fullmatch(r'\d{1,2}:\d{2}',t)}
    bycolumn={i:[] for i in range(len(centers))}
    for s in sorted(left,key=lambda s:s['bbox'][1]):
        name=norm_name(s['text']);y=s['bbox'][1]
        if y<95 or not name:continue
        fields={}
        if name[-1:] in ['着','発']:
            fields['arrival' if name[-1]=='着' else 'departure']=cells(y);name=name[:-1]
        else:
            labels=[a for a in sp if 100<a['bbox'][0]<114 and norm_name(a['text']) in ['着','発'] and abs(a['bbox'][1]-y)<8]
            for label in labels:fields['arrival' if norm_name(label['text'])=='着' else 'departure']=cells(label['bbox'][1])
        if not fields:continue
        for col in bycolumn:
            values={k:v[col] for k,v in fields.items() if col in v}
            if values:bycolumn[col].append(stop(name,'Keihan',**values))
    document.close();return bycolumn

OSAKA_LINES={
    'M':['梅田','淀屋橋','本町','心斎橋','難波','大国町','動物園前','天王寺'],
    'T':['天神橋筋六丁目','中崎町','東梅田','南森町','天満橋','谷町四丁目'],
}
FUKUOKA_NAMES=['姪浜','室見','藤崎','西新','唐人町','大濠公園','赤坂','天神','中洲川端','祇園','博多','東比恵','福岡空港']
# Numeric upper triangle in Fukuoka City's published standard-duration matrix.
# Values are approximate whole-trip times, not a sum of rounded adjacent values.
FUKUOKA_MINUTES=[
    [2,4,6,8,9,11,13,15,17,19,22,25],
    [1,3,5,7,9,11,13,15,17,19,23],
    [2,4,5,7,9,11,13,15,18,21],
    [2,3,5,7,9,11,13,16,19],
    [1,3,5,7,9,11,14,17],
    [2,3,5,8,9,12,15],
    [2,4,6,7,10,13],
    [1,4,5,8,11],
    [2,3,6,9],
    [1,4,7],
    [2,5],
    [3],
    [],
]
FUKUOKA_SOURCE='https://subway.city.fukuoka.lg.jp/subway_webapp/files/uploads/%E5%90%84%E9%A7%85%E9%96%93%E3%81%AE%E6%A8%99%E6%BA%96%E6%89%80%E8%A6%81%E6%99%82%E9%96%93_1.pdf'

def ordered(names,fr,to):
    a,b=names.index(norm_name(fr)),names.index(norm_name(to))
    return names[a:b+1] if a<b else names[b:a+1][::-1]

def estimate_metro(p,r):
    fr,to=p['fromJa'],p['toJa'];dep=seconds(r['departure'])//60
    if p['key'].startswith('fukuoka-'):
        names=ordered(FUKUOKA_NAMES,fr,to);a=FUKUOKA_NAMES.index(fr)
        def duration(name):
            i,j=sorted([a,FUKUOKA_NAMES.index(name)])
            return FUKUOKA_MINUTES[i][j-i-1]
        source=[FUKUOKA_SOURCE]
        note='출발은 공식 시간표, 이후 역 시각은 후쿠오카시 공식 표준 소요시간을 더한 추정입니다. 열차별 대기·지연은 반영되지 않습니다.'
        ns='FukuokaSubway'
    else:
        names=ordered(OSAKA_LINES[p['fromCode'][0]],fr,to)
        def duration(name):return OSAKA_DURATIONS[fr+'|'+name]['minutes']
        source=[OSAKA_DURATIONS[fr+'|'+name]['url'] for name in names[1:]]
        note='출발은 공식 시간표, 이후 역 시각은 Osaka Metro 공식 경로검색의 2026-10-26 낮 일반열차 소요시간을 더한 추정입니다. 해당 열차의 정차·대기시간과 다를 수 있습니다.'
        ns='OsakaMetro.'+p['fromCode'][0]
    stops=[stop(names[0],ns,departure=r['departure'])]
    for name in names[1:]:
        stops.append(stop(name,ns,time=clock(dep+duration(name)),timeKind='estimated'))
    return stops,note,source

def partial_hanshin(p,r):
    # Snapshot of the official station-order JS linked in rideStops.sourceUrls.
    names=ordered(HANSHIN_STATIONS,p['fromJa'],p['toJa'])
    stops=[stop(n,'Hanshin') for n in names];stops[0]['departure']=r['departure']
    return stops

summary={};issues=[]
for file in sorted(ROOT.glob('*.json')):
    if not file.name.startswith(('kansai-','fukuoka-','korail-')):continue
    data=json.loads(file.read_text());key=next(iter(data['profiles']));p=PROFILES[key];counts=Counter();sources=set()
    for calendar,rows in data['profiles'][key].items():
        if not isinstance(rows,list):continue
        for r in rows:
            found=None;number=None;basis='timetable';note='운영사 공개 열차별 시간표의 정차역 시각입니다. 실시간 위치·지연 정보는 아닙니다.'
            if key.startswith('korail-'):
                found=[]
                for name in ['부산','울산','경주','동대구']:
                    tm=r.get('sourceStopTimes',{}).get(name)
                    if not tm:continue
                    s={'id':'KORAIL.'+name,'name':name}
                    if name=='부산':s['departure']=tm
                    else:s.update(time=tm,timeKind='source-event')
                    found.append(s)
                note='코레일 공식 표의 중간역 시각은 도착·출발 구분 없이 제공됩니다. 원본의 30초 단위도 보존한 예정 정차 시각입니다.'
                sources.add(r['source'])
            elif key.startswith('kansai-keihan-'):
                match=re.fullmatch(r'kh-(\d+)-p(\d+)-c(\d+)',r['id']);fno,pno,col=map(int,match.groups())
                found=clip(keihan_page(fno,pno)[col-1],p,r)
                sources.add(f'https://www.keihan.co.jp/traffic/time-fare/pdf/time01-{fno}.pdf')
            elif key.startswith(('kansai-jr-','kansai-hankyu-','kansai-kintetsu-')):
                url=r.get('stopTimeSourceUrl') or r.get('sourceTrainUrl')
                if key.startswith('kansai-kintetsu-') and not url:
                    side='namba' if key.endswith('namba-nara') else 'nara'
                    url=KIN_LINKS[side+'-'+calendar][r['departure']]
                seq,number=train_detail(url)
                if seq:found=clip(seq,p,r)
                if found:r['stopTimeSourceUrl']=url
                if not found:issues.append({'key':key,'id':r['id'],'reason':'source train origin/destination or departure mismatch','url':url})
            elif key.startswith(('kansai-metro-','fukuoka-')):
                found,note,urls=estimate_metro(p,r);sources.update(urls);basis='estimated'
            elif key.startswith('kansai-hanshin-'):
                found=partial_hanshin(p,r);basis='partial'
                note='한신 공식 보통열차 정차역 순서입니다. 출발역 이후의 열차별 정차 시각은 확보되지 않아 자동 현재역·남은시간을 계산하지 않습니다. 현재 역을 직접 확인해 주세요.'
                sources.add('https://www.hanshin.co.jp/system/js/front/timetable.json.js')
            if not found:
                found=[stop(p['fromJa'],'Route',departure=r['departure']),stop(p['toJa'],'Route',arrival=r.get('destinationArrival'),departure=r.get('destinationDeparture'))]
                basis='partial';note='출발역·도착역 시각만 확인되었습니다. 중간역 시각은 제공되지 않습니다.'
            r['stops']=found;r['stopTimeBasis']=basis;r['stopTimeNote']=note
            if number:r['number']=number
            if basis=='timetable':
                if found[-1].get('arrival'):r['destinationArrival']=found[-1]['arrival']
                if found[-1].get('departure'):r['destinationDeparture']=found[-1]['departure']
            counts[basis]+=1
    data['metadata'][key]['rideStops']={
        'retrievedAt':'2026-10-25','counts':dict(counts),
        'sourceUrls':sorted(sources),
        'note':'Stops preserve arrival, departure, unknown source-event and explicit estimates separately. Calendar constraints and original departure times are retained. Individual detail source links are stored on each record when available.'
    }
    if key.startswith('kansai-hanshin-'):
        data['metadata'][key]['rideStops']['missingFields']=['intermediate arrival/departure times','destination arrival/departure time']
        data['metadata'][key]['rideStops']['limitation']='Official local-train station order and departure-station times only. No verified train-specific downstream times or standard-duration source; automatic current station and remaining time are unavailable.'
    file.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
    summary[key]=dict(counts)
print(json.dumps({'profiles':summary,'totals':dict(sum((Counter(x) for x in summary.values()),Counter())),'issues':issues},ensure_ascii=False,indent=2))
