'use strict';
(async()=>{
 // Only this explicit test frame uses simulated storage/clock/network latency.
 const qa=parent.stateQA;if(!qa){document.body.textContent='상태 검증 페이지에서 실행하세요.';return;}
 Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>qa.storage.get(k)||null,setItem:(k,v)=>qa.storage.set(k,String(v)),removeItem:k=>qa.storage.delete(k)}});
 qa.sessionStorage??=new Map();Object.defineProperty(window,'sessionStorage',{configurable:true,value:{getItem:k=>qa.sessionStorage.get(k)||null,setItem:(k,v)=>qa.sessionStorage.set(k,String(v)),removeItem:k=>qa.sessionStorage.delete(k)}});
 const NativeDate=Date;window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[qa.clock??NativeDate.now()]));}static now(){return qa.clock??NativeDate.now();}};
 if(qa.mockGPS){Object.defineProperty(window,'isSecureContext',{value:true,configurable:true});Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition:(fn,error)=>{qa.gpsReceiver=fn;qa.gpsError=error;return 17;},clearWatch:()=>{qa.gpsReceiver=null;qa.gpsError=null;},getCurrentPosition:(fn,error)=>{qa.freshCalls=(qa.freshCalls||0)+1;qa.freshReceiver=fn;qa.freshError=error;}}});}
 if(qa.mockOrientation){Object.defineProperty(window,'DeviceOrientationEvent',{configurable:true,value:{requestPermission:absolute=>{qa.orientationCalls=(qa.orientationCalls||0)+1;qa.absolutePermission=absolute;return qa.orientationResult==='pending'?new Promise(resolve=>qa.resolveOrientation=resolve):Promise.resolve(qa.orientationResult||'granted');}}});}
 if(qa.mockWakeLock){const wake=qa.wake={requests:0,releases:0,resolvers:[],locks:[]};const make=()=>{const lock=new EventTarget();lock.released=false;lock.release=()=>{if(!lock.released){lock.released=true;wake.releases++;lock.dispatchEvent(new Event('release'));}return Promise.resolve();};wake.locks.push(lock);return lock;};Object.defineProperty(navigator,'wakeLock',{configurable:true,value:{request:type=>{wake.requests++;if(type!=='screen'||qa.wakeMode==='deny')return Promise.reject(Error('NotAllowedError'));return qa.wakeMode==='pending'?new Promise(resolve=>wake.resolvers.push(()=>resolve(make()))):Promise.resolve(make());}}});}
 Object.defineProperty(document,'hidden',{configurable:true,get:()=>!!qa.hidden});
 const nativeFetch=window.fetch.bind(window);
 window.fetch=async(url,options)=>{if(qa.networkBlocked)throw Error('QA offline');if(qa.delayFile&&String(url).startsWith(qa.delayFile))await new Promise(resolve=>setTimeout(resolve,qa.delayMs||1800));return nativeFetch(url,options);};
 window.addEventListener('error',e=>qa.errors?.push(e.message));window.addEventListener('unhandledrejection',e=>qa.errors?.push(String(e.reason)));
 const response=await nativeFetch('../index.html'),html=await response.text();document.open();document.write(html.replace('<head>','<head><base href="../">'+(Number.isFinite(qa.safeBottom)?'<style>:root{--safe-bottom:'+qa.safeBottom+'px!important}</style>':'')));document.close();
})();
