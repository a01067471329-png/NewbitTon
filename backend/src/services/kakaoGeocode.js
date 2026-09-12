/**
 * 카카오 로컬 API 프록시 (PRD 5장 GET /api/geocode)
 * 키워드 검색(search/keyword.json)을 사용해 역명/장소명/주소를 한 번에 검색합니다.
 * KAKAO_REST_API_KEY가 없으면 mock 데이터를 반환해 프론트 개발이 막히지 않게 합니다.
 */

const KAKAO_KEYWORD_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';

function getMockCandidates(query) {
  return {
    mocked: true,
    candidates: [
      { name: `${query} (예시) 1번 출구`, address: '서울 어딘가 1', x: 127.0276, y: 37.4979 },
      { name: `${query} 근처 정류장`, address: '서울 어딘가 2', x: 127.0286, y: 37.4989 },
    ],
  };
}

async function searchPlace(query) {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) {
    return getMockCandidates(query);
  }

  const url = `${KAKAO_KEYWORD_URL}?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${apiKey}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Kakao Local API 오류 (${res.status}): ${text}`);
  }

  const data = await res.json();
  const candidates = (data.documents || []).map((doc) => ({
    name: doc.place_name,
    address: doc.road_address_name || doc.address_name,
    x: Number(doc.x), // 경도
    y: Number(doc.y), // 위도
  }));

  return { mocked: false, candidates };
}

module.exports = { searchPlace };
