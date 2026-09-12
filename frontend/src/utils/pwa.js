// 홈 화면 추가(PWA standalone 실행) 여부 감지 — 순수 브라우저 API만 사용하며
// 백엔드 관여가 전혀 없다. iOS Safari는 표준 API가 없어 비표준 프로퍼티인
// navigator.standalone을 쓰고, 그 외 브라우저(Android Chrome 등)는
// display-mode: standalone 미디어 쿼리로 판단한다.
//
// 한계: "지금 이 순간 홈 화면 아이콘으로 실행 중인지"만 알 수 있고, "과거에
// 추가한 적 있는지"는 알 수 없다(iOS는 추가 시점을 감지하는 이벤트 자체가 없음).
// 다만 F5 Web Push가 실제로 동작하는 조건도 정확히 "지금 standalone 상태"이므로,
// 이 값으로 온보딩 배너를 자동으로 숨기는 것이 실제 필요와 정확히 일치한다.
export function isStandaloneDisplay() {
  if (typeof window === 'undefined') return false;
  const iosStandalone = window.navigator?.standalone === true;
  const mediaStandalone =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  return iosStandalone || mediaStandalone;
}
