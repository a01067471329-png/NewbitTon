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
 * 방향(INOUT_TAG 1/2) 확정 방법:
 * 카카오 stops[]가 이동 순서대로 오므로 "다음 역"을 알 수 있다. 같은 열차번호
 * (TRAIN_NO)가 우리 역을 출발한 시각과 다음 역에 도착한 시각을 비교해서, 다음 역
 * 도착이 더 늦은 방향이 실제 진행 방향이다. 역코드 번호 규칙에 기대는 추측이 아니라
 * 실제 운행 시각 비교라서 순환선·분기선·연장구간에서도 성립한다(실측: 2호선 강남
 * 기준 두 방향 모두 239/239, 240/240으로 100% 일관되게 갈림).
 * 다음 역 정보가 없거나 열차번호가 안 겹치면 안전하게 두 방향 중 더 이른 막차시각을
 * 채택하는 근사로 폴백한다.
 */
const { createCache } = require('../lib/cache');

const BASE_URL = 'http://openapi.seoul.go.kr:8088';
const PERMANENT_TTL = 365 * 24 * 60 * 60 * 1000; // 역-노선 매핑은 사실상 안 바뀜
const DAILY_TTL = 24 * 60 * 60 * 1000; // 시간표는 요일이 바뀌면 갱신되도록 하루 캐시

const stationCache = createCache(PERMANENT_TTL);
const scheduleCache = createCache(DAILY_TTL);

const KST_OFFSET_MIN = 9 * 60;
const SUBWAY_LAST_DEPARTURE_RANGE = { minHour: 21, maxHour: 26 };
// 인접 역 사이 소요시간으로 말이 되는 범위(분). 이 범위를 벗어나면 같은 열차번호가
// 우연히 겹친 다른 운행으로 보고 방향 판별에서 제외한다.
const ADJACENT_STATION_MAX_MIN = 60;

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

// "HH:MM:SS" -> 분. 자정 넘김은 24시 초과 표기(24:46:00)로 들어와서 그대로 계산된다.
function toMinutes(hhmmss) {
  const parts = String(hhmmss || '').split(':').map(Number);
  if (parts.length < 2 || parts.some(Number.isNaN)) return null;
  return parts[0] * 60 + parts[1] + (parts[2] || 0) / 60;
}

// 역명 + 노선명으로 FR_CODE(외부코드)를 찾는다. 카카오가 준 노선명과 일치하는
// 항목을 우선 채택해 동명역(다른 호선의 같은 역명) 오매칭을 막는다.
async function findStation(stationName, lineName) {
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
      if (!match) return null;
      return { frCode: match.FR_CODE, stationCd: Number(match.STATION_CD) };
    } catch (err) {
      console.error('[seoulMetro] 역명 검색 실패:', stationName, lineName, err.message);
      return null;
    }
  });
}

async function fetchTimetable(frCode, weekTag, inoutTag) {
  const key = process.env.SEOUL_OPENDATA_API_KEY;
  if (!key || !frCode) return null;
  return scheduleCache.wrap(`${frCode}|${weekTag}|${inoutTag}`, async () => {
    try {
      const url = `${BASE_URL}/${key}/json/SearchSTNTimeTableByFRCodeService/1/1000/${frCode}/${weekTag}/${inoutTag}`;
      const res = await fetch(url);
      const data = await res.json();
      const rows = data?.SearchSTNTimeTableByFRCodeService?.row;
      return Array.isArray(rows) && rows.length ? rows : null;
    } catch (err) {
      console.error('[seoulMetro] 시간표 조회 실패:', frCode, weekTag, inoutTag, err.message);
      return null;
    }
  });
}

function lastDepartureOf(rows) {
  if (!rows?.length) return null;
  const last = rows.reduce((a, b) => (a.LEFTTIME > b.LEFTTIME ? a : b));
  const [hour, minute] = String(last.LEFTTIME || '').split(':').map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return { hour, minute };
}

/**
 * 같은 열차번호가 우리 역을 떠난 뒤 다음 역에 도착하면 forward, 그 반대면 backward.
 * 이 방향이 실제 진행 방향과 맞는 비율을 돌려준다.
 */
function forwardRatio(ourRows, nextRows) {
  if (!ourRows?.length || !nextRows?.length) return null;
  const ourByTrain = new Map();
  for (const row of ourRows) {
    const t = toMinutes(row.LEFTTIME);
    if (t !== null) ourByTrain.set(row.TRAIN_NO, t);
  }
  let forward = 0;
  let backward = 0;
  for (const row of nextRows) {
    const ourTime = ourByTrain.get(row.TRAIN_NO);
    if (ourTime === undefined) continue;
    const nextTime = toMinutes(row.ARRIVETIME);
    if (nextTime === null) continue;
    const diff = nextTime - ourTime;
    if (Math.abs(diff) > ADJACENT_STATION_MAX_MIN) continue;
    if (diff > 0) forward += 1;
    else backward += 1;
  }
  const total = forward + backward;
  if (!total) return null;
  return forward / total;
}

/**
 * 막차시각 조회. nextFrCode(다음 역)가 있으면 실제 진행 방향을 확정해서 그 방향의
 * 막차만 채택하고, 판별이 안 되면 안전하게 두 방향 중 더 이른 시각으로 폴백한다.
 * 실패하거나 상식 범위를 벗어나면 null을 반환해 호출부가 mock으로 대체한다.
 */
async function lookupLastDeparture(frCode, now, nextFrCode) {
  if (!frCode) return null;
  const weekTag = weekTagFor(now);

  const [ourUp, ourDown] = await Promise.all([
    fetchTimetable(frCode, weekTag, 1),
    fetchTimetable(frCode, weekTag, 2),
  ]);

  let chosen = null;

  if (nextFrCode) {
    const [nextUp, nextDown] = await Promise.all([
      fetchTimetable(nextFrCode, weekTag, 1),
      fetchTimetable(nextFrCode, weekTag, 2),
    ]);
    const upRatio = forwardRatio(ourUp, nextUp);
    const downRatio = forwardRatio(ourDown, nextDown);
    // 한쪽만 명확히 정방향(과반)일 때만 방향을 확정한다.
    const upForward = upRatio !== null && upRatio > 0.5;
    const downForward = downRatio !== null && downRatio > 0.5;
    if (upForward && !downForward) chosen = lastDepartureOf(ourUp);
    else if (downForward && !upForward) chosen = lastDepartureOf(ourDown);
  }

  if (!chosen) {
    const candidates = [lastDepartureOf(ourUp), lastDepartureOf(ourDown)]
      .filter(Boolean)
      .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
    chosen = candidates[0];
  }

  if (!isPlausible(chosen)) return null;
  return chosen;
}

module.exports = { findStation, lookupLastDeparture };
