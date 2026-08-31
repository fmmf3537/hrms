/**
 * 字典缓存（M5-2-0）
 * @module stores/dict
 * @description TTL 5 分钟；M5-2-A 业务模块按 key 填入 fetcher
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';

const CACHE_TTL = 5 * 60 * 1000;

interface CacheEntry {
  value: unknown;
  expireAt: number;
}

export const useDictStore = defineStore('dict', () => {
  const cache = ref<Map<string, CacheEntry>>(new Map());

  function get<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const cached = cache.value.get(key);
    if (cached && cached.expireAt > Date.now()) {
      return Promise.resolve(cached.value as T);
    }
    return fetcher().then((value) => {
      cache.value.set(key, { value, expireAt: Date.now() + CACHE_TTL });
      return value;
    });
  }

  function clear(): void {
    cache.value.clear();
  }

  return { get, clear };
});
