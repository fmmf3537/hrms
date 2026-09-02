// M5-05: 并发压测 | HRMS | 2026-09-02
// auth-setup.mjs —— 压测前确保有一份可用的 admin JWT
// 用法：node loadtest/auth-setup.mjs
// 行为：
//   1. 若 loadtest/.auth/admin-token.json 存在且 token 未过期（留 30s 余量）→ 直接复用
//   2. 否则 POST /api/auth/login 拿新 token，落盘
//   3. 失败（HTTP 非 200 / 业务 success=false / 登录限流 429）→ exit 1，给出清晰提示
// 关键约定：压测全程只有这一个进程碰登录接口（避开 loginLimiter 1min/30 次）

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = resolve(__dirname, '.auth', 'admin-token.json');

const API_BASE = process.env.LOAD_API_BASE ?? 'http://localhost:3000';
const USERNAME = process.env.LOAD_ADMIN_USER ?? 'admin';
const PASSWORD = process.env.LOAD_ADMIN_PASS ?? 'Admin@2026';
// M5-05 fix2: 余量覆盖完整压测时长（warm-up 30s + ramp-up 60s + sustain 120s + cool-down 30s ≈ 4 分钟）
// 原 30_000 在复用一个已用 13 分钟的 token 时，sustain 阶段中途会过期（ramp-up 中段出现 401）
// 360_000 = 6 分钟，登录限流 5min/10 次，每次压测最多登录 1 次，无冲突
const SAFETY_MARGIN_MS = 360_000;

/**
 * 从 JWT 解析 exp（秒，Unix 时间戳）
 * 参照 e2e/global-setup.ts 的 getTokenExp：拆 '.' 取中间段，Buffer.from(..., 'base64') 解析 payload
 * Node Buffer.from 默认 padding 容忍，可正确解码 base64url（无需替换 -_=）
 */
function getTokenExp(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

async function loadExistingToken() {
  if (!existsSync(TOKEN_FILE)) return null;
  try {
    const raw = JSON.parse(readFileSync(TOKEN_FILE, 'utf8'));
    const accessToken = raw?.token ?? raw?.accessToken;
    if (!accessToken) return null;
    const exp = raw.exp ?? getTokenExp(accessToken);
    if (!exp) return null;
    const expiresAtMs = exp * 1000 - SAFETY_MARGIN_MS;
    if (expiresAtMs > Date.now()) {
      return accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

async function loginAndSave() {
  let res;
  try {
    res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
    });
  } catch (err) {
    console.error(`[auth-setup] 网络错误：${err?.message ?? err}`);
    console.error(`[auth-setup] 请确认后端 ${API_BASE} 已启动（docker postgres+redis + dev server）`);
    process.exit(1);
  }

  if (res.status === 429) {
    console.error('[auth-setup] 登录接口限流（429）。');
    console.error('[auth-setup] 原因：5 分钟内连续登录超过 30 次。');
    console.error('[auth-setup] 处理：等待 5 分钟后再试，或确认已有 token 仍有效后直接复用。');
    process.exit(1);
  }

  if (!res.ok) {
    const text = await res.text();
    console.error(`[auth-setup] 登录失败 HTTP ${res.status}: ${text.slice(0, 200)}`);
    process.exit(1);
  }

  const body = await res.json();
  if (body.success !== true || !body.data?.accessToken) {
    console.error(`[auth-setup] 登录业务失败: ${body.error ?? body.message ?? JSON.stringify(body).slice(0, 200)}`);
    process.exit(1);
  }

  const accessToken = body.data.accessToken;
  const exp = getTokenExp(accessToken) ?? 0;
  mkdirSync(dirname(TOKEN_FILE), { recursive: true });
  writeFileSync(
    TOKEN_FILE,
    JSON.stringify({ token: accessToken, exp }, null, 2),
    'utf8',
  );
  return accessToken;
}

async function main() {
  const reused = await loadExistingToken();
  if (reused) {
    const exp = getTokenExp(reused);
    console.log(`[auth-setup] 复用已有 token（exp=${new Date(exp * 1000).toISOString()}）`);
  } else {
    console.log(`[auth-setup] POST ${API_BASE}/api/auth/login ...`);
    const tok = await loginAndSave();
    const exp = getTokenExp(tok);
    console.log(`[auth-setup] 登录成功，token 已写入 ${TOKEN_FILE}`);
    console.log(`[auth-setup] exp=${new Date(exp * 1000).toISOString()}（约 ${Math.max(0, Math.floor((exp * 1000 - Date.now()) / 60_000))} 分钟后过期）`);
  }
}

main().catch((err) => {
  console.error('[auth-setup] 未知异常：', err);
  process.exit(1);
});