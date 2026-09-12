import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import ScreenHeader from '../components/ScreenHeader';
import RouteTimeline from '../components/RouteTimeline';
import PushSubscribeBanner from '../components/PushSubscribeBanner';
import {
  getCurrentTrip,
  saveCurrentTrip,
  clearCurrentTrip,
} from '../utils/storage';
import { classifySafety } from '../utils/safety';
import { formatCountdown } from '../utils/countdown';
import { buildRouteTimeline } from '../utils/timeline';
import {
  formatKstTime,
  transitLegsOf,
  transferCountOf,
  legIcon,
} from '../utils/routeFormat';
import {
  fetchVapidPublicKey,
  subscribePush,
  unsubscribePush,
} from '../api';
import {
  isPushSupported,
  registerServiceWorker,
  getExistingSubscription,
  subscribeToPush,
  unsubscribeFromPush,
} from '../utils/push';
import './Main.css';


/* ================================
   남은 시간에 따른 3단계 배너
================================ */

const MOOD_COPY = {
  safe: {
    image: '/tiger-safe-banner.png',
    label: '안전',
    headline: '아직 여유 있어요',
  },

  caution: {
    image: '/tiger-caution-banner.png',
    label: '주의',
    headline: '슬슬 출발할 준비를 해주세요',
  },

  danger: {
    image: '/tiger-danger-banner.png',
    label: '위험',
    headline: '지금 당장 출발하세요!',
  },
};


