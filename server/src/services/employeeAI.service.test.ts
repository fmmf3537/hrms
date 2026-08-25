// M1-A2: employeeAI.service 单元测试 | HRMS
/* eslint-disable import/first */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await */

import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  empFindFirst: vi.fn(),
  auditLog: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    employee: { findFirst: mocks.empFindFirst },
  },
}));

vi.mock('./integration.service', () => ({
  send: mocks.send,
}));

vi.mock('./audit.service', () => ({
  AUDIT_ACTIONS: {
    AI_OCR: 'AI_OCR', AI_SUMMARIZE: 'AI_SUMMARIZE',
  },
  AUDIT_RESOURCE_TYPES: { EMPLOYEE: 'Employee' },
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

import * as employeeAIService from './employeeAI.service';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.send.mockResolvedValue({
    success: true,
    data: { content: '[MOCK LLM] hello', tokens: 100, cost: 0.01 },
  });
});

describe('employeeAI.service', () => {
  it('parseIdCard 返回结构化字段（mock fallback）', async () => {
    const result = await employeeAIService.parseIdCard('base64img==', 'u-1');
    expect(result.name).toBeTruthy();
    expect(result.idCardNumber).toMatch(/^\d+$/);
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'llm',
        payload: expect.objectContaining({ type: 'chat' }),
      }),
    );
    expect(mocks.auditLog).toHaveBeenCalled();
  });

  it('parseBankCard 返回银行信息', async () => {
    const result = await employeeAIService.parseBankCard('base64img==');
    expect(result.bankName).toContain('银行');
    expect(result.cardNumber).toBeTruthy();
  });

  it('parseCertificate 返回证书信息', async () => {
    const result = await employeeAIService.parseCertificate('base64img==');
    expect(result.name).toBeTruthy();
    expect(result.number).toBeTruthy();
  });

  it('parseIdCard 空图 → 60121', async () => {
    await expect(employeeAIService.parseIdCard('')).rejects.toMatchObject({ code: 60121 });
  });

  it('generateEmployeeSummary 成功', async () => {
    mocks.empFindFirst.mockResolvedValue({
      id: 'e-1',
      name: '张三',
      employeeNo: 'XACH20260001',
      status: 'active',
      hireDate: new Date('2026-01-01'),
      contractType: 'formal',
      educationLevel: '本科',
      departmentId: 'd-1',
    });
    mocks.send.mockResolvedValue({
      success: true,
      data: {
        content: JSON.stringify({
          summary: '稳定可靠的骨干',
          highlights: ['绩效优秀', '无缺勤'],
        }),
        tokens: 50,
        cost: 0.02,
      },
    });

    const result = await employeeAIService.generateEmployeeSummary('e-1', 'u-1');
    expect(result.summary).toContain('骨干');
    expect(result.highlights).toHaveLength(2);
    expect(mocks.auditLog).toHaveBeenCalled();
  });

  it('generateEmployeeSummary 员工不存在 → 71201', async () => {
    mocks.empFindFirst.mockResolvedValue(null);
    await expect(
      employeeAIService.generateEmployeeSummary('missing'),
    ).rejects.toMatchObject({ code: 71201 });
  });
});
