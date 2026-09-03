// M5-09 fix2: 压测 token 池生成脚本 | HRMS | 2026-09-02
// 一次性脚本：
//   1. 建 100 个压测用户（username = perf_0001..perf_0100，角色 admin，不绑员工档案）
//   2. 用 server JWT_SECRET 直接签发 100 个 access token（HS256，同 auth.service.signAccessToken 结构）
//   3. 落盘 loadtest/.auth/token-pool.json { tokens: [...] } 供 artillery processor 池化取用
//
// 为什么直签而不走 /api/auth/login：
//   loginLimiter 5min/10 次，100 个账号逐个登录必 429。直签绕过登录限流（与 server 同 secret，
//   authenticate 只验签名 + exp，不查 DB，token 与登录签发等效）。
//
// 幂等：重跑会先删除 perf_* 用户再重建（user_roles 级联删除）。
// 运行方式：cd server && node scripts/fixes/m5-09-token-pool.mjs
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const prisma = new PrismaClient({ log: ['error'] });

const COUNT = Number(process.env.POOL_COUNT ?? 100);
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '15m';
if (!JWT_SECRET) {
  console.error('!! JWT_SECRET 缺失：请确认在 server/ 目录下运行（dotenv 读 server/.env）');
  process.exit(1);
}

const OUT_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'loadtest', '.auth', 'token-pool.json',
);

async function main() {
  console.log(`==> 压测 token 池生成：${COUNT} 个用户`);

  // 1. 清理旧 perf_* 用户（user_roles 级联删除）
  const cleaned = await prisma.user.deleteMany({ where: { username: { startsWith: 'perf_' } } });
  console.log(`   - 清理旧 perf_* 用户: ${cleaned.count}`);

  // 2. admin 角色（permissions=['*']，避免再查权限点）
  const adminRole = await prisma.role.findUnique({ where: { code: 'admin' } });
  if (!adminRole) {
    console.error('!! admin role 不存在（请先跑 seed）');
    process.exit(1);
  }

  // 3. 建 100 用户（同一 passwordHash 即可——直签 token，不走密码登录）
  const passwordHash = await bcrypt.hash('Perf@2026', 12);
  const created = [];
  for (let i = 1; i <= COUNT; i += 1) {
    const username = `perf_${String(i).padStart(4, '0')}`;
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        status: 'active',
        mustChangePassword: false,
        tokenVersion: 0,
        userRoles: { create: { roleId: adminRole.id } },
      },
      select: { id: true, username: true, tokenVersion: true },
    });
    created.push(user);
  }
  console.log(`   - 新建用户: ${created.length}`);

  // 4. 直签 access token（payload 对齐 auth.service.signAccessToken；员工档案字段为 null）
  const tokens = created.map((u) =>
    jwt.sign(
      {
        userId: u.id,
        username: u.username,
        companyId: null,
        departmentId: null,
        roles: ['admin'],
        permissions: ['*'],
        tokenVersion: u.tokenVersion,
        mustChangePassword: false,
      },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: JWT_EXPIRES_IN },
    ));

  // 5. 落盘
  mkdirSync(dirname(OUT_FILE), { recursive: true });
  const expMs = Date.now() + (JWT_EXPIRES_IN.endsWith('m')
    ? Number(JWT_EXPIRES_IN.slice(0, -1)) * 60_000
    : 15 * 60_000);
  writeFileSync(OUT_FILE, JSON.stringify({
    tokens,
    count: tokens.length,
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(expMs).toISOString(),
    note: '100 压测用户直签 access token（roles=admin，无员工档案，companyId=null）',
  }, null, 2), 'utf8');

  console.log(`   - 已签发 ${tokens.length} 个 token → ${OUT_FILE}`);
  console.log(`   - 过期时间: ${new Date(expMs).toISOString()}`);
}

main()
  .catch((e) => {
    console.error('!! token 池生成失败:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
