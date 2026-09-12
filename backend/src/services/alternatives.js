/**
 * F6 막차 실패 대안 안내 (PRD 5장 v2 GET /api/alternatives)
 *
 * - 심야버스: TOPIS getStationByPos(반경 내 정류소) + getRouteByStation(정류소별 노선)을 조합해
 *   "N"으로 시작하는 노선만 필터링. arsId 기준이라 지하철 막차 조회와 같은 계정/키 재사용.
 * - 대기 장소(편의점): 카카오 로컬 API 카테고리 검색(CS2). 지오코딩과 같은 키 재사용.
 * - 택시: 좌표별 승차장 데이터가 마땅치 않아 고정 안내만 제공.
 * - 첫차까지 대기: 좌표 -> 인근 지하철역 매핑 수단이 없어(ODsay POI 검색이 플랜상 막힘) mock 유지.
 */

const { createCache } = require('../lib/cache');

const nightBusCache = createCache(10 * 60 * 1000);

function walkMinFromMeters(meters) {
  const m = Number(meters);
  if (!Number.isFinite(m) || m <= 0) return 1;
  return Math.max(1, Math.round(m / 70)); // 도보 약 70m/분 가정
}

async function findNightBuses(lat, lng) {
  const key = process.env.BUS_STATION_INFO_API_KEY;
  if (!key) return [];

  const cacheKey = `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
  try {
    return await nightBusCache.wrap(cacheKey, async () => {
      const stopsUrl = `http://ws.bus.go.kr/api/rest/stationinfo/getStationByPos?serviceKey=${key}&tmX=${lng}&tmY=${lat}&radius=500&resultType=json`;
      const stopsRes = await fetch(stopsUrl);
      const stopsData = await stopsRes.json();
      const stops = stopsData?.msgBody?.itemList || [];

      const routesPerStop = await Promise.all(
        stops.slice(0, 5).map(async (stop) => {
          const routeUrl = `http://ws.bus.go.kr/api/rest/stationinfo/getRouteByStation?serviceKey=${key}&arsId=${stop.arsId}&resultType=json`;
          const routeRes = await fetch(routeUrl);
          const routeData = await routeRes.json();
          const routes = routeData?.msgBody?.itemList || [];
          return routes
            // 서울 심야버스는 "N" + 숫자만으로 된 노선명(N13, N61 등)이라, 뒤에 지역명이
            // 붙은 경기/인천 노선(예: "N999고양")을 걸러내기 위해 전체 일치로 검사한다.
            .filter((r) => /^N\d+$/.test(r.busRouteNm || ''))
            .map((r) => ({
              type: 'night_bus',
              name: `심야버스 ${r.busRouteNm}`,
              walkMin: walkMinFromMeters(stop.dist),
              intervalMin: Number(r.term) || null,
            }));
        })
      );

      // 같은 노선이 여러 정류소에서 잡힐 수 있어 노선명 기준으로 가장 가까운 것만 남긴다.
      const byName = new Map();
      for (const bus of routesPerStop.flat()) {
        const existing = byName.get(bus.name);
        if (!existing || bus.walkMin < existing.walkMin) byName.set(bus.name, bus);
      }
      return [...byName.values()];
    });
  } catch (err) {
    console.error('[alternatives] 심야버스 조회 실패:', err.message);
    return [];
  }
}

async function findWaitingSpots(lat, lng) {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) return [];

  try {
    const url = `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=CS2&x=${lng}&y=${lat}&radius=500&sort=distance`;
    const res = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } });
    const data = await res.json();
    return (data.documents || []).slice(0, 3).map((d) => ({
      name: d.place_name,
      walkMin: walkMinFromMeters(d.distance),
    }));
  } catch (err) {
    console.error('[alternatives] 대기 장소 조회 실패:', err.message);
    return [];
  }
}

async function getAlternatives({ lat, lng, segmentId }) {
  const [nightBuses, waitingSpots] = await Promise.all([
    findNightBuses(lat, lng),
    findWaitingSpots(lat, lng),
  ]);

  return {
    segmentId: segmentId || null,
    transitAlternatives: [
      ...nightBuses,
      { type: 'taxi', name: '택시 승차 지점', walkMin: 2 },
      { type: 'wait_first_train', name: '첫차까지 대기', firstTrainTime: null },
    ],
    waitingSpots: waitingSpots.length ? waitingSpots : [{ name: '24시간 편의점', walkMin: 1 }],
    costComparison: null, // Future Work — 프론트는 null이면 "비용 비교 예정" 배지 표시
  };
}

module.exports = { getAlternatives };
