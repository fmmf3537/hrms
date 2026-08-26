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
  { category: 'certificate', key: 'warning_days', value: 60, remark: '资质证书到期预警天数' },
  { category: 'headcount', key: 'warning_ratio', value: 1.1, remark: '编制预警阈值（在职/编制）' },
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
  { category: 'tax', key: 'year_end_bonus_policy', value: { mode: 'separate', valid_until: '2027-12-31', auto_fallback: 'merged' }, remark: '年终奖计税政策' },
  // M1-A3 入职流程
  {
    category: 'onboarding',
    key: 'required_materials',
    value: ['idCard', 'bankCard', 'degreeCert'],
    remark: '入职必填材料',
  },
  {
    category: 'onboarding',
    key: 'default_role',
    value: 'employee',
    remark: '入职默认角色',
  },
  {
    category: 'onboarding',
    key: 'default_password_pattern',
    value: 'Welcome@{seq4}',
    remark: '入职默认密码模板',
  },
  {
    category: 'onboarding',
    key: 'checklist',
    value: ['设备发放', '工位安排', '导师分配', '培训安排'],
    remark: '入职引导清单模板',
  },
  // M1-A4 转正流程
  {
    category: 'regularization',
    key: 'approval_flow_key',
    value: 'regularization:regularization_approval',
    remark: '转正审批流 flowKey',
  },
  {
    category: 'regularization',
    key: 'salary_effective',
    value: 'next_month',
    remark: '转正薪资生效策略',
  },
  {
    category: 'regularization',
    key: 'approval_nodes',
    value: ['department_leader', 'hr', 'ceo'],
    remark: '转正审批节点',
  },
  // M1-A6 离职流程
  {
    category: 'offboarding',
    key: 'handover_template',
    value: ['工作文档交接', '客户/项目交接', '财务/物资交接', '系统账号交接', '未了事项说明'],
    remark: '工作交接清单模板',
  },
  {
    category: 'offboarding',
    key: 'approval_flow_key',
    value: 'offboarding:offboarding_approval',
    remark: '离职审批流 flowKey',
  },
  {
    category: 'offboarding',
    key: 'account_disable_strategy',
    value: 'on_resignation_date',
    remark: '账号禁用时机',
  },
  {
    category: 'offboarding',
    key: 'certificate_number_format',
    value: 'OFFBOARD-{year}{seq:4}',
    remark: '离职证明编号格式',
  },
  {
    category: 'offboarding',
    key: 'certificate_template',
    value: '/templates/offboarding-certificate.html',
    remark: '离职证明模板路径',
  },
  {
    category: 'offboarding',
    key: 'archive_access_after_1y',
    value: ['admin', 'hr'],
    remark: '离职1年后档案访问角色',
  },
  {
    category: 'offboarding',
    key: 'approval_nodes',
    value: ['hr', 'ceo'],
    remark: '离职审批节点',
  },
  // M1-A5 调动流程
  {
    category: 'transfer',
    key: 'approval_flow_key',
    value: 'transfer:transfer_approval',
    remark: '调动审批流 flowKey',
  },
  {
    category: 'transfer',
    key: 'approval_nodes',
    value: ['from_dept_leader', 'to_dept_leader', 'hr', 'ceo'],
    remark: '调动 4 级审批节点',
  },
  {
    category: 'transfer',
    key: 'salary_effective',
    value: 'immediate',
    remark: '调动薪资生效策略',
  },
  {
    category: 'transfer',
    key: 'requires_salary_for_promote',
    value: true,
    remark: '晋升/降职必填新薪资',
  },
  {
    category: 'transfer',
    key: 'max_future_days',
    value: 90,
    remark: '未来生效日最大天数',
  },
  // M1-A7 合同管理
  {
    category: 'contract',
    key: 'warning_days',
    value: [30, 15, 7],
    remark: '合同到期前 N 天预警',
  },
  {
    category: 'contract',
    key: 'esign_provider',
    value: 'mock',
    remark: '电子签服务方（mock / esignbao）',
  },
  {
    category: 'contract',
    key: 'esign_api_key',
    value: 'mock-api-key',
    remark: 'e-签宝 API key（加密存储）',
  },
  {
    category: 'contract',
    key: 'esign_webhook_secret',
    value: 'mock-webhook-secret',
    remark: 'e-签宝 webhook 验签密钥',
  },
  {
    category: 'contract',
    key: 'attachment_max_size',
    value: 10485760,
    remark: '附件最大 10MB',
  },
  {
    category: 'contract',
    key: 'attachment_allowed_types',
    value: ['application/pdf', 'image/jpeg', 'image/png'],
    remark: '允许的附件 MIME',
  },
  {
    category: 'contract',
    key: 'approval_flow_key',
    value: 'contract:contract_approval',
    remark: '合同审批流 flowKey',
  },
  {
    category: 'contract',
    key: 'templates',
    value: {
      formal: '/templates/contract-formal.html',
      intern: '/templates/contract-intern.html',
      consultant: '/templates/contract-consultant.html',
      labor: '/templates/contract-labor.html',
      nda: '/templates/contract-nda.html',
    },
    remark: '5 类合同模板路径',
  },
  {
    category: 'contract',
    key: 'expire_check_days',
    value: 7,
    remark: '自动流转 expired 检查窗口',
  },
  {
    category: 'contract',
    key: 'test_mode',
    value: true,
    remark: 'mock 模式开关',
  },
  {
    category: 'shift',
    key: 'types',
    value: ['standard', 'comprehensive', 'flexible'],
    remark: '3 类工时制枚举',
  },
  {
    category: 'shift',
    key: 'default_work_hours',
    value: 8,
    remark: '标准工时默认小时数',
  },
  {
    category: 'shift',
    key: 'break_duration',
    value: 90,
    remark: '午休默认时长（分钟）',
  },
  {
    category: 'shift',
    key: 'flex_minutes',
    value: 30,
    remark: '弹性时间（分钟）',
  },
  {
    category: 'shift',
    key: 'assignment_strategy',
    value: 'department',
    remark: '默认排班策略',
  },
  {
    category: 'shift',
    key: 'max_consecutive_days',
    value: 6,
    remark: '最大连续工作天数',
  },
  {
    category: 'shift',
    key: 'min_rest_hours',
    value: 12,
    remark: '最小休息间隔小时数',
  },
  {
    category: 'shift',
    key: 'late_threshold',
    value: 30,
    remark: '迟到阈值（分钟，B2 用）',
  },
  {
    category: 'shift',
    key: 'early_leave_threshold',
    value: 30,
    remark: '早退阈值（分钟，B2 用）',
  },
  {
    category: 'attendance',
    key: 'wifi_ssids',
    value: ['Office-WiFi-XACH', 'Office-WiFi-XACX'],
    remark: 'WiFi SSID 白名单',
  },
  {
    category: 'attendance',
    key: 'gps_max_distance',
    value: 100,
    remark: 'GPS 打卡最大距离（米）',
  },
  {
    category: 'attendance',
    key: 'late_threshold',
    value: 30,
    remark: '迟到阈值（分钟）',
  },
  {
    category: 'attendance',
    key: 'early_leave_threshold',
    value: 30,
    remark: '早退阈值（分钟）',
  },
  {
    category: 'attendance',
    key: 'missing_threshold',
    value: 4,
    remark: '缺卡判定阈值（小时）',
  },
  {
    category: 'attendance',
    key: 'import_formats',
    value: ['deli-e-plus-v1'],
    remark: '导入格式版本',
  },
  {
    category: 'attendance',
    key: 'manual_clock_flow_key',
    value: 'attendance:manual_clock_approval',
    remark: '补卡审批流 key',
  },
  {
    category: 'attendance',
    key: 'monthly_max_manual',
    value: 3,
    remark: '每月补卡上限',
  },
  {
    category: 'leave',
    key: 'types',
    value: ['annual', 'sick', 'personal', 'compensatory', 'marriage', 'maternity', 'paternity', 'bereavement'],
    remark: '8 类假期类型',
  },
  {
    category: 'leave',
    key: 'annual_leave_rules',
    value: { '1-10': 5, '10-20': 10, '>20': 15 },
    remark: '按工龄的年假天数规则',
  },
  {
    category: 'leave',
    key: 'comp_leave_validity_months',
    value: 6,
    remark: '调休有效期（月）',
  },
  {
    category: 'leave',
    key: 'approval_flow_short',
    value: 'leave:leave_short',
    remark: '≤3 天审批流',
  },
  {
    category: 'leave',
    key: 'approval_flow_long',
    value: 'leave:leave_long',
    remark: '>3 天审批流',
  },
  {
    category: 'leave',
    key: 'max_consecutive_days',
    value: 30,
    remark: '最长连续请假天数',
  },
  {
    category: 'leave',
    key: 'min_advance_days_annual',
    value: 7,
    remark: '年假最少提前申请天数',
  },
  {
    category: 'leave',
    key: 'workday_exclude_weekends',
    value: true,
    remark: '工作日计算排除周末',
  },
  {
    category: 'leave',
    key: 'sick_leave_max_days',
    value: 90,
    remark: '病假最长天数',
  },
  {
    category: 'overtime',
    key: 'max_daily_hours',
    value: 3,
    remark: '单日加班上限（小时）',
  },
  {
    category: 'overtime',
    key: 'max_monthly_hours',
    value: 36,
    remark: '单月加班上限（小时）',
  },
  {
    category: 'overtime',
    key: 'pay_multiplier_weekday',
    value: 1.5,
    remark: '工作日加班费倍数',
  },
  {
    category: 'overtime',
    key: 'pay_multiplier_weekend',
    value: 2.0,
    remark: '周末加班费倍数',
  },
  {
    category: 'overtime',
    key: 'pay_multiplier_holiday',
    value: 3.0,
    remark: '法定假日加班费倍数',
  },
  {
    category: 'overtime',
    key: 'approval_flow_key',
    value: 'overtime:overtime_default',
    remark: '加班审批流 key',
  },
  {
    category: 'overtime',
    key: 'min_advance_hours',
    value: 4,
    remark: '最少提前申请小时数',
  },
  {
    category: 'trip',
    key: 'allowance_standard',
    value: 200,
    remark: '基础差旅补助标准（元/天）',
  },
  {
    category: 'trip',
    key: 'city_tier_rates',
    value: { tier1: 1.5, tier2: 1.2, tier3: 1.0 },
    remark: '城市分级系数',
  },
  {
    category: 'trip',
    key: 'level_tier_rates',
    value: { executive: 1.5, manager: 1.2, employee: 1.0 },
    remark: '职级系数',
  },
  {
    category: 'trip',
    key: 'city_tier_mapping',
    value: {
      北京: 'tier1', 上海: 'tier1', 深圳: 'tier1', 广州: 'tier1',
      成都: 'tier2', 杭州: 'tier2', 南京: 'tier2',
      武汉: 'tier3', 西安: 'tier3',
    },
    remark: '城市 → tier 映射',
  },
  {
    category: 'trip',
    key: 'approval_flow_key',
    value: 'business_trip:trip_default',
    remark: '出差审批流 key',
  },
  {
    category: 'trip',
    key: 'min_advance_days',
    value: 3,
    remark: '最少提前申请天数',
  },
  {
    category: 'trip',
    key: 'weekend_inclusive',
    value: false,
    remark: '出差天数是否含周末',
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

  console.log('==> Seeding departments + employees (M1-A1+A2)...');
  const xach = companies.find((c) => c.code === 'XACH')!;
  const deptDefs = [
    { code: 'PEDU', name: '产教服务中心', headcount: 30, order: 1 },
    { code: 'HR', name: '人力资源部', headcount: 8, order: 2 },
    { code: 'FIN', name: '财务部', headcount: 6, order: 3 },
    { code: 'TECH', name: '技术部', headcount: 20, order: 4 },
  ];
  const seededDepts = [];
  for (const d of deptDefs) {
    const existing = await prisma.department.findFirst({
      where: { companyId: xach.id, code: d.code },
    });
    if (existing) {
      seededDepts.push(existing);
    } else {
      seededDepts.push(await prisma.department.create({
        data: {
          companyId: xach.id,
          code: d.code,
          name: d.name,
          headcount: d.headcount,
          order: d.order,
          status: 'active',
          createdBy: admin.id,
        },
      }));
    }
  }
  console.log(`   ✓ ${seededDepts.length} departments`);

  const hrDept = seededDepts.find((d) => d.code === 'HR')!;
  const techDept = seededDepts.find((d) => d.code === 'TECH')!;
  const year = new Date().getFullYear();
  const empSeeds: Array<{
    employeeNo: string;
    name: string;
    departmentId: string;
    userId?: string;
    status: string;
  }> = [
    {
      employeeNo: `XACH${year}0001`,
      name: '系统管理员',
      departmentId: hrDept.id,
      userId: admin.id,
      status: 'active',
    },
    {
      employeeNo: `XACH${year}0002`,
      name: 'HR 专员',
      departmentId: hrDept.id,
      status: 'active',
    },
    {
      employeeNo: `XACH${year}0003`,
      name: '部门负责人',
      departmentId: techDept.id,
      status: 'active',
    },
    {
      employeeNo: `XACH${year}0004`,
      name: '高管',
      departmentId: hrDept.id,
      status: 'active',
    },
    {
      employeeNo: `XACH${year}0005`,
      name: '普通员工',
      departmentId: techDept.id,
      status: 'probation',
    },
  ];

  let empCreated = 0;
  for (const e of empSeeds) {
    const exists = await prisma.employee.findUnique({ where: { employeeNo: e.employeeNo } });
    if (!exists) {
      await prisma.employee.create({
        data: {
          employeeNo: e.employeeNo,
          name: e.name,
          companyId: xach.id,
          departmentId: e.departmentId,
          userId: e.userId,
          status: e.status,
          hireDate: new Date(`${year}-01-01`),
          contractType: 'formal',
          createdBy: admin.id,
        },
      });
      empCreated += 1;
    }
  }
  console.log(`   ✓ ${empCreated} employees created (idempotent)`);

  console.log('==> Seeding onboarding demo (M1-A3)...');
  const existingOb = await prisma.onboardingRecord.findFirst({
    where: { name: '测试新员工', companyId: xach.id, status: 'draft' },
  });
  if (!existingOb) {
    await prisma.onboardingRecord.create({
      data: {
        name: '测试新员工',
        gender: 'male',
        email: 'onboarding.demo@example.com',
        companyId: xach.id,
        departmentId: techDept.id,
        hireDate: new Date(`${year}-09-01`),
        contractType: 'formal',
        probationMonths: 3,
        materialsChecklist: {
          idCard: true, bankCard: true, degreeCert: true,
        },
        status: 'draft',
        createdBy: admin.id,
        tasks: {
          create: [
            { name: '设备发放', category: 'equipment', status: 'pending' },
            { name: '工位安排', category: 'workspace', status: 'pending' },
            { name: '导师分配', category: 'mentor', status: 'pending' },
            { name: '培训安排', category: 'training', status: 'pending' },
          ],
        },
      },
    });
    console.log('   ✓ 1 onboarding record + 4 tasks');
  } else {
    console.log('   ✓ onboarding demo already exists (skip)');
  }

  console.log('==> Seeding regularization demo (M1-A4)...');
  const probationEmp = await prisma.employee.findFirst({
    where: {
      companyId: xach.id,
      status: 'probation',
      deletedAt: null,
    },
  });
  if (probationEmp) {
    const existingReg = await prisma.regularizationRecord.findFirst({
      where: {
        employeeId: probationEmp.id,
        status: { notIn: ['cancelled', 'rejected'] },
      },
    });
    if (!existingReg) {
      const end = new Date(probationEmp.hireDate);
      end.setMonth(end.getMonth() + 3);
      await prisma.regularizationRecord.create({
        data: {
          employeeId: probationEmp.id,
          hireDate: probationEmp.hireDate,
          probationEndDate: end,
          selfEvaluation: '试用期内完成岗位培训与项目交付，申请转正。',
          status: 'draft',
          createdBy: admin.id,
        },
      });
      console.log('   ✓ 1 regularization record (draft)');
    } else {
      console.log('   ✓ regularization demo already exists (skip)');
    }
  } else {
    console.log('   ✓ no probation employee, skip regularization seed');
  }

  console.log('==> Seeding offboarding demo (M1-A6)...');
  const activeEmp = await prisma.employee.findFirst({
    where: {
      companyId: xach.id,
      status: 'active',
      deletedAt: null,
      employeeNo: { not: `XACH${year}0001` },
    },
  });
  if (activeEmp) {
    const existingOff = await prisma.offboardingRecord.findFirst({
      where: {
        employeeId: activeEmp.id,
        status: { notIn: ['rejected', 'cancelled'] },
      },
    });
    if (!existingOff) {
      await prisma.offboardingRecord.create({
        data: {
          employeeId: activeEmp.id,
          resignationType: 'employee_initiated',
          reason: '演示：个人发展原因申请离职',
          lastWorkingDate: new Date(`${year}-12-31`),
          status: 'handover_pending',
          archiveRetentionYears: 5,
          createdBy: admin.id,
          tasks: {
            create: [
              { name: '工作文档交接', category: 'document', status: 'pending' },
              { name: '客户/项目交接', category: 'client', status: 'pending' },
              { name: '财务/物资交接', category: 'finance', status: 'pending' },
              { name: '系统账号交接', category: 'account', status: 'pending' },
              { name: '未了事项说明', category: 'misc', status: 'pending' },
            ],
          },
        },
      });
      console.log('   ✓ 1 offboarding record + 5 handover tasks');
    } else {
      console.log('   ✓ offboarding demo already exists (skip)');
    }
  } else {
    console.log('   ✓ no active employee, skip offboarding seed');
  }

  console.log('==> Seeding transfer demo (M1-A5)...');
  const transferEmp = await prisma.employee.findFirst({
    where: {
      companyId: xach.id,
      status: 'active',
      deletedAt: null,
      employeeNo: `XACH${year}0003`,
    },
  });
  const finDept = seededDepts.find((d) => d.code === 'FIN');
  if (transferEmp && finDept && techDept) {
    const existingTransfer = await prisma.transferRecord.findFirst({
      where: {
        employeeId: transferEmp.id,
        status: { notIn: ['rejected', 'cancelled'] },
      },
    });
    if (!existingTransfer) {
      await prisma.transferRecord.create({
        data: {
          employeeId: transferEmp.id,
          transferType: 'transfer',
          reason: '演示：跨部门平调',
          fromCompanyId: xach.id,
          fromDeptId: techDept.id,
          fromPosition: '部门负责人',
          toCompanyId: xach.id,
          toDeptId: finDept.id,
          toPosition: '财务专员',
          effectiveDate: new Date(`${year}-09-01`),
          status: 'draft',
          createdBy: admin.id,
        },
      });
      console.log('   ✓ 1 transfer record (draft)');
    } else {
      console.log('   ✓ transfer demo already exists (skip)');
    }
  } else {
    console.log('   ✓ no suitable employee/dept, skip transfer seed');
  }

  console.log('==> Seeding contract demo (M1-A7)...');
  const contractEmp = await prisma.employee.findFirst({
    where: {
      companyId: xach.id,
      status: 'active',
      deletedAt: null,
      employeeNo: `XACH${year}0002`,
    },
  });
  if (contractEmp) {
    const existingContract = await prisma.contractRecord.findFirst({
      where: {
        employeeId: contractEmp.id,
        status: { notIn: ['cancelled', 'expired'] },
        contractType: 'formal',
      },
    });
    if (!existingContract) {
      await prisma.contractRecord.create({
        data: {
          employeeId: contractEmp.id,
          contractNo: `CT-FO-${year}0001`,
          contractType: 'formal',
          title: `${contractEmp.name}劳动合同`,
          startDate: new Date(`${year}-09-01`),
          endDate: new Date(`${year + 1}-08-31`),
          templateKey: 'formal',
          position: 'HR 专员',
          attachments: [{
            name: '身份证扫描件.pdf',
            url: 'https://oss.example.com/demo/id-card.pdf',
            type: 'application/pdf',
            size: 2048,
            uploadedAt: new Date().toISOString(),
          }],
          signatories: [
            { name: contractEmp.name, role: 'employee', signed: false },
            { name: 'HR 管理员', role: 'hr', signed: false },
          ],
          esignProvider: 'mock',
          status: 'draft',
          createdBy: admin.id,
        },
      });
      console.log('   ✓ 1 contract record (draft)');
    } else {
      console.log('   ✓ contract demo already exists (skip)');
    }
  } else {
    console.log('   ✓ no suitable employee, skip contract seed');
  }

  console.log('==> Seeding shift demo (M2-B1)...');
  const hrEmployee = await prisma.employee.findUnique({
    where: { employeeNo: `XACH${year}0002` },
  });
  if (hrEmployee) {
    const stdExists = await prisma.shiftTemplate.findFirst({
      where: { code: 'STD-DAY', companyId: xach.id },
    });
    if (!stdExists) {
      const stdShift = await prisma.shiftTemplate.create({
        data: {
          code: 'STD-DAY',
          name: '标准白班',
          shiftType: 'standard',
          startTime: '09:00',
          endTime: '18:00',
          breakStart: '12:00',
          breakEnd: '13:30',
          breakDuration: 90,
          workHours: 8,
          flexMinutes: 30,
          effectiveFrom: new Date(`${year}-01-01`),
          companyId: xach.id,
          status: 'active',
          description: '标准 9:00-18:00 白班',
          createdBy: admin.id,
        },
      });
      await prisma.shiftTemplate.create({
        data: {
          code: 'COMP-DAY',
          name: '综合白班',
          shiftType: 'comprehensive',
          startTime: '08:00',
          endTime: '17:00',
          breakStart: '12:00',
          breakEnd: '13:00',
          breakDuration: 60,
          workHours: 8,
          flexMinutes: 30,
          effectiveFrom: new Date(`${year}-01-01`),
          companyId: xach.id,
          status: 'active',
          description: '综合工时白班',
          createdBy: admin.id,
        },
      });
      await prisma.shiftTemplate.create({
        data: {
          code: 'FLEX-DAY',
          name: '弹性班',
          shiftType: 'flexible',
          startTime: '10:00',
          endTime: '19:00',
          breakStart: '13:00',
          breakEnd: '14:00',
          breakDuration: 60,
          workHours: 8,
          flexMinutes: 30,
          effectiveFrom: new Date(`${year}-01-01`),
          companyId: xach.id,
          status: 'draft',
          description: '弹性 10:00-19:00',
          createdBy: admin.id,
        },
      });
      await prisma.shiftAssignment.create({
        data: {
          shiftId: stdShift.id,
          assigneeType: 'employee',
          employeeId: hrEmployee.id,
          effectiveFrom: new Date(`${year}-09-01`),
          effectiveTo: new Date(`${year}-09-30`),
          remark: 'M2-B1 demo 排班',
          createdBy: admin.id,
        },
      });
      console.log('   ✓ 3 shift templates + 1 assignment');
    } else {
      console.log('   ✓ shift demo already exists (skip)');
    }
  } else {
    console.log('   ✓ no HR employee, skip shift seed');
  }

  console.log('==> Seeding attendance demo (M2-B2)...');
  const hrEmp = await prisma.employee.findUnique({
    where: { employeeNo: `XACH${year}0002` },
  });
  const techEmp = await prisma.employee.findUnique({
    where: { employeeNo: `XACH${year}0005` },
  });
  if (hrEmp) {
    const attExists = await prisma.attendanceRecord.findFirst({
      where: { employeeId: hrEmp.id, source: 'app' },
    });
    if (!attExists) {
      await prisma.attendanceRecord.create({
        data: {
          employeeId: hrEmp.id,
          companyId: hrEmp.companyId,
          departmentId: hrEmp.departmentId,
          clockInTime: new Date(`${year}-08-28T09:00:00.000Z`),
          clockOutTime: new Date(`${year}-08-28T18:00:00.000Z`),
          clockType: 'wifi',
          source: 'app',
          wifiSsid: 'Office-WiFi-XACH',
          isLate: false,
          lateMinutes: 0,
          status: 'approved',
          createdBy: admin.id,
        },
      });
      await prisma.attendanceRecord.create({
        data: {
          employeeId: hrEmp.id,
          companyId: hrEmp.companyId,
          departmentId: hrEmp.departmentId,
          clockInTime: new Date(`${year}-08-27T09:15:00.000Z`),
          clockOutTime: new Date(`${year}-08-27T18:00:00.000Z`),
          clockType: 'gps',
          source: 'app',
          gpsLat: 34.3416,
          gpsLng: 108.9398,
          isLate: true,
          lateMinutes: 15,
          status: 'approved',
          createdBy: admin.id,
        },
      });
      await prisma.attendanceRecord.create({
        data: {
          employeeId: hrEmp.id,
          companyId: hrEmp.companyId,
          departmentId: hrEmp.departmentId,
          clockInTime: new Date(`${year}-08-26T09:00:00.000Z`),
          clockType: 'manual',
          source: 'admin',
          isManual: true,
          manualReason: '外出办事忘记打卡，申请补卡',
          status: 'pending',
          createdBy: admin.id,
        },
      });
      console.log('   ✓ 3 attendance records');
    } else {
      console.log('   ✓ attendance demo already exists (skip)');
    }
  } else if (!techEmp) {
    console.log('   ✓ no employee, skip attendance seed');
  }

  console.log('==> Seeding leave demo (M2-B3)...');
  if (hrEmp) {
    const leaveExists = await prisma.leaveRequest.findFirst({
      where: { employeeId: hrEmp.id, leaveType: 'annual', status: 'draft' },
    });
    if (!leaveExists) {
      await prisma.leaveRequest.create({
        data: {
          employeeId: hrEmp.id,
          companyId: hrEmp.companyId,
          departmentId: hrEmp.departmentId!,
          leaveType: 'annual',
          startDate: new Date(`${year}-10-08`),
          endDate: new Date(`${year}-10-10`),
          totalDays: 3,
          reason: 'draft 年假申请 demo',
          status: 'draft',
          createdBy: admin.id,
        },
      });
      await prisma.leaveRequest.create({
        data: {
          employeeId: hrEmp.id,
          companyId: hrEmp.companyId,
          departmentId: hrEmp.departmentId!,
          leaveType: 'personal',
          startDate: new Date(`${year}-10-15`),
          endDate: new Date(`${year}-10-16`),
          totalDays: 2,
          reason: '事假 demo',
          status: 'submitted',
          createdBy: admin.id,
        },
      });
      await prisma.leaveRequest.create({
        data: {
          employeeId: hrEmp.id,
          companyId: hrEmp.companyId,
          departmentId: hrEmp.departmentId!,
          leaveType: 'sick',
          startDate: new Date(`${year}-08-20`),
          endDate: new Date(`${year}-08-21`),
          totalDays: 2,
          reason: '病假 demo',
          status: 'approved',
          approvedAt: new Date(),
          createdBy: admin.id,
        },
      });
      console.log('   ✓ 3 leave requests');
    } else {
      console.log('   ✓ leave demo already exists (skip)');
    }
  }

  console.log('==> Seeding overtime demo (M2-B4)...');
  if (hrEmp) {
    const overtimeExists = await prisma.overtimeRequest.findFirst({
      where: { employeeId: hrEmp.id, status: 'draft' },
    });
    if (!overtimeExists) {
      await prisma.overtimeRequest.create({
        data: {
          employeeId: hrEmp.id,
          companyId: hrEmp.companyId,
          departmentId: hrEmp.departmentId!,
          startTime: new Date(`${year}-09-10T19:00:00.000Z`),
          endTime: new Date(`${year}-09-10T21:00:00.000Z`),
          totalHours: 2,
          overtimeType: 'weekday',
          compensationType: 'pay',
          overtimePay: 172.41,
          reason: 'draft 工作日加班 pay demo',
          status: 'draft',
          createdBy: admin.id,
        },
      });
      await prisma.overtimeRequest.create({
        data: {
          employeeId: hrEmp.id,
          companyId: hrEmp.companyId,
          departmentId: hrEmp.departmentId!,
          startTime: new Date(`${year}-09-12T10:00:00.000Z`),
          endTime: new Date(`${year}-09-12T12:00:00.000Z`),
          totalHours: 2,
          overtimeType: 'weekend',
          compensationType: 'comp',
          compDays: 0.25,
          reason: 'submitted 周末加班 comp demo',
          status: 'submitted',
          createdBy: admin.id,
        },
      });
      await prisma.overtimeRequest.create({
        data: {
          employeeId: hrEmp.id,
          companyId: hrEmp.companyId,
          departmentId: hrEmp.departmentId!,
          startTime: new Date(`${year}-08-25T19:00:00.000Z`),
          endTime: new Date(`${year}-08-25T21:00:00.000Z`),
          totalHours: 2,
          overtimeType: 'weekday',
          compensationType: 'pay',
          overtimePay: 172.41,
          reason: 'approved 工作日加班 pay demo',
          status: 'approved',
          approvedAt: new Date(),
          createdBy: admin.id,
        },
      });
      console.log('   ✓ 3 overtime requests');
    } else {
      console.log('   ✓ overtime demo already exists (skip)');
    }
  }

  console.log('==> Seeding business trip demo (M2-B5)...');
  if (hrEmp) {
    const tripExists = await prisma.businessTrip.findFirst({
      where: { employeeId: hrEmp.id, destination: '北京', status: 'draft' },
    });
    if (!tripExists) {
      await prisma.businessTrip.create({
        data: {
          employeeId: hrEmp.id,
          companyId: hrEmp.companyId,
          departmentId: hrEmp.departmentId!,
          destination: '北京',
          startDate: new Date(`${year}-10-08`),
          endDate: new Date(`${year}-10-10`),
          totalDays: 3,
          reason: 'draft 北京出差 demo',
          allowanceAmount: 900,
          cityTier: 'tier1',
          levelRate: 1.0,
          status: 'draft',
          createdBy: admin.id,
        },
      });
      await prisma.businessTrip.create({
        data: {
          employeeId: hrEmp.id,
          companyId: hrEmp.companyId,
          departmentId: hrEmp.departmentId!,
          destination: '上海',
          startDate: new Date(`${year}-10-15`),
          endDate: new Date(`${year}-10-16`),
          totalDays: 2,
          reason: 'submitted 上海出差 demo',
          allowanceAmount: 480,
          cityTier: 'tier1',
          levelRate: 1.2,
          status: 'submitted',
          createdBy: admin.id,
        },
      });
      await prisma.businessTrip.create({
        data: {
          employeeId: hrEmp.id,
          companyId: hrEmp.companyId,
          departmentId: hrEmp.departmentId!,
          destination: '成都',
          startDate: new Date(`${year}-09-08`),
          endDate: new Date(`${year}-09-14`),
          totalDays: 5,
          reason: 'approved 成都出差 demo',
          allowanceAmount: 1200,
          cityTier: 'tier2',
          levelRate: 1.0,
          status: 'approved',
          approvedAt: new Date(),
          createdBy: admin.id,
        },
      });
      console.log('   ✓ 3 business trips');
    } else {
      console.log('   ✓ business trip demo already exists (skip)');
    }
  }

  console.log('==> Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
