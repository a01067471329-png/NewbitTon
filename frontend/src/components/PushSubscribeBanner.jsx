import './PushSubscribeBanner.css';

// F5 Web Push 구독 상태 표시 + 구독 버튼 (PRD F5).
// "Push 권한 거부 시 앱 내 배너로 대체 안내"(예외 처리)를 포함한 모든 상태를
// 이 컴포넌트 하나에서 처리한다.
export default function PushSubscribeBanner({ status, onSubscribe }) {
  if (status === 'checking' || status === 'unsupported') return null;

  if (status === 'subscribed') {
    return (
      <div className="push-banner push-banner--ok">🔔 알림 켜짐 — 상황이 바뀌면 알려드려요</div>
    );
  }

  if (status === 'denied') {
    return (
      <div className="push-banner push-banner--warn">
        🔕 알림 권한이 거부됐어요. 브라우저 설정에서 이 사이트의 알림을 허용하면 막차 임박
        알림을 받을 수 있어요.
      </div>
    );
  }

  if (status === 'unavailable') {
    return (
      <div className="push-banner push-banner--warn">
        지금은 서버의 알림 발송 설정이 안 되어 있어요. 화면은 계속 실시간으로 갱신되니 걱정
        마세요.
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="push-banner push-banner--warn">
        <span>알림 구독에 실패했어요.</span>
        <button type="button" className="push-banner__button" onClick={onSubscribe}>
          다시 시도
        </button>
      </div>
    );
  }

  // idle | subscribing
  return (
    <button
      type="button"
      className="push-banner push-banner--action"
      disabled={status === 'subscribing'}
      onClick={onSubscribe}
    >
      {status === 'subscribing' ? '구독하는 중…' : '🔔 막차 임박 알림 받기'}
    </button>
  );
}
