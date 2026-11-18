'use strict';
// Rebuild the active trip without rewriting the original source itinerary or routes.
// Map inputs: pinned Mini Tokyo 3D, GSI address representative points and existing routes.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'../japan-2027'),cache=path.resolve(process.env.TOKYO_REPLAN_CACHE||path.join(__dirname,'../.tokyo-replan-cache'));
const T=require(root+'/data-model'),P=require(root+'/personal-trip'),Roads=require(root+'/offline-roads');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8')),clone=x=>JSON.parse(JSON.stringify(x));
const legacy=P.patch(T.merge(read('data.json'),read('tokyo-data.json'),read('west-data.json')),{days:{...read('tokyo-routes.json').days,...read('west-routes.json').days}});
const places=legacy.data.days.flatMap(d=>d.variants.flatMap(v=>v.stops));
const stations=JSON.parse(fs.readFileSync(path.join(cache,'stations.json'))),railways=JSON.parse(fs.readFileSync(path.join(cache,'railways.json'))),coordinates=JSON.parse(fs.readFileSync(path.join(cache,'coordinates.json'))).railways;
const geocodes=JSON.parse(fs.readFileSync(path.join(cache,'geocodes.json')));
const referencePlaces=JSON.parse(fs.readFileSync(path.join(cache,'place-coordinates.json'))).query.pages;
const referencePoint=title=>Object.values(referencePlaces).find(p=>p.title===title)?.coordinates?.[0];
const PIN='68314fe92773aa4691075b79243f2010fc8e2836',SOURCE='https://github.com/nagix/mini-tokyo-3d/tree/'+PIN+'/data';
const officialRail=require('./tokyo-rail-geometry.json');
const transitCorrections=require('./tokyo-transit-corrections.json'),roadCorrections=require('./tokyo-walk-corrections.json');
const roadKey=(mode,a,b)=>mode+'|'+point(a).map(n=>Number(n).toFixed(7)).join(',')+'>'+point(b).map(n=>Number(n).toFixed(7)).join(',');
const routes={},days=[],warnings=[],railCache=new Map(),walkCache=new Map();
const point=x=>Array.isArray(x)?x:[x.lat,x.lng],dist=(a,b)=>P.distance({lat:point(a)[0],lng:point(a)[1]},{lat:point(b)[0],lng:point(b)[1]});
const length=c=>c.slice(1).reduce((n,p,i)=>n+dist(c[i],p),0),same=(a,b)=>dist(a,b)<2;
const nearest=(c,p)=>c.reduce((best,x,i)=>dist(x,p)<best.d?{i,d:dist(x,p)}:best,{i:0,d:Infinity});
function slice(c,a,b){const i=nearest(c,a).i,j=nearest(c,b).i;return i<=j?c.slice(i,j+1):c.slice(j,i+1).reverse();}
function lineCoords(id,seen=new Set()){
 if(railCache.has(id))return railCache.get(id);if(seen.has(id))return [];seen=new Set([...seen,id]);
 const line=coordinates.find(x=>x.id===id);if(!line)return [];
 let result=[];for(const part of line.sublines||[]){let c=(part.coords||[]).map(x=>[x[1],x[0]]);
  if(part.type==='sub'&&part.start?.railway===part.end?.railway){const parent=lineCoords(part.start.railway,seen);if(parent.length&&c.length>1)c=slice(parent,c[0],c.at(-1));}
  if(result.length&&c.length&&same(result.at(-1),c[0]))c=c.slice(1);result.push(...c);
 }railCache.set(id,result);return result;
}
function station(id){const s=stations.find(x=>x.id===id);if(!s)throw Error('Missing public station '+id);return {name:s.title.ko||s.title.en,jp:s.title.ja,lat:s.coord[1],lng:s.coord[0],kind:'station',source:SOURCE,stationId:id,area:'일본',coordinateAccuracy:'map-reference'};}
const S={};function st(key,id){return S[key]=station(id);}
st('iriya','TokyoMetro.Hibiya.Iriya');st('ueno','TokyoMetro.Hibiya.Ueno');st('akihabara','TokyoMetro.Hibiya.Akihabara');st('ginza','TokyoMetro.Hibiya.Ginza');st('shimbashi','TokyoMetro.Ginza.Shimbashi');
st('shijo','Yurikamome.Yurikamome.ShijoMae');st('daiba','Yurikamome.Yurikamome.Daiba');st('ikebukuro','JR-East.Yamanote.Ikebukuro');st('kawagoe','Tobu.Tojo.Kawagoe');
st('yokohama','JR-East.Tokaido.Yokohama');st('chukagai','Minatomirai.Minatomirai.MotomachiChukagai');st('sakuragicho','JR-East.KeihinTohokuNegishi.Sakuragicho');
st('kichijoji','JR-East.ChuoRapid.Kichijoji');st('shimokita','Keio.Inokashira.ShimoKitazawa');st('shibuya','TokyoMetro.Ginza.Shibuya');st('shinjuku','JR-East.ChuoSobuLocal.Shinjuku');st('harajuku','JR-East.Yamanote.Harajuku');
st('odawara','Odakyu.Odawara.Odawara');st('yumoto','OdakyuHakone.HakoneTozan.HakoneYumoto');st('gora','OdakyuHakone.HakoneTozan.Gora');
st('kitasenju','TokyoMetro.Hibiya.KitaSenju');st('tobudobutsu','Tobu.Nikko.TobuDobutsuKoen');st('nikko','Tobu.Nikko.TobuNikko');
st('ochanomizu','JR-East.ChuoSobuLocal.Ochanomizu');st('tokyo','JR-East.ChuoRapid.Tokyo');st('suidobashi','JR-East.ChuoSobuLocal.Suidobashi');st('korakuen','TokyoMetro.Namboku.Korakuen');st('meguro','TokyoMetro.Namboku.Meguro');
st('nakameguro','TokyoMetro.Hibiya.NakaMeguro');st('roppongi','TokyoMetro.Hibiya.Roppongi');st('kasuga','Toei.Oedo.Kasuga');st('kamakura','JR-East.Yokosuka.Kamakura');st('hase','Enoden.Enoden.Hase');
st('atami','JR-East.Ito.Atami');st('kinomiya','JR-East.Ito.Kinomiya');st('kuramae','Toei.Asakusa.Kuramae');st('jim','Toei.Shinjuku.Jimbocho');st('bakuro','Toei.Shinjuku.BakuroYokoyama');st('higashinihonbashi','Toei.Asakusa.HigashiNihombashi');
function details(feature,kind='sight',source=[]){return {feature,thingsToDo:[],stayLabel:'일정 시각 기준',costMin:null,costMax:null,costKind:kind==='hotel'?'lodging':['food','cafe','shopping'].includes(kind)?kind:'admission',costCurrency:'JPY',costConfidence:'unconfirmed',costNote:'실제 이용·구매 금액 확인 후 입력',reservationNote:'계획 일정 · 예약·영업일·현장 안내 확인',sources:source,sourceCheckedAt:'2026-11-05'};}
function old(name,time,note,kind){const src=places.find(x=>x.name===name);if(!src)throw Error('Missing original place '+name);const s=clone(src);delete s.reservationTiming;delete s.start;delete s.end;if(time)s.time=time;if(note)s.description=note;if(kind)s.kind=kind;return s;}
function geo(id,name,jp,time,kind,note,official){const g=geocodes[id];if(g?.results?.length!==1)throw Error('Review ambiguous GSI address '+id);const f=g.results[0],[lng,lat]=f.geometry.coordinates,rp=referencePoint(jp),wiki='https://ja.wikipedia.org/wiki/'+encodeURIComponent(jp);return {name,jp,time,kind,lat:rp?.lat??lat,lng:rp?.lon??lng,address:g.address,area:g.address,source:rp?wiki:g.url,coordinateAccuracy:rp?'map-reference':'address-reference',coordinateNote:rp?'공개 시설 대표 좌표 · 실제 출입구는 외부 지도·현장 안내 확인':'국토지리원 주소 대표 좌표 · 실제 출입구는 외부 지도·현장 안내 확인',description:note,details:details(note,kind,[official,rp?wiki:g.url].filter(Boolean))};}
function based(base,name,time,kind,note){const s=clone(base);Object.assign(s,{name,time,kind,description:note,details:details(note,kind,[base.source].filter(Boolean))});delete s.reservationKey;return s;}
const HOTEL=old('STAY&GO 이리야키타'),DOME=geo('dome','도쿄 돔 호텔','東京ドームホテル','','hotel','1/19 체크인 → 1/22 체크아웃 · 3박 계획. 예약 확정 여부·결제는 사용자 확인.','https://www.tokyodome-hotels.co.jp/transportation/');
const DONKI=geo('donkiAsakusa','돈키호테 아사쿠사점','ドン・キホーテ浅草店','18:00-19:00','shopping','첫 번째 쇼핑 · 여행 중 쓸 생활용품·세면용품·간식. 센소지 관광은 추가하지 않습니다.','https://www.donki.com/store/shop_detail.php?shop_id=326');
const DONKI2=geo('donkiShibuya','MEGA 돈키호테 시부야 본점','MEGAドン・キホーテ渋谷本店','17:00-18:30','shopping','두 번째 쇼핑 · 선물용 과자·잡화·화장품. 구매비는 실제 비용에 입력.','https://www.donki.com/store/shop_detail.php?shop_id=442');
const start=(h=HOTEL,time='09:00-09:10')=>based(h,h.name,time,'hotel','숙소에서 출발 준비. 체크인·체크아웃 시각과 예약 상태는 확인서 기준.');
const end=(h=HOTEL,time='20:30-21:00')=>based(h,h.name,time,'hotel','숙소 도착·휴식. 교통 시각은 계획이며 실시간 도착 보장이 아닙니다.');
function unknown(blank=false){return {min:null,max:null,icYen:null,paperTicketYen:null,currency:'JPY',status:'unverified',label:'',displayBlank:blank,checkedAt:null,passEligible:false,passExtraMin:null,passExtraMax:null,sources:[],breakdown:[],confidence:'unknown',basis:blank?'스카이라이너 요금 입력 보류':'변경한 OD의 IC 운임 확인 필요 · 기존 다른 구간 요금을 재사용하지 않음'};}
const free=()=>({min:0,max:0,icYen:0,paperTicketYen:0,currency:'JPY',status:'exact',label:'',passEligible:false,breakdown:[],sources:[],basis:'도보·역내 연결 추가 운임 없음'});
const walkIndex=Object.values(legacy.routes.days).flat().flatMap(l=>l.parts||[]).filter(p=>p.mode==='walk'&&p.coords?.length>1);
const streetFiles=fs.readdirSync(root+'/assets/offline-streets').filter(x=>/^day-(?:[1-9]|10|11)\.json.gz$/.test(x));
let streetElements;
function streets(){if(streetElements)return streetElements;const all=new Map();for(const file of streetFiles){const d=JSON.parse(zlib.gunzipSync(fs.readFileSync(root+'/assets/offline-streets/'+file)));for(const e of d.elements)if(e.type==='way'&&e.tags?.highway&&e.geometry?.length>1)all.set(e.id,e);}return streetElements=[...all.values()];}
function connector(a,b,line='역내·출입구 연결'){const c=[point(a),point(b)];return {mode:'transfer',line,from:a.name||'',to:b.name||'',coords:c,distanceM:length(c),durationMinutes:Math.max(1,Math.ceil(length(c)/65)),geometryAccuracy:'schematic',geometrySource:'대표 지점 연결 개략선 · 역내 실제 통로 미확인',source:'https://www.tokyometro.jp/lang_kr/station/index.html'};}
function walk(a,b){if(same(a,b))return {mode:'walk',line:'같은 대표 지점 내 이동',from:a.name,to:b.name,coords:[point(a),point(b)],distanceM:0,durationMinutes:0,geometryAccuracy:'schematic',geometrySource:'같은 지역 대표 지점 · 실제 업장 선택 전',source:a.source};const key=point(a).join(',')+'>'+point(b).join(',');if(walkCache.has(key))return clone(walkCache.get(key));const corrected=roadCorrections.routes[roadKey('foot',a,b)];if(corrected)return {...clone(corrected),mode:'walk',line:'도보',from:a.name,to:b.name};let p;
 const hit=walkIndex.find(x=>dist(x.coords[0],a)<25&&dist(x.coords.at(-1),b)<25);if(hit)p=clone(hit);
 else{const aa=point(a),bb=point(b),elements=streets().filter(e=>e.geometry.some(n=>n.lat>=Math.min(aa[0],bb[0])-.012&&n.lat<=Math.max(aa[0],bb[0])+.012&&n.lon>=Math.min(aa[1],bb[1])-.015&&n.lon<=Math.max(aa[1],bb[1])+.015));let route;try{route=Roads.findRoute({elements},aa,bb);}catch(_){}
  if(route?.coords?.length>1)p={mode:'walk',line:'도보',coords:route.coords,distanceM:Math.round(length(route.coords)),durationMinutes:Math.ceil(length(route.coords)/65),geometryAccuracy:'mapped',geometrySource:'OpenStreetMap 저장 도로 · 보행 경로 탐색',source:'https://www.openstreetmap.org/copyright'};
  else p={...connector(a,b,'도보 연결 · 실제 보행로 확인 필요'),mode:'walk'};
 }p.from=a.name;p.to=b.name;walkCache.set(key,clone(p));return p;
}
function rail(id,a,b,opts={}){if(typeof a==='string')a=S[a];if(typeof b==='string')b=S[b];if(!a||!b)throw Error('Missing station '+id);const official=officialRail.lines[id]||(id==='Hakone.Ropeway'?transitCorrections.ropeway:null);let all=official?.coords||lineCoords(id),c=all.length?slice(all,point(a),point(b)):[];
 // Loops have two valid directions; choose the shorter path, retaining original coordinates.
 if(id==='JR-East.Yamanote'&&all.length&&dist(all[0],all.at(-1))<250){const i=nearest(all,point(a)).i,j=nearest(all,point(b)).i,other=i<=j?[...all.slice(0,i+1).reverse(),...all.slice(j).reverse()]:[...all.slice(i),...all.slice(0,j+1)];if(length(other)<length(c))c=other;}
 if(opts.referenceStops)c=require('./rail-reference-path.cjs').referencePath(all,opts.referenceStops.map(point),dist);
 const {referenceStops,...storedOptions}=opts;
 const r=railways.find(x=>x.id===id),mapped=c.length>1&&dist(c[0],a)<350&&dist(c.at(-1),b)<350;
 if(!mapped){c=[point(a),point(b)];warnings.push(id+' '+a.name+' → '+b.name);}
 return {mode:/^(TokyoMetro|Toei)\./.test(id)?'metro':'rail',line:opts.line||r?.title?.ko||id,lineId:id,from:a.name,to:b.name,fromJa:a.jp,toJa:b.jp,coords:c,distanceM:Math.round(length(c)),durationMinutes:opts.minutes||Math.max(2,Math.round(length(c)/600)),geometryAccuracy:mapped?'mapped':'schematic',geometrySource:mapped?(official?.geometrySource||'Mini Tokyo 3D · 핀 고정 지도 철도 선형'):'확인된 역 대표 좌표 연결 개략선 · 실제 선형 미확인',source:official?.source||SOURCE,...storedOptions};}
