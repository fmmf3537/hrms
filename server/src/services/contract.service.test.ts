// M1-A7: contract.service 单元测试 | HRMS
/* eslint-disable import/first, import/order */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-call */

import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  empFindFirst: vi.fn(),
  ctCreate: vi.fn(),
  ctFindUnique: vi.fn(),
  ctFindFirst: vi.fn(),
  ctFindMany: vi.fn(),
  ctCount: vi.fn(),
  ctUpdate: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
  sendNotification: vi.fn(),
  submitApproval: vi.fn(),
  withdraw: vi.fn(),
  decrypt: vi.fn(),
  isEncrypted: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    employee: { findFirst: mocks.empFindFirst },
    contractRecord: {
      create: mocks.ctCreate,
      findUnique: mocks.ctFindUnique,
      findFirst: mocks.ctFindFirst,
      findMany: mocks.ctFindMany,
      count: mocks.ctCount,
      update: mocks.ctUpdate,
    },
  },
}));

vi.mock('./audit.service', () => ({
  AUDIT_ACTIONS: {
    CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE',
  },
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
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

vi.mock('./crypto.service', () => ({
  decrypt: mocks.decrypt,
  isEncrypted: mocks.isEncrypted,
}));

import * as contractService from './contract.service';

const templates = {
  formal: '/templates/contract-formal.html',
  intern: '/templates/contract-intern.html',
  consultant: '/templates/contract-consultant.html',
  labor: '/templates/contract-labor.html',
  nda: '/templates/contract-nda.html',
};

const employee = {
  id: 'emp-1',
  name: '张三',
  status: 'active',
  userId: 'u-1',
  deletedAt: null,
};

const makeRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'ct-1',
  employeeId: 'emp-1',
  contractNo: 'CT-FO-20260001',
  contractType: 'formal',
  title: '张三劳动合同',
  startDate: new Date('2026-09-01'),
  endDate: new Date('2027-08-31'),
  templateKey: 'formal',
  status: 'draft',
  esignFlowId: null,
  approvalInstanceId: null,
  signatories: [],
  createdBy: 'user-hr',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isEncrypted.mockReturnValue(false);
  mocks.decrypt.mockReturnValue('mock-webhook-secret');
  mocks.getValue.mockImplementation(async (_cat: string, key: string) => {
    const map: Record<string, unknown> = {
      templates,
      warning_days: [30, 15, 7],
      esign_provider: 'mock',
      esign_webhook_secret: 'mock-webhook-secret',
      attachment_max_size: 10 * 1024 * 1024,
      attachment_allowed_types: ['application/pdf', 'image/jpeg', 'image/png'],
      approval_flow_key: 'contract:contract_approval',
      test_mode: true,
    };
    return map[key] ?? null;
  });
  mocks.ctFindFirst.mockResolvedValue(null);
});

describe('createContract', () => {
  it('正常路径：劳动合同 + 完整字段 + 审计', async () => {
    mocks.empFindFirst.mockResolvedValue(employee);
    mocks.ctCreate.mockResolvedValue(makeRecord({ id: 'ct-new', contractNo: 'CT-FO-20260001' }));

    const result = await contractService.createContract({
      employeeId: 'emp-1',
      contractType: 'formal',
      title: '张三劳动合同',
      startDate: '2026-09-01',
      endDate: '2027-08-31',
      templateKey: 'formal',
      attachments: [{
        name: '身份证.pdf',
        url: 'https://oss.example.com/xxx.pdf',
        type: 'application/pdf',
        size: 1024,
      }],
    }, 'user-1');

    expect(result.status).toBe('draft');
    expect(result.contractNo).toMatch(/^CT-FO-\d{8}$/);
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        resourceType: 'ContractRecord',
      }),
    );
  });

  it('员工不存在 → 71201', async () => {
    mocks.empFindFirst.mockResolvedValue(null);
    await expect(contractService.createContract({
      employeeId: 'emp-1',
      contractType: 'formal',
      title: 't',
      startDate: '2026-09-01',
      endDate: '2027-08-31',
      templateKey: 'formal',
    }, 'user-1')).rejects.toMatchObject({ code: 71201 });
  });

  it('contractType 非法 → 71710', async () => {
    mocks.empFindFirst.mockResolvedValue(employee);
    await expect(contractService.createContract({
      employeeId: 'emp-1',
      contractType: 'invalid',
      title: 't',
      startDate: '2026-09-01',
      endDate: '2027-08-31',
      templateKey: 'formal',
    }, 'user-1')).rejects.toMatchObject({ code: 71710 });
  });

  it('startDate >= endDate → 71704', async () => {
    mocks.empFindFirst.mockResolvedValue(employee);
    await expect(contractService.createContract({
      employeeId: 'emp-1',
      contractType: 'formal',
      title: 't',
      startDate: '2027-01-01',
      endDate: '2026-12-31',
      templateKey: 'formal',
    }, 'user-1')).rejects.toMatchObject({ code: 71704 });
  });

  it('附件 size > 10MB → 71705', async () => {
    mocks.empFindFirst.mockResolvedValue(employee);
    await expect(contractService.createContract({
      employeeId: 'emp-1',
      contractType: 'formal',
      title: 't',
      startDate: '2026-09-01',
      endDate: '2027-08-31',
      templateKey: 'formal',
      attachments: [{
        name: 'big.pdf',
        url: 'https://x.com/big.pdf',
        type: 'application/pdf',
        size: 20 * 1024 * 1024,
      }],
    }, 'user-1')).rejects.toMatchObject({ code: 71705 });
  });

  it('附件 MIME 类型不在白名单 → 71705', async () => {
    mocks.empFindFirst.mockResolvedValue(employee);
    await expect(contractService.createContract({
      employeeId: 'emp-1',
      contractType: 'formal',
      title: 't',
      startDate: '2026-09-01',
      endDate: '2027-08-31',
      templateKey: 'formal',
      attachments: [{
        name: 'x.exe',
        url: 'https://x.com/x.exe',
        type: 'application/octet-stream',
        size: 1024,
      }],
    }, 'user-1')).rejects.toMatchObject({ code: 71705 });
  });

  it('已有 active 合同 → 71709', async () => {
    mocks.empFindFirst.mockResolvedValue(employee);
    mocks.ctFindFirst.mockResolvedValue({ id: 'ct-existing' });
    await expect(contractService.createContract({
      employeeId: 'emp-1',
      contractType: 'formal',
      title: 't',
      startDate: '2026-09-01',
      endDate: '2027-08-31',
      templateKey: 'formal',
    }, 'user-1')).rejects.toMatchObject({ code: 71709 });
  });
});

