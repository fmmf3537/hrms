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
  {
    category: 'summary',
    key: 'auto_generate_day',
    value: 1,
    remark: '每月自动生成日（B6 不实现 BullMQ 调度）',
  },
  {
    category: 'summary',
    key: 'employee_confirm_deadline',
    value: 3,
    remark: '员工确认截止日（每月第 N 日前）',
  },
  {
    category: 'summary',
    key: 'hr_lock_day',
    value: 5,
    remark: 'HR 锁定日（每月第 N 日）',
  },
  {
    category: 'summary',
    key: 'default_confirm_strategy',
    value: 'auto_confirm',
    remark: '逾期确认策略 auto_confirm / manual_only',
  },
  {
    category: 'summary',
    key: 'work_days_per_month',
    value: 21.75,
    remark: '月平均工作日（劳动法）',
  },
  {
    category: 'performance',
    key: 'cycle.types',
    value: ['monthly', 'quarterly', 'yearly'],
    remark: '考核周期类型白名单',
  },
  {
    category: 'performance',
    key: 'cycle.advance_days',
    value: 5,
    remark: '提前 N 天可创建下个周期',
  },
  {
    category: 'performance',
    key: 'indicator.types',
    value: ['KPI', 'OKR', 'BSC', '360'],
    remark: '指标类型白名单',
  },
  {
    category: 'performance',
    key: 'indicator.max_weight',
    value: 100,
    remark: '单指标最大权重',
  },
  {
    category: 'performance',
    key: 'scheme.applicable_scope',
    value: ['company', 'department', 'position'],
    remark: '方案适用范围',
  },
  {
    category: 'performance',
    key: 'scheme.clone_strategy',
    value: 'deep',
    remark: '方案复制策略',
  },
  {
    category: 'performance',
    key: 'coefficient.grades',
    value: ['S', 'A', 'B', 'C', 'D'],
    remark: '绩效等级白名单',
  },
  {
    category: 'performance',
    key: 'coefficient.default',
    value: { S: 1.5, A: 1.2, B: 1.0, C: 0.8, D: 0.5 },
    remark: '默认等级系数',
  },
  {
    category: 'performance',
    key: 'coefficient.max_history_versions',
    value: 12,
    remark: '系数历史版本保留数',
  },
  {
    category: 'performance',
    key: 'grade.distribution',
    value: { S: 0.1, A: 0.2, B: 0.5, C: 0.15, D: 0.05 },
    remark: '等级比例建议（D3 校验）',
  },
  {
    category: 'performance',
    key: 'ai.suggestion_template_key',
    value: 'performance_ai_suggestion',
    remark: 'AI 评分建议模板 key（D2 复用）',
  },
  {
    category: 'performance',
    key: 'calibration.threshold',
    value: 0.05,
    remark: '校准阈值（D3 校验）',
  },
  {
    category: 'performance',
    key: 'cycle.create_day',
    value: 25,
    remark: '每月创建考核记录日',
  },
  {
    category: 'performance',
    key: 'cycle.self_deadline',
    value: 25,
    remark: '自评截止日',
  },
  {
    category: 'performance',
    key: 'cycle.manager_deadline',
    value: 27,
    remark: '上级评分截止日',
  },
  {
    category: 'performance',
    key: 'cycle.calibrate_deadline',
    value: 28,
    remark: '部门校准截止日',
  },
  {
    category: 'performance',
    key: 'cycle.hr_deadline',
    value: 29,
    remark: 'HR 汇总截止日',
  },
  {
    category: 'performance',
    key: 'cycle.ceo_deadline',
    value: 30,
    remark: '总经理审批截止日',
  },
  {
    category: 'performance',
    key: 'cycle.archive_day',
    value: 1,
    remark: '次月归档日',
  },
  {
    category: 'performance',
    key: 'ai.suggestion_count',
    value: 3,
    remark: 'AI 建议条数',
  },
  {
    category: 'performance',
    key: 'ai.suggestion_history_months',
    value: 6,
    remark: 'AI 建议历史保留月数',
  },
  {
    category: 'performance',
    key: 'ai.input_template_key',
    value: 'performance_ai_suggestion',
    remark: 'AI 输入模板 key',
  },
  {
    category: 'performance',
    key: 'ai.fallback_strategy',
    value: 'mock',
    remark: 'AI 失败 fallback（mock / error）',
  },
  {
    category: 'performance',
    key: 'score.min',
    value: 0,
    remark: '分数最小值',
  },
  {
    category: 'performance',
    key: 'score.max',
    value: 100,
    remark: '分数最大值',
  },
  {
    category: 'performance',
    key: 'score.weight_tolerance',
    value: 0.01,
    remark: '权重和误差容忍',
  },
  {
    category: 'performance',
    key: 'approval.flow_keys',
    value: [
      'performance:self_submit',
      'performance:manager_score',
      'performance:dept_calibrate',
      'performance:hr_summary',
      'performance:ceo_approve',
    ],
    remark: '绩效 5 级审批 flowKey',
  },
  {
    category: 'performance',
    key: 'archive.required_final_grade',
    value: true,
    remark: '归档前必须有 finalGrade',
  },
  {
    category: 'performance',
    key: 'grade.thresholds',
    value: { S: 90, A: 80, B: 70, C: 60, D: 0 },
    remark: 'D3 等级判定阈值',
  },
  {
    category: 'performance',
    key: 'grade.calibration_strategy',
    value: 'warn_only',
    remark: '校准策略 warn_only / force（D3 仅 warn_only）',
  },
  {
    category: 'performance',
    key: 'grade.batch_size',
    value: 100,
    remark: '批量等级判定上限',
  },
  {
    category: 'performance',
    key: 'calibration.ratio_tolerance',
    value: 0.02,
    remark: '比例容差 ±2%',
  },
  {
    category: 'performance',
    key: 'payout.mode',
    value: 'direct',
    remark: 'D4 兑现模式 direct / pool',
  },
  {
    category: 'performance',
    key: 'payout.prepay_rate',
    value: 0.5,
    remark: 'D4 季度前预支比例',
  },
  {
    category: 'performance',
    key: 'payout.prepay.months_per_quarter',
    value: 2,
    remark: 'D4 季度前预支月数',
  },
  {
    category: 'performance',
    key: 'payout.pool.min_members',
    value: 5,
    remark: 'D4 部门池最小成员数',
  },
  {
    category: 'performance',
    key: 'payout.direct.excluded_grades',
    value: ['D'],
    remark: 'D4 直乘模式排除等级',
  },
  {
    category: 'performance',
    key: 'payout.batch_size',
    value: 200,
    remark: 'D4 批量计算上限',
  },
  {
    category: 'performance',
    key: 'payout.dept_coefficient_default',
    value: 1.0,
    remark: 'D4 部门绩效系数默认',
  },
  {
    category: 'performance',
    key: 'payout.settle.trigger_cycle_status',
    value: ['closed', 'archived'],
    remark: 'D4 清算触发周期状态',
  },
  {
    category: 'performance',
    key: 'sales.commission.default_rate',
    value: 0.05,
    remark: 'D5 默认提成比例（5%）',
  },
  {
    category: 'performance',
    key: 'sales.commission.rate_tiers',
    value: { product: 0.05, service: 0.08, training: 0.03 },
    remark: 'D5 产品/服务/培训差异化比例',
  },
  {
    category: 'performance',
    key: 'sales.commission.target_completion_bonus',
    value: { threshold: 1.2, bonus_rate: 0.2 },
    remark: 'D5 目标完成率 >120% 上浮 20%（D5 暂不启用）',
  },
  {
    category: 'performance',
    key: 'sales.commission.calculation_strategy',
    value: 'auto_on_confirm',
    remark: 'D5 财务确认后自动计算',
  },
  {
    category: 'performance',
    key: 'sales.commission.batch_size',
    value: 200,
    remark: 'D5 批量计算上限',
  },
  {
    category: 'performance',
    key: 'sales.commission.target_period',
    value: 'monthly',
    remark: 'D5 提成发放周期',
  },
  {
    category: 'performance',
    key: 'sales.commission.payment_lock_days',
    value: 7,
    remark: 'D5 财务确认后锁定期（D5 暂不启用）',
  },
  {
    category: 'performance',
    key: 'sales.payment.auto_confirm',
    value: false,
    remark: 'D5 是否自动确认（强制 false，财务手动）',
  },
  {
    category: 'performance',
    key: 'salary_adjustment.evaluation_quarters',
    value: 4,
    remark: 'D6 调薪参考季度数',
  },
  {
    category: 'performance',
    key: 'salary_adjustment.s_threshold',
    value: 0.5,
    remark: 'D6 S/A 比例阈值',
  },
  {
    category: 'performance',
    key: 'salary_adjustment.s_adjustment',
    value: 0.1,
    remark: 'D6 S 档调薪比例 10%',
  },
  {
    category: 'performance',
    key: 'salary_adjustment.a_adjustment',
    value: 0.05,
    remark: 'D6 A 档调薪比例 5%',
  },
  {
    category: 'performance',
    key: 'promotion.min_a_count',
    value: 2,
    remark: 'D6 晋升最少 A 数',
  },
  {
    category: 'performance',
    key: 'promotion.min_s_count',
    value: 1,
    remark: 'D6 晋升最少 S 数',
  },
  {
    category: 'performance',
    key: 'promotion.lookback_years',
    value: 2,
    remark: 'D6 晋升参考年数',
  },
  {
    category: 'performance',
    key: 'pip.d_grade_quarters',
    value: 2,
    remark: 'D6 PIP 连续 D 季度数',
  },
  {
    category: 'performance',
    key: 'pip.duration_months',
    value: 3,
    remark: 'D6 PIP 期限月数',
  },
  {
    category: 'performance',
    key: 'pip.review_frequency',
    value: 'monthly',
    remark: 'D6 PIP 评审频率',
  },
  {
    category: 'performance',
    key: 'pip.training_required',
    value: true,
    remark: 'D6 PIP 期间必须培训',
  },
  {
    category: 'salary',
    key: 'grade.sequences',
    value: ['M', 'T', 'P', 'S', 'A'],
    remark: 'C1 薪级序列（M=高管+部门负责人 / T 技术 / P 生产 / S 销售 / A 职能）',
  },
  {
    category: 'salary',
    key: 'grade.levels_per_grade',
    value: 6,
    remark: 'C1 每级档位数（5-7，默认 6）',
  },
  {
    category: 'salary',
    key: 'grade.fixed_floating_ratio',
    value: {
      M: 0.6, T: 0.8, P: 0.75, S: 0, A: 0.85,
    },
    remark: 'C1 固浮比（销售 S=0 纯提成）',
  },
  {
    category: 'salary',
    key: 'plan.effective_default',
    value: 'next_month_first_day',
    remark: 'C1 薪酬方案默认生效日（次月 1 日）',
  },
  {
    category: 'salary',
    key: 'plan.lock_after_effective',
    value: true,
    remark: 'C1 方案生效后锁定（防重复生效）',
  },
  {
    category: 'salary',
    key: 'insurance.cities',
    value: ['xi_an', 'bei_jing', 'si_chuan'],
    remark: 'C2 社保城市白名单（西安/北京/四川）',
  },
  {
    category: 'salary',
    key: 'insurance.types',
    value: ['pension', 'medical', 'unemployment', 'work_injury', 'maternity'],
    remark: 'C2 五险白名单',
  },
  {
    category: 'salary',
    key: 'insurance.base_adjustment_month',
    value: { xi_an: 7, bei_jing: 7, si_chuan: 7 },
    remark: 'C2 三地调基月（默认 7 月）',
  },
  {
    category: 'salary',
    key: 'housing_fund.cities',
    value: ['xi_an', 'bei_jing', 'si_chuan'],
    remark: 'C2 公积金城市白名单',
  },
  {
    category: 'salary',
    key: 'housing_fund.rate_range',
    value: { min: 0.05, max: 0.12 },
    remark: 'C2 公积金比例范围 5%-12%',
  },
  {
    category: 'salary',
    key: 'insurance.batch_size',
    value: 200,
    remark: 'C2 批量操作上限',
  },
  {
    category: 'salary',
    key: 'tax.cumulative_method',
    value: 'cumulative_withholding',
    remark: 'C3 累计预扣法（V1.2 §二.4.4）',
  },
  {
    category: 'salary',
    key: 'tax.basic_deduction',
    value: 5000,
    remark: 'C3 起征点 5000 元/月',
  },
  {
    category: 'salary',
    key: 'tax.monthly_brackets',
    value: [
      { minIncome: 0, maxIncome: 36000, rate: 0.03, quickDeduction: 0 },
      { minIncome: 36000, maxIncome: 144000, rate: 0.10, quickDeduction: 2520 },
      { minIncome: 144000, maxIncome: 300000, rate: 0.20, quickDeduction: 16920 },
      { minIncome: 300000, maxIncome: 420000, rate: 0.25, quickDeduction: 31920 },
      { minIncome: 420000, maxIncome: 660000, rate: 0.30, quickDeduction: 52920 },
      { minIncome: 660000, maxIncome: 960000, rate: 0.35, quickDeduction: 85920 },
      { minIncome: 960000, maxIncome: null, rate: 0.45, quickDeduction: 181920 },
    ],
    remark: 'C3 工资薪金 7 级超额累进 + 速算扣除数',
  },
  {
    category: 'salary',
    key: 'tax.year_end_bonus_brackets',
    value: [
      { minIncome: 0, maxIncome: 3000, rate: 0.03, quickDeduction: 0 },
      { minIncome: 3000, maxIncome: 12000, rate: 0.10, quickDeduction: 210 },
      { minIncome: 12000, maxIncome: 25000, rate: 0.20, quickDeduction: 1410 },
      { minIncome: 25000, maxIncome: 35000, rate: 0.25, quickDeduction: 2660 },
      { minIncome: 35000, maxIncome: 55000, rate: 0.30, quickDeduction: 4410 },
      { minIncome: 55000, maxIncome: 80000, rate: 0.35, quickDeduction: 7160 },
      { minIncome: 80000, maxIncome: null, rate: 0.45, quickDeduction: 15160 },
    ],
    remark: 'C3 年终奖按月换算后税率表',
  },
  {
    category: 'salary',
    key: 'tax.labor_income_brackets',
    value: [
      { minIncome: 0, maxIncome: 20000, rate: 0.20, quickDeduction: 0 },
      { minIncome: 20000, maxIncome: 50000, rate: 0.30, quickDeduction: 2000 },
      { minIncome: 50000, maxIncome: null, rate: 0.40, quickDeduction: 7000 },
    ],
    remark: 'C3 劳务报酬 3 级超额累进',
  },
  {
    category: 'salary',
    key: 'tax.labor_income.threshold_low',
    value: 4000,
    remark: 'C3 劳务费 ≤4000 减定额',
  },
  {
    category: 'salary',
    key: 'tax.labor_income.deduction_low',
    value: 800,
    remark: 'C3 劳务费低额减除 800',
  },
  {
    category: 'salary',
    key: 'tax.labor_income.deduction_high_rate',
    value: 0.2,
    remark: 'C3 劳务费高额减除 20%',
  },
  {
    category: 'salary',
    key: 'tax.annual_settlement_period',
    value: ['03-01', '06-30'],
    remark: 'C3 年度汇算清缴期（3-6 月）；实际申报留 C5',
  },
  {
    category: 'salary',
    key: 'tax.batch_size',
    value: 200,
    remark: 'C3 批量个税计算上限',
  },
  {
    category: 'salary',
    key: 'payroll.trigger_day',
    value: 5,
    remark: 'C4 每月 5 日自动触发（BullMQ 留独立任务）',
  },
  {
    category: 'salary',
    key: 'payroll.approval_flow',
    value: {
      hr: 'payroll:hr_submit',
      finance: 'payroll:finance_review',
      ceo: 'payroll:ceo_approve',
    },
    remark: 'C4 3 级审批 flowKey',
  },
  {
    category: 'salary',
    key: 'payroll.lock_after_approve',
    value: true,
    remark: 'C4 审批通过后自动锁定',
  },
  {
    category: 'salary',
    key: 'payroll.anomaly_threshold',
    value: { absolute_diff: 1000, percentage_diff: 0.1 },
    remark: 'C4 异常检测：绝对差 1000 或 比例 10%',
  },
  {
    category: 'salary',
    key: 'payroll.recalculate_limit',
    value: 3,
    remark: 'C4 每月最多重算 3 次',
  },
  {
    category: 'salary',
    key: 'payroll.ai_summary_template_key',
    value: 'payroll_ai_summary',
    remark: 'C4 AI 摘要模板 key（复用 M0.5-5）',
  },
  {
    category: 'salary',
    key: 'payslip.template',
    value: 'default',
    remark: 'C5 工资条 HTML/PDF 模板名（实际模板留二期）',
  },
  {
    category: 'salary',
    key: 'payslip.email_subject',
    value: '您的 {period} 工资条',
    remark: 'C5 工资条邮件主题',
  },
  {
    category: 'salary',
    key: 'payslip.delivery_methods',
    value: ['email', 'system'],
    remark: 'C5 工资条发送方式',
  },
  {
    category: 'salary',
    key: 'banking.mock_mode',
    value: true,
    remark: 'C5 银企代发强制 mock，不接真实银行 API',
  },
  {
    category: 'salary',
    key: 'banking.formats',
    value: ['icbc', 'ccb', 'cmb'],
    remark: 'C5 银行代发格式：工行/建行/招行',
  },
  {
    category: 'salary',
    key: 'report.formats',
    value: ['excel', 'pdf'],
    remark: 'C5 工资表导出格式',
  },
  {
    category: 'salary',
    key: 'commission.settlement.fiscal_quarter_start',
    value: 1,
    remark: 'C6 财年 Q1 起始月（1=自然年）',
  },
  {
    category: 'salary',
    key: 'commission.settlement.confirm_window_days',
    value: 7,
    remark: 'C6 结算单确认窗口天数',
  },
  {
    category: 'salary',
    key: 'commission.settlement.max_adjustment_ratio',
    value: 0.5,
    remark: 'C6 最大调整比例（C6 不实现调整 API）',
  },
  {
    category: 'salary',
    key: 'commission.summary.default_group_by',
    value: 'employee',
    remark: 'C6 默认汇总维度',
  },
  {
    category: 'salary',
    key: 'commission.report.summary_fields',
    value: ['totalAmount', 'recordCount', 'employeeCount'],
    remark: 'C6 报表默认汇总字段',
  },
  {
    category: 'salary',
    key: 'commission.settlement.mock_mode',
    value: true,
    remark: 'C6 强制 mock，不联动 C4 算薪',
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

  // 4) 绩效 5 级审批流（M3-D2）
  const perfFlowDefs = [
    { key: 'self_submit', name: '绩效自评提交', approver: 'direct_leader' },
    { key: 'manager_score', name: '上级评分提交', approver: 'department_leader' },
    { key: 'dept_calibrate', name: '部门校准提交', approver: 'hr' },
    { key: 'hr_summary', name: 'HR 汇总提交', approver: 'ceo' },
    { key: 'ceo_approve', name: '总经理审批', approver: 'ceo' },
  ];
  for (const def of perfFlowDefs) {
    // eslint-disable-next-line no-await-in-loop
    await prisma.approvalFlow.upsert({
      where: { category_key_version: { category: 'performance', key: def.key, version: 1 } },
      update: {},
      create: {
        category: 'performance',
        key: def.key,
        name: def.name,
        version: 1,
        enabled: true,
        description: `绩效审批：${def.name}`,
        nodes: [{
          id: 'step1',
          type: 'sequential',
          approverType: 'role',
          approverValue: def.approver,
          condition: null,
        }],
      },
    });
  }
  console.log('   ✓ performance 5 approval flows (self/manager/calibrate/hr/ceo)');

  const payrollFlowDefs = [
    { key: 'hr_submit', name: '算薪 HR 提交', approver: 'hr' },
    { key: 'finance_review', name: '算薪财务复核（hr 兼任）', approver: 'hr' },
    { key: 'ceo_approve', name: '算薪 CEO 审批', approver: 'executive' },
  ];
  for (const def of payrollFlowDefs) {
    // eslint-disable-next-line no-await-in-loop
    await prisma.approvalFlow.upsert({
      where: { category_key_version: { category: 'payroll', key: def.key, version: 1 } },
      update: {},
      create: {
        category: 'payroll',
        key: def.key,
        name: def.name,
        version: 1,
        enabled: true,
        description: `算薪审批：${def.name}`,
        nodes: [{
          id: 'step1',
          type: 'sequential',
          approverType: 'role',
          approverValue: def.approver,
          condition: null,
        }],
      },
    });
  }
  console.log('   ✓ payroll 3 approval flows (hr_submit/finance_review/ceo_approve)');

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

  console.log('==> Seeding monthly summary demo (M2-B6)...');
  const activeEmployees = await prisma.employee.findMany({
    where: { deletedAt: null, status: { in: ['probation', 'active'] } },
    take: 5,
  });
  if (activeEmployees.length > 0) {
    const summaryExists = await prisma.monthlySummary.findFirst({
      where: { year, month: 7, status: 'draft' },
    });
    if (!summaryExists) {
      for (const emp of activeEmployees) {
        if (!emp.departmentId) continue;
        await prisma.monthlySummary.create({
          data: {
            employeeId: emp.id,
            companyId: emp.companyId,
            departmentId: emp.departmentId,
            year,
            month: 7,
            workDays: 21,
            lateCount: 1,
            earlyLeaveCount: 0,
            missingCount: 0,
            leaveDays: 1,
            leaveHours: 8,
            overtimeHours: 4,
            tripDays: 0,
            compBalance: 0.5,
            status: 'draft',
            createdBy: admin.id,
          },
        });
      }
      console.log(`   ✓ ${activeEmployees.length} draft summaries (${year}-07)`);
    }

    const confirmedExists = await prisma.monthlySummary.findFirst({
      where: { year: year - 1, month: 7, status: 'employee_confirmed' },
    });
    if (!confirmedExists && activeEmployees[0]) {
      const emp = activeEmployees[0];
      if (emp.departmentId) {
        await prisma.monthlySummary.create({
          data: {
            employeeId: emp.id,
            companyId: emp.companyId,
            departmentId: emp.departmentId,
            year: year - 1,
            month: 7,
            workDays: 22,
            lateCount: 0,
            earlyLeaveCount: 1,
            missingCount: 0,
            leaveDays: 2,
            leaveHours: 16,
            overtimeHours: 8,
            tripDays: 3,
            compBalance: 1,
            status: 'employee_confirmed',
            employeeConfirmedAt: new Date(`${year - 1}-08-02`),
            employeeConfirmedBy: emp.userId ?? admin.id,
            createdBy: admin.id,
          },
        });
        console.log(`   ✓ 1 employee_confirmed summary (${year - 1}-07)`);
      }
    }

    const lockedExists = await prisma.monthlySummary.findFirst({
      where: { year: year - 1, month: 6, status: 'hr_locked' },
    });
    if (!lockedExists) {
      for (const emp of activeEmployees.slice(0, 3)) {
        if (!emp.departmentId) continue;
        await prisma.monthlySummary.create({
          data: {
            employeeId: emp.id,
            companyId: emp.companyId,
            departmentId: emp.departmentId,
            year: year - 1,
            month: 6,
            workDays: 20,
            lateCount: 2,
            earlyLeaveCount: 0,
            missingCount: 1,
            leaveDays: 0.5,
            leaveHours: 4,
            overtimeHours: 6,
            tripDays: 2,
            compBalance: 0,
            status: 'hr_locked',
            employeeConfirmedAt: new Date(`${year - 1}-07-02`),
            employeeConfirmedBy: emp.userId ?? admin.id,
            hrLockedAt: new Date(`${year - 1}-07-05`),
            hrLockedBy: admin.id,
            createdBy: admin.id,
          },
        });
      }
      console.log('   ✓ 3 hr_locked summaries (prior year-06)');
    } else {
      console.log('   ✓ monthly summary demo already exists (skip)');
    }
  }

  console.log('==> Seeding performance demo (M3-D1)...');
  const perfExists = await prisma.performanceCycle.findFirst({ where: { code: `${year}-09` } });
  if (!perfExists) {
    const monthlyCycle = await prisma.performanceCycle.create({
      data: {
        code: `${year}-09`,
        name: `${year} 年 9 月考核`,
        type: 'monthly',
        startDate: new Date(`${year}-09-01`),
        endDate: new Date(`${year}-09-30`),
        status: 'active',
        createdBy: admin.id,
      },
    });
    await prisma.performanceCycle.create({
      data: {
        code: `${year}-Q3`,
        name: `${year} 年 Q3 考核`,
        type: 'quarterly',
        startDate: new Date(`${year}-07-01`),
        endDate: new Date(`${year}-09-30`),
        status: 'draft',
        createdBy: admin.id,
      },
    });
    await prisma.performanceCycle.create({
      data: {
        code: `${year}`,
        name: `${year} 年度考核`,
        type: 'yearly',
        startDate: new Date(`${year}-01-01`),
        endDate: new Date(`${year}-12-31`),
        status: 'draft',
        createdBy: admin.id,
      },
    });

    const indicatorDefs = [
      { code: 'KPI-SALES', name: '销售额', type: 'KPI', category: '销售' },
      { code: 'KPI-PROJECT', name: '项目交付', type: 'KPI', category: '项目' },
      { code: 'OKR-TEAM', name: '团队目标', type: 'OKR', category: '团队' },
      { code: 'OKR-PERSONAL', name: '个人目标', type: 'OKR', category: '个人' },
      { code: 'BSC-FIN', name: '财务指标', type: 'BSC', category: '财务' },
      { code: '360-COLLAB', name: '协作评价', type: '360', category: '协作' },
    ];
    const createdIndicators = [];
    for (const def of indicatorDefs) {
      const ind = await prisma.performanceIndicator.create({
        data: { ...def, status: 'active', createdBy: admin.id },
      });
      createdIndicators.push(ind);
    }

    const salesDept = await prisma.department.findFirst({
      where: { code: 'PEDU', company: { code: 'XACH' } },
    });
    const techDept = await prisma.department.findFirst({
      where: { code: 'TECH', company: { code: 'XACH' } },
    });

    if (salesDept) {
      const salesScheme = await prisma.performanceScheme.create({
        data: {
          code: 'SCH-PEDU-MONTHLY',
          name: '产教服务部月度方案',
          cycleId: monthlyCycle.id,
          applicableScope: 'department',
          applicableDeptId: salesDept.id,
          status: 'active',
          createdBy: admin.id,
        },
      });
      await prisma.performanceSchemeIndicator.createMany({
        data: [
          { schemeId: salesScheme.id, indicatorId: createdIndicators[0].id, weight: 50, sortOrder: 0 },
          { schemeId: salesScheme.id, indicatorId: createdIndicators[5].id, weight: 50, sortOrder: 1 },
        ],
      });
    }

    if (techDept) {
      const techScheme = await prisma.performanceScheme.create({
        data: {
          code: 'SCH-TECH-MONTHLY',
          name: '技术部月度方案',
          cycleId: monthlyCycle.id,
          applicableScope: 'department',
          applicableDeptId: techDept.id,
          status: 'draft',
          createdBy: admin.id,
        },
      });
      await prisma.performanceSchemeIndicator.createMany({
        data: [
          { schemeId: techScheme.id, indicatorId: createdIndicators[1].id, weight: 40, sortOrder: 0 },
          { schemeId: techScheme.id, indicatorId: createdIndicators[2].id, weight: 30, sortOrder: 1 },
          { schemeId: techScheme.id, indicatorId: createdIndicators[3].id, weight: 30, sortOrder: 2 },
        ],
      });
    }

    const coefExists = await prisma.performanceCoefficient.findFirst({ where: { effectiveTo: null } });
    if (!coefExists) {
      const effectiveFrom = new Date('2020-01-01');
      for (const [grade, coefficient] of Object.entries({ S: 1.5, A: 1.2, B: 1.0, C: 0.8, D: 0.5 })) {
        await prisma.performanceCoefficient.create({
          data: {
            grade,
            coefficient,
            effectiveFrom,
            effectiveTo: null,
            createdBy: admin.id,
          },
        });
      }
    }

    console.log('   ✓ performance cycles / indicators / schemes / coefficients demo');
  } else {
    console.log('   ✓ performance demo already exists (skip)');
  }

  console.log('==> Seeding performance records demo (M3-D2)...');
  const monthlyCycleForRecords = await prisma.performanceCycle.findFirst({
    where: { code: `${year}-09`, status: 'active' },
  });
  const peduScheme = await prisma.performanceScheme.findFirst({
    where: { code: 'SCH-PEDU-MONTHLY' },
  });
  const sampleEmployees = await prisma.employee.findMany({
    where: { deletedAt: null },
    take: 3,
    orderBy: { employeeNo: 'asc' },
  });
  if (monthlyCycleForRecords && peduScheme && sampleEmployees.length >= 2) {
    const recordExists = await prisma.performanceRecord.findFirst({
      where: { cycleId: monthlyCycleForRecords.id },
    });
    if (!recordExists) {
      await prisma.performanceRecord.create({
        data: {
          employeeId: sampleEmployees[0].id,
          cycleId: monthlyCycleForRecords.id,
          schemeId: peduScheme.id,
          status: 'manager_scoring',
          createdBy: admin.id,
        },
      });
      await prisma.performanceRecord.create({
        data: {
          employeeId: sampleEmployees[1].id,
          cycleId: monthlyCycleForRecords.id,
          schemeId: peduScheme.id,
          status: 'draft',
          createdBy: admin.id,
        },
      });
      if (sampleEmployees[2]) {
        await prisma.performanceRecord.create({
          data: {
            employeeId: sampleEmployees[2].id,
            cycleId: monthlyCycleForRecords.id,
            schemeId: peduScheme.id,
            status: 'ceo_approving',
            finalScore: 85,
            createdBy: admin.id,
          },
        });
      }
      console.log('   ✓ 3 performance records demo');
    } else {
      console.log('   ✓ performance records demo already exists (skip)');
    }
  }

  console.log('==> Seeding performance grade demo (M3-D3)...');
  if (monthlyCycleForRecords && peduScheme && sampleEmployees.length >= 3) {
    const d3Exists = await prisma.performanceRecord.findFirst({
      where: {
        cycleId: monthlyCycleForRecords.id,
        status: 'archived',
        finalScore: 95,
      },
    });
    if (!d3Exists) {
      const d3Scores = [95, 85, 55];
      await Promise.all(d3Scores.map((score, idx) => prisma.performanceRecord.create({
        data: {
          employeeId: sampleEmployees[idx].id,
          cycleId: monthlyCycleForRecords.id,
          schemeId: peduScheme.id,
          status: 'archived',
          finalScore: score,
          finalGrade: score >= 90 ? 'S' : score >= 80 ? 'A' : 'D',
          archivedAt: new Date(),
          createdBy: admin.id,
        },
      })));
      console.log('   ✓ 3 archived performance records for D3 grade demo');
    } else {
      console.log('   ✓ D3 grade demo already exists (skip)');
    }
  }

  console.log('==> Seeding performance payout demo (M3-D4)...');
  const payoutConfigExists = await prisma.performancePayoutConfig.findFirst({
    where: { effectiveTo: null },
  });
  if (!payoutConfigExists) {
    await prisma.performancePayoutConfig.create({
      data: {
        mode: 'direct',
        effectiveFrom: new Date(),
        effectiveTo: null,
        remark: 'D4 默认直乘模式',
        createdBy: admin.id,
      },
    });
    console.log('   ✓ default performance_payout_config (direct)');
  }

  const q3Cycle = await prisma.performanceCycle.findFirst({ where: { code: `${year}-Q3` } });
  const archivedForPayout = await prisma.performanceRecord.findFirst({
    where: { status: 'archived', finalGrade: 'B' },
  });
  if (q3Cycle && archivedForPayout && sampleEmployees.length >= 1) {
    const d4Exists = await prisma.performancePayout.findFirst({
      where: { cycleId: q3Cycle.id },
    });
    if (!d4Exists) {
      const emp = sampleEmployees[0];
      const salary = await prisma.employeeSalaryHistory.findFirst({
        where: { employeeId: emp.id },
        orderBy: { effectiveDate: 'desc' },
      });
      const base = salary?.performanceSalary ?? salary?.totalSalary ?? 10000;
      const monthDirect = new Date(`${year}-09-01`);
      await prisma.performancePayout.create({
        data: {
          employeeId: emp.id,
          cycleId: q3Cycle.id,
          month: monthDirect,
          period: `${year}-09`,
          mode: 'direct',
          baseAmount: base,
          coefficient: 1.0,
          actualAmount: base,
          status: 'calculated',
          createdBy: admin.id,
        },
      });
      await prisma.performancePayout.create({
        data: {
          employeeId: emp.id,
          cycleId: q3Cycle.id,
          month: monthDirect,
          period: `${year}-09`,
          mode: 'pool',
          baseAmount: base,
          coefficient: 1.0,
          ratio: 0.2,
          actualAmount: Number(base) * 0.2,
          status: 'calculated',
          createdBy: admin.id,
        },
      });
      await prisma.performancePayout.create({
        data: {
          employeeId: emp.id,
          cycleId: q3Cycle.id,
          month: new Date(`${year}-07-01`),
          period: `${year}-07`,
          mode: 'direct',
          baseAmount: base,
          coefficient: 1.0,
          actualAmount: Number(base) * 0.5,
          status: 'prepaid',
          createdBy: admin.id,
        },
      });
      console.log('   ✓ 3 demo performance_payouts (direct + pool + prepay)');
    } else {
      console.log('   ✓ D4 payout demo already exists (skip)');
    }
  }

  console.log('==> Seeding performance sales demo (M3-D5)...');
  const d5ProductExists = await prisma.performanceSalesProduct.findFirst({
    where: { code: 'UAV-01' },
  });
  if (!d5ProductExists) {
    const productUav = await prisma.performanceSalesProduct.create({
      data: {
        code: 'UAV-01',
        name: '无人机整机',
        category: 'product',
        baseRate: 0.05,
        description: 'D5 demo 无人机整机 5%',
        status: 'active',
        createdById: admin.id,
      },
    });
    const productSvc = await prisma.performanceSalesProduct.create({
      data: {
        code: 'SVC-01',
        name: '运维服务',
        category: 'service',
        baseRate: 0.08,
        description: 'D5 demo 服务 8%',
        status: 'active',
        createdById: admin.id,
      },
    });
    const productTrn = await prisma.performanceSalesProduct.create({
      data: {
        code: 'TRN-01',
        name: '操作培训',
        category: 'training',
        baseRate: 0.03,
        description: 'D5 demo 培训 3%',
        status: 'active',
        createdById: admin.id,
      },
    });
    console.log('   ✓ 3 demo sales products (UAV/SVC/TRN)');

    const salesEmp = sampleEmployees.find((e) => e.status === 'active') ?? sampleEmployees[0];
    if (salesEmp) {
      const period = `${year}-09`;
      const paymentDate = new Date(`${year}-09-15`);
      await prisma.performanceSalesPayment.create({
        data: {
          employeeId: salesEmp.id,
          productId: productUav.id,
          customerName: '演示客户-草稿',
          amount: 100000,
          paymentDate,
          period,
          status: 'draft',
          createdById: admin.id,
        },
      });
      const confirmedPay = await prisma.performanceSalesPayment.create({
        data: {
          employeeId: salesEmp.id,
          productId: productSvc.id,
          customerName: '演示客户-已确认',
          amount: 80000,
          paymentDate,
          period,
          status: 'confirmed',
          confirmedById: admin.id,
          confirmedAt: new Date(),
          createdById: admin.id,
        },
      });
      await prisma.performanceSalesPayment.create({
        data: {
          employeeId: salesEmp.id,
          productId: productTrn.id,
          customerName: '演示客户-已取消',
          amount: 30000,
          paymentDate,
          period,
          status: 'cancelled',
          remark: '演示取消回款',
          createdById: admin.id,
        },
      });
      console.log('   ✓ 3 demo sales payments (draft/confirmed/cancelled)');

      await prisma.performanceSalesCommission.create({
        data: {
          employeeId: salesEmp.id,
          paymentId: confirmedPay.id,
          productId: productSvc.id,
          baseAmount: 80000,
          commissionRate: 0.08,
          targetBonusRate: 0,
          finalAmount: 6400,
          period,
          status: 'calculated',
          calculatedBy: admin.id,
        },
      });
      const paidPay = await prisma.performanceSalesPayment.create({
        data: {
          employeeId: salesEmp.id,
          productId: productUav.id,
          customerName: '演示客户-已发放',
          amount: 100000,
          paymentDate,
          period,
          status: 'confirmed',
          confirmedById: admin.id,
          confirmedAt: new Date(),
          createdById: admin.id,
        },
      });
      await prisma.performanceSalesCommission.create({
        data: {
          employeeId: salesEmp.id,
          paymentId: paidPay.id,
          productId: productUav.id,
          baseAmount: 100000,
          commissionRate: 0.05,
          targetBonusRate: 0,
          finalAmount: 5000,
          period,
          status: 'paid',
          calculatedBy: admin.id,
          paidAt: new Date(),
        },
      });
      console.log('   ✓ 2 demo sales commissions (calculated + paid)');
    }
  } else {
    console.log('   ✓ D5 sales demo already exists (skip)');
  }

  console.log('==> Seeding performance PIP demo (M3-D6)...');
  const d6Exists = await prisma.performancePip.findFirst();
  if (!d6Exists && sampleEmployees.length >= 2) {
    const start = new Date(`${year}-07-01`);
    const end = new Date(`${year}-10-01`);
    const activePip = await prisma.performancePip.create({
      data: {
        employeeId: sampleEmployees[0].id,
        startDate: start,
        endDate: end,
        status: 'active',
        reason: '演示：连续两季度 D 档触发 PIP',
        triggeredBy: admin.id,
        createdById: admin.id,
      },
    });
    const donePip = await prisma.performancePip.create({
      data: {
        employeeId: sampleEmployees[1].id,
        startDate: start,
        endDate: end,
        status: 'completed',
        reason: '演示：已完成 PIP',
        outcome: 'PIP 通过',
        triggeredBy: admin.id,
        createdById: admin.id,
      },
    });
    const ratings = ['improved', 'no_change', 'improved'] as const;
    await Promise.all([activePip, donePip].flatMap((pip) => ratings.map((rating, idx) => prisma.performancePipReview.create({
      data: {
        pipId: pip.id,
        reviewMonth: idx + 1,
        reviewDate: new Date(year, 6 + idx, 15),
        rating,
        comment: `演示评审 ${idx + 1}`,
        reviewerId: admin.id,
      },
    }))));
    console.log('   ✓ 2 demo PIPs + 6 reviews');
  } else {
    console.log('   ✓ D6 PIP demo already exists (skip)');
  }

  console.log('==> Seeding salary grades/levels/plans (M4-C1)...');
  const existingC1Grade = await prisma.salaryGrade.findFirst({
    where: { sequence: 'M', gradeCode: 'M1' },
  });
  if (!existingC1Grade && sampleEmployees.length >= 3) {
    const gradeDefs = [
      {
        sequence: 'M' as const,
        gradeCode: 'M1',
        name: '高管 M1',
        minBase: 20000,
        maxBase: 35000,
        minPerf: 8000,
        maxPerf: 20000,
      },
      {
        sequence: 'T' as const,
        gradeCode: 'T3',
        name: '技术 T3',
        minBase: 8000,
        maxBase: 15000,
        minPerf: 1500,
        maxPerf: 4000,
      },
      {
        sequence: 'P' as const,
        gradeCode: 'P3',
        name: '生产 P3',
        minBase: 6000,
        maxBase: 12000,
        minPerf: 1500,
        maxPerf: 4000,
      },
      {
        sequence: 'S' as const,
        gradeCode: 'S3',
        name: '销售 S3',
        minBase: 4000,
        maxBase: 8000,
        minPerf: 0,
        maxPerf: 1000,
      },
      {
        sequence: 'A' as const,
        gradeCode: 'A3',
        name: '职能 A3',
        minBase: 7000,
        maxBase: 13000,
        minPerf: 1000,
        maxPerf: 2500,
      },
    ];
    const createdGrades: Record<string, { id: string }> = {};
    for (const g of gradeDefs) {
      createdGrades[g.gradeCode] = await prisma.salaryGrade.create({
        data: {
          sequence: g.sequence,
          gradeCode: g.gradeCode,
          name: g.name,
          minBaseSalary: g.minBase,
          maxBaseSalary: g.maxBase,
          minPerformanceBase: g.minPerf,
          maxPerformanceBase: g.maxPerf,
          status: 'active',
          createdById: admin.id,
        },
      });
    }
    const levelSeries: Array<{ code: string; bases: number[]; perfs: number[] }> = [
      {
        code: 'M1',
        bases: [20000, 22000, 24000, 26000, 28000, 30000],
        perfs: [8000, 10000, 12000, 14000, 16000, 18000],
      },
      {
        code: 'T3',
        bases: [8000, 9000, 10000, 11000, 12000, 13000],
        perfs: [1500, 1800, 2100, 2400, 2700, 3000],
      },
      {
        code: 'A3',
        bases: [7000, 8000, 9000, 10000, 11000, 12000],
        perfs: [1000, 1200, 1400, 1600, 1800, 2000],
      },
    ];
    const createdLevels: Record<string, { id: string }> = {};
    for (const series of levelSeries) {
      const grade = createdGrades[series.code];
      await Promise.all(series.bases.map((base, idx) => prisma.salaryGradeLevel.create({
        data: {
          gradeId: grade.id,
          level: idx + 1,
          baseSalary: base,
          performanceBase: series.perfs[idx],
          status: 'active',
          createdById: admin.id,
        },
      }).then((lv) => {
        createdLevels[`${series.code}-${idx + 1}`] = lv;
      })));
    }
    const planMonth = new Date(year, 0, 1);
    const planSeeds = [
      { emp: sampleEmployees[0], grade: 'T3', level: 3, base: 10000, perf: 2100 },
      { emp: sampleEmployees[1], grade: 'A3', level: 2, base: 8000, perf: 1200 },
      { emp: sampleEmployees[2], grade: 'M1', level: 1, base: 20000, perf: 8000 },
    ];
    await Promise.all(planSeeds.map((p) => prisma.employeeSalaryPlan.create({
      data: {
        employeeId: p.emp.id,
        gradeId: createdGrades[p.grade].id,
        levelId: createdLevels[`${p.grade}-${p.level}`].id,
        baseSalary: p.base,
        performanceBase: p.perf,
        allowance: 0,
        welfare: 'demo',
        effectiveFrom: planMonth,
        effectiveTo: null,
        status: 'active',
        createdById: admin.id,
      },
    })));
    console.log('   ✓ 5 demo grades + 18 demo levels + 3 demo plans');
  } else {
    console.log('   ✓ C1 salary demo already exists (skip)');
  }

  console.log('==> Seeding insurance schemes/registrations (M4-C2)...');
  const existingC2 = await prisma.socialInsuranceScheme.findFirst({
    where: { city: 'xi_an', insuranceType: 'pension' },
  });
  if (!existingC2 && sampleEmployees.length >= 3) {
    const bases: Record<string, { min: number; max: number }> = {
      xi_an: { min: 4500, max: 24000 },
      bei_jing: { min: 6300, max: 34000 },
      si_chuan: { min: 4300, max: 21500 },
    };
    const socialDefs: Array<{
      city: 'xi_an' | 'bei_jing' | 'si_chuan';
      insuranceType: 'pension' | 'medical' | 'unemployment' | 'work_injury' | 'maternity';
      companyRate: number;
      personalRate: number;
    }> = [
      { city: 'xi_an', insuranceType: 'pension', companyRate: 0.16, personalRate: 0.08 },
      { city: 'xi_an', insuranceType: 'medical', companyRate: 0.08, personalRate: 0.02 },
      { city: 'xi_an', insuranceType: 'unemployment', companyRate: 0.007, personalRate: 0.003 },
      { city: 'xi_an', insuranceType: 'work_injury', companyRate: 0.005, personalRate: 0 },
      { city: 'xi_an', insuranceType: 'maternity', companyRate: 0, personalRate: 0 },
      { city: 'bei_jing', insuranceType: 'pension', companyRate: 0.16, personalRate: 0.08 },
      { city: 'bei_jing', insuranceType: 'medical', companyRate: 0.1, personalRate: 0.02 },
      { city: 'bei_jing', insuranceType: 'unemployment', companyRate: 0.005, personalRate: 0.005 },
      { city: 'bei_jing', insuranceType: 'work_injury', companyRate: 0.005, personalRate: 0 },
      { city: 'bei_jing', insuranceType: 'maternity', companyRate: 0, personalRate: 0 },
      { city: 'si_chuan', insuranceType: 'pension', companyRate: 0.16, personalRate: 0.08 },
      { city: 'si_chuan', insuranceType: 'medical', companyRate: 0.085, personalRate: 0.02 },
      { city: 'si_chuan', insuranceType: 'unemployment', companyRate: 0.006, personalRate: 0.004 },
      { city: 'si_chuan', insuranceType: 'work_injury', companyRate: 0.005, personalRate: 0 },
      { city: 'si_chuan', insuranceType: 'maternity', companyRate: 0, personalRate: 0 },
    ];
    const createdSocial: Record<string, { id: string }> = {};
    await Promise.all(socialDefs.map(async (s) => {
      const rec = await prisma.socialInsuranceScheme.create({
        data: {
          city: s.city,
          insuranceType: s.insuranceType,
          companyRate: s.companyRate,
          personalRate: s.personalRate,
          baseMin: bases[s.city].min,
          baseMax: bases[s.city].max,
          baseAdjustmentMonth: 7,
          status: 'active',
          createdById: admin.id,
        },
      });
      createdSocial[`${s.city}-${s.insuranceType}`] = rec;
    }));
    const fundDefs = [
      { city: 'xi_an' as const, companyRate: 0.05, personalRate: 0.05 },
      { city: 'bei_jing' as const, companyRate: 0.12, personalRate: 0.12 },
      { city: 'si_chuan' as const, companyRate: 0.08, personalRate: 0.08 },
    ];
    const createdFunds: Record<string, { id: string }> = {};
    await Promise.all(fundDefs.map(async (f) => {
      createdFunds[f.city] = await prisma.housingFundScheme.create({
        data: {
          city: f.city,
          companyRate: f.companyRate,
          personalRate: f.personalRate,
          baseMin: bases[f.city].min,
          baseMax: bases[f.city].max,
          status: 'active',
          createdById: admin.id,
        },
      });
    }));
    const from = new Date(year, 0, 1);
    const regSeeds = [
      { emp: sampleEmployees[0], city: 'xi_an' as const, base: 10000 },
      { emp: sampleEmployees[1], city: 'bei_jing' as const, base: 12000 },
      { emp: sampleEmployees[2], city: 'si_chuan' as const, base: 8000 },
    ];
    await Promise.all(regSeeds.map((r) => prisma.employeeInsuranceRegistration.create({
      data: {
        employeeId: r.emp.id,
        city: r.city,
        socialInsuranceSchemeId: createdSocial[`${r.city}-pension`].id,
        housingFundSchemeId: createdFunds[r.city].id,
        baseSalary: r.base,
        effectiveFrom: from,
        effectiveTo: null,
        status: 'active',
        createdById: admin.id,
      },
    })));
    console.log('   ✓ 15 demo social schemes + 3 housing funds + 3 registrations');
  } else {
    console.log('   ✓ C2 insurance demo already exists (skip)');
  }

  console.log('==> Seeding payroll runs/payslips (M4-C4)...');
  const existingC4 = await prisma.payrollRun.findFirst();
  if (!existingC4 && sampleEmployees.length >= 2) {
    const [empA, empB] = sampleEmployees;
    const draftRun = await prisma.payrollRun.create({
      data: {
        period: '2026-07',
        status: 'draft',
        totalGross: 20000,
        totalNet: 17800,
        anomalyCount: 0,
        remark: 'C4 demo draft',
        createdById: admin.id,
      },
    });
    const approvedRun = await prisma.payrollRun.create({
      data: {
        period: '2026-08',
        status: 'approved',
        totalGross: 20000,
        totalNet: 17800,
        anomalyCount: 0,
        remark: 'C4 demo approved',
        createdById: admin.id,
        approvedById: admin.id,
        approvedAt: new Date(2026, 7, 20),
      },
    });
    const slipSeeds = [
      { run: draftRun, emp: empA, period: '2026-07' },
      { run: draftRun, emp: empB, period: '2026-07' },
      { run: approvedRun, emp: empA, period: '2026-08' },
      { run: approvedRun, emp: empB, period: '2026-08' },
    ];
    for (const s of slipSeeds) {
      // eslint-disable-next-line no-await-in-loop
      const slip = await prisma.payslip.create({
        data: {
          runId: s.run.id,
          employeeId: s.emp.id,
          period: s.period,
          baseAmount: 10000,
          performanceAmount: 0,
          overtimeAmount: 0,
          allowanceAmount: 0,
          grossAmount: 10000,
          socialInsuranceAmount: 800,
          housingFundAmount: 300,
          taxAmount: 0,
          absenceAmount: 0,
          deductionAmount: 1100,
          netAmount: 8900,
          status: s.run.status === 'approved' ? 'approved' : 'calculated',
        },
      });
      // eslint-disable-next-line no-await-in-loop
      await prisma.payslipItem.createMany({
        data: [
          {
            payslipId: slip.id, itemType: 'earning_base', itemName: '基本工资', amount: 10000,
          },
          {
            payslipId: slip.id, itemType: 'deduction_social', itemName: '社保个人', amount: -800,
          },
          {
            payslipId: slip.id, itemType: 'deduction_housing', itemName: '公积金个人', amount: -300,
          },
        ],
      });
    }
    console.log('   ✓ 2 demo payroll runs + 4 payslips + items');
  } else {
    console.log('   ✓ C4 payroll demo already exists (skip)');
  }

  console.log('==> Seeding C6 commission settlements...');
  const c6Exists = await prisma.commissionSettlement.findFirst({
    where: { year: 2026, quarter: 1 },
  });
  if (!c6Exists) {
    await prisma.commissionSettlement.create({
      data: {
        year: 2026,
        quarter: 1,
        status: 'confirmed',
        totalAmount: 5000,
        recordCount: 1,
        employeeCount: 1,
        productCount: 1,
        periodStart: new Date(Date.UTC(2026, 0, 1)),
        periodEnd: new Date(Date.UTC(2026, 2, 31)),
        confirmedBy: admin.id,
        confirmedAt: new Date(),
        createdBy: admin.id,
        remark: 'C6 demo Q1 2026 confirmed',
      },
    });
    await prisma.commissionSettlement.create({
      data: {
        year: 2026,
        quarter: 2,
        status: 'draft',
        totalAmount: 0,
        recordCount: 0,
        employeeCount: 0,
        productCount: 0,
        periodStart: new Date(Date.UTC(2026, 3, 1)),
        periodEnd: new Date(Date.UTC(2026, 5, 30)),
        createdBy: admin.id,
        remark: 'C6 demo Q2 2026 draft',
      },
    });
    console.log('   ✓ 2 demo commission_settlements (Q1 confirmed + Q2 draft)');
  } else {
    console.log('   ✓ C6 commission settlement demo already exists (skip)');
  }

  console.log('==> Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
