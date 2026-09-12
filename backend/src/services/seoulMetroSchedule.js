/**
 * 서울 열린데이터광장(data.seoul.go.kr) 지하철 시간표 API.
 *
 * 실제 호출로 확인한 사실:
 * - SearchInfoBySubwayNameService(역명 검색)는 모든 노선(신분당선 포함)이 나온다.
 * - SearchSTNTimeTableByFRCodeService(시간표)는 서울교통공사 관할 노선(대략 1~9호선)만
 *   데이터가 있고, 신분당선 등 다른 운영사 노선은 "해당하는 데이터가 없습니다"로 응답한다.
 * → 노선명이 "N호선"(1~9) 패턴일 때만 이 소스를 쓰고, 그 외는 호출하는 쪽(kakao.js)에서
 *   ODsay로 폴백한다. 이 노선들은 ODsay를 전혀 안 써도 되므로 호출량을 크게 줄인다.
 *
 * 방향(INOUT_TAG 1/2 = 상행/하행 또는 내선/외선) 확정 신호가 카카오 경로 데이터에는
 * 없어서(ODsay의 wayCode 같은 필드가 없음), 두 방향 중 더 이른 막차시각을 채택하는
 * 예전 근사 방식을 쓴다. 완전히 틀린 값보다는 안전한 쪽으로 근사하는 것이며, 상식
 * 범위를 벗어나면 신뢰하지 않는 방어 로직도 그대로 적용한다.
 */
const { createCache } = require('../lib/cache');

const BASE_URL = 'http://openapi.seoul.go.kr:8088';
const PERMANENT_TTL = 365 * 24 * 60 * 60 * 1000; // 역-노선 매핑은 사실상 안 바뀜
const DAILY_TTL = 24 * 60 * 60 * 1000; // 시간표는 요일이 바뀌면 갱신되도록 하루 캐시

const stationCache = createCache(PERMANENT_TTL);
const scheduleCache = createCache(DAILY_TTL);

const KST_OFFSET_MIN = 9 * 60;
const SUBWAY_LAST_DEPARTURE_RANGE = { minHour: 21, maxHour: 26 };

function isPlausible(dep) {
  return !!dep && dep.hour >= SUBWAY_LAST_DEPARTURE_RANGE.minHour && dep.hour <= SUBWAY_LAST_DEPARTURE_RANGE.maxHour;
}

function weekTagFor(now) {
  const kst = new Date(now.getTime() + KST_OFFSET_MIN * 60000);
  const day = kst.getUTCDay();
  if (day === 0) return 3; // 일요일/공휴일
  if (day === 6) return 2; // 토요일
  return 1; // 평일
}

// 카카오는 "2호선", 서울 열린데이터광장 LINE_NUM은 "02호선"(0 패딩)으로 줘서 문자열
// 그대로는 절대 안 맞는다. 숫자만 뽑아 비교한다(신분당선처럼 숫자가 없는 노선은
// 자연스럽게 매칭 실패 처리됨).
function lineNumberOf(lineName) {
  const match = /^(\d+)호선$/.exec(lineName || '');
  return match ? Number(match[1]) : null;
}

// 역명 + 노선명으로 FR_CODE(외부코드)를 찾는다. 카카오가 준 노선명과 일치하는
// 항목을 우선 채택해 동명역(다른 호선의 같은 역명) 오매칭을 막는다.
async function findFrCode(stationName, lineName) {
  const key = process.env.SEOUL_OPENDATA_API_KEY;
  const lineNo = lineNumberOf(lineName);
  if (!key || !stationName || lineNo === null) return null;
  // 카카오는 "교대(법원.검찰청)"처럼 괄호 부기명을 붙이는데 서울시 DB에는 없어서
  // 검색어에서 제거한다.
  const cleanName = stationName.replace(/\(.*?\)/g, '').trim();
  return stationCache.wrap(`${cleanName}|${lineNo}`, async () => {
    try {
      const url = `${BASE_URL}/${key}/json/SearchInfoBySubwayNameService/1/20/${encodeURIComponent(cleanName)}`;
      const res = await fetch(url);
      const data = await res.json();
      const rows = data?.SearchInfoBySubwayNameService?.row || [];
      const match = rows.find((r) => lineNumberOf(r.LINE_NUM) === lineNo);
      return match?.FR_CODE ?? null;
    } catch (err) {
      console.error('[seoulMetro] 역명 검색 실패:', stationName, lineName, err.message);
      return null;
    }
  });
}

async function fetchDirectionLast(frCode, weekTag, inoutTag) {
  const key = process.env.SEOUL_OPENDATA_API_KEY;
  return scheduleCache.wrap(`${frCode}|${weekTag}|${inoutTag}`, async () => {
    try {
      const url = `${BASE_URL}/${key}/json/SearchSTNTimeTableByFRCodeService/1/1000/${frCode}/${weekTag}/${inoutTag}`;
      const res = await fetch(url);
      const data = await res.json();
      const rows = data?.SearchSTNTimeTableByFRCodeService?.row;
      if (!Array.isArray(rows) || !rows.length) return null;
      const last = rows.reduce((a, b) => (a.LEFTTIME > b.LEFTTIME ? a : b));
      const [hour, minute] = (last.LEFTTIME || '').split(':').map(Number);
      if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
      return { hour, minute };
    } catch (err) {
      console.error('[seoulMetro] 시간표 조회 실패:', frCode, weekTag, inoutTag, err.message);
      return null;
    }
  });
}

// frCode가 이미 확정된 상태에서 막차시각을 조회한다(노선 적합성 판단은 findFrCode에서
// 이미 끝남). 실패하거나 상식 범위를 벗어나면 null을 반환해 호출부가 mock으로 대체한다.
async function lookupLastDeparture(frCode, now) {
  if (!frCode) return null;
  const weekTag = weekTagFor(now);
  const [up, down] = await Promise.all([
    fetchDirectionLast(frCode, weekTag, 1),
    fetchDirectionLast(frCode, weekTag, 2),
  ]);
  const candidates = [up, down].filter(Boolean).sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
  const chosen = candidates[0];
  if (!isPlausible(chosen)) return null;
  return chosen;
}

module.exports = { findFrCode, lookupLastDeparture };
