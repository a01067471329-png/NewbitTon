const express = require('express');
const { searchPaths } = require('../services/odsay');
const { buildCandidate } = require('../services/lastTrain');
const { getWalkSpeedFactor } = require('../utils/walkSpeed');

const router = express.Router();

// ODsay는 경로 후보를 20개 이상 돌려주는데, 후보 하나마다 구간별 막차 조회(지하철 시간표)가
// 따라붙어서 검색 한 번에 일일 한도(30건)의 절반 가까이 소모된다. 상위 몇 개만 처리해서
// 호출량을 묶어둔다.
const MAX_CANDIDATES = 5;

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
        rawPaths.slice(0, MAX_CANDIDATES).map((rawPath, i) =>
          buildCandidate(rawPath, { walkSpeedFactor, now, routeId: `r${i + 1}` })
        )
      )
    )
      // 이미 막차가 끊겨 탑승 마감이 지난(minutesUntilDeadline <= 0) 후보는 "이론상 경로"일
      // 뿐 실제로 탈 수 없으므로 목록에서 제외한다 (1.3 핵심가치: "실제로 탈 수 있는 막차").
      .filter((c) => c.minutesUntilDeadline > 0)
      // 막차 여유시간이 넉넉한 순으로 정렬 (F2 처리 로직)
      .sort((a, b) => b.minutesUntilDeadline - a.minutesUntilDeadline);

    res.json({ mocked, candidates });
  } catch (err) {
    console.error('[GET /api/routes]', err);
    res.status(502).json({ error: '경로 탐색 중 오류가 발생했습니다.', detail: err.message });
  }
});

module.exports = router;
