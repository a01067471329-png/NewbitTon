// PRD F4 기준 위험도 등급 — backend/src/utils/safety.js와 완전히 동일한 임계값을
// 프론트에서도 재사용한다 (5분 이상 safe / 2~5분 caution / 2분 미만 danger).
// F3의 "탑승 마감까지 남은 시간"에도 같은 기준을 적용해 캐릭터 표정/배너 톤을 정한다
// (환승 구간 자체의 safety는 백엔드가 candidate.transferGaps[].safety로 이미 계산해
// 내려주므로, 이 함수는 프론트에서 새로 계산해야 하는 값에만 쓴다).
export function classifySafety(minutesLeft) {
  if (minutesLeft >= 5) return 'safe';
  if (minutesLeft >= 2) return 'caution';
  return 'danger';
}
