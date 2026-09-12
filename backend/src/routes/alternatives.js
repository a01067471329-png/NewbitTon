const express = require('express');
const { getAlternatives } = require('../services/alternatives');

const router = express.Router();

// GET /api/alternatives?lat=&lng=&time=&segmentId=
// 심야버스·대기 장소는 실데이터, 택시·첫차대기는 데이터 소스 한계로 고정/mock (README 참고).
router.get('/', async (req, res) => {
  const { lat, lng, segmentId } = req.query;
  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat, lng 파라미터가 필요합니다.' });
  }

  try {
    const result = await getAlternatives({ lat, lng, segmentId });
    res.json(result);
  } catch (err) {
    console.error('[GET /api/alternatives]', err);
    res.status(502).json({ error: '대안 조회 중 오류가 발생했습니다.', detail: err.message });
  }
});

module.exports = router;
