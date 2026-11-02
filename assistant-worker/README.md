> 실제 연결 상태와 로그인 방법은 [DEPLOYMENT.md](DEPLOYMENT.md)를 먼저 확인하세요. 아래는 설정 원리와 재배포 안내입니다.

# japan-2027 개인 AI 백엔드 설정

이 폴더는 기존 GitHub Pages 여행 지도를 확장하는 Cloudflare Worker입니다. 프런트엔드 `japan-2027/assistant-config.js`는 **로컬·CI 및 지정 외 도메인에서 비활성화**입니다. 인증·실제 API·모바일 검증 후 활성화하세요. main과 운영 사이트는 이 개발 작업에서 배포하지 않습니다.

## 구성

기존 지도 → `assistant-core.js`의 최소 상태 투영 → `assistant-ui.js` → Bearer 인증 Worker → OpenAI Responses API. 위치·날짜 변경은 상태만 갱신합니다. 질문 제출·사진 분석 클릭에만 OpenAI 호출이 발생합니다. 다음 목적지·일정·예약 조회·경비·지각 계산·표현 카드는 기기에서 처리합니다. AI에 임의 도구 실행 권한은 주지 않으며 지도 열기는 구조화 제안과 실제 ID 검사를 통과한 사용자 클릭으로 실행합니다.

상단 회원가입에서 아이디(영문·숫자·밑줄·하이픈 3~32자)와 비밀번호(4~128자)로 가입합니다. 개인 코드·초대·별도 승인은 필요하지 않습니다. `/account/register`, `/account/login`은 웹 출처에 묶인 기기 저장 세션을 발급합니다. 시간에 따른 자동 만료는 없습니다. 브라우저 localStorage의 routebook-login-v1에는 API 주소·아이디·세션 토큰만 저장하며 비밀번호·API 키는 저장하지 않습니다. 서버에는 세션의 SHA-256 해시와 소유 계정·웹 출처를 저장합니다. 이전 개인 코드 `/session`은 410으로 종료합니다. 기존 계정은 계속 로그인할 수 있습니다.

Durable Object에는 무작위 16바이트 salt와 PBKDF2-SHA256 100,000회 파생 해시만 저장합니다. 중복 아이디는 원자적으로 차단합니다. 가입·로그인은 서버 전체 분당 10회 제한을 공유하고 계정은 최대 1,000개로 제한합니다. 가입한 모든 계정은 같은 서버 전체 AI 예산·요청 한도를 공유합니다. 비밀번호 변경·복구와 기기 간 여행 데이터 동기화는 제공하지 않습니다. 방문·예약·메모는 기존 기기에 저장합니다.

코드만 재배포할 때는 `npx wrangler deploy --keep-vars`를 사용합니다. `--secrets-file`은 실제 비밀 교체를 승인한 경우에만 사용하세요. 일반 배포는 서버에 등록된 Secret을 유지합니다.

## 1. OpenAI 설정

