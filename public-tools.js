(() => {
  'use strict';

  const SUPABASE_URL = 'https://aplhddasduwtlxeejvnk.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_kUMRFC5dLAomRo9tiakqIg_Ob3j0ELs';
  if (!window.supabase?.createClient) return;

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false, storageKey:'korgeo-public-tools-no-auth' }
  });

  function stableId(key){try{let value=localStorage.getItem(key);if(!value){value=(crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)+Date.now().toString(36));localStorage.setItem(key,value);}return value;}catch{return Math.random().toString(36).slice(2)+Date.now().toString(36);}}
  const visitorId=stableId('korgeo-visitor-id-v1');
  const signupClientKey=stableId('korgeo-signup-client-v1');
  const page=location.pathname.includes('/quiz/')?'quiz':'main';

  async function trackVisit(){try{await sb.rpc('track_public_visit',{p_session_id:visitorId,p_page:page});}catch{}}

  function bar(id,text,css,closable=true){if(!text||document.getElementById(id))return;const el=document.createElement('div');el.id=id;el.setAttribute('role','status');el.style.cssText='position:relative;z-index:9999;padding:10px 44px 10px 14px;text-align:center;font:700 14px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;'+css;const span=document.createElement('span');span.textContent=text;el.appendChild(span);if(closable){const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','닫기');close.style.cssText='position:absolute;right:10px;top:50%;transform:translateY(-50%);border:0;background:transparent;color:inherit;font-size:22px;cursor:pointer;padding:2px 7px';close.onclick=()=>el.remove();el.appendChild(close);}document.body.insertBefore(el,document.body.firstChild);}

  function renderAnnouncement(value){if(!value?.enabled||!String(value.text||'').trim())return;const level=['info','warn','urgent'].includes(value.level)?value.level:'info';const css=level==='urgent'?'background:#9f1d1d;color:#fff':level==='warn'?'background:#fff2bf;color:#6e4b00':'background:#dff1ff;color:#164875';if(document.getElementById('korgeoAnnouncement'))return;bar('korgeoAnnouncement',String(value.text||''),css,true);const link=String(value.link||'').trim();if(link){const el=document.getElementById('korgeoAnnouncement');const a=document.createElement('a');a.textContent=' 자세히';a.href=link;a.rel='noopener';a.style.cssText='color:inherit;text-decoration:underline;margin-left:5px';el?.querySelector('span')?.appendChild(a);}}

  function renderRuntime(v){window.korgeoRuntimeConfig=v||{};window.dispatchEvent(new CustomEvent('korgeo-runtime-config',{detail:window.korgeoRuntimeConfig}));if(v?.maintenance_enabled){bar('korgeoMaintenance',String(v.maintenance_text||'현재 사이트 점검 중입니다.'),'background:#2d3748;color:#fff',false);}}

  async function loadPublicState(){try{const [a,r]=await Promise.all([sb.rpc('get_public_announcement'),sb.rpc('get_public_runtime_config')]);if(!a.error)renderAnnouncement(a.data);if(!r.error)renderRuntime(r.data);}catch{}}

  window.korgeoGetRuntimeConfig=async function(){try{const {data,error}=await sb.rpc('get_public_runtime_config');if(error)return window.korgeoRuntimeConfig||{};renderRuntime(data);return data||{};}catch{return window.korgeoRuntimeConfig||{};}};
  window.korgeoClaimSignupSlot=async function(){try{const {data,error}=await sb.rpc('claim_signup_slot',{p_client_key:signupClientKey});if(error||!data)return{allowed:true,retry_after:0};return data;}catch{return{allowed:true,retry_after:0};}};

  trackVisit();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadPublicState,{once:true});else loadPublicState();
})();