const R=(id,a,b,opts)=>rail(id,a,b,opts);
function nikkoBus(inbound=false){const route=transitCorrections[inbound?'nikkoInbound':'nikkoOutbound'];return {...clone(route),mode:'bus',lineId:'TobuBus.Nikko.C',line:'도부버스 C계통 · '+(inbound?'도부닛코역행':'니시산도입구행'),from:inbound?'니시산도입구':'도부닛코역 버스정류장',to:inbound?'도부닛코역 버스정류장':'니시산도입구',fromJa:inbound?'西参道入口':'東武日光駅',toJa:inbound?'東武日光駅':'西参道入口',durationMinutes:10};}
function fuuaShuttle(a,b,line){const route=roadCorrections.routes[roadKey('car',a,b)];if(!route)throw Error('Missing reviewed shuttle road reference');return {...clone(route),mode:'bus',lineId:'Atami.FuuaShuttle',line,from:a.name,to:b.name,durationMinutes:10};}
function connection(a,b,spec){let ps=[];if(spec?.parts)ps=clone(spec.parts);else if(Array.isArray(spec))ps=spec;else ps=[walk(a,b)];
 if(ps.length){const first=ps[0].coords?.[0],last=ps.at(-1).coords?.at(-1);if(first&&dist(a,first)>2)ps.unshift(['rail','metro','bus'].includes(ps[0].mode)?walk(a,{name:ps[0].from,lat:first[0],lng:first[1]}):connector(a,{lat:first[0],lng:first[1]}));if(last&&dist(b,last)>2)ps.push(['rail','metro','bus'].includes(ps.at(-1).mode)?walk({name:ps.at(-1).to,lat:last[0],lng:last[1]},b):connector({lat:last[0],lng:last[1]},b));for(let i=1;i<ps.length;i++){const prev=ps[i-1].coords?.at(-1),next=ps[i].coords?.[0];if(prev&&next&&dist(prev,next)>2){ps.splice(i,0,connector({lat:prev[0],lng:prev[1],name:ps[i-1].to},{lat:next[0],lng:next[1],name:ps[i].from}));i++;}}}
 let fare=spec?.fare?clone(spec.fare):ps.every(p=>['walk','transfer'].includes(p.mode))?free():unknown();
 if(!spec?.fare){const signature=p=>p.filter(x=>['rail','metro'].includes(x.mode)).map(x=>[x.lineId,x.from,x.to]);const sig=JSON.stringify(signature(ps));const prior=Object.values(legacy.routes.days).flat().find(l=>JSON.stringify(signature(l.parts||[]))===sig&&sig!=='[]'&&l.fare?.status!=='unverified');if(prior)fare=clone(prior.fare);}
 const distanceM=ps.reduce((n,p)=>n+(p.distanceM||0),0),durationMinutes=spec?.minutes??spec?.durationMinutes??ps.reduce((n,p)=>n+(p.durationMinutes||0),0),summary=spec?.summary||ps.filter(p=>!['walk','transfer'].includes(p.mode)).map(p=>p.line).join(' → ')||'도보';
 return {...(spec?.parts?clone(spec):{}),fromUid:a.uid,toUid:b.uid,from:a.name,to:b.name,parts:ps,fare,private:a.kind==='home'||b.kind==='home',distanceM,walkDistanceM:ps.filter(p=>['walk','transfer'].includes(p.mode)).reduce((n,p)=>n+(p.distanceM||0),0),durationMinutes,durationLabel:spec?.durationLabel||'계획 약 '+durationMinutes+'분',summary,note:'저장된 여행 계획 · 이동시간은 추정값. 지도 복원 경로와 개략 연결선을 구분하며 실시간 운행·역내 통로는 현장 확인.'};
}
function day(n,title,city,stops,specs=[],id='main',label='기본 일정'){
 stops=stops.map((s,i)=>({...clone(s),uid:`t27-d${n}-${id}-${i}`,id:`t27-d${n}-${id}-${i}`,selectionId:i,timeConfidence:'planned'}));
 const v={id,label,title,summary:title,focus:title,stops,schedule:stops.map(s=>[s.time,s.name,s.description])};
 const ls=stops.slice(1).map((s,i)=>connection(stops[i],s,specs[i]));routes[`${n}-${id}`]=ls;
 const d={n,date:'01/'+String(n+7).padStart(2,'0'),weekday:['일','월','화','수','목','금','토'][new Date(Date.UTC(2027,0,n+7)).getUTCDay()],title,shortTitle:title,city:'TOKYO',cityLabel:city,cityEn:city,group:n===1||n===15?'korea':'tokyo',section:'TOKYO',summary:title,focus:title,mapSummary:title,variants:[v],schedule:v.schedule,rows:v.schedule,meals:[],routes:[],note:'2026-11-05 사용자 승인 개편 · 계획 시각·예약 여부 구분',breakfast:'',breakfastNote:'',mapLabel:{city,places:title},photoDay:({1:2,2:1,3:4,4:1,5:3,6:0,7:6,8:8,9:1,10:0,11:11,12:10,13:7,14:0,15:1})[n]};
 days.push(d);return d;
}
function routeSpec(parts,minutes,extra={}){return {parts,minutes,...extra};}
const hibiya=(a,b)=>R('TokyoMetro.Hibiya',a,b),soba=(a,b)=>R('JR-East.ChuoSobuLocal',a,b),yama=(a,b)=>R('JR-East.Yamanote',a,b);
const toShinjuku=()=>[hibiya('iriya','akihabara'),soba('akihabara','shinjuku')];
const returnFromShinjuku=()=>[soba('shinjuku','akihabara'),hibiya('akihabara','iriya')];

module.exports={root,cache,T,P,clone,point,dist,length,station,stations,S,geo,old,based,HOTEL,DOME,DONKI,start,end,unknown,free,walk,connector,rail,R,connection,day,days,routes,warnings,routeSpec};
