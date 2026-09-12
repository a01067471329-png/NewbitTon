/**
 * 카카오맵 대중교통 경로 조회 API 프록시.
 * https://dapi.kakao.com/v2/routing/publictraffic (2026-07-21부터 서비스 중, 기존
 * 카카오 REST 키로 별도 심사 없이 바로 호출 가능 — 상세 조사 내역은 PRD 1.6/10.1 참고).
 *
 * 카카오 응답에는 역/정류장 "이름"만 있고 ID가 전혀 없어서, 막차시각 조회에 필요한
 * ID로 역변환해야 한다:
 * - 지하철: 노선명이 "N호선"(1~9)이면 서울 열린데이터광장 시간표(seoulMetroSchedule,
 *   ODsay를 전혀 안 씀)를 우선 시도하고, 그 외 노선(신분당선 등, 실제 호출로 시간표
 *   데이터가 없음을 확인함)은 ODsay searchStation(역명 검색)으로 stationID를 얻어
 *   기존 lastTrain.js 로직으로 폴백한다. 방향(wayCode)은 ODsay 경로탐색 응답에서만
 *   나오는 값이라 카카오 전환 후에는 얻을 수 없어, 두 경로 모두 "상/하행 중 이른
 *   시각 채택" 근사를 쓴다(PRD 10.1 참고, 후속 개선 대상).
 * - 버스: TOPIS getStationByPos(좌표 반경 검색)로 이름이 일치하는 정류장을 찾고,
 *   getRouteByStation으로 그 노선의 busRouteId를 확인한다. 동명이정류장(같은 이름,
 *   다른 방향)이 여러 개면 1차 구현에서는 방향을 확정할 수 없으므로 포기하고 mock으로
 *   안전하게 폴백한다(다음 정류장 순서 비교로 방향을 확정하는 개선은 PRD 10.1 참고).
 *
 * 카카오 이용약관상 경로 결과 자체는 캐싱하지 않고 항상 실시간으로 호출한다. 대신
 * 이름->ID 매핑은 역/정류장 위치가 거의 바뀌지 않으므로 사실상 영구 캐시한다.
 */
const { createCache } = require('../../lib/cache');
const seoulMetroSchedule = require('../seoulMetroSchedule');

const PERMANENT_TTL = 365 * 24 * 60 * 60 * 1000;
const subwayIdCache = createCache(PERMANENT_TTL);
const busIdCache = createCache(PERMANENT_TTL);

// trafficType: 1 = 지하철, 2 = 버스, 3 = 도보/환승 (ODsay 관례를 그대로 따름 — lastTrain.js 재사용 목적)
const TRAFFIC_TYPE = { SUBWAY: 1, BUS: 2, TRANSFER: 3 };

// 카카오가 응답 안 하거나 키가 없을 때 쓰는 mock (odsay.js의 mock과 형태 통일)
function getMockRawPaths() {
  return [
    {
      info: { totalTime: 34 },
      subPath: [
        { trafficType: TRAFFIC_TYPE.SUBWAY, lane: [{ name: '2호선' }], startName: '강남', endName: '잠실', sectionTime: 12 },
        { trafficType: TRAFFIC_TYPE.TRANSFER, sectionTime: 4 },
        { trafficType: TRAFFIC_TYPE.BUS, lane: [{ busNo: '지선버스 461' }], startName: '잠실역', endName: '목적지 인근', sectionTime: 15 },
      ],
    },
  ];
}

async function resolveSubwayStationId(stationName) {
  const apiKey = process.env.ODSAY_API_KEY;
  if (!apiKey || !stationName) return null;
  return subwayIdCache.wrap(stationName, async () => {
    try {
      const qs = new URLSearchParams({ apiKey, stationName, stationClass: 2 }).toString();
      const res = await fetch(`https://api.odsay.com/v1/api/searchStation?${qs}`);
      const data = await res.json();
      // 공식 문서에 정확한 중첩 구조가 없어(오늘 여러 API에서 겪은 문제와 동일 패턴)
      // 방어적으로 몇 가지 가능한 경로를 다 시도한다.
      const list = data?.result?.station || data?.result || [];
      const item = Array.isArray(list) ? list[0] : null;
      const id = item?.stationID ?? null;
      if (!id) {
        console.error('[kakao] ODsay searchStation 응답에서 stationID를 못 찾음', { stationName, data });
      }
      return id;
    } catch (err) {
      console.error('[kakao] ODsay searchStation 호출 실패:', stationName, err.message);
      return null;
    }
  });
}

