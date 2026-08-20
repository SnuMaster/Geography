(() => {
  'use strict';
  const SUPABASE_URL='https://aplhddasduwtlxeejvnk.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY='sb_publishable_kUMRFC5dLAomRo9tiakqIg_Ob3j0ELs';
  const USER_DOMAIN='users.korgeo.app';
  const USERNAME_RE=/^[a-z0-9._-]{3,24}$/;
  const $=id=>document.getElementById(id);

  function ensurePublicTools(){if(window.korgeoClaimSignupSlot)return Promise.resolve();return new Promise(resolve=>{if(document.querySelector('script[data-korgeo-public-tools]')){const timer=setInterval(()=>{if(window.korgeoClaimSignupSlot){clearInterval(timer);resolve();}},50);setTimeout(()=>{clearInterval(timer);resolve();},2500);return;}const script=document.createElement('script');script.src='../public-tools.js?v=20260820-public-v4';script.dataset.korgeoPublicTools='1';script.onload=script.onerror=resolve;document.head.appendChild(script);});}

  function boot(){
    const usernameInput=$('quizUsername')||$('quizEmail');const loginBtn=$('quizLoginBtn');const signupBtn=$('quizSignupBtn');const loggedOut=$('quizLoggedOut');const accountName=$('quizAccountEmail');const status=$('quizAuthStatus');if(!usernameInput||!loginBtn||!loggedOut||!status||!window.supabase?.createClient)return;
    const authClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);void ensurePublicTools();
    usernameInput.id='quizUsername';usernameInput.type='text';usernameInput.autocomplete='username';usernameInput.placeholder='아이디';usernameInput.minLength=3;usernameInput.maxLength=24;usernameInput.setAttribute('autocapitalize','none');usernameInput.setAttribute('spellcheck','false');
    const fields=usernameInput.closest('.auth-fields');let passwordInput=$('quizPassword');if(!passwordInput){passwordInput=document.createElement('input');passwordInput.id='quizPassword';passwordInput.type='password';passwordInput.autocomplete='current-password';passwordInput.placeholder='비밀번호 (6자 이상)';passwordInput.minLength=6;fields.appendChild(passwordInput);}
    const intro=loggedOut.querySelector('p');if(intro)intro.textContent='아이디와 비밀번호로 로그인하면 오답이 계정에 저장돼.';loginBtn.textContent='로그인';
    let actualSignupBtn=signupBtn;if(!actualSignupBtn){actualSignupBtn=document.createElement('button');actualSignupBtn.id='quizSignupBtn';actualSignupBtn.type='button';actualSignupBtn.textContent='회원가입';loginBtn.parentElement.appendChild(actualSignupBtn);}
    function credentials(){const username=usernameInput.value.trim().toLowerCase();const password=passwordInput.value;if(!username||!password)return{error:'아이디와 비밀번호를 둘 다 입력해줘.'};if(!USERNAME_RE.test(username))return{error:'아이디는 영문 소문자, 숫자, 점(.), 밑줄(_), 하이픈(-)으로 3~24자만 가능해.'};if(password.length<6)return{error:'비밀번호는 6자 이상으로 만들어줘.'};return{username,password,email:`${username}@${USER_DOMAIN}`};}
    function setStatus(message,state=''){status.textContent=message;status.dataset.state=state;}
    function displayName(user){return user?.user_metadata?.username||String(user?.email||'').replace(/@users\.korgeo\.app$/i,'');}
    async function enforceAccess(user){if(!user)return true;try{const{data,error}=await authClient.rpc('get_my_access_state');if(error)return true;if(data?.suspended){const reason=String(data.reason||'').trim();await authClient.auth.signOut();setStatus('이용정지된 계정이야.'+(reason?' 사유: '+reason:''),'error');return false;}}catch{}return true;}

    loginBtn.onclick=async()=>{const c=credentials();if(c.error)return setStatus(c.error,'error');setStatus('로그인 중…');const{data,error}=await authClient.auth.signInWithPassword({email:c.email,password:c.password});if(error)return setStatus('로그인 실패 · 아이디 또는 비밀번호를 확인해줘.','error');if(await enforceAccess(data?.user))setStatus('로그인 완료 · 오답노트를 불러오는 중이야.','success');};

    actualSignupBtn.onclick=async()=>{const c=credentials();if(c.error)return setStatus(c.error,'error');actualSignupBtn.disabled=true;setStatus('회원가입 확인 중…');try{await ensurePublicTools();const slot=window.korgeoClaimSignupSlot?await window.korgeoClaimSignupSlot():{allowed:true};if(!slot.allowed){if(slot.registration_disabled)return setStatus('현재 관리자가 신규 회원가입을 잠시 꺼둔 상태야.','error');const sec=Math.max(1,Number(slot.retry_after||60));return setStatus(`가입 시도가 너무 많아. 약 ${Math.ceil(sec/60)}분 뒤 다시 해줘.`,'error');}setStatus('회원가입 중…');const{data,error}=await authClient.auth.signUp({email:c.email,password:c.password,options:{data:{username:c.username}}});if(error){const duplicate=/already|registered|exists/i.test(error.message||'');return setStatus(duplicate?'이미 사용 중인 아이디야.':'회원가입 실패: '+error.message,'error');}if(data.session){if(await enforceAccess(data.user))setStatus('회원가입 완료 · 바로 로그인됐어.','success');}else setStatus('가입은 됐지만 로그인 세션이 없어. Confirm email 설정을 확인해줘.','error');}finally{setTimeout(()=>{actualSignupBtn.disabled=false;},3000);}};

    passwordInput.addEventListener('keydown',event=>{if(event.key==='Enter')loginBtn.click();});
    authClient.auth.onAuthStateChange((_event,session)=>{const user=session?.user||null;if(user&&accountName)accountName.textContent=displayName(user);if(user)setTimeout(()=>void enforceAccess(user),0);});
    authClient.auth.getSession().then(({data})=>{const user=data.session?.user;if(user&&accountName)accountName.textContent=displayName(user);if(user)void enforceAccess(user);});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
