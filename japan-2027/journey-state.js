'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.JourneyState=api;})(globalThis,function(){
 const STORE='routebook-variants-v1';
 function variant(day,id){const value=day.n===14&&id==='uji'?'no-yamazaki':id;return day.variants.find(v=>v.id===value)?.id||day.variants[0].id;}
 function publicVariant(day,id){return day.n===14&&id==='no-yamazaki'?'uji':id;}
 function preferences(days,input){const out={};for(const d of days)if(typeof input?.[d.n]==='string')out[d.n]=variant(d,input[d.n]);return out;}
 function load(days,storage){try{return preferences(days,JSON.parse(storage.getItem(STORE)||'{}'));}catch(_){return {};}}
 function save(value,storage){try{storage.setItem(STORE,JSON.stringify(value));}catch(_){}}
 function chosen(day,prefs){return variant(day,prefs?.[day.n]);}
 function placeId(day,v,stop,index){return typeof stop.uid==='string'?stop.uid:typeof stop.id==='string'?stop.id:`d${day.n}-${v.id}-${index}`;}
 function read(url,days,prefs){const u=new URL(url),n=Number(u.searchParams.get('day')),day=days.find(d=>d.n===n)||days[0];return {day:day.n,variant:u.searchParams.has('variant')?variant(day,u.searchParams.get('variant')):chosen(day,prefs),view:u.searchParams.get('view')==='overview'?'overview':'daily',placeId:u.searchParams.get('place')||null};}
 function url(current,state,days){const u=new URL(current),day=days.find(d=>d.n===state.day)||days[0];u.searchParams.set('day',day.n);u.searchParams.set('variant',publicVariant(day,state.variant));if(state.view==='overview')u.searchParams.set('view','overview');else u.searchParams.delete('view');if(state.placeId&&state.view!=='overview')u.searchParams.set('place',state.placeId);else u.searchParams.delete('place');return u.href;}
 function dateQuery(query){const q=query.trim(),m=/^(?:2027[./-])?0?(\d{1,2})\s*(?:[/-]|월)\s*0?(\d{1,2})\s*일?$/.exec(q);return m?`${String(Number(m[1])).padStart(2,'0')}/${String(Number(m[2])).padStart(2,'0')}`:null;}
 function search(days,query,prefs={},group='all'){
  const q=query.trim().toLocaleLowerCase(),date=dateQuery(q),results=[];if(!q)return results;
  for(const d of days){if(group!=='all'&&d.group!==group)continue;
   if(date){if(d.date===date){const v=d.variants.find(v=>v.id===chosen(d,prefs));results.push({day:d.n,variant:v.id,placeId:null,time:d.date,label:v.title||d.shortTitle});}continue;}
   for(const v of d.variants){let found=false;v.stops.forEach((s,i)=>{const name=[s.name,s.jp,s.area].filter(Boolean).join(' ').toLocaleLowerCase();if(!name.includes(q))return;found=true;results.push({day:d.n,variant:v.id,placeId:placeId(d,v,s,i),time:s.time,label:s.name});});
    if(!found&&[v.title,v.label,d.cityLabel].filter(Boolean).join(' ').toLocaleLowerCase().includes(q))results.push({day:d.n,variant:v.id,placeId:null,time:d.date,label:v.title||d.shortTitle});
   }
  }
  return results;
 }
 function totals(days,routes,prefs={}){
  const sum={transportJPY:0,transportKRW:0,transportUnknown:0,admissionMin:0,admissionMax:0,admissionUnknown:0};
  for(const d of days){const id=chosen(d,prefs),v=d.variants.find(v=>v.id===id);
   for(const l of routes[`${d.n}-${id}`]||[]){if(!l)continue;const f=l.fare;if(l.travel||['selectedQuote','publishedTariff'].includes(f?.status))continue;if(!Number.isFinite(f?.min)||f.status==='variable'){sum.transportUnknown++;continue;}if(f.currency==='JPY')sum.transportJPY+=f.min;else if(f.currency==='KRW')sum.transportKRW+=f.min;else sum.transportUnknown++;}
   for(const s of v.stops){if(s.kind!=='sight')continue;const p=s.details;if(!Number.isFinite(p?.costMin)||!Number.isFinite(p?.costMax)){sum.admissionUnknown++;continue;}sum.admissionMin+=p.costMin;sum.admissionMax+=p.costMax;}
  }
  return sum;
 }
 return Object.freeze({STORE,variant,publicVariant,preferences,load,save,chosen,placeId,read,url,dateQuery,search,totals});
});
