import { addMinutes } from './countdown';

// F3+F4 메인 화면의 세로 경로 타임라인 생성.
// 출발지 → (노선+탑승역) → (노선+하차역) → (환승 시 노선+탑승역, 빨간색 강조) →
// (노선+하차역) → ... → 도착지 순서로 나열한다 (가독성 개선 요청 반영).
//
// "놓치면?" 버튼은 모든 "탑승" 지점(맨 처음 탑승 포함)에만 붙는다 — 그 지점을 새
// 출발점으로 한 대안(F6)을 언제든 확인할 수 있게 하기 위함. 도착 지점은 단독으로는
// "놓칠" 대상이 아니라(그 이전의 탑승 지점을 놓쳐야 발생하는 결과이므로) 버튼을
// 붙이지 않는다. 환승 직후의 탑승 지점만 빨간색으로 강조하고 "환승 여유 N분"을
// 함께 보여준다 (backend/src/services/lastTrain.js가 계산한 transferGaps 기준,
// 실제로 교통수단↔교통수단을 갈아탈 때만 해당 — 최초 탑승은 절대 해당 안 됨).
export function buildRouteTimeline(selectedRoute, trip) {
  const legs = selectedRoute.legs || [];
  const departureDeadline = new Date(selectedRoute.departureDeadline);
  const start = trip?.start;
  const destination = trip?.destination;

  // 각 leg 종료 시점까지의 누적 소요시간 (backend와 동일한 계산 방식)
  const cumulativeAfter = [];
  let running = 0;
  legs.forEach((leg) => {
    running += leg.mode === 'transfer' ? leg.walkAdjustedMin ?? leg.durationMin : leg.durationMin;
    cumulativeAfter.push(running);
  });

  // transferGaps[].afterLeg는 "환승(transfer) leg 자신의 인덱스"다
  // (backend/src/services/lastTrain.js 참고) — 그 다음 탑승 leg를 강조하는 데 쓴다.
  const transferGapByLegIdx = new Map(
    (selectedRoute.transferGaps || [])
      .filter((gap) => gap.segmentId !== 'final')
      .map((gap) => [gap.afterLeg, gap])
  );

  const steps = [
    { id: 'start-point', kind: 'point', role: 'start', name: start?.name || '출발지' },
  ];

  // "바로 앞 leg가 transfer인가"만으로 환승 탑승을 판단하면 안 된다 — ODsay 실경로는
  // 출발지에서 첫 역까지 걷는 도보 구간도 별도의 transfer leg로 내려주는 경우가
  // 있어서, 그 경우 첫 대중교통 탑승까지 "환승"으로 잘못 인식된다. 그래서 "지금까지
  // 대중교통을 한 번이라도 탔는지"로 판단한다 — 앞에 도보 leg가 있어도 첫 번째
  // 대중교통 탑승은 항상 isTransferBoard=false다.
  let hasBoardedTransit = false;

  legs.forEach((leg, idx) => {
    if (leg.mode === 'transfer') return;

    const isTransferBoard = hasBoardedTransit;
    const gap = isTransferBoard ? transferGapByLegIdx.get(idx - 1) : null;
    const boardCumulative = idx === 0 ? 0 : cumulativeAfter[idx - 1];
    hasBoardedTransit = true;

    steps.push({
      id: isTransferBoard ? gap?.segmentId || `t${idx}` : 'start',
      kind: 'board',
      mode: leg.mode,
      line: leg.line,
      station: leg.from,
      isTransfer: isTransferBoard,
      safety: gap?.safety,
      minutesLeft: gap?.minutesLeft,
      passExpectedAt: addMinutes(departureDeadline, boardCumulative),
      // 맨 처음 탑승은 출발지 좌표를, 환승 탑승은 백엔드가 계산한 환승지점 좌표를 사용
      location: isTransferBoard ? gap?.location || null : start ? { x: start.x, y: start.y } : null,
      missable: true,
    });

    steps.push({
      id: `alight-${idx}`,
      kind: 'alight',
      mode: leg.mode,
      line: leg.line,
      station: leg.to,
    });
  });

  steps.push({
    id: 'final',
    kind: 'point',
    role: 'end',
    name: destination?.name || '도착지',
    // departureDeadline을 넘기면 첫 교통수단부터 이미 놓친 것이므로, "최종 실패"는
    // 항상 그 이전의 탑승 지점("놓치면?" 있음)에서 이미 감지된다 — 도착 카드
    // 자체는 결과만 보여주는 표시라 missable을 두지 않는다(디자인 피드백 반영).
    passExpectedAt: departureDeadline,
    location: destination ? { x: destination.x, y: destination.y } : null,
  });

  return steps;
}
