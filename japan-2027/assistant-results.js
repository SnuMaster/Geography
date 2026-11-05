'use strict';
(function(){
 const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
 const labels={time:'날짜·시각',flight:'편명',seat:'좌석',place:'장소'};
 function weather(box,data,context){
  box.classList.add('assistant-result-card');const p=box.querySelector('p');if(p)p.remove();box.append(node('small',context.date+' · '+context.place),node('h3','날씨와 오늘의 이동'));
  const valid=data.daily?.time?.[0]===context.date,values=valid?[data.daily.temperature_2m_min?.[0],data.daily.temperature_2m_max?.[0],data.daily.precipitation_sum?.[0],data.daily.wind_speed_10m_max?.[0]]:[],units=data.units||{};
  box.append(node('p',data.status||'예보 확인 필요'));
  if(valid){const dl=node('dl',undefined,'assistant-weather-grid');for(const [i,label,unit]of [[0,'최저',units.temperature_2m_min||'℃'],[1,'최고',units.temperature_2m_max||'℃'],[2,'강수',units.precipitation_sum||'mm'],[3,'최대 바람',units.wind_speed_10m_max||'km/h']]){const cell=node('div');cell.append(node('dt',label),node('dd',Number.isFinite(values[i])?values[i]+' '+unit:'확인 필요'));dl.append(cell);}box.append(dl);const tips=[];if(values[2]>0)tips.push('우산을 준비하고 실내 방문지를 먼저 검토하세요.');if(units.wind_speed_10m_max==='km/h'&&values[3]>=36)tips.push('야외·항구 이동 전 강풍 안내를 확인하세요.');if(Number.isFinite(values[0])&&values[0]<=5)tips.push('보온과 실내 휴식 시간을 챙기세요.');box.append(node('p',tips.join(' ')||'예보를 참고해 출발 전에 현장 상황을 확인하세요.','assistant-weather-tip'));}
  else box.append(node('p','예보가 없는 날짜에는 날씨에 근거한 변경안을 만들지 않아요.'));
  if(context.alternatives?.length){const actions=node('div',undefined,'assistant-card-actions');for(const v of context.alternatives){const b=node('button','대체안 보기 · '+v.label);b.type='button';b.onclick=()=>context.openVariant(v.id);actions.append(b);}box.append(actions);}
  if(/^https:\/\/(?:www\.)?open-meteo\.com(?:\/|$)/.test(data.source||'')){const link=node('a','Open-Meteo ↗');link.href=data.source;link.target='_blank';link.rel='noopener noreferrer';box.append(link);}const date=Date.parse(data.checkedAt);box.append(node('small','조회 '+(Number.isFinite(date)?new Date(date).toLocaleString('ko-KR',{timeZone:'Asia/Tokyo'}):'확인 필요')));
 }
 function ticket(box,fields){
  box.classList.add('assistant-result-card');box.append(node('h3','티켓에서 찾은 정보'),node('p','원문과 비교한 뒤 저장할 항목만 선택하세요. 예약 완료 상태는 자동으로 바뀌지 않아요.'));
  const select=node('select');select.setAttribute('aria-label','반영할 기존 예약');for(const item of ReservationUI.getAssistantBookings()){const o=node('option',item.name);o.value=item.key;select.append(o);}box.append(select);
  const choices=[],seen=new Set();for(const f of fields||[]){if(!Object.hasOwn(labels,f.name)||seen.has(f.name)||typeof f.value!=='string'||f.value.length>160||typeof f.evidence!=='string'||f.evidence.length>200||!['높음','중간','낮음'].includes(f.confidence))continue;seen.add(f.name);const label=node('label',undefined,'assistant-ticket-field'),input=node('input');input.type='checkbox';input.dataset.ticketField=f.name;const copy=node('span');copy.append(node('strong',labels[f.name]+' · '+f.value),node('small','신뢰도 '+f.confidence+' · 원문: '+f.evidence));label.append(input,copy);box.append(label);choices.push({input,field:f});}
  const status=node('p',undefined,'assistant-ticket-status');status.setAttribute('role','status');const save=node('button','선택한 항목 저장');save.type='button';save.disabled=!choices.length||!select.options.length;save.onclick=()=>{const chosen=choices.filter(c=>c.input.checked).map(c=>c.field);const result=ReservationUI.confirmFields(select.value,chosen);status.textContent=result.ok?'확인한 항목을 예약 기록에 저장했어요.':result.error;};box.append(save,status);
 }
 window.AssistantResults={weather,ticket};
})();
