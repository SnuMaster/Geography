# 개인 여행비서 연결 상태

2026-10-29 KST, 기능 브랜치 `codex/japan-ai-assistant`에서 연결했습니다. main 병합은 하지 않았습니다.

- API: `https://japan-2027-assistant.yonghun0915.workers.dev`
- 브랜치 미리보기: `https://codex-japan-ai-assistant.geography-3tt.pages.dev/japan-2027/?day=2`
- 모델: `gpt-6-luna`, 실제 Responses API 호출 성공
- API 키 이름: `Codex`, 선택 조직 Personal / Default project
- 요청한 키 만료일: 2027-01-31 KST
- Cloudflare Secret: `OPENAI_API_KEY`, `LOGIN_CODE_SHA256`, `SESSION_SECRET`
- 월간 OpenAI 비용 상한 추정 한도 $5, 분당 6회, 월 500회
- 날씨 외부 API와 Uber client ID는 아직 미설정

개인 로그인 코드는 개발 기기의 `assistant-worker/.assistant-login-code` 파일에만 보관합니다. 이 파일과 `.dev.vars`는 Git에서 제외됩니다. API 키나 로그인 코드를 커밋·채팅·스크린샷에 넣지 마세요.

미리보기에서 AI 버튼 → 연결·개인정보·사용량 → 개인 로그인 코드 입력 → 로그인 → 질문 제출 순서입니다. API 키를 이 입력란에 넣으면 안 됩니다. 로그인 코드는 기기 내 파일에서 사용자가 복사합니다. 페이지 종료·새로고침 및 30분 만료 뒤에는 다시 로그인합니다.

기술 검증: 배포된 Worker의 허용 Origin OPTIONS 204, 비인증 401, 외부 Origin 403, 개인 코드 로그인 200, 인증 확인 200, 구조화 AI 답변 200, Durable Object 누적 비용 조회 200을 확인했습니다. 테스트 응답은 “API 연결 테스트가 성공했습니다.”, 입력 554 / 출력 24토큰, 보수적 비용 상한 추정 $0.000157이었습니다. 이 금액은 OpenAI 청구서의 확정 금액이나 크레딧 잔액 조회값이 아닙니다.

실제 미리보기 브라우저에서도 개인 코드 로그인과 번역 응답을 확인했습니다. “이 열차는 가와고에에 가나요?”에 “この電車は川越に行きますか？”를 반환했습니다. 번역 모드는 문장 자체를 번역하도록 지시하며, 프런트엔드는 날짜·일정안 식별자만 보내고 GPS·예약·이동 경로는 전송하지 않습니다. 번역 회귀 테스트를 추가해 로컬 Node 검사는 159개가 통과합니다.

프런트엔드는 GitHub와 지정 브랜치 미리보기 도메인에서만 자동 연결합니다. 로컬·CI·다른 미리보기 URL에서는 기본 비활성화하여 테스트가 실제 API를 호출하지 않도록 했습니다. CORS와 별도로 서버가 로그인 토큰을 검증합니다.

재배포는 확인된 로컬 Secret 파일을 사용합니다. 명령 인자나 콘솔에 키 값을 넣지 않습니다.

```powershell
cd assistant-worker
npm exec --yes --package=wrangler -- wrangler deploy --secrets-file .dev.vars
```

키 교체는 새 키를 안전하게 준비하고 Secret을 갱신한 뒤 검증합니다. 누적 예산 객체를 삭제하거나 초기화하지 않습니다. 이전 작성 시점의 기능 상태·미검증 목록은 `japan-2027/ASSISTANT_IMPLEMENTATION.md`에 있으며, 이 파일이 API/Worker 연결 상태의 최신 기록입니다. 실제 iPhone/Android 센서·카메라·키보드 및 Uber 앱 검증은 별도로 남아 있습니다.
## 2026-10-30 커맨드 센터 후속 배포

Worker 버전 `1858af69-585d-4f51-bddf-22d78069846f`에서 인증된 `/exchange` GET을 추가했습니다. ECB JPY/KRW 기준일·조회 시각을 반환하며, OpenAI를 호출하지 않습니다. 실제 조회 200을 확인했습니다. `WEATHER_ENABLED=true`로 설정했고 2027-01-11은 실제 인증 조회에서 `예보 제공 기간 밖`을 반환했습니다. 현재 범위 안의 예보와 실제 휴대폰 센서는 별도 검증이 필요합니다.

최신 UI·기능별 상태·외부 제한은 [커맨드 센터 기록](../japan-2027/COMMAND_CENTER.md)을 보세요. 초기 문서의 날씨 비활성 표기는 이 설정으로 대체합니다. 개인 자료 서버 동기화와 종료/잠금 중 푸시는 미연결입니다.
