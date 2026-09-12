# Newbiton Backend

PRD `docs/PRD_Newbiton.md` 5장(API 명세)을 구현한 Express 서버입니다.

## 실행 방법

```bash
cd backend
npm install
cp .env.example .env   # 키가 아직 없어도 mock으로 동작합니다
npm run dev            # http://localhost:4000
```

`.env`에 아래 값이 비어 있으면 해당 기능은 **자동으로 mock 데이터**를 반환합니다 (개발이 막히지 않도록):

- `KAKAO_REST_API_KEY` 없음 → `/api/geocode`가 mock 후보 반환
- `ODSAY_API_KEY` 없음 → `/api/routes`가 mock 경로 후보 반환
- `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` 없음 → 등급 계산은 정상 동작하지만 실제 Push는 발송되지 않음 (콘솔에 경고만 출력)

키가 준비되면 `.env`에 채워 넣기만 하면 되고, 코드 수정은 필요 없습니다.

### VAPID 키 생성
```bash
npm run generate-vapid
```
출력된 두 줄을 `.env`에 붙여넣으세요.

## 엔드포인트 (PRD 5장 참고)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/health` | 서버 상태 확인 |
| GET | `/api/geocode?query=` | 역명/장소/주소 검색 → 좌표 후보 |
| GET | `/api/routes?startX=&startY=&endX=&endY=&walkSpeed=상\|중\|하` | 경로 후보 목록 (막차 기준 역산 알람 시각·환승 여유등급 포함) |
| POST | `/api/push/subscribe` | Push 구독 + 선택 경로 저장 |
| DELETE | `/api/push/subscribe/:id` | 구독 해제 |
| GET | `/api/alternatives?lat=&lng=` | 막차 실패 시 대안 교통편·대기 장소 |

요청/응답 예시는 PRD 5장에 있는 것과 동일합니다.

## 아직 실제 데이터로 안 바꾼 부분 (TODO)

1. **`src/services/lastTrain.js`의 `lookupLastDeparture()`** — 지금은 지하철 24:00 / 버스 23:30로
   하드코딩된 mock입니다. 서울교통공사 첫차·막차 정보 API(공공데이터포털)로 교체 필요.
2. **`src/services/odsay.js`** — 실제 ODsay 키로 처음 호출해보면 응답 필드명이 문서와 다를 수 있으니,
   `rawPaths` 구조를 콘솔로 한 번 확인하고 `lastTrain.js`의 `buildCandidate()`가 기대하는
   형태(`subPath[].trafficType/lane/startName/endName/sectionTime`)와 맞는지 검증하세요.
3. **`src/routes/alternatives.js`** — 심야버스 노선·대기 장소 데이터 소스가 아직 미확정 (PRD 10장).

이 세 가지 외에는 PRD의 F1~F6 로직(도보속도 보정, 역산 알람 시각 계산, 환승 여유시간 등급,
Push 등급 전이 감지)이 모두 실제로 동작하는 코드로 구현되어 있습니다.
