// M3-D3: performance_calibration_ratio.service 单元测试
/* eslint-disable import/first, import/order */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-call */

import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  deptFindMany: vi.fn(),
  deptFindUnique: vi.fn(),
  cycleFindFirst: vi.fn(),
  recordFindMany: vi.fn(),
  auditFindMany: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    department: {
      findMany: mocks.deptFindMany,
      findUnique: mocks.deptFindUnique,
    },
    performanceCycle: { findFirst: mocks.cycleFindFirst },
    performanceRecord: { findMany: mocks.recordFindMany },
    auditLog: { findMany: mocks.auditFindMany },
  },
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

import {
  calibrateDepartmentRatios,
  getCalibrationWarnings,
} from './performance_calibration_ratio.service';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getValue.mockImplementation(async (_c: string, key: string) => {
    if (key === 'grade.distribution') {
      return {
        S: 0.1, A: 0.2, B: 0.5, C: 0.15, D: 0.05,
      };
    }
    if (key === 'calibration.ratio_tolerance') return 0.02;
    if (key === 'grade.calibration_strategy') return 'warn_only';
    return null;
  });
  mocks.deptFindMany.mockResolvedValue([
    { id: 'dept-1', name: '产教服务部' },
    { id: 'dept-2', name: '技术部' },
  ]);
  mocks.cycleFindFirst.mockResolvedValue({ id: 'cyc-1' });
  mocks.recordFindMany.mockResolvedValue([
    { finalGrade: 'S' },
    { finalGrade: 'S' },
    { finalGrade: 'A' },
    { finalGrade: 'B' },
    { finalGrade: 'B' },
    { finalGrade: 'B' },
    { finalGrade: 'C' },
    { finalGrade: 'D' },
    { finalGrade: 'D' },
    { finalGrade: 'B' },
  ]);
  mocks.deptFindUnique.mockResolvedValue({ id: 'dept-1', name: '产教服务部' });
  mocks.auditFindMany.mockResolvedValue([{ id: 'log-1' }]);
});

describe('calibrateDepartmentRatios', () => {
  it('2 个部门返回比例 + 结果', async () => {
    const result = await calibrateDepartmentRatios('user-1', ['dept-1', 'dept-2'], 'cyc-1');
    expect(result.results).toHaveLength(2);
    expect(result.results[0].totalRecords).toBe(10);
  });

  it('S 比例过高触发警告', async () => {
    mocks.recordFindMany.mockResolvedValue([
      { finalGrade: 'S' },
      { finalGrade: 'S' },
      { finalGrade: 'S' },
    ]);
    const result = await calibrateDepartmentRatios('user-1', ['dept-1'], 'cyc-1');
    expect(result.results[0].warnings.some((w) => w.includes('S 比例过高'))).toBe(true);
  });

  it('deptId 不存在抛 72609', async () => {
    mocks.deptFindMany.mockResolvedValue([{ id: 'dept-1', name: 'A' }]);
    await expect(calibrateDepartmentRatios('user-1', ['dept-1', 'bad-dept']))
      .rejects.toMatchObject({ code: 72609 });
  });

  it('无 record 部门返 0 比例 + 无警告', async () => {
    mocks.recordFindMany.mockResolvedValue([]);
    const result = await calibrateDepartmentRatios('user-1', ['dept-1'], 'cyc-1');
    expect(result.results[0].totalRecords).toBe(0);
    expect(result.results[0].warnings).toHaveLength(0);
  });

  it('不修改 finalGrade（只读软警告）', async () => {
    await calibrateDepartmentRatios('user-1', ['dept-1'], 'cyc-1');
    expect(mocks.auditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'CALIBRATION_RATIO_CHECK',
    }));
  });
});

describe('getCalibrationWarnings', () => {
  it('返 audit 最近记录', async () => {
    const logs = await getCalibrationWarnings('user-1', 'dept-1', 'cyc-1');
    expect(logs).toHaveLength(1);
  });

  it('无历史返空数组', async () => {
    mocks.auditFindMany.mockResolvedValue([]);
    const logs = await getCalibrationWarnings('user-1', 'dept-1');
    expect(logs).toEqual([]);
  });
});
