import type { Request, Response, NextFunction } from 'express';
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

// ==================== M5-09 fix2: 限流结构修正 ====================
// 阈值对齐 PRD §8.1 并发指标（用户拍板 2026-09-02：用户 300 次/分钟 + IP 3000 次/分钟）。
//
// 原实现缺陷：apiLimiter 全局挂在 app.use(apiLimiter)（authenticate 之前），req.user 永不
// 注入 → user-tier 的 keyGenerator 恒退回 IP → 单用户可占满整个 IP 配额（300/min），
// "用户 300/min + IP 3000/min" 语义实际未生效。
//
// fix2 拆成两段，各自落在正确位置：
//   1. userLimiter（300/min，按 req.user.userId 取桶）—— 由 auth.authenticate 在
//      jwt.verify 成功后手动串联（见 middleware/auth.ts），保证只有已认证请求进入用户桶；
//      /api/auth/login、/api/auth/refresh 不走 authenticate，仍由 loginLimiter / refreshLimiter
//      独立限流。
//   2. ipLimiter（3000/min，按 req.ip 取桶）—— 全局 app.use(ipLimiter)（见 app.ts），
//      兜底办公网共享出口 / 未认证 flood（login/refresh 的独立限流 + 业务 401 前的第一道闸）。
//
// 为什么 100 并发压测不再 429：
//   100 个压测用户各自低频操作（≤5 次/分钟）→ 单用户远低于 300/min ✅；
//   全公司共享同一出口 IP 的总流量（≤3000/min）留足 10 倍以上余量 ✅。

/** 2FA 请求验证码：5 分钟内最多 5 次（防短信/邮件轰炸） */
export const request2faLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: '验证码发送过于频繁，请 5 分钟后再试',
    code: 429,
  },
});

/** 2FA 校验验证码：5 分钟内最多 10 次（配合 service 端 5 次锁定） */
export const verify2faLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: '验证码校验过于频繁，请稍后再试',
    code: 429,
  },
});

/** 已认证用户级限流：300 次/分钟，key=userId（挂在 authenticate 之后） */
export const userLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // 预期在 authenticate 之后调用（req.user 已注入）；防御性兜底回退 IP
    const userId = req.user?.userId;
    if (userId) {
      return `u:${userId}`;
    }
    return `ip:${req.ip ?? 'unknown'}`;
  },
  message: {
    success: false,
    error: '请求过于频繁，请稍后再试',
    code: 429,
  },
});

/** IP 级兜底限流：3000 次/分钟（全局 app.use，防 flood / 共享出口挤兑） */
export const ipLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => `ip:${req.ip ?? 'unknown'}`,
  message: {
    success: false,
    error: '请求过于频繁，请稍后再试',
    code: 429,
  },
});

/**
 * @deprecated M5-09 fix2 起不再使用（原双层 apiLimiter 因挂载在 authenticate 之前，
 *   user-tier 形同虚设）。全局兜底请用 ipLimiter；已认证用户限流由 authenticate 内串联 userLimiter。
 */
export const apiLimiter = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  userLimiter(req, res, (err?: unknown) => {
    if (err) return next(err as Error);
    ipLimiter(req, res, next);
  });
};
