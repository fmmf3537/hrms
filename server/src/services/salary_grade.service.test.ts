// M4-C1: salary_grade.service 单元测试
/* eslint-disable import/first, import/order */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-call */

import { Decimal } from '@prisma/client/runtime/library';
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  gradeFindUnique: vi.fn(),
  gradeCreate: vi.fn(),
  gradeUpdate: vi.fn(),
  gradeFindMany: vi.fn(),
  gradeCount: vi.fn(),
  levelCount: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    salaryGrade: {
      findUnique: mocks.gradeFindUnique,
      create: mocks.gradeCreate,
      update: mocks.gradeUpdate,
      findMany: mocks.gradeFindMany,
      count: mocks.gradeCount,
    },
    salaryGradeLevel: {
      count: mocks.levelCount,
    },
  },
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

import * as gradeService from './salary_grade.service';

const M1_INPUT = {
  sequence: 'M',
  gradeCode: 'M1',
  name: '高管 M1',
  minBaseSalary: 20000,
  maxBaseSalary: 30000,
  minPerformanceBase: 8000,
  maxPerformanceBase: 20000,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getValue.mockImplementation(async (_c: string, key: string) => {
    const map: Record<string, unknown> = {
      'grade.sequences': ['M', 'T', 'P', 'S', 'A'],
      'grade.fixed_floating_ratio': {
        M: 0.6, T: 0.8, P: 0.75, S: 0, A: 0.85,
      },
    };
    return map[key] ?? null;
  });
  mocks.gradeFindUnique.mockResolvedValue(null);
  mocks.gradeCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'grade-1',
    ...data,
  }));
  mocks.gradeUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'grade-1',
    sequence: 'M',
    gradeCode: 'M1',
    ...data,
  }));
  mocks.levelCount.mockResolvedValue(0);
});

describe('salary_grade.service', () => {
  describe('createGrade', () => {
    it('创建 M1 薪级：minBase=20000 maxBase=30000 成功', async () => {
      const result = await gradeService.createGrade('admin-1', M1_INPUT);
      expect(result.gradeCode).toBe('M1');
      expect(result.status).toBe('active');
      expect(Number(result.minBaseSalary)).toBe(20000);
      expect(mocks.auditLog).toHaveBeenCalled();
    });

    it('sequence 不在 M/T/P/S/A 抛 73004', async () => {
      await expect(gradeService.createGrade('admin-1', {
        ...M1_INPUT, sequence: 'X',
      })).rejects.toMatchObject({ statusCode: 400, code: 73004 });
    });

    it('sequence=M + gradeCode=M1 已存在抛 73002', async () => {
      mocks.gradeFindUnique.mockResolvedValue({ id: 'exists', ...M1_INPUT });
      await expect(gradeService.createGrade('admin-1', M1_INPUT))
        .rejects.toMatchObject({ statusCode: 400, code: 73002 });
    });

    it('minBase ≥ maxBase 抛 73003', async () => {
      await expect(gradeService.createGrade('admin-1', {
        ...M1_INPUT, minBaseSalary: 30000, maxBaseSalary: 20000,
      })).rejects.toMatchObject({ statusCode: 400, code: 73003 });
    });
  });

  describe('updateGrade', () => {
    it('active 可改 range + name', async () => {
      mocks.gradeFindUnique.mockResolvedValue({
        id: 'grade-1',
        status: 'active',
        name: '高管 M1',
        minBaseSalary: new Decimal(20000),
        maxBaseSalary: new Decimal(30000),
        minPerformanceBase: new Decimal(8000),
        maxPerformanceBase: new Decimal(20000),
        gradeCode: 'M1',
      });
      const result = await gradeService.updateGrade('admin-1', 'grade-1', {
        name: '高管 M1 调整', minBaseSalary: 21000, maxBaseSalary: 32000,
      });
      expect(result.name).toBe('高管 M1 调整');
    });

    it('archived 不可改抛 400', async () => {
      mocks.gradeFindUnique.mockResolvedValue({
        id: 'grade-1', status: 'archived', gradeCode: 'M1',
      });
      await expect(gradeService.updateGrade('admin-1', 'grade-1', { name: 'x' }))
        .rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('archiveGrade', () => {
    it('无 active level 关联时归档成功', async () => {
      mocks.gradeFindUnique.mockResolvedValue({
        id: 'grade-1', status: 'active', gradeCode: 'M1',
      });
      mocks.levelCount.mockResolvedValue(0);
      const result = await gradeService.archiveGrade('admin-1', 'grade-1');
      expect(result.status).toBe('archived');
    });

    it('有 active level 关联抛 400', async () => {
      mocks.gradeFindUnique.mockResolvedValue({
        id: 'grade-1', status: 'active', gradeCode: 'M1',
      });
      mocks.levelCount.mockResolvedValue(2);
      await expect(gradeService.archiveGrade('admin-1', 'grade-1'))
        .rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('listGrades', () => {
    it('filter sequence=M 只返 M 系列', async () => {
      mocks.gradeFindMany.mockResolvedValue([{ id: 'g1', sequence: 'M', gradeCode: 'M1' }]);
      mocks.gradeCount.mockResolvedValue(1);
      const result = await gradeService.listGrades('admin-1', { sequence: 'M' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].sequence).toBe('M');
      expect(mocks.gradeFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ sequence: 'M' }) }),
      );
    });
  });
});
