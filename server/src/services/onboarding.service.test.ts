// M1-A3: onboarding.service 单元测试 | HRMS
/* eslint-disable import/first */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-call */

import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  companyFindFirst: vi.fn(),
  deptFindFirst: vi.fn(),
  onboardingCreate: vi.fn(),
  onboardingFindUnique: vi.fn(),
  onboardingFindMany: vi.fn(),
  onboardingCount: vi.fn(),
  onboardingUpdate: vi.fn(),
  empFindFirst: vi.fn(),
  empCreate: vi.fn(),
  userCreate: vi.fn(),
  roleFindUnique: vi.fn(),
  posCreate: vi.fn(),
  salCreate: vi.fn(),
  transaction: vi.fn(),
  auditLog: vi.fn(),
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => (v.startsWith('enc:') ? v.slice(4) : v)),
  getValue: vi.fn(),
  sendNotification: vi.fn(),
  submitApproval: vi.fn(),
  withdraw: vi.fn(),
  parseIdCard: vi.fn(),
  parseBankCard: vi.fn(),
  parseCertificate: vi.fn(),
  bcryptHash: vi.fn().mockResolvedValue('hashed'),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    company: { findFirst: mocks.companyFindFirst },
    department: { findFirst: mocks.deptFindFirst },
    onboardingRecord: {
      create: mocks.onboardingCreate,
      findUnique: mocks.onboardingFindUnique,
      findMany: mocks.onboardingFindMany,
      count: mocks.onboardingCount,
      update: mocks.onboardingUpdate,
    },
    employee: {
      findFirst: mocks.empFindFirst,
      create: mocks.empCreate,
    },
    user: { create: mocks.userCreate },
    role: { findUnique: mocks.roleFindUnique },
    employeePositionHistory: { create: mocks.posCreate },
    employeeSalaryHistory: { create: mocks.salCreate },
    $transaction: mocks.transaction,
  },
}));

vi.mock('./audit.service', () => ({
  AUDIT_ACTIONS: {
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
    AI_OCR: 'AI_OCR',
  },
  AUDIT_RESOURCE_TYPES: {},
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./crypto.service', () => ({
  encrypt: mocks.encrypt,
  decrypt: mocks.decrypt,
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

vi.mock('./notification.service', () => ({
  sendNotification: mocks.sendNotification.mockResolvedValue({ logId: 'l1' }),
}));

vi.mock('./approval.service', () => ({
  submitApproval: mocks.submitApproval,
  withdraw: mocks.withdraw,
}));

vi.mock('./employeeAI.service', () => ({
  parseIdCard: mocks.parseIdCard,
  parseBankCard: mocks.parseBankCard,
  parseCertificate: mocks.parseCertificate,
}));

vi.mock('bcryptjs', () => ({
  default: { hash: mocks.bcryptHash, compare: vi.fn() },
}));

import * as onboardingService from './onboarding.service';

const company = {
  id: 'c-1', code: 'XACH', deletedAt: null, status: 'active',
};
const dept = {
  id: 'd-1', companyId: 'c-1', deletedAt: null, code: 'TECH', name: '技术部',
};

const completeMaterials = {
  idCard: true, bankCard: true, degreeCert: true,
};

const makeRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'ob-1',
  name: '测试新员工',
  gender: 'male',
  birthDate: null,
  phone: null,
  email: 'new@test.com',
  companyId: 'c-1',
  departmentId: 'd-1',
  hireDate: new Date('2026-09-01'),
  contractType: 'formal',
  probationMonths: 3,
  baseSalary: null,
  idCard: null,
  idCardOcrAt: null,
  bankName: null,
  bankCard: null,
  bankCardOcrAt: null,
  certificates: null,
  materialsChecklist: completeMaterials,
  status: 'draft',
  approvalInstanceId: null,
  employeeId: null,
  createdBy: 'u-hr',
  createdAt: new Date(),
  updatedAt: new Date(),
  cancelledAt: null,
  cancelledReason: null,
  tasks: [
    {
      id: 't1', name: '设备发放', category: 'equipment', status: 'pending',
    },
    {
      id: 't2', name: '工位安排', category: 'workspace', status: 'pending',
    },
    {
      id: 't3', name: '导师分配', category: 'mentor', status: 'pending',
    },
    {
      id: 't4', name: '培训安排', category: 'training', status: 'pending',
    },
  ],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getValue.mockImplementation(async (category: string, key: string) => {
    const map: Record<string, unknown> = {
      'onboarding.required_materials': ['idCard', 'bankCard', 'degreeCert'],
      'onboarding.checklist': ['设备发放', '工位安排', '导师分配', '培训安排'],
      'onboarding.default_role': 'employee',
      'onboarding.default_password_pattern': 'Welcome@{seq4}',
      'employee_no.format': '{company_code}{year}{seq:4}',
      'probation.months': 3,
    };
    return map[`${category}.${key}`];
  });
});

describe('onboarding.service', () => {
  it('createOnboarding 正常路径（草稿 + 4 tasks）', async () => {
    mocks.companyFindFirst.mockResolvedValue(company);
    mocks.deptFindFirst.mockResolvedValue(dept);
    const created = makeRecord();
    mocks.onboardingCreate.mockResolvedValue(created);

    const result = await onboardingService.createOnboarding({
      name: '测试新员工',
      companyId: 'c-1',
      departmentId: 'd-1',
      hireDate: '2026-09-01',
      contractType: 'formal',
      materialsChecklist: completeMaterials,
      createdBy: 'u-hr',
    });

    expect(result.tasks).toHaveLength(4);
    expect(mocks.onboardingCreate).toHaveBeenCalled();
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', resourceType: 'OnboardingRecord' }),
    );
  });

  it('createOnboarding 必填材料缺失 → 71307', async () => {
    await expect(
      onboardingService.createOnboarding({
        name: '缺材料',
        companyId: 'c-1',
        departmentId: 'd-1',
        hireDate: '2026-09-01',
        contractType: 'formal',
        materialsChecklist: { idCard: true },
      }),
    ).rejects.toMatchObject({ code: 71307 });
  });

  it('getOnboardingById 正常 + 不存在 → 71301', async () => {
    mocks.onboardingFindUnique.mockResolvedValueOnce(makeRecord());
    const row = await onboardingService.getOnboardingById('ob-1');
    expect(row.id).toBe('ob-1');

    mocks.onboardingFindUnique.mockResolvedValueOnce(null);
    await expect(onboardingService.getOnboardingById('x')).rejects.toMatchObject({
      code: 71301,
    });
  });

  it('listOnboardings 分页 + 过滤', async () => {
    mocks.onboardingFindMany.mockResolvedValue([makeRecord()]);
    mocks.onboardingCount.mockResolvedValue(1);
    const result = await onboardingService.listOnboardings({
      companyId: 'c-1', status: 'draft', page: 1, pageSize: 10,
    });
    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
  });

  it('updateOnboarding 仅 draft 可改（submitted → 71303）', async () => {
    mocks.onboardingFindUnique.mockResolvedValue(
      makeRecord({ status: 'submitted' }),
    );
    await expect(
      onboardingService.updateOnboarding('ob-1', { name: '改名' }),
    ).rejects.toMatchObject({ code: 71303 });
  });

  it('parseOnboardingOCR 三种类型', async () => {
    mocks.onboardingFindUnique.mockResolvedValue(makeRecord());
    mocks.parseIdCard.mockResolvedValue({
      name: '张三',
      idCardNumber: '610102199001011234',
      gender: 'male',
      birthDate: '1990-01-01',
      address: '西安',
      issueAuthority: '公安',
      validPeriod: '2015-2035',
    });
    mocks.parseBankCard.mockResolvedValue({
      bankName: '工行', cardNumber: '622202123', cardType: 'debit',
    });
    mocks.parseCertificate.mockResolvedValue({
      name: '执照',
      number: 'UAV-1',
      issueDate: '2020-01-01',
      expireDate: '2030-01-01',
      issuer: '民航局',
    });
    mocks.onboardingUpdate.mockResolvedValue(makeRecord());

    await onboardingService.parseOnboardingOCR('ob-1', 'idCard', 'img1', 'u-hr');
    expect(mocks.parseIdCard).toHaveBeenCalled();

    mocks.onboardingFindUnique.mockResolvedValue(makeRecord());
    await onboardingService.parseOnboardingOCR('ob-1', 'bankCard', 'img2', 'u-hr');
    expect(mocks.parseBankCard).toHaveBeenCalled();

    mocks.onboardingFindUnique.mockResolvedValue(makeRecord());
    await onboardingService.parseOnboardingOCR('ob-1', 'certificate', 'img3', 'u-hr');
    expect(mocks.parseCertificate).toHaveBeenCalled();
  });

  it('submitOnboarding draft → submitted', async () => {
    mocks.onboardingFindUnique.mockResolvedValue(makeRecord());
    mocks.submitApproval.mockResolvedValue({
      id: 'appr-1', currentNodeId: 'n1', status: 'pending',
    });
    mocks.onboardingUpdate.mockResolvedValue(
      makeRecord({ status: 'submitted', approvalInstanceId: 'appr-1' }),
    );

    const result = await onboardingService.submitOnboarding('ob-1', 'u-hr');
    expect(result.status).toBe('submitted');
    expect(mocks.submitApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        flowKey: 'onboarding:onboarding_approval',
        businessType: 'onboarding',
      }),
    );
  });

  it('submitOnboarding 材料缺失 → 71307', async () => {
    mocks.onboardingFindUnique.mockResolvedValue(
      makeRecord({ materialsChecklist: { idCard: true } }),
    );
    await expect(
      onboardingService.submitOnboarding('ob-1', 'u-hr'),
    ).rejects.toMatchObject({ code: 71307 });
  });

  it('confirmOnboarding approved 后创建 employee + user', async () => {
    mocks.onboardingFindUnique.mockResolvedValue(
      makeRecord({ status: 'submitted', approvalInstanceId: 'appr-1' }),
    );
    mocks.companyFindFirst.mockResolvedValue(company);
    mocks.empFindFirst.mockResolvedValue(null);
    mocks.roleFindUnique.mockResolvedValue({ id: 'role-emp', code: 'employee' });

    const approved = makeRecord({
      status: 'approved', employeeId: 'e-new', approvalInstanceId: 'appr-1',
    });
    mocks.transaction.mockImplementation(async (fn: any) => {
      const tx = {
        user: {
          create: vi.fn().mockResolvedValue({ id: 'u-new', username: 'uxach20260006' }),
        },
        employee: {
          create: vi.fn().mockResolvedValue({
            id: 'e-new', employeeNo: 'XACH20260006', name: '测试新员工',
          }),
        },
        employeeSalaryHistory: { create: vi.fn() },
        employeePositionHistory: { create: mocks.posCreate },
        onboardingRecord: { update: vi.fn().mockResolvedValue(approved) },
      };
      return fn(tx);
    });

    const result = await onboardingService.confirmOnboarding(
      'ob-1',
      { approved: true, instanceId: 'appr-1' },
      'u-hr',
    );
    expect(result.status).toBe('approved');
    expect(mocks.sendNotification).toHaveBeenCalled();
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'APPROVE' }),
    );
  });

  it('confirmOnboarding 工号生成（与 A2 算法一致）', async () => {
    mocks.onboardingFindUnique.mockResolvedValue(
      makeRecord({ status: 'submitted' }),
    );
    mocks.companyFindFirst.mockResolvedValue(company);
    mocks.empFindFirst
      .mockResolvedValueOnce({ employeeNo: 'XACH20260005' }) // generate 取最新
      .mockResolvedValueOnce(null); // 冲突校验
    mocks.roleFindUnique.mockResolvedValue({ id: 'role-emp', code: 'employee' });

    let capturedNo = '';
    mocks.transaction.mockImplementation(async (fn: any) => {
      const tx = {
        user: {
          create: vi.fn().mockResolvedValue({ id: 'u-new' }),
        },
        employee: {
          create: vi.fn().mockImplementation(({ data }: any) => {
            capturedNo = data.employeeNo;
            return { id: 'e-new', employeeNo: data.employeeNo, name: data.name };
          }),
        },
        employeeSalaryHistory: { create: vi.fn() },
        employeePositionHistory: { create: vi.fn() },
        onboardingRecord: {
          update: vi.fn().mockResolvedValue(makeRecord({ status: 'approved' })),
        },
      };
      return fn(tx);
    });

    await onboardingService.confirmOnboarding(
      'ob-1',
      { approved: true },
      'u-hr',
    );
    expect(capturedNo).toBe('XACH20260006');
  });

  it('cancelOnboarding draft 取消（无审批）', async () => {
    mocks.onboardingFindUnique.mockResolvedValue(makeRecord({ status: 'draft' }));
    mocks.onboardingUpdate.mockResolvedValue(
      makeRecord({ status: 'cancelled' }),
    );
    const result = await onboardingService.cancelOnboarding('ob-1', '放弃', 'u-hr');
    expect(result.status).toBe('cancelled');
    expect(mocks.withdraw).not.toHaveBeenCalled();
  });

  it('cancelOnboarding submitted 取消（withdraw）', async () => {
    mocks.onboardingFindUnique.mockResolvedValue(
      makeRecord({ status: 'submitted', approvalInstanceId: 'appr-1' }),
    );
    mocks.withdraw.mockResolvedValue({ id: 'appr-1', status: 'withdrawn' });
    mocks.onboardingUpdate.mockResolvedValue(
      makeRecord({ status: 'cancelled' }),
    );
    await onboardingService.cancelOnboarding('ob-1', '撤回', 'u-hr');
    expect(mocks.withdraw).toHaveBeenCalledWith({
      instanceId: 'appr-1', initiatorId: 'u-hr',
    });
  });

  it('cancelOnboarding approved → 71303', async () => {
    mocks.onboardingFindUnique.mockResolvedValue(
      makeRecord({ status: 'approved' }),
    );
    await expect(
      onboardingService.cancelOnboarding('ob-1', 'x', 'u-hr'),
    ).rejects.toMatchObject({ code: 71303 });
  });

  it('OCR 失败 → 71309', async () => {
    mocks.onboardingFindUnique.mockResolvedValue(makeRecord());
    mocks.parseIdCard.mockRejectedValue(new Error('llm down'));
    await expect(
      onboardingService.parseOnboardingOCR('ob-1', 'idCard', 'bad', 'u-hr'),
    ).rejects.toMatchObject({ code: 71309 });
  });

  it('审计写入验证', async () => {
    mocks.companyFindFirst.mockResolvedValue(company);
    mocks.deptFindFirst.mockResolvedValue(dept);
    mocks.onboardingCreate.mockResolvedValue(makeRecord());
    await onboardingService.createOnboarding({
      name: '审计测',
      companyId: 'c-1',
      departmentId: 'd-1',
      hireDate: '2026-09-01',
      contractType: 'formal',
      materialsChecklist: completeMaterials,
      createdBy: 'u-hr',
    });
    expect(mocks.auditLog).toHaveBeenCalled();
  });

  it('通知发送验证（confirm）', async () => {
    mocks.onboardingFindUnique.mockResolvedValue(
      makeRecord({ status: 'submitted' }),
    );
    mocks.companyFindFirst.mockResolvedValue(company);
    mocks.empFindFirst.mockResolvedValue(null);
    mocks.roleFindUnique.mockResolvedValue({ id: 'role-emp', code: 'employee' });
    mocks.transaction.mockImplementation(async (fn: any) => {
      const tx = {
        user: { create: vi.fn().mockResolvedValue({ id: 'u-new' }) },
        employee: {
          create: vi.fn().mockResolvedValue({
            id: 'e-new', employeeNo: 'XACH20260010', name: '测试新员工',
          }),
        },
        employeeSalaryHistory: { create: vi.fn() },
        employeePositionHistory: { create: vi.fn() },
        onboardingRecord: {
          update: vi.fn().mockResolvedValue(makeRecord({ status: 'approved' })),
        },
      };
      return fn(tx);
    });

    await onboardingService.confirmOnboarding('ob-1', { approved: true }, 'u-hr');
    expect(mocks.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ templateKey: 'onboarding_confirmed:in_app' }),
    );
  });

  it('状态机非法转换 draft → approved → 71303', async () => {
    mocks.onboardingFindUnique.mockResolvedValue(makeRecord({ status: 'draft' }));
    await expect(
      onboardingService.confirmOnboarding('ob-1', { approved: true }, 'u-hr'),
    ).rejects.toMatchObject({ code: 71303 });
  });
});
