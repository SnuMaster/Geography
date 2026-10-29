# japan-2027 개인 AI 백엔드 설정

이 폴더는 기존 GitHub Pages 여행 지도를 확장하는 Cloudflare Worker입니다. 프런트엔드 `japan-2027/assistant-config.js`는 **기본 비활성화**입니다. 인증·실제 API·모바일 검증 후 활성화하세요. main과 운영 사이트는 이 개발 작업에서 배포하지 않습니다.

## 구성

기존 지도 → `assistant-core.js`의 최소 상태 투영 → `assistant-ui.js` → Bearer 인증 Worker → OpenAI Responses API. 위치·날짜 변경은 상태만 갱신합니다. 질문 제출·사진 분석 클릭에만 OpenAI 호출이 발생합니다. 다음 목적지·일정·예약 조회·경비·지각 계산·표현 카드는 기기에서 처리합니다. AI에 임의 도구 실행 권한은 주지 않으며 지도 열기는 구조화 제안과 실제 ID 검사를 통과한 사용자 클릭으로 실행합니다.

개인용 무작위 코드의 SHA-256만 서버 Secret으로 보관합니다. `/session`에서 코드를 검증해 원본 웹 출처에 묶인 30분 HMAC 세션을 발급합니다. 토큰은 브라우저 메모리에만 보관하며 쿠키·localStorage·URL에 넣지 않습니다. 단일 사용자 전용이므로 예산과 속도 제한은 사용자 한 명 전체에 적용됩니다. 멀티유저 서비스용 인증 체계는 아닙니다.

## 1. OpenAI 설정

