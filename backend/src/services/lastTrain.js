/**
 * 막차/막버스 시각 조회 + 역산 알람 시각 계산 (PRD F3, F4 핵심 로직)
 *
 * 데이터 소스:
 * - 지하철: ODsay searchSubwaySchedule (평일/토요일/일요일·공휴일 시간표를 요일별로 따로 제공,
 *   firstLastFlag로 막차를 직접 표시함). ODsay 경로탐색 응답의 startID를 그대로 사용해서
 *   별도 역 검색 없이 바로 조회 가능. 상행/하행 중 이 구간이 실제로 향하는 방향은 경로탐색
 *   응답의 wayCode(1=상행, 2=하행)로 확정해서 고른다 — wayCode가 없는 예외 상황에서만
 *   두 방향의 더 이른 시각을 채택하는 근사로 폴백한다.
 * - 버스: 정류장 단위 막차는 서울시 TOPIS 정류소정보조회(getBustimeByStation, BUS_STATION_INFO_API_KEY).
 *   예전엔 실패 시 ODsay busLaneDetail로 폴백했지만, 검색 한 번에 ODsay를 여러 건 더 쓰게 만들어
 *   일일 한도(30건)를 빠르게 소진시켜서 제거했다 — TOPIS가 실패하면 바로 mock으로 간다.
 * - 막차 시각이 상식적인 범위를 벗어나면(예: 지하철 막차가 오후 6시) API 응답/파싱 문제로 보고
 *   신뢰하지 않는다. 키가 없거나 조회·검증에 실패하면 지하철 24:00 / 버스 23:30 mock으로
 *   안전하게 대체한다.
 */

const { classifySafety } = require('../utils/safety');
const { createCache } = require('../lib/cache');
const seoulMetroSchedule = require('./seoulMetroSchedule');

// trafficType: 1 = 지하철, 2 = 버스, 3 = 도보/환승 (ODsay 관례를 따름)
const TRAFFIC_TYPE = { SUBWAY: 1, BUS: 2, TRANSFER: 3 };

const MOCK_SUBWAY_LAST = { hour: 24, minute: 0 };
const MOCK_BUS_LAST = { hour: 23, minute: 30 };

// KST 기준 하루 동안은 값이 바뀌지 않으므로 24시간 캐시
const subwayScheduleCache = createCache(24 * 60 * 60 * 1000);
const busStopTimeCache = createCache(24 * 60 * 60 * 1000);

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

// 막차 시각이 상식적인 범위를 벗어나면(예: 지하철 막차가 오후 6시) 외부 API 응답 파싱이
// 잘못됐을 가능성이 매우 높다. 그런 값을 그대로 "탑승 마감 시각"으로 내보내면 실제보다
// 훨씬 이른 시각에 막차를 놓친 것처럼 잘못 안내해 사용자를 위험에 빠뜨릴 수 있으므로,
// 범위를 벗어나면 신뢰하지 않고 null을 반환해 mock 기본값으로 안전하게 대체한다.
// (hour는 자정 이후 막차를 24시 초과 표기로 다루는 이 코드베이스 관례를 따른다.)
const SUBWAY_LAST_DEPARTURE_RANGE = { minHour: 21, maxHour: 26 }; // 21:00 ~ 익일 02:00
const BUS_LAST_DEPARTURE_RANGE = { minHour: 19, maxHour: 26 }; // 19:00 ~ 익일 02:00

