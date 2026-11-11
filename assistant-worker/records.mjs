// Authenticated account records only. Never sends records to an AI provider.
const keys=['routebook-command-v1','routebook-assistant-v1','routebook-reservations-v1','routebook-variants-v1','routebook-pass-v2'],enc=new TextEncoder(),dec=new TextDecoder();
const bad=(n,error)=>Response.json({error},{status:n}),object=v=>v&&typeof v==='object'&&!Array.isArray(v),safe=s=>typeof s==='string'&&/^[A-Za-z0-9_.:|\-]{1,200}$/.test(s)&&!['__proto__','constructor','prototype'].includes(s);
function metadata(f){return object(f)&&safe(f.id)&&safe(f.owner)&&typeof f.name==='string'&&f.name.length<=200&&/^[a-f0-9]{64}$/.test(f.hash)&&Number.isSafeInteger(f.bytes)&&f.bytes>0&&f.bytes<=2800000;}
export function recordsPayload(value){
 if(!object(value)||!object(value.storage)||!Array.isArray(value.files)||value.files.length>30||new Set(value.files.map(f=>f?.id)).size!==value.files.length||!value.files.every(metadata)||value.files.reduce((n,f)=>n+f.bytes,0)>28*1024*1024)throw Error('records');
 const storage={};for(const [k,v]of Object.entries(value.storage)){if(!keys.includes(k)||typeof v!=='string'||v.length>1000000||!object(JSON.parse(v)))throw Error('records');storage[k]=v;}
 if(enc.encode(JSON.stringify(storage)).length>1200000)throw Error('records');return {storage,files:value.files.map(f=>({id:f.id,owner:f.owner,name:f.name,hash:f.hash,bytes:f.bytes}))};
}
function base64(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
const unbase64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function key(env){return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',enc.encode('routebook-records-v1|'+env.SESSION_SECRET)),'AES-GCM',false,['encrypt','decrypt']);}
async function seal(env,user,value){const iv=crypto.getRandomValues(new Uint8Array(12)),data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(user)},await key(env),enc.encode(JSON.stringify(value)));return JSON.stringify({iv:base64(iv),data:base64(new Uint8Array(data))});}
async function unseal(env,user,text){const v=JSON.parse(text);return JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(v.iv),additionalData:enc.encode(user)},await key(env),unbase64(v.data))));}
async function read(tx,id){const n=await tx.get(id+':count');if(!n)return null;let text='';for(let i=0;i<n;i++)text+=await tx.get(id+':'+i);return text;}
async function write(tx,id,text){const old=await tx.get(id+':count')||0,n=Math.ceil(text.length/48000);for(let i=0;i<n;i++)await tx.put(id+':'+i,text.slice(i*48000,(i+1)*48000));for(let i=n;i<old;i++)await tx.delete(id+':'+i);await tx.put(id+':count',n);}
export async function recordOperation(tx,env,op,b){
 if(!['records-get','records-put','file-get','file-put'].includes(op))return null;
 if(typeof b.user!=='string'||!/^user:[a-z0-9][a-z0-9_-]{2,31}$/.test(b.user))return bad(403,'계정 로그인이 필요합니다.');
 const rate=await tx.get('records-rate')||{at:Date.now(),n:0};if(Date.now()-rate.at>60000){rate.at=Date.now();rate.n=0;}if(++rate.n>120)return bad(429,'동기화 요청 제한 · 잠시 후 다시 시도하세요.');await tx.put('records-rate',rate);
 const revision=await tx.get('revision')||0;
 if(op==='records-get'){const data=await read(tx,'document');return Response.json({revision,updatedAt:await tx.get('updatedAt')||null,payload:data?await unseal(env,b.user,data):null});}
 if(op==='records-put'){
  if(!Number.isSafeInteger(b.revision)||b.revision!==revision)return bad(409,'다른 기기에서 변경되었습니다. 동기화 충돌을 확인하세요.');
  let payload;try{payload=recordsPayload(b.payload);}catch(_){return bad(400,'개인 자료 형식·크기를 확인하세요.');}
  for(const f of payload.files){const saved=await tx.get('filemeta:'+f.id);if(!saved||saved.hash!==f.hash||saved.bytes!==f.bytes)return bad(400,'첨부 업로드를 먼저 완료하세요.');}
  await write(tx,'document',await seal(env,b.user,payload));await tx.put('revision',revision+1);const updatedAt=new Date().toISOString();await tx.put('updatedAt',updatedAt);return Response.json({revision:revision+1,updatedAt});
 }
 if(!safe(b.id))return bad(400,'첨부 ID를 확인하세요.');
 if(op==='file-get'){const data=await read(tx,'file:'+b.id);return data?Response.json(await unseal(env,b.user,data)):bad(404,'첨부를 찾을 수 없습니다.');}
 if(!metadata(b)||typeof b.data!=='string'||b.data.length!==b.bytes||!/^data:(?:image\/(?:png|jpeg|webp)|application\/pdf);base64,[A-Za-z0-9+/]+=*$/.test(b.data))return bad(400,'첨부 형식·크기를 확인하세요.');
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(b.data)))].map(n=>n.toString(16).padStart(2,'0')).join('');if(hash!==b.hash)return bad(400,'첨부 무결성 확인 실패');
 const saved=await tx.get('filemeta:'+b.id);if(saved)return saved.hash===hash?Response.json({ok:true}):bad(409,'같은 ID의 다른 첨부입니다.');
 const files=await tx.get('files')||[];if(files.length>=30||files.reduce((n,f)=>n+f.bytes,0)+b.bytes>28*1024*1024)return bad(413,'계정 첨부 보관 한도 초과');
 await write(tx,'file:'+b.id,await seal(env,b.user,{id:b.id,owner:b.owner,name:b.name,data:b.data,hash}));await tx.put('filemeta:'+b.id,{hash,bytes:b.bytes});files.push({id:b.id,bytes:b.bytes});await tx.put('files',files);return Response.json({ok:true});
}
