// Push 수신 테스트용 최소 서비스워커 (F5 실기기 검증 전용, 실제 프론트 구현이 아님)

self.addEventListener('push', (event) => {
  let payload = { title: 'Newbiton', body: '알림 도착', safety: null };
  try {
    payload = event.data.json();
  } catch (e) {
    // ignore, use default
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      data: { safety: payload.safety },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/push-test/'));
});
