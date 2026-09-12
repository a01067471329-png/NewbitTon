import { useEffect, useRef, useState } from 'react';
import './RouteMap.css';

const KAKAO_APP_KEY = import.meta.env.VITE_KAKAO_MAP_APP_KEY;

// F2 지도 — 카카오맵 JavaScript SDK로 출발지·도착지를 보여준다.
// ODsay 응답에는 구간별 상세 좌표(폴리라인)가 없으므로, 실제 이동 경로가 아니라
// 출발지-도착지를 잇는 참고용 점선만 그린다 (docs/PRD_Newbiton.md 1.6 "지도 SDK"
// 관련 제약사항 참고). 실제 경로 좌표가 확보되면 이 파일의 점선 그리기 부분만
// 후보별 폴리라인으로 교체하면 된다.
// VITE_KAKAO_MAP_APP_KEY가 없거나 SDK 로드에 실패하면 지도 대신 안내 문구를 보여주고,
// 나머지 화면(리스트)은 정상 동작한다.

let sdkLoadPromise = null;

function loadKakaoSdk() {
  if (window.kakao?.maps) return Promise.resolve(window.kakao);
  if (!KAKAO_APP_KEY) return Promise.reject(new Error('NO_KEY'));
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_APP_KEY}&autoload=false`;
    script.onload = () => window.kakao.maps.load(() => resolve(window.kakao));
    script.onerror = () => reject(new Error('SDK_LOAD_FAILED'));
    document.head.appendChild(script);
  });
  return sdkLoadPromise;
}

export default function RouteMap({ start, destination }) {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | ready | unavailable

  useEffect(() => {
    if (!start || !destination) {
      setStatus('unavailable');
      return undefined;
    }

    let cancelled = false;
    setStatus('loading');

    loadKakaoSdk()
      .then((kakao) => {
        if (cancelled || !canvasRef.current) return;

        const startPos = new kakao.maps.LatLng(start.y, start.x);
        const endPos = new kakao.maps.LatLng(destination.y, destination.x);
        const bounds = new kakao.maps.LatLngBounds();
        bounds.extend(startPos);
        bounds.extend(endPos);

        const map = new kakao.maps.Map(canvasRef.current, { center: startPos, level: 7 });
        map.setBounds(bounds);

        new kakao.maps.Marker({ map, position: startPos });
        new kakao.maps.Marker({ map, position: endPos });

        new kakao.maps.Polyline({
          map,
          path: [startPos, endPos],
          strokeWeight: 3,
          strokeColor: '#3366ff',
          strokeOpacity: 0.7,
          strokeStyle: 'shortdash',
        });

        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('unavailable');
      });

    return () => {
      cancelled = true;
    };
  }, [start, destination]);

  return (
    <div className="route-map">
      <div className="route-map__canvas" ref={canvasRef} />
      {status !== 'ready' && (
        <div className="route-map__overlay">
          <span aria-hidden="true">🗺️</span>
          <p>
            {status === 'loading'
              ? '지도를 불러오는 중…'
              : '지도는 카카오맵 API 키가 설정되면 표시돼요'}
          </p>
        </div>
      )}
    </div>
  );
}
