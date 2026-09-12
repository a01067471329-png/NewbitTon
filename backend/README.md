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

키가 준비되면 `.env`에 채워 넣기만 하면 되고, 코드 수정은 필요 없습니다.

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

## 아직 실제 데이터로 못 바꾼 부분 (TODO)

1. **`src/routes/alternatives.js`** — 심야버스 노선·대기 장소 데이터 소스가 아직 미확정 (PRD 10장, F6).
   지금은 `segmentId`를 받아서 echo만 하고 나머지는 고정 mock을 반환합니다.
2. **버스 막차의 요일 구분** — 위 참고. TOPIS API 자체가 요일별 데이터를 제공하지 않아서 코드로 해결이
   어렵고, 다른 데이터 소스가 필요합니다.

이 두 가지 외에는 PRD의 F1~F5 로직(도보속도 보정, 역산 알람 시각 계산, 환승 여유시간 등급,
Push 등급 전이 감지)이 모두 실제 데이터로 동작하는 코드로 구현되어 있습니다.
