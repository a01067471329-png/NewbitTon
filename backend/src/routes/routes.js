const express = require('express');
const odsayProvider = require('../services/providers/odsay');
const kakaoProvider = require('../services/providers/kakao');
const { buildCandidate } = require('../services/lastTrain');
const { getWalkSpeedFactor } = require('../utils/walkSpeed');

const router = express.Router();

// 경로탐색 제공자를 환경변수로 전환할 수 있게 추상화(2026-09-12, PRD 1.6/4장 참고).
// ODsay는 후보마다 구간별 막차 조회가 따라붙어 검색 1회에 일일 한도(30건)의 상당량이
// 소모되는 문제가 있어, 카카오맵 대중교통 경로 조회 API로 전환 시도 중. 문제가 생기면
// ROUTING_PROVIDER 환경변수만 되돌리면 즉시 롤백된다(코드 삭제 없음, git 태그
// odsay-stable에도 개편 이전 상태가 남아있음).
const routingProvider = process.env.ROUTING_PROVIDER === 'kakao' ? kakaoProvider : odsayProvider;

// 두 제공자 모두 후보를 여러 개(카카오는 최대 15개, ODsay는 20여 개) 돌려주는데,
// 후보 하나마다 구간별 막차 조회가 따라붙으므로 상위 몇 개만 처리해서 호출량을 묶어둔다.
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
    const { mocked, rawPaths } = await routingProvider.searchPaths(
      { startX, startY, endX, endY },
      { maxCandidates: MAX_CANDIDATES }
    );

    const allCandidates = await Promise.all(
      rawPaths.slice(0, MAX_CANDIDATES).map((rawPath, i) =>
        buildCandidate(rawPath, { walkSpeedFactor, now, routeId: `r${i + 1}` })
      )
    );

    // 이미 막차가 끊겨 탑승 마감이 지난(minutesUntilDeadline <= 0) 후보는 "이론상 경로"일
    // 뿐 실제로 탈 수 없으므로 목록에서 제외한다 (1.3 핵심가치: "실제로 탈 수 있는 막차").
    const candidates = allCandidates
      .filter((c) => c.minutesUntilDeadline > 0)
      // 막차 여유시간이 넉넉한 순으로 정렬 (F2 처리 로직)
      .sort((a, b) => b.minutesUntilDeadline - a.minutesUntilDeadline);

    // candidates가 비어도 두 가지 다른 상황일 수 있어 프론트가 구분할 수 있게 신호를 준다:
    // ODsay가 애초에 경로를 못 찾은 경우(allCandidates도 비어있음) vs 경로는 찾았지만
    // 전부 막차가 이미 끊긴 경우(allExpired). 안내 문구가 서로 달라야 하기 때문.
    const allExpired = allCandidates.length > 0 && candidates.length === 0;

    res.json({ mocked, candidates, allExpired });
  } catch (err) {
    console.error('[GET /api/routes]', err);
    res.status(502).json({ error: '경로 탐색 중 오류가 발생했습니다.', detail: err.message });
  }
});

module.exports = router;
