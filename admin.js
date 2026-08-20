(() => {
  'use strict';
  const SUPABASE_URL='https://aplhddasduwtlxeejvnk.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY='sb_publishable_kUMRFC5dLAomRo9tiakqIg_Ob3j0ELs';
  const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
  window.korgeoAdminSupabase=sb;
  const $=id=>document.getElementById(id);
  const fmt=iso=>iso?new Intl.DateTimeFormat('ko-KR',{dateStyle:'short',timeStyle:'short'}).format(new Date(iso)):'-';
  function setStatus(msg,kind=''){ $('status').textContent=msg||''; $('status').className='status '+kind; }
  function setAnnouncementStatus(msg,kind=''){ $('announcementStatus').textContent=msg||''; $('announcementStatus').className='status '+kind; }

  async function ensureAdmin(){
    const {data:{session}}=await sb.auth.getSession();
    if(!session){ $('gateStatus').textContent='먼저 사이트에서 로그인해줘.'; return false; }
    const {data,error}=await sb.rpc('is_app_admin',{p_user_id:session.user.id});
    if(error||!data){ $('gateStatus').textContent='이 계정에는 관리자 권한이 없어.'; return false; }
    $('gate').classList.add('hidden'); $('app').classList.remove('hidden'); return true;
  }

  function renderStats(base,traffic){
    const items=[
      ['전체 사용자',base.users_total],['7일 내 로그인',base.users_active_7d],['진도 저장 계정',base.progress_rows],['현재 오답',base.wrong_rows],['관리자',base.admins_total],
      ['오늘 방문자',traffic.visitors_today],['7일 방문자',traffic.visitors_7d],['오늘 메인',traffic.main_today],['오늘 퀴즈',traffic.quiz_today]
    ];
    $('stats').replaceChildren(...items.map(([k,v])=>{const el=document.createElement('div');el.className='stat';el.innerHTML=`<span>${k}</span><b>${v??0}</b>`;return el;}));
  }

  function renderAnnouncement(v){
    v=v||{};
    $('announcementText').value=v.text||'';
    $('announcementLevel').value=['info','warn','urgent'].includes(v.level)?v.level:'info';
    $('announcementLink').value=v.link||'';
    $('announcementEnabled').checked=Boolean(v.enabled);
  }

  async function saveAnnouncement(enabledOverride=null){
    try{
      setAnnouncementStatus('저장 중…');
      const enabled=enabledOverride===null?$('announcementEnabled').checked:Boolean(enabledOverride);
      const payload={
        p_text:$('announcementText').value.trim(),
        p_enabled:enabled,
        p_level:$('announcementLevel').value,
        p_link:$('announcementLink').value.trim()
      };
      const {data,error}=await sb.rpc('admin_set_announcement',payload);
      if(error) throw error;
      renderAnnouncement(data);
      setAnnouncementStatus(enabled?'공지 켜짐 · 사이트에 반영됐어.':'공지 꺼짐','ok');
    }catch(e){setAnnouncementStatus('공지 저장 실패: '+(e.message||e),'error');}
  }

  async function action(label,fn){
    if(!confirm(label+' 실행할까?')) return;
    try{ setStatus('처리 중…'); const {error}=await fn(); if(error) throw error; setStatus('완료','ok'); await load(); }
    catch(e){ setStatus('실패: '+(e.message||e),'error'); }
  }

  function renderUsers(rows){
    const tbody=$('users'); tbody.replaceChildren();
    rows.forEach(u=>{
      const tr=document.createElement('tr');
      const statusText=u.is_admin?'관리자':u.suspended?'이용정지':'정상';
      const statusDetail=u.suspended&&u.suspension_reason?` · ${u.suspension_reason}`:'';
      const cells=[u.login_id,fmt(u.created_at),fmt(u.last_sign_in_at),String(u.wrong_count),u.has_progress?'있음':'없음',statusText+statusDetail];
      const labels=['아이디','가입','최근 로그인','오답','진도','상태'];
      cells.forEach((v,i)=>{const td=document.createElement('td');td.dataset.label=labels[i];td.textContent=v;tr.appendChild(td);});

      const td=document.createElement('td');td.dataset.label='권한/관리';td.className='user-actions';
      const adminBtn=document.createElement('button');adminBtn.className='secondary';adminBtn.textContent=u.is_admin?'관리자 해제':'관리자 부여';adminBtn.onclick=()=>action(adminBtn.textContent,()=>sb.rpc('admin_set_admin',{p_target_user_id:u.user_id,p_make_admin:!u.is_admin}));

      const suspendBtn=document.createElement('button');suspendBtn.className=u.suspended?'secondary':'danger';suspendBtn.textContent=u.is_admin?'관리자 보호':u.suspended?'정지 해제':'이용정지';suspendBtn.disabled=Boolean(u.is_admin);
      suspendBtn.onclick=async()=>{
        if(u.is_admin)return;
        let reason=u.suspension_reason||'';
        if(!u.suspended){reason=prompt('이용정지 사유를 적어줘. 사용자에게도 표시돼.',reason||'운영 정책 위반');if(reason===null)return;}
        await action(`${u.login_id} ${u.suspended?'이용정지 해제':'이용정지'}`,()=>sb.rpc('admin_set_user_control',{p_target_user_id:u.user_id,p_suspended:!u.suspended,p_suspension_reason:u.suspended?'':reason,p_internal_note:u.internal_note||''}));
      };

      const noteBtn=document.createElement('button');noteBtn.className='secondary';noteBtn.textContent=u.internal_note?'메모 수정':'관리자 메모';noteBtn.title=u.internal_note||'';noteBtn.onclick=async()=>{
        const note=prompt('이 메모는 관리자에게만 보여.',u.internal_note||'');if(note===null)return;
        try{setStatus('메모 저장 중…');const{error}=await sb.rpc('admin_set_user_control',{p_target_user_id:u.user_id,p_suspended:Boolean(u.suspended),p_suspension_reason:u.suspension_reason||'',p_internal_note:note});if(error)throw error;setStatus('메모 저장 완료','ok');await load();}catch(e){setStatus('메모 저장 실패: '+(e.message||e),'error');}
      };

      const resetBtn=document.createElement('button');resetBtn.className='secondary';resetBtn.textContent='데이터 초기화';resetBtn.onclick=()=>action(u.login_id+'의 진도/오답 초기화',()=>sb.rpc('admin_reset_user_data',{p_target_user_id:u.user_id,p_reset_progress:true,p_reset_mistakes:true}));
      const delBtn=document.createElement('button');delBtn.className='danger';delBtn.textContent='계정 삭제';delBtn.onclick=()=>action(u.login_id+' 계정 삭제',()=>sb.rpc('admin_delete_user',{p_target_user_id:u.user_id}));
      td.append(adminBtn,suspendBtn,noteBtn,resetBtn,delBtn);tr.appendChild(td);tbody.appendChild(tr);
    });
    window.korgeoAdminUsers=rows;
    window.dispatchEvent(new CustomEvent('korgeo-admin-users',{detail:rows}));
  }

  async function load(){
    try{
      setStatus('불러오는 중…');
      const [a,b,c,d]=await Promise.all([
        sb.rpc('admin_dashboard'),
        sb.rpc('admin_list_users_v2',{p_limit:200}),
        sb.rpc('admin_traffic_stats'),
        sb.rpc('get_public_announcement')
      ]);
      if(a.error) throw a.error;if(b.error) throw b.error;if(c.error) throw c.error;if(d.error) throw d.error;
      renderStats(a.data||{},c.data||{});renderUsers(b.data||[]);renderAnnouncement(d.data||{});setStatus('최신 상태','ok');
    }catch(e){setStatus('불러오기 실패: '+(e.message||e),'error');}
  }

  window.korgeoAdminReload=load;
  $('refreshBtn').onclick=load;
  $('logoutBtn').onclick=async()=>{await sb.auth.signOut();location.href='./';};
  $('saveAnnouncementBtn').onclick=()=>saveAnnouncement();
  $('hideAnnouncementBtn').onclick=()=>saveAnnouncement(false);
  ensureAdmin().then(ok=>{if(ok) load();});
})();
