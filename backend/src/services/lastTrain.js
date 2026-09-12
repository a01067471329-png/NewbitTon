/**
 * 막차/막버스 시각 조회 + 역산 알람 시각 계산 (PRD F3, F4 핵심 로직)
 *
 * 데이터 소스:
 * - 지하철: ODsay searchSubwaySchedule (평일/토요일/일요일·공휴일 시간표를 요일별로 따로 제공,
 *   firstLastFlag로 막차를 직접 표시함). ODsay 경로탐색 응답의 startID를 그대로 사용해서
 *   별도 역 검색 없이 바로 조회 가능.
 * - 버스: 정류장 단위 막차는 서울시 TOPIS 정류소정보조회(getBustimeByStation, BUS_STATION_INFO_API_KEY),
 *   여기서 실패하면 ODsay busLaneDetail(기점 기준, 정확도는 떨어짐)로 대체
 * - 키가 없거나 조회에 실패하면 지하철 24:00 / 버스 23:30 mock으로 안전하게 대체한다.
 */

const { classifySafety } = require('../utils/safety');
const { createCache } = require('../lib/cache');

// trafficType: 1 = 지하철, 2 = 버스, 3 = 도보/환승 (ODsay 관례를 따름)
const TRAFFIC_TYPE = { SUBWAY: 1, BUS: 2, TRANSFER: 3 };

const MOCK_SUBWAY_LAST = { hour: 24, minute: 0 };
const MOCK_BUS_LAST = { hour: 23, minute: 30 };

// KST 기준 하루 동안은 값이 바뀌지 않으므로 24시간 캐시
const subwayScheduleCache = createCache(24 * 60 * 60 * 1000);
const busStopTimeCache = createCache(24 * 60 * 60 * 1000);
const busLaneDetailCache = createCache(24 * 60 * 60 * 1000);

const KST_OFFSET_MIN = 9 * 60;

function parseHHMM(hhmmss) {
  if (!hhmmss || hhmmss.length < 4) return null;
  const hour = Number(hhmmss.slice(0, 2));
  const minute = Number(hhmmss.slice(2, 4));
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return { hour, minute };
}

function parseHHcolonMM(hhmm) {
  if (!hhmm) return null;
  const [hour, minute] = hhmm.split(':').map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return { hour, minute };
}

// ---- 지하철: ODsay searchSubwaySchedule ----

// 일요일 -> holidaySchedule, 토요일 -> saturdaySchedule, 그 외 -> weekdaySchedule
// (공휴일 판정은 생략 — PRD 1.6 제약사항 참고)
function subwayScheduleKeyFor(now) {
  const kst = new Date(now.getTime() + KST_OFFSET_MIN * 60000);
  const day = kst.getUTCDay();
  if (day === 0) return 'holidaySchedule';
  if (day === 6) return 'saturdaySchedule';
  return 'weekdaySchedule';
}

// firstLastFlag: 1=첫차, 2=막차. 막차로 표시된 항목이 없으면 배열에서 가장 늦은 시각으로 대체.
function lastDepartureTimeOf(list) {
  if (!Array.isArray(list) || !list.length) return null;
  const flagged = list.filter((x) => x.firstLastFlag === 2);
  const candidates = flagged.length ? flagged : list;
  return candidates.reduce((a, b) => (a.departureTime > b.departureTime ? a : b)).departureTime; // "HH:MM" (24시 초과 표기 가능)
}

/**
 * 지하철 막차 시각 조회.
 * 상행/하행 중 정확한 방향을 특정하기 어려워서, 두 방향을 모두 조회한 뒤 더 이른 시각을
 * 채택한다 (막차를 놓치는 쪽보다 안전한 방향으로 근사).
 */
async function lookupSubwayLastDeparture(stationID, now) {
  const key = process.env.ODSAY_API_KEY;
  if (!key || !stationID) return null;
  try {
    const data = await subwayScheduleCache.wrap(String(stationID), async () => {
      const qs = new URLSearchParams({ apiKey: key, lang: 0, stationID }).toString();
      const res = await fetch(`https://api.odsay.com/v1/api/searchSubwaySchedule?${qs}`);
      return res.json();
    });

    const sched = data?.result?.[subwayScheduleKeyFor(now)];
    if (!sched) return null;

    const times = [lastDepartureTimeOf(sched.up), lastDepartureTimeOf(sched.down)]
      .filter(Boolean)
      .sort();
    if (!times.length) return null;
    return parseHHcolonMM(times[0]);
  } catch (err) {
    console.error('[lastTrain] ODsay 지하철 시간표 조회 실패:', err.message);
    return null;
  }
}

