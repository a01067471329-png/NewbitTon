// F5 Web Push 구독 로직 (PRD F5) — Service Worker 등록, 구독 생성/조회/해제.
// 텍스트 알림까지만 구현하고, 캐릭터 표정 이미지 적용은 마지막 폴리싱 단계에서
// 진행한다 (PRD 7장 개발 순서). VAPID 공개키는 백엔드 GET /api/push/vapid-public-key
// 에서 받아온다 — 서비스키처럼 비밀은 아니지만, 구독 요청마다 최신 값을 쓰기 위해
// 프론트에 하드코딩하지 않고 매번 조회한다.

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function registerServiceWorker() {
  return navigator.serviceWorker.register('/sw.js');
}

export async function getExistingSubscription() {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

// 구독 생성 — 이 호출이 브라우저의 알림 권한 요청 프롬프트를 띄운다.
export async function subscribeToPush(vapidPublicKey) {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
}

export async function unsubscribeFromPush() {
  const subscription = await getExistingSubscription();
  if (subscription) await subscription.unsubscribe();
}