OpenAI 프로젝트에서 제한된 API 키를 생성하고 Responses API와 모델 사용 권한을 확인하세요. 비밀값을 이 저장소, 프런트엔드, 채팅, 명령 인자에 넣지 마세요. 기본 모델 `gpt-6-luna`는 [공식 모델 문서](https://developers.openai.com/api/docs/models/gpt-6-luna)를 확인했습니다. 실제 계정의 모델 접근 권한은 아직 검증하지 않았습니다.

`store:false`, 출력 1,200토큰, 질문 2,000자, 컨텍스트 UTF-8 22KB, 사진 2MB 이하를 적용합니다. 사진은 JPEG/PNG/WebP와 낮은 이미지 detail을 사용합니다. [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)로 답변·지도 제안·추출 후보를 분리합니다. 거절·불완전 응답은 오류로 처리하고 자동 재시도하지 않습니다.

`store:false`는 OpenAI의 모든 보관을 없애는 설정이 아닙니다. 남용 모니터링 등은 계정별 [OpenAI 데이터 정책](https://developers.openai.com/api/docs/guides/your-data)을 따릅니다. 티켓은 QR·바코드·예약번호·개인정보를 사용자가 먼저 가린 뒤 전송해야 합니다.

## 2. Cloudflare 배포

Node.js와 공식 npm Wrangler CLI를 이용합니다. 다음 명령은 이 폴더에서 사용자가 직접 실행합니다.

```powershell
npx wrangler login
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put SESSION_SECRET
npx wrangler deploy
```

Secret 입력 프롬프트에 값을 붙여 넣으세요. `SESSION_SECRET`은 무작위 32바이트 이상 문자열입니다. 기존 `LOGIN_CODE_SHA256` Secret이 남아 있어도 사용하지 않습니다.

`.dev.vars.example`은 필드 안내용입니다. 실제 로컬 값은 `.dev.vars`에만 넣고 Git ignore를 유지하세요. Wrangler 환경별 Secret은 자동 상속을 기대하지 말고 각각 설정하세요. 운영 원본은 `https://snumaster.github.io` 하나이며 CORS 경로에 `/Geography/japan-2027/`를 붙이지 않습니다. 로컬 개발 때만 별도 테스트 Worker에 `http://127.0.0.1:8765`를 허용하세요.

Wrangler는 SQLite Durable Object `BudgetGate`를 마이그레이션으로 생성합니다. KV의 최종 일관성에 의존하지 않고 하나의 객체에서 트랜잭션으로 비용 예약을 직렬화합니다. [Workers 요금](https://developers.cloudflare.com/workers/platform/pricing/)과 [Durable Objects 저장소](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)의 계정 지원을 확인하세요. 런타임·로그·추적의 요청 본문 수집을 추가로 켜지 마세요. 이 구성의 observability는 꺼져 있습니다.

## 3. 예산 제한

기본 월간 OpenAI 예산은 $5, 월 500회, 분당 6회입니다. 로그인·날씨 조회는 각각 전체 분당 10회입니다. 월 경계는 일본·한국 현지 UTC+9입니다. 이 한도는 Worker 인프라 요금이나 다른 앱이 같은 OpenAI 키를 쓰는 비용까지 제한하지 않습니다. 전용 OpenAI 프로젝트/키를 사용하세요.

각 요청 전에 모델 전체 입력 상한 1,050,000토큰과 출력 상한에 대한 **보수적 최대 비용 $0.2634를 우선 예약**합니다. 성공 응답의 실제 `usage`를 받으면 보수적 단가로 정산합니다. 캐시 할인은 계산하지 않습니다. 화면의 토큰 수는 API 사용량이며 비용은 설정 단가에 따른 상한 추정입니다. 실제 청구서는 OpenAI에서 확인하세요.

2026-10-29 확인한 Luna 표준 요금은 입력 $0.10 / 출력 $0.50 per 1M tokens입니다. 코드의 입력 $0.25 / 출력 $0.75는 긴 컨텍스트·캐시 쓰기 단가를 고려한 보수적 상한입니다. 예산 잔액이 요청 예약액보다 작으면 실제 예상 사용액이 작더라도 차단합니다. 예산을 이 예약액보다 작게 설정하면 호출이 막히는 것이 정상입니다. 가격이 오르거나 모델이 바뀌면 먼저 상한을 다시 검증해야 합니다. [공식 가격·모델](https://developers.openai.com/api/docs/models/gpt-6-luna)

시간 초과·API 오류·사용량 누락은 과금 여부가 불명확하므로 예약액을 유지합니다. 재시도는 사용자 실행으로만 합니다. 예약액 해제를 위한 공개 API는 없습니다. 운영자가 OpenAI 사용량을 대조한 뒤 관리해야 하며, 객체를 삭제해 예산을 우회하면 안 됩니다. Worker 재시작·탭 재열기로 한도가 초기화되지 않습니다.

기본 선택 모델은 `MODEL`로 지정하며 서버 `providers.mjs`의 allowlist 안에서만 허용합니다. 새 모델은 공식 입력 상한·가격·이미지 및 JSON 스키마 지원을 확인한 후 allowlist와 테스트를 함께 수정합니다. 기본 모델의 `MAX_INPUT_TOKENS`, `INPUT_USD_PER_MILLION`, `OUTPUT_USD_PER_MILLION` 값은 allowlist 상한을 낮추는 데 사용할 수 없습니다. 자동 상위 모델 전환과 공급자 자동 재시도는 하지 않습니다.

## 4. 프런트엔드 연결

Worker의 `/me`, `/usage`에 비인증 요청이 401, 외부 Origin이 403, 허용 Origin의 OPTIONS가 204인지 확인합니다. 프런트엔드 설정에는 공개 주소와 공개 Uber 클라이언트 ID만 넣습니다.

```js
globalThis.TravelAssistantConfig=Object.freeze({
  enabled:true,
  apiBase:'https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev',
  uberClientId:''
});
```

연결 후 상단 회원가입·로그인 또는 AI 패널의 로그인 버튼을 이용합니다. 로그인 후 질문의 보내기 버튼을 다시 눌러야 AI 요청이 발생합니다. 로그아웃 시 브라우저 저장 세션을 지우고 /account/logout에서 해당 서버 세션도 폐기합니다. 다른 탭의 로그인 상태도 함께 갱신합니다. 새로고침·재실행·30분 경과로 로그아웃하지 않습니다. 서버 폐기·브라우저 사이트 데이터 삭제·세션 서명 Secret 교체 시에는 재로그인이 필요합니다. 기기 저장이 차단되면 이번 창에서만 유지됨을 표시합니다. 오프라인 로그아웃은 기기 저장을 지우며 서버 폐기를 확인하지 못했음을 표시합니다. 계정당 최근 세션 64개까지 유지해 저장량을 제한합니다.

GitHub Pages와 Workers 간 요청은 `credentials:omit`와 Authorization 헤더를 사용합니다. CORS는 인증 수단이 아닙니다. 제3자 인증 쿠키가 없어 Safari 쿠키 차단 문제를 피하는 설계지만 **운영 도메인에서의 iPhone Safari/Android Chrome 로그인은 아직 실검증하지 않았습니다.** 실제 기기에서 코드 로그인→질문→만료→재로그인→오프라인을 확인한 뒤 운영 활성화하세요. HTTPS의 정상 브라우저 탭에서 테스트하세요.

설정을 바꾸거나 정적 코드를 수정한 후 저장소 루트에서 실행합니다.

```powershell
node scripts/build-assistant-offline.cjs
node --test tests/*.test.cjs
node scripts/japan-qa.cjs
```

오프라인 패키지 revision을 바꿀 때 `sw.js`, `offline-pack.js`, 두 빌더와 테스트 fixture를 함께 맞춥니다. 이번 revision은 `20261029-assistant-2`입니다. `.gitattributes`는 Windows와 Pages 사이의 줄바꿈 차이로 무결성 해시가 달라지는 문제를 방지합니다. Leaflet vendor CSS의 원본 CRLF는 그대로 보존합니다.

## 5. 외부 서비스와 추가 비용

| 서비스 | 현재 연결 및 제한 | 추가 설정·비용 |
| --- | --- | --- |
| OpenAI | 텍스트 번역·질문·사진 후보 추출 구현, 실제 호출 미검증 | API 과금, 전용 프로젝트 키 필요. 위 모델 문서 참조 |
| Cloudflare | Worker + SQLite Durable Object 코드 | Free 포함량/계정 지원 확인, Paid는 최소 월 $5 및 초과 사용. AI 예산과 별도 |
| Open-Meteo | 인증된 `/weather`, 목적지 좌표를 0.01도로 축약, 16일 범위 검사 | 기본 꺼짐. `WEATHER_ENABLED=true`로 개인 비상업용 허용 시 활성화. [정책·제한](https://open-meteo.com/en/pricing): 무료 비상업용, 일 10,000회 등. 상업용은 유료 계약·엔드포인트 변경 필요 |
| Uber | 공식 Universal Link 생성, 자동 호출·결제 없음 | 등록된 공개 client ID와 실기기 검증 필요. 실제 요금은 앱에서 확인. [공식 딥링크](https://developer.uber.com/docs/riders/ride-requests/tutorials/deep-links/introduction) |
| 열차 실시간 지연·운휴 | 운영사 실시간 공급 계약 없음 | 미연결, 기존 시간표만 사용. 노선별 공식 공급원·인증·라이선스가 확보된 후 추가 |
| 장소 영업시간·실시간 경로·환율 | 새 외부 API 미연결 | 기존 출처/자료 확인일 또는 확인 필요. 향후 공급자 약관·요금·키 검증 필요 |
| 음성 | 브라우저 한국어·일본어 음성 검사 후 수동 재생 | 별도 OpenAI TTS 호출/요금 없음, 기기 음성 설치 필요할 수 있음 |

오늘(2026-10-29)은 2027년 1월 여행의 예보 제공 기간 밖입니다. 미래 기후 평균을 여행 당일 예보처럼 제시하지 않습니다. 시간표도 98개는 현재판 참고이며 4개는 기존 검증 규칙상 여행일에 만료되어 있습니다. 현장 확인 없이 이를 실시간이나 2027 확정 시간표로 승격하지 않습니다.

## 6. 배포 후 수동 검증

아직 Cloudflare 계정·OpenAI 비밀키를 제공받지 않아 이 절차는 미실행입니다.

1. 비인증 요청 차단, 잘못된 비밀번호/만료 토큰 차단, 허용하지 않은 Origin 차단을 실제 Worker에서 확인합니다.
2. 소액으로 한 번 질문하고 API의 `usage`와 UI 토큰·비용·DO 누적값을 대조합니다. 테스트 Worker에서 예산 소진·동시 요청·재시작 후 한도 유지를 확인합니다.
3. iPhone Safari/Android Chrome의 코드 로그인, 키보드 입력창 노출, 지도 조작, GPS 허용/거절, 나침반 미지원, 카메라/앨범 선택과 가린 테스트 티켓을 확인합니다.
4. 개발자 도구 Network에서 날짜/대체안/뒤로가기/GPS만으로 `/chat`이 호출되지 않고, 위치 전송을 끄면 좌표가 없음을 확인합니다.
5. 전체 오프라인 저장 후 비행기 모드·새로고침에서 22일 일정·시간표·방문 체크·표현 카드를 확인합니다. AI API 응답이 Cache Storage에 없는지 확인합니다.
6. 실제 Uber 앱에서 목적지 전달을 확인하되 테스트 중 최종 호출하지 않습니다. 공식 열차·장소 자료는 방문 전 재확인합니다.

회귀 테스트와 기능별 상태는 `../japan-2027/ASSISTANT_IMPLEMENTATION.md`에 기록합니다.


## GPT·Claude 모델 선택과 사용량

서버 전용 providers.mjs에 허용 모델·입출력 단가·최대 입력 상한을 둡니다. GPT-6 Luna/Sol은 기존 OPENAI_API_KEY, Claude Haiku/Sonnet/Opus 5.5는 선택 사항인 ANTHROPIC_API_KEY를 사용합니다. 키는 서버 Secret에만 둡니다. 클라이언트가 제공한 키·가격·임의 모델 ID는 사용하지 않습니다. GPT는 Responses store:false, Claude는 Messages 구조화 JSON을 사용하며 기존 장소 ID·사진 동의·개인정보 경계를 유지합니다. Claude 키가 없으면 API는 생성 요청을 거부하고 UI 선택도 비활성화합니다. 모델 목록의 키 등록됨은 계정별 모델 접근 보장이 아니며 실제 접근은 요청 시 확인합니다.

GET /models와 GET /usage는 로그인 후에만 읽을 수 있습니다. 모델 선택·목록 갱신은 유료 생성 요청을 실행하지 않습니다. POST /chat와 /analyze에 model ID를 전달합니다. 비용 예약은 서버의 모델별 보수적 상한으로 계산하고 모든 공급자가 기존 월 $5/500회·분당 6회 한도를 함께 사용합니다. 결과의 실제 입력·출력 토큰에 서버 단가를 곱한 예상 비용으로 정산합니다. 캐시 할인은 반영하지 않고 Claude Haiku의 긴 입력 단가를 사용하므로 공급자 청구서와 다를 수 있습니다. 실패·시간 초과로 사용량을 확인할 수 없으면 기존처럼 예약 비용을 유지하고 자동 재시도하지 않습니다. 모델별 집계는 이 기능 적용 후 확인한 사용량부터입니다.

창에는 확인된 입력·출력/누적 토큰과 사이트 남은 사용·예약 예산을 표시합니다. 실제 API 계정의 남은 크레딧/토큰을 조회하는 기능은 없습니다. 타 앱의 사용·크레딧 지급·구매·만료를 임의로 추산하지 않습니다. 도구에는 공급자 Billing 페이지 링크를 제공합니다. 참고: [OpenAI Usage API](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage), [Claude Usage and Cost API](https://platform.claude.com/docs/en/manage-claude/usage-cost-api). 조직 전체 사용량의 관리자 조회를 일반 모델 키로 우회하지 않습니다.

Claude 사용 준비: Claude Console에서 본인이 API 키를 발급한 후 Cloudflare의 japan-2027-assistant → Settings → Variables and Secrets에서 ANTHROPIC_API_KEY를 Secret으로 추가합니다. 또는 로컬에서 npx --no-install wrangler secret put ANTHROPIC_API_KEY를 실행해 비공개 프롬프트에 직접 입력합니다. 키를 채팅·Git·브라우저 저장소에 붙여넣지 마세요. 등록 후 모델/사용량 새로고침으로 활성화 여부를 확인합니다. 계정·이용약관·크레딧 등록은 사용자가 직접 진행합니다. 현재 Claude 키는 미등록이고 실제 Claude 응답/계정 접근은 미검증입니다.

단가·모델 정보 확인일 2026-11-02: [OpenAI 가격](https://developers.openai.com/api/docs/pricing), [Claude 모델](https://platform.claude.com/docs/en/models/overview), [Claude 가격](https://platform.claude.com/docs/en/about-claude/pricing), [Claude 구조화 출력](https://platform.claude.com/docs/en/build-with-claude/structured-outputs). 가격/모델을 바꿀 때 서버 allowlist·예약 상한과 테스트를 함께 검토하세요.
# Astra·Terra 추가 · 2026-11-02

모델 선택에 `gpt-6-astra`(GPT-6 Astra), `gpt-6.1-terra`(GPT-6.1 Terra)를 추가했습니다. 기본 Luna와 기존 Sol/Claude 선택은 유지합니다. 동일한 서버 OpenAI Secret을 사용하며 새 키는 필요하지 않습니다. 브라우저 목록은 인증된 `/models`에서 받아오므로 모델·사용량 새로고침 또는 사이트 재실행으로 갱신합니다.

두 모델은 사용자가 질문 또는 동의한 사진 분석을 실행할 때만 동일한 요청의 입력을 `/v1/responses/input_tokens`로 먼저 계산합니다. 실패·잘못된 토큰 수는 생성 전에 차단합니다. 서버에서 확인한 입력 수에 1,024토큰 여유와 최대 출력 1,200토큰을 더해 비용을 예약하며 클라이언트 토큰 수·요율은 무시합니다. 전체 컨텍스트 비용을 매번 예약해서 Astra가 월 $5 한도에 항상 막히는 문제를 피합니다. 긴 컨텍스트 상한 요율은 Astra 입력 $20/출력 $75, Terra 입력 $2/출력 $7.5(각 100만 토큰당), 캐시 할인 미반영입니다. 실제 청구액은 더 낮을 수 있으며 기존 표시는 예상 비용입니다. 월 예산·요청 횟수와 생성 분당 제한은 유지하고 입력 계산에도 외부 조회 제한을 적용합니다.

공식 근거: [Astra](https://developers.openai.com/api/docs/models/gpt-6-astra), [Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra), [입력 토큰 계산](https://developers.openai.com/api/docs/guides/token-counting). 기존 키로 두 모델 메타데이터와 공개 텍스트/JSON schema 입력 계산의 200 응답을 확인했습니다. 실제 유료 답변 생성은 실행하지 않았습니다. Claude 키는 여전히 미설정입니다.
# Sol의 입력량 기준 예약 · 2026-11-02

GPT-6 Sol도 Astra/Terra와 동일하게 서버에서 `/v1/responses/input_tokens`로 요청 입력을 확인한 뒤 비용을 예약합니다. 입력 100토큰의 보수적 예약액은 $0.022496(입력 수+1,024 여유, 최대 출력 1,200)이며 $1 월 한도로도 요청할 수 있음을 대체 API로 검증했습니다. 기존 전체 컨텍스트 기준 $4.218 예약은 Sol에 적용하지 않습니다. 서버 요율·월 한도·분당 요청 제한, 불명확한 실패의 예약 유지 정책은 변경하지 않습니다. 과거 사용/예약액은 초기화하지 않습니다. 기존 키를 그대로 사용하며 실제 답변 생성은 테스트에서 실행하지 않았습니다.
