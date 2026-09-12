// 모든 화면(F1~F6)을 감싸는 공통 모바일 프레임.
// 목업(docs/Newbiton_mockup.pdf)의 폰 화면 폭에 맞춰 중앙 정렬된 카드 형태로 렌더링한다.
export default function AppShell({ children }) {
  return (
    <div className="app-shell">
      <div className="app-shell__body">{children}</div>
    </div>
  );
}
