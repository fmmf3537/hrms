// M5-11: 生产环境配置生成 / 校验工具
// 作用：
//   --check    校验 .env.production 是否具备上线条件（密钥真值 / CORS / NODE_ENV）
//   --apply    生成缺失/占位的 ENCRYPTION_KEY + JWT secrets 并写回 .env.production
//              （仅替换缺失或占位项，不覆盖已填真值；不打印 secret 全文）
//
// 用法（在 server/ 下执行）：
//   pnpm exec tsx scripts/ops/ensure-production-env.mjs --check
//   pnpm exec tsx scripts/ops/ensure-production-env.mjs --apply
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const ENV_FILE = resolve(process.cwd(), process.env.ENV_FILE ?? '../.env.production');
const FORBIDDEN = ['dev-only', 'change-in-prod', 'changeme'];
const DEV_ENC_PLACEHOLDER = 'a'.repeat(64); // env.ts 中 dev 占位 = 64 个 a

function parseEnv(text) {
  const entries = [];
  text.split('\n').forEach((line, i) => {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    entries.push(m ? { line, key: m[1], raw: m[2], index: i } : { line, index: i });
  });
  return entries;
}

function isForbidden(v) {
  return FORBIDDEN.some((f) => v.toLowerCase().includes(f));
}

function checks(envMap) {
  const report = [];
  const enc = envMap.get('ENCRYPTION_KEY');
  report.push({
    key: 'ENCRYPTION_KEY',
    ok: Boolean(enc) && /^[a-f0-9]{64}$/.test(enc) && enc !== DEV_ENC_PLACEHOLDER,
    note: enc ? (enc === DEV_ENC_PLACEHOLDER ? 'dev 占位（64 个 a）' : '已配置') : '缺失',
  });
  for (const k of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) {
    const v = envMap.get(k) ?? '';
    report.push({
      key: k,
      ok: v.length >= 32 && !isForbidden(v),
      note: v.length === 0 ? '缺失' : (v.length < 32 ? '长度不足 32' : '已配置'),
    });
  }
  const cors = envMap.get('CORS_ORIGIN') ?? '';
  report.push({
    key: 'CORS_ORIGIN',
    ok: cors.length > 0 && cors !== 'http://localhost',
    note: cors === 'http://localhost' ? '仍是 localhost（需按真实前端域名/IP）' : (cors ? '已配置' : '缺失'),
  });
  report.push({
    key: 'NODE_ENV',
    ok: (envMap.get('NODE_ENV') ?? '') === 'production',
    note: envMap.get('NODE_ENV') ?? '缺失',
  });
  return report;
}

const mode = process.argv[2] ?? '--check';
const text = readFileSync(ENV_FILE, 'utf8');
const entries = parseEnv(text);
const envMap = new Map(entries.filter((e) => e.key).map((e) => [e.key, e.raw]));

if (mode === '--check') {
  console.log(`校验文件：${ENV_FILE}`);
  const report = checks(envMap);
  let allOk = true;
  report.forEach((r) => {
    console.log(`  ${r.ok ? '✅' : '❌'} ${r.key.padEnd(20)} ${r.note}`);
    if (!r.ok) allOk = false;
  });
  console.log(allOk ? '\n全部满足上线条件 ✅' : '\n存在未满足项：用 --apply 生成缺失密钥，并人工确认 CORS/NODE_ENV。');
  process.exit(allOk ? 0 : 1);
}

if (mode === '--apply') {
  const report = checks(envMap);
  const needKeys = report
    .filter((r) => !r.ok && ['ENCRYPTION_KEY', 'JWT_SECRET', 'JWT_REFRESH_SECRET'].includes(r.key))
    .map((r) => r.key);
  const generated = {};
  if (needKeys.includes('ENCRYPTION_KEY')) {
    generated.ENCRYPTION_KEY = randomBytes(32).toString('hex');
  }
  if (needKeys.includes('JWT_SECRET')) {
    generated.JWT_SECRET = randomBytes(36).toString('base64url');
  }
  if (needKeys.includes('JWT_REFRESH_SECRET')) {
    generated.JWT_REFRESH_SECRET = randomBytes(36).toString('base64url');
  }
  if (Object.keys(generated).length === 0) {
    console.log('无需生成（密钥已就绪）；CORS/NODE_ENV 请人工在 .env.production 确认。');
    process.exit(0);
  }
  const nextLines = entries.map((e) => {
    if (e.key && generated[e.key] !== undefined) {
      const secret = generated[e.key];
      // 仅展示前 8 字符用于确认写入（不泄露完整值）
      console.log(`  替换 ${e.key} → ${secret.slice(0, 8)}…（长度 ${secret.length}）`);
      return `${e.key}=${secret}`;
    }
    return e.line;
  });
  Object.keys(generated).forEach((k) => {
    if (!entries.some((e) => e.key === k)) {
      nextLines.push(`${k}=${generated[k]}`);
    }
  });
  writeFileSync(ENV_FILE, `${nextLines.join('\n')}\n`, 'utf8');
  console.log(`✅ 已写入 ${ENV_FILE}（缺失/占位密钥已生成）`);
  console.log('⚠️ 新 ENCRYPTION_KEY 将影响后续加密：务必在首次写入业务数据前配置并安全备份！');
  process.exit(0);
}

console.error(`未知模式 ${mode}（--check | --apply）`);
process.exit(2);
