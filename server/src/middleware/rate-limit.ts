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
