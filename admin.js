(() => {
  'use strict';
  const SUPABASE_URL='https://aplhddasduwtlxeejvnk.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY='sb_publishable_kUMRFC5dLAomRo9tiakqIg_Ob3j0ELs';
  const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
  const $=id=>document.getElementById(id);
  const fmt=iso=>iso?new Intl.DateTimeFormat('ko-KR',{dateStyle:'short',timeStyle:'short'}).format(new Date(iso)):'-';
  function setStatus(msg,kind=''){ $('status').textContent=msg||''; $('status').className='status '+kind; }
  async function ensureAdmin(){
    const {data:{session}}=await sb.auth.getSession();
    if(!session){ $('gateStatus').textContent='먼저 사이트에서 로그인해줘.'; return false; }
    const {data,error}=await sb.rpc('is_app_admin');
    if(error||!data){ $('gateStatus').textContent='이 계정에는 관리자 권한이 없어.'; return false; }
    $('gate').classList.add('hidden'); $('app').classList.remove('hidden'); return true;
  }
  function renderStats(d){
    const items=[['전체 사용자',d.users_total],['7일 내 로그인',d.users_active_7d],['진도 저장 계정',d.progress_rows],['현재 오답',d.wrong_rows],['관리자',d.admins_total]];
    $('stats').replaceChildren(...items.map(([k,v])=>{const el=document.createElement('div');el.className='stat';el.innerHTML=`<span>${k}</span><b>${v??0}</b>`;return el;}));
  }
  async function action(label,fn){ if(!confirm(label+' 실행할까?')) return; try{ setStatus('처리 중…'); const {error}=await fn(); if(error) throw error; setStatus('완료','ok'); await load(); }catch(e){ setStatus('실패: '+(e.message||e),'error'); } }
  function renderUsers(rows){
    const tbody=$('users'); tbody.replaceChildren();
    rows.forEach(u=>{
      const tr=document.createElement('tr');
      const cells=[u.login_id,fmt(u.created_at),fmt(u.last_sign_in_at),String(u.wrong_count),u.has_progress?'있음':'없음'];
      const labels=['아이디','가입','최근 로그인','오답','진도'];
      cells.forEach((v,i)=>{const td=document.createElement('td');td.dataset.label=labels[i];td.textContent=v;tr.appendChild(td);});
      const td=document.createElement('td');td.dataset.label='권한/관리';td.className='user-actions';
      const adminBtn=document.createElement('button');adminBtn.className='secondary';adminBtn.textContent=u.is_admin?'관리자 해제':'관리자 부여';adminBtn.onclick=()=>action(adminBtn.textContent,()=>sb.rpc('admin_set_admin',{p_target_user_id:u.user_id,p_make_admin:!u.is_admin}));
      const resetBtn=document.createElement('button');resetBtn.className='secondary';resetBtn.textContent='데이터 초기화';resetBtn.onclick=()=>action(u.login_id+'의 진도/오답 초기화',()=>sb.rpc('admin_reset_user_data',{p_target_user_id:u.user_id,p_reset_progress:true,p_reset_mistakes:true}));
      const delBtn=document.createElement('button');delBtn.className='danger';delBtn.textContent='계정 삭제';delBtn.onclick=()=>action(u.login_id+' 계정 삭제',()=>sb.rpc('admin_delete_user',{p_target_user_id:u.user_id}));
      td.append(adminBtn,resetBtn,delBtn);tr.appendChild(td);tbody.appendChild(tr);
    });
  }
  async function load(){
    try{
      setStatus('불러오는 중…');
      const [a,b]=await Promise.all([sb.rpc('admin_dashboard'),sb.rpc('admin_list_users',{p_limit:200})]);
      if(a.error) throw a.error;if(b.error) throw b.error;renderStats(a.data||{});renderUsers(b.data||[]);setStatus('최신 상태','ok');
    }catch(e){setStatus('불러오기 실패: '+(e.message||e),'error');}
  }
  $('refreshBtn').onclick=load;
  $('logoutBtn').onclick=async()=>{await sb.auth.signOut();location.href='./';};
  ensureAdmin().then(ok=>{if(ok) load();});
})();
