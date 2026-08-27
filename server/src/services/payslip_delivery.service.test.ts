// M4-C5: payslip_delivery.service 单元测试
/* eslint-disable import/first, import/order */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-call */

import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  payslipFindUnique: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
  sendNotification: vi.fn(),
  generatePayslip: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    payslip: { findUnique: mocks.payslipFindUnique },
  },
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

vi.mock('./notification.service', () => ({
  sendNotification: mocks.sendNotification,
}));

vi.mock('./payslip_generator.service', () => ({
  generatePayslip: mocks.generatePayslip,
}));

import * as delivery from './payslip_delivery.service';

const ACTOR = 'hr-1';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: new Date(2026, 8, 10) });
  mocks.getValue.mockImplementation(async (_c: string, key: string) => {
    if (key === 'payslip.email_subject') return '您的 {period} 工资条';
    if (key === 'payslip.delivery_methods') return ['email', 'system'];
    return 'default';
  });
  mocks.payslipFindUnique.mockResolvedValue({
    id: 'ps-1',
    period: '2026-09',
    status: 'approved',
    netAmount: 8900,
    employee: { name: '张三', userId: 'u-1' },
  });
  mocks.generatePayslip.mockResolvedValue({
    html: '<p>工资条</p>',
    pdf: Buffer.from('pdf'),
    fileName: 'payslip.pdf',
  });
  mocks.sendNotification.mockResolvedValue({ logId: 'n-1', status: 'pending' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('payslip_delivery.service', () => {
  it('邮件 + 系统通知发送成功（mock notification）', async () => {
    const r = await delivery.deliverPayslip(ACTOR, 'ps-1');
    expect(r.emailStatus).toBe('sent');
    expect(r.systemStatus).toBe('sent');
    expect(mocks.sendNotification).toHaveBeenCalledTimes(2);
  });

  it('仅邮件发送（methods=["email"]）', async () => {
    const r = await delivery.deliverPayslip(ACTOR, 'ps-1', { methods: ['email'] });
    expect(r.emailStatus).toBe('sent');
    expect(r.systemStatus).toBe('skipped');
    expect(mocks.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('邮件发送失败抛 73508', async () => {
    mocks.sendNotification.mockRejectedValue(new Error('smtp down'));
    await expect(delivery.deliverPayslip(ACTOR, 'ps-1')).rejects.toMatchObject({ code: 73508 });
  });

  it('deliveredAt 写入结果（payslips 无 paidAt，记 audit）', async () => {
    const r = await delivery.deliverPayslip(ACTOR, 'ps-1');
    expect(r.deliveredAt).toBeInstanceOf(Date);
  });

  it('audit 记录 methods + status', async () => {
    await delivery.deliverPayslip(ACTOR, 'ps-1');
    expect(mocks.auditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'PAYSLIP_DELIVER',
      newValue: expect.objectContaining({
        methods: ['email', 'system'],
        emailStatus: 'sent',
        systemStatus: 'sent',
      }),
    }));
  });
});
