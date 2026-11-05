'use strict';
// Add exact OD timetable projections without changing legacy profiles or fares.
// Input snapshots are pinned public data. No interval-generated departures,
// interpolated arrivals, guessed transfers or private coordinates are permitted.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../japan-2027'),cache=path.resolve(process.env.TOKYO_TIMETABLE_CACHE||path.join(__dirname,'../../tokyo-timetable-cache'));
const pin='c708abea8bf05ab56137a50e52c032112b6f9beb',checkedAt='2026-11-05',prefix='tokyo27-';
const upstream='https://github.com/nagix/mini-tokyo-3d/blob/'+pin+'/data/train-timetables/';
const sourceInputs=require('./tokyo-timetable-source-files.json');
if(sourceInputs.pin!==pin)throw Error('Mismatched source pin');
function readInput(name){const ref=sourceInputs.files.find(f=>f.name===name),bytes=fs.readFileSync(path.join(cache,name));if(!ref||crypto.createHash('sha256').update(bytes).digest('hex')!==ref.sha256||crypto.createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex')!==ref.gitBlob)throw Error('Unverified source snapshot '+name);return bytes;}
const configs={
 'TokyoMetro.Hibiya':['tokyometro-hibiya','https://www.tokyometro.jp/station/','https://www.tokyometro.jp/unkou/history/hibiya.html'],
 'TokyoMetro.Ginza':['tokyometro-ginza','https://www.tokyometro.jp/station/','https://www.tokyometro.jp/unkou/history/ginza.html'],
 'TokyoMetro.Namboku':['tokyometro-namboku','https://www.tokyometro.jp/station/','https://www.tokyometro.jp/unkou/history/namboku.html'],
 'JR-East.Yamanote':['jreast-yamanote','https://www.jreast.co.jp/estation/'],
 'JR-East.Takasaki':['jreast-takasaki','https://www.jreast.co.jp/estation/'],
 'JR-East.Tokaido':['jreast-tokaido','https://www.jreast.co.jp/estation/'],
 'JR-East.KeihinTohokuNegishi':['jreast-keihintohokunegishi','https://www.jreast.co.jp/estation/'],
 'JR-East.ChuoSobuLocal':['jreast-chuosobulocal','https://www.jreast.co.jp/estation/'],
 'JR-East.ChuoRapid':['jreast-chuorapid','https://www.jreast.co.jp/estation/'],
 'JR-East.Yokosuka':['jreast-yokosuka','https://www.jreast.co.jp/estation/'],
 'JR-East.Ito':['jreast-ito','https://www.jreast.co.jp/estation/'],
 'Yurikamome.Yurikamome':['yurikamome-yurikamome','https://www.yurikamome.co.jp/info/timetable/'],
 'Minatomirai.Minatomirai':['minatomirai-minatomirai','https://www.mm21railway.co.jp/m/jikokuhyo/index.html'],
 'Keio.Inokashira':['keio-inokashira','https://www.keio.co.jp/train/station/'],
 'Odakyu.Odawara':['odakyu-odawara','https://www.odakyu.jp/romancecar/timetable/'],
 'OdakyuHakone.HakoneTozan':['odakyuhakone-hakonetozan','https://www.hakonenavi.jp/hakone-tozan/'],
 'Tobu.TobuSkytree':['tobu-tobuskytree','https://www.tobu.co.jp/railway/special_express/timetable/'],
 'Tobu.Nikko':['tobu-nikko','https://www.tobu.co.jp/railway/special_express/timetable/'],
 'Toei.Shinjuku':['toei-shinjuku','https://www.kotsu.metro.tokyo.jp/subway/timetable/'],
 'Toei.Asakusa':['toei-asakusa','https://www.kotsu.metro.tokyo.jp/subway/timetable/'],
 'Toei.Oedo':['toei-oedo','https://www.kotsu.metro.tokyo.jp/subway/timetable/'],
 'Enoden.Enoden':['enoden-enoden','https://www.enoden.co.jp/train/station/']
};
require(path.join(root,'rail-departure-profiles.js'));
const manifest=structuredClone(global.RailDepartureProfiles),previousFiles=new Set(Object.entries(manifest.profiles).filter(([k])=>k.startsWith(prefix)).map(([,p])=>p.file)),legacy=Object.fromEntries(Object.entries(manifest.profiles).filter(([k])=>!k.startsWith(prefix)));
manifest.profiles={...legacy};
const bundle=JSON.parse(fs.readFileSync(path.join(root,'trip-update.json'))),stations=JSON.parse(readInput('stations.json')),stationMap=new Map(stations.map(s=>[s.id,s]));
const raw=new Map(),rawByFile=new Map(),hashes={};
for(const [file]of Object.values(configs)){
 if(rawByFile.has(file))continue;
 const bytes=readInput(file+'.json'),records=JSON.parse(bytes);hashes[file]=crypto.createHash('sha256').update(bytes).digest('hex');rawByFile.set(file,records);
 for(const train of records)raw.set(train.id,{...train,_file:file});
}
const rail=p=>['rail','metro'].includes(p.mode),match=(a,b)=>a.lineId===b.lineId&&a.from===b.from&&a.to===b.to&&(!a.line||a.line===b.line);
const oldKey=p=>Object.keys(legacy).find(key=>(legacy[key].matches||[legacy[key].match||legacy[key]]).some(m=>match(m,p)));
function stationId(part,side){const name=part[side+'Ja'];return stations.find(s=>s.railway===part.lineId&&(name?s.title.ja===name:s.title.ko===part[side]))?.id;}
const minutes=s=>typeof s==='string'&&/^\d{1,2}:[0-5]\d$/.test(s)?Number(s.split(':')[0])*60+Number(s.split(':')[1]):null;
const calendar=t=>['Weekday','SaturdayHoliday','Saturday','SundayHoliday','Daily'].find(c=>t.id.split('.').includes(c));
const sameStation=(a,b)=>a===b||!!(stationMap.get(a)?.title.ja&&stationMap.get(a).title.ja===stationMap.get(b)?.title.ja);
function plannedLoopDirection(part,from,records){
 if(part.lineId!=='JR-East.Yamanote')return null;
 // Select the direction following the existing mapped route, never the opposite
 // side of a circular railway just because it eventually reaches the same OD.
 const scores=new Map();for(const t of records){const i=t.tt.findIndex(s=>s.s===from),next=i>=0?t.tt.slice(i+1).find(s=>s.s!==from):null,coord=stationMap.get(next?.s)?.coord;if(!coord)continue;
  const distance=Math.min(...part.coords.map(([lat,lng])=>Math.hypot((coord[0]-lng)*Math.cos(lat*Math.PI/180),coord[1]-lat)*111000));scores.set(t.d,Math.min(scores.get(t.d)??Infinity,distance));
 }
 const sorted=[...scores].sort((a,b)=>a[1]-b[1]);if(sorted.length!==2||sorted[1][1]-sorted[0][1]<50)throw Error('Ambiguous loop direction '+part.from+' → '+part.to);return sorted[0][0];
}
function combine(a,b){const out=a.map(s=>({...s}));for(const s of b){const last=out.at(-1);if(last&&sameStation(last.s,s.s)){if(s.d)last.d=s.d;if(!last.a&&s.a)last.a=s.a;last.aliases=[...(last.aliases||[]),s.s];}else out.push({...s});}return out;}
function isStation(stop,id){return stop.s===id||stop.aliases?.includes(id);}
function segments(parts){const out=[];for(let i=0;i<parts.length;i++){
 const p=parts[i];if(!rail(p))continue;const group=[p];
 while(i+1<parts.length&&rail(parts[i+1])&&parts[i].throughService&&parts[i].throughService===parts[i+1].throughService&&parts[i].to===parts[i+1].from)group.push(parts[++i]);
 out.push(group);
 }return out;}
function namedStop(s){const ref=stationMap.get(s.s);if(!ref)throw Error('Missing source station '+s.s);return {id:s.s,name:ref.title.ko||ref.title.ja,nameJa:ref.title.ja,coord:ref.coord?[ref.coord[1],ref.coord[0]]:undefined,...(s.a?{arrival:s.a}:{}),...(s.d?{departure:s.d}:{})};}
function collect(parts){
 const first=parts[0],last=parts.at(-1),from=stationId(first,'from'),to=stationId(last,'to'),config=configs[first.lineId];if(!from||!to||!config)return null;
 const isRomance=parts.some(p=>/로망스카/.test(p.line)),isNikko=parts.some(p=>p.lineId==='Tobu.Nikko'),out={},files=new Set(),direction=plannedLoopDirection(first,from,rawByFile.get(config[0]));
 for(const train of rawByFile.get(config[0])){
  if(!train.tt.some(s=>s.s===from&&s.d))continue;
  if(direction&&train.d!==direction)continue;
  if(isRomance&&(!/LimitedExpress$/.test(train.y)||!(train.nm||[]).some(n=>/Hakone/i.test(n.en||''))))continue;
  if(isNikko&&(!/LimitedExpress$/.test(train.y)||!(train.nm||[]).some(n=>/Kegon/i.test(n.en||''))))continue;
  const cal=calendar(train);if(!cal)continue;
  const walk=(current,stops,chain)=>{
   if(chain.length>16||chain.includes(current.id)||calendar(current)!==cal)return;
   const all=combine(stops,current.tt),a=all.findIndex(s=>isStation(s,from)),z=all.findIndex((s,i)=>i>a&&isStation(s,to));
   const nextChain=[...chain,current.id];
   if(a>=0&&z>a){
    const source=all[a],target=all[z];if(!source.d||!(target.a||target.d))return;
    const calls=all.slice(a,z+1),stopsOut=calls.map(namedStop),destinations=(current.ds||train.ds||[]).map(id=>stationMap.get(id)).filter(Boolean);
    const destination=destinations.map(s=>s.title.ko||s.title.ja).join(' · ')||last.to,destinationJa=destinations.map(s=>s.title.ja).join('・')||last.toJa;
    const record={id:train.id+'@'+crypto.createHash('sha1').update(nextChain.join('|')+'|'+to).digest('hex').slice(0,10),number:train.nm?.[0]?.ko||train.nm?.[0]?.ja||train.n,arrival:source.a||null,departure:source.d,destinationArrival:target.a||null,destinationDeparture:target.d||null,destination,destinationJa,type:train.y.split('.').at(-1),stops:stopsOut,stopTimeBasis:'timetable',stopTimeNote:'공개 원본의 정차·도착·출발 시각. 원본에 없는 도착시각은 계산하지 않습니다.',sourceTrainIds:nextChain};
    if(!out[cal])out[cal]=[];if(!out[cal].some(r=>r.id===record.id))out[cal].push(record);for(const id of nextChain)files.add(raw.get(id)._file);return;
   }
   for(const id of current.nt||[]){const next=raw.get(id);if(next)walk(next,all,nextChain);}
  };
  walk(raw.get(train.id),[],[]);
 }
 for(const records of Object.values(out))records.sort((a,b)=>minutes(a.departure)-minutes(b.departure)||a.id.localeCompare(b.id));
 if(!out.Weekday?.length||!(out.SaturdayHoliday?.length||out.Saturday?.length&&out.SundayHoliday?.length))return null;
 return {out,files:[...files],from,to,config,direction};
}
const groups=new Map();
for(const legs of Object.values(bundle.routes.days))for(const leg of legs)for(const ps of segments(leg.parts)){
 if(ps.every(oldKey))continue;
 const id=ps.map(p=>[p.lineId,p.from,p.to,p.line]).flat().join('|');groups.set(id,ps);
}
const packs=new Map(),created=[],unavailable=[];
for(const [identity,parts]of groups){const projection=collect(parts);if(!projection){unavailable.push({lines:parts.map(p=>p.lineId),from:parts[0].from,to:parts.at(-1).to});continue;}
 const first=parts[0],last=parts.at(-1),key=prefix+crypto.createHash('sha256').update(identity).digest('hex').slice(0,14),file='timetables/'+key+'.json';
 const sourceUrls=projection.files.map(f=>upstream+f+'.json'),sourceHashes=Object.fromEntries(projection.files.map(f=>[f,hashes[f]]));
 const metadata={sourceUrl:sourceUrls[0],sourceUrls,sourceSha256:sourceHashes,upstreamCommit:pin,retrievedAt:checkedAt,scheduleRevision:null,itineraryExpansion:true,note:'Mini Tokyo 3D 공개 시간표의 정확한 정차역·직통 연결을 사용합니다. 운영사 전수 대조 미실시. 여행일 운행·임시열차·좌석 및 실시간 지연은 확인되지 않았습니다.'};
 const line=parts.some(p=>/로망스카/.test(p.line))?'로망스카 · 하코네 직통':parts.some(p=>p.lineId==='Tobu.Nikko')?'게곤·리버티 게곤 · 닛코 직통':parts.length>1?'JR 우에노도쿄라인 · 도카이도선 직통':first.line;
 const stationCode=(id,side)=>Object.values(legacy).find(p=>p['source'+side+'Id']===id)?.[side.toLowerCase()+'Code'];
 const profile={lineId:first.lineId,line,from:first.from,to:last.to,fromJa:first.fromJa||stationMap.get(projection.from).title.ja,toJa:last.toJa||stationMap.get(projection.to).title.ja,sourceLineId:first.lineId,sourceFromId:projection.from,sourceToId:projection.to,fromCode:stationCode(projection.from,'From'),toCode:stationCode(projection.to,'To'),country:'JP',file,officialTimetableUrl:(first.lineId.startsWith('TokyoMetro.')?projection.config[1]:Object.values(legacy).find(p=>p.sourceFromId===projection.from)?.officialTimetableUrl)||projection.config[1],statusUrl:projection.config[2],metadata,validFrom:null,validUntil:null,sourceDate:checkedAt,sourceClass:'public-reference',calendarFrom:'2026-11-05',calendarThrough:'2027-02-28',notice:'공개 시간표 참고 · 여행 전 재확인 · 실시간 정보 미지원',...(parts.length>1?{throughParts:parts.map(p=>({lineId:p.lineId,from:p.from,to:p.to,line:p.line}))}:{matches:[{lineId:first.lineId,from:first.from,to:first.to,line:first.line}]})};
 if(projection.direction)profile.directionId=projection.direction;
 manifest.profiles[key]=profile;created.push({key,parts,profile});
 if(!packs.has(file))packs.set(file,{schemaVersion:2,profiles:{},metadata:{}});const pack=packs.get(file);pack.profiles[key]=projection.out;pack.metadata[key]=metadata;
}
const cable=JSON.parse(fs.readFileSync(path.join(__dirname,'hakone-cable-timetable.json')));
const cableNames={'強羅':'고라','公園下':'고엔시모','公園上':'고엔카미','中強羅':'나카고라','上強羅':'가미고라','早雲山':'소운잔'};
for(const [direction,calendars]of Object.entries(cable.directions)){
 const outbound=direction==='outbound',from=outbound?'고라':'소운잔',to=outbound?'소운잔':'고라',fromJa=outbound?'強羅':'早雲山',toJa=outbound?'早雲山':'強羅',key=prefix+'hakone-cable-'+direction,file='timetables/'+prefix+'hakone-cable.json';
 const ps=[{mode:'rail',lineId:'Hakone.Cable',line:'하코네 등산 케이블카',from,to,fromJa,toJa}];
 const metadata={sourceUrl:cable.source,sourceSha256:cable.sourceSha256,scheduleRevision:cable.revision,retrievedAt:checkedAt,verifiedSourceDate:checkedAt,itineraryExpansion:true,note:'공식 PDF의 같은 열에 있는 역별 시각 6개를 추출했습니다. 출발역 외에는 도착·출발을 단정하지 않고 원문 정차 시각으로 보존합니다.'};
 const profile={...ps[0],fromCode:outbound?'OH57':'OH62',toCode:outbound?'OH62':'OH57',country:'JP',sourceLineId:'Hakone.Cable',sourceFromId:'Hakone.Cable.'+(outbound?'Gora':'Sounzan'),sourceToId:'Hakone.Cable.'+(outbound?'Sounzan':'Gora'),file,officialTimetableUrl:cable.source,statusUrl:'https://www.hakonenavi.jp/transportation/',metadata,matches:[{lineId:'Hakone.Cable',from,to}],validFrom:cable.revision,validUntil:null,sourceDate:checkedAt,sourceClass:'official-current',calendarFrom:cable.revision,calendarThrough:'2027-02-28'};
 const timetable=Object.fromEntries(Object.entries(calendars).map(([cal,rows])=>[cal,rows.map(row=>({id:'Hakone.Cable.'+direction+'.'+row.times[0]+'.'+cal,number:'',departure:row.times[0],arrival:null,destinationArrival:null,destinationDeparture:null,destination:to,destinationJa:toJa,type:'Cable',stops:row.stations.map((ja,i)=>({id:'Hakone.Cable.'+ja,name:cableNames[ja],nameJa:ja,...(i===0?{departure:row.times[i]}:{time:row.times[i]})})),stopTimeBasis:'timetable',stopTimeNote:metadata.note,sourcePage:row.page,sourceColumn:row.column}))]));
 manifest.profiles[key]=profile;created.push({key,parts:ps,profile});if(!packs.has(file))packs.set(file,{schemaVersion:2,profiles:{},metadata:{}});packs.get(file).profiles[key]=timetable;packs.get(file).metadata[key]=metadata;
}
for(const item of created){const reverse=created.find(x=>x.profile.from===item.profile.to&&x.profile.to===item.profile.from&&[...new Set(x.parts.map(p=>p.lineId))].sort().join('|')===[...new Set(item.parts.map(p=>p.lineId))].sort().join('|'));if(reverse)item.profile.reverseKey=reverse.key;}
for(const [file,pack]of packs)fs.writeFileSync(path.join(root,file),JSON.stringify(pack)+'\n');
// Remove only this generator's obsolete packs, after their replacements exist.
for(const file of previousFiles)if(!packs.has(file)&&/^timetables\/tokyo27-[a-z0-9-]+\.json$/.test(file)){
 const target=path.resolve(root,file);if(path.dirname(target)!==path.join(root,'timetables'))throw Error('Invalid generated path');
 if(fs.existsSync(target)){const old=JSON.parse(fs.readFileSync(target));if(Object.keys(old.profiles||{}).every(k=>k.startsWith(prefix)))fs.unlinkSync(target);}
}
const remaining=unavailable.filter(p=>p.lines[0]!=='Hakone.Cable');
manifest.serviceInfo={
 'Hakone.Ropeway':{kind:'continuous',label:'연속 순환운행',description:'통상 약 1분 간격 운행 · 개별 열차 출발 시각을 표시하지 않습니다.',hours:'12–1월 09:00–16:15 · 2–11월 09:00–17:00',notice:'기상·점검에 따라 운휴될 수 있습니다. 실제 운행은 공식 안내를 확인하세요.',source:'https://www.hakonenavi.jp/transportation/station/sounzan/',checkedAt},
 'JR-Central.TokaidoShinkansen':{kind:'official-lookup',label:'공식 시간표 확인',description:'공식 조회는 조회일로부터 1개월 앞까지입니다. 여행일 조회 가능 여부는 공식 화면에서 확인하세요.',notice:'아타미 정차편을 확인하세요. 저장된 운행편 시각은 제공하지 않습니다.',source:'https://railway.jr-central.co.jp/time-schedule/search/',checkedAt}
};
manifest.expansion={checkedAt,upstreamCommit:pin,profiles:created.length,unavailable:remaining,policy:'stored-public-reference-no-invented-times'};
fs.writeFileSync(path.join(root,'rail-departure-profiles.js'),"'use strict';\nglobalThis.RailDepartureProfiles="+JSON.stringify(manifest)+';\n');
fs.writeFileSync(path.join(root,'timetables/tokyo27-source-report.json'),JSON.stringify({checkedAt,upstreamCommit:pin,sourceHashes:hashes,cableSourceSha256:cable.sourceSha256,profiles:created.map(x=>({key:x.key,from:x.profile.from,to:x.profile.to,throughParts:x.profile.throughParts,sourceClass:x.profile.sourceClass,counts:Object.fromEntries(Object.entries(packs.get(x.profile.file).profiles[x.key]).map(([cal,rows])=>[cal,rows.length]))})),unavailable:remaining},null,2)+'\n');
console.log(JSON.stringify({profiles:created.length,files:packs.size,unavailable:remaining},null,2));
