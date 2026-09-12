import { legIcon } from '../utils/routeFormat';
import './SegmentCard.css';

// F4 환승구간 카드. 평소엔 작게 표시되다가 통과 예정 시각(segment.passExpectedAt)을
// 넘기면 강조되고, "놓치면?" 버튼은 강조 여부와 무관하게 항상 눌러서 F6로 진입할 수
// 있다(강제 전환·자동 전환 없음 — PRD F4 v2 변경).
export default function SegmentCard({ segment, now, onMissed }) {
  const overdue = now.getTime() > segment.passExpectedAt.getTime();
  const toneClass = segment.type === 'final' ? 'final' : segment.safety;

  return (
    <div
      className={
        `segment-card segment-card--${toneClass}` + (overdue ? ' segment-card--overdue' : '')
      }
    >
      <div className="segment-card__info">
        {segment.type === 'final' ? (
          <span className="segment-card__label">🏁 {segment.label}</span>
        ) : (
          <>
            <span className="segment-card__label">
              {legIcon(segment.fromLeg?.mode)} {segment.fromLeg?.line ?? '이전 구간'} → {legIcon(segment.toLeg?.mode)} {segment.toLeg?.line ?? '다음 구간'}
            </span>
            <span className={`segment-card__gap segment-card__gap--${segment.safety}`}>
              환승 여유 {segment.minutesLeft}분
            </span>
          </>
        )}
      </div>
      <button
        type="button"
        className="segment-card__missed"
        onClick={() => onMissed(segment.id)}
      >
        놓치면?
      </button>
    </div>
  );
}
