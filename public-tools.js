(() => {
  'use strict';

  const SUPABASE_URL='https://aplhddasduwtlxeejvnk.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY='sb_publishable_kUMRFC5dLAomRo9tiakqIg_Ob3j0ELs';
  if(!window.supabase?.createClient)return;

  const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'korgeo-public-tools-no-auth'}});
  function stableId(key){try{let value=localStorage.getItem(key);if(!value){value=(crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)+Date.now().toString(36));localStorage.setItem(key,value);}return value;}catch{return Math.random().toString(36).slice(2)+Date.now().toString(36);}}
  const visitorId=stableId('korgeo-visitor-id-v1');
  const signupClientKey=stableId('korgeo-signup-client-v1');
  const feedbackClientKey=stableId('korgeo-feedback-client-v1');
  const page=location.pathname.includes('/quiz/')?'quiz':'main';

  async function trackVisit(){try{await sb.rpc('track_public_visit',{p_session_id:visitorId,p_page:page});}catch{}}

  function bar(id,text,css,closable=true){
    if(!text||document.getElementById(id))return;
    const el=document.createElement('div');el.id=id;el.setAttribute('role','status');
    el.style.cssText='position:relative;z-index:9999;padding:10px 44px 10px 14px;text-align:center;font:700 14px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;'+css;
    const span=document.createElement('span');span.textContent=text;el.appendChild(span);
    if(closable){const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','닫기');close.style.cssText='position:absolute;right:10px;top:50%;transform:translateY(-50%);border:0;background:transparent;color:inherit;font-size:22px;cursor:pointer;padding:2px 7px';close.onclick=()=>el.remove();el.appendChild(close);}
    document.body.insertBefore(el,document.body.firstChild);
  }

  function renderAnnouncement(value){
    const old=document.getElementById('korgeoAnnouncement');if(old)old.remove();
    if(!value?.enabled||!String(value.text||'').trim())return;
    const level=['info','warn','urgent'].includes(value.level)?value.level:'info';
    const css=level==='urgent'?'background:#9f1d1d;color:#fff':level==='warn'?'background:#fff2bf;color:#6e4b00':'background:#dff1ff;color:#164875';
    bar('korgeoAnnouncement',String(value.text||''),css,true);
    const link=String(value.link||'').trim();
    if(link){const el=document.getElementById('korgeoAnnouncement');const a=document.createElement('a');a.textContent=' 자세히';a.href=link;a.rel='noopener';a.style.cssText='color:inherit;text-decoration:underline;margin-left:5px';el?.querySelector('span')?.appendChild(a);}
  }

  function setFeatureOverlay(disabled){
    let overlay=document.getElementById('korgeoFeatureDisabled');
    if(!disabled){overlay?.remove();return;}
    if(overlay)return;
    overlay=document.createElement('div');overlay.id='korgeoFeatureDisabled';
    overlay.style.cssText='position:fixed;inset:0;z-index:2147483640;background:#eef4f9;display:grid;place-items:center;padding:24px;font-family:system-ui;color:#102c4d';
    overlay.innerHTML=`<div style="max-width:520px;text-align:center;background:#fff;border:1px solid #d6e3ee;border-radius:18px;padding:28px;box-shadow:0 18px 60px #163f6820"><div style="font-size:42px">🛠️</div><h1 style="margin:10px 0 8px;font-size:24px">${page==='quiz'?'퀴즈':'학습 페이지'}를 잠시 닫아뒀어</h1><p style="margin:0;color:#637a8e;line-height:1.6">관리자가 이 기능을 일시적으로 중지한 상태야. 조금 뒤 다시 들어와줘.</p></div>`;
    document.body.appendChild(overlay);
  }

  function renderRuntime(v){
    window.korgeoRuntimeConfig=v||{};
    window.dispatchEvent(new CustomEvent('korgeo-runtime-config',{detail:window.korgeoRuntimeConfig}));
    const maint=document.getElementById('korgeoMaintenance');if(maint)maint.remove();
    const ro=document.getElementById('korgeoReadOnly');if(ro)ro.remove();
    if(v?.maintenance_enabled)bar('korgeoMaintenance',String(v.maintenance_text||'현재 사이트 점검 중입니다.'),'background:#2d3748;color:#fff',false);
    if(v?.read_only)bar('korgeoReadOnly','현재 읽기 전용 모드야 · 학습은 가능하지만 서버 기록 저장은 잠시 중지돼.','background:#5b3a00;color:#fff',false);
    setFeatureOverlay(page==='quiz'?v?.quiz_enabled===false:v?.main_enabled===false);
    if(v?.feedback_enabled===false){document.getElementById('korgeoFeedbackBtn')?.remove();document.getElementById('korgeoFeedbackModal')?.remove();}
    else renderFeedbackWidget();
  }

  async function loadPublicState(){
    try{
      const[a,r]=await Promise.all([sb.rpc('get_public_announcement'),sb.rpc('get_public_runtime_config')]);
      if(!a.error)renderAnnouncement(a.data);
      if(!r.error)renderRuntime(r.data);
    }catch{}
  }

  window.korgeoGetRuntimeConfig=async function(){try{const{data,error}=await sb.rpc('get_public_runtime_config');if(error)return window.korgeoRuntimeConfig||{};renderRuntime(data);return data||{};}catch{return window.korgeoRuntimeConfig||{};}};
  window.korgeoClaimSignupSlot=async function(){try{const{data,error}=await sb.rpc('claim_signup_slot',{p_client_key:signupClientKey});if(error||!data)return{allowed:true,retry_after:0};return data;}catch{return{allowed:true,retry_after:0};}};
  window.korgeoSubmitFeedback=async function(category,message){try{const{data,error}=await sb.rpc('submit_feedback',{p_client_key:feedbackClientKey,p_page:page,p_category:category,p_message:message});if(error)throw error;return data||{ok:false};}catch(e){return{ok:false,error:e?.message||'failed'};}};

  function renderFeedbackWidget(){
    if(window.korgeoRuntimeConfig?.feedback_enabled===false||document.getElementById('korgeoFeedbackBtn'))return;
    const btn=document.createElement('button');btn.id='korgeoFeedbackBtn';btn.type='button';btn.textContent='오류·건의';btn.style.cssText='position:fixed;right:16px;bottom:16px;z-index:9998;border:0;border-radius:999px;padding:9px 12px;background:#163f68;color:#fff;font:800 12px system-ui;box-shadow:0 5px 18px #102c4d35;cursor:pointer';
    const modal=document.createElement('div');modal.id='korgeoFeedbackModal';modal.hidden=true;modal.style.cssText='position:fixed;inset:0;z-index:10000;background:#0007;display:none;place-items:center;padding:18px';
    const card=document.createElement('div');card.style.cssText='width:min(440px,100%);background:#fff;border-radius:16px;padding:16px;box-shadow:0 20px 60px #0005;color:#102c4d;font-family:system-ui';
    card.innerHTML='<div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><b>오류·건의 보내기</b><button id="korgeoFeedbackClose" type="button" style="border:0;background:transparent;color:#102c4d;font-size:22px;line-height:1;cursor:pointer;padding:4px 8px">×</button></div><select id="korgeoFeedbackCategory" style="width:100%;margin-top:12px;padding:9px;border:1px solid #afc4d8;border-radius:9px"><option value="feedback">건의</option><option value="bug">오류 제보</option><option value="data">지도/정답 데이터 오류</option></select><textarea id="korgeoFeedbackText" maxlength="1000" placeholder="어디가 이상한지 적어줘. (2~1000자)" style="width:100%;min-height:120px;margin-top:9px;padding:10px;border:1px solid #afc4d8;border-radius:9px;resize:vertical;font:inherit"></textarea><button id="korgeoFeedbackSend" type="button" style="width:100%;margin-top:9px;border:0;border-radius:9px;padding:10px;background:#1769aa;color:#fff;font-weight:800;cursor:pointer">보내기</button><p id="korgeoFeedbackStatus" style="min-height:1.3em;margin:8px 0 0;font-size:12px;font-weight:700"></p>';
    modal.appendChild(card);document.body.append(btn,modal);
    const close=()=>{modal.hidden=true;modal.style.display='none';};
    const open=()=>{modal.hidden=false;modal.style.display='grid';};
    btn.onclick=open;
    card.querySelector('#korgeoFeedbackClose').onclick=close;
    modal.onclick=e=>{if(e.target===modal)close();};
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)close();});
    card.querySelector('#korgeoFeedbackSend').onclick=async()=>{
      const send=card.querySelector('#korgeoFeedbackSend');const status=card.querySelector('#korgeoFeedbackStatus');const text=card.querySelector('#korgeoFeedbackText').value.trim();const category=card.querySelector('#korgeoFeedbackCategory').value;
      if(text.length<2){status.textContent='내용을 2자 이상 적어줘.';return;}
      send.disabled=true;status.textContent='보내는 중…';const result=await window.korgeoSubmitFeedback(category,text);
      if(result?.ok){status.textContent='접수 완료. 고마워!';card.querySelector('#korgeoFeedbackText').value='';setTimeout(close,900);}
      else if(result?.error==='rate_limited')status.textContent='제보를 너무 많이 보냈어. 조금 뒤 다시 해줘.';
      else if(result?.error==='feedback_disabled')status.textContent='현재 제보 접수를 잠시 닫아둔 상태야.';
      else status.textContent='전송 실패. 잠시 후 다시 해줘.';
      send.disabled=false;
    };
  }

  trackVisit();
  const boot=()=>loadPublicState();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
