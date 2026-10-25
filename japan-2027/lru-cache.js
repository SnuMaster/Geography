'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BoundedCache=api;})(globalThis,function(){
 class LRU{constructor(limit=6,maxWeight=16*1024*1024){this.limit=limit;this.maxWeight=maxWeight;this.items=new Map();this.weight=0;}has(k){return this.items.has(k);}get(k){const e=this.items.get(k);if(!e)return;this.items.delete(k);this.items.set(k,e);return e.value;}set(k,value,weight=1){this.delete(k);if(weight>this.maxWeight)return this;this.items.set(k,{value,weight});this.weight+=weight;while(this.items.size>this.limit||this.weight>this.maxWeight)this.delete(this.items.keys().next().value);return this;}delete(k){const e=this.items.get(k);if(e){this.weight-=e.weight;this.items.delete(k);}return !!e;}clear(){this.items.clear();this.weight=0;}get size(){return this.items.size;}}
 return {LRU};
});
