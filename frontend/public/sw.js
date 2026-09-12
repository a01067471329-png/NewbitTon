// 막차랑이 서비스 워커 — Web Push 수신 + 알림 클릭 시 앱으로 복귀 (PRD F5).
// backend/src/services/pushScheduler.js가 보내는 "탑승 가능 시간" 3시간/2시간
// 59분/2시간 58분 전 카운트다운 알림 { title, body, image, icon } payload를
// 그대로 사용한다.
// - image: 안드로이드 전용 "큰 이미지" 알림 배너(1200x600) — iOS Safari는 이
//   옵션 자체를 지원하지 않아 자동으로 무시된다.
// - icon: 알림 옆에 작게 뜨는 아이콘(512x512) — iOS를 포함해 대부분의
//   플랫폼에서 지원된다.
self.addEventListener('push', (event) => {
  let payload = { title: '막차랑이', body: '막차 알림이 도착했어요.', image: null, icon: null };
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
  if (payload.icon) options.icon = payload.icon;

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
