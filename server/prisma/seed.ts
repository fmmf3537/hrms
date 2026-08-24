// M0-04: database seed | HRMS | 2026-08-23
// 用法：pnpm --filter hrms-server db:seed

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

import { ROLE_PERMISSIONS } from '../src/constants/permissions';

const prisma = new PrismaClient();

async function main() {
  console.log('==> Seeding companies...');
  const companies = await Promise.all([
    prisma.company.upsert({
      where: { code: 'XACH' },
      update: {},
      create: {
        code: 'XACH',
        name: '西安辰航卓越科技有限公司',
        shortName: '辰航卓越',
        city: '西安',
      },
    }),
    prisma.company.upsert({
      where: { code: 'XACX' },
      update: {},
      create: {
        code: 'XACX',
        name: '西安辰翔卓越科技有限公司',
        shortName: '辰翔卓越',
        city: '西安',
      },
    }),
    prisma.company.upsert({
      where: { code: 'SCXH' },
      update: {},
      create: {
        code: 'SCXH',
        name: '四川新航卓越（待定）有限公司', // TODO: 待用户提供完整法定名称后修改
        shortName: '新航卓越',
        city: '四川',
      },
    }),
  ]);
  console.log(`   ✓ ${companies.length} companies`);

  console.log('==> Seeding roles...');
  const roleDefinitions = [
    {
      code: 'admin',
      name: '系统管理员',
      description: '拥有所有权限',
    },
    {
      code: 'hr',
      name: 'HR',
      description: '人力资源部',
    },
    {
      code: 'dept_head',
      name: '部门负责人',
      description: '部门管理者',
    },
    {
      code: 'executive',
      name: '高管',
      description: '董事长/总经理',
    },
    {
      code: 'employee',
      name: '员工',
      description: '普通员工（正式/实习/顾问/劳务）',
    },
  ].map((r) => ({
    ...r,
    // 权限点统一引用 src/constants/permissions.ts（唯一真相源）
    permissions: ROLE_PERMISSIONS[r.code] ?? [],
  }));

  const roles = await Promise.all(
    roleDefinitions.map((r) =>
      prisma.role.upsert({
        where: { code: r.code },
        // 幂等同步权限点：以 constants/permissions.ts 为唯一真相源，重跑 seed 即可追平新增权限
        update: { permissions: r.permissions },
        create: r,
      }),
    ),
  );
  console.log(`   ✓ ${roles.length} roles`);

  console.log('==> Seeding admin user...');
  const adminRole = roles.find((r) => r.code === 'admin')!;
  const passwordHash = await bcrypt.hash('Admin@123', 10);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash,
      email: 'admin@hrms.local',
      status: 'active',
      // 默认口令 Admin@123 仅为首次初始化使用，登录后必须改密
      mustChangePassword: true,
      userRoles: {
        create: { roleId: adminRole.id },
      },
    },
  });
  console.log(`   ✓ admin user (id=${admin.id})`);

  console.log('==> Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
