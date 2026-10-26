'use strict';
const routes=[
 ['home-airport',[128.52280068514,35.82714053912],[128.6589,35.8941]],
 ['seodaegu-home',[128.5417368,35.8813666],[128.52280068514,35.82714053912]]
];
(async()=>{for(const [name,a,b] of routes){let success=false;
 for(const host of ['https://routing.openstreetmap.de/routed-car/route/v1/driving','https://router.project-osrm.org/route/v1/driving']){
  const url=host+'/'+a.join(',')+';'+b.join(',')+'?overview=full&geometries=geojson';
  try{let response=await fetch(url,{signal:AbortSignal.timeout(20000)}),result=await response.json();
   if(response.ok&&result.routes?.[0]?.geometry?.coordinates?.length>10){
    const route=result.routes[0];console.log('ROAD_RESULT '+JSON.stringify({name,source:host,meters:route.distance,seconds:route.duration,coords:route.geometry.coordinates.map(([lon,lat])=>[lat,lon])}));success=true;break;
   }else console.log('ROAD_ERROR',name,response.status,JSON.stringify(result).slice(0,200));
  }catch(e){console.log('ROAD_ERROR',name,host,String(e).slice(0,250));}
 }
 if(!success)console.log('ROAD_UNAVAILABLE',name);
}})().catch(e=>{console.log(e);process.exitCode=1;});