describe('updateContract', () => {
  it('draft 状态可更新', async () => {
    mocks.ctFindUnique.mockResolvedValue(makeRecord());
    mocks.ctUpdate.mockResolvedValue(makeRecord({ title: '新标题' }));

    const result = await contractService.updateContract(
      'ct-1',
      { title: '新标题' },
      'user-1',
    );
    expect(result.status).toBe('draft');
    expect(mocks.ctUpdate).toHaveBeenCalled();
  });

  it('非 draft 状态 → 71703', async () => {
    mocks.ctFindUnique.mockResolvedValue(makeRecord({ status: 'signing' }));
    await expect(contractService.updateContract('ct-1', {}, 'user-1'))
      .rejects.toMatchObject({ code: 71703 });
  });
});

describe('submitContract', () => {
  it('正常路径：draft → signing + mock e-签宝发起', async () => {
    mocks.ctFindUnique.mockResolvedValue(makeRecord());
    mocks.empFindFirst.mockResolvedValue(employee);
    mocks.submitApproval.mockResolvedValue({ id: 'instance-1' });
    mocks.ctUpdate
      .mockResolvedValueOnce(makeRecord({ status: 'pending_signature' }))
      .mockResolvedValueOnce(makeRecord({ status: 'signing', esignFlowId: 'mock-uuid' }));

    const result = await contractService.submitContract('ct-1', 'user-1');

    expect(result.status).toBe('signing');
    expect(mocks.submitApproval).toHaveBeenCalled();
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining('e-签宝 mock 发起'),
      }),
    );
  });

  it('非 draft 状态 → 71702', async () => {
    mocks.ctFindUnique.mockResolvedValue(makeRecord({ status: 'signed' }));
    await expect(contractService.submitContract('ct-1', 'user-1'))
      .rejects.toMatchObject({ code: 71702 });
  });
});

