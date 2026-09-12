/**
 * F6 막차 실패 대안 안내 (PRD 5장 v2 GET /api/alternatives)
 *
 * - 심야버스: TOPIS getStationByPos(반경 내 정류소) + getRouteByStation(정류소별 노선)을 조합해
 *   "N"으로 시작하는 노선만 필터링. arsId 기준이라 지하철 막차 조회와 같은 계정/키 재사용.
 * - 대기 장소(편의점/카페/찜질방): 카카오 로컬 API. 편의점은 카테고리 검색(CS2),
 *   카페/찜질방은 카카오에 전용 카테고리 코드가 없어 키워드 검색(query)으로 보완.
 *   지오코딩과 같은 REST API 키 재사용 (호출량 한도가 넉넉해서 캐시 없이도 무방).
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

async function searchKakaoCategory(key, code, lat, lng, radius) {
  const url = `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=${code}&x=${lng}&y=${lat}&radius=${radius}&sort=distance`;
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } });
  const data = await res.json();
  return data.documents || [];
}

async function searchKakaoKeyword(key, query, lat, lng, radius) {
  const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&x=${lng}&y=${lat}&radius=${radius}&sort=distance`;
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } });
  const data = await res.json();
  return data.documents || [];
}

// 카카오 로컬 API는 편의점(CS2)/카페(CE7)는 카테고리 코드가 있지만 찜질방은 전용
// 카테고리가 없어 키워드 검색으로 보완한다. "24시간" 여부는 API가 구조화된 필드로
// 주지 않아 필터링할 수 없으므로, 카페 검색어 자체를 "24시간카페"로 좁혀 근사한다.
async function findWaitingSpots(lat, lng) {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) return [];

  const SPOT_RADIUS_M = 500;
  const SPOT_RADIUS_WIDE_M = 1000; // 찜질방/카페는 편의점보다 드물어 반경을 넓게 잡음

  // 편의점은 밀도가 훨씬 높아 전체를 거리순으로 합치면 카페/찜질방이 밀려나므로,
  // 카테고리별로 몇 개까지 노출할지 상한을 따로 둔다.
  const sources = [
    { type: 'convenience_store', maxCount: 3, fetch: () => searchKakaoCategory(key, 'CS2', lat, lng, SPOT_RADIUS_M) },
    { type: 'cafe_24h', maxCount: 3, fetch: () => searchKakaoKeyword(key, '24시간카페', lat, lng, SPOT_RADIUS_WIDE_M) },
    { type: 'jjimjilbang', maxCount: 2, fetch: () => searchKakaoKeyword(key, '찜질방', lat, lng, SPOT_RADIUS_WIDE_M) },
  ];

  try {
    const results = await Promise.all(
      sources.map(async ({ type, maxCount, fetch: run }) => {
        try {
          const docs = await run();
          return docs.slice(0, maxCount).map((d) => ({
            type,
            name: d.place_name,
            walkMin: walkMinFromMeters(d.distance),
            distanceM: Number(d.distance) || null,
          }));
        } catch (err) {
          console.error(`[alternatives] 대기 장소(${type}) 조회 실패:`, err.message);
          return [];
        }
      })
    );

    // 같은 장소가 여러 검색어에 중복으로 잡힐 수 있어 이름 기준으로 제거한다.
    // 카테고리별 상한(maxCount)을 이미 적용했으므로, 여기서 전체를 다시 거리순으로
    // 합치면 편의점이 항상 가장 가까워 다른 카테고리가 밀려난다 — 대신 카테고리
    // 그룹(편의점 -> 24시간 카페 -> 찜질방) 순서를 유지하고, 그룹 내에서만 거리순 정렬한다.
    const seen = new Set();
    const deduped = [];
    for (const group of results) {
      const groupSpots = [...group]
        .sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity))
        .filter((spot) => !seen.has(spot.name));
      for (const spot of groupSpots) seen.add(spot.name);
      deduped.push(...groupSpots);
    }
    return deduped.map(({ distanceM, ...rest }) => rest);
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
    waitingSpots: waitingSpots.length
      ? waitingSpots
      : [{ type: 'convenience_store', name: '24시간 편의점', walkMin: 1 }],
    costComparison: null, // Future Work — 프론트는 null이면 "비용 비교 예정" 배지 표시
  };
}

module.exports = { getAlternatives };
