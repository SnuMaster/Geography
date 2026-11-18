'use strict';
// Presentation only: keep source data, input values and stored ISO currency codes intact.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.CurrencyDisplay=api;api.init(document);}})(globalThis,function(){
 function text(value){return String(value??'')
  .replace(/엔\s*\(\s*(?:JPY|(?:JP)?¥)\s*\)/g,'JP¥')
  .replace(/\bJPY\b/g,'JP¥')
  .replace(/(?<!JP)¥/g,'JP¥')
  .replace(/엔화/g,'JP¥')
  .replace(/(\d[\d,.]*(?:천|만|억)?)\s*[엔円]/g,'$1 JP¥')
  .replace(/(^|[\s·/([{:<])엔(?=$|[\s·/()\]>,:은는을와과의에로으이당])/g,'$1JP¥');}
 let observer;
 function refresh(node){
  if(!node)return;
  if(node.nodeType===3){const parent=node.parentElement;if(!parent||parent.closest('script,style,textarea,pre,code,[contenteditable]'))return;const old=node.data,next=text(old);if(old!==next){const option=parent.closest('option');if(option&&!option.hasAttribute('value'))option.setAttribute('value',option.value);node.data=next;}return;}
  if(node.nodeType!==1&&node.nodeType!==9)return;
  if(node.nodeType===1){if(node.matches('script,style,textarea,pre,code,[contenteditable]'))return;for(const attr of ['title','aria-label','placeholder'])if(node.hasAttribute(attr)){const old=node.getAttribute(attr),next=text(old);if(old!==next)node.setAttribute(attr,next);}if(node.matches('input'))return;}
  for(const child of node.childNodes)refresh(child);
 }
 function init(doc){if(observer||!doc.body)return;refresh(doc.body);observer=new MutationObserver(records=>{for(const r of records){if(r.type==='childList'){for(const node of r.addedNodes)refresh(node);}else refresh(r.target);}});observer.observe(doc.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['title','aria-label','placeholder']});for(const event of ['routebook:state','routebook:personal-change','routebook:reservation-change'])window.addEventListener(event,()=>refresh(doc.body));}
 return {text,refresh,init};
});
