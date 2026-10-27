(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.OfflineStreetCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const intersects=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
 const rank={motorway:0,trunk:1,primary:2,secondary:3,tertiary:4,unclassified:5,residential:6,living_street:7,service:8,pedestrian:9,footway:10,steps:11,path:12,cycleway:13,crossing:14};
 function visibleChunks(manifest,bounds,zoom){return zoom<13?[]:(manifest?.chunks||[]).filter(c=>Array.isArray(c.bbox)&&intersects(c.bbox,bounds));}
 function visibleFeatures(features,bounds,zoom){if(zoom<13)return [];return features.filter(f=>intersects(f.bbox,bounds)&&(zoom>=15||!['footway','path','steps','crossing','cycleway','service'].includes(f.properties.class))).sort((a,b)=>(rank[a.properties.class]??8)-(rank[b.properties.class]??8)).slice(0,4000);}
 function roadStyle(feature,zoom){const kind=feature.properties.class,major=(rank[kind]??8)<=4,walking=['footway','pedestrian','path','steps','crossing','cycleway'].includes(kind);return {color:kind==='crossing'?'#819587':major?'#c5bc9d':walking?'#adb9a6':'#d0d4c8',weight:major?(zoom>=16?5:3):walking?(zoom>=16?1.8:1):zoom>=16?3:1.8,opacity:walking?.75:1,dashArray:kind==='steps'?'1 3':kind==='crossing'?'2 2':null,lineCap:'round',lineJoin:'round',interactive:false};}
 function inCoverage(manifest,lat,lng){const c=manifest?.coverage;if(!c)return false;const y=Math.floor(lat/c.latStep),x=Math.floor(lng/c.lngStep);return c.cells.some(p=>p[0]===y&&p[1]===x);}
 return {visibleChunks,visibleFeatures,roadStyle,inCoverage,intersects};
});
