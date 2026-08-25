import rateLimit from 'express-rate-limit';

/** 登录：5 分钟内最多 10 次 */
export const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: '登录尝试次数过多，请 5 分钟后再试',
    code: 429,
  },
});

/**
 * 刷新 accessToken：1 分钟内最多 30 次（宽于登录，因为可能有并发请求同时触发刷新）
 * 关键：refresh 端点不能无限刷，否则泄露的 refreshToken 可被暴力换 accessToken
 */
export const refreshLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: '刷新请求过于频繁，请稍后再试',
    code: 429,
  },
});

/** API 兜底限流：1 分钟内最多 100 次 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: '请求过于频繁，请稍后再试',
    code: 429,
  },
});
