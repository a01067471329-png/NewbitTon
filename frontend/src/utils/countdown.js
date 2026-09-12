export function addMinutes(date, minutes) {
  const base = date instanceof Date ? date : new Date(date);
  return new Date(base.getTime() + minutes * 60000);
}

// diffMs가 음수여도(마감을 지난 경우) 항상 "OO분 OO초" 형태의 절댓값 문자열을
// 반환한다. 지났는지 여부는 호출하는 쪽에서 별도로 표시한다 (F3 배너 참고).
export function formatCountdown(diffMs) {
  const totalSeconds = Math.max(0, Math.floor(Math.abs(diffMs) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}분 ${String(seconds).padStart(2, '0')}초`;
}
