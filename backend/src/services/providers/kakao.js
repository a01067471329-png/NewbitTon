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
 *   기존 lastTrain.js 로직으로 폴백한다. 방향은 카카오 stops[]의 다음 역과 서울시
 *   STATION_CD(노선을 따라 순차적으로 매겨짐)를 비교해 확정한다(seoulMetroSchedule
 *   참고) — 분기 구간 등으로 판단이 애매하면 안전하게 "이른 시각 채택"으로 폴백.
 *   ODsay 폴백 경로는 여전히 wayCode가 없어 그 근사를 그대로 쓴다.
 * - 버스: TOPIS getStationByPos(좌표 반경 검색)로 이름이 일치하는 정류장을 찾고,
 *   getRouteByStation으로 그 노선의 busRouteId를 확인한다. 동명이정류장(도로 반대편의
 *   다른 방향 정류장)이 여러 개면, 카카오 경로 좌표(path.points)로 실제 진행방향
 *   벡터를 만들어 외적으로 "오른쪽"(한국 우측통행 기준) 정류장을 고른다 — 실제
 *   사례(9m/115m 거리의 동명 정류장 2개)로 검증 완료. 그래도 애매하면 mock 폴백.
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

// 카카오는 "지하철2호선강남역(중)"처럼 중앙차로 등을 괄호로 부기하는데 TOPIS DB엔
// 그 부기가 없어("지하철2호선강남역") 정확 일치 비교가 항상 실패했다. 검색어에서
// 제거한다.
function cleanStopName(name) {
  return (name || '').replace(/\(.*?\)/g, '').trim();
}

// 두 벡터의 외적 z성분. 진행방향 D 기준으로 V가 오른쪽(시계방향)이면 음수가 된다.
function cross2d(dx, dy, vx, vy) {
  return dx * vy - dy * vx;
}

/**
 * 동명이정류장(같은 이름, 도로 반대편의 다른 방향 정류장)이 여러 개 나오면, 카카오가
 * 준 경로 좌표(path.points)로 실제 진행 방향 벡터를 만들고, 각 후보 정류장이 그
 * 방향 기준 왼쪽/오른쪽 중 어디에 있는지 외적으로 판별한다. 한국은 우측통행이라
 * 정방향으로 달리는 버스는 진행방향 기준 오른쪽 정류장에 선다 — 실제 동명이정류장
 * 사례(9m 거리 차 정류장 2개)로 검증 완료.
 */
function pickByTravelDirection(candidates, points) {
  if (candidates.length <= 1) return candidates[0] || null;
  if (!Array.isArray(points) || points.length < 2) return null;

  const [ox, oy] = points[0];
  const [fx, fy] = points[Math.min(3, points.length - 1)];
  const dx = fx - ox;
  const dy = fy - oy;

  const scored = candidates.map((c) => ({
    candidate: c,
    cross: cross2d(dx, dy, Number(c.stop.gpsX) - ox, Number(c.stop.gpsY) - oy),
  }));
  const onRight = scored.filter((s) => s.cross < 0);
  if (onRight.length === 1) return onRight[0].candidate;
  // 애매하면(오른쪽 후보가 0개 또는 여러 개) 확신할 수 없으니 포기한다.
  return null;
}

