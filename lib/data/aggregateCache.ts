// ── In-memory aggregate query cache ─────────────────────────────────────────
// Designed for serverless warm-start efficiency.
// Each serverless function instance gets its own cache.
// Cross-instance cache requires Vercel KV / Upstash Redis.
// ─────────────────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Creates a deterministic cache key from the aggregate RPC parameters.
 * Sorts all keys so {a:1, b:2} and {b:2, a:1} produce the same hash.
 */
export function buildCacheKey(params: Record<string, unknown>): string {
  const sorted = Object.keys(params)
    .sort()
    .map((key) => {
      const value = params[key];
      return `${key}=${JSON.stringify(value)}`;
    })
    .join("&");
  // Simple hash to keep keys short
  let hash = 0;
  for (let i = 0; i < sorted.length; i++) {
    const char = sorted.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  const datasetPart = typeof params.p_dataset_id === "string" ? `dataset:${params.p_dataset_id}:` : "";
  return `agg:${datasetPart}${hash}:${sorted.length}`;
}

export function getCached<T>(key: string): T | undefined {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.data;
}

export function setCache<T>(key: string, data: T, ttlMs = DEFAULT_TTL_MS): void {
  // Prevent unbounded growth: evict oldest entries when over limit
  if (store.size >= 200) {
    const oldestKey = store.keys().next().value;
    if (oldestKey) store.delete(oldestKey);
  }
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function invalidateDatasetCache(datasetId: string): void {
  for (const key of store.keys()) {
    if (key.includes(`dataset:${datasetId}:`)) {
      store.delete(key);
    }
  }
}

export function clearAllCaches(): void {
  store.clear();
}

export function cacheSize(): number {
  return store.size;
}
