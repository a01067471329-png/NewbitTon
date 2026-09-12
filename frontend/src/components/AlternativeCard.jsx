import { alternativeIcon, alternativeDescription } from '../utils/alternativesFormat';
import './AlternativeCard.css';

// F6 대안 교통수단 카드. costComparison은 PRD상 이번 MVP에서 항상 null이라
// "비용 비교 예정" 배지만 표시한다 (F6 v2 변경 — 이번에도 제외 확정).
export default function AlternativeCard({ alternative }) {
  return (
    <div className="alt-card">
      <div className="alt-card__info">
        <span className="alt-card__name">
          {alternativeIcon(alternative.type)} {alternative.name}
        </span>
        <span className="alt-card__desc">{alternativeDescription(alternative)}</span>
      </div>
      <span className="alt-card__cost-badge">비용 비교 예정</span>
    </div>
  );
}
