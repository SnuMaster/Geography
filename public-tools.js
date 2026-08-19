(() => {
  'use strict';

  const SUPABASE_URL = 'https://aplhddasduwtlxeejvnk.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_kUMRFC5dLAomRo9tiakqIg_Ob3j0ELs';
  if (!window.supabase?.createClient) return;
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  function stableId(key) {
    try {
      let value = localStorage.getItem(key);
      if (!value) {
        value = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
        localStorage.setItem(key, value);
      }
      return value;
    } catch {
      return Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
  }

  const visitorId = stableId('korgeo-visitor-id-v1');
  const signupClientKey = stableId('korgeo-signup-client-v1');
  const page = location.pathname.includes('/quiz/') ? 'quiz' : 'main';

  async function trackVisit() {
    try { await sb.rpc('track_public_visit', { p_session_id: visitorId, p_page: page }); } catch {}
  }

  function renderAnnouncement(value) {
    if (!value?.enabled || !String(value.text || '').trim()) return;
    if (document.getElementById('korgeoAnnouncement')) return;

    const level = ['info', 'warn', 'urgent'].includes(value.level) ? value.level : 'info';
    const bar = document.createElement('div');
    bar.id = 'korgeoAnnouncement';
    bar.setAttribute('role', 'status');
    bar.style.cssText = [
      'position:relative', 'z-index:9999', 'padding:10px 44px 10px 14px', 'text-align:center',
      'font:700 14px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      level === 'urgent' ? 'background:#9f1d1d;color:#fff' : level === 'warn' ? 'background:#fff2bf;color:#6e4b00' : 'background:#dff1ff;color:#164875'
    ].join(';');

    const text = document.createElement('span');
    text.textContent = String(value.text || '');
    bar.appendChild(text);

    const link = String(value.link || '').trim();
    if (link) {
      const a = document.createElement('a');
      a.textContent = ' 자세히';
      a.href = link;
      a.rel = 'noopener';
      a.style.cssText = 'color:inherit;text-decoration:underline;margin-left:5px';
      bar.appendChild(a);
    }

    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', '공지 닫기');
    close.style.cssText = 'position:absolute;right:10px;top:50%;transform:translateY(-50%);border:0;background:transparent;color:inherit;font-size:22px;cursor:pointer;padding:2px 7px';
    close.onclick = () => bar.remove();
    bar.appendChild(close);
    document.body.insertBefore(bar, document.body.firstChild);
  }

  async function loadAnnouncement() {
    try {
      const { data, error } = await sb.rpc('get_public_announcement');
      if (!error) renderAnnouncement(data);
    } catch {}
  }

  window.korgeoClaimSignupSlot = async function () {
    try {
      const { data, error } = await sb.rpc('claim_signup_slot', { p_client_key: signupClientKey });
      if (error || !data) return { allowed: true, retry_after: 0 };
      return data;
    } catch {
      return { allowed: true, retry_after: 0 };
    }
  };

  trackVisit();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadAnnouncement, { once: true });
  else loadAnnouncement();
})();
