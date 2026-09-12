import {
  transitLegsOf,
  transferCountOf,
  arrivalEstimateOf,
  formatKstTime,
  legIcon,
  deadlineUrgency,
} from '../utils/routeFormat';
import './RouteCard.css';

// F2 경로 후보 카드. 탭하면 선택(하이라이트)되고, 실제 확정은 화면 하단의
// "이 경로로 막차 알람 시작" 버튼으로 이뤄진다 (PRD F2 v2 변경).
//
// candidate.minutesUntilDeadline은 "막차까지 남은 시간"이 아니라 "지금부터 이
// 경로의 첫 번째 교통수단을 타야 하는 마감까지 남은 시간"이다 — 백엔드가 경로에
// 포함된 모든 대중교통 구간의 막차를 각각 역산해 가장 이른(가장 빠듯한) 값을
// 채택하므로, 중간 구간의 막차가 더 일찍 끊기면 그 제약이 이미 반영되어 있다
// (backend/src/services/lastTrain.js, docs/PRD_Newbiton.md F3 참고). 그래서
// 라벨도 "막차까지"가 아니라 "탑승 가능 시간까지"로 표시한다.
export default function RouteCard({ candidate, recommended, selected, onSelect }) {
  const legs = transitLegsOf(candidate);
  const transferCount = transferCountOf(candidate);
  const arrival = formatKstTime(arrivalEstimateOf(candidate));
  const urgency = deadlineUrgency(candidate.minutesUntilDeadline);

  return (
    <button
      type="button"
      className={
        'route-card' +
        (recommended ? ' route-card--recommended' : '') +
        (selected ? ' route-card--selected' : '')
      }
      onClick={() => onSelect(candidate.routeId)}
      aria-pressed={selected}
    >
      <div className="route-card__legs">
        {legs.map((leg, i) => (
          <span className="route-card__leg" key={i}>
            {legIcon(leg.mode)} {leg.line}
          </span>
        ))}
      </div>
      <div className="route-card__row">
        <span className="route-card__meta-text">
          총 소요 {candidate.totalDurationMin}분 · 환승 {transferCount}회 · {arrival} 도착
        </span>
        <span className={`route-card__deadline route-card__deadline--${urgency}`}>
          탑승 가능 시간까지 {candidate.minutesUntilDeadline}분
        </span>
      </div>
    </button>
  );
}
