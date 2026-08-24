import Redis from 'ioredis';

import { env } from './env';

export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    if (times > 3) {
      console.error('Redis connection failed after 3 retries');
      return null;
    }
    return Math.min(times * 100, 3000);
  },
});

redis.on('connect', () => {
  console.log('✅ Redis connected');
});

redis.on('error', (err) => {
  console.error('Redis error:', err.message);
});

redis.on('close', () => {
  console.log('Redis connection closed');
});

// 连接 Redis（首次使用时）
export async function connectRedis(): Promise<void> {
  if (redis.status === 'wait') {
    await redis.connect();
  }
}

export default redis;
