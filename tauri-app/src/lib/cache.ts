import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Create a Redis client instance
const redis = new Redis(REDIS_URL, {
    lazyConnect: true,
    enableOfflineQueue: false, // Important: Fail fast if not connected
    connectTimeout: 1000, // Fail connection fast
    retryStrategy: (times) => {
        // Stop retrying after 3 attempts if initial connection fails
        if (times > 3) {
            return null; // Stop retrying
        }
        return Math.min(times * 100, 1000);
    },
});

let isRedisAvailable = false;

redis.on('connect', () => {
    isRedisAvailable = true;
    console.log('[Redis] Connected');
});

redis.on('error', (err) => {
    isRedisAvailable = false;
    // Suppress repeated error logs
});

// Helper to check readiness
const isReady = () => isRedisAvailable && redis.status === 'ready';

export const cache = {
    // Get parsed JSON from cache
    get: async <T>(key: string): Promise<T | null> => {
        if (!isReady()) return null;
        try {
            const data = await redis.get(key);
            if (!data) return null;
            return JSON.parse(data) as T;
        } catch (error) {
            return null;
        }
    },

    // Set value with optional TTL (seconds)
    set: async (key: string, value: any, ttlSeconds: number = 300) => {
        if (!isReady()) return;
        try {
            const data = JSON.stringify(value);
            await redis.setex(key, ttlSeconds, data);
        } catch (error) {
            // Ignore
        }
    },

    // Delete a key
    del: async (key: string) => {
        if (!isReady()) return;
        try {
            await redis.del(key);
        } catch (error) {
            // Ignore
        }
    },

    // Clear all keys matching a pattern
    flush: async (pattern: string) => {
        if (!isReady()) return;
        try {
            const keys = await redis.keys(pattern);
            if (keys.length > 0) {
                await redis.del(keys);
            }
        } catch (error) {
            // Ignore
        }
    }
};

// Attempt initial connection without blocking
redis.connect().catch(() => {
    // Initial connection failed, that's fine, we remain properly handling it
});
