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

## 실연동 현황

- ✅ **카카오 로컬 API** (`src/services/kakaoGeocode.js`) — 실키로 검증 완료, 6시간 캐시 적용
- ✅ **ODsay** (`src/services/odsay.js`) — 실키로 검증 완료 (Server 플랫폼 + 공인 IP 등록 필요했음),
  실제 응답 필드가 `lastTrain.js`의 `buildCandidate()`가 기대하는 형태
  (`subPath[].trafficType/lane/startName/endName/sectionTime`)와 일치함을 확인. 5분 캐시 적용.
- ⚠️ **지하철 역명 검색** (서울 열린데이터광장 `SearchInfoBySubwayNameService`) — 키 발급 및 호출 확인됨.
  단, 아직 코드에는 연결 안 되어 있음 (막차 시각 API가 죽어있어 당장 활용처가 없음).
- ⚠️ **버스 정류소 검색** (`getStationByName`, data.go.kr) — 호출 확인됨. `getBustimeByStationList`(첫차/막차)는
  같은 키로 401 발생, 별도 오퍼레이션 승인 필요한 것으로 보임.

## 아직 실제 데이터로 못 바꾼 부분 (TODO)

1. **`src/services/lastTrain.js`의 `lookupLastDeparture()`** — 지금도 지하철 24:00 / 버스 23:30
   하드코딩된 mock입니다. **서울교통공사 지하철 막차 시간표 API가 사실상 폐지된 상태**로 확인됐습니다
   (서울 열린데이터광장의 관련 데이터셋 OA-101/108/109/1190/15492 전부 "서비스 종료" 배너 확인,
   서비스명 후보 13개 이상 시도했지만 전부 실패). data.go.kr 카탈로그(15058970 등)는 아직 "자동승인"으로
   남아있으나 실제 백엔드가 죽어있는 것으로 보임. 대안 데이터 소스를 찾으면 교체 예정.
2. **버스 막차 시각** — `getBustimeByStationList` 오퍼레이션이 401(등록되지 않은 서비스키)로 거부됨.
   data.go.kr 마이페이지에서 이 오퍼레이션이 실제로 승인 목록에 있는지 재확인 필요.
3. **`src/routes/alternatives.js`** — 심야버스 노선·대기 장소 데이터 소스가 아직 미확정 (PRD 10장).

이 세 가지 외에는 PRD의 F1~F6 로직(도보속도 보정, 역산 알람 시각 계산, 환승 여유시간 등급,
Push 등급 전이 감지)이 모두 실제로 동작하는 코드로 구현되어 있습니다.
