// M4-C1: salary_grade_level.service 单元测试
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
  levelFindUnique: vi.fn(),
  levelFindMany: vi.fn(),
  levelCreate: vi.fn(),
  levelUpdate: vi.fn(),
  levelCount: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    salaryGrade: {
      findUnique: mocks.gradeFindUnique,
    },
    salaryGradeLevel: {
      findUnique: mocks.levelFindUnique,
      findMany: mocks.levelFindMany,
      create: mocks.levelCreate,
      update: mocks.levelUpdate,
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

import * as levelService from './salary_grade_level.service';

const GRADE = {
  id: 'grade-1',
  sequence: 'M',
  gradeCode: 'M1',
  minBaseSalary: new Decimal(20000),
  maxBaseSalary: new Decimal(30000),
  minPerformanceBase: new Decimal(8000),
  maxPerformanceBase: new Decimal(20000),
  status: 'active',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getValue.mockImplementation(async (_c: string, key: string) => {
    const map: Record<string, unknown> = {
      'grade.levels_per_grade': 6,
    };
    return map[key] ?? null;
  });
  mocks.gradeFindUnique.mockResolvedValue(GRADE);
  mocks.levelFindUnique.mockResolvedValue(null);
  mocks.levelFindMany.mockResolvedValue([]);
  mocks.levelCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'level-1',
    ...data,
  }));
  mocks.levelUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'level-1',
    gradeId: 'grade-1',
    level: 1,
    ...data,
  }));
});

describe('salary_grade_level.service', () => {
  describe('createLevel', () => {
    it('创建 M1-1 薪档 baseSalary=20000 成功', async () => {
      const result = await levelService.createLevel('admin-1', {
        gradeId: 'grade-1', level: 1, baseSalary: 20000, performanceBase: 8000,
      });
      expect(result.level).toBe(1);
      expect(Number(result.baseSalary)).toBe(20000);
      expect(result.status).toBe('active');
      expect(mocks.auditLog).toHaveBeenCalled();
    });

    it('同 gradeId+level 重复抛 73006', async () => {
      mocks.levelFindUnique.mockResolvedValue({ id: 'exists', gradeId: 'grade-1', level: 1 });
      await expect(levelService.createLevel('admin-1', {
        gradeId: 'grade-1', level: 1, baseSalary: 20000, performanceBase: 8000,
      })).rejects.toMatchObject({ statusCode: 400, code: 73006 });
    });

    it('baseSalary < grade.minBase 抛 73007', async () => {
      await expect(levelService.createLevel('admin-1', {
        gradeId: 'grade-1', level: 1, baseSalary: 10000, performanceBase: 8000,
      })).rejects.toMatchObject({ statusCode: 400, code: 73007 });
    });

    it('baseSalary > grade.maxBase 抛 73007', async () => {
      await expect(levelService.createLevel('admin-1', {
        gradeId: 'grade-1', level: 1, baseSalary: 40000, performanceBase: 8000,
      })).rejects.toMatchObject({ statusCode: 400, code: 73007 });
    });

    it('level=7 > levels_per_grade=6 抛 400', async () => {
      await expect(levelService.createLevel('admin-1', {
        gradeId: 'grade-1', level: 7, baseSalary: 20000, performanceBase: 8000,
      })).rejects.toMatchObject({ statusCode: 400 });
    });

    it('level=2 baseSalary < level=1 baseSalary 抛 73008', async () => {
      mocks.levelFindMany.mockResolvedValue([
        {
          id: 'lv-1', gradeId: 'grade-1', level: 1, baseSalary: new Decimal(22000), status: 'active',
        },
      ]);
      await expect(levelService.createLevel('admin-1', {
        gradeId: 'grade-1', level: 2, baseSalary: 20000, performanceBase: 9000,
      })).rejects.toMatchObject({ statusCode: 400, code: 73008 });
    });
  });

  describe('updateLevel', () => {
    it('active 可改 baseSalary（受 73007 校验）', async () => {
      mocks.levelFindUnique.mockResolvedValue({
        id: 'level-1',
        gradeId: 'grade-1',
        level: 1,
        baseSalary: new Decimal(20000),
        performanceBase: new Decimal(8000),
        status: 'active',
      });
      const result = await levelService.updateLevel('admin-1', 'level-1', { baseSalary: 21000 });
      expect(Number(result.baseSalary)).toBe(21000);
    });

    it('levelId 不存在抛 73005', async () => {
      mocks.levelFindUnique.mockResolvedValue(null);
      await expect(levelService.updateLevel('admin-1', 'missing', { baseSalary: 21000 }))
        .rejects.toMatchObject({ statusCode: 400, code: 73005 });
    });
  });

  describe('archiveLevel', () => {
    it('active → archived 成功', async () => {
      mocks.levelFindUnique.mockResolvedValue({
        id: 'level-1', status: 'active', gradeId: 'grade-1', level: 1,
      });
      const result = await levelService.archiveLevel('admin-1', 'level-1');
      expect(result.status).toBe('archived');
    });

    it('已 archived 抛 400', async () => {
      mocks.levelFindUnique.mockResolvedValue({
        id: 'level-1', status: 'archived', gradeId: 'grade-1', level: 1,
      });
      await expect(levelService.archiveLevel('admin-1', 'level-1'))
        .rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
