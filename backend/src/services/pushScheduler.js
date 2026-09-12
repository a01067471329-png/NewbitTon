/**
 * PRD F5: 위험도 등급이 바뀔 때마다 Web Push 발송.
 * 10초 간격으로 저장된 구독을 순회하며 현재 시각 기준 등급을 재계산하고,
 * 직전에 알린 등급과 다르면 Push를 보낸다.
 */
const webpush = require('web-push');
const store = require('../lib/store');
const { classifySafety } = require('../utils/safety');

const CHECK_INTERVAL_MS = 10 * 1000;

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

const NOTIFICATION_COPY = {
  safe: { title: 'Newbiton · 여유 있어요', body: (m) => `막차까지 ${m}분 남았어요. 아직 안전해요!` },
  caution: { title: 'Newbiton · 슬슬 서둘러요', body: (m) => `여유가 ${m}분밖에 안 남았어요. 걸음을 서둘러주세요.` },
  danger: { title: 'Newbiton · 위험! 뛰세요', body: (m) => `막차까지 ${m}분! 지금 서두르지 않으면 놓쳐요.` },
};

async function sendNotification(record, safety, minutesLeft) {
  if (!isVapidConfigured()) return;
  const copy = NOTIFICATION_COPY[safety];
  const payload = JSON.stringify({
    title: copy.title,
    body: copy.body(minutesLeft),
    safety, // 프론트가 캐릭터 표정(F5)을 고를 때 사용
  });
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

function tick() {
  const now = new Date();
  for (const record of store.listSubscriptions()) {
    if (!record.departureDeadline) continue;
    const minutesLeft = Math.round((new Date(record.departureDeadline) - now) / 60000);
    const safety = classifySafety(minutesLeft);

    if (safety !== record.lastNotifiedSafety) {
      sendNotification(record, safety, minutesLeft);
      store.updateSubscription(record.id, { lastNotifiedSafety: safety });
    }
  }
}

function startPushScheduler() {
  configureWebPush();
  setInterval(tick, CHECK_INTERVAL_MS);
  console.log(`[pushScheduler] ${CHECK_INTERVAL_MS / 1000}초 간격으로 등급 전이를 감시합니다.`);
}

module.exports = { startPushScheduler };
