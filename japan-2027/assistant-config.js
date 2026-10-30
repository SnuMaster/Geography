'use strict';
// Public configuration only. Never put an OpenAI key or personal login code here.
globalThis.TravelAssistantConfig=Object.freeze({
 enabled:['snumaster.github.io','codex-japan-ai-assistant.geography-3tt.pages.dev'].includes(globalThis.location?.hostname),
 apiBase:'https://japan-2027-assistant.yonghun0915.workers.dev',
 uberClientId:''
});
