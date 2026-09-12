import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import BackButton from '../components/BackButton';
import RouteTimeline from '../components/RouteTimeline';
import PushSubscribeBanner from '../components/PushSubscribeBanner';
import { getCurrentTrip, saveCurrentTrip, clearCurrentTrip } from '../utils/storage';
import { classifySafety } from '../utils/safety';
import { formatCountdown } from '../utils/countdown';
import { buildRouteTimeline } from '../utils/timeline';
import { formatKstTime, transitLegsOf, transferCountOf, legIcon } from '../utils/routeFormat';
import { fetchVapidPublicKey, subscribePush, unsubscribePush } from '../api';
import {
  isPushSupported,
  registerServiceWorker,
  getExistingSubscription,
  subscribeToPush,
  unsubscribeFromPush,
} from '../utils/push';
import './Main.css';

const MOOD_COPY = {
  safe: { emoji: '🙂', label: '안전 (여유 있음)', headline: '지금 출발하면 막차 탑승 가능' },
  caution: { emoji: '😬', label: '주의 (서둘러야 해요)', headline: '서둘러 출발하세요' },
  danger: { emoji: '😱', label: '위험 (지금 뛰세요!)', headline: '지금 당장 출발하세요!' },
};

// F3+F4 메인 화면 — 역산 출발 알람 시각 카운트다운 + 환승구간별 여유시간 배지.
// F2에서 "이 경로로 막차 알람 시작"을 누른 뒤부터는 이 화면이 앱의 기본 홈 화면이
// 된다(App.jsx의 HomeRoute 참고) — 그래서 뒤로가기 버튼이 없고, 대신 "경로 수정"
// 버튼으로 트립을 비우고 온보딩부터 다시 시작할 수 있게 한다.
// F2에서 확정해 저장해둔 selectedRoute를 기준으로 매초 갱신되는 카운트다운을
// 보여준다. 캐릭터 표정(placeholder 이모지)은 F4와 동일한 5분/2분 임계값으로
// 결정하며, 실제 캐릭터 일러스트 적용은 마지막 단계(F5 폴리싱)에서 진행한다.
export default function Main() {
  const navigate = useNavigate();
  const [trip] = useState(() => getCurrentTrip());
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // F5 Push 구독 상태 확인 — Service Worker를 등록해두고, 이미 구독돼 있는지
  // 조회한다. 실제 구독 생성(권한 프롬프트)은 사용자가 버튼을 눌렀을 때만 한다.
  const [pushStatus, setPushStatus] = useState('checking');

  useEffect(() => {
    if (!isPushSupported()) {
      setPushStatus('unsupported');
      return;
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
      setPushStatus('denied');
      return;
    }
    registerServiceWorker()
      .then(() => getExistingSubscription())
      .then((sub) => setPushStatus(sub ? 'subscribed' : 'idle'))
      .catch(() => setPushStatus('idle'));
  }, []);

  const route = trip?.selectedRoute;

  const timelineSteps = useMemo(() => {
    if (!route) return [];
    return buildRouteTimeline(route, trip);
  }, [route, trip]);

  if (!trip) {
    return (
      <AppShell>
        <div className="main-empty">
          <p>출발지·도착지 정보가 없어요. 온보딩부터 다시 시작해주세요.</p>
          <button type="button" className="cta-button" onClick={() => navigate('/')}>
            온보딩으로 돌아가기
          </button>
        </div>
      </AppShell>
    );
  }

  if (!route) {
    return (
      <AppShell>
        <BackButton to="/routes" label="경로 선택" />
        <div className="main-empty">
          <p>선택된 경로가 없어요. 경로를 먼저 선택해주세요.</p>
          <button type="button" className="cta-button" onClick={() => navigate('/routes')}>
            경로 선택으로 돌아가기
          </button>
        </div>
      </AppShell>
    );
  }

  const departureDeadline = new Date(route.departureDeadline);
  const diffMs = departureDeadline.getTime() - now.getTime();
  const minutesLeft = Math.floor(diffMs / 60000);
  const mood = classifySafety(minutesLeft);
  const overdue = diffMs < 0;
  const copy = MOOD_COPY[mood];
  const legs = transitLegsOf(route);
  const transferCount = transferCountOf(route);

  function handleMissed(segment) {
    // F6이 GET /api/alternatives?lat=&lng=&segmentId=를 바로 호출할 수 있도록
    // 해당 구간의 좌표까지 함께 넘긴다 (segment.location: x=경도, y=위도).
    const params = new URLSearchParams({ segment: segment.id });
    if (segment.location) {
      params.set('lat', segment.location.y);
      params.set('lng', segment.location.x);
    }
    navigate(`/alternatives?${params.toString()}`);
  }

  function handleEditRoute() {
    // 이 경로에 대한 Push 구독이 남아있으면 계속 알림이 오므로, 트립을 비우기 전에
    // 최선을 다해(best-effort) 해제한다 — 실패해도 화면 전환은 막지 않는다.
    if (trip.pushSubscriptionId) {
      unsubscribePush(trip.pushSubscriptionId).catch(() => {});
    }
    unsubscribeFromPush().catch(() => {});
    // 확정된 경로(selectedRoute)가 남아있으면 "/"가 다시 이 화면으로 리다이렉트되므로,
    // 온보딩으로 돌아가려면 트립 자체를 비워야 한다 (App.jsx의 HomeRoute 참고).
    clearCurrentTrip();
    navigate('/');
  }

  async function handleSubscribePush() {
    setPushStatus('subscribing');
    try {
      const { publicKey } = await fetchVapidPublicKey();
      if (!publicKey) {
        setPushStatus('unavailable');
        return;
      }
      const subscription = await subscribeToPush(publicKey);
      const { id } = await subscribePush({
        subscription: subscription.toJSON(),
        selectedRoute: route,
      });
      saveCurrentTrip({ ...trip, pushSubscriptionId: id });
      setPushStatus('subscribed');
    } catch {
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        setPushStatus('denied');
      } else {
        setPushStatus('error');
      }
    }
  }

  return (
    <AppShell>
      <section className={`main-banner main-banner--${mood}`}>
        <p className="main-banner__headline">{overdue ? '출발 시각이 지났어요' : copy.headline}</p>
        <p className="main-banner__deadline">
          오늘 <strong>{formatKstTime(departureDeadline)}</strong>까지 출발
        </p>
        <p className="main-banner__countdown">
          ⏱ {overdue ? '지난 시간' : '남은 시간'} {formatCountdown(diffMs)}
        </p>
        <div className="main-banner__character">
          <span className="main-banner__emoji" aria-hidden="true">
            {copy.emoji}
          </span>
          <span>캐릭터 상태: {copy.label}</span>
        </div>
      </section>

      <PushSubscribeBanner status={pushStatus} onSubscribe={handleSubscribePush} />

      <section className="route-summary">
        <p className="route-summary__notice">
          이 노선·환승역 기준으로 계산된 알람이에요. 다른 경로로 이동하면 시간이 달라질 수
          있어요.
        </p>
        <div className="route-summary__legs">
          {legs.map((leg, i) => (
            <span className="route-summary__leg" key={i}>
              {legIcon(leg.mode)} {leg.line}
            </span>
          ))}
        </div>
        <div className="route-summary__footer">
          <p className="route-summary__meta">
            총 소요 {route.totalDurationMin}분 · 환승 {transferCount}회
          </p>
          <button type="button" className="route-edit-button" onClick={handleEditRoute}>
            경로 수정
          </button>
        </div>
      </section>

      <section className="segment-list">
        <h2 className="segment-list__title">경로 안내</h2>
        <RouteTimeline steps={timelineSteps} now={now} onMissed={handleMissed} />
      </section>
    </AppShell>
  );
}
