/**
 * 权限与角色判断（M5-2-0）
 * @module utils/permission
 * @description 5 角色无 finance；菜单 / Dashboard 卡片按角色过滤
 */

import type { RoleCode, UserInfo } from '@/api/types';

/** 角色优先级：多角色用户取最高身份展示工作台 */
const ROLE_PRIORITY: RoleCode[] = ['admin', 'hr', 'executive', 'dept_head', 'employee'];

export const ROLE_CODES: readonly RoleCode[] = [
  'admin',
  'hr',
  'dept_head',
  'executive',
  'employee',
];

export interface DashboardModule {
  key: string;
  title: string;
  description: string;
  icon: string;
  to: string;
  roles: RoleCode[];
}

/**
 * 非员工角色的模块入口（M5-2-A/B/C/D 落地前仅占位路由）
 * hr 4 模块 / dept_head 3 / executive 3 / admin 全开
 */
const MODULES: DashboardModule[] = [
  {
    key: 'org',
    title: '组织人事',
    description: '员工档案 / 部门 / 合同',
    icon: 'OfficeBuilding',
    to: '/org',
    roles: ['admin', 'hr', 'dept_head'],
  },
  {
    key: 'attendance',
    title: '考勤假勤',
    description: '打卡 / 请假 / 加班 / 出差',
    icon: 'Clock',
    to: '/attendance',
    roles: ['admin', 'hr', 'dept_head'],
  },
  {
    key: 'performance',
    title: '绩效管理',
    description: '考核方案 / 评分 / 兑现 / 提成',
    icon: 'TrendCharts',
    to: '/performance',
    roles: ['admin', 'hr', 'dept_head', 'executive'],
  },
  {
    key: 'salary',
    title: '薪酬核算',
    description: '薪级 / 个税 / 算薪 / 调薪',
    icon: 'Money',
    to: '/salary',
    roles: ['admin', 'hr', 'executive'],
  },
  {
    key: 'ai',
    title: 'AI 智能问答',
    description: '基于知识库的 AI 助手',
    icon: 'ChatDotRound',
    to: '/ai',
    roles: ['admin', 'executive'],
  },
  {
    key: 'decision',
    title: '决策仪表盘',
    description: '经营与人力决策总览',
    icon: 'DataAnalysis',
    to: '/dashboard',
    roles: ['executive'],
  },
];

/** employee 自助中心 5 入口（§7.2） */
const EMPLOYEE_MODULES: DashboardModule[] = [
  {
    key: 'punch',
    title: '打卡',
    description: '上下班打卡',
    icon: 'Clock',
    to: '/attendance',
    roles: ['employee'],
  },
  {
    key: 'leave',
    title: '请假',
    description: '请假申请与余额',
    icon: 'Calendar',
    to: '/attendance',
    roles: ['employee'],
  },
  {
    key: 'payslip',
    title: '工资条',
    description: '查看本月工资条',
    icon: 'Ticket',
    to: '/salary',
    roles: ['employee'],
  },
  {
    key: 'self-review',
    title: '绩效自评',
    description: '填写绩效考核自评',
    icon: 'EditPen',
    to: '/performance',
    roles: ['employee'],
  },
  {
    key: 'ai-assistant',
    title: 'AI 助手',
    description: '制度与流程智能问答',
    icon: 'ChatDotRound',
    to: '/ai',
    roles: ['employee'],
  },
];

export function isRoleCode(value: string): value is RoleCode {
  return (ROLE_CODES as readonly string[]).includes(value);
}

/**
 * 从后端 roles[] 派生展示用单一角色（无 finance）
 */
export function primaryRole(roles: string[] | undefined): RoleCode {
  if (!roles || roles.length === 0) {
    return 'employee';
  }
  const found = ROLE_PRIORITY.find((code) => roles.includes(code));
  return found ?? 'employee';
}

/**
 * 权限点判断：含 * 视为超管
 */
export function hasPermission(user: UserInfo | null, permission: string): boolean {
  if (!user) {
    return false;
  }
  if (user.permissions.includes('*')) {
    return true;
  }
  return user.permissions.includes(permission);
}

/**
 * 工作台可见模块（按 5 角色过滤）
 */
export function getDashboardModules(role: RoleCode | null | undefined): DashboardModule[] {
  if (!role) {
    return [];
  }
  if (role === 'employee') {
    return EMPLOYEE_MODULES;
  }
  return MODULES.filter((item) => item.roles.includes(role));
}
