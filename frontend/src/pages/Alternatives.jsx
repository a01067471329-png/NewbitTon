import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import ScreenHeader from '../components/ScreenHeader';
import AlternativeCard from '../components/AlternativeCard';
import { fetchAlternatives } from '../api';
import { waitingSpotIcon } from '../utils/alternativesFormat';
import './Alternatives.css';

// F6 대안 안내 화면. F3+F4의 각 구간 카드 "놓치면?" 버튼에서 ?segment=<id>&lat=&lng=로
// 들어온다 — 강제 전환이나 확인 절차 없이 사용자가 필요하다고 판단할 때만 열람하고,
// 뒤로가기를 누르면 언제든 메인 화면으로 복귀한다 (PRD F6 v2, BackButton to="/main").
export default function Alternatives() {
  const [searchParams] = useSearchParams();
  const segmentId = searchParams.get('segment');
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!lat || !lng) return undefined;
    let cancelled = false;
    setError(null);
    setData(null);

    fetchAlternatives({ lat, lng, segmentId })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || '대안을 불러오지 못했어요');
      });

    return () => {
      cancelled = true;
    };
  }, [lat, lng, segmentId, retryKey]);

  return (
    <AppShell>
      <ScreenHeader backTo="/main" backLabel="메인 화면" />

      <header className="alternatives__header">
        <h1 className="alternatives__title">😢 막차를 놓쳤다면</h1>
        <p className="alternatives__subtitle">아래 대안을 확인해보세요</p>
      </header>

      {(!lat || !lng) && (
        <p className="alternatives__status">
          위치 정보가 없어 대안을 조회할 수 없어요. 메인 화면에서 "놓치면?" 버튼으로
          다시 들어와주세요.
        </p>
      )}

      {lat && lng && error && (
        <div className="alternatives__error">
          <p>{error}</p>
          <button type="button" onClick={() => setRetryKey((k) => k + 1)}>
            다시 시도
          </button>
        </div>
      )}

      {lat && lng && !error && !data && (
        <p className="alternatives__status">대안을 찾는 중…</p>
      )}

      {data && (
        <>
          <section className="alternatives__section">
            <h2 className="alternatives__section-title">대안 교통수단</h2>
            <div className="alternatives__list">
              {data.transitAlternatives.map((alt, i) => (
                <AlternativeCard alternative={alt} key={`${alt.type}-${i}`} />
              ))}
            </div>
          </section>

          <section className="alternatives__section">
            <h2 className="alternatives__section-title">대기 장소</h2>
            <div className="alternatives__list">
              {data.waitingSpots.map((spot, i) => (
                <div className="alt-spot" key={`${spot.name}-${i}`}>
                  {waitingSpotIcon(spot.type)} {spot.name}{' '}
                  <span className="alt-spot__walk">(도보 {spot.walkMin}분)</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}
