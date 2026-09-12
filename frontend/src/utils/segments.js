import { addMinutes } from './countdown';

// F4 환승구간 리스트 생성 (PRD F4 v2).
// 현재 실제 백엔드(backend/src/services/lastTrain.js)는 아직 transferGaps에
// segmentId나 "최종 목적지 도착" 구간을 내려주지 않으므로, legs·transferGaps로부터
// 클라이언트에서 구성한다. 백엔드가 PRD 5장 v2 계약대로 필드를 내려주기 시작하면
// segmentId는 자동으로 그 값이 우선 사용되고, final 구간도 백엔드 값으로 교체하기
// 쉽게 구조를 맞춰뒀다.
//
// 리스트의 마지막 항목(final)은 최종 목적지 도착 구간으로, 여기의 "놓치면?"이
// 기존 "막차 최종 실패"(알람 시각 초과) 대응 역할을 겸한다 — 그래서 final 구간의
// passExpectedAt은 departureDeadline 그 자체로 둔다: 이 시각을 넘기면 애초에
// 첫 교통수단부터 놓친 것이므로 전체 여정이 실패로 간주된다.
export function buildSegments(selectedRoute, destinationName) {
  const legs = selectedRoute.legs || [];
  const departureDeadline = new Date(selectedRoute.departureDeadline);

  // 각 leg 종료 시점까지의 누적 소요시간 (backend/src/services/lastTrain.js의
  // cumulativeAfter 계산과 동일한 방식)
  const cumulativeAfter = [];
  let running = 0;
  legs.forEach((leg) => {
    running += leg.mode === 'transfer' ? leg.walkAdjustedMin ?? leg.durationMin : leg.durationMin;
    cumulativeAfter.push(running);
  });

  const transferSegments = (selectedRoute.transferGaps || []).map((gap) => {
    const cumulativeMin = cumulativeAfter[gap.afterLeg] ?? 0;
    return {
      id: gap.segmentId || `t${gap.afterLeg}`,
      type: 'transfer',
      safety: gap.safety,
      minutesLeft: gap.minutesLeft,
      passExpectedAt: addMinutes(departureDeadline, cumulativeMin),
      fromLeg: legs[gap.afterLeg - 1] || null,
      toLeg: legs[gap.afterLeg + 1] || null,
    };
  });

  const finalSegment = {
    id: 'final',
    type: 'final',
    label: destinationName ? `${destinationName} 도착` : '최종 목적지 도착',
    passExpectedAt: departureDeadline,
  };

  return [...transferSegments, finalSegment];
}