// ---- 버스: TOPIS(정류장 기준) 우선, ODsay(기점 기준) 폴백 ----

async function lookupBusLastDepartureFromTopis(arsId, busRouteId) {
  const key = process.env.BUS_STATION_INFO_API_KEY;
  if (!key || !arsId || !busRouteId) return null;
  const cacheKey = `${arsId}|${busRouteId}`;
  const result = await busStopTimeCache.wrap(cacheKey, async () => {
    const url = `http://ws.bus.go.kr/api/rest/stationinfo/getBustimeByStation?serviceKey=${key}&arsId=${arsId}&busRouteId=${busRouteId}&resultType=json`;
    const res = await fetch(url);
    const data = await res.json();
    const item = data?.msgBody?.itemList?.[0];
    return { firstBusTm: item?.firstBusTm || null, lastBusTm: item?.lastBusTm || null };
  });
  const last = parseHHMM(result?.lastBusTm);
  if (!last) return null;
  const first = parseHHMM(result?.firstBusTm);
  // TOPIS는 자정을 넘겨 운행하는 노선의 막차를 00~03시대의 작은 숫자로 표시한다.
  // 막차 시(hour)가 첫차 시보다 작으면 "오늘 새벽에 이미 지난 시각"이 아니라
  // "오늘 밤 자정 이후"로 해석해 24시간을 더한다.
  if (first && last.hour < first.hour) {
    return { hour: last.hour + 24, minute: last.minute };
  }
  return last;
}

async function lookupBusLastDepartureFromOdsay(busID) {
  const key = process.env.ODSAY_API_KEY;
  if (!key || !busID) return null;
  const lastTime = await busLaneDetailCache.wrap(String(busID), async () => {
    const qs = new URLSearchParams({ apiKey: key, lang: 0, busID }).toString();
    const res = await fetch(`https://api.odsay.com/v1/api/busLaneDetail?${qs}`);
    const data = await res.json();
    return data?.result?.busLastTime || null; // "HH:MM" (심야버스는 "28:00"처럼 24시 초과 표기)
  });
  return parseHHcolonMM(lastTime);
}

async function lookupBusLastDeparture(busSubPath) {
  try {
    const lane = busSubPath?.lane?.[0];
    const viaTopis = await lookupBusLastDepartureFromTopis(
      busSubPath?.startArsID,
      lane?.busLocalBlID
    );
    if (viaTopis) return viaTopis;
    return await lookupBusLastDepartureFromOdsay(lane?.busID);
  } catch (err) {
    console.error('[lastTrain] 버스 막차 조회 실패:', err.message);
    return null;
  }
}

async function lookupLastDeparture(sp, now) {
  if (!sp) return MOCK_SUBWAY_LAST;
  if (sp.trafficType === TRAFFIC_TYPE.SUBWAY) {
    return (await lookupSubwayLastDeparture(sp.startID, now)) || MOCK_SUBWAY_LAST;
  }
  if (sp.trafficType === TRAFFIC_TYPE.BUS) {
    return (await lookupBusLastDeparture(sp)) || MOCK_BUS_LAST;
  }
  return MOCK_SUBWAY_LAST;
}

// 서버가 어느 시간대에서 돌든(UTC 컨테이너 포함) 항상 한국시간(KST, UTC+9) 기준으로
// "오늘 hour:minute"에 해당하는 정확한 시각(Date)을 계산한다.
function toDateAt(baseDate, hour, minute) {
  const shifted = new Date(baseDate.getTime() + KST_OFFSET_MIN * 60000);
  shifted.setUTCHours(0, 0, 0, 0);
  shifted.setUTCMinutes(hour * 60 + minute);
  return new Date(shifted.getTime() - KST_OFFSET_MIN * 60000);
}

function legLabel(subPath) {
  if (subPath.trafficType === TRAFFIC_TYPE.SUBWAY) {
    return subPath.lane?.[0]?.name || '지하철';
  }
  if (subPath.trafficType === TRAFFIC_TYPE.BUS) {
    return subPath.lane?.[0]?.busNo || '버스';
  }
  return null;
}

// 도보(환승) 구간은 ODsay 응답에 좌표가 없어서, 가장 가까운 대중교통 구간의 좌표로 근사한다.
function nearestCoordinate(legsRaw, idx) {
  for (let i = idx; i >= 0; i -= 1) {
    const sp = legsRaw[i];
    if (sp?.endX != null && sp?.endY != null) return { x: sp.endX, y: sp.endY };
  }
  for (let i = idx; i < legsRaw.length; i += 1) {
    const sp = legsRaw[i];
    if (sp?.startX != null && sp?.startY != null) return { x: sp.startX, y: sp.startY };
  }
  return null;
}

