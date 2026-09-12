/**
 * "탑승 가능 시간(departureDeadline)" 기준 3시간/2시간 59분/2시간 58분 전에
 * 각각 한 번씩 Web Push 사전 안내 알림을 보낸다(COUNTDOWN_STAGES).
 * 10초 간격으로 저장된 구독을 순회하며 지금 몇 분 남았는지 확인한다.
 *
 * (예전에는 위험도 등급(안전/주의/위험, 5분/2분 기준)이 바뀔 때마다 보내는
 * 알림도 있었지만, 이 3단계 사전 안내 알림만 남기기로 하고 제거했다.)
 */
const webpush = require('web-push');
const store = require('../lib/store');

const CHECK_INTERVAL_MS = 10 * 1000;
// 막차 마감 시각이 이만큼(2시간) 지난 구독은 알림 대상이 아니므로 정리한다.
const EXPIRE_GRACE_MS = 2 * 60 * 60 * 1000;

// Push payload의 image(안드로이드 큰 이미지 알림)에 들어갈 절대 URL의 베이스.
// 알림을 띄우는 서비스워커는 프론트 origin(localhost/터널/배포 도메인 등 상황마다
// 다름)에서 실행되므로, 이미지는 항상 접근 가능한 이 백엔드(Render) 주소 기준
// 절대경로로 내려줘야 한다. 로컬에서 다른 백엔드로 테스트할 때는 .env의
// PUBLIC_BASE_URL로 덮어쓸 수 있다.
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://newbitton.onrender.com';

function isVapidConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function configureWebPush() {
  if (!isVapidConfigured()) {
    console.warn(
      '[pushScheduler] VAPID 키가 설정되지 않았습니다. `npm run generate-vapid`로 생성 후 .env에 넣어주세요. ' +
        '키가 없어도 서버는 동작하지만 실제 Push는 발송되지 않습니다.'
    );
    return;
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:example@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// "탑승 가능 시간"(departureDeadline) 3시간/2시간 59분/2시간 58분 전 사전 안내.
// minutesLeft는 Math.floor 기준(해당 분 동안 정확히 1번씩만 조건을 만족한다) —
// 팀 디자이너가 만들어준 안전/주의/위험 캐릭터 이미지를 순서대로 붙여, 데모에서
// departureDeadline을 "지금부터 3시간 뒤"로 잡아두면 이후 2분 사이에 3건이
// 순서대로 도착하는 걸 보여줄 수 있다.
//
// image(1200x600, 안드로이드 전용 "큰 이미지" 알림)와 icon(512x512, iOS 포함
// 모든 플랫폼에서 알림 옆에 작게 표시되는 아이콘)을 둘 다 같은 payload에 실어
// 보낸다 — 구독은 기기별로 하나뿐이라 백엔드는 수신 기기가 안드로이드인지
// iOS인지 미리 알 수 없으므로, 각 플랫폼이 자기가 지원하는 필드만 골라 쓰게
// 한다(iOS Safari는 image를 지원하지 않아 자동 무시, icon만 사용).
const COUNTDOWN_STAGES = [
  {
    key: 'stage-3h',
    minutesLeft: 180,
    title: '막차랑이',
    body: '3시간 남았어요!',
    image: `${PUBLIC_BASE_URL}/notification/character-safe-banner1.png`,
    icon: `${PUBLIC_BASE_URL}/notification/character-safe-icon1.png`,
  },
  {
    key: 'stage-2h59m',
    minutesLeft: 179,
    title: '막차랑이',
    body: '2시간 59분 남았어요!',
    image: `${PUBLIC_BASE_URL}/notification/character-caution-banner2.png`,
    icon: `${PUBLIC_BASE_URL}/notification/character-caution-icon2.png`,
  },
  {
    key: 'stage-2h58m',
    minutesLeft: 178,
    title: '막차랑이',
    body: '2시간 58분 남았어요!',
    image: `${PUBLIC_BASE_URL}/notification/character-danger-banner3.png`,
    icon: `${PUBLIC_BASE_URL}/notification/character-danger-icon3.png`,
  },
];

async function sendPush(record, { title, body, image, icon }) {
  if (!isVapidConfigured()) return;
  const payload = JSON.stringify({ title, body, image: image ?? null, icon: icon ?? null });
  try {
    await webpush.sendNotification(record.subscription, payload);
  } catch (err) {
    console.error(`[pushScheduler] Push 발송 실패 (id=${record.id}):`, err.message);
    // 410 Gone 등 만료된 구독이면 정리
    if (err.statusCode === 404 || err.statusCode === 410) {
      store.deleteSubscription(record.id);
    }
  }
}

function checkCountdownStages(record, minutesLeftFloor) {
  const notified = record.notifiedCountdownStages || [];
  for (const stage of COUNTDOWN_STAGES) {
    if (minutesLeftFloor !== stage.minutesLeft) continue;
    if (notified.includes(stage.key)) continue;
    sendPush(record, stage);
    store.updateSubscription(record.id, { notifiedCountdownStages: [...notified, stage.key] });
  }
}

function tick() {
  const now = new Date();
  const removed = store.deleteExpiredSubscriptions(now.getTime(), EXPIRE_GRACE_MS);
  if (removed > 0) {
    console.log(`[pushScheduler] 막차 마감 지난 구독 ${removed}건 정리`);
  }
  for (const record of store.listSubscriptions()) {
    if (!record.departureDeadline) continue;
    const diffMs = new Date(record.departureDeadline).getTime() - now.getTime();
    checkCountdownStages(record, Math.floor(diffMs / 60000));
  }
}

function startPushScheduler() {
  configureWebPush();
  setInterval(tick, CHECK_INTERVAL_MS);
  console.log(`[pushScheduler] ${CHECK_INTERVAL_MS / 1000}초 간격으로 탑승 가능 시간 카운트다운을 감시합니다.`);
}

module.exports = { startPushScheduler };
