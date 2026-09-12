import { useNavigate } from 'react-router-dom';
import './BackButton.css';

// 화면 상단 뒤로가기 버튼. 브라우저 히스토리(navigate(-1))에 기대지 않고
// `to`로 명시된 화면으로 이동한다 — 새로고침이나 URL 직접 접근으로 들어온
// 경우에도 항상 동일하게 동작하게 하기 위함. 온보딩(F1)은 앱 진입점이라
// 뒤로 갈 곳이 없으므로 이 버튼을 쓰지 않는다.
// 화면에는 화살표만 보여준다 — 이동할 화면 이름(예: "온보딩")은 노출하지
// 않고, `label`은 스크린리더용 aria-label에만 쓴다.
export default function BackButton({ to, label = '이전' }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="back-button"
      onClick={() => navigate(to)}
      aria-label={`${label} 화면으로 뒤로가기`}
    >
      ‹
    </button>
  );
}
