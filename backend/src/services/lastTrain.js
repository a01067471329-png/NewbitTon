/**
 * 막차/막버스 시각 조회 + 역산 알람 시각 계산 (PRD F3, F4 핵심 로직)
 *
 * 지금은 공공데이터포털 서비스키 연동 전이라 노선별 막차 시각을 mock 테이블로
 * 대체합니다. 실제 데이터로 바꿀 때는 getLastDepartureDate() 안의
 * lookupLastDeparture()만 실제 API 호출로 교체하면 되고, 아래의 역산/여유시간
 * 계산 로직(buildCandidate)은 그대로 재사용할 수 있습니다.
 */

const { classifySafety } = require('../utils/safety');

// trafficType: 1 = 지하철, 2 = 버스, 3 = 도보/환승 (ODsay 관례를 따름)
const TRAFFIC_TYPE = { SUBWAY: 1, BUS: 2, TRANSFER: 3 };

function lookupLastDeparture(legName) {
  // TODO(실데이터 연동 시 교체 대상):
  // - 지하철: 서울교통공사 첫차·막차 정보 / 역코드로 막차시간표 검색 API
  // - 버스: 국토교통부·서울시 버스 관련 막차 데이터
  // 지금은 노선 구분 없이 지하철은 24:00, 버스는 23:30을 기본값으로 사용합니다.
  if (!legName) return { hour: 24, minute: 0 };
  if (legName.includes('버스')) return { hour: 23, minute: 30 };
  return { hour: 24, minute: 0 };
}

// 서버가 어느 시간대에서 돌든(UTC 컨테이너 포함) 항상 한국시간(KST, UTC+9) 기준으로
// "오늘 hour:minute"에 해당하는 정확한 시각(Date)을 계산한다.
const KST_OFFSET_MIN = 9 * 60;

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

/**
 * rawPath (ODsay 스타일) + 도보속도 보정계수 + 기준시각(now) -> PRD 5장 candidate 스키마
 */
function buildCandidate(rawPath, { walkSpeedFactor, now, routeId }) {
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

  let departureDeadline = null;

  for (const { leg, idx } of transitIndices) {
    const lastDep = lookupLastDeparture(leg.line);
    const lastDepDate = toDateAt(now, lastDep.hour, lastDep.minute);
    const cumulativeToBoarding = idx === 0 ? 0 : cumulativeAfter[idx - 1];
    const requiredDeparture = new Date(lastDepDate.getTime() - cumulativeToBoarding * 60000);
    if (!departureDeadline || requiredDeparture < departureDeadline) {
      departureDeadline = requiredDeparture;
    }
  }

  // 환승 구간별 여유시간 (안전/주의/위험) — departureDeadline 기준으로 출발했다고 가정한 시뮬레이션
  const transferGaps = [];
  legs.forEach((leg, idx) => {
    if (leg.mode !== 'transfer') return;
    const arrivalAtTransferEnd = new Date(
      departureDeadline.getTime() + cumulativeAfter[idx] * 60000
    );
    const nextTransit = transitIndices.find(({ idx: tIdx }) => tIdx > idx);
    if (!nextTransit) return;
    const lastDep = lookupLastDeparture(nextTransit.leg.line);
    const lastDepDate = toDateAt(now, lastDep.hour, lastDep.minute);
    const minutesLeft = Math.round((lastDepDate - arrivalAtTransferEnd) / 60000);
    transferGaps.push({
      afterLeg: idx,
      minutesLeft,
      safety: classifySafety(minutesLeft),
    });
  });

  const minutesUntilDeadline = Math.round((departureDeadline - now) / 60000);

  return {
    routeId,
    legs,
    totalDurationMin: rawPath.info?.totalTime ?? cumulativeAfter[cumulativeAfter.length - 1],
    transferGaps,
    departureDeadline: departureDeadline.toISOString(),
    minutesUntilDeadline,
  };
}

module.exports = { buildCandidate };
