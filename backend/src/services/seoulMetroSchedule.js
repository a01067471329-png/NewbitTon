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
 * 방향(INOUT_TAG 1/2 = 상행/하행 또는 내선/외선) 확정: 카카오 경로에는 ODsay의
 * wayCode 같은 명시적 방향 필드가 없지만, 카카오가 주는 stops[]는 이동 순서대로
 * 나열되므로 "다음 역"을 알 수 있다. 실제 응답을 보면 STATION_CD(전철역코드)가
 * 노선을 따라 대략 순차적으로 매겨져 있고(예: 2호선 강남=0222, 그 열차의
 * ORIGINSTATION이 0222보다 작으면 그 방향은 "코드가 커지는 쪽"으로 이동 중), 각
 * 방향 열차의 ORIGINSTATION이 우리 역보다 큰지 작은지를 보면 그 방향이 코드
 * 증가/감소 중 어느 쪽으로 가는지 알 수 있다. 다음 역의 코드가 우리 역보다
 * 큰/작은 쪽과 같은 방향을 채택한다. 분기 구간 등으로 판단이 애매하면(두 방향이
 * 같은 부호로 나오는 등) 안전하게 예전 방식(더 이른 시각 채택)으로 폴백한다.
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

// 역명 + 노선명으로 FR_CODE(외부코드)와 STATION_CD(전철역코드, 방향 판별용)를 찾는다.
// 카카오가 준 노선명과 일치하는 항목을 우선 채택해 동명역(다른 호선의 같은 역명)
// 오매칭을 막는다.
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

async function findFrCode(stationName, lineName) {
  const station = await findStation(stationName, lineName);
  return station?.frCode ?? null;
}

// 그 방향 열차들의 막차시각뿐 아니라, 이 방향이 역코드가 커지는 쪽인지 작아지는
// 쪽인지 판별하기 위한 대표 부호(directionSign)도 함께 계산한다. directionSign이
// +1이면 이 방향 열차는 "더 작은 코드에서 출발해 우리 역을 지나 더 큰 코드 쪽으로"
// 이동 중이라는 뜻(즉 우리 역 기준 다음 역 코드가 더 크면 이 방향이 맞는 방향).
async function fetchDirectionLast(frCode, weekTag, inoutTag, ownStationCd) {
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

      // 다수결로 이 방향의 진행 부호를 정한다. ORIGINSTATION(그 열차가 오늘 어디서
      // 투입됐는지)은 중간 투입 운행이 많아 신뢰할 수 없어서(실측으로 확인) 대신
      // DESTSTATION(최종 종착역)을 쓴다 — 직선 노선에서는 방향별로 종착역 코드가
      // 거의 100% 한쪽으로 쏠려서 훨씬 안정적이다(실측 검증: 3호선 신사 기준 두
      // 방향 다 100%/0%로 완전히 갈림). 다만 2호선처럼 순환선은 어느 방향이든
      // 종착역이 인근 차고지(성수 등)로 몰려서 이 방법으로도 구분이 안 되는데,
      // 그 경우 두 방향의 부호가 같게 나와 호출부의 안전한 폴백(더 이른 시각 채택)을
      // 자연스럽게 타게 된다. 다른 노선(경의중앙선 등)과 번호 체계가 다른 연장구간
      // 종착역(예: 3호선-일산선 "대화")은 코드 차이가 비정상적으로 커서 제외한다.
      let plus = 0;
      let minus = 0;
      for (const row of rows) {
        const dest = Number(row.DESTSTATION);
        if (!Number.isFinite(dest) || Math.abs(dest - ownStationCd) > 60) continue;
        if (dest > ownStationCd) plus += 1;
        else if (dest < ownStationCd) minus += 1;
      }
      const directionSign = plus === minus ? 0 : plus > minus ? 1 : -1;

      return { dep: { hour, minute }, directionSign };
    } catch (err) {
      console.error('[seoulMetro] 시간표 조회 실패:', frCode, weekTag, inoutTag, err.message);
      return null;
    }
  });
}

/**
 * frCode가 이미 확정된 상태에서 막차시각을 조회한다(노선 적합성 판단은 findFrCode에서
 * 이미 끝남). ownStationCd/nextStationCd가 둘 다 있으면 실제 진행 방향을 확정해서
 * 그 방향의 막차만 채택하고, 판별이 애매하거나 정보가 없으면 안전하게 예전 방식
 * (더 이른 시각 채택)으로 폴백한다. 실패하거나 상식 범위를 벗어나면 null을 반환해
 * 호출부가 mock으로 대체한다.
 */
async function lookupLastDeparture(frCode, now, ownStationCd, nextStationCd) {
  if (!frCode) return null;
  const weekTag = weekTagFor(now);
  const [up, down] = await Promise.all([
    fetchDirectionLast(frCode, weekTag, 1, ownStationCd),
    fetchDirectionLast(frCode, weekTag, 2, ownStationCd),
  ]);

  let chosen = null;
  const wantSign = Number.isFinite(ownStationCd) && Number.isFinite(nextStationCd)
    ? Math.sign(nextStationCd - ownStationCd)
    : 0;

  if (wantSign !== 0 && up?.directionSign && down?.directionSign && up.directionSign !== down.directionSign) {
    const matched = [up, down].find((d) => d.directionSign === wantSign);
    if (matched) chosen = matched.dep;
  }

  if (!chosen) {
    // 방향 판별 실패(분기 구간, 다음 역 정보 없음 등) - 안전하게 더 이른 시각 채택
    const candidates = [up, down].filter(Boolean).map((d) => d.dep).sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
    chosen = candidates[0];
  }

  if (!isPlausible(chosen)) return null;
  return chosen;
}

module.exports = { findFrCode, findStation, lookupLastDeparture };