OpenAI 프로젝트에서 제한된 API 키를 생성하고 Responses API와 모델 사용 권한을 확인하세요. 비밀값을 이 저장소, 프런트엔드, 채팅, 명령 인자에 넣지 마세요. 기본 모델 `gpt-6-luna`는 [공식 모델 문서](https://developers.openai.com/api/docs/models/gpt-6-luna)를 확인했습니다. 실제 계정의 모델 접근 권한은 아직 검증하지 않았습니다.

`store:false`, 출력 1,200토큰, 질문 2,000자, 컨텍스트 UTF-8 22KB, 사진 2MB 이하를 적용합니다. 사진은 JPEG/PNG/WebP와 낮은 이미지 detail을 사용합니다. [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)로 답변·지도 제안·추출 후보를 분리합니다. 거절·불완전 응답은 오류로 처리하고 자동 재시도하지 않습니다.

`store:false`는 OpenAI의 모든 보관을 없애는 설정이 아닙니다. 남용 모니터링 등은 계정별 [OpenAI 데이터 정책](https://developers.openai.com/api/docs/guides/your-data)을 따릅니다. 티켓은 QR·바코드·예약번호·개인정보를 사용자가 먼저 가린 뒤 전송해야 합니다.

## 2. Cloudflare 배포

Node.js와 공식 npm Wrangler CLI를 이용합니다. 다음 명령은 이 폴더에서 사용자가 직접 실행합니다.

```powershell
npx wrangler login
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put LOGIN_CODE_SHA256
npx wrangler secret put SESSION_SECRET
npx wrangler deploy
```

Secret 입력 프롬프트에 값을 붙여 넣으세요. 로그인 코드는 암호학적으로 무작위인 최소 32바이트를 base64url로 표현한 개인 전용 값으로 생성하고 안전한 비밀번호 관리자에 보관합니다. `LOGIN_CODE_SHA256`에는 그 코드 **문자열의 SHA-256 소문자 hex**를 넣습니다. `SESSION_SECRET`은 로그인 코드와 별개인 무작위 32바이트 이상 문자열입니다. 약한 문장을 긴 코드처럼 사용하지 마세요.

`.dev.vars.example`은 필드 안내용입니다. 실제 로컬 값은 `.dev.vars`에만 넣고 Git ignore를 유지하세요. Wrangler 환경별 Secret은 자동 상속을 기대하지 말고 각각 설정하세요. 운영 원본은 `https://snumaster.github.io` 하나이며 CORS 경로에 `/Geography/japan-2027/`를 붙이지 않습니다. 로컬 개발 때만 별도 테스트 Worker에 `http://127.0.0.1:8765`를 허용하세요.

Wrangler는 SQLite Durable Object `BudgetGate`를 마이그레이션으로 생성합니다. KV의 최종 일관성에 의존하지 않고 하나의 객체에서 트랜잭션으로 비용 예약을 직렬화합니다. [Workers 요금](https://developers.cloudflare.com/workers/platform/pricing/)과 [Durable Objects 저장소](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)의 계정 지원을 확인하세요. 런타임·로그·추적의 요청 본문 수집을 추가로 켜지 마세요. 이 구성의 observability는 꺼져 있습니다.

## 3. 예산 제한

기본 월간 OpenAI 예산은 $5, 월 500회, 분당 6회입니다. 로그인·날씨 조회는 각각 전체 분당 10회입니다. 월 경계는 일본·한국 현지 UTC+9입니다. 이 한도는 Worker 인프라 요금이나 다른 앱이 같은 OpenAI 키를 쓰는 비용까지 제한하지 않습니다. 전용 OpenAI 프로젝트/키를 사용하세요.

각 요청 전에 모델 전체 입력 상한 1,050,000토큰과 출력 상한에 대한 **보수적 최대 비용 $0.2634를 우선 예약**합니다. 성공 응답의 실제 `usage`를 받으면 보수적 단가로 정산합니다. 캐시 할인은 계산하지 않습니다. 화면의 토큰 수는 API 사용량이며 비용은 설정 단가에 따른 상한 추정입니다. 실제 청구서는 OpenAI에서 확인하세요.

2026-10-29 확인한 Luna 표준 요금은 입력 $0.10 / 출력 $0.50 per 1M tokens입니다. 코드의 입력 $0.25 / 출력 $0.75는 긴 컨텍스트·캐시 쓰기 단가를 고려한 보수적 상한입니다. 예산 잔액이 요청 예약액보다 작으면 실제 예상 사용액이 작더라도 차단합니다. 예산을 이 예약액보다 작게 설정하면 호출이 막히는 것이 정상입니다. 가격이 오르거나 모델이 바뀌면 먼저 상한을 다시 검증해야 합니다. [공식 가격·모델](https://developers.openai.com/api/docs/models/gpt-6-luna)

시간 초과·API 오류·사용량 누락은 과금 여부가 불명확하므로 예약액을 유지합니다. 재시도는 사용자 실행으로만 합니다. 예약액 해제를 위한 공개 API는 없습니다. 운영자가 OpenAI 사용량을 대조한 뒤 관리해야 하며, 객체를 삭제해 예산을 우회하면 안 됩니다. Worker 재시작·탭 재열기로 한도가 초기화되지 않습니다.

모델 교체는 `MODEL`, `MAX_INPUT_TOKENS`, `INPUT_USD_PER_MILLION`, `OUTPUT_USD_PER_MILLION`을 함께 변경합니다. 기본 모델의 문서상 상한보다 낮은 설정은 거부합니다. 다른 모델은 공식 최대 입력·가격·이미지 및 JSON 스키마 지원을 검증한 뒤 `VERIFIED_CUSTOM_MODEL`을 해당 모델 ID로 명시해야 합니다. 자동 상위 모델 전환은 구현하지 않았습니다.

## 4. 프런트엔드 연결

Worker의 `/me`, `/usage`에 비인증 요청이 401, 외부 Origin이 403, 허용 Origin의 OPTIONS가 204인지 확인합니다. 프런트엔드 설정에는 공개 주소와 공개 Uber 클라이언트 ID만 넣습니다.

```js
globalThis.TravelAssistantConfig=Object.freeze({
  enabled:true,
  apiBase:'https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev',
  uberClientId:''
});
```

연결 후 AI 패널의 `연결·개인정보·사용량`에서 개인 코드로 로그인합니다. 로그아웃·페이지 종료 시 세션을 지웁니다. 페이지 새로고침 또는 30분 만료 후 재로그인합니다. 이미 발급한 토큰을 서버에서 즉시 폐기하려면 `SESSION_SECRET`을 교체합니다. 개인 코드만 바꾸면 기존 토큰은 최대 30분간 유효할 수 있습니다.

GitHub Pages와 Workers 간 요청은 `credentials:omit`와 Authorization 헤더를 사용합니다. CORS는 인증 수단이 아닙니다. 제3자 인증 쿠키가 없어 Safari 쿠키 차단 문제를 피하는 설계지만 **운영 도메인에서의 iPhone Safari/Android Chrome 로그인은 아직 실검증하지 않았습니다.** 실제 기기에서 코드 로그인→질문→만료→재로그인→오프라인을 확인한 뒤 운영 활성화하세요. HTTPS의 정상 브라우저 탭에서 테스트하세요.

설정을 바꾸거나 정적 코드를 수정한 후 저장소 루트에서 실행합니다.

```powershell
node scripts/build-assistant-offline.cjs
node --test tests/*.test.cjs
node scripts/japan-qa.cjs
```

오프라인 패키지 revision을 바꿀 때 `sw.js`, `offline-pack.js`, 두 빌더와 테스트 fixture를 함께 맞춥니다. 이번 revision은 `20261029-assistant-1`입니다. `.gitattributes`는 Windows와 Pages 사이의 줄바꿈 차이로 무결성 해시가 달라지는 문제를 방지합니다. Leaflet vendor CSS의 원본 CRLF는 그대로 보존합니다.

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

1. 개인 코드 없이 차단, 잘못된 코드/만료 토큰 차단, 허용하지 않은 Origin 차단을 실제 Worker에서 확인합니다.
2. 소액으로 한 번 질문하고 API의 `usage`와 UI 토큰·비용·DO 누적값을 대조합니다. 테스트 Worker에서 예산 소진·동시 요청·재시작 후 한도 유지를 확인합니다.
3. iPhone Safari/Android Chrome의 코드 로그인, 키보드 입력창 노출, 지도 조작, GPS 허용/거절, 나침반 미지원, 카메라/앨범 선택과 가린 테스트 티켓을 확인합니다.
4. 개발자 도구 Network에서 날짜/대체안/뒤로가기/GPS만으로 `/chat`이 호출되지 않고, 위치 전송을 끄면 좌표가 없음을 확인합니다.
5. 전체 오프라인 저장 후 비행기 모드·새로고침에서 22일 일정·시간표·방문 체크·표현 카드를 확인합니다. AI API 응답이 Cache Storage에 없는지 확인합니다.
6. 실제 Uber 앱에서 목적지 전달을 확인하되 테스트 중 최종 호출하지 않습니다. 공식 열차·장소 자료는 방문 전 재확인합니다.

회귀 테스트와 기능별 상태는 `../japan-2027/ASSISTANT_IMPLEMENTATION.md`에 기록합니다.
