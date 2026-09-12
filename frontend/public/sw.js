// Newbiton 서비스 워커 — Web Push 수신 + 알림 클릭 시 앱으로 복귀 (PRD F5).
// 캐릭터 표정 아이콘(안전/주의/위험)은 프론트엔드 개발 마지막 단계(폴리싱)에서
// payload.safety 값에 맞춰 적용 예정 — 지금은 텍스트 알림까지만 구현한다
// (PRD 7장 개발 순서, backend/src/services/pushScheduler.js가 보내는
// { title, body, safety } 형태의 payload를 그대로 사용).

self.addEventListener('push', (event) => {
  let payload = { title: 'Newbiton', body: '막차 알림이 도착했어요.', safety: null };
  try {
    if (event.data) payload = event.data.json();
  } catch {
    // JSON 파싱 실패 시 기본 문구 사용
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      // 같은 tag로 계속 갱신 — 새 알림을 계속 쌓는 대신 "동일한 알림을 주기적으로
      // 갱신"하는 방식으로 구현한다는 PRD F5 요구사항을 그대로 반영.
      tag: 'newbiton-departure-alert',
      renotify: true,
      data: { safety: payload.safety },
    })
  );
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
