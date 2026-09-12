// PRD 6.1 데이터 모델 — 프론트엔드 localStorage 스키마
// { walkSpeedLevel, walkSpeedMeasuredSecPer100m }
//
// v2.2 변경: "홈 화면에 추가" 배너의 닫기 상태는 더 이상 이 영구 프로필에 두지
// 않는다. standalone(홈 화면 아이콘 실행) 감지로 자동 숨기는 게 우선이고, 그게
// 아닐 때 사용자가 닫아도 "이번 세션에서만" 잠깐 숨기는 용도라 아래
// isHomeBannerDismissedThisSession()/dismissHomeBannerThisSession()가 별도의
// sessionStorage 키로 관리한다 (utils/pwa.js의 isStandaloneDisplay() 참고).

const STORAGE_KEY = 'newbiton.profile';

const DEFAULT_PROFILE = {
  walkSpeedLevel: '보통',
  walkSpeedMeasuredSecPer100m: null,
};

export function getProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function saveProfile(partial) {
  const next = { ...getProfile(), ...partial };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage 사용 불가 환경 — 조용히 무시 (세션 내 상태만 유지)
  }
  return next;
}

// 현재 진행 중인 트립(선택된 출발/도착/도보속도/확정된 경로)을 화면 간 전달과
// 새로고침·앱 재실행 복구용으로 저장한다. PRD 6.2의 백엔드 트립 상태와는 별개로,
// 프론트가 F1→F2→F3 화면을 이동할 때 쓰는 캐시.
//
// localStorage를 쓴다 — trip.selectedRoute가 채워진 뒤부터는 "/"가 온보딩이 아니라
// 메인 화면으로 열리는 게 기본 동작이라(App.jsx의 HomeRoute 참고), 브라우저/PWA를
// 완전히 껐다 다시 열어도 유지돼야 한다(sessionStorage는 탭을 닫으면 사라져서 부적합).
const TRIP_KEY = 'newbiton.currentTrip';

export function getCurrentTrip() {
  try {
    const raw = localStorage.getItem(TRIP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveCurrentTrip(trip) {
  try {
    localStorage.setItem(TRIP_KEY, JSON.stringify(trip));
  } catch {
    // localStorage 사용 불가 환경 — 조용히 무시
  }
}

// "경로 수정" 등으로 온보딩부터 다시 시작할 때 호출 — 확정된 경로가 남아있으면
// "/"가 계속 메인 화면으로 리다이렉트되므로, 온보딩으로 돌아가려면 반드시 비워야 한다.
export function clearCurrentTrip() {
  try {
    localStorage.removeItem(TRIP_KEY);
  } catch {
    // localStorage 사용 불가 환경 — 조용히 무시
  }
}

// "홈 화면에 추가" 배너의 임시 닫기 상태 (자동감지 + 임시닫기).
// sessionStorage라 이 탭이 열려있는 동안(새로고침 포함)만 유지되고, 탭을 닫았다가
// 다시 사이트에 들어오면(새 세션) 초기화되어 배너가 다시 뜬다 — 아직 홈 화면에
// 추가하지 않았을 수 있으니 매번 다시 안내하는 게 안전하기 때문. 실제로 홈 화면
// 아이콘으로 실행 중이면 이 값과 무관하게 배너 자체가 뜨지 않는다
// (utils/pwa.js의 isStandaloneDisplay() 참고).
const HOME_BANNER_DISMISSED_KEY = 'newbiton.homeBannerDismissed';

export function isHomeBannerDismissedThisSession() {
  try {
    return sessionStorage.getItem(HOME_BANNER_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function dismissHomeBannerThisSession() {
  try {
    sessionStorage.setItem(HOME_BANNER_DISMISSED_KEY, 'true');
  } catch {
    // 세션 스토리지 사용 불가 환경 — 조용히 무시
  }
}
