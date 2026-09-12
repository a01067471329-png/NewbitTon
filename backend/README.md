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
- `ODSAY_API_KEY` 없음 → `/api/routes`가 mock 경로 후보 반환 (막차 시각도 mock: 지하철 24:00 / 버스 23:30)
- `BUS_STATION_INFO_API_KEY` 없음 → 버스 막차는 ODsay 기점 기준 시각으로 대체(정확도 낮음), 그마저 없으면 23:30 mock
- `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` 없음 → 등급 계산은 정상 동작하지만 실제 Push는 발송되지 않음 (콘솔에 경고만 출력)

카카오맵 콘솔에서 REST API 키를 쓰려면 **제품 설정 → 카카오맵 → 활성화**가 켜져 있어야 하고,
ODsay는 콘솔의 **서비스 플랫폼 환경**을 `Server`로 설정하고 백엔드 서버의 공인 IP를 등록해야 인증이 통과합니다
(둘 다 REST API 키 자체는 유효한데 이 설정이 안 되어 있으면 각각 `NotAuthorizedError` / `ApiKeyAuthFailed`가 납니다).
**네트워크(와이파이)를 바꾸면 공인 IP도 바뀌어서 ODsay 인증이 다시 깨집니다** — 데모 중에는 네트워크를 바꾸지 마세요.

키가 준비되면 `.env`에 채워 넣기만 하면 되고, 코드 수정은 필요 없습니다.

### ⚠️ ODsay 호출 한도 (일 30건, Basic 플랜)

ODsay Basic 플랜의 실제 한도는 **하루 30건**입니다(공식 요금제 페이지 기준. 처음에 "1,000건"으로 잘못
알고 있었으니 주의). 데모 중 몇 번만 새로고침해도 소진될 수 있는 수준이라 아래 두 가지 안전장치를
넣어뒀습니다.

- **20시간 캐시** (`src/services/odsay.js`) — 같은 출발-도착 좌표 조합은 하루 안에 결과가 안 바뀌므로,
  리허설·데모에서 같은 경로를 반복 조회해도 실제 호출은 처음 한 번뿐입니다.
- **실패 시 mock 자동 폴백** — 한도 초과(`429`)나 그 외 오류가 나도 `/api/routes`가 502로 죽지 않고
  mock 경로 후보를 반환합니다(`mocked: true`). 데모 중 앱이 완전히 멈추는 것보다는 낫습니다.

한도를 늘리려면 ODsay LAB 구매문의로 Standard(10만 건/일) 업그레이드를 문의해야 하며 즉시 처리되지
않을 수 있습니다. 오늘은 **가급적 같은 데모 경로 1~2개로 반복 테스트**하는 걸 추천합니다(캐시가 그
경로들을 흡수해줍니다).

한도 초과 시 확인해본 대안:
- TOPIS `getPathInfoByBusNSub`(data.go.kr 15000414, `TRANSIT_PATH_API_KEY`) — 버스 경로는 실제로 나오지만
  **지하철 경로가 전혀 안 나옴**(`getPathInfoBySubway`도 파라미터를 못 찾음). 반쪽짜리라 통합 보류.
- TMAP 대중교통 API — 무료 한도가 **일 10건**이라 ODsay보다도 작아서 대안이 안 됨.
- 결론: 코드 레벨 백업보다 **캐시+mock 폴백으로 버티는 게 최선**.

### VAPID 키 생성
```bash
npm run generate-vapid
```
출력된 두 줄을 `.env`에 붙여넣으세요.

## 엔드포인트 (PRD 5장 v2 참고)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/health` | 서버 상태 확인 |
| GET | `/api/geocode?query=` | 역명/장소/주소 검색 → 좌표 후보 |
| GET | `/api/routes?startX=&startY=&endX=&endY=&walkSpeed=느림\|보통\|빠름\|맞춤형&personalFactor=` | 경로 후보 목록 (막차 기준 역산 알람 시각·환승 여유등급·구간별 좌표 포함) |
| POST | `/api/push/subscribe` | Push 구독 + 선택 경로 저장 |
| DELETE | `/api/push/subscribe/:id` | 구독 해제 |
| GET | `/api/alternatives?lat=&lng=&segmentId=` | 특정 구간(환승 지점/최종 목적지) 기준 대안 교통편·대기 장소 |

