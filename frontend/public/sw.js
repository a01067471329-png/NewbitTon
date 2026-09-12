// 막차랑이 서비스 워커 — Web Push 수신 + 알림 클릭 시 앱으로 복귀 (PRD F5).
// backend/src/services/pushScheduler.js가 보내는 "탑승 가능 시간" 3시간/2시간
// 59분/2시간 58분 전 카운트다운 알림 { title, body, image } payload를 그대로
// 사용한다. image는 안드로이드 "큰 이미지" 알림 배너(character-safe/caution/
// danger-banner)용 절대 URL — iOS Safari는 image 옵션을 지원하지 않아 자동으로
// 무시된다.
self.addEventListener('push', (event) => {
  let payload = { title: '막차랑이', body: '막차 알림이 도착했어요.', image: null };
  try {
    if (event.data) payload = event.data.json();
  } catch {
    // JSON 파싱 실패 시 기본 문구 사용
  }

  const options = {
    body: payload.body,
    // 같은 tag로 계속 갱신 — 새 알림을 계속 쌓는 대신 "동일한 알림을 주기적으로
    // 갱신"하는 방식으로 구현한다는 PRD F5 요구사항을 그대로 반영.
    tag: 'newbiton-departure-alert',
    renotify: true,
  };
  if (payload.image) options.image = payload.image;

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
      return undefined;
    })
  );
});
