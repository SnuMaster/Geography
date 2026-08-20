(() => {
  'use strict';

  const SUPABASE_URL = 'https://aplhddasduwtlxeejvnk.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_kUMRFC5dLAomRo9tiakqIg_Ob3j0ELs';
  const USER_DOMAIN = 'users.korgeo.app';
  const USERNAME_RE = /^[a-z0-9._-]{3,24}$/;
  const TURNSTILE_SITE_KEY = '0x4AAAAAAEWzb25FtCwXioDG';
  const $ = id => document.getElementById(id);

  function ensurePublicTools() {
    if (window.korgeoClaimSignupSlot) return Promise.resolve();
    return new Promise(resolve => {
      if (document.querySelector('script[data-korgeo-public-tools]')) {
        const timer = setInterval(() => {
          if (window.korgeoClaimSignupSlot) {
            clearInterval(timer);
            resolve();
          }
        }, 50);
        setTimeout(() => {
          clearInterval(timer);
          resolve();
        }, 2500);
        return;
      }
      const script = document.createElement('script');
      script.src = '../public-tools.js?v=20260820-public-v6';
      script.dataset.korgeoPublicTools = '1';
      script.onload = script.onerror = resolve;
      document.head.appendChild(script);
    });
  }

  function addPasswordToggle(input) {
    if (!input || document.getElementById('korgeoPasswordToggleQuiz')) return;
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;width:100%;';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    input.style.paddingRight = '72px';

    const button = document.createElement('button');
    button.id = 'korgeoPasswordToggleQuiz';
    button.type = 'button';
    button.textContent = '보기';
    button.setAttribute('aria-label', '비밀번호 보기');
    button.style.cssText = 'position:absolute;right:8px;top:50%;transform:translateY(-50%);padding:6px 10px;border-radius:8px;background:#e8f0f8;color:#164875;box-shadow:none;font-size:.78rem;z-index:2;';
    button.onclick = () => {
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      button.textContent = showing ? '보기' : '숨기기';
      button.setAttribute('aria-label', showing ? '비밀번호 보기' : '비밀번호 숨기기');
    };
    wrapper.appendChild(button);
  }

  function boot() {
    const usernameInput = $('quizUsername') || $('quizEmail');
    const loginBtn = $('quizLoginBtn');
    const signupBtn = $('quizSignupBtn');
    const loggedOut = $('quizLoggedOut');
    const accountName = $('quizAccountEmail');
    const status = $('quizAuthStatus');
    if (!usernameInput || !loginBtn || !loggedOut || !status || !window.supabase?.createClient) return;

    const authClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    void ensurePublicTools();

    usernameInput.id = 'quizUsername';
    usernameInput.type = 'text';
    usernameInput.autocomplete = 'username';
    usernameInput.placeholder = '아이디';
    usernameInput.minLength = 3;
    usernameInput.maxLength = 24;
    usernameInput.setAttribute('autocapitalize', 'none');
    usernameInput.setAttribute('spellcheck', 'false');

    const fields = usernameInput.closest('.auth-fields');
    let passwordInput = $('quizPassword');
    if (!passwordInput) {
      passwordInput = document.createElement('input');
      passwordInput.id = 'quizPassword';
      passwordInput.type = 'password';
      passwordInput.autocomplete = 'current-password';
      passwordInput.placeholder = '비밀번호 (6자 이상)';
      passwordInput.minLength = 6;
      fields.appendChild(passwordInput);
    }
    addPasswordToggle(passwordInput);

    const intro = loggedOut.querySelector('p');
    if (intro) intro.textContent = '아이디와 비밀번호로 로그인하면 오답이 계정에 저장돼.';
    loginBtn.textContent = '로그인';

    let actualSignupBtn = signupBtn;
    if (!actualSignupBtn) {
      actualSignupBtn = document.createElement('button');
      actualSignupBtn.id = 'quizSignupBtn';
      actualSignupBtn.type = 'button';
      actualSignupBtn.textContent = '회원가입';
      loginBtn.parentElement.appendChild(actualSignupBtn);
    }

    let captchaToken = '';
    let captchaWidgetId = null;
    let captchaWrap = null;
    let turnstileReadyPromise = null;

    function setStatus(message, state = '') {
      status.textContent = message;
      status.dataset.state = state;
    }

    function clearCaptchaError() {
      if (/^Cloudflare 보안 확인 오류/.test(status.textContent || '')) {
        setStatus('보안 확인 완료 · 아이디와 비밀번호를 입력해줘.', 'success');
      }
    }

    function ensureTurnstile() {
      if (turnstileReadyPromise) return turnstileReadyPromise;
      turnstileReadyPromise = new Promise(resolve => {
        const render = () => {
          if (!window.turnstile) {
            resolve(false);
            return;
          }
          if (!captchaWrap) {
            captchaWrap = document.createElement('div');
            captchaWrap.id = 'korgeoTurnstileQuiz';
            captchaWrap.style.cssText = 'margin:10px 0;min-height:65px;display:flex;justify-content:center;';
            fields.insertAdjacentElement('afterend', captchaWrap);
          }
          if (captchaWidgetId === null) {
            try {
              captchaWidgetId = window.turnstile.render(captchaWrap, {
                sitekey: TURNSTILE_SITE_KEY,
                theme: 'auto',
                callback: token => {
                  captchaToken = token || '';
                  clearCaptchaError();
                },
                'expired-callback': () => { captchaToken = ''; },
                'error-callback': code => {
                  captchaToken = '';
                  setStatus('Cloudflare 보안 확인 오류 (' + code + ').', 'error');
                  return true;
                }
              });
            } catch {
              resolve(false);
              return;
            }
          }
          resolve(true);
        };

        if (window.turnstile) {
          render();
          return;
        }
        let script = document.querySelector('script[data-korgeo-turnstile]');
        if (!script) {
          script = document.createElement('script');
          script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
          script.async = true;
          script.defer = true;
          script.dataset.korgeoTurnstile = '1';
          document.head.appendChild(script);
        }
        script.addEventListener('load', render, { once: true });
        script.addEventListener('error', () => resolve(false), { once: true });
        setTimeout(() => {
          if (window.turnstile) render();
          else resolve(false);
        }, 5000);
      });
      return turnstileReadyPromise;
    }

    async function requireCaptcha() {
      await ensureTurnstile();
      if (!captchaToken) {
        setStatus('사람인지 확인하는 보안 확인을 먼저 완료해줘.', 'error');
        return null;
      }
      return captchaToken;
    }

    function resetCaptcha() {
      captchaToken = '';
      if (window.turnstile && captchaWidgetId !== null) {
        try { window.turnstile.reset(captchaWidgetId); } catch {}
      }
    }
    void ensureTurnstile();

    function credentials() {
      const username = usernameInput.value.trim().toLowerCase();
      const password = passwordInput.value;
      if (!username || !password) return { error: '아이디와 비밀번호를 둘 다 입력해줘.' };
      if (!USERNAME_RE.test(username)) return { error: '아이디는 영문 소문자, 숫자, 점(.), 밑줄(_), 하이픈(-)으로 3~24자만 가능해.' };
      if (password.length < 6) return { error: '비밀번호는 6자 이상으로 만들어줘.' };
      return { username, password, email: `${username}@${USER_DOMAIN}` };
    }

    function displayName(user) {
      return user?.user_metadata?.username || String(user?.email || '').replace(/@users\.korgeo\.app$/i, '');
    }

    async function enforceAccess(user) {
      if (!user) return true;
      try {
        const { data, error } = await authClient.rpc('get_my_access_state');
        if (error) return true;
        if (data?.suspended) {
          const reason = String(data.reason || '').trim();
          await authClient.auth.signOut();
          setStatus('이용정지된 계정이야.' + (reason ? ' 사유: ' + reason : ''), 'error');
          return false;
        }
      } catch {}
      return true;
    }

    loginBtn.onclick = async () => {
      const c = credentials();
      if (c.error) return setStatus(c.error, 'error');
      const token = await requireCaptcha();
      if (!token) return;
      setStatus('로그인 중…');
      try {
        const { data, error } = await authClient.auth.signInWithPassword({
          email: c.email,
          password: c.password,
          options: { captchaToken: token }
        });
        if (error) {
          return setStatus(
            /captcha/i.test(error.message || '')
              ? '보안 확인이 만료됐어. 다시 확인해줘.'
              : '로그인 실패 · 아이디 또는 비밀번호를 확인해줘.',
            'error'
          );
        }
        if (await enforceAccess(data?.user)) setStatus('로그인 완료 · 오답노트를 불러오는 중이야.', 'success');
      } finally {
        resetCaptcha();
      }
    };

    actualSignupBtn.onclick = async () => {
      const c = credentials();
      if (c.error) return setStatus(c.error, 'error');
      const token = await requireCaptcha();
      if (!token) return;
      actualSignupBtn.disabled = true;
      setStatus('회원가입 확인 중…');
      try {
        await ensurePublicTools();
        const slot = window.korgeoClaimSignupSlot ? await window.korgeoClaimSignupSlot() : { allowed: true };
        if (!slot.allowed) {
          if (slot.registration_disabled) return setStatus('현재 관리자가 신규 회원가입을 잠시 꺼둔 상태야.', 'error');
          const sec = Math.max(1, Number(slot.retry_after || 60));
          return setStatus(`가입 시도가 너무 많아. 약 ${Math.ceil(sec / 60)}분 뒤 다시 해줘.`, 'error');
        }

        setStatus('회원가입 중…');
        const { data, error } = await authClient.auth.signUp({
          email: c.email,
          password: c.password,
          options: { data: { username: c.username }, captchaToken: token }
        });
        if (error) {
          const duplicate = /already|registered|exists/i.test(error.message || '');
          return setStatus(
            /captcha/i.test(error.message || '')
              ? '보안 확인이 만료됐어. 다시 확인해줘.'
              : duplicate
                ? '이미 사용 중인 아이디야.'
                : '회원가입 실패: ' + error.message,
            'error'
          );
        }
        if (data.session) {
          if (await enforceAccess(data.user)) setStatus('회원가입 완료 · 바로 로그인됐어.', 'success');
        } else {
          setStatus('가입은 됐지만 로그인 세션이 없어. Confirm email 설정을 확인해줘.', 'error');
        }
      } finally {
        resetCaptcha();
        setTimeout(() => { actualSignupBtn.disabled = false; }, 3000);
      }
    };

    passwordInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') loginBtn.click();
    });

    authClient.auth.onAuthStateChange((_event, session) => {
      const user = session?.user || null;
      const passwordWrap = passwordInput.parentElement;
      if (captchaWrap) captchaWrap.style.display = user ? 'none' : 'flex';
      if (passwordWrap) passwordWrap.style.display = user ? 'none' : 'block';
      if (user && accountName) accountName.textContent = displayName(user);
      if (user) setTimeout(() => void enforceAccess(user), 0);
    });

    authClient.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      const passwordWrap = passwordInput.parentElement;
      if (captchaWrap) captchaWrap.style.display = user ? 'none' : 'flex';
      if (passwordWrap) passwordWrap.style.display = user ? 'none' : 'block';
      if (user && accountName) accountName.textContent = displayName(user);
      if (user) void enforceAccess(user);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