async function resolveBusIds(stopName, x, y, busNo) {
  const key = process.env.BUS_STATION_INFO_API_KEY;
  if (!key || !stopName || x == null || y == null || !busNo) return null;
  const cacheKey = `${stopName}|${busNo}|${Number(x).toFixed(5)},${Number(y).toFixed(5)}`;
  return busIdCache.wrap(cacheKey, async () => {
    try {
      const posUrl = `http://ws.bus.go.kr/api/rest/stationinfo/getStationByPos?serviceKey=${key}&tmX=${x}&tmY=${y}&radius=150&resultType=json`;
      const posRes = await fetch(posUrl);
      const posData = await posRes.json();
      const nameMatches = (posData?.msgBody?.itemList || []).filter((s) => s.stationNm === stopName);
      if (nameMatches.length === 0) return null;

      // 이름이 일치하는 정류장 후보마다 이 버스 노선이 실제로 지나는지 확인해서
      // busRouteId를 얻는다. 방향이 다른 동명이정류장이 여러 개 나오면(둘 다 같은
      // 노선이 지나감) 1차 구현에서는 방향을 확정할 방법이 없어 포기한다.
      const withRoute = await Promise.all(
        nameMatches.map(async (stop) => {
          const routeUrl = `http://ws.bus.go.kr/api/rest/stationinfo/getRouteByStation?serviceKey=${key}&arsId=${stop.arsId}&resultType=json`;
          const routeRes = await fetch(routeUrl);
          const routeData = await routeRes.json();
          const match = (routeData?.msgBody?.itemList || []).find((r) => r.busRouteNm === busNo);
          return match ? { arsId: stop.arsId, busRouteId: match.busRouteId } : null;
        })
      );
      const resolved = withRoute.filter(Boolean);
      if (resolved.length === 1) return resolved[0];
      if (resolved.length > 1) {
        console.error('[kakao] 동명이정류장 다수 발견, 방향 특정 불가(순서비교 미구현) - mock 폴백', {
          stopName, busNo, candidates: resolved,
        });
      }
      return null;
    } catch (err) {
      console.error('[kakao] TOPIS 정류장/노선 조회 실패:', stopName, busNo, err.message);
      return null;
    }
  });
}

// 카카오 응답의 stops[]는 이동 순서대로 오므로 첫/끝 항목이 그대로 승차/하차 지점이다.
async function mapStepToSubPath(step) {
  const p = step.properties;
  const points = step.path?.points || [];
  const [startX, startY] = points[0] || [];
  const [endX, endY] = points[points.length - 1] || [];
  const stops = p.stops || [];
  const startName = stops[0]?.name;
  const endName = stops[stops.length - 1]?.name;
  const sectionTime = Math.round((p.time || 0) / 60);
  const base = { sectionTime, startName, endName, startX, startY, endX, endY };

  if (p.type === 'WALKING') {
    return { ...base, trafficType: TRAFFIC_TYPE.TRANSFER };
  }
  if (p.type === 'SUBWAY') {
    const lineName = p.vehicles?.[0]?.name;
    // 1~9호선이면 서울교통공사 시간표(ODsay 안 씀)를 우선 시도하고, 그 외 노선이거나
    // 역을 못 찾으면 ODsay searchStation으로 폴백한다.
    const seoulMetroFrCode = await seoulMetroSchedule.findFrCode(startName, lineName);
    if (seoulMetroFrCode) {
      return { ...base, trafficType: TRAFFIC_TYPE.SUBWAY, lane: [{ name: lineName }], seoulMetroFrCode };
    }
    const startID = await resolveSubwayStationId(startName);
    return { ...base, trafficType: TRAFFIC_TYPE.SUBWAY, lane: [{ name: lineName }], startID };
  }
  // BUS
  const busNo = p.vehicles?.[0]?.name;
  const ids = await resolveBusIds(startName, startX, startY, busNo);
  return {
    ...base,
    trafficType: TRAFFIC_TYPE.BUS,
    lane: [{ busNo, busLocalBlID: ids?.busRouteId ?? null }],
    startArsID: ids?.arsId ?? null,
  };
}

async function searchPaths({ startX, startY, endX, endY }, { maxCandidates = 5 } = {}) {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) return { mocked: true, rawPaths: getMockRawPaths() };

  try {
    const qs = new URLSearchParams({
      start_x: startX,
      start_y: startY,
      end_x: endX,
      end_y: endY,
    }).toString();
    const res = await fetch(`https://dapi.kakao.com/v2/routing/publictraffic?${qs}`, {
      headers: { Authorization: `KakaoAK ${apiKey}` },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`카카오맵 API 오류 (${res.status}): ${text}`);
    }
    const data = await res.json();
    if (data.status !== 'OK') {
      throw new Error(`카카오맵 API 오류: ${JSON.stringify(data)}`);
    }

    // ID 역변환(ODsay/TOPIS 호출)에 비용이 들어서, 버릴 후보까지 다 변환하지 않도록
    // 여기서 먼저 상위 N개로 줄인 다음 변환한다.
    const routes = (data.routes || []).slice(0, maxCandidates);

    const rawPaths = await Promise.all(
      routes.map(async (route) => {
        const subPath = await Promise.all(route.steps.map(mapStepToSubPath));
        return {
          info: { totalTime: Math.round((route.properties?.totalTime || 0) / 60) },
          subPath,
        };
      })
    );

    return { mocked: false, rawPaths };
  } catch (err) {
    console.error('[kakao] 경로탐색 실패, mock으로 폴백:', err.message);
    return { mocked: true, rawPaths: getMockRawPaths() };
  }
}

module.exports = { searchPaths };
