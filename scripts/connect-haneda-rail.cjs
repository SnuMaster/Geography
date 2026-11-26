'use strict';

const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../japan-2027');
const manifestPath=path.join(root,'rail-departure-profiles.js');
require(manifestPath);
const manifest=globalThis.RailDepartureProfiles;
const checkedAt='2026-11-26';
const jrStation='https://timetables.jreast.co.jp/timetable/list0204.html';
const monorailStation='https://train-cloud.navitime.biz/tokyo-monorail/railroads/timetables?directional-railroad=00000783-down&station=00007843';

function connect({sourceKey,key,pair,codes,target,line,official,accept=()=>true}){
 const base=manifest.profiles[sourceKey];
 const source=JSON.parse(fs.readFileSync(path.join(root,base.file),'utf8'));
 const [from,to]=pair;
 const calendar=Object.fromEntries(Object.entries(source.profiles[sourceKey]).map(([day,rows])=>[day,rows.flatMap(row=>{
  if(!accept(row))return [];
  const toIndex=row.stops.findIndex(stop=>stop.id===target);
  if(toIndex<1)return [];
  const last=row.stops[toIndex];
  return [{...row,stops:row.stops.slice(0,toIndex+1),destinationArrival:last.arrival??null,destinationDeparture:last.departure??null}];
 })]));
 if(!calendar.Weekday?.length||!calendar.SaturdayHoliday?.length)throw Error('Incomplete station timetable: '+key);
 const file='timetables/'+key+'.json';
 const metadata={...base.metadata,verifiedSourceDate:checkedAt,officialDepartureSource:official,
  note:'운영사 평일·토휴일 출발표와 대조한 공개 시간표의 정차 자료입니다. 여행일 임시 변경은 운영사 안내를 참고하세요.'};
 manifest.profiles[key]={...base,line,from,to,fromCode:codes[0],toCode:codes[1],sourceToId:target,
  toJa:calendar.Weekday[0].stops.at(-1).nameJa,
  matches:[{lineId:base.lineId,from,to}],file,officialTimetableUrl:official,
  sourceClass:'public-reference',sourceDate:checkedAt,metadata,
  calendarFrom:'2026-11-26',calendarThrough:'2027-02-28'};
 fs.writeFileSync(path.join(root,file),JSON.stringify({schemaVersion:2,profiles:{[key]:calendar},metadata:{[key]:metadata}})+'\n');
}

connect({
 sourceKey:'day12-jr-east-yamanote-ueno-hamamatsucho',key:'yamanote-ueno-hamamatsucho-outer',
 pair:['우에노','하마마쓰초'],codes:['JY05','JY28'],target:'JR-East.Yamanote.Hamamatsucho',
 line:'JR 야마노테선',official:jrStation,accept:row=>row.id.startsWith('JR-East.Yamanote.')
});
connect({
 sourceKey:'day12-tokyomonorail-hanedaairport-hamamatsucho-hanedaairportterminal1',key:'monorail-hamamatsucho-haneda-t3',
 pair:['모노레일 하마마쓰초','하네다공항 제3터미널'],codes:['MO01','MO08'],
 target:'TokyoMonorail.HanedaAirport.HanedaAirportTerminal3',line:'도쿄 모노레일',official:monorailStation
});
manifest.profiles['monorail-hamamatsucho-haneda-t3'].direction='하네다공항 방면';
manifest.profiles['monorail-hamamatsucho-haneda-t3'].directionJa='羽田空港方面';
fs.writeFileSync(manifestPath,'globalThis.RailDepartureProfiles='+JSON.stringify(manifest)+';\n');
