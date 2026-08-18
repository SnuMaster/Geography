(() => {
  'use strict';

  const USER_DOMAIN = 'users.korgeo.app';
  const USERNAME_RE = /^[a-z0-9._-]{3,24}$/;
  const $ = id => document.getElementById(id);

  function boot() {
    const oldInput = $('quizEmail');
    const loginBtn = $('quizLoginBtn');
    const loggedOut = $('quizLoggedOut');
    const accountName = $('quizAccountEmail');
    const status = $('quizAuthStatus');
    if (!oldInput || !loginBtn || !loggedOut || !status) return;

    const authClient = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
    if (!authClient) return;

    oldInput.id = 'quizUsername';
    oldInput.type = 'text';
    oldInput.autocomplete = 'username';
    oldInput.placeholder = '아이디';
    oldInput.minLength = 3;
    oldInput.maxLength = 24;
    oldInput.setAttribute('autocapitalize', 'none');
    oldInput.setAttribute('spellcheck', 'false');

    const fields = oldInput.closest('.auth-fields');
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

    const intro = loggedOut.querySelector('p');
    if (intro) intro.textContent = '아이디와 비밀번호로 로그인하면 오답이 계정에 저장돼.';

    loginBtn.textContent = '로그인';
    let signupBtn = $('quizSignupBtn');
    if (!signupBtn) {
      signupBtn = document.createElement('button');
      signupBtn.id = 'quizSignupBtn';
      signupBtn.type = 'button';
      signupBtn.textContent = '회원가입';
      loginBtn.parentElement.appendChild(signupBtn);
    }

    function credentials() {
      const username = oldInput.value.trim().toLowerCase();
      const password = passwordInput.value;
      if (!username || !password) return { error: '아이디와 비밀번호를 둘 다 입력해줘.' };
      if (!USERNAME_RE.test(username)) return { error: '아이디는 영문 소문자, 숫자, 점(.), 밑줄(_), 하이픈(-)으로 3~24자만 가능해.' };
      if (password.length < 6) return { error: '비밀번호는 6자 이상으로 만들어줘.' };
      return { username, password, email: `${username}@${USER_DOMAIN}` };
    }

    function setStatus(message, state = '') {
      status.textContent = message;
      status.dataset.state = state;
    }

    loginBtn.onclick = async () => {
      const c = credentials();
      if (c.error) return setStatus(c.error, 'error');
      setStatus('로그인 중…');
      const { error } = await authClient.auth.signInWithPassword({ email: c.email, password: c.password });
      setStatus(error ? '로그인 실패 · 아이디 또는 비밀번호를 확인해줘.' : '로그인 완료 · 오답노트를 불러오는 중이야.', error ? 'error' : 'success');
    };

    signupBtn.onclick = async () => {
      const c = credentials();
      if (c.error) return setStatus(c.error, 'error');
      setStatus('회원가입 중…');
      const { data, error } = await authClient.auth.signUp({
        email: c.email,
        password: c.password,
        options: { data: { username: c.username } }
      });
      if (error) {
        const duplicate = /already|registered|exists/i.test(error.message || '');
        return setStatus(duplicate ? '이미 사용 중인 아이디야.' : '회원가입 실패: ' + error.message, 'error');
      }
      setStatus(data.session ? '회원가입 완료 · 바로 로그인됐어.' : '가입은 됐지만 로그인 세션이 없어. Confirm email 설정을 확인해줘.', data.session ? 'success' : 'error');
    };

    passwordInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') loginBtn.click();
    });

    authClient.auth.onAuthStateChange((_event, session) => {
      if (session?.user && accountName) {
        accountName.textContent = session.user.user_metadata?.username || String(session.user.email || '').replace(/@users\.korgeo\.app$/i, '');
      }
    });

    authClient.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (user && accountName) accountName.textContent = user.user_metadata?.username || String(user.email || '').replace(/@users\.korgeo\.app$/i, '');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
