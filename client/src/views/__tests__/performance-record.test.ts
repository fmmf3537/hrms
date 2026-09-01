/**
 * 考核记录视图 + 状态判定单测（M5-2-D2）内联断言
 *
 * 覆盖要点：
 *  - RECORD_STATUS_MAP 覆盖全部 13 个 RecordStatus（含 reject/cancelled 步骤 -1）
 *  - canRecordStageAction 三维判定（动作 × 状态 × 权限）：
 *    · employee + 自评阶段 + 本人记录 → true
 *    · hr + ai 请求 → false（ai:request 仅 dept_head/executive）
 *    · dept_head + manager 阶段 → true
 *    · executive + ceo 阶段 → true
 *    · hr + ceo 阶段 → false（ceo:approve 仅 executive）
 *  - PERFORMANCE_D2_MENU + filterPerformanceMenu records 可见性
 *  - resolvePerformanceActiveKey records 路径分支
 *  - 路由表追加 2 children（records + records/:id）
 */
import performanceRoutes, {
  PERFORMANCE_D2_MENU,
  PERFORMANCE_MENU,
  filterPerformanceMenu,
  resolvePerformanceActiveKey,
} from '@/router/performance';
import {
  RECORD_STATUS_MAP,
  RECORD_STEPS,
  canRecordAiRead,
  canRecordSelfEdit,
  canRecordStageAction,
  recordStepIndex,
  type RecordStatus,
  unwrapRecordList,
} from '@/api/types/performanceRecord';
import type { UserInfo } from '@/api/types';
import RecordList from '@/views/performance/record/RecordList.vue';
import RecordDetail from '@/views/performance/record/RecordDetail.vue';

interface Case {
  name: string;
  fn: () => void | Promise<void>;
}

const cases: Case[] = [];

function describe(_name: string, fn: () => void): void {
  fn();
}

function it(name: string, fn: () => void): void {
  cases.push({ name, fn });
}

function expectEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function mockUser(roles: string[], permissions: string[]): UserInfo {
  return {
    id: 'u1',
    username: 'tester',
    email: null,
    phone: null,
    status: 'active',
    mustChangePassword: false,
    roles,
    permissions,
    companyId: null,
    departmentId: null,
    employee: { id: 'emp-self', employeeNo: 'E001', name: '本人' },
  };
}

const ALL_STATUSES: RecordStatus[] = [
  'draft',
  'self_submitted',
  'manager_scoring',
  'manager_scored',
  'dept_calibrating',
  'dept_calibrated',
  'hr_summarizing',
  'hr_summarized',
  'ceo_approving',
  'ceo_approved',
  'archived',
  'rejected',
  'cancelled',
];