describe('handleESignCallback', () => {
  it('正常路径：mock signStatus=completed → signed + 通知 + 写 audit', async () => {
    const payload = {
      flowId: 'mock-uuid',
      signStatus: 'completed',
      signedAt: '2026-08-30T10:00:00Z',
      signatories: [{ name: '张三', role: 'employee', signed: true }],
    };
    mocks.ctFindFirst.mockResolvedValue(makeRecord({
      status: 'signing',
      esignFlowId: 'mock-uuid',
    }));
    mocks.ctUpdate.mockResolvedValue(makeRecord({
      status: 'signed',
      signedAt: new Date('2026-08-30T10:00:00Z'),
    }));
    mocks.empFindFirst.mockResolvedValue(employee);

    const result = await contractService.handleESignCallback(
      payload,
      'valid-signature',
    );

    expect(result.status).toBe('signed');
    expect(mocks.sendNotification).toHaveBeenCalled();
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'COMPLETE_SIGN' }),
    );
  });

  it('signStatus=rejected → cancelled + 通知 HR', async () => {
    mocks.ctFindFirst.mockResolvedValue(makeRecord({
      status: 'signing',
      esignFlowId: 'mock-uuid',
    }));
    mocks.ctUpdate.mockResolvedValue(makeRecord({ status: 'cancelled' }));

    const result = await contractService.handleESignCallback(
      { flowId: 'mock-uuid', signStatus: 'rejected' },
      'valid-signature',
    );

    expect(result.status).toBe('cancelled');
    expect(mocks.sendNotification).toHaveBeenCalled();
  });

  it('webhook 验签失败 → 71707', async () => {
    mocks.ctFindFirst.mockResolvedValue(makeRecord({ status: 'signing' }));
    mocks.getValue.mockImplementation(async (_c: string, key: string) => {
      if (key === 'test_mode') return false;
      if (key === 'esign_webhook_secret') return 'mock-webhook-secret';
      return templates;
    });

    const payload = { flowId: 'mock-uuid', signStatus: 'completed' };
    await expect(contractService.handleESignCallback(payload, 'invalid'))
      .rejects.toMatchObject({ code: 71707 });
  });

  it('flowId 不存在 → 71701', async () => {
    mocks.ctFindFirst.mockResolvedValue(null);
    await expect(contractService.handleESignCallback(
      { flowId: 'unknown', signStatus: 'completed' },
      'valid-signature',
    )).rejects.toMatchObject({ code: 71701 });
  });
});

describe('cancelContract', () => {
  it('draft 直接取消', async () => {
    mocks.ctFindUnique.mockResolvedValue(makeRecord({ status: 'draft' }));
    mocks.ctUpdate.mockResolvedValue(makeRecord({ status: 'cancelled' }));

    const result = await contractService.cancelContract('ct-1', '撤回', 'user-1');
    expect(result.status).toBe('cancelled');
  });

  it('pending_signature 调 approval.withdraw', async () => {
    mocks.ctFindUnique.mockResolvedValue(makeRecord({
      status: 'pending_signature',
      approvalInstanceId: 'i-1',
    }));
    mocks.ctUpdate.mockResolvedValue(makeRecord({ status: 'cancelled' }));

    await contractService.cancelContract('ct-1', '撤回', 'user-1');
    expect(mocks.withdraw).toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: 'i-1' }),
    );
  });

  it('signed 状态 → 71706', async () => {
    mocks.ctFindUnique.mockResolvedValue(makeRecord({ status: 'signed' }));
    await expect(contractService.cancelContract('ct-1', '原因', 'user-1'))
      .rejects.toMatchObject({ code: 71706 });
  });
});

describe('expireContract', () => {
  it('signed → expired + 通知', async () => {
    mocks.ctFindUnique.mockResolvedValue(makeRecord({ status: 'signed' }));
    mocks.ctUpdate.mockResolvedValue(makeRecord({ status: 'expired' }));
    mocks.empFindFirst.mockResolvedValue(employee);

    const result = await contractService.expireContract('ct-1');
    expect(result.status).toBe('expired');
    expect(mocks.sendNotification).toHaveBeenCalled();
  });
});

describe('listExpiringContracts', () => {
  it('返回 30 天内到期合同', async () => {
    mocks.ctFindMany.mockResolvedValue([makeRecord({ status: 'signed' })]);
    const result = await contractService.listExpiringContracts(30);
    expect(Array.isArray(result)).toBe(true);
    expect(mocks.ctFindMany).toHaveBeenCalled();
  });
});

describe('computeWebhookSignature', () => {
  it('生成可复现的 HMAC 签名', () => {
    const sig1 = contractService.computeWebhookSignature('{"a":1}', 'secret');
    const sig2 = contractService.computeWebhookSignature('{"a":1}', 'secret');
    expect(sig1).toBe(sig2);
    expect(sig1).toHaveLength(64);
  });
});
