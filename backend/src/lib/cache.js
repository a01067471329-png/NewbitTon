/**
 * 외부 API 호출 한도를 아끼기 위한 초경량 인메모리 TTL 캐시.
 * (ODsay 1,000건/일 등 무료 한도가 타이트한 API들을 보호하기 위함)
 */

function createCache(ttlMs) {
  const store = new Map();

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
    const value = await fn();
    set(key, value);
    return value;
  }

  return { get, set, wrap };
}

module.exports = { createCache };