// TOPIS 정류장 첫차시각("HHMMSS") -> 분
function busTimeToMinutes(hhmmss) {
  const s = String(hhmmss || '').trim();
  if (s.length < 4) return null;
  const h = Number(s.slice(0, 2));
  const m = Number(s.slice(2, 4));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

async function stopsNear(key, x, y, cleanName, radius = 200) {
  const url = `http://ws.bus.go.kr/api/rest/stationinfo/getStationByPos?serviceKey=${key}&tmX=${x}&tmY=${y}&radius=${radius}&resultType=json`;
  const data = await (await fetch(url)).json();
  return (data?.msgBody?.itemList || []).filter((s) => cleanStopName(s.stationNm) === cleanName);
}

async function firstBusMinutes(key, arsId, busRouteId) {
  const url = `http://ws.bus.go.kr/api/rest/stationinfo/getBustimeByStation?serviceKey=${key}&arsId=${arsId}&busRouteId=${busRouteId}&resultType=json`;
  const data = await (await fetch(url)).json();
  return busTimeToMinutes(data?.msgBody?.itemList?.[0]?.firstBusTm);
}

/**
 * 동명이정류장(도로 반대편의 다른 방향 정류장)을 실제 운행 순서로 확정한다.
 * 같은 노선에서 "우리 정류장 -> 다음 정류장"이 실제 진행 순서라면 다음 정류장의
 * 첫차 시각이 우리 정류장보다 조금 늦다. 반대 방향 폴끼리 짝지으면 음수가 되고,
 * 엉뚱한 조합(정방향 폴 + 역방향 폴)은 한 바퀴 차이만큼(수십 분) 벌어진다.
 * 실측(140번 강남역/논현역): 정답 조합 +1.7분, 반대 방향 -2.5분, 엉뚱한 조합 ±56분.
 */
async function pickByRunOrder(key, candidates, nextStopName, points) {
  const cleanNext = cleanStopName(nextStopName);
  if (!cleanNext || !Array.isArray(points) || points.length < 4) return null;
  try {
    // 다음 정류장은 경로 좌표를 따라 조금 진행한 지점 근처에서 찾는다.
    const probe = points[Math.floor(points.length * 0.08)] || points[1];
    const nextCands = await stopsNear(key, probe[0], probe[1], cleanNext);
    if (!nextCands.length) return null;

    for (const cand of candidates) {
      const ourFirst = await firstBusMinutes(key, cand.arsId, cand.busRouteId);
      if (ourFirst === null) continue;
      for (const nextStop of nextCands) {
        const nextFirst = await firstBusMinutes(key, nextStop.arsId, cand.busRouteId);
        if (nextFirst === null) continue;
        const diff = nextFirst - ourFirst;
        // 인접 정류장 사이의 정상적인 시간차(작은 양수)일 때만 정방향으로 인정
        if (diff > 0 && diff <= 15) return cand;
      }
    }
  } catch (err) {
    console.error('[kakao] 버스 운행순서 방향 판별 실패:', nextStopName, err.message);
  }
  return null;
}

async function resolveBusIds(stopName, nextStopName, points, busNo) {
  const key = process.env.BUS_STATION_INFO_API_KEY;
  const cleanName = cleanStopName(stopName);
  const [x, y] = points?.[0] || [];
  if (!key || !cleanName || x == null || y == null || !busNo) return null;
  const cacheKey = `${cleanName}|${busNo}|${Number(x).toFixed(5)},${Number(y).toFixed(5)}`;
  return busIdCache.wrap(cacheKey, async () => {
    try {
      const nameMatches = await stopsNear(key, x, y, cleanName, 150);
      if (nameMatches.length === 0) return null;

      // 이름이 일치하는 정류장 후보마다 이 버스 노선이 실제로 지나는지 확인해서
      // busRouteId를 얻는다.
      const withRoute = await Promise.all(
        nameMatches.map(async (stop) => {
          const routeUrl = `http://ws.bus.go.kr/api/rest/stationinfo/getRouteByStation?serviceKey=${key}&arsId=${stop.arsId}&resultType=json`;
          const routeRes = await fetch(routeUrl);
          const routeData = await routeRes.json();
          const match = (routeData?.msgBody?.itemList || []).find((r) => r.busRouteNm === busNo);
          return match ? { stop, arsId: stop.arsId, busRouteId: match.busRouteId } : null;
        })
      );
      const resolved = withRoute.filter(Boolean);
      if (resolved.length === 1) return resolved[0];
      if (resolved.length > 1) {
        // 1순위: 실제 운행 순서(첫차 시각 비교)로 확정 — 추측이 아님
        const byOrder = await pickByRunOrder(key, resolved, nextStopName, points);
        if (byOrder) return byOrder;
        // 2순위: 기하학적 판별(우측통행 기준 진행방향 오른쪽)
        const picked = pickByTravelDirection(resolved, points);
        if (picked) return picked;
        console.error('[kakao] 동명이정류장 방향 판별 실패, mock 폴백', {
          stopName, busNo, candidates: resolved.map((r) => r.arsId),
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
    const nextStopName = stops[1]?.name; // 다음 역(방향 판별용, 없으면 이 leg가 1구간뿐)
    // 1~9호선이면 서울교통공사 시간표(ODsay 안 씀)를 우선 시도하고, 그 외 노선이거나
    // 역을 못 찾으면 ODsay searchStation으로 폴백한다.
    const [own, next] = await Promise.all([
      seoulMetroSchedule.findStation(startName, lineName),
      nextStopName ? seoulMetroSchedule.findStation(nextStopName, lineName) : Promise.resolve(null),
    ]);
    if (own?.frCode) {
      return {
        ...base,
        trafficType: TRAFFIC_TYPE.SUBWAY,
        lane: [{ name: lineName }],
        seoulMetroFrCode: own.frCode,
        // 다음 역 코드가 있으면 같은 열차번호의 도착시각 비교로 진행 방향을 확정한다.
        seoulMetroNextFrCode: next?.frCode ?? null,
      };
    }
    const startID = await resolveSubwayStationId(startName);
    return { ...base, trafficType: TRAFFIC_TYPE.SUBWAY, lane: [{ name: lineName }], startID };
  }
  // BUS
  const busNo = p.vehicles?.[0]?.name;
  const ids = await resolveBusIds(startName, stops[1]?.name, points, busNo);
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
