'use strict';
(function(){
 const $=id=>document.getElementById(id);
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const imageTypes=['image/jpeg','image/png','image/webp'];
 let active=null;
 function button(stop){
  return `<button type="button" class="reservation-photo-link" data-reservation-photos="${escape(stop.uid)}" aria-haspopup="dialog" aria-label="${escape(stop.name)} 예약 사진">예약 사진</button>`;
 }
 function status(text){$('reservationPhotoStatus').textContent=text;}
 function close(){
  const dialog=$('reservationPhotoDialog');
  dialog.close();
  RouteUI.release(dialog);
 }
 function showGallery(view,{focus=false}={}){
  const selected=view.selected;
  view.selected=null;
  $('reservationPhotoGallery').hidden=false;
  $('reservationPhotoPreview').hidden=true;
  $('reservationPhotoImage').removeAttribute('src');
  $('reservationPhotoConfirm').hidden=true;
  $('reservationPhotoDelete').hidden=false;
  if(focus){
   const match=[...$('reservationPhotoItems').querySelectorAll('button')].find(button=>button.dataset.photoId===selected);
   (match||$('reservationPhotoChoose')).focus();
  }
 }
 function showPhoto(view,photo){
  view.selected=photo.id;
  $('reservationPhotoImage').src=photo.data;
  $('reservationPhotoImage').alt=photo.name;
  $('reservationPhotoName').textContent=photo.name;
  $('reservationPhotoGallery').hidden=true;
  $('reservationPhotoPreview').hidden=false;
  $('reservationPhotoBack').focus();
 }
 async function refresh(view){
  const ticket=++view.read;
  try{
   const values=await AccountRecords.files(view.scope);
   if(active!==view||view.scope!==AccountRecords.scope()||ticket!==view.read)return;
   const photos=values.filter(f=>view.owners.includes(f.owner)&&/^data:image\/(?:jpeg|png|webp);base64,/.test(f.data));
   const items=photos.map(photo=>{
    const row=document.createElement('li'),thumb=document.createElement('button'),img=document.createElement('img'),name=document.createElement('span');
    thumb.type='button';
    thumb.dataset.photoId=photo.id;
    img.src=photo.data;
    img.loading='lazy';
    img.alt='';
    name.textContent=photo.name;
    thumb.append(img,name);
    thumb.onclick=()=>showPhoto(view,photo);
    row.append(thumb);
    return row;
   });
   $('reservationPhotoItems').replaceChildren(...items);
   $('reservationPhotoEmpty').hidden=photos.length>0;
   if(view.selected&&!photos.some(f=>f.id===view.selected))showGallery(view,{focus:true});
  }catch(_){if(active===view&&ticket===view.read)status('저장된 사진을 불러오지 못했어요.');}
 }
 function open(opener){
  const uid=opener.dataset.reservationPhotos;
  for(const day of window.__routebook.state.data.days){
   const stop=day.variants.flatMap(v=>v.stops).find(s=>s.uid===uid&&s.kind==='food');
   if(!stop)continue;
   const owner='place:'+uid;
   const view={owner,owners:[owner,...ReservationUI.photoOwners(uid)],scope:AccountRecords.scope(),read:0,selected:null};
   active=view;
   $('reservationPhotoTitle').textContent=stop.name;
   $('reservationPhotoVisit').textContent=day.date+(stop.time?' · '+stop.time:'');
   $('reservationPhotoItems').replaceChildren();
   $('reservationPhotoEmpty').hidden=true;
   $('reservationPhotoChoose').disabled=false;
   $('reservationPhotoDelete').disabled=false;
   $('reservationPhotoFile').value='';
   status('');
   showGallery(view);
   RouteUI.userExplore();
   RouteUI.open($('reservationPhotoDialog'),{opener,close,fallback:()=>$('bookingChecklistBtn')});
   refresh(view);
   return;
  }
 }
 async function add(file,view){
  if(!file||!view)return;
  if(!imageTypes.includes(file.type)||!file.size||file.size>2*1024*1024){
   status('2MB 이하의 JPG·PNG·WebP 사진을 선택해 주세요.');
   return;
  }
  $('reservationPhotoChoose').disabled=true;
  status('사진 저장 중…');
  try{
   await AccountRecords.addAttachment(view.owner,file,view.scope);
   if(active===view)status('사진을 저장했어요.');
  }catch(error){if(active===view)status(error.message);}
  finally{if(active===view){$('reservationPhotoChoose').disabled=false;$('reservationPhotoChoose').focus();}}
 }
 async function remove(view){
  const removeButton=$('reservationPhotoRemove');
  removeButton.disabled=true;
  try{
   await AccountRecords.removeAttachment(view.selected,view.owners,view.scope);
   if(active===view)status('사진을 삭제했어요.');
  }catch(error){if(active===view)status(error.message);}
  finally{removeButton.disabled=false;}
 }
 document.addEventListener('DOMContentLoaded',()=>{
  const dialog=$('reservationPhotoDialog'),file=$('reservationPhotoFile'),confirm=$('reservationPhotoConfirm'),del=$('reservationPhotoDelete');
  document.addEventListener('click',event=>{
   const opener=event.target.closest('[data-reservation-photos]');
   if(opener)open(opener);
  });
  dialog.addEventListener('close',()=>{
   if(dialog.open)return;
   active=null;
   file.value='';
   $('reservationPhotoImage').removeAttribute('src');
   $('reservationPhotoItems').replaceChildren();
  });
  $('reservationPhotoClose').onclick=close;
  $('reservationPhotoChoose').onclick=()=>file.click();
  file.onchange=()=>{
   const selected=file.files[0];
   file.value='';
   add(selected,active);
  };
  $('reservationPhotoBack').onclick=()=>showGallery(active,{focus:true});
  del.onclick=()=>{
   del.hidden=true;
   confirm.hidden=false;
   $('reservationPhotoKeep').focus();
  };
  $('reservationPhotoKeep').onclick=()=>{
   confirm.hidden=true;
   del.hidden=false;
   del.focus();
  };
  $('reservationPhotoRemove').onclick=()=>remove(active);
  const refreshActive=()=>{if(dialog.open&&active)refresh(active);};
  window.addEventListener('routebook:attachments-change',refreshActive);
  window.addEventListener('routebook:personal-change',refreshActive);
  window.addEventListener('routebook:auth-change',()=>{if(dialog.open)close();});
 });
 window.ReservationPhotos={button};
})();
