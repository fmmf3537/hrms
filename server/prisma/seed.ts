// M0-04: database seed | HRMS | 2026-08-23
// 用法：pnpm --filter hrms-server db:seed

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

import { ROLE_PERMISSIONS } from '../src/constants/permissions';
import { encryptConfig } from '../src/services/integration.service';

const prisma = new PrismaClient();

/** V1.2 §3.5.2 必配置化业务规则默认 seed */
const DEFAULT_CONFIGS: Array<{
  category: string;
  key: string;
  value: unknown;
  remark: string;
}> = [
  { category: 'employee_no', key: 'format', value: '{company_code}{year}{seq:4}', remark: '工号格式' },
  { category: 'employee_no', key: 'reuse_after_resign', value: false, remark: '离职工号不复用' },
  { category: 'employee_no', key: 'yearly_reset', value: true, remark: '自然年度重置流水' },
  { category: 'employee_no', key: 'concurrent_strategy', value: 'pg_sequence', remark: '并发策略' },
  { category: 'contract', key: 'warning_days', value: [30, 15, 7], remark: '合同到期预警天数' },
  { category: 'probation', key: 'months', value: 3, remark: '试用期月数' },
  { category: 'probation', key: 'remind_days', value: 15, remark: '转正提前提醒天数' },
  { category: 'archive', key: 'years', value: 5, remark: '离职档案保留年限' },
  {
    category: 'performance',
    key: 'coefficient',
    value: {
      S: 1.5, A: 1.2, B: 1.0, C: 0.8, D: 0.5,
    },
    remark: '绩效系数',
  },
  {
    category: 'salary',
    key: 'fixed_floating_ratio',
    value: {
      高管: 0.6, 部门: 0.7, 技术: 0.8, 生产: 0.75, 职能: 0.85,
    },
    remark: '固浮比',
  },
  {
    category: 'commission',
    key: 'rate',
    value: { 整机: 0.05, 服务: 0.08, 培训: 0.03 },
    remark: '提成比例',
  },
  {
    category: 'travel',
    key: 'allowance',
    value: { 一线城市: { P1: 100, P2: 150 }, 二线城市: { P1: 80, P2: 120 } },
    remark: '差旅补助',
  },
  {
    category: 'leave',
    key: 'annual_days',
    value: { '1-10年': 5, '10-20年': 10, '>20年': 15 },
    remark: '年假额度',
  },
  { category: 'overtime', key: 'monthly_hours_cap', value: 36, remark: '加班月上限小时' },
  {
    category: 'schedule',
    key: 'conflict_rule',
    value: { maxContinuousWorkDays: 6, minRestHours: 12 },
    remark: '排班冲突规则',
  },
  { category: 'hr_attrition', key: 'overtime_ratio_threshold', value: 0.2, remark: '加班费占比预警' },
  { category: 'hr_attrition', key: 'monthly_threshold', value: 0.05, remark: '月度离职率预警' },
  {
    category: 'tax',
    key: 'year_end_bonus_policy',
    value: { mode: 'separate', valid_until: '2027-12-31', auto_fallback: 'merged' },
    remark: '年终奖计税政策',
  },
];

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

  console.log('==> Seeding default encrypted fields (M0.5-3)...');

  // 1) 员工身份证号 — admin/hr/员工本人
  await prisma.encryptedField.upsert({
    where: { tableName_columnName: { tableName: 'employees', columnName: 'id_card' } },
    update: {},
    create: {
      tableName: 'employees',
      columnName: 'id_card',
      encryptionAlgo: 'aes-256-gcm',
      keyVersion: 1,
      accessRoles: ['admin', 'hr', 'self'],
      enabled: true,
      description: '员工身份证号（18 位）— admin/hr 全部可见，本人可见，其他角色 mask',
    },
  });

  // 2) 员工银行卡号 — 仅 admin/hr
  await prisma.encryptedField.upsert({
    where: { tableName_columnName: { tableName: 'employees', columnName: 'bank_card' } },
    update: {},
    create: {
      tableName: 'employees',
      columnName: 'bank_card',
      encryptionAlgo: 'aes-256-gcm',
      keyVersion: 1,
      accessRoles: ['admin', 'hr'],
      enabled: true,
      description: '员工银行卡号 — 仅 admin/hr 可见',
    },
  });

  // 3) 工资单基本工资 — admin/hr
  await prisma.encryptedField.upsert({
    where: { tableName_columnName: { tableName: 'payslips', columnName: 'base_salary' } },
    update: {},
    create: {
      tableName: 'payslips',
      columnName: 'base_salary',
      encryptionAlgo: 'aes-256-gcm',
      keyVersion: 1,
      accessRoles: ['admin', 'hr'],
      enabled: true,
      description: '工资单基本工资 — 仅 admin/hr 可见（员工本人按审计脱敏规则显示 mask）',
    },
  });

  // 4) 工资单奖金 — admin/hr
  await prisma.encryptedField.upsert({
    where: { tableName_columnName: { tableName: 'payslips', columnName: 'bonus' } },
    update: {},
    create: {
      tableName: 'payslips',
      columnName: 'bonus',
      encryptionAlgo: 'aes-256-gcm',
      keyVersion: 1,
      accessRoles: ['admin', 'hr'],
      enabled: true,
      description: '工资单奖金/津贴 — 仅 admin/hr 可见',
    },
  });

  // 5) 员工手机号 — admin/hr/员工本人
  await prisma.encryptedField.upsert({
    where: { tableName_columnName: { tableName: 'employees', columnName: 'phone' } },
    update: {},
    create: {
      tableName: 'employees',
      columnName: 'phone',
      encryptionAlgo: 'aes-256-gcm',
      keyVersion: 1,
      accessRoles: ['admin', 'hr', 'self'],
      enabled: true,
      description: '员工手机号 — admin/hr/本人可见',
    },
  });

  console.log('   ✓ 5 encrypted fields registered');

  console.log('==> Seeding default integrations (M0.5-4)...');

  // 6 个集成默认配置（dev 时 enabled=true 走 mock，prod 由运维配置真实凭证后启用）
  const integrations = [
    {
      code: 'esign',
      name: 'e-签宝',
      type: 'http_api',
      config: { endpoint: 'https://openapi.esign.cn', appId: '', appSecret: '' },
      description: '电子签（合同 / 工资条签署）— 见 docs/e-sign-cost.md',
    },
    {
      code: 'sms',
      name: '短信网关（阿里云/腾讯云）',
      type: 'http_api',
      config: { provider: 'mock', accessKey: '', accessSecret: '', signName: '' },
      description: '短信（验证码 / 紧急提醒）— 替换 M0.5-2 的 console.log mock',
    },
    {
      code: 'email',
      name: 'SMTP 邮件',
      type: 'http_api',
      config: { host: '', port: 587, user: '', password: '', from: 'noreply@chenhang-zhuoyue.local' },
      description: '邮件（合同到期 / 工资条推送）— 替换 M0.5-2 的 console.log mock',
    },
    {
      code: 'llm',
      name: 'LLM 网关（OpenAI 兼容）',
      type: 'http_api',
      config: { provider: 'mock', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini' },
      description: '大语言模型（智能问答 / 算薪校验 / 评分建议）— 见 V1.2 §三.3',
    },
    {
      code: 'ocr',
      name: 'OCR 服务（腾讯云）',
      type: 'http_api',
      config: { provider: 'mock', secretId: '', secretKey: '' },
      description: 'OCR 识别（身份证 / 银行卡 / 资质证书）— V1.2 §四.4.1 M0.5-5 集成',
    },
    {
      code: 'map',
      name: '腾讯地图 API',
      type: 'http_api',
      config: { provider: 'mock', key: '' },
      description: '地图（GPS 反解析地址）— V1.2 §二.3.1 考勤打卡',
    },
  ];

  for (const integ of integrations) {
    const encrypted = encryptConfig(integ.config as Record<string, unknown>);
    await prisma.integration.upsert({
      where: { code: integ.code },
      // 重跑 seed 时同步加密包装（兼容历史明文）
      update: { config: encrypted as never },
      create: {
        code: integ.code,
        name: integ.name,
        type: integ.type,
        description: integ.description,
        enabled: true,
        config: encrypted as never,
      },
    });
  }
  console.log(`   ✓ ${integrations.length} integrations registered (config encrypted)`);

  console.log('==> Seeding default configs (M0.5-6)...');
  const effectiveFrom = new Date('2020-01-01');
  for (const cfg of DEFAULT_CONFIGS) {
    const existing = await prisma.config.findFirst({
      where: { category: cfg.category, key: cfg.key, version: 1 },
    });
    if (!existing) {
      await prisma.config.create({
        data: {
          category: cfg.category,
          key: cfg.key,
          value: cfg.value as never,
          version: 1,
          effectiveFrom,
          effectiveTo: null,
          remark: cfg.remark,
        },
      });
    }
  }
  console.log(`   ✓ ${DEFAULT_CONFIGS.length} config keys ensured`);

  console.log('==> Seeding AI knowledge base (M0.5-5)...');
  try {
    const { seedAiKnowledgeBase } = await import('./seed-ai-knowledge');
    const n = await seedAiKnowledgeBase(prisma);
    console.log(`   ✓ AI knowledge base seeded (${n} docs attempted)`);
  } catch (err) {
    console.warn('   ⚠ AI knowledge base seed skipped/failed:', err instanceof Error ? err.message : err);
  }

  console.log('==> Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
