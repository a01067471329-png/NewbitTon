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

module.exports = {
  createSubscription,
  deleteSubscription,
  listSubscriptions,
  updateSubscription,
};