요청/응답 예시는 PRD 5장에 있는 것과 동일합니다. `walkSpeed=맞춤형`일 때 `personalFactor`가 없거나
잘못된 값이면 "보통"(1.0배)으로 대체됩니다.

## 막차 데이터 실연동 현황

`src/services/lastTrain.js`가 실제 막차/막버스 시각을 조회합니다. 소스별로 확인된 상태:

- ✅ **지하철** — ODsay `searchSubwaySchedule`을 사용합니다. 경로탐색 응답의 역 ID(`startID`)를 그대로
  넘겨서 별도 역 검색이 필요 없고, 응답이 평일/토요일/일요일·공휴일 시간표를 따로 제공하며
  `firstLastFlag`로 막차를 직접 표시해줘서 가장 깔끔하고 정확했습니다.
  (처음엔 국토교통부 TAGO API로 구현했는데, 역에 따라 주말 시간표가 통째로 비어있는 경우가 있어서
  ODsay 쪽으로 교체했습니다 — 자세한 내용은 git 히스토리 참고)
- ✅ **버스** — 서울시 TOPIS `getBustimeByStation`(정류장+노선 기준, `BUS_STATION_INFO_API_KEY`)을 우선 사용하고,
  실패하면 ODsay `busLaneDetail`(기점 기준이라 정확도는 떨어짐)로 대체합니다.
  TOPIS 응답은 자정을 넘겨 운행하는 노선의 막차를 00~03시대의 작은 숫자로 주는데, 이걸 "오늘 새벽에
  이미 지난 시각"으로 잘못 해석하지 않도록 첫차 시각과 비교해 자정 이후로 보정하는 로직이 들어가
  있습니다. 다만 일부 심야버스(N-노선)는 TOPIS 자체 데이터가 "오늘"을 어느 기준으로 잡는지 애매해서
  (예: N31이 00:34~02:19라는, 심야 전용 노선치고는 부자연스러운 짧은 구간만 보고됨) 여전히 부정확할
  수 있습니다.
- ⚠️ **주말/공휴일 정확도**: 지하철은 실제 요일별 시간표를 반영합니다. 버스는 TOPIS가 요일 구분 없이
  "오늘"의 첫/막차만 주기 때문에 평일과 주말을 구분하지 못합니다 (TOPIS 자체 한계).
- 호출 절약을 위해 지하철/버스 막차 조회 모두 24시간 인메모리 캐시가 적용되어 있습니다.

## F6 대안 안내 실연동 현황 (`src/services/alternatives.js`)

- ✅ **심야버스** — TOPIS `getStationByPos`(반경 내 정류소) + `getRouteByStation`(정류소별 노선)을 조합해
  "N" + 숫자로만 된 노선명(N61, N75 등)만 필터링. 경기/인천 노선이 우연히 N으로 시작하는 경우
  (예: "N999고양") 걸러내기 위해 정규식을 전체 일치로 검사합니다.
- ✅ **대기 장소** — 카카오 로컬 API 카테고리 검색(`CS2`=편의점), 기존 카카오 키 재사용.
- ⚠️ **택시** — 좌표별 승차장 데이터가 마땅치 않아 고정 안내만 제공 (`택시 승차 지점`).
- ⚠️ **첫차까지 대기** — 좌표 → 인근 지하철역 매핑 수단이 없어서(ODsay `pointSearch`가 정확한 API인데
  Basic 플랜에서 권한 자체가 막혀있음, `ApiKeyAuthFailed`) mock 유지 (`firstTrainTime: null`).

## 아직 실제 데이터로 못 바꾼 부분 (TODO)

1. **첫차까지 대기(F6)** — 위 참고. ODsay `pointSearch` 권한이 열리거나 다른 좌표→역 매핑 수단을
   찾으면 교체 가능.
2. **버스 막차의 요일 구분** — TOPIS API 자체가 요일별 데이터를 제공하지 않아서 코드로 해결이 어렵고,
   다른 데이터 소스가 필요합니다.

이 두 가지 외에는 PRD의 F1~F6 로직(도보속도 보정, 역산 알람 시각 계산, 환승 여유시간 등급,
Push 등급 전이 감지, 구간별 대안 안내)이 모두 실제 데이터로 동작하는 코드로 구현되어 있습니다.
