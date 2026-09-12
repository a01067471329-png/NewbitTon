/**
 * 아주 단순한 인메모리 저장소.
 * PRD 6.2 참고: 서버 프로세스가 재시작되면 내용이 모두 초기화됩니다.
 * 해커톤 데모 범위에서는 이 정도로 충분하며, DB는 의도적으로 두지 않았습니다.
 */

let subscriptions = new Map();
let nextId = 1;

function createSubscription({ subscription, selectedRoute }) {
  const id = String(nextId++);
  const record = {
    id,
    subscription,
    departureDeadline: selectedRoute?.departureDeadline || null,
    transferGaps: selectedRoute?.transferGaps || [],
    lastNotifiedSafety: null,
    // pushScheduler.js의 COUNTDOWN_STAGES(탑승 가능 시간 3시간/2시간59분/2시간58분
    // 전 사전 안내) 중 이미 보낸 stage.key 목록 — 같은 구간을 중복으로 보내지 않기 위함.
    notifiedCountdownStages: [],
    createdAt: new Date().toISOString(),
  };
  subscriptions.set(id, record);
  return record;
}

function deleteSubscription(id) {
  return subscriptions.delete(id);
}

function listSubscriptions() {
  return Array.from(subscriptions.values());
}

function updateSubscription(id, patch) {
  const record = subscriptions.get(id);
  if (!record) return null;
  Object.assign(record, patch);
  subscriptions.set(id, record);
  return record;
}

// 막차 마감 시각이 지난 지 오래된 구독은 더 이상 알림 대상이 아니므로 정리한다.
// (인메모리 저장소라 테스트 중 쌓인 구독이 계속 남아있는 걸 방지)
function deleteExpiredSubscriptions(now, graceMs) {
  let deleted = 0;
  for (const [id, record] of subscriptions) {
    if (!record.departureDeadline) continue;
    if (now - new Date(record.departureDeadline).getTime() > graceMs) {
      subscriptions.delete(id);
      deleted += 1;
    }
  }
  return deleted;
}

module.exports = {
  createSubscription,
  deleteSubscription,
  deleteExpiredSubscriptions,
  listSubscriptions,
  updateSubscription,
};
