'use strict';
(function(){
 let layer=null,loading=null,owner=null;
 async function show(map){
  owner=map;map.getContainer().classList.add('offline-map-active');
  if(layer){if(!map.hasLayer(layer))layer.addTo(map);return;}
  if(loading)return loading;
  const pane=map.getPane('offlineBase')||map.createPane('offlineBase');pane.style.zIndex='210';pane.style.pointerEvents='none';
  layer=L.layerGroup().addTo(map);
  loading=(async()=>{try{const land=await TravelStore.readJson('assets/maps/offline-land.json?v='+TravelStore.VERSION,{preferCache:true,timeout:3000});
   L.geoJSON(land,{pane:'offlineBase',interactive:false,style:{color:'#b5c5b5',weight:1,fillColor:'#f4f4e9',fillOpacity:1}}).addTo(layer);
   for(const [name,lat,lng]of [['서울',37.5665,126.978],['대구',35.8714,128.6014],['부산',35.1796,129.0756],['도쿄',35.676,139.65],['오사카',34.6937,135.5023],['교토',35.0116,135.7681],['후쿠오카',33.5902,130.4017],['쓰시마',34.3,129.3]])L.marker([lat,lng],{pane:'offlineBase',interactive:false,keyboard:false,icon:L.divIcon({className:'offline-city-label',html:name,iconSize:[70,20]})}).addTo(layer);
   map.attributionControl.addAttribution('간략 지도: Natural Earth · Public domain');
  }catch(_){/* Places and all route vectors remain available on the neutral canvas. */}
  finally{loading=null;}})();return loading;
 }
 function hide(){owner?.getContainer().classList.remove('offline-map-active');if(layer&&owner?.hasLayer(layer))owner.removeLayer(layer);}
 window.OfflineMap={show,hide};
})();
