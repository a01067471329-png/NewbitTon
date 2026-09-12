/**
 * PRD F1 참고: 도보속도 상/중/하 선택값을 소요시간 보정계수로 매핑.
 * 계수는 잠정치이며 실제 사용성 테스트를 거쳐 조정하세요 (PRD 2장 F1 처리 로직 참고).
 */
const WALK_SPEED_FACTORS = {
  상: 0.85,
  중: 1.0,
  하: 1.2,
};

function getWalkSpeedFactor(level) {
  return WALK_SPEED_FACTORS[level] ?? WALK_SPEED_FACTORS['중'];
}

module.exports = { WALK_SPEED_FACTORS, getWalkSpeedFactor };
