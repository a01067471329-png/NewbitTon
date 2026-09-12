import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import PlaceSearchField from '../components/PlaceSearchField';
import {
  getProfile,
  saveProfile,
  saveCurrentTrip,
  isHomeBannerDismissedThisSession,
  dismissHomeBannerThisSession,
} from '../utils/storage';
import { isStandaloneDisplay } from '../utils/pwa';
import './Onboarding.css';

const WALK_SPEED_OPTIONS = [
  { value: '느림', label: '느림' },
  { value: '보통', label: '보통' },
  { value: '빠름', label: '빠름' },
  { value: '맞춤형', label: '맞춤형' },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const profile = getProfile();

  // 출발지: GPS 자동 수집이 기본이지만, 사용자가 언제든 직접 검색으로 바꿀 수 있어야
  // 한다 (PRD F1). locationStatus는 GPS 결과, startMode는 화면에 "자동 설정 배지"를
  // 보여줄지 "직접 검색 입력창"을 보여줄지를 나타낸다.
  const [locationStatus, setLocationStatus] = useState('requesting'); // requesting | granted | denied | error
  const [startCoords, setStartCoords] = useState(null); // { x: 경도, y: 위도 }
  const [startPlace, setStartPlace] = useState(null); // 텍스트 검색으로 고른 경우
  const [startMode, setStartMode] = useState('auto'); // auto | manual

  // 도착지: 역명/장소/임의 주소 검색 (PRD F1)
  const [destPlace, setDestPlace] = useState(null);

  // 도보속도: 느림/보통/빠름/맞춤형, 기본값은 localStorage에 저장된 값 (없으면 '보통')
  const [walkSpeed, setWalkSpeed] = useState(profile.walkSpeedLevel);

  // "홈 화면에 추가" 유도 배너 — iOS Push 수신 전제조건 (PRD 1.6).
  // 자동감지 + 임시닫기: 실제로 홈 화면 아이콘(standalone)으로 실행 중이면 배너
  // 자체를 띄우지 않고, 아니면 X로 닫아도 이번 세션 동안만 숨겨진다(영구 저장 X).
  const [isStandalone] = useState(() => isStandaloneDisplay());
  const [homeBannerDismissed, setHomeBannerDismissed] = useState(() =>
    isHomeBannerDismissedThisSession()
  );

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setLocationStatus('error');
      setStartMode('manual');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setStartCoords({ x: position.coords.longitude, y: position.coords.latitude });
        setLocationStatus('granted');
        setStartMode('auto');
      },
      () => {
        setLocationStatus('denied');
        setStartMode('manual');
      },
      { timeout: 8000 }
    );
  }, []);

  function handleUseManualStart() {
    setStartMode('manual');
  }

  function handleUseCurrentLocation() {
    setStartPlace(null);
    setStartMode('auto');
  }

  function handleWalkSpeedChange(value) {
    setWalkSpeed(value);
    saveProfile({ walkSpeedLevel: value });
  }

  function handleDismissHomeBanner() {
    setHomeBannerDismissed(true);
    dismissHomeBannerThisSession();
  }

  const hasStart = startMode === 'auto' ? !!startCoords : !!startPlace;
  const canContinue = hasStart && !!destPlace;

  function handleContinue() {
    if (!canContinue) return;
    const start =
      startMode === 'auto' ? { name: '현재 위치', x: startCoords.x, y: startCoords.y } : startPlace;

    saveCurrentTrip({
      start,
      destination: destPlace,
      walkSpeed,
    });

    navigate('/routes');
  }
