import { useSearchParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import BackButton from '../components/BackButton';
import PlaceholderNotice from '../components/PlaceholderNotice';

// F6 대안 안내 화면 — 단계 5에서 구현 예정.
// PRD상 "뒤로가기로 언제든 F3+F4 메인 화면으로 복귀 가능"이 명시되어 있어
// 뒤로가기 목적지를 /main으로 고정한다.
// F3+F4의 각 구간 카드 "놓치면?" 버튼이 ?segment=<id>로 어느 구간에서 진입했는지
// 전달한다 (예: 환승구간 "t1", 최종 목적지 "final") — 단계 5에서 이 값으로 해당
// 구간 기준 대안을 조회하게 된다.
export default function Alternatives() {
  const [searchParams] = useSearchParams();
  const segmentId = searchParams.get('segment');

  return (
    <AppShell>
      <BackButton to="/main" label="메인 화면" />
      <PlaceholderNotice
        stepLabel="단계 5 (F6)"
        title="대안 안내 화면"
        description={
          segmentId
            ? `막차 실패 시 대안 교통편과 대기 장소 안내가 여기에 구현됩니다. (진입 구간: ${segmentId})`
            : '막차 실패 시 대안 교통편과 대기 장소 안내가 여기에 구현됩니다.'
        }
      />
    </AppShell>
  );
}
