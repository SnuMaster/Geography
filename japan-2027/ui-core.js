'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RouteUICore=api;})(globalThis,function(){
 function popupMaxHeight(mapHeight,viewportHeight){return Math.max(60,Math.min(480,mapHeight-190,viewportHeight-180));}
 function miniClearance(height){return Math.max(0,Math.ceil(height))+28;}
 return Object.freeze({popupMaxHeight,miniClearance});
});
