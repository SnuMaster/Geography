'use strict';
(async()=>{
 // Only this explicit test frame uses simulated storage/clock/network latency.
 const qa=parent.stateQA;if(!qa){document.body.textContent='상태 검증 페이지에서 실행하세요.';return;}
 Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>qa.storage.get(k)||null,setItem:(k,v)=>qa.storage.set(k,String(v)),removeItem:k=>qa.storage.delete(k)}});
 const NativeDate=Date;window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[qa.clock??NativeDate.now()]));}static now(){return qa.clock??NativeDate.now();}};
 const nativeFetch=window.fetch.bind(window);
 window.fetch=async(url,options)=>{if(qa.delayFile&&String(url).startsWith(qa.delayFile))await new Promise(resolve=>setTimeout(resolve,qa.delayMs||1800));return nativeFetch(url,options);};
 const response=await nativeFetch('../index.html'),html=await response.text();document.open();document.write(html.replace('<head>','<head><base href="../">'+(Number.isFinite(qa.safeBottom)?'<style>:root{--safe-bottom:'+qa.safeBottom+'px!important}</style>':'')));document.close();
})();
