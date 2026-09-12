/**
 * PRD F4 기준: 여유시간(분)에 따른 안전/주의/위험 등급.
 * 5분 이상 safe / 2~5분 caution / 2분 미만 danger
 */
function classifySafety(minutesLeft) {
  if (minutesLeft >= 5) return 'safe';
  if (minutesLeft >= 2) return 'caution';
  return 'danger';
}

module.exports = { classifySafety };
