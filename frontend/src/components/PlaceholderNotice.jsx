// 단계별 개발 진행에 맞춰 아직 구현되지 않은 화면을 표시하는 임시 컴포넌트.
// 라우팅 구조만 먼저 잡아두고, 각 단계 진행 지시가 오면 실제 화면으로 교체한다.
// 뒤로가기는 이 컴포넌트를 쓰는 페이지가 <BackButton>으로 직접 넣는다(페이지마다
// 목적지가 다르므로 — 예: F6은 F3+F4로, F3+F4는 F2로).
export default function PlaceholderNotice({ stepLabel, title, description }) {
  return (
    <div className="placeholder-notice">
      <span className="placeholder-notice__step">{stepLabel}</span>
      <h1 className="placeholder-notice__title">{title}</h1>
      <p className="placeholder-notice__description">{description}</p>
    </div>
  );
}
