const express = require('express');
const { searchPaths } = require('../services/odsay');
const { buildCandidate } = require('../services/lastTrain');
const { getWalkSpeedFactor } = require('../utils/walkSpeed');

const router = express.Router();

// GET /api/routes?startX=&startY=&endX=&endY=&walkSpeed=느림|보통|빠름|맞춤형&personalFactor=
router.get('/', async (req, res) => {
  const { startX, startY, endX, endY, walkSpeed, personalFactor } = req.query;

  if (!startX || !startY || !endX || !endY) {
    return res
      .status(400)
      .json({ error: 'startX, startY, endX, endY 파라미터가 모두 필요합니다.' });
  }

  const walkSpeedFactor = getWalkSpeedFactor(walkSpeed, personalFactor);
  const now = new Date();

  try {
    const { mocked, rawPaths } = await searchPaths({ startX, startY, endX, endY });

    const candidates = (
      await Promise.all(
        rawPaths.map((rawPath, i) =>
          buildCandidate(rawPath, { walkSpeedFactor, now, routeId: `r${i + 1}` })
        )
      )
    )
      // 막차 여유시간이 넉넉한 순으로 정렬 (F2 처리 로직)
      .sort((a, b) => b.minutesUntilDeadline - a.minutesUntilDeadline);

    res.json({ mocked, candidates });
  } catch (err) {
    console.error('[GET /api/routes]', err);
    res.status(502).json({ error: '경로 탐색 중 오류가 발생했습니다.', detail: err.message });
  }
});

module.exports = router;
