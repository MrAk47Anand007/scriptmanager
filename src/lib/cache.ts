import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Create a Redis client instance
// We use a singleton pattern to reuse the connection across API routes in dev
// In production (Next.js serverless), this might create new connections per lambda, which is fine for Redis.
const redis = new Redis(REDIS_URL, {
    lazyConnect: true, // Don't connect immediately, wait for first command
    retryStrategy: (times) => {
        // Retry connection logic
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
});

redis.on('error', (err) => {
    console.warn('[Redis] Connection error (Caching disabled):', err.message);
});

export const cache = {
    // Get parsed JSON from cache
    get: async <T>(key: string): Promise<T | null> => {
        try {
            const data = await redis.get(key);
            if (!data) return null;
            return JSON.parse(data) as T;
        } catch (error) {
            // If Redis fails, just return null (cache miss) so the app keeps working
            return null;
        }
    },

    // Set value with optional TTL (seconds)
    set: async (key: string, value: any, ttlSeconds: number = 300) => {
        try {
            const data = JSON.stringify(value);
            await redis.setex(key, ttlSeconds, data);
        } catch (error) {
            console.warn('[Redis] Failed to set cache:', error);
        }
    },

    // Delete a key
    del: async (key: string) => {
        try {
            await redis.del(key);
        } catch (error) {
            console.warn('[Redis] Failed to delete cache:', error);
        }
    },

    // Clear all keys matching a pattern (be careful)
    flush: async (pattern: string) => {
        try {
            const keys = await redis.keys(pattern);
            if (keys.length > 0) {
                await redis.del(keys);
            }
        } catch (error) {
            console.warn('[Redis] Failed to flush cache pattern:', error);
        }
    }
};
