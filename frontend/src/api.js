// Newbiton 프론트엔드 API 클라이언트
// 계약 출처: docs/PRD_Newbiton.md 5장 API 명세, backend/README.md 응답 형식과 동일

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

function buildUrl(path, params) {
  const url = new URL(path, API_BASE_URL);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value);
      }
    });
  }
  return url;
}

async function request(path, { method = 'GET', params, body } = {}) {
  const url = buildUrl(path, params);
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `요청 실패 (HTTP ${res.status})`);
  }
  return res.json();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// GET /api/geocode?query=
// ---------------------------------------------------------------------------
async function mockGeocode(query) {
  await delay(200);
  return {
    mocked: true,
    candidates: [
      { name: `${query} (예시) 1번 출구`, address: '서울 어딘가 1', x: 127.0276, y: 37.4979 },
      { name: `${query} 근처 정류장`, address: '서울 어딘가 2', x: 127.0286, y: 37.4989 },
    ],
  };
}

export async function geocode(query) {
  if (USE_MOCK) return mockGeocode(query);
  return request('/api/geocode', { params: { query } });
}

// ---------------------------------------------------------------------------
// GET /api/routes?startX=&startY=&endX=&endY=&walkSpeed=느림|보통|빠름|맞춤형&personalFactor=
// ---------------------------------------------------------------------------
async function mockFetchRoutes() {
  await delay(300);
  return {
    mocked: true,
    candidates: [
      {
        routeId: 'r1',
        legs: [
          { mode: 'subway', line: '2호선', from: '강남', to: '잠실', durationMin: 12 },
          { mode: 'transfer', durationMin: 4, walkAdjustedMin: 4.8 },
          { mode: 'bus', line: '지선버스 461', from: '잠실역', to: '목적지 인근', durationMin: 15 },
        ],
        totalDurationMin: 34,
        transferGaps: [{ afterLeg: 0, minutesLeft: 6, safety: 'safe' }],
        departureDeadline: '2026-09-12T18:47:00+09:00',
        minutesUntilDeadline: 23,
      },
      {
        routeId: 'r2',
        legs: [
          { mode: 'subway', line: '2호선', from: '강남', to: '을지로3가', durationMin: 18 },
          { mode: 'transfer', durationMin: 3, walkAdjustedMin: 3.4 },
          { mode: 'bus', line: '간선버스 143', from: '을지로3가', to: '목적지 인근', durationMin: 20 },
        ],
        totalDurationMin: 41,
        transferGaps: [{ afterLeg: 0, minutesLeft: 3, safety: 'caution' }],
        departureDeadline: '2026-09-12T18:36:00+09:00',
        minutesUntilDeadline: 12,
      },
      {
        routeId: 'r3',
        legs: [
          { mode: 'bus', line: '지선버스 461', from: '출발지 인근', to: '사당', durationMin: 25 },
          { mode: 'transfer', durationMin: 5, walkAdjustedMin: 6 },
          { mode: 'bus', line: '광역버스 9401', from: '사당', to: '목적지 인근', durationMin: 22 },
        ],
        totalDurationMin: 52,
        transferGaps: [{ afterLeg: 0, minutesLeft: 1, safety: 'danger' }],
        departureDeadline: '2026-09-12T18:28:00+09:00',
        minutesUntilDeadline: 4,
      },
    ],
  };
}

export async function fetchRoutes({ startX, startY, endX, endY, walkSpeed, personalFactor }) {
  if (USE_MOCK) return mockFetchRoutes();
  // personalFactor는 "맞춤형" 실측 로직이 붙기 전까지는 항상 undefined로 전달되며,
  // buildUrl()이 undefined 값은 쿼리에서 자동으로 제외한다. 백엔드는 값이 없으면
  // "보통"(1.0배)을 기본 적용한다 (PRD 5장 v2 변경 참고).
  return request('/api/routes', {
    params: { startX, startY, endX, endY, walkSpeed, personalFactor },
  });
}

// ---------------------------------------------------------------------------
// GET /api/push/vapid-public-key , POST /api/push/subscribe , DELETE /api/push/subscribe/:id
// ---------------------------------------------------------------------------
async function mockFetchVapidPublicKey() {
  await delay(100);
  // mock 모드에서는 실제 Push 발송이 불가능하므로 null을 반환한다.
  // 프론트는 이 값이 없으면 "지금은 알림을 받을 수 없어요" 상태로 처리한다.
  return { publicKey: null };
}

export async function fetchVapidPublicKey() {
  if (USE_MOCK) return mockFetchVapidPublicKey();
  return request('/api/push/vapid-public-key');
}

async function mockSubscribePush() {
  await delay(200);
  return { id: 'mock-sub-1', ok: true };
}

export async function subscribePush({ subscription, selectedRoute }) {
  if (USE_MOCK) return mockSubscribePush();
  return request('/api/push/subscribe', {
    method: 'POST',
    body: { subscription, selectedRoute },
  });
}

export async function unsubscribePush(id) {
  if (USE_MOCK) return { ok: true };
  return request(`/api/push/subscribe/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// GET /api/alternatives?lat=&lng=&segmentId=
// ---------------------------------------------------------------------------
async function mockFetchAlternatives(segmentId) {
  await delay(200);
  return {
    mocked: true,
    segmentId: segmentId || null,
    transitAlternatives: [
      { type: 'night_bus', name: '심야버스 N26', walkMin: 4, intervalMin: 20 },
      { type: 'taxi', name: '택시 승차 지점', walkMin: 2 },
      { type: 'wait_first_train', name: '첫차까지 대기', firstTrainTime: null },
    ],
    waitingSpots: [{ name: '24시간 편의점', walkMin: 1 }],
    costComparison: null,
  };
}

export async function fetchAlternatives({ lat, lng, segmentId }) {
  if (USE_MOCK) return mockFetchAlternatives(segmentId);
  return request('/api/alternatives', { params: { lat, lng, segmentId } });
}

// ---------------------------------------------------------------------------
export const isMockMode = USE_MOCK;
export const apiBaseUrl = API_BASE_URL;
