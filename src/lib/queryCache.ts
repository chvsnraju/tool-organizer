/**
 * Lightweight in-memory data cache with stale-while-revalidate.
 * Prevents redundant Supabase fetches on rapid page navigation.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

// Index from prefix → set of keys, enabling O(1) prefix invalidation
const prefixIndex = new Map<string, Set<string>>();

const DEFAULT_STALE_MS = 30_000; // 30 seconds

function extractPrefix(key: string): string {
  const colonIdx = key.indexOf(':');
  return colonIdx !== -1 ? key.slice(0, colonIdx + 1) : key;
}

function registerKeyInPrefixIndex(key: string): void {
  const prefix = extractPrefix(key);
  if (!prefixIndex.has(prefix)) {
    prefixIndex.set(prefix, new Set());
  }
  prefixIndex.get(prefix)!.add(key);
}

function removeKeyFromPrefixIndex(key: string): void {
  const prefix = extractPrefix(key);
  const keys = prefixIndex.get(prefix);
  if (keys) {
    keys.delete(key);
    if (keys.size === 0) prefixIndex.delete(prefix);
  }
}

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
  if (!cache.has(key)) {
    registerKeyInPrefixIndex(key);
  }
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Invalidate a specific cache key or all keys matching a prefix.
 * Prefix matching is O(1) via the internal index.
 */
export function invalidateCache(keyOrPrefix: string): void {
  // Exact key match first
  if (cache.has(keyOrPrefix)) {
    removeKeyFromPrefixIndex(keyOrPrefix);
    cache.delete(keyOrPrefix);
    return;
  }

  // Prefix-based invalidation — O(1) lookup via index
  const keysForPrefix = prefixIndex.get(keyOrPrefix);
  if (keysForPrefix) {
    for (const key of keysForPrefix) {
      cache.delete(key);
    }
    prefixIndex.delete(keyOrPrefix);
  }
}

/**
 * Clear the entire cache.
 */
export function clearCache(): void {
  cache.clear();
  prefixIndex.clear();
}
