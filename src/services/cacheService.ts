/**
 * Cache Service - Intelligent caching for AI responses and embeddings
 * Implements LRU cache with TTL and compression
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
  size: number;
}

interface CacheOptions {
  ttlMinutes?: number;
  maxEntries?: number;
  maxSizeBytes?: number;
  compression?: boolean;
}

class CacheService<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private ttl: number;
  private maxEntries: number;
  private maxSize: number;
  private compression: boolean;
  private currentSize = 0;

  constructor(options: CacheOptions = {}) {
    this.ttl = (options.ttlMinutes || 15) * 60 * 1000; // Convert to milliseconds
    this.maxEntries = options.maxEntries || 100;
    this.maxSize = options.maxSizeBytes || 10 * 1024 * 1024; // 10MB default
    this.compression = options.compression || false; // TODO: Implement compression
  }

  /**
   * Generate cache key from object or string
   */
  private generateKey(input: any): string {
    if (typeof input === 'string') {
      return this.hashString(input);
    }
    return this.hashString(JSON.stringify(input));
  }

  /**
   * Simple hash function for cache keys
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Calculate approximate size of data
   */
  private calculateSize(data: T): number {
    try {
      return new Blob([JSON.stringify(data)]).size;
    } catch {
      return 1024; // Default fallback size
    }
  }

  /**
   * Check if cache entry is expired
   */
  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp > this.ttl;
  }

  /**
   * Remove expired entries
   */
  private cleanupExpired(): void {
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.currentSize -= entry.size;
        this.cache.delete(key);
      }
    }
  }

  /**
   * Remove least recently used entries to make space
   */
  private evictLRU(): void {
    if (this.cache.size === 0) return;

    // Sort by last accessed time (ascending)
    const entries = Array.from(this.cache.entries()).sort(
      ([, a], [, b]) => a.lastAccessed - b.lastAccessed
    );

    // Remove oldest entries until we're under limits
    while (
      (this.cache.size >= this.maxEntries || this.currentSize >= this.maxSize) &&
      entries.length > 0
    ) {
      const [key, entry] = entries.shift()!;
      this.currentSize -= entry.size;
      this.cache.delete(key);
    }
  }

  /**
   * Get item from cache
   */
  get(key: any): T | null {
    const cacheKey = this.generateKey(key);
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      return null;
    }

    if (this.isExpired(entry)) {
      this.currentSize -= entry.size;
      this.cache.delete(cacheKey);
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = Date.now();

    return entry.data;
  }

  /**
   * Set item in cache
   */
  set(key: any, data: T): void {
    const cacheKey = this.generateKey(key);
    const size = this.calculateSize(data);
    const now = Date.now();

    // Remove existing entry if it exists
    const existing = this.cache.get(cacheKey);
    if (existing) {
      this.currentSize -= existing.size;
    }

    // Create new entry
    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      accessCount: 1,
      lastAccessed: now,
      size,
    };

    // Cleanup before adding
    this.cleanupExpired();
    
    // Make space if needed
    if (this.cache.size >= this.maxEntries || this.currentSize + size >= this.maxSize) {
      this.evictLRU();
    }

    // Add new entry
    this.cache.set(cacheKey, entry);
    this.currentSize += size;
  }

  /**
   * Check if key exists in cache
   */
  has(key: any): boolean {
    const cacheKey = this.generateKey(key);
    const entry = this.cache.get(cacheKey);
    return entry !== undefined && !this.isExpired(entry);
  }

  /**
   * Remove item from cache
   */
  delete(key: any): boolean {
    const cacheKey = this.generateKey(key);
    const entry = this.cache.get(cacheKey);
    if (entry) {
      this.currentSize -= entry.size;
      return this.cache.delete(cacheKey);
    }
    return false;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    entries: number;
    size: number;
    hitRate: number;
    oldestEntry: number;
    newestEntry: number;
  } {
    let totalAccess = 0;
    let oldestTime = Date.now();
    let newestTime = 0;

    for (const entry of this.cache.values()) {
      totalAccess += entry.accessCount;
      oldestTime = Math.min(oldestTime, entry.timestamp);
      newestTime = Math.max(newestTime, entry.timestamp);
    }

    return {
      entries: this.cache.size,
      size: this.currentSize,
      hitRate: totalAccess / Math.max(this.cache.size, 1),
      oldestEntry: oldestTime,
      newestEntry: newestTime,
    };
  }

  /**
   * Preload cache with commonly used data
   */
  async preload<K>(keys: K[], loader: (key: K) => Promise<T>): Promise<void> {
    const promises = keys.map(async (key) => {
      if (!this.has(key)) {
        try {
          const data = await loader(key);
          this.set(key, data);
        } catch (error) {
          console.error('Error preloading cache key:', key, error);
        }
      }
    });

    await Promise.all(promises);
  }
}

// Specific cache instances for different data types
export const embeddingCache = new CacheService<number[]>({
  ttlMinutes: 60, // Embeddings are stable, cache longer
  maxEntries: 200,
  maxSizeBytes: 20 * 1024 * 1024, // 20MB for embeddings
});

export const chatResponseCache = new CacheService<string>({
  ttlMinutes: 15, // Chat responses change more frequently
  maxEntries: 50,
  maxSizeBytes: 5 * 1024 * 1024, // 5MB for chat responses
});

export const resumeMatchCache = new CacheService<any[]>({
  ttlMinutes: 30, // Resume matches based on job descriptions
  maxEntries: 100,
  maxSizeBytes: 15 * 1024 * 1024, // 15MB for resume matches
});

/**
 * Cache-aware wrapper for async functions
 */
export function withCache<T, K>(
  cache: CacheService<T>,
  keyGenerator: (...args: K[]) => any = (...args) => args
) {
  return function cacheWrapper(fn: (...args: K[]) => Promise<T>) {
    return async (...args: K[]): Promise<T> => {
      const cacheKey = keyGenerator(...args);
      
      // Try to get from cache first
      const cached = cache.get(cacheKey);
      if (cached !== null) {
        console.log('Cache hit for key:', typeof cacheKey === 'string' ? cacheKey.substring(0, 50) : 'complex-key');
        return cached;
      }

      // Cache miss - call original function
      console.log('Cache miss for key:', typeof cacheKey === 'string' ? cacheKey.substring(0, 50) : 'complex-key');
      try {
        const result = await fn(...args);
        cache.set(cacheKey, result);
        return result;
      } catch (error) {
        // Don't cache errors
        throw error;
      }
    };
  };
}
