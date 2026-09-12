/**
 * ODsay 대중교통 길찾기 API 프록시.
 * https://lab.odsay.com/guide/guide (searchPubTransPathT) 참고.
 *
 * 주의: 아직 팀에 실제 ODsay 키가 없어 실제 응답 필드를 직접 검증하지 못했습니다.
 * ODSAY_API_KEY가 세팅되면 이 함수가 실제로 호출되니, 최초 연동 시 콘솔에
 * 실제 응답(JSON)을 한번 출력해서 필드명이 아래 파싱 로직과 맞는지 꼭 확인하세요.
 * 필요하면 이 파일의 parseOdsayResponse()만 수정하면 됩니다 (다른 코드는 영향 없음).
 */

const ODSAY_URL = 'https://api.odsay.com/v1/api/searchPubTransPathT';

function getMockRawPaths() {
  // 실제 ODsay 응답과 형태만 비슷하게 흉내낸 mock (없어도 서버가 동작하도록)
  return [
    {
      info: { totalTime: 34, busTransitCount: 1, subwayTransitCount: 1 },
      subPath: [
        { trafficType: 1, lane: [{ name: '2호선' }], startName: '강남', endName: '잠실', sectionTime: 12 },
        { trafficType: 3, sectionTime: 4 }, // 3 = 도보/환승
        { trafficType: 2, lane: [{ busNo: '지선버스 461' }], startName: '잠실역', endName: '목적지 인근', sectionTime: 15 },
      ],
    },
    {
      info: { totalTime: 41, busTransitCount: 1, subwayTransitCount: 1 },
      subPath: [
        { trafficType: 1, lane: [{ name: '2호선' }], startName: '강남', endName: '잠실', sectionTime: 20 },
        { trafficType: 3, sectionTime: 3 },
        { trafficType: 2, lane: [{ busNo: '간선버스 302' }], startName: '잠실역', endName: '목적지 인근', sectionTime: 18 },
      ],
    },
  ];
}

async function searchPaths({ startX, startY, endX, endY }) {
  const apiKey = process.env.ODSAY_API_KEY;
  if (!apiKey) {
    return { mocked: true, rawPaths: getMockRawPaths() };
  }

  const params = new URLSearchParams({
    apiKey,
    SX: startX,
    SY: startY,
    EX: endX,
    EY: endY,
    SearchPathType: '0', // 0: 지하철+버스 모두
  });

  const res = await fetch(`${ODSAY_URL}?${params.toString()}`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ODsay API 오류 (${res.status}): ${text}`);
  }

  const data = await res.json();
  const rawPaths = data?.result?.path || [];
  return { mocked: false, rawPaths };
}

module.exports = { searchPaths };