export default function Main() {
  const navigate = useNavigate();

  const [trip] = useState(() => getCurrentTrip());
  const [now, setNow] = useState(() => new Date());


  /* ================================
     1초마다 현재 시간 갱신
  ================================ */

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);


  /* ================================
     Push 알림 상태
  ================================ */

  const [pushStatus, setPushStatus] = useState('checking');

  useEffect(() => {
    if (!isPushSupported()) {
      setPushStatus('unsupported');
      return;
    }

    if (
      typeof Notification !== 'undefined' &&
      Notification.permission === 'denied'
    ) {
      setPushStatus('denied');
      return;
    }

    registerServiceWorker()
      .then(() => getExistingSubscription())
      .then((sub) => {
        setPushStatus(sub ? 'subscribed' : 'idle');
      })
      .catch(() => {
        setPushStatus('idle');
      });
  }, []);


  const route = trip?.selectedRoute;


  /* ================================
     경로 타임라인 생성
  ================================ */

  const timelineSteps = useMemo(() => {
    if (!route) return [];

    return buildRouteTimeline(route, trip);
  }, [route, trip]);


  /* ================================
     트립 정보가 없는 경우
  ================================ */

  if (!trip) {
    return (
      <AppShell>
        <ScreenHeader />

        <div className="main-empty">
          <p>
            출발지·도착지 정보가 없어요.
            온보딩부터 다시 시작해주세요.
          </p>

          <button
            type="button"
            className="cta-button"
            onClick={() => navigate('/')}
          >
            온보딩으로 돌아가기
          </button>
        </div>
      </AppShell>
    );
  }


  /* ================================
     선택한 경로가 없는 경우
  ================================ */

  if (!route) {
    return (
      <AppShell>
        <ScreenHeader
          backTo="/routes"
          backLabel="경로 선택"
        />

        <div className="main-empty">
          <p>
            선택된 경로가 없어요.
            경로를 먼저 선택해주세요.
          </p>

          <button
            type="button"
            className="cta-button"
            onClick={() => navigate('/routes')}
          >
            경로 선택으로 돌아가기
          </button>
        </div>
      </AppShell>
    );
  }


  /* ================================
     막차까지 남은 시간 계산
  ================================ */

  const departureDeadline = new Date(route.departureDeadline);

  const diffMs =
    departureDeadline.getTime() - now.getTime();

  const minutesLeft =
    Math.floor(diffMs / 60000);

  const mood =
    classifySafety(minutesLeft);

  const overdue =
    diffMs < 0;

  const copy =
    MOOD_COPY[mood];

  const legs =
    transitLegsOf(route);

  const transferCount =
    transferCountOf(route);


  /* ================================
     막차를 놓친 구간 처리
  ================================ */

  function handleMissed(segment) {
    const params = new URLSearchParams({
      segment: segment.id,
    });

    if (segment.location) {
      params.set(
        'lat',
        segment.location.y,
      );

      params.set(
        'lng',
        segment.location.x,
      );
    }

    navigate(
      `/alternatives?${params.toString()}`,
    );
  }


  /* ================================
     막차 안내 종료
  ================================ */

  function handleEndGuidance() {
    if (trip.pushSubscriptionId) {
      unsubscribePush(
        trip.pushSubscriptionId,
      ).catch(() => {});
    }

    unsubscribeFromPush()
      .catch(() => {});

    clearCurrentTrip();

    navigate('/');
  }


  /* ================================
     Push 알림 구독
  ================================ */

  async function handleSubscribePush() {
    setPushStatus('subscribing');

    try {
      const { publicKey } =
        await fetchVapidPublicKey();

      if (!publicKey) {
        setPushStatus('unavailable');
        return;
      }

      const subscription =
        await subscribeToPush(publicKey);

      const { id } =
        await subscribePush({
          subscription:
            subscription.toJSON(),
          selectedRoute: route,
        });

      saveCurrentTrip({
        ...trip,
        pushSubscriptionId: id,
      });

      setPushStatus('subscribed');
    } catch {
      if (
        typeof Notification !== 'undefined' &&
        Notification.permission === 'denied'
      ) {
        setPushStatus('denied');
      } else {
        setPushStatus('error');
      }
    }
  }


  /* ================================
     화면
  ================================ */

  return (
    <AppShell>
      <ScreenHeader />


      {/* ============================
          3단계 호랑이 배너
      ============================ */}

      <section
        className={`main-banner main-banner--${mood}`}
      >
        {/* 남은 시간 상태에 따라
            safe / caution / danger 이미지 자동 변경 */}
        <img
          src={copy.image}
          alt=""
          className="main-banner__background"
          aria-hidden="true"
        />

        {/* 이미지 위 텍스트 가독성용 그라데이션 */}
        <div
          className="main-banner__shade"
          aria-hidden="true"
        />


        <div className="main-banner__content">
          <p className="main-banner__headline">
            {overdue
              ? '출발 시각이 지났어요'
              : copy.headline}
          </p>


          <p className="main-banner__deadline">
            오늘{' '}
            <strong>
              {formatKstTime(
                departureDeadline,
              )}
            </strong>
            까지 출발
          </p>


          <p className="main-banner__countdown">
            ⏱{' '}
            {overdue
              ? '지난 시간'
              : '남은 시간'}{' '}
            {formatCountdown(diffMs)}
          </p>


          <div className="main-banner__status">
            {copy.label}
          </div>
        </div>
      </section>


      {/* Push 알림 안내 */}

      <PushSubscribeBanner
        status={pushStatus}
        onSubscribe={handleSubscribePush}
      />


      {/* ============================
          선택한 경로 요약
      ============================ */}

      <section className="route-summary">
        <p className="route-summary__notice">
          이 노선·환승역 기준으로 계산된
          알람이에요. 다른 경로로 이동하면
          시간이 달라질 수 있어요.
        </p>


        <div className="route-summary__legs">
          {legs.map((leg, i) => (
            <div
              className="route-summary__leg-step"
              key={i}
            >
              <div className="route-summary__leg-track">

                <span
                  className={
                    'route-summary__leg-line' +
                    (i === 0
                      ? ' route-summary__leg-line--hidden'
                      : '')
                  }
                />

                <span className="route-summary__leg-dot" />

                <span
                  className={
                    'route-summary__leg-line' +
                    (i === legs.length - 1
                      ? ' route-summary__leg-line--hidden'
                      : '')
                  }
                />

              </div>


              <span className="route-summary__leg">
                {legIcon(leg.mode)}{' '}
                {leg.line}
              </span>

            </div>
          ))}
        </div>


        <div className="route-summary__footer">

          <p className="route-summary__meta">
            총 소요{' '}
            {route.totalDurationMin}분 ·
            환승 {transferCount}회
          </p>


          <button
            type="button"
            className="route-edit-button"
            onClick={handleEndGuidance}
          >
            경로 수정
          </button>

        </div>
      </section>


      {/* ============================
          경로 안내
      ============================ */}

      <section className="segment-list">

        <h2 className="segment-list__title">
          경로 안내
        </h2>

        <RouteTimeline
          steps={timelineSteps}
          now={now}
          onMissed={handleMissed}
        />

      </section>


      {/* ============================
          안내 종료
      ============================ */}

      <button
        type="button"
        className="end-guidance-button"
        onClick={handleEndGuidance}
      >
        막차 안내 종료
      </button>

    </AppShell>
  );
}
