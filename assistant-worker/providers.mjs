// Server-only model allowlist and conservative standard/long-context tariffs. Checked 2026-11-02.
export const MAX_OUTPUT=1200;
export const MODELS=Object.freeze([
 {id:'gpt-6-luna',label:'GPT-6 Luna',provider:'openai',context:1050000,inputRate:0.25,outputRate:0.75},
 {id:'gpt-6.1-terra',label:'GPT-6.1 Terra',provider:'openai',context:1050000,inputRate:2,outputRate:7.5,countInput:true},
 {id:'gpt-6-sol',label:'GPT-6 Sol',provider:'openai',context:1050000,inputRate:4,outputRate:15,countInput:true},
 {id:'gpt-6-astra',label:'GPT-6 Astra',provider:'openai',context:1050000,inputRate:20,outputRate:75,countInput:true},
 {id:'claude-haiku-5-5',label:'Claude Haiku 5.5',provider:'anthropic',context:1000000,inputRate:0.5,outputRate:2.5},
 {id:'claude-sonnet-5-5',label:'Claude Sonnet 5.5',provider:'anthropic',context:1000000,inputRate:2,outputRate:10},
 {id:'claude-opus-5-5',label:'Claude Opus 5.5',provider:'anthropic',context:1000000,inputRate:4,outputRate:20}
]);
export const providerKey=(env,p)=>p==='openai'?env.OPENAI_API_KEY:p==='anthropic'?env.ANTHROPIC_API_KEY:null;
export function modelFor(env,id=env.MODEL||'gpt-6-luna'){
 const model=MODELS.find(m=>m.id===id);if(!model)throw Error('model');
 // Existing higher deployment bounds remain effective for the default model.
 const custom=id===(env.MODEL||'gpt-6-luna');
 const input=custom?Math.max(model.context,Number(env.MAX_INPUT_TOKENS||model.context)):model.context,inputRate=custom?Math.max(model.inputRate,Number(env.INPUT_USD_PER_MILLION||model.inputRate)):model.inputRate,outputRate=custom?Math.max(model.outputRate,Number(env.OUTPUT_USD_PER_MILLION||model.outputRate)):model.outputRate;
 if(!Number.isSafeInteger(input)||input>2000000||![inputRate,outputRate].every(n=>Number.isFinite(n)&&n>0))throw Error('config');
 return {...model,input,inputRate,outputRate,reserve:Math.ceil(input*inputRate+MAX_OUTPUT*outputRate)};
}
export function catalog(env){return MODELS.map(m=>({id:m.id,label:m.label,provider:m.provider,configured:!!providerKey(env,m.provider),inputUsdPerMillion:m.inputRate,outputUsdPerMillion:m.outputRate,pricingBasis:'보수적 상한 · 캐시 할인 미반영',source:m.provider==='openai'?'https://developers.openai.com/api/docs/pricing':'https://platform.claude.com/docs/en/about-claude/pricing'}));}
// Only a server-obtained count for the exact request may reduce the context-wide hold.
export function reservationFor(model,count){if(!model.countInput)return model.reserve;if(!Number.isSafeInteger(count)||count<0||count+MAX_OUTPUT>model.input)throw Error('count');return Math.ceil(Math.min(model.input,count+1024)*model.inputRate+MAX_OUTPUT*model.outputRate);}
function claudeSchema(value){if(Array.isArray(value))return value.map(claudeSchema);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.entries(value).filter(([k])=>!['maxItems','minItems','maxLength','minLength','minimum','maximum'].includes(k)).map(([k,v])=>[k,claudeSchema(v)]));}
export function providerRequest(model,env,{instructions,input,schema}){
 if(model.provider==='openai')return {url:'https://api.openai.com/v1/responses',headers:{Authorization:'Bearer '+env.OPENAI_API_KEY,'Content-Type':'application/json'},body:{model:model.id,store:false,service_tier:'default',max_output_tokens:MAX_OUTPUT,reasoning:{effort:'low'},instructions,input,text:{format:{type:'json_schema',name:'travel_reply',strict:true,schema}}}};
 const messages=input.map(message=>({role:message.role,content:message.content.map(c=>{if(c.type==='input_text')return {type:'text',text:c.text};const match=/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(c.image_url);if(!match)throw Error('image');return {type:'image',source:{type:'base64',media_type:match[1],data:match[2]}};})}));
 return {url:'https://api.anthropic.com/v1/messages',headers:{'x-api-key':env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01','Content-Type':'application/json'},body:{model:model.id,max_tokens:MAX_OUTPUT,system:instructions,messages,...(model.id==='claude-opus-5-5'?{}:{thinking:{type:'disabled'}}),output_config:{format:{type:'json_schema',schema:claudeSchema(schema)}}}};
}
export function providerReply(model,data){
 const usage=data.usage;if(!usage||![usage.input_tokens,usage.output_tokens].every(n=>Number.isSafeInteger(n)&&n>=0))throw Error('usage');
 if(model.provider==='openai')return {usage,complete:data.status==='completed',text:(data.output||[]).filter(o=>o.type==='message').flatMap(o=>o.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('')};
 const cacheWrite=usage.cache_creation_input_tokens??0,cacheRead=usage.cache_read_input_tokens??0;if(![cacheWrite,cacheRead].every(n=>Number.isSafeInteger(n)&&n>=0)||cacheWrite!==0)throw Error('usage');
 // No cache_control is sent. Count cache reads conservatively at the full input tariff.
 return {usage:{input_tokens:usage.input_tokens+cacheRead,output_tokens:usage.output_tokens},complete:data.stop_reason==='end_turn',text:(data.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('')};
}
