import BackButton from './BackButton';
import './ScreenHeader.css';

// 온보딩(F1)을 제외한 모든 화면 맨 위에 공통으로 올라가는 헤더 — 앱 이름
// "막차랑이"를 항상 보여준다 (온보딩은 히어로 안에 자체 브랜드 표기가 있어
// 이 헤더를 쓰지 않는다). 뒤로가기가 있는 화면은 `backTo`를 넘기면 화살표만
// 보여주고(이동할 화면 이름은 사용자에게 노출하지 않는다 — BackButton 참고),
// 뒤로갈 곳이 없는 화면(F3 메인 등)은 backTo 없이 앱 이름만 단독으로 보인다.
export default function ScreenHeader({ backTo, backLabel }) {
  return (
    <div className="screen-header">
      {backTo ? <BackButton to={backTo} label={backLabel} /> : <span aria-hidden="true" />}
      <span className="screen-header__brand">🐯 막차랑이</span>
    </div>
  );
}
