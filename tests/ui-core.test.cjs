'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),UI=require('../japan-2027/ui-core.js');
test('popup content budget leaves room for chrome within map and viewport',()=>{for(const [map,viewport] of [[420,568],[506,844],[600,1024],[700,936]]){const h=UI.popupMaxHeight(map,viewport);assert.ok(h+190<=map);assert.ok(h+180<=viewport);}});
test('tracking clearance follows actual card height, including wrapped text',()=>{assert.equal(UI.miniClearance(72),100);assert.equal(UI.miniClearance(105.2),134);});
