'use strict';
(function(root){
 const ENDPOINT='https://api.frankfurter.dev/v2/rate/jpy/krw?providers=ecb',SOURCE='https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html',KEY='routebook-daily-exchange-v1';
 const dayKey=now=>new Date(now+32400000).toISOString().slice(0,10);
 function validRate(raw,now=Date.now(),checkedAt=now){
  if(!raw||raw.base!=='JPY'||raw.quote!=='KRW'||typeof raw.rate!=='number'||!Number.isFinite(raw.rate)||raw.rate<=0||raw.rate>1e6)throw Error('환율 자료 확인 실패');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(raw.date)||!Number.isFinite(Date.parse(raw.date+'T00:00:00Z'))||new Date(raw.date+'T00:00:00Z').toISOString().slice(0,10)!==raw.date||raw.date>dayKey(now))throw Error('환율 기준일 확인 실패');
  if(!Number.isFinite(checkedAt)||checkedAt<=0||checkedAt>now+300000)throw Error('환율 조회 시각 확인 실패');
  return {date:raw.date,base:'JPY',quote:'KRW',rate:raw.rate,checkedAt};
 }
 const format=rate=>new Intl.NumberFormat('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(rate*100);
 function createClient({fetcher=root.fetch?.bind(root),storage=null,now=()=>Date.now(),online=()=>root.navigator?.onLine!==false,notify=()=>{}}={}){
  let rate=null,pending=null,error='',retryAt=0;
  function restore(value){try{const item=JSON.parse(value);if(item?.v!==1)return false;const next=validRate(item,now(),item.checkedAt);if(rate&&next.checkedAt<rate.checkedAt)return false;rate=next;error='';return true;}catch{return false;}}
  try{restore(storage?.getItem(KEY));}catch{}
  const state=()=>({rate:rate?{...rate}:null,busy:!!pending,error,offline:!online()});
  const publish=()=>notify(state());
  async function refresh({force=false}={}){
   if(pending)return pending;
   if(!online()){publish();return rate?{...rate}:null;}
   if(!force&&((rate&&dayKey(rate.checkedAt)===dayKey(now()))||now()<retryAt)){publish();return rate?{...rate}:null;}
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);error='';retryAt=now()+300000;
   pending=(async()=>{try{
    const response=await fetcher(ENDPOINT,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer',cache:'no-cache'});
    if(!response.ok)throw Error('환율 조회 실패');const text=await response.text();if(text.length>4096)throw Error('환율 자료 크기 확인 실패');
    rate=validRate(JSON.parse(text),now());
    try{storage?.setItem(KEY,JSON.stringify({v:1,...rate}));}catch{}
    return {...rate};
   }catch{error='환율을 갱신하지 못했어요.';return rate?{...rate}:null;}
   finally{clearTimeout(timeout);pending=null;publish();}})();publish();return pending;
  }
  return {state,refresh,restore:value=>{const accepted=restore(value);if(accepted)publish();return accepted;}};
 }
 const core={ENDPOINT,SOURCE,KEY,dayKey,validRate,format,createClient};
 if(typeof module==='object'&&module.exports){module.exports=core;return;}
 let client,display,dialog,timer,initialized=false;
 const $=id=>document.getElementById(id),legacy=rate=>rate?{krwPerJpy:rate.rate,date:rate.date,checkedAt:new Date(rate.checkedAt).toISOString(),source:SOURCE,status:'ECB 기준환율 · 환전·카드 적용환율 아님'}:null;
 function render(state){
  if(!display)return;const rate=state.rate,saved=state.offline||!!state.error||(rate&&dayKey(rate.checkedAt)!==dayKey(Date.now()));
  display.dataset.state=state.offline?'offline':state.error?'error':rate?'ready':'loading';display.setAttribute('aria-busy',String(state.busy));
  const value=rate?'100엔 = '+format(rate.rate)+'원':state.offline?'저장된 환율 없음':state.error?'환율 확인 필요':'환율 불러오는 중';$('dailyExchangeValue').textContent=value;
  $('dailyExchangeBasis').textContent=rate?(saved?'저장값 · ':'')+rate.date.slice(5).replace('-','.')+' 고시':state.offline?'오프라인':'JPY / KRW · ECB';
  display.title=rate?'100엔 = '+format(rate.rate)+'원 · 고시일 '+rate.date+(saved?' · 저장값':'')+' · ECB 기준환율 · 자세히 보기':'엔화 환율 자세히 보기';
  display.setAttribute('aria-label',rate?value+' · 고시일 '+rate.date+(saved?' · 저장값':'')+' · 환율 자세히':value+' · 환율 자세히');
  $('dailyExchangeDetailValue').textContent=rate?'100엔 = '+format(rate.rate)+'원':'확인된 환율이 없어요.';
  $('dailyExchangeDate').textContent=rate?rate.date:'—';$('dailyExchangeChecked').textContent=rate?new Date(rate.checkedAt).toLocaleString('ko-KR',{timeZone:'Asia/Tokyo'}):'조회 기록 없음';
  $('dailyExchangeStatus').textContent=state.offline?'오프라인 · 마지막 저장값입니다.':state.error?state.error+(rate?' 마지막 저장값을 표시합니다.':' 연결 후 다시 확인해 주세요.'):state.busy?'최신 고시값을 확인하는 중…':'매일 확인 · 주말·휴일에는 최근 고시값을 표시합니다.';
  $('dailyExchangeRefresh').disabled=state.busy||state.offline;
  window.dispatchEvent(new CustomEvent('routebook:exchange',{detail:legacy(rate)}));
 }
 function init(){
  if(initialized)return;const header=document.querySelector('.topbar .header-actions');if(!header)return;initialized=true;
  display=document.createElement('button');display.id='dailyExchange';display.type='button';display.setAttribute('aria-label','엔화 환율 자세히');display.setAttribute('aria-haspopup','dialog');display.setAttribute('aria-controls','dailyExchangeDialog');display.innerHTML='<strong id="dailyExchangeValue" aria-hidden="true">환율 불러오는 중</strong><span id="dailyExchangeBasis" hidden></span>';header.after(display);
  const compact=matchMedia('(max-width:699px) and (min-height:501px)'),place=()=>{if(compact.matches)header.prepend(display);else header.after(display);};place();compact.addEventListener('change',place);
  dialog=document.createElement('dialog');dialog.id='dailyExchangeDialog';dialog.className='cc-dialog';dialog.setAttribute('aria-labelledby','dailyExchangeTitle');dialog.innerHTML='<header><h2 id="dailyExchangeTitle">오늘의 엔화 환율</h2><button type="button" id="dailyExchangeClose" aria-label="환율 창 닫기">×</button></header><div class="cc-dialog-body"><p class="exchange-detail-value" id="dailyExchangeDetailValue"></p><dl class="exchange-detail-facts"><dt>고시 기준일</dt><dd id="dailyExchangeDate"></dd><dt>마지막 조회 · 한국/일본</dt><dd id="dailyExchangeChecked"></dd></dl><p id="dailyExchangeStatus" role="status"></p><button type="button" id="dailyExchangeRefresh">환율 새로 확인</button><p>ECB 기준환율을 Frankfurter에서 조회합니다. 실제 환전·카드 결제 환율과 수수료는 다를 수 있어요.</p><a href="'+SOURCE+'" target="_blank" rel="noopener noreferrer">ECB 고시 자료 ↗</a><a href="https://frankfurter.dev/" target="_blank" rel="noopener noreferrer">환율 제공 · Frankfurter ↗</a></div>';document.body.append(dialog);
  let storage;try{storage=localStorage;}catch{}client=createClient({storage,notify:render});render(client.state());
  display.onclick=()=>{display.focus({preventScroll:true});RouteUI.showDialog(dialog);};$('dailyExchangeClose').onclick=()=>{dialog.close();RouteUI.release(dialog);};$('dailyExchangeRefresh').onclick=()=>client.refresh({force:true});
  const check=()=>{if(!document.hidden)client.refresh();};document.addEventListener('visibilitychange',check);window.addEventListener('online',()=>client.refresh());window.addEventListener('offline',()=>render(client.state()));window.addEventListener('storage',e=>{if(e.key===KEY)client.restore(e.newValue);});
  timer=setInterval(check,60000);window.addEventListener('pagehide',()=>{clearInterval(timer);timer=null;});window.addEventListener('pageshow',()=>{if(!timer)timer=setInterval(check,60000);check();});check();
 }
 root.DailyExchange={init,getRate:()=>legacy(client?.state().rate),refresh:async options=>{const rate=await client?.refresh(options);if(!rate)throw Error('확인된 환율이 없어요. 인터넷 연결 후 다시 확인해 주세요.');return legacy(rate);}};
})(globalThis);
