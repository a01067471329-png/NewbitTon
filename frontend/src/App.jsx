import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Onboarding from './pages/Onboarding';
import RouteSelect from './pages/RouteSelect';
import Main from './pages/Main';
import Alternatives from './pages/Alternatives';
import { getCurrentTrip } from './utils/storage';

// "/"는 항상 온보딩이 아니다 — 이미 경로가 확정(selectedRoute 존재)되어 있으면
// 메인 화면이 앱의 기본 홈 화면이 된다. F2에서 "이 경로로 막차 알람 시작"을 누른
// 뒤부터는 앱을 다시 열어도 메인 화면이 뜨는 게 기대 동작이며, 경로를 바꾸고
// 싶으면 메인 화면의 "경로 수정" 버튼으로 트립을 비우고 온보딩부터 다시 시작한다.
function HomeRoute() {
  const trip = getCurrentTrip();
  if (trip?.selectedRoute) {
    return <Navigate to="/main" replace />;
  }
  return <Onboarding />;
}

// 라우팅 구조 (PRD 3장 사용자 플로우 기준)
// /            F1 온보딩 (단, 확정된 경로가 있으면 /main으로 리다이렉트)
// /routes      F2 경로 후보 리스트
// /main        F3+F4 메인 화면 (역산 알람 시각, 환승 배지) — 경로 확정 후 기본 홈 화면
// /alternatives F6 대안 안내
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/routes" element={<RouteSelect />} />
        <Route path="/main" element={<Main />} />
        <Route path="/alternatives" element={<Alternatives />} />
      </Routes>
    </BrowserRouter>
  );
}
