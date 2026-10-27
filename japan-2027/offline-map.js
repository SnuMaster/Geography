'use strict';
(function(){
 let layer=null,roads=null,labels=null,renderer=null,owner=null,landReady=false,manifest=null,loading=null,frame=null,roadsKey='',statusNode=null;
 const chunks=new Map(),pending=new Map();
 const stored=path=>navigator.onLine?TravelStore.readJson(path+'?v='+TravelStore.VERSION,{preferCache:true,timeout:3000}):TravelStore.readCachedJson(path+'?v='+TravelStore.VERSION);
 const bounds=()=>{const b=owner.getBounds().pad(.12);return [b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];};
 const isVisible=()=>owner?.getContainer().classList.contains('offline-map-active');
 function status(text){if(statusNode)statusNode.textContent=text;}
 function streetLabels(features){
  labels.clearLayers();if(owner.getZoom()<16)return;
  const placed=[],names=new Set(),size=owner.getSize();
  for(const feature of features){
   const name=feature.properties.name;if(!name||names.has(name)||feature.geometry.type!=='LineString')continue;
   const cs=feature.geometry.coordinates,p=cs[Math.floor(cs.length/2)],pixel=owner.latLngToContainerPoint([p[1],p[0]]);
   if(pixel.x<35||pixel.y<65||pixel.x>size.x-35||pixel.y>size.y-100||placed.some(q=>Math.abs(q.x-pixel.x)<100&&Math.abs(q.y-pixel.y)<60))continue;
   const node=document.createElement('span');node.textContent=name;L.marker([p[1],p[0]],{pane:'offlineStreets',interactive:false,keyboard:false,icon:L.divIcon({className:'offline-street-label',html:node,iconSize:[100,18],iconAnchor:[50,9]})}).addTo(labels);names.add(name);placed.push(pixel);if(placed.length>=16)break;
  }
 }
 function drawStreets(){
  if(!isVisible()||!manifest)return;
  const box=bounds(),zoom=owner.getZoom(),files=OfflineStreetCore.visibleChunks(manifest,box,zoom),features=OfflineStreetCore.visibleFeatures(files.flatMap(f=>chunks.get(f.file)?.features||[]),box,zoom);
  owner.getContainer().dataset.offlineRoads=String(features.filter(f=>f.geometry.type==='LineString').length);owner.getContainer().dataset.offlineCrossings=String(features.filter(f=>f.properties.class==='crossing').length);
  const key=zoom.toFixed(2)+'|'+features.map(f=>f.id).join(',');
  if(key!==roadsKey){roadsKey=key;roads.clearLayers();L.geoJSON({type:'FeatureCollection',features},{pane:'offlineStreets',renderer,interactive:false,style:f=>OfflineStreetCore.roadStyle(f,zoom),pointToLayer:(f,ll)=>L.circleMarker(ll,{pane:'offlineStreets',renderer,radius:zoom>=17?2.5:1.8,color:'#849586',weight:1,fillColor:'#fff',fillOpacity:1,interactive:false})}).addTo(roads);}
  streetLabels(features);const center=owner.getCenter();status(zoom<13?'저장된 도로는 확대하면 보여요':!OfflineStreetCore.inCoverage(manifest,center.lat,center.lng)?'도로 저장 범위 밖 · 이동 경로는 계속 표시':files.some(f=>!chunks.has(f.file))?'저장된 도로 지도 확인 중…':'저장된 도로·보행로 지도');
 }
 async function updateStreets(){
  if(!isVisible()||!manifest)return;drawStreets();const files=OfflineStreetCore.visibleChunks(manifest,bounds(),owner.getZoom()).filter(f=>!chunks.has(f.file));let cursor=0;
  const work=async()=>{while(cursor<files.length){const file=files[cursor++].file;if(chunks.has(file))continue;if(!pending.has(file)){const task=stored(file).then(value=>{chunks.set(file,value);},()=>{}).finally(()=>pending.delete(file));pending.set(file,task);}await pending.get(file);}};
  await Promise.all([work(),work(),work()]);drawStreets();
 }
 function schedule(){if(!isVisible())return;if(frame!==null)cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{frame=null;updateStreets();});}
 async function show(map){
  owner=map;map.getContainer().classList.add('offline-map-active');
  if(!layer){
   const pane=map.getPane('offlineBase')||map.createPane('offlineBase');pane.style.zIndex='210';pane.style.pointerEvents='none';const streetPane=map.getPane('offlineStreets')||map.createPane('offlineStreets');streetPane.style.zIndex='220';streetPane.style.pointerEvents='none';
   layer=L.layerGroup().addTo(map);roads=L.layerGroup().addTo(layer);labels=L.layerGroup().addTo(layer);renderer=L.canvas({pane:'offlineStreets',padding:.25});map.on('moveend zoomend',schedule);
   statusNode=document.createElement('div');statusNode.className='offline-street-status';statusNode.setAttribute('role','status');map.getContainer().append(statusNode);
   map.attributionControl.addAttribution('<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a> · <a href="assets/maps/offline-streets/index.json" target="_blank">ODbL 도로 자료</a>');
  }
  if(!map.hasLayer(layer))layer.addTo(map);
  if(loading){await loading;schedule();return;}
  loading=(async()=>{
   await Promise.allSettled([
    landReady?Promise.resolve():stored('assets/maps/offline-land.json').then(land=>{L.geoJSON(land,{pane:'offlineBase',interactive:false,style:{color:'#b5c5b5',weight:1,fillColor:'#f4f4e9',fillOpacity:1}}).addTo(layer);landReady=true;map.attributionControl.addAttribution('해안선: Natural Earth · Public domain');}),
    manifest?Promise.resolve():stored('assets/maps/offline-streets/index.json').then(value=>{manifest=value;})
   ]);
   if(!manifest)status('도로 지도가 저장되지 않았어요 · 온라인에서 전체 자료 저장');await updateStreets();
  })().finally(()=>{loading=null;});return loading;
 }
 function hide(){owner?.getContainer().classList.remove('offline-map-active');if(frame!==null)cancelAnimationFrame(frame);frame=null;if(layer&&owner?.hasLayer(layer))owner.removeLayer(layer);}
 window.OfflineMap={show,hide};
})();
