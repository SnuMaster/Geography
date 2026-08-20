(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const fmt=iso=>iso?new Intl.DateTimeFormat('ko-KR',{dateStyle:'short',timeStyle:'short'}).format(new Date(iso)):'-';
  const bytes=n=>{n=Number(n)||0;if(n<1024)return n+' B';if(n<1024*1024)return (n/1024).toFixed(1)+' KB';if(n<1024*1024*1024)return (n/1024/1024).toFixed(1)+' MB';return (n/1024/1024/1024).toFixed(2)+' GB';};

  function waitForClient(){return new Promise(resolve=>{if(window.korgeoAdminSupabase)return resolve(window.korgeoAdminSupabase);const t=setInterval(()=>{if(window.korgeoAdminSupabase){clearInterval(t);resolve(window.korgeoAdminSupabase);}},50);setTimeout(()=>{clearInterval(t);resolve(window.korgeoAdminSupabase||null);},4000);});}

  function addStyles(){
    if(document.getElementById('korgeoExtraStyles'))return;
    const st=document.createElement('style');st.id='korgeoExtraStyles';st.textContent='.extra-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.extra-box{background:#f8fbff;border:1px solid #d9e6f0;border-radius:12px;padding:13px}.extra-box h3{margin:0 0 9px}.health-list{display:grid;grid-template-columns:1fr auto;gap:7px 10px;font-size:.82rem}.health-list b{text-align:right}.feedback-list{display:grid;gap:8px;max-height:430px;overflow:auto}.feedback-item{border:1px solid #dde8f1;border-radius:10px;background:#fff;padding:10px}.feedback-head{display:flex;gap:7px;justify-content:space-between;align-items:center}.feedback-item p{white-space:pre-wrap;word-break:break-word;margin:7px 0;font-size:.84rem;line-height:1.45}.feedback-item small{color:#637a8e}.feedback-item button{font-size:.73rem;padding:6px 8px}.badge{display:inline-block;padding:2px 7px;border-radius:999px;background:#e8f0f8;font-size:.7rem;font-weight:800}.badge.open{background:#fff2bf;color:#6e4b00}.badge.resolved{background:#e4f7eb;color:#147442}';document.head.appendChild(st);
  }

  function buildUI(){
    if($('extraAdminPanel'))return;
    const app=$('app');if(!app)return;
    const sec=document.createElement('section');sec.id='extraAdminPanel';sec.className='card';
    sec.innerHTML=`<h2>안전·상태·제보</h2><div class="extra-grid"><div class="extra-box"><h3>서버 상태</h3><div id="healthList" class="health-list"><span>확인 중…</span></div><div class="toolbar" style="margin-top:10px"><button id="refreshHealthBtn" class="secondary">상태 새로고침</button></div></div><div class="extra-box"><h3>운영 백업</h3><p class="muted">계정 비밀번호는 포함하지 않고 사용자·진도·오답·운영설정만 JSON으로 내려받아.</p><button id="downloadSnapshotBtn">전체 운영 백업 JSON</button><p id="snapshotStatus" class="status"></p></div></div><div class="extra-box" style="margin-top:12px"><div class="feedback-head"><h3>오류·건의 접수함</h3><button id="refreshFeedbackBtn" class="secondary">새로고침</button></div><div id="feedbackList" class="feedback-list"><p class="muted">불러오는 중…</p></div></div>`;
    const userCard=$('users')?.closest('.card');app.insertBefore(sec,userCard||null);
  }

  async function loadHealth(sb){
    const box=$('healthList');if(!box)return;
    box.innerHTML='<span>확인 중…</span>';
    const {data,error}=await sb.rpc('admin_health');
    if(error){box.innerHTML=`<span>상태 확인 실패</span><b>${esc(error.message)}</b>`;return;}
    const d=data||{};
    const rows=[['DB 연결','정상'],['서버 시간',fmt(d.server_time)],['DB 크기',bytes(d.database_size_bytes)],['전체 사용자',d.users??0],['이용정지',d.suspended_users??0],['미처리 제보',d.open_feedback??0],['최근 진도 저장',fmt(d.latest_progress_at)],['최근 오답 변경',fmt(d.latest_wrong_at)],['최근 제보',fmt(d.latest_feedback_at)]];
    box.innerHTML=rows.map(([k,v])=>`<span>${esc(k)}</span><b>${esc(v)}</b>`).join('');
  }

  async function downloadSnapshot(sb){
    const status=$('snapshotStatus');status.textContent='백업 생성 중…';status.className='status';
    try{
      const {data,error}=await sb.rpc('admin_export_snapshot');if(error)throw error;
      const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'});
      const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='korgeo-backup-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
      status.textContent='백업 다운로드 완료';status.className='status ok';
    }catch(e){status.textContent='백업 실패: '+(e.message||e);status.className='status error';}
  }

  async function loadFeedback(sb){
    const box=$('feedbackList');box.innerHTML='<p class="muted">불러오는 중…</p>';
    const {data,error}=await sb.rpc('admin_list_feedback',{p_limit:100});
    if(error){box.innerHTML=`<p class="status error">제보 불러오기 실패: ${esc(error.message)}</p>`;return;}
    const rows=data||[];
    if(!rows.length){box.innerHTML='<p class="muted">아직 들어온 제보가 없어.</p>';return;}
    box.innerHTML='';
    rows.forEach(r=>{
      const item=document.createElement('div');item.className='feedback-item';
      item.innerHTML=`<div class="feedback-head"><div><span class="badge ${esc(r.status)}">${r.status==='open'?'미처리':'처리완료'}</span> <span class="badge">${esc(r.category)}</span> <span class="badge">${esc(r.page)}</span></div><small>${esc(fmt(r.created_at))}</small></div><p>${esc(r.message)}</p>`;
      const btn=document.createElement('button');btn.className='secondary';btn.textContent=r.status==='open'?'처리 완료':'다시 열기';btn.onclick=async()=>{btn.disabled=true;const{error:e}=await sb.rpc('admin_resolve_feedback',{p_id:r.id,p_resolved:r.status==='open'});if(e)alert('처리 실패: '+e.message);await loadFeedback(sb);await loadHealth(sb);};
      item.appendChild(btn);box.appendChild(item);
    });
  }

  (async()=>{
    addStyles();buildUI();const sb=await waitForClient();if(!sb)return;
    const loadAll=()=>Promise.all([loadHealth(sb),loadFeedback(sb)]);
    try{await loadAll();}catch(e){console.warn('추가 관리자 패널 로드 실패',e);}
    $('refreshHealthBtn').onclick=()=>loadHealth(sb);
    $('downloadSnapshotBtn').onclick=()=>downloadSnapshot(sb);
    $('refreshFeedbackBtn').onclick=()=>loadFeedback(sb);
    const old=window.korgeoAdminReload;
    if(old)window.korgeoAdminReload=async()=>{await old();await loadAll();};
  })();
})();
