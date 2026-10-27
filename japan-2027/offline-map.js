'use strict';
(function(){
 let layer=null,roads=null,loading=null,owner=null,landReady=false,loadedDay=null,request=0,roadRenderer=null;
 const roadStyle=t=>{const k=t?.highway||'';return {color:/^(motorway|trunk|primary|secondary)/.test(k)?'#c3a88e':/^(footway|path|steps|pedestrian)/.test(k)?'#c8bfb0':'#c6c6b7',weight:/^(motorway|trunk|primary)/.test(k)?3:1.8,opacity:.85};};
 function currentDay(){return Number(window.__routebook?.state?.day||document.querySelector('#routeFocusPanel')?.dataset.day)||1;}
 async function refresh(){
  if(!owner||!roads||!owner.hasLayer(layer))return;const day=currentDay();if(day===loadedDay)return;
  const serial=++request;loadedDay=day;roads.clearLayers();const data=await window.OfflineRoads?.get(day);if(serial!==request||!data)return;
  const renderer=roadRenderer||(roadRenderer=L.canvas({padding:.3,pane:'offlineBase'}));let labelCount=0;
  for(const item of data.elements||[]){const tags=item.tags||{};
   if(item.type==='way'&&item.geometry?.length>1){const pts=item.geometry.map(p=>[p.lat,p.lon]).filter(p=>p.every(Number.isFinite));if(pts.length<2)continue;
    if(tags.highway)L.polyline(pts,{...roadStyle(tags),pane:'offlineBase',interactive:false,renderer}).addTo(roads);
    else if(tags.railway)L.polyline(pts,{color:'#a6a8a0',weight:1.5,dashArray:'3 4',pane:'offlineBase',interactive:false,renderer}).addTo(roads);
    else if(tags.building)L.polygon(pts,{color:'#dedbd0',fillColor:'#e9e6dc',fillOpacity:.8,weight:.5,pane:'offlineBase',interactive:false,renderer}).addTo(roads);
   }
   if(item.type==='node'&&tags.name&&Number.isFinite(item.lat)&&Number.isFinite(item.lon)&&labelCount++<100){
    const label=String(tags['name:ko']||tags.name).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    L.marker([item.lat,item.lon],{pane:'offlineBase',interactive:false,keyboard:false,icon:L.divIcon({className:'offline-road-label',html:label,iconSize:[100,18]})}).addTo(roads);
   }
  }
 }
 async function show(map){
  owner=map;map.getContainer().classList.add('offline-map-active');
  const pane=map.getPane('offlineBase')||map.createPane('offlineBase');pane.style.zIndex='210';pane.style.pointerEvents='none';
  if(!layer){layer=L.layerGroup();roads=L.layerGroup();map.on('zoomend',()=>{if(!roads||!owner)return;if(owner.getZoom()<12){if(owner.hasLayer(roads))owner.removeLayer(roads);}else if(owner.hasLayer(layer)&&!owner.hasLayer(roads))roads.addTo(owner);});}
  if(!map.hasLayer(layer))layer.addTo(map);if(map.getZoom()>=12&&!map.hasLayer(roads))roads.addTo(map);
  if(!landReady&&!loading)loading=(async()=>{try{const url='assets/maps/offline-land.json?v='+TravelStore.VERSION,land=await(navigator.onLine?TravelStore.readJson(url,{preferCache:true,timeout:3000}):TravelStore.readCachedJson(url));
   L.geoJSON(land,{pane:'offlineBase',interactive:false,style:{color:'#b5c5b5',weight:1,fillColor:'#f4f4e9',fillOpacity:1}}).addTo(layer);
   for(const [name,lat,lng]of [['서울',37.5665,126.978],['대구',35.8714,128.6014],['부산',35.1796,129.0756],['도쿄',35.676,139.65],['오사카',34.6937,135.5023],['교토',35.0116,135.7681],['후쿠오카',33.5902,130.4017],['쓰시마',34.3,129.3]])L.marker([lat,lng],{pane:'offlineBase',interactive:false,keyboard:false,icon:L.divIcon({className:'offline-city-label',html:name,iconSize:[70,20]})}).addTo(layer);
   landReady=true;map.attributionControl.addAttribution('간략 지도: Natural Earth · 상세 도로: © OpenStreetMap contributors');
  }catch(_){}finally{loading=null;}})();
  if(loading)await loading;await refresh();
 }
 function invalidate(){loadedDay=null;if(owner&&owner.hasLayer(layer))refresh();}
 function hide(){request++;loadedDay=null;owner?.getContainer().classList.remove('offline-map-active');if(layer&&owner?.hasLayer(layer))owner.removeLayer(layer);if(roads&&owner?.hasLayer(roads))owner.removeLayer(roads);}
 window.OfflineMap={show,hide,refresh,invalidate};
})();
