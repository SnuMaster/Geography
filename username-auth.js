(() => {
  'use strict';
  const USER_DOMAIN='users.korgeo.app';
  const USERNAME_RE=/^[a-z0-9._-]{3,24}$/;
  const TURNSTILE_SITE_KEY='0x4AAAAAAAEWxvCtzvng0Tn8-';
  const $=id=>document.getElementById(id);

  function ensurePublicTools(){if(window.korgeoClaimSignupSlot)return Promise.resolve();return new Promise(resolve=>{if(document.querySelector('script[data-korgeo-public-tools]')){const timer=setInterval(()=>{if(window.korgeoClaimSignupSlot){clearInterval(timer);resolve();}},50);setTimeout(()=>{clearInterval(timer);resolve();},2500);return;}const script=document.createElement('script');script.src='./public-tools.js?v=20260820-public-v5';script.dataset.korgeoPublicTools='1';script.onload=script.onerror=resolve;document.head.appendChild(script);});}
  void ensurePublicTools();

  const usernameInput=$('email');const passwordInput=$('password');const loginBtn=$('loginBtn');const signupBtn=$('signupBtn');const account=$('account');
  if(!usernameInput||!passwordInput||!loginBtn||!signupBtn||!account||typeof supabaseClient==='undefined')return;
  const usernameLabel=document.querySelector('label[for="email"]');const passwordLabel=document.querySelector('label[for="password"]');
  if(usernameLabel)usernameLabel.textContent='아이디';usernameInput.type='text';usernameInput.placeholder='영문 소문자·숫자 3~24자';usernameInput.autocomplete='username';usernameInput.setAttribute('autocapitalize','none');usernameInput.setAttribute('spellcheck','false');usernameInput.minLength=3;usernameInput.maxLength=24;

  let captchaToken='';
  let captchaWidgetId=null;
  let captchaWrap=null;
  let turnstileReadyPromise=null;

  function ensureTurnstile(){
    if(turnstileReadyPromise)return turnstileReadyPromise;
    turnstileReadyPromise=new Promise(resolve=>{
      const render=()=>{
        if(!window.turnstile){resolve(false);return;}
        if(!captchaWrap){
          captchaWrap=document.createElement('div');
          captchaWrap.id='korgeoTurnstileMain';
          captchaWrap.style.cssText='margin:10px 0;min-height:65px;display:flex;justify-content:center;';
          const parent=passwordInput.parentElement||passwordInput;
          parent.insertAdjacentElement('afterend',captchaWrap);
        }
        if(captchaWidgetId===null){
          try{
            captchaWidgetId=window.turnstile.render(captchaWrap,{
              sitekey:TURNSTILE_SITE_KEY,
              theme:'auto',
              callback:token=>{captchaToken=token||'';},
              'expired-callback':()=>{captchaToken='';},
              'error-callback':()=>{captchaToken='';}
            });
          }catch{resolve(false);return;}
        }
        resolve(true);
      };
      if(window.turnstile){render();return;}
      let script=document.querySelector('script[data-korgeo-turnstile]');
      if(!script){
        script=document.createElement('script');
        script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async=true;script.defer=true;script.dataset.korgeoTurnstile='1';
        document.head.appendChild(script);
      }
      script.addEventListener('load',render,{once:true});
      script.addEventListener('error',()=>resolve(false),{once:true});
      setTimeout(()=>{if(window.turnstile)render();else resolve(false);},5000);
    });
    return turnstileReadyPromise;
  }

  async function requireCaptcha(){
    await ensureTurnstile();
    if(!captchaToken){account.textContent='사람인지 확인하는 보안 확인을 먼저 완료해줘.';return null;}
    return captchaToken;
  }
  function resetCaptcha(){
    captchaToken='';
    if(window.turnstile&&captchaWidgetId!==null){try{window.turnstile.reset(captchaWidgetId);}catch{}}
  }
  void ensureTurnstile();

  function parseUsername(email){if(!email)return'';const suffix='@'+USER_DOMAIN;return email.endsWith(suffix)?email.slice(0,-suffix.length):email.split('@')[0];}
  function credentials(){const username=usernameInput.value.trim().toLowerCase();const password=passwordInput.value;if(!username||!password)return{error:'아이디와 비밀번호를 둘 다 입력해줘.'};if(!USERNAME_RE.test(username))return{error:'아이디는 영문 소문자, 숫자, 점(.), 밑줄(_), 하이픈(-)만 써서 3~24자로 만들어줘.'};if(password.length<6)return{error:'비밀번호는 6자 이상으로 만들어줘.'};return{username,password,email:`${username}@${USER_DOMAIN}`};}
  function renderUsernameSession(user){const loggedIn=Boolean(user);if(usernameLabel)usernameLabel.hidden=loggedIn;if(passwordLabel)passwordLabel.hidden=loggedIn;if(captchaWrap)captchaWrap.style.display=loggedIn?'none':'flex';if(loggedIn){const username=user.user_metadata?.username||parseUsername(user.email);account.textContent=`${username} 아이디로 로그인됨 · 모든 기기에서 같은 기록을 사용해.`;}else account.textContent='아이디와 비밀번호로 로그인하면 모든 기기에서 같은 기록을 사용해.';}
  async function enforceAccess(user){if(!user)return true;try{const{data,error}=await supabaseClient.rpc('get_my_access_state');if(error)return true;if(data?.suspended){const reason=String(data.reason||'').trim();await supabaseClient.auth.signOut();account.textContent='이용정지된 계정이야.'+(reason?' 사유: '+reason:'');return false;}}catch{}return true;}

  loginBtn.onclick=async()=>{
    const c=credentials();if(c.error){account.textContent=c.error;return;}
    const token=await requireCaptcha();if(!token)return;
    account.textContent='로그인 중…';
    try{
      const{data,error}=await supabaseClient.auth.signInWithPassword({email:c.email,password:c.password,options:{captchaToken:token}});
      if(error){account.textContent=/captcha/i.test(error.message||'')?'보안 확인이 만료됐어. 다시 확인해줘.':'로그인 실패 · 아이디 또는 비밀번호를 확인해줘.';return;}
      if(await enforceAccess(data?.user))account.textContent='로그인 완료 · 기록을 불러오는 중이야.';
    }finally{resetCaptcha();}
  };

  signupBtn.onclick=async()=>{
    const c=credentials();if(c.error){account.textContent=c.error;return;}
    const token=await requireCaptcha();if(!token)return;
    signupBtn.disabled=true;account.textContent='회원가입 확인 중…';
    try{
      await ensurePublicTools();
      const slot=window.korgeoClaimSignupSlot?await window.korgeoClaimSignupSlot():{allowed:true};
      if(!slot.allowed){if(slot.registration_disabled){account.textContent='현재 관리자가 신규 회원가입을 잠시 꺼둔 상태야.';return;}const sec=Math.max(1,Number(slot.retry_after||60));account.textContent=`가입 시도가 너무 많아. 약 ${Math.ceil(sec/60)}분 뒤 다시 해줘.`;return;}
      account.textContent='회원가입 중…';
      const{data,error}=await supabaseClient.auth.signUp({email:c.email,password:c.password,options:{data:{username:c.username},captchaToken:token}});
      if(error){account.textContent=/captcha/i.test(error.message||'')?'보안 확인이 만료됐어. 다시 확인해줘.':/already|registered|exists/i.test(error.message||'')?'이미 사용 중인 아이디야. 다른 아이디를 골라줘.':'회원가입 실패: '+error.message;return;}
      if(data.session){if(await enforceAccess(data.user))account.textContent=`회원가입 완료 · ${c.username} 아이디로 바로 로그인됐어.`;}else account.textContent='회원가입은 됐지만 로그인 세션이 만들어지지 않았어. Confirm email 설정을 확인해줘.';
    }catch(error){account.textContent='회원가입 실패: '+(error?.message||'잠시 후 다시 시도해줘.');}
    finally{resetCaptcha();setTimeout(()=>{signupBtn.disabled=false;},3000);}
  };

  passwordInput.addEventListener('keydown',event=>{if(event.key==='Enter'&&!loginBtn.hidden)loginBtn.click();});
  supabaseClient.auth.onAuthStateChange((_event,session)=>queueMicrotask(()=>{const user=session?.user||null;renderUsernameSession(user);if(user)setTimeout(()=>void enforceAccess(user),0);}));
  supabaseClient.auth.getSession().then(({data})=>{const user=data.session?.user||null;renderUsernameSession(user);if(user)void enforceAccess(user);});
})();
