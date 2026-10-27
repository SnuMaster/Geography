(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.NavigationScreen=api.create({navigator:root.navigator,document:root.document,onChange:()=>root.dispatchEvent(new Event('routebook:screen-lock'))});})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function create({navigator,document,onChange=()=>{}}){
  let wanted=false,lock=null,pending=null,generation=0,status='off';
  const supported=()=>typeof navigator?.wakeLock?.request==='function',notify=()=>onChange(state());
  function state(){return {wanted,held:!!lock&&!lock.released,supported:supported(),status};}
  function release(value){if(value&&!value.released)try{Promise.resolve(value.release()).catch(()=>{});}catch(_){} }
  function request(){
   if(!wanted)return Promise.resolve(false);
   if(!supported()){status='unsupported';notify();return Promise.resolve(false);}
   if(document.hidden){status='paused';notify();return Promise.resolve(false);}
   if(lock&&!lock.released)return Promise.resolve(true);
   if(pending)return pending;
   const current=++generation;status='requesting';notify();let result;
   try{result=navigator.wakeLock.request('screen');}catch(_){status='blocked';notify();return Promise.resolve(false);}
   const task=Promise.resolve(result).then(value=>{
    if(!wanted||document.hidden||current!==generation){release(value);return false;}
    lock=value;status='held';value.addEventListener('release',()=>{if(lock!==value)return;lock=null;status=wanted?(document.hidden?'paused':'released'):'off';notify();});notify();return true;
   },()=>{if(current===generation&&wanted){status='blocked';notify();}return false;});
   pending=task;task.finally(()=>{if(pending===task)pending=null;});return task;
  }
  function start(){wanted=true;return request();}
  function stop(){wanted=false;generation++;pending=null;const value=lock;lock=null;status='off';release(value);notify();}
  function toggle(){return wanted&&(lock||pending)?(stop(),Promise.resolve(false)):start();}
  document.addEventListener('visibilitychange',()=>{if(!wanted)return;if(document.hidden){generation++;pending=null;const value=lock;lock=null;status='paused';release(value);notify();}else request();});
  return {start,stop,toggle,state};
 }
 return {create};
});
