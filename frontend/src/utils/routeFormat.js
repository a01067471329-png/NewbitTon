// F2 경로 카드 표시용 가공 유틸리티.
// 현재 실제 백엔드(backend/src/services/lastTrain.js)는 아직 transferCount·
// arrivalEstimate 필드를 내려주지 않으므로, candidate에 값이 있으면 그대로 쓰고
// 없으면 legs/totalDurationMin으로부터 클라이언트에서 계산해 대체한다. 백엔드가
// PRD 5장 v2 계약대로 필드를 내려주기 시작하면 자동으로 그 값이 우선 사용된다.

export function transitLegsOf(candidate) {
  return (candidate.legs || []).filter((leg) => leg.mode !== 'transfer');
}

export function transferCountOf(candidate) {
  if (typeof candidate.transferCount === 'number') return candidate.transferCount;
  return (candidate.legs || []).filter((leg) => leg.mode === 'transfer').length;
}

export function arrivalEstimateOf(candidate, now = new Date()) {
  if (candidate.arrivalEstimate) return new Date(candidate.arrivalEstimate);
  return new Date(now.getTime() + (candidate.totalDurationMin || 0) * 60000);
}

const kstTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatKstTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  return kstTimeFormatter.format(d);
}

export function legIcon(mode) {
  if (mode === 'subway') return '🚇';
  if (mode === 'bus') return '🚌';
  return '🚶';
}

// "탑승 가능 시간까지 남은 시간" 배지 색상 — F4의 환승구간 기준(5분/2분,
// docs/PRD_Newbiton.md)과는 별개로, F2 비교 리스트에서 한눈에 급한 정도를
// 보여주기 위한 UI 전용 임계값이다.
export function deadlineUrgency(minutesUntilDeadline) {
  if (minutesUntilDeadline == null) return 'safe';
  if (minutesUntilDeadline >= 20) return 'safe';
  if (minutesUntilDeadline >= 10) return 'caution';
  return 'danger';
}
