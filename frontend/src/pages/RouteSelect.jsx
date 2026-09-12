import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import BackButton from '../components/BackButton';
import RouteMap from '../components/RouteMap';
import RouteCard from '../components/RouteCard';
import { fetchRoutes } from '../api';
import { getCurrentTrip, saveCurrentTrip } from '../utils/storage';
import './RouteSelect.css';

// F2 경로 후보 탐색 및 선택. F1(온보딩)에서 sessionStorage에 저장해둔 트립
// 정보(출발지/도착지/도보속도)를 읽어 GET /api/routes를 호출하고, 지도 +
// 카드 리스트로 보여준다. 카드를 탭하면 선택되고, 하단의 "이 경로로 막차
// 알람 시작" 버튼을 눌러야 F3 메인 화면으로 확정 이동한다 (PRD F2 v2 변경).
export default function RouteSelect() {
  const navigate = useNavigate();
  const [trip] = useState(() => getCurrentTrip());
  const [candidates, setCandidates] = useState(null); // null = 아직 로딩 전
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!trip) return undefined;
    let cancelled = false;
    setError(null);
    setCandidates(null);
    setSelectedId(null);

    fetchRoutes({
      startX: trip.start.x,
      startY: trip.start.y,
      endX: trip.destination.x,
      endY: trip.destination.y,
      walkSpeed: trip.walkSpeed,
    })
      .then((res) => {
        if (cancelled) return;
        setCandidates(res.candidates || []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || '경로를 불러오지 못했어요');
      });

    return () => {
      cancelled = true;
    };
  }, [trip, retryKey]);

  if (!trip) {
    return (
      <AppShell>
        <BackButton to="/" label="온보딩" />
        <div className="route-select__empty">
          <p>출발지·도착지 정보가 없어요. 온보딩부터 다시 시작해주세요.</p>
          <button type="button" className="cta-button" onClick={() => navigate('/')}>
            온보딩으로 돌아가기
          </button>
        </div>
      </AppShell>
    );
  }

  function handleConfirm() {
    const selected = candidates?.find((c) => c.routeId === selectedId);
    if (!selected) return;
    saveCurrentTrip({ ...trip, selectedRoute: selected });
    navigate('/main');
  }

  return (
    <AppShell>
      <BackButton to="/" label="온보딩" />
      <header className="route-select__header">
        <h1 className="route-select__title">이동 방법을 선택하세요</h1>
        <p className="route-select__subtitle">{trip.destination?.name}까지</p>
      </header>

      <RouteMap start={trip.start} destination={trip.destination} />

      {error && (
        <div className="route-select__error">
          <p>{error}</p>
          <button type="button" onClick={() => setRetryKey((k) => k + 1)}>
            다시 시도
          </button>
        </div>
      )}

      {!error && candidates === null && (
        <p className="route-select__status">경로를 찾는 중…</p>
      )}

      {!error && candidates && candidates.length === 0 && (
        <p className="route-select__status">
          이용 가능한 경로가 없어요. 도착지를 바꿔서 다시 시도해보세요.
        </p>
      )}

      {!error && candidates && candidates.length > 0 && (
        <div className="route-select__list">
          {candidates.map((candidate, i) => (
            <RouteCard
              key={candidate.routeId}
              candidate={candidate}
              recommended={i === 0}
              selected={candidate.routeId === selectedId}
              onSelect={setSelectedId}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        className="cta-button"
        disabled={!selectedId}
        onClick={handleConfirm}
      >
        이 경로로 막차 알람 시작
      </button>
    </AppShell>
  );
}
