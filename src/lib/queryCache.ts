/**
 * Lightweight in-memory data cache with stale-while-revalidate.
 * Prevents redundant Supabase fetches on rapid page navigation.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

const DEFAULT_STALE_MS = 30_000; // 30 seconds

/**
 * Get cached data if it exists and isn't stale.
 */
export function getCached<T>(key: string, staleMs = DEFAULT_STALE_MS): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > staleMs) return null;
  return entry.data as T;
}

/**
 * Store data in cache.
 */
export function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Invalidate a specific cache key or all keys matching a prefix.
 */
export function invalidateCache(keyOrPrefix: string): void {
  if (cache.has(keyOrPrefix)) {
    cache.delete(keyOrPrefix);
    return;
  }
  // Prefix-based invalidation
  for (const key of cache.keys()) {
    if (key.startsWith(keyOrPrefix)) {
      cache.delete(key);
    }
  }
}

/**
 * Clear the entire cache.
 */
export function clearCache(): void {
  cache.clear();
}
