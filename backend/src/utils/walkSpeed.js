/**
 * PRD F1 참고(v2): 도보속도 느림/보통/빠름 선택값을 소요시간 보정계수로 매핑.
 * "맞춤형"은 고정계수 대신 프론트가 계산해 보내는 personalFactor를 사용하고,
 * 값이 없거나 유효하지 않으면 "보통"(1.0배)으로 대체한다.
 */
const WALK_SPEED_FACTORS = {
  느림: 1.2,
  보통: 1.0,
  빠름: 0.8,
};

function getWalkSpeedFactor(level, personalFactor) {
  if (level === '맞춤형') {
    const parsed = Number(personalFactor);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return WALK_SPEED_FACTORS['보통'];
  }
  return WALK_SPEED_FACTORS[level] ?? WALK_SPEED_FACTORS['보통'];
}

module.exports = { WALK_SPEED_FACTORS, getWalkSpeedFactor };