/**
 * rawPath (ODsay 스타일) + 도보속도 보정계수 + 기준시각(now) -> PRD 5장(v2) candidate 스키마
 */
async function buildCandidate(rawPath, { walkSpeedFactor, now, routeId }) {
  const legsRaw = rawPath.subPath || [];

  const legs = legsRaw.map((sp) => {
    if (sp.trafficType === TRAFFIC_TYPE.TRANSFER) {
      const walkAdjustedMin = Math.round(sp.sectionTime * walkSpeedFactor * 10) / 10;
      return {
        mode: 'transfer',
        durationMin: sp.sectionTime,
        walkAdjustedMin,
      };
    }
    return {
      mode: sp.trafficType === TRAFFIC_TYPE.SUBWAY ? 'subway' : 'bus',
      line: legLabel(sp),
      from: sp.startName,
      to: sp.endName,
      durationMin: sp.sectionTime,
    };
  });

  const adjustedDuration = (leg) =>
    leg.mode === 'transfer' ? leg.walkAdjustedMin : leg.durationMin;

  // 각 구간 종료 시점까지 누적 소요시간(도보속도 보정 적용)
  const cumulativeAfter = [];
  let running = 0;
  for (const leg of legs) {
    running += adjustedDuration(leg);
    cumulativeAfter.push(running);
  }

  // 각 대중교통 구간(지하철/버스)에 대해 "이 구간을 타려면 언제 출발해야 하는가" 역산
  const transitIndices = legs
    .map((leg, idx) => ({ leg, idx }))
    .filter(({ leg }) => leg.mode === 'subway' || leg.mode === 'bus');

  const lastDepartures = await Promise.all(
    transitIndices.map(({ idx }) => lookupLastDeparture(legsRaw[idx], now))
  );

  let departureDeadline = null;
  transitIndices.forEach(({ idx }, i) => {
    const lastDep = lastDepartures[i];
    const lastDepDate = toDateAt(now, lastDep.hour, lastDep.minute);
    const cumulativeToBoarding = idx === 0 ? 0 : cumulativeAfter[idx - 1];
    const requiredDeparture = new Date(lastDepDate.getTime() - cumulativeToBoarding * 60000);
    if (!departureDeadline || requiredDeparture < departureDeadline) {
      departureDeadline = requiredDeparture;
    }
  });

  // 환승 구간별 여유시간 (안전/주의/위험) — departureDeadline 기준으로 출발했다고 가정한 시뮬레이션
  const transferGaps = [];
  let transferSeq = 0;
  legs.forEach((leg, idx) => {
    if (leg.mode !== 'transfer') return;
    transferSeq += 1;
    const arrivalAtTransferEnd = new Date(
      departureDeadline.getTime() + cumulativeAfter[idx] * 60000
    );
    const nextTransitPos = transitIndices.findIndex(({ idx: tIdx }) => tIdx > idx);
    if (nextTransitPos === -1) return; // 다음 대중교통 구간이 없으면(마지막 도보) final 항목에서 처리
    const nextLastDep = lastDepartures[nextTransitPos];
    const lastDepDate = toDateAt(now, nextLastDep.hour, nextLastDep.minute);
    const minutesLeft = Math.round((lastDepDate - arrivalAtTransferEnd) / 60000);
    transferGaps.push({
      segmentId: `t${transferSeq}`,
      afterLeg: idx,
      minutesLeft,
      safety: classifySafety(minutesLeft),
      location: nearestCoordinate(legsRaw, idx),
    });
  });

  // 최종 목적지 도착 구간 (F6 "놓치면?" 진입점, PRD v2 F4/5장)
  const lastLegIdx = legs.length - 1;
  transferGaps.push({
    segmentId: 'final',
    afterLeg: lastLegIdx,
    minutesLeft: null,
    safety: null,
    location: nearestCoordinate(legsRaw, lastLegIdx),
  });

  const totalDurationMin = rawPath.info?.totalTime ?? cumulativeAfter[cumulativeAfter.length - 1];
  const minutesUntilDeadline = Math.round((departureDeadline - now) / 60000);
  const transferCount = Math.max(transitIndices.length - 1, 0);
  const arrivalEstimate = new Date(now.getTime() + totalDurationMin * 60000).toISOString();

  return {
    routeId,
    legs,
    totalDurationMin,
    transferCount,
    arrivalEstimate,
    transferGaps,
    departureDeadline: departureDeadline.toISOString(),
    minutesUntilDeadline,
  };
}

module.exports = { buildCandidate };
