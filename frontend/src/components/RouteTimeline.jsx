import { legIcon } from '../utils/routeFormat';
import './RouteTimeline.css';

// F3+F4 세로 경로 타임라인 — 출발지부터 도착지까지 탑승/하차를 순서대로 보여준다.
// 역명은 괄호로 표시하고, 교통수단이 바뀌는 환승 지점 바로 위에는 가로 구분선을
// 넣어 "여기서 갈아탄다"는 걸 시각적으로 분리한다. 환승 직후 탑승 지점만 빨간색으로
// 강조하고 "환승 여유 N분"을 표시하며, "놓치면?" 버튼은 모든 탑승 지점에 붙는다.
export default function RouteTimeline({ steps, now, onMissed }) {
  return (
    <div className="route-timeline">
      {steps.map((step) => {
        if (step.kind === 'alight') {
          return (
            <div className="timeline-row timeline-row--alight" key={step.id}>
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
                  놓치면?
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
                (overdue ? ' timeline-row--overdue' : '')
              }
            >
              <div className="timeline-row__rail">
                <span className={'timeline-dot' + (step.isTransfer ? ' timeline-dot--transfer' : '')} />
              </div>
              <div className="timeline-row__content">
                <span className="timeline-row__label">
                  {legIcon(step.mode)} {step.line} 탑승 ({step.station})
                </span>
                {step.isTransfer && (
                  <span className="timeline-row__gap">환승 여유 {step.minutesLeft}분</span>
                )}
              </div>
              <button type="button" className="timeline-row__missed" onClick={() => onMissed(step)}>
                놓치면?
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
