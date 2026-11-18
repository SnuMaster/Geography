# 도쿄 개편 일정의 시간표 연결

2026-11-05 기준. 기존 102개 프로필과 원본 일정·경로·운임은 보존한다.

- 새 출발·도착/직통 조합 48개, 저장 운행 기록 16,792개를 추가했다.
- 기본·대체 일정의 철도 세부 구간 107개 중 103개에 정확히 대응하는 저장 시간표가 있다. 원래 미연결이었던 63개 중 59개를 연결했다.
- Mini Tokyo 3D 고정 커밋 `c708abea8bf05ab56137a50e52c032112b6f9beb`의 23개 입력 JSON을 Git blob SHA-1 및 SHA-256으로 검증한다. 데이터는 `공개 시간표 참고 · 여행일 미검증`으로 표시한다. 다운로드 날짜를 운영사 확인 날짜나 여행일 운행 확정으로 바꾸지 않는다.
- 로망스카/닛코/JR 직통은 원본의 명시적 `nt` 연결만 결합한다. 분기 중 실제 하차역으로 이어지는 경로만 포함한다. 로망스카는 하코네행 특급, 닛코는 게곤·리버티 게곤을 필터링한다. 오다와라·도부도부쓰코엔에서의 가짜 환승을 만들지 않는다.
- 야마노테는 기존 지도 경로의 이동 방향에 맞춰 열차를 선택한다. 반대 방향으로 한 바퀴 도는 열차를 섞지 않는다.
- 케이블카는 운영사 2026-03-16 개정 PDF의 실제 열을 추출한다. 양방향·평일/토휴일 각각 30편이며, 출발역 외 시각은 도착/출발을 추정하지 않고 원문 역별 시각 이벤트로 보존한다.
- 로프웨이 왕복 2개 구간은 공식 연속 순환운행 및 계절별 운영시간으로 안내한다. 약 1분 간격을 이용해 개별 출발 시각·열차번호·카운트다운을 생성하지 않는다.
- 도쿄–아타미 신칸센 왕복 2개 구간은 JR 도카이 공식 조회로 연결한다. 공식 조회는 조회일로부터 1개월 앞까지이므로 2026-11-05 현재 2027-01-21 운행편은 확정할 수 없다. 저장 시각은 제공하지 않는다.
- 실시간 지연·운휴·혼잡·예약 좌석 확인은 별도 연동되지 않았다. 모든 저장 열차는 예정 정보다.

## 재생성

기본 캐시는 체크아웃의 형제 폴더 `../tokyo-timetable-cache`이며 `TOKYO_TIMETABLE_CACHE`로 변경할 수 있다.

```text
node scripts/fetch-tokyo-timetable-sources.cjs
python scripts/extract-hakone-cable-timetable.py ../tokyo-timetable-cache/hakone-202603.pdf
node scripts/build-tokyo-timetables.cjs
node scripts/build-assistant-offline.cjs
node --test tests/*.test.cjs
```

PDF 추출은 `pdfplumber`가 필요하다. 일반 웹 실행에는 Python·API 키·외부 시간표 요청이 필요하지 않다. 정적 JSON을 오프라인 팩에도 포함한다. 개별 팩을 8 MiB 메모리 예산 안으로 유지해 기존 LRU 캐시에서 즉시 제거되는 문제를 방지한다.

출처·해시는 `timetables/tokyo27-source-report.json` 및 `scripts/tokyo-timetable-source-files.json`에 보존한다. Mini Tokyo 3D의 MIT 고지는 `assets/mini-tokyo-3d-LICENSE.txt`에 있으며 오프라인 셸에도 포함한다.