describe('views/__tests__/performance-record.test.ts', () => {
  it('2 个考核记录视图组件可导入', () => {
    expectEqual(typeof RecordList, 'object', 'RecordList');
    expectEqual(typeof RecordDetail, 'object', 'RecordDetail');
  });

  it('RECORD_STATUS_MAP 覆盖全部 13 个 RecordStatus', () => {
    expectEqual(Object.keys(RECORD_STATUS_MAP).length, 13, '13 statuses');
    expectEqual(RECORD_STATUS_MAP.draft.label, '待自评', 'draft label');
    expectEqual(RECORD_STATUS_MAP.draft.step, 0, 'draft step 0');
    expectEqual(RECORD_STATUS_MAP.manager_scoring.label, '上级评分中', 'manager_scoring');
    expectEqual(RECORD_STATUS_MAP.manager_scoring.step, 1, 'manager_scoring step 1');
    expectEqual(RECORD_STATUS_MAP.dept_calibrating.step, 2, 'dept_calibrating step 2');
    expectEqual(RECORD_STATUS_MAP.hr_summarizing.step, 3, 'hr_summarizing step 3');
    expectEqual(RECORD_STATUS_MAP.ceo_approving.step, 4, 'ceo_approving step 4');
    expectEqual(RECORD_STATUS_MAP.ceo_approved.step, 4, 'ceo_approved step 4');
    expectEqual(RECORD_STATUS_MAP.archived.step, 5, 'archived step 5');
    expectEqual(RECORD_STATUS_MAP.rejected.step, -1, 'rejected step -1');
    expectEqual(RECORD_STATUS_MAP.cancelled.step, -1, 'cancelled step -1');
    expectEqual(RECORD_STEPS.length, 6, '6 ElSteps');
    // 全集键名一致
    expectEqual(
      Object.keys(RECORD_STATUS_MAP).sort().join(','),
      ALL_STATUSES.slice().sort().join(','),
      '13 状态键名全集',
    );
  });

  it('recordStepIndex 与 RECORD_STATUS_MAP.step 一致', () => {
    expectEqual(recordStepIndex('draft'), 0, 'draft → 0');
    expectEqual(recordStepIndex('manager_scoring'), 1, 'manager_scoring → 1');
    expectEqual(recordStepIndex('archived'), 5, 'archived → 5');
    expectEqual(recordStepIndex('rejected'), -1, 'rejected → -1');
    expectEqual(recordStepIndex(null), 0, 'null → 0 兜底');
  });

  it('canRecordStageAction 三维判定（动作 × 状态 × 权限）', () => {
    // 1. employee + 自评阶段 + 本人记录 → true
    const employee = mockUser(['employee'], ['performance:record:read', 'performance:self:submit']);
    expectEqual(
      canRecordStageAction('self', { status: 'draft', employeeId: 'emp-self' }, employee, true),
      true,
      'employee 自评 + 本人 → true',
    );
    // 但不是本人 → false
    expectEqual(
      canRecordStageAction('self', { status: 'draft', employeeId: 'emp-other' }, employee, false),
      false,
      'employee 自评 + 非本人 → false',
    );

    // 2. hr + ai 请求 → false（ai:request 仅 dept_head/executive；hr 无此权限）
    const hr = mockUser(['hr'], [
      'performance:record:read',
      'performance:record:write',
      'performance:hr:summary',
      'performance:ai:read',
    ]);
    expectEqual(
      canRecordStageAction('ai', { status: 'manager_scoring', employeeId: 'emp1' }, hr, false),
      false,
      'hr + ai 请求 → false',
    );

    // 3. dept_head + manager 阶段 → true
    const deptHead = mockUser(['dept_head'], [
      'performance:record:read',
      'performance:manager:score',
      'performance:dept:calibrate',
      'performance:ai:request',
      'performance:ai:read',
    ]);
    expectEqual(
      canRecordStageAction('manager', { status: 'manager_scoring', employeeId: 'emp1' }, deptHead, false),
      true,
      'dept_head + manager 阶段 → true',
    );

    // 4. executive + ceo 阶段 → true
    const executive = mockUser(['executive'], [
      'performance:record:read',
      'performance:ceo:approve',
      'performance:ai:request',
      'performance:ai:read',
    ]);
    expectEqual(
      canRecordStageAction('ceo', { status: 'ceo_approving', employeeId: 'emp1' }, executive, false),
      true,
      'executive + ceo 阶段 → true',
    );

    // 5. hr + ceo 阶段 → false（ceo:approve 仅 executive；hr 无此权限）
    expectEqual(
      canRecordStageAction('ceo', { status: 'ceo_approving', employeeId: 'emp1' }, hr, false),
      false,
      'hr + ceo 阶段 → false',
    );

    // 6. reject 仅在 8 个 REJECTABLE_STATUSES 内可触发
    expectEqual(
      canRecordStageAction('reject', { status: 'manager_scoring', employeeId: 'emp1' }, hr, false),
      true,
      'reject + manager_scoring + hr → true',
    );
    expectEqual(
      canRecordStageAction('reject', { status: 'archived', employeeId: 'emp1' }, hr, false),
      false,
      'reject + archived → false (不在 REJECTABLE_STATUSES)',
    );
    expectEqual(
      canRecordStageAction('reject', { status: 'ceo_approved', employeeId: 'emp1' }, hr, false),
      false,
      'reject + ceo_approved → false',
    );

    // 7. archive 仅在 ceo_approved 阶段可触发
    expectEqual(
      canRecordStageAction('archive', { status: 'ceo_approved', employeeId: 'emp1' }, hr, false),
      true,
      'archive + ceo_approved + hr → true',
    );
    expectEqual(
      canRecordStageAction('archive', { status: 'archived', employeeId: 'emp1' }, hr, false),
      false,
      'archive + archived → false (重复归档拦截)',
    );
  });

  it('canRecordSelfEdit 员工本人 + draft + self:submit', () => {
    const employee = mockUser(['employee'], ['performance:record:read', 'performance:self:submit']);
    expectEqual(
      canRecordSelfEdit({ status: 'draft', employeeId: 'emp-self' }, employee, true),
      true,
      '本人 + draft → true',
    );
    expectEqual(
      canRecordSelfEdit({ status: 'manager_scoring', employeeId: 'emp-self' }, employee, true),
      false,
      '本人 + manager_scoring → false (状态不匹配)',
    );
    expectEqual(
      canRecordSelfEdit({ status: 'draft', employeeId: 'emp-other' }, employee, false),
      false,
      '非本人 + draft → false',
    );
  });

  it('canRecordAiRead employee 不可见', () => {
    const employee = mockUser(['employee'], ['performance:record:read', 'performance:self:submit']);
    expectEqual(canRecordAiRead(employee), false, 'employee 无 ai:read');
    const hr = mockUser(['hr'], ['performance:ai:read']);
    expectEqual(canRecordAiRead(hr), true, 'hr 有 ai:read');
  });

  it('PERFORMANCE_D2_MENU 1 项 · filterPerformanceMenu 拼接 employee 可见', () => {
    expectEqual(PERFORMANCE_D2_MENU.length, 1, 'D2 1 菜单');
    expectEqual(PERFORMANCE_D2_MENU[0].key, 'records', 'records key');
    expectEqual(PERFORMANCE_D2_MENU[0].permission, 'performance:record:read', 'record:read 权限');

    // D1 菜单未改
    expectEqual(PERFORMANCE_MENU.length, 5, 'D1 5 菜单未动');
    // 拼接
    const hr = mockUser(['hr'], [
      'performance:cycle:read',
      'performance:indicator:read',
      'performance:scheme:read',
      'performance:coefficient:read',
      'performance:grade:threshold:read',
      'performance:record:read',
    ]);
    const items = filterPerformanceMenu(hr);
    expectEqual(items.length, 6, 'hr 6 菜单 = 5 + records');
    expectEqual(
      items.some((m) => m.key === 'records'),
      true,
      'hr 可见 records',
    );

    // employee 仅有 record:read → 菜单只剩 records
    const employee = mockUser(['employee'], ['performance:record:read']);
    const empItems = filterPerformanceMenu(employee);
    expectEqual(empItems.length, 1, 'employee 仅 1 项');
    expectEqual(empItems[0].key, 'records', 'employee → records');

    // 无权限用户
    const noPerm = mockUser(['guest'], []);
    expectEqual(filterPerformanceMenu(noPerm).length, 0, '无权限 → 0');
  });

  it('resolvePerformanceActiveKey records 路径分支', () => {
    expectEqual(resolvePerformanceActiveKey('/performance/records'), 'records', 'records active');
    expectEqual(
      resolvePerformanceActiveKey('/performance/records/abc-123'),
      'records',
      'records/:id active',
    );
    // 旧 5 分支仍正常
    expectEqual(resolvePerformanceActiveKey('/performance/cycles'), 'cycles', 'cycles');
  });

  it('路由表 children 12 条（1 redirect + 5 D1 + 2 D2 + 4 D3） + 菜单 to 路径', () => {
    const children = performanceRoutes[0].children ?? [];
    expectEqual(children.length, 12, '1 redirect + 5 D1 + 2 D2 + 4 D3 children');
    // M5-2-D3 追加 4 路由（grade-actions / payout-config / payouts / payouts/:id）导致本用例更新：
    // children 顺序 = 1 redirect + 5 D1 (idx 1-5) + 2 D2 (idx 6-7: records / records/:id) + 4 D3 (idx 8-11)
    // D2 两条路由位置不变（仍为 idx 6/7）
    const d2Two = children.slice(6, 8);
    expectEqual(d2Two[0].path, 'records', 'idx 6 path=records');
    expectEqual(d2Two[1].path, 'records/:id', 'idx 7 path=records/:id');
    // 最后 2 个是 D3 路由（payouts / payouts/:id）
    const lastTwo = children.slice(-2);
    expectEqual(lastTwo[0].path, 'payouts', '倒数第 2 path=payouts');
    expectEqual(lastTwo[1].path, 'payouts/:id', '倒数第 1 path=payouts/:id');
    // 6 菜单 to（含 records）
    const allMenuItems = filterPerformanceMenu(
      mockUser(
        ['admin'],
        [
          'performance:cycle:read',
          'performance:indicator:read',
          'performance:scheme:read',
          'performance:coefficient:read',
          'performance:grade:threshold:read',
          'performance:record:read',
        ],
      ),
    );
    expectEqual(
      allMenuItems.map((m) => m.to).join(','),
      [
        '/performance/cycles',
        '/performance/indicators',
        '/performance/schemes',
        '/performance/coefficients',
        '/performance/grade-thresholds',
        '/performance/records',
      ].join(','),
      '6 菜单 to 路径顺序',
    );
  });

  it('unwrapRecordList 3 形态汇总', () => {
    const flat = unwrapRecordList({ success: true, items: [{ id: 'r1' }], total: 1 });
    expectEqual(flat.items.length, 1, 'flat');
    const nested = unwrapRecordList({ success: true, data: { items: [{ id: 'r1' }], total: 1 } });
    expectEqual(nested.items.length, 1, 'nested');
    const arr = unwrapRecordList({ success: true, data: [{ id: 'r1' }], total: 1 });
    expectEqual(arr.items.length, 1, 'array data');
  });
});

export async function runPerformanceRecordViewTests(): Promise<number> {
  await Promise.all(cases.map((item) => Promise.resolve(item.fn())));
  return cases.length;
}

export const performanceRecordViewTestCount = cases.length;