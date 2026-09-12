import { legIcon } from '../utils/routeFormat';
import './RouteTimeline.css';

// F3+F4 세로 경로 타임라인 — 출발지부터 도착지까지 탑승/하차를 순서대로 보여준다.
// 역명은 괄호로 표시하고, 교통수단이 바뀌는 환승 지점 바로 위에는 가로 구분선을
// 넣어 "여기서 갈아탄다"는 걸 시각적으로 분리한다. 환승 직후 탑승 지점만 빨간색으로
// 강조하고 "환승 여유 N분"을 표시하며, "놓치면?" 버튼은 모든 탑승 지점에 붙는다.
// 이 줄(카드)의 세로선을 위/아래 여백(padding)까지 늘려서 옆 카드의 선과 맞닿게
// 할지 판단한다. 환승 구분선이나 출발/도착(point) 카드와 맞닿는 방향으로는 늘리지
// 않는다 — 그 자리는 의도적으로 선을 끊어두는 지점이기 때문.
function lineExtension(step, prev, next) {
  const extendUp = !(step.isTransfer || !prev || prev.kind === 'point');
  const extendDown = !(next?.isTransfer || !next || next.kind === 'point');
  return (
    (extendUp ? ' timeline-row--extend-up' : '') + (extendDown ? ' timeline-row--extend-down' : '')
  );
}

export default function RouteTimeline({ steps, now, onMissed }) {
  return (
    <div className="route-timeline">
      {steps.map((step, idx) => {
        const prev = steps[idx - 1];
        const next = steps[idx + 1];

        if (step.kind === 'alight') {
          return (
            <div
              className={'timeline-row timeline-row--alight' + lineExtension(step, prev, next)}
              key={step.id}
            >
              <div className="timeline-row__rail">
                <span className="timeline-dot timeline-dot--alight" />
              </div>
              <div className="timeline-row__content">
                <span className="timeline-row__label timeline-row__label--muted">
                  {legIcon(step.mode)} {step.line} 하차 ({step.station})
                </span>
              </div>
            </div>
          );
        }

        const overdue = step.passExpectedAt ? now.getTime() > step.passExpectedAt.getTime() : false;

        if (step.kind === 'point') {
          return (
            <div
              className={
                'timeline-row timeline-row--point' + (overdue ? ' timeline-row--overdue' : '')
              }
              key={step.id}
            >
              <div className="timeline-row__rail">
                <span className={`timeline-dot timeline-dot--${step.role}`} />
              </div>
              <div className="timeline-row__content">
                <span className="timeline-row__label">
                  {step.role === 'start' ? '🚩 출발' : '🏁 도착'} ({step.name})
                </span>
              </div>
              {step.missable && (
                <button type="button" className="timeline-row__missed" onClick={() => onMissed(step)}>
                  막차를 놓치셨나요?
                </button>
              )}
            </div>
          );
        }

        // kind === 'board'
        return (
          <div key={step.id}>
            {step.isTransfer && <div className="timeline-divider" role="separator" />}
            <div
              className={
                'timeline-row timeline-row--board' +
                (step.isTransfer ? ' timeline-row--transfer' : '') +
                (overdue ? ' timeline-row--overdue' : '') +
                lineExtension(step, prev, next)
              }
            >
              <div className="timeline-row__rail">
                <span className={'timeline-dot' + (step.isTransfer ? ' timeline-dot--transfer' : '')} />
              </div>
              <div className="timeline-row__content">
                <span className="timeline-row__label">
                  {legIcon(step.mode)} {step.line} 탑승 ({step.station})
                </span>
                {step.isTransfer ? (
                  <span className="timeline-row__gap">환승 여유 {step.minutesLeft}분</span>
                ) : (
                  // 첫 탑승은 환승이 아니라 "탑승 가능 시간까지"와 같은 값(상단 배너의
                  // 실시간 카운트다운과 동일한 기준, step.passExpectedAt === departureDeadline)
                  // 이므로 "탑승 여유"로 구분해 표시한다.
                  <span className="timeline-row__gap timeline-row__gap--board">
                    탑승 여유 {Math.max(0, Math.round((step.passExpectedAt - now) / 60000))}분
                  </span>
                )}
              </div>
              <button type="button" className="timeline-row__missed" onClick={() => onMissed(step)}>
                막차를 놓치셨나요?
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
