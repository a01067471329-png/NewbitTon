const express = require('express');

const router = express.Router();

// GET /api/alternatives?lat=&lng=&time=&segmentId=
// TODO(F6 실데이터 연동 필요, PRD 10장 리스크 참고): 심야버스 노선·대기 장소 데이터 소스 미확정.
// 지금은 화면 개발이 막히지 않도록 고정된 mock을 반환합니다. (5단계에서 실데이터로 교체 예정)
router.get('/', (req, res) => {
  const { lat, lng, segmentId } = req.query;
  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat, lng 파라미터가 필요합니다.' });
  }

  res.json({
    segmentId: segmentId || null,
    transitAlternatives: [
      { type: 'night_bus', name: '심야버스 N26', walkMin: 4, intervalMin: 20 },
      { type: 'taxi', name: '택시 승차 지점', walkMin: 2 },
      { type: 'wait_first_train', name: '첫차까지 대기', firstTrainTime: null },
    ],
    waitingSpots: [{ name: '24시간 편의점', walkMin: 1 }],
    costComparison: null, // Future Work — 프론트는 null이면 "비용 비교 예정" 배지 표시
  });
});

module.exports = router;
