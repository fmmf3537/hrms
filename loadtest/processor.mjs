// M5-05 fix1: 并发压测 | HRMS | 2026-09-02
// processor.mjs —— Artillery JS hook，为每个 VU 注入 Bearer token
//
// 关键改动（M5-05-fix1）：
//   移除 artillery config.payload 的 CSV 解析器依赖，
//   直接用 Node.js fs.readFileSync + JSON.parse 读取
//   loadtest/.auth/admin-token.json（{ token: string, exp: number }），
//   将 token 注入 context.vars。yml header 仍以 {{ token }} 引用。
//
// 不在压测过程中再次访问登录接口（避开 loginLimiter 1min/30 次）。

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tokenPath = join(__dirname, '.auth', 'admin-token.json');

export function beforeScenario(context, ee, next) {
  try {
    const raw = readFileSync(tokenPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed?.token) {
      ee.emit('error', 'processor: admin-token.json 中无 token，请先运行 auth-setup.mjs');
    }
    context.vars.token = parsed.token;
  } catch (err) {
    ee.emit('error', `Token read failed: ${err.message ?? err}`);
    context.vars.token = null;
  }
  return next();
}
