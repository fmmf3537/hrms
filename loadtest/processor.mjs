// M5-05/M5-09: 并发压测 | HRMS | 2026-09-02
// processor.mjs —— Artillery JS hook：为每个 VU 注入独立 Bearer token
//
// 演进：
//   M5-05-fix1  读 loadtest/.auth/admin-token.json（单 token）注入 context.vars
//   M5-05-fix2  beforeScenario 必须挂到 yml scenario 上（函数名字符串引用）才会被调用
//   M5-09-fix1  artillery 2.0.34 对 defaults.headers 的 {{ token }} 渲染不可靠 → 加
//              beforeRequest hook 在代码内直接改写请求头
//   M5-09-fix2  单 admin token 会打爆 user-tier 300/min → 支持 token 池
//              （loadtest/.auth/token-pool.json，由 server/scripts/fixes/m5-09-token-pool.mjs 生成），
//              100 个 VU 轮流取不同 token，模拟 100 个独立用户（各自 300/min 配额）。
//              pool 缺失时 fallback 到单 admin token（旧行为）。
//
// 压测全程不再访问登录接口（避开 loginLimiter 5min/10 次）。

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const poolPath = join(__dirname, '.auth', 'token-pool.json');
const adminTokenPath = join(__dirname, '.auth', 'admin-token.json');

// 进程级轮询游标：每个 VU 在 beforeScenario 取一个 token（VU 生命周期内固定同一身份）
let poolCursor = 0;
let poolTokens = null; // 惰性加载：string[] | null

function loadPool() {
  if (poolTokens !== null) return poolTokens;
  try {
    const parsed = JSON.parse(readFileSync(poolPath, 'utf8'));
    if (Array.isArray(parsed?.tokens) && parsed.tokens.length > 0) {
      poolTokens = parsed.tokens;
      return poolTokens;
    }
  } catch {
    /* fallthrough → 单 admin token */
  }
  poolTokens = [];
  return poolTokens;
}

function nextToken() {
  const pool = loadPool();
  if (pool.length > 0) {
    const token = pool[poolCursor % pool.length];
    poolCursor += 1;
    return token;
  }
  // fallback：单 admin token
  try {
    const parsed = JSON.parse(readFileSync(adminTokenPath, 'utf8'));
    return parsed?.token ?? null;
  } catch {
    return null;
  }
}

export function beforeScenario(context, ee, next) {
  const token = nextToken();
  if (!token) {
    ee.emit('error', 'processor: 无可用 token（缺 token-pool.json 且 admin-token.json 失效），请先运行 m5-09-token-pool.mjs / auth-setup.mjs');
  }
  context.vars.token = token;
  return next();
}

// M5-09-fix1: 模板渲染不可靠 → beforeRequest 代码内直接改写请求头（绕开 {{ token }}）
export function beforeRequest(reqParams, context, ee, next) {
  const token = context.vars.token;
  if (token) {
    reqParams.headers = reqParams.headers ?? {};
    reqParams.headers.Authorization = `Bearer ${token}`;
  }
  return next();
}

export function afterResponse(reqParams, response, context, ee, next) {
  // 仅打印非 200（200 不打印，避免刷屏淹没汇总）
  const status = response.statusCode ?? response.status;
  if (status !== 200) {
    process.stderr.write(`[proc] afterResponse status=${status} body=${(response.body || '').slice(0, 80)}\n`);
  }
  return next();
}
