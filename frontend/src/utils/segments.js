import { addMinutes } from './countdown';

// F4 환승구간 리스트 생성 (PRD F4 v2).
// 백엔드(backend/src/services/lastTrain.js)가 PRD 5장 v2 계약대로 transferGaps
// 배열 끝에 segmentId: 'final'인 최종 목적지 항목을 이미 포함해서 내려준다.
// 이 final 항목은 환승 구간용 매핑(safety/minutesLeft 등)에는 맞지 않는
// 형태(둘 다 null)라 그대로 map()하면 "환승 여유 null분"처럼 깨져 보이고, 아래에서
// 별도로 만드는 자체 finalSegment와 id가 겹쳐 React key 충돌까지 난다 — 그래서
// transferGaps를 순회하기 전에 반드시 걸러낸다.
//
// 자체 finalSegment는 그대로 유지한다: destinationName을 활용한 라벨("OO역 도착")이
// 백엔드가 주는 정보보다 사용자에게 더 유용하기 때문. 리스트의 마지막 항목(final)은
// 최종 목적지 도착 구간으로, 여기의 "놓치면?"이 기존 "막차 최종 실패"(알람 시각
// 초과) 대응 역할을 겸한다 — 그래서 final 구간의 passExpectedAt은 departureDeadline
// 그 자체로 둔다: 이 시각을 넘기면 애초에 첫 교통수단부터 놓친 것이므로 전체
// 여정이 실패로 간주된다.
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

  const transferSegments = (selectedRoute.transferGaps || [])
    .filter((gap) => gap.segmentId !== 'final')
    .map((gap) => {
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
