(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const fmt=iso=>iso?new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(iso)):'-';
  const toLocalInput=iso=>{if(!iso)return'';const d=new Date(iso);const off=d.getTimezoneOffset();return new Date(d.getTime()-off*60000).toISOString().slice(0,16);};
  const fromLocalInput=v=>v?new Date(v).toISOString():null;

  function waitForClient(){return new Promise(resolve=>{if(window.korgeoAdminSupabase)return resolve(window.korgeoAdminSupabase);const t=setInterval(()=>{if(window.korgeoAdminSupabase){clearInterval(t);resolve(window.korgeoAdminSupabase);}},50);setTimeout(()=>{clearInterval(t);resolve(window.korgeoAdminSupabase||null);},4000);});}

  function addStyles(){
    if($('korgeoPowerStyles'))return;
    const st=document.createElement('style');st.id='korgeoPowerStyles';st.textContent='.power-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}.power-box{background:#f8fbff;border:1px solid #d9e6f0;border-radius:12px;padding:13px}.power-box h3{margin:0 0 10px}.power-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0}.power-row label{margin:0}.power-row input[type=number]{width:90px}.power-help{font-size:.76rem;color:#637a8e;line-height:1.45}.signup-bars{display:grid;gap:6px}.signup-line{display:grid;grid-template-columns:74px 1fr 38px;gap:8px;align-items:center;font-size:.78rem}.signup-track{height:9px;border-radius:999px;background:#dce8f2;overflow:hidden}.signup-fill{height:100%;background:#1769aa}.detail-modal{position:fixed;inset:0;z-index:20000;background:#0008;display:grid;place-items:center;padding:18px}.detail-card{width:min(720px,100%);max-height:86vh;overflow:auto;background:#fff;border-radius:16px;padding:18px;box-shadow:0 24px 80px #0006}.detail-head{display:flex;justify-content:space-between;gap:12px;align-items:center}.detail-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:12px 0}.detail-stat{background:#f3f7fb;border-radius:10px;padding:10px}.detail-stat small{display:block;color:#637a8e}.detail-stat b{display:block;margin-top:4px}.wrong-list{display:grid;gap:6px}.wrong-item{padding:8px;border:1px solid #e0e9f1;border-radius:9px;font-size:.8rem}.danger-zone{border-color:#f0c4bf;background:#fff8f7}';document.head.appendChild(st);
  }

  function buildUI(){
    if($('powerPanel'))return;
    const app=$('app');if(!app)return;
    const sec=document.createElement('section');sec.id='powerPanel';sec.className='card';
    sec.innerHTML=`<h2>고급 운영</h2>
      <div class="power-grid">
        <div class="power-box"><h3>기능별 제어</h3>
          <div class="power-row"><label><input id="flagMain" type="checkbox"> 메인 학습 사용</label></div>
          <div class="power-row"><label><input id="flagQuiz" type="checkbox"> 퀴즈 사용</label></div>
          <div class="power-row"><label><input id="flagFeedback" type="checkbox"> 오류·건의 접수</label></div>
          <div class="power-row"><label><input id="flagReadOnly" type="checkbox"> 읽기 전용 모드</label></div>
          <hr style="border:0;border-top:1px solid #dde7ef;margin:12px 0">
          <div class="power-row"><label>가입 제한 <input id="signupLimit" type="number" min="1" max="50"></label><span>회 /</span><label><input id="signupWindow" type="number" min="1" max="1440">분</label></div>
          <div class="power-row"><label>제보 제한 <input id="feedbackLimit" type="number" min="1" max="50"></label><span>회 /</span><label><input id="feedbackWindow" type="number" min="1" max="168">시간</label></div>
          <div class="power-row"><button id="saveFlagsBtn">고급 설정 저장</button></div><p id="flagStatus" class="status"></p>
          <p class="power-help">읽기 전용은 화면 표시뿐 아니라 DB 저장도 서버에서 막아. 관리자 작업은 계속 가능해.</p>
        </div>
        <div class="power-box danger-zone"><h3>긴급 제어</h3>
          <p class="power-help">문제 생겼을 때 한 번에 신규가입·제보·기록 저장을 잠그고 점검 배너를 켤 수 있어.</p>
          <div class="power-row"><button id="panicBtn" class="danger">긴급 잠금</button><button id="normalBtn" class="secondary">정상 운영 복구</button></div>
          <p id="panicStatus" class="status"></p>
        </div>
      </div>
      <div class="power-grid" style="margin-top:12px">
        <div class="power-box"><h3>최근 14일 신규가입</h3><div id="signup14d" class="signup-bars"><span>불러오는 중…</span></div></div>
        <div class="power-box"><h3>공지 예약</h3>
          <label for="scheduleText">내용</label><textarea id="scheduleText" maxlength="500" placeholder="예약 공지 내용"></textarea>
          <div class="power-row"><label>시작 <input id="scheduleStart" type="datetime-local"></label></div>
          <div class="power-row"><label>종료 <input id="scheduleEnd" type="datetime-local"></label></div>
          <div class="power-row"><label>종류 <select id="scheduleLevel"><option value="info">일반</option><option value="warn">주의</option><option value="urgent">긴급</option></select></label></div>
          <label for="scheduleLink">링크</label><input id="scheduleLink" maxlength="500" placeholder="선택 사항">
          <div class="power-row"><label><input id="scheduleEnabled" type="checkbox"> 예약 활성화</label></div>
          <div class="power-row"><button id="saveScheduleBtn">예약 저장</button></div><p id="scheduleStatus" class="status"></p>
        </div>
      </div>`;
    const userCard=$('users')?.closest('.card');app.insertBefore(sec,userCard||null);
  }

  async function loadFlags(sb){
    const {data,error}=await sb.rpc('get_public_runtime_config');if(error)throw error;const v=data||{};
    $('flagMain').checked=v.main_enabled!==false;$('flagQuiz').checked=v.quiz_enabled!==false;$('flagFeedback').checked=v.feedback_enabled!==false;$('flagReadOnly').checked=Boolean(v.read_only);
    $('signupLimit').value=v.signup_limit_count??5;$('signupWindow').value=v.signup_window_minutes??10;$('feedbackLimit').value=v.feedback_limit_count??3;$('feedbackWindow').value=v.feedback_window_hours??6;
    return v;
  }

  async function saveFlags(sb,override={}){
    const status=$('flagStatus');status.textContent='저장 중…';status.className='status';
    const payload={
      p_main_enabled:override.main_enabled??$('flagMain').checked,
      p_quiz_enabled:override.quiz_enabled??$('flagQuiz').checked,
      p_feedback_enabled:override.feedback_enabled??$('flagFeedback').checked,
      p_read_only:override.read_only??$('flagReadOnly').checked,
      p_signup_limit_count:Number($('signupLimit').value||5),p_signup_window_minutes:Number($('signupWindow').value||10),
      p_feedback_limit_count:Number($('feedbackLimit').value||3),p_feedback_window_hours:Number($('feedbackWindow').value||6)
    };
    const {error}=await sb.rpc('admin_set_advanced_runtime',payload);
    if(error){status.textContent='저장 실패: '+error.message;status.className='status error';throw error;}
    status.textContent='고급 설정 저장 완료';status.className='status ok';await loadFlags(sb);
  }

  async function panic(sb){
    if(!confirm('긴급 잠금을 켤까? 신규가입·제보·기록 저장을 막고 점검 배너를 표시해.'))return;
    const s=$('panicStatus');s.textContent='긴급 잠금 적용 중…';
    try{
      const [a,b]=await Promise.all([
        sb.rpc('admin_set_runtime_config',{p_registration_enabled:false,p_maintenance_enabled:true,p_maintenance_text:'현재 긴급 점검 중입니다. 잠시 후 다시 이용해 주세요.'}),
        sb.rpc('admin_set_advanced_runtime',{p_main_enabled:true,p_quiz_enabled:true,p_feedback_enabled:false,p_read_only:true,p_signup_limit_count:Number($('signupLimit').value||5),p_signup_window_minutes:Number($('signupWindow').value||10),p_feedback_limit_count:Number($('feedbackLimit').value||3),p_feedback_window_hours:Number($('feedbackWindow').value||6)})
      ]);
      if(a.error)throw a.error;if(b.error)throw b.error;s.textContent='긴급 잠금 적용 완료';s.className='status ok';await loadFlags(sb);
    }catch(e){s.textContent='실패: '+(e.message||e);s.className='status error';}
  }

  async function normalize(sb){
    if(!confirm('정상 운영 상태로 복구할까?'))return;
    const s=$('panicStatus');s.textContent='복구 중…';
    try{
      const [a,b]=await Promise.all([
        sb.rpc('admin_set_runtime_config',{p_registration_enabled:true,p_maintenance_enabled:false,p_maintenance_text:''}),
        sb.rpc('admin_set_advanced_runtime',{p_main_enabled:true,p_quiz_enabled:true,p_feedback_enabled:true,p_read_only:false,p_signup_limit_count:Number($('signupLimit').value||5),p_signup_window_minutes:Number($('signupWindow').value||10),p_feedback_limit_count:Number($('feedbackLimit').value||3),p_feedback_window_hours:Number($('feedbackWindow').value||6)})
      ]);
      if(a.error)throw a.error;if(b.error)throw b.error;s.textContent='정상 운영 복구 완료';s.className='status ok';await loadFlags(sb);
    }catch(e){s.textContent='실패: '+(e.message||e);s.className='status error';}
  }

  async function loadSignups(sb){
    const box=$('signup14d');const {data,error}=await sb.rpc('admin_signups_14d');if(error){box.textContent='불러오기 실패';return;}
    const rows=data||[];const max=Math.max(1,...rows.map(r=>Number(r.signups)||0));
    box.innerHTML=rows.map(r=>`<div class="signup-line"><span>${esc(String(r.day).slice(5))}</span><div class="signup-track"><div class="signup-fill" style="width:${Math.round((Number(r.signups)||0)/max*100)}%"></div></div><b>${Number(r.signups)||0}</b></div>`).join('');
  }

  async function loadSchedule(sb){
    const {data,error}=await sb.rpc('admin_get_announcement_config');if(error)return;const v=data||{};
    $('scheduleText').value=v.text||'';$('scheduleLink').value=v.link||'';$('scheduleLevel').value=['info','warn','urgent'].includes(v.level)?v.level:'info';$('scheduleEnabled').checked=Boolean(v.enabled);$('scheduleStart').value=toLocalInput(v.starts_at);$('scheduleEnd').value=toLocalInput(v.ends_at);
  }

  async function saveSchedule(sb){
    const s=$('scheduleStatus');s.textContent='예약 저장 중…';s.className='status';
    const {error}=await sb.rpc('admin_set_announcement_schedule',{p_text:$('scheduleText').value.trim(),p_enabled:$('scheduleEnabled').checked,p_level:$('scheduleLevel').value,p_link:$('scheduleLink').value.trim(),p_starts_at:fromLocalInput($('scheduleStart').value),p_ends_at:fromLocalInput($('scheduleEnd').value)});
    if(error){s.textContent='예약 실패: '+error.message;s.className='status error';return;}
    s.textContent='공지 예약 저장 완료';s.className='status ok';
  }

  function showDetail(data){
    document.getElementById('korgeoUserDetailModal')?.remove();
    const d=data||{},p=d.progress||{},m=d.wrong_by_mode||{},recent=Array.isArray(d.recent_wrong)?d.recent_wrong:[];
    const modal=document.createElement('div');modal.id='korgeoUserDetailModal';modal.className='detail-modal';
    modal.innerHTML=`<div class="detail-card"><div class="detail-head"><div><h2 style="margin:0">${esc(d.login_id||'사용자')}</h2><small>${esc(d.suspended?'이용정지':'정상')} · 가입 ${esc(fmt(d.created_at))}</small></div><button id="detailClose" class="secondary">닫기</button></div>
      <div class="detail-grid"><div class="detail-stat"><small>최근 로그인</small><b>${esc(fmt(d.last_sign_in_at))}</b></div><div class="detail-stat"><small>퀴즈 횟수</small><b>${Number(p.quiz_count)||0}</b></div><div class="detail-stat"><small>저장 핀</small><b>${Number(p.pin_count)||0}</b></div><div class="detail-stat"><small>최고 거리</small><b>${p.best_distance_km==null?'-':esc(p.best_distance_km+' km')}</b></div><div class="detail-stat"><small>진도 갱신</small><b>${esc(fmt(p.updated_at))}</b></div><div class="detail-stat"><small>관리자</small><b>${d.is_admin?'YES':'NO'}</b></div></div>
      <h3>현재 오답</h3><div class="detail-grid">${Object.keys(m).length?Object.entries(m).map(([k,v])=>`<div class="detail-stat"><small>${esc(k)}</small><b>${Number(v)||0}</b></div>`).join(''):'<span class="muted">현재 오답 없음</span>'}</div>
      <h3>최근 오답/해제 기록</h3><div class="wrong-list">${recent.length?recent.map(r=>`<div class="wrong-item"><b>${esc(r.answer_label)}</b> <span class="badge">${esc(r.quiz_mode)}</span><br><small>${esc(r.state)} · ${esc(fmt(r.changed_at))}</small></div>`).join(''):'<span class="muted">기록 없음</span>'}</div>
      ${d.internal_note?`<h3>관리자 메모</h3><p style="white-space:pre-wrap">${esc(d.internal_note)}</p>`:''}</div>`;
    document.body.appendChild(modal);modal.querySelector('#detailClose').onclick=()=>modal.remove();modal.onclick=e=>{if(e.target===modal)modal.remove();};
  }

  async function openUserDetail(sb,userId){
    const {data,error}=await sb.rpc('admin_user_detail',{p_target_user_id:userId});if(error){alert('상세 조회 실패: '+error.message);return;}showDetail(data);
  }

  function wireUserDetailButtons(sb,rows){
    const trs=[...document.querySelectorAll('#users tr')];
    trs.forEach((tr,i)=>{const u=rows?.[i];if(!u)return;const cell=tr.lastElementChild;if(!cell||cell.querySelector('[data-user-detail]'))return;const btn=document.createElement('button');btn.type='button';btn.className='secondary';btn.dataset.userDetail='1';btn.textContent='상세';btn.onclick=()=>openUserDetail(sb,u.user_id);cell.prepend(btn);});
  }

  (async()=>{
    addStyles();buildUI();const sb=await waitForClient();if(!sb)return;
    const ready=window.korgeoAdminReady?await window.korgeoAdminReady:false;if(!ready)return;
    try{await Promise.all([loadFlags(sb),loadSignups(sb),loadSchedule(sb)]);}catch(e){console.warn('고급 운영 패널 로드 실패',e);}
    $('saveFlagsBtn').onclick=()=>saveFlags(sb).catch(()=>{});$('panicBtn').onclick=()=>panic(sb);$('normalBtn').onclick=()=>normalize(sb);$('saveScheduleBtn').onclick=()=>saveSchedule(sb);
    window.addEventListener('korgeo-admin-users',e=>wireUserDetailButtons(sb,e.detail||window.korgeoAdminUsers||[]));
    if(window.korgeoAdminUsers)wireUserDetailButtons(sb,window.korgeoAdminUsers);
    const old=window.korgeoAdminReload;if(old)window.korgeoAdminReload=async()=>{await old();await Promise.all([loadFlags(sb),loadSignups(sb),loadSchedule(sb)]);};
  })();
})();
