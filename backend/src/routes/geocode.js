const express = require('express');
const { searchPlace } = require('../services/kakaoGeocode');

const router = express.Router();

// GET /api/geocode?query=역명|장소|주소
router.get('/', async (req, res) => {
  const { query } = req.query;
  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'query 파라미터가 필요합니다.' });
  }

  try {
    const result = await searchPlace(query.trim());
    res.json(result);
  } catch (err) {
    console.error('[GET /api/geocode]', err);
    res.status(502).json({ error: '지오코딩 조회 중 오류가 발생했습니다.', detail: err.message });
  }
});

module.exports = router;
