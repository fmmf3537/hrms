/**
 * 员工生命周期视图 + 状态机单测（M5-2-A2）内联断言
 */
import organizationRoutes, { ORG_MENU, resolveOrgActiveKey } from '@/router/organization';
import {
  LIFECYCLE_STATUS_LABELS,
  lifecycleStatusLabel,
  type CreateOnboardingRequest,
} from '@/api/types/organization';
import OnboardingList from '@/views/organization/onboarding/OnboardingList.vue';
import RegularizationList from '@/views/organization/regularization/RegularizationList.vue';
import TransferList from '@/views/organization/transfer/TransferList.vue';
import OffboardingList from '@/views/organization/offboarding/OffboardingList.vue';
import ContractList from '@/views/organization/contract/ContractList.vue';

interface Case {
  name: string;
  fn: () => void;
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

describe('views/__tests__/employee-lifecycle.test.ts', () => {
  it('5 模块列表页组件可导入（onboarding / regularization / transfer / offboarding / contract）', () => {
    expectEqual(typeof OnboardingList, 'object', 'OnboardingList');
    expectEqual(typeof RegularizationList, 'object', 'RegularizationList');
    expectEqual(typeof TransferList, 'object', 'TransferList');
    expectEqual(typeof OffboardingList, 'object', 'OffboardingList');
    expectEqual(typeof ContractList, 'object', 'ContractList');
  });

  it('5 status enum 标签覆盖 A3-A7（提交/签署/交接/证明）', () => {
    expectEqual(lifecycleStatusLabel('draft'), '草稿', 'draft');
    expectEqual(lifecycleStatusLabel('submitted'), '已提交', 'submitted');
    expectEqual(lifecycleStatusLabel('approved'), '已通过', 'approved');
    expectEqual(LIFECYCLE_STATUS_LABELS.handover_pending, '待交接', 'A6 handover');
    expectEqual(LIFECYCLE_STATUS_LABELS.certificate_issued, '已发证明', 'A6 cert');
    expectEqual(LIFECYCLE_STATUS_LABELS.pending_signature, '待签署', 'A7 pending');
    expectEqual(LIFECYCLE_STATUS_LABELS.signing, '签署中', 'A7 signing');
    expectEqual(LIFECYCLE_STATUS_LABELS.signed, '已签署', 'A7 signed');
  });

  it('工号由后端生成（A3 创建表单类型不传 employeeNo）', () => {
    const payload: CreateOnboardingRequest = {
      name: '王五',
      companyId: 'c',
      departmentId: 'd',
      hireDate: '2026-09-01',
      contractType: 'formal',
    };
    expectEqual('employeeNo' in payload, false, 'no employeeNo');
  });

  it('路由：offboarding/:id/certificate 在 offboarding/:id 之前；5 列表路由存在', () => {
    const children = organizationRoutes[0].children ?? [];
    const names = children.map((c) => c.name).filter(Boolean);
    expectEqual(names.includes('OnboardingList'), true, 'onboarding');
    expectEqual(names.includes('RegularizationList'), true, 'regularization');
    expectEqual(names.includes('TransferList'), true, 'transfer');
    expectEqual(names.includes('OffboardingList'), true, 'offboarding');
    expectEqual(names.includes('ContractList'), true, 'contract');
    const certIdx = children.findIndex((c) => c.path === 'offboarding/:id/certificate');
    const detailIdx = children.findIndex((c) => c.path === 'offboarding/:id');
    expectEqual(certIdx >= 0 && certIdx < detailIdx, true, 'certificate before :id');
  });

  it('菜单 5 项 + activeKey；webhook 不是 Vue 路由', () => {
    const keys = ORG_MENU.map((m) => m.key);
    expectEqual(keys.includes('onboarding'), true, 'menu onboarding');
    expectEqual(keys.includes('regularizations'), true, 'menu regularization');
    expectEqual(keys.includes('transfers'), true, 'menu transfer');
    expectEqual(keys.includes('offboarding'), true, 'menu offboarding');
    expectEqual(keys.includes('contracts'), true, 'menu contracts');
    expectEqual(resolveOrgActiveKey('/org/onboarding/x'), 'onboarding', 'active onboarding');
    expectEqual(resolveOrgActiveKey('/org/contracts/c1'), 'contracts', 'active contract');
    const children = organizationRoutes[0].children ?? [];
    expectEqual(
      children.some((c) => String(c.path).includes('webhook')),
      false,
      'no vue webhook route',
    );
    const perms = ORG_MENU.map((m) => m.permission).join(',');
    expectEqual(perms.includes('finance'), false, 'no finance');
  });
});

export function runEmployeeLifecycleTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const employeeLifecycleTestCount = cases.length;
