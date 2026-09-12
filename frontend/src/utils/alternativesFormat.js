// F6 대안 안내 표시용 가공 유틸리티 (PRD F6, backend/src/services/alternatives.js
// 응답 스키마 기준).

export function alternativeIcon(type) {
  if (type === 'night_bus') return '🌙';
  if (type === 'taxi') return '🚕';
  if (type === 'wait_first_train') return '⏳';
  return '🚏';
}

export function waitingSpotIcon(type) {
  if (type === 'cafe_24h') return '☕';
  if (type === 'jjimjilbang') return '♨️';
  return '🏪';
}

const kstTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

// 대안 카드에 표시할 한 줄 설명. 타입마다 백엔드가 내려주는 필드가 달라
// (심야버스는 배차간격, 첫차대기는 첫차시각) 여기서 문구로 통일한다.
export function alternativeDescription(alt) {
  if (alt.type === 'night_bus') {
    const interval = alt.intervalMin ? ` · 배차 ${alt.intervalMin}분` : '';
    return `정류장까지 도보 ${alt.walkMin}분${interval}`;
  }
  if (alt.type === 'taxi') {
    return `가장 가까운 승차 지점 도보 ${alt.walkMin}분`;
  }
  if (alt.type === 'wait_first_train') {
    if (alt.firstTrainTime) {
      return `첫차 ${kstTimeFormatter.format(new Date(alt.firstTrainTime))} 출발`;
    }
    return '첫차 시각 정보 준비 중';
  }
  return alt.walkMin ? `도보 ${alt.walkMin}분` : '';
}