function isPlausibleLastDeparture(dep, { minHour, maxHour }) {
  return !!dep && dep.hour >= minHour && dep.hour <= maxHour;
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
 * ODsay 경로탐색 응답의 지하철 subPath에는 이 구간이 실제로 향하는 방향의 wayCode
 * (1=상행, 2=하행; 공식 문서 예시 응답 "way":"합정","wayCode":2 참고)가 이미 들어있고,
 * searchSubwaySchedule의 up/down 배열도 같은 규칙을 쓴다. 그래서 예전처럼 상/하행을 둘 다
 * 조회해서 "더 이른 시각"을 추측으로 채택하지 않고, wayCode로 실제 진행 방향의 스케줄만
 * 정확히 골라 쓴다. wayCode가 없거나 그 방향 데이터가 비어있는 예외적인 경우에만 예전의
 * min(상행,하행) 근사로 안전하게 폴백한다.
 */
async function lookupSubwayLastDeparture(stationID, wayCode, now) {
  const key = process.env.ODSAY_API_KEY;
  if (!key || !stationID) return null;
  try {
    const data = await subwayScheduleCache.wrap(String(stationID), async () => {
      const qs = new URLSearchParams({ apiKey: key, lang: 0, stationID }).toString();
      const res = await fetch(`https://api.odsay.com/v1/api/searchSubwaySchedule?${qs}`);
      return res.json();
    });

    const scheduleKey = subwayScheduleKeyFor(now);
    const sched = data?.result?.[scheduleKey];
    if (!sched) return null;

    const upLast = lastDepartureTimeOf(sched.up);
    const downLast = lastDepartureTimeOf(sched.down);

    let chosen;
    if (wayCode === 1 && upLast) {
      chosen = upLast;
    } else if (wayCode === 2 && downLast) {
      chosen = downLast;
    } else {
      const times = [upLast, downLast].filter(Boolean).sort();
      chosen = times[0];
    }

    if (!chosen) return null;
    const parsed = parseHHcolonMM(chosen);
    if (!isPlausibleLastDeparture(parsed, SUBWAY_LAST_DEPARTURE_RANGE)) {
      console.error('[lastTrain] 비정상적인 지하철 막차시각 감지, mock으로 대체', {
        stationID,
        wayCode,
        upLast,
        downLast,
        parsed,
      });
      return null;
    }
    return parsed;
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
  const adjusted = first && last.hour < first.hour ? { hour: last.hour + 24, minute: last.minute } : last;
  // TODO(임시 디버그): ODsay가 확정해준 startArsID가 실제로 어느 정류장인지, TOPIS 원본
  // 시각과 함께 검증하기 위한 로그. 검증 끝나면 제거할 것.
  console.error('[DEBUG lastTrain][bus/topis]', {
    arsId,
    busRouteId,
    rawFirstBusTm: result?.firstBusTm,
    rawLastBusTm: result?.lastBusTm,
    adjusted,
  });
  if (!isPlausibleLastDeparture(adjusted, BUS_LAST_DEPARTURE_RANGE)) {
    console.error('[lastTrain] 비정상적인 버스 막차시각(TOPIS) 감지, 폴백으로 대체', {
      arsId,
      busRouteId,
      adjusted,
    });
    return null;
  }
  return adjusted;
}

async function lookupBusLastDeparture(busSubPath) {
  try {
    const lane = busSubPath?.lane?.[0];
    console.error('[DEBUG lastTrain][bus/leg]', {
      busNo: lane?.busNo,
      startName: busSubPath?.startName,
      endName: busSubPath?.endName,
      startArsID: busSubPath?.startArsID,
      busLocalBlID: lane?.busLocalBlID,
    });
    return await lookupBusLastDepartureFromTopis(busSubPath?.startArsID, lane?.busLocalBlID);
  } catch (err) {
    console.error('[lastTrain] 버스 막차 조회 실패:', err.message);
    return null;
  }
}

async function lookupLastDeparture(sp, now) {
  if (!sp) return MOCK_SUBWAY_LAST;
  if (sp.trafficType === TRAFFIC_TYPE.SUBWAY) {
    // 카카오 라우팅 모드에서 1~9호선으로 판별된 구간은 ODsay를 아예 안 쓰고
    // 서울교통공사 시간표로 처리한다(providers/kakao.js 참고).
    if (sp.seoulMetroFrCode) {
      const dep = await seoulMetroSchedule.lookupLastDeparture(
        sp.seoulMetroFrCode,
        now,
        sp.seoulMetroNextFrCode
      );
      return dep || MOCK_SUBWAY_LAST;
    }
    return (await lookupSubwayLastDeparture(sp.startID, sp.wayCode, now)) || MOCK_SUBWAY_LAST;
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
