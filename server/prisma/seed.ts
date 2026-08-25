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
  const passwordHash = await bcrypt.hash('Admin@123', 12);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    // 重跑 seed 时强制升级：重新哈希到 cost=12 + mustChangePassword=true
    // （保证运维同事本地旧哈希与新安全基线一致）
    update: {
      passwordHash,
      mustChangePassword: true,
    },
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

  console.log('==> Seeding default approval flow templates (M0.5-1)...');

  // 1) 请假审批（默认）：≤3 天直属上级 → HR；>3 天加部门负责人 → 总经理
  const leaveFlow = await prisma.approvalFlow.upsert({
    where: { category_key_version: { category: 'leave', key: 'leave_default', version: 1 } },
    update: {},
    create: {
      category: 'leave',
      key: 'leave_default',
      name: '请假审批（默认）',
      version: 1,
      enabled: true,
      description: '≤3 天直属上级 → HR；>3 天加部门负责人 → 总经理',
      nodes: [
        {
          id: 'step1',
          type: 'sequential',
          approverType: 'role',
          approverValue: 'direct_leader',
          condition: null,
        },
        {
          id: 'step2',
          type: 'sequential',
          approverType: 'role',
          approverValue: 'hr',
          condition: 'always',
        },
        {
          id: 'step3',
          type: 'sequential',
          approverType: 'role',
          approverValue: 'ceo',
          // 条件分支：请假天数 > 3 时插入
          condition: 'data.leave_days > 3',
        },
      ],
    },
  });
  console.log(`   ✓ leave_default flow (id=${leaveFlow.id})`);

  // 2) 加班审批：直属上级必过；>36h 触发二次 HR 备案
  const overtimeFlow = await prisma.approvalFlow.upsert({
    where: { category_key_version: { category: 'overtime', key: 'overtime_default', version: 1 } },
    update: {},
    create: {
      category: 'overtime',
      key: 'overtime_default',
      name: '加班审批（默认）',
      version: 1,
      enabled: true,
      description: '直属上级审批；>36h/月 触发 HR 备案',
      nodes: [
        {
          id: 'step1',
          type: 'sequential',
          approverType: 'role',
          approverValue: 'direct_leader',
          condition: null,
        },
      ],
    },
  });
  console.log(`   ✓ overtime_default flow (id=${overtimeFlow.id})`);

  // 3) 出差审批：直属上级 → 部门负责人 → HR
  const tripFlow = await prisma.approvalFlow.upsert({
    where: { category_key_version: { category: 'business_trip', key: 'trip_default', version: 1 } },
    update: {},
    create: {
      category: 'business_trip',
      key: 'trip_default',
      name: '出差审批（默认）',
      version: 1,
      enabled: true,
      description: '直属上级 → 部门负责人 → HR',
      nodes: [
        {
          id: 'step1',
          type: 'sequential',
          approverType: 'role',
          approverValue: 'direct_leader',
          condition: null,
        },
        {
          id: 'step2',
          type: 'sequential',
          approverType: 'role',
          approverValue: 'department_leader',
          condition: 'always',
        },
        {
          id: 'step3',
          type: 'sequential',
          approverType: 'role',
          approverValue: 'hr',
          condition: 'always',
        },
      ],
    },
  });
  console.log(`   ✓ trip_default flow (id=${tripFlow.id})`);

  console.log('==> Seeding default notification templates (M0.5-2)...');

  // 1) 合同到期提醒 - 邮件 + 站内信
  const tplContractEmail = await prisma.notificationTemplate.upsert({
    where: { key_channel: { key: 'contract_expiring', channel: 'email' } },
    update: {},
    create: {
      key: 'contract_expiring',
      name: '合同到期提醒（邮件）',
      channel: 'email',
      subject: '【辰航 HR】合同 {{days_remaining}} 天后到期',
      contentTemplate:
        '您好 {{employee_name}}：\n\n您的 {{contract_type}} 将于 {{end_date}} 到期（剩余 {{days_remaining}} 天）。\n请及时与 HR 联系办理续签手续。\n\n辰航 HR 系统',
      variables: { employee_name: '员工姓名', contract_type: '合同类型', end_date: '到期日', days_remaining: '剩余天数' },
      enabled: true,
      description: '合同 30/15/7 天到期前自动发邮件',
    },
  });

  const tplContractInApp = await prisma.notificationTemplate.upsert({
    where: { key_channel: { key: 'contract_expiring', channel: 'in_app' } },
    update: {},
    create: {
      key: 'contract_expiring',
      name: '合同到期提醒（站内信）',
      channel: 'in_app',
      subject: '合同即将到期',
      contentTemplate: '您的 {{contract_type}} 将在 {{days_remaining}} 天后到期（{{end_date}}），请及时续签。',
      enabled: true,
    },
  });

  // 2) 审批待办 - 站内信
  const tplApprovalPending = await prisma.notificationTemplate.upsert({
    where: { key_channel: { key: 'approval_pending', channel: 'in_app' } },
    update: {},
    create: {
      key: 'approval_pending',
      name: '审批待办提醒',
      channel: 'in_app',
      subject: '您有新的审批待办',
      contentTemplate: '{{initiator_name}} 发起了「{{title}}」审批，请尽快处理。',
      enabled: true,
    },
  });

  // 3) 审批通过 - 站内信 + 邮件
  const tplApprovalApprovedInApp = await prisma.notificationTemplate.upsert({
    where: { key_channel: { key: 'approval_approved', channel: 'in_app' } },
    update: {},
    create: {
      key: 'approval_approved',
      name: '审批通过（站内信）',
      channel: 'in_app',
      subject: '您的审批已通过',
      contentTemplate: '「{{title}}」已通过审批（{{approved_by}} 处理）。',
      enabled: true,
    },
  });

  const tplApprovalApprovedEmail = await prisma.notificationTemplate.upsert({
    where: { key_channel: { key: 'approval_approved', channel: 'email' } },
    update: {},
    create: {
      key: 'approval_approved',
      name: '审批通过（邮件）',
      channel: 'email',
      subject: '【辰航 HR】您的审批已通过 - {{title}}',
      contentTemplate:
        '您好：\n\n您发起的「{{title}}」已通过审批。\n处理人：{{approved_by}}\n时间：{{approved_at}}\n\n辰航 HR 系统',
      enabled: true,
    },
  });

  // 4) 审批驳回 - 站内信 + 邮件
  const tplApprovalRejectedInApp = await prisma.notificationTemplate.upsert({
    where: { key_channel: { key: 'approval_rejected', channel: 'in_app' } },
    update: {},
    create: {
      key: 'approval_rejected',
      name: '审批驳回（站内信）',
      channel: 'in_app',
      subject: '您的审批被驳回',
      contentTemplate: '「{{title}}」被驳回。原因：{{comment}}',
      enabled: true,
    },
  });

  const tplApprovalRejectedEmail = await prisma.notificationTemplate.upsert({
    where: { key_channel: { key: 'approval_rejected', channel: 'email' } },
    update: {},
    create: {
      key: 'approval_rejected',
      name: '审批驳回（邮件）',
      channel: 'email',
      subject: '【辰航 HR】您的审批被驳回 - {{title}}',
      contentTemplate: '您好：\n\n您发起的「{{title}}」被驳回。\n驳回人：{{rejected_by}}\n原因：{{comment}}\n\n请修改后重新提交。',
      enabled: true,
    },
  });

  console.log(`   ✓ ${7} notification templates seeded`);

  console.log('==> Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