return (
  <AppShell>
    <header className="onboarding__header">
      <div className="onboarding__hero-copy">
        <p className="onboarding__eyebrow">NEWBITON</p>

        <h1 className="onboarding__title">
          <span className="onboarding__title-accent">오늘 막차,</span>
          <br />
          놓치지 않게 알려드릴게요
        </h1>

        <p className="onboarding__subtitle">
          출발지와 목적지만 알려주시면
          <br />
          딱 맞는 막차 경로를 찾아드려요
        </p>
      </div>

      <div className="onboarding__hero-art" aria-hidden="true">
        <div className="onboarding__moon" />
        <img
          src="/tiger.png"
          alt=""
          className="onboarding__tiger"
        />
      </div>
    </header>

    <section className="onboarding__field onboarding__card">
      <div className="onboarding__section-heading">
        <span className="onboarding__section-icon onboarding__section-icon--blue">
          📍
        </span>
        <label className="onboarding__label">
          출발지는 어디인가요?
        </label>
      </div>

      {locationStatus === 'requesting' && (
        <div className="location-badge location-badge--pending">
          현재 위치 확인 중…
        </div>
      )}

      {locationStatus === 'granted' && startMode === 'auto' && (
        <>
          <div className="location-badge location-badge--ok">
            현재 위치로 자동 설정됨
          </div>

          <button
            type="button"
            className="location-edit-link"
            onClick={handleUseManualStart}
          >
            출발지 직접 입력하기
          </button>
        </>
      )}

      {startMode === 'manual' && (
        <>
          {locationStatus === 'denied' || locationStatus === 'error' ? (
            <p className="onboarding__helper">
              위치 권한이 없어 출발지를 검색으로 설정해주세요.
            </p>
          ) : null}

          <PlaceSearchField
            placeholder="출발지를 검색하세요"
            selected={startPlace}
            onSelect={setStartPlace}
            onClear={() => setStartPlace(null)}
          />

          {locationStatus === 'granted' && (
            <button
              type="button"
              className="location-edit-link"
              onClick={handleUseCurrentLocation}
            >
              현재 위치 사용하기
            </button>
          )}
        </>
      )}
    </section>

    <section className="onboarding__field onboarding__card">
      <div className="onboarding__section-heading">
        <span className="onboarding__section-icon onboarding__section-icon--orange">
          🚇
        </span>
        <label className="onboarding__label">
          어디까지 가시나요?
        </label>
      </div>

      <PlaceSearchField
        placeholder="역명·장소·주소 모두 검색 가능"
        selected={destPlace}
        onSelect={setDestPlace}
        onClear={() => setDestPlace(null)}
      />
    </section>

    <section className="onboarding__field onboarding__card">
      <div className="onboarding__section-heading">
        <span className="onboarding__section-icon onboarding__section-icon--blue">
          🚶
        </span>
        <label className="onboarding__label">
          평소 걸음 속도는 어떤가요?
        </label>
      </div>

      <div className="walk-speed-group">
        {WALK_SPEED_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={
              'walk-speed-btn' +
              (walkSpeed === option.value
                ? ' walk-speed-btn--active'
                : '')
            }
            onClick={() => handleWalkSpeedChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {walkSpeed === '맞춤형' && (
        <p className="onboarding__helper onboarding__helper--muted">
          실제 도보 이동 기록을 바탕으로 걸음 속도를 자동으로 계산해요.
          기록이 쌓이기 전까지는 보통 속도로 계산돼요.
        </p>
      )}
    </section>

    {!isStandalone && !homeBannerDismissed && (
      <div className="home-banner">
        <span className="home-banner__icon">🔔</span>

        <span className="home-banner__text">
          막차 임박 알림을 받으려면
          <br />
          홈 화면에 추가해주세요 <strong>(iOS 필수)</strong>
        </span>

        <button
          type="button"
          className="home-banner__dismiss"
          aria-label="배너 닫기"
          onClick={handleDismissHomeBanner}
        >
          ✕
        </button>
      </div>
    )}

    <button
      type="button"
      className="cta-button"
      disabled={!canContinue}
      onClick={handleContinue}
    >
      경로 후보 보기
      <span className="cta-button__arrow">→</span>
    </button>
  </AppShell>
);
}
