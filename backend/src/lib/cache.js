/**
 * 외부 API 호출 한도를 아끼기 위한 초경량 인메모리 TTL 캐시.
 * (ODsay 30건/일 등 무료 한도가 매우 타이트한 API들을 보호하기 위함)
 */

function createCache(ttlMs) {
  const store = new Map();
  const inflight = new Map();

  function get(key) {
    const hit = store.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.expiresAt) {
      store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  function set(key, value) {
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async function wrap(key, fn) {
    const cached = get(key);
    if (cached !== undefined) return cached;

    // 같은 키로 거의 동시에 여러 요청이 들어오면(더블클릭, React 렌더링 중복 호출 등)
    // 캐시가 채워지기 전이라 전부 통과해 외부 API를 중복 호출하게 된다. 진행 중인
    // 요청의 Promise를 공유해서, 먼저 시작된 호출 하나만 실제로 나가게 한다.
    if (inflight.has(key)) {
      return inflight.get(key);
    }

    const promise = (async () => {
      try {
        const value = await fn();
        set(key, value);
        return value;
      } finally {
        inflight.delete(key);
      }
    })();

    inflight.set(key, promise);
    return promise;
  }

  return { get, set, wrap };
}

module.exports = { createCache };
