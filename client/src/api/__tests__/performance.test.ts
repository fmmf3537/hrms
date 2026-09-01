/**
 * 绩效 API 单测（M5-2-D1）内联断言
 *
 * 覆盖要点：
 *  - PERFORMANCE_PATHS 拼接（含 /performance/grade/thresholds 与 /performance/coefficients 不混淆）
 *  - CreateSchemeRequest.indicators min 1 语义 + Coefficients 五键齐全
 *  - GradeThresholds 五键齐全
 *  - 状态映射常量（CYCLE_STATUS_MAP / SCHEME_STATUS_MAP / INDICATOR_STATUS_MAP）完整性
 */
import { PERFORMANCE_PATHS } from '@/api/performance';
import {
  CYCLE_STATUS_MAP,
  GRADE_LABELS,
  INDICATOR_STATUS_MAP,
  SCHEME_STATUS_MAP,
  type Coefficients,
  type CreateSchemeRequest,
  type GradeThresholds,
} from '@/api/types/performance';

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

describe('api/performance.ts', () => {
  it('PERFORMANCE_PATHS 拼接 · grade/thresholds 与 coefficients 互不混淆', () => {
    expectEqual(PERFORMANCE_PATHS.cycles, '/performance/cycles', 'cycles');
    expectEqual(PERFORMANCE_PATHS.indicators, '/performance/indicators', 'indicators');
    expectEqual(PERFORMANCE_PATHS.schemes, '/performance/schemes', 'schemes');
    expectEqual(PERFORMANCE_PATHS.coefficients, '/performance/coefficients', 'coefficients');
    expectEqual(
      PERFORMANCE_PATHS.gradeThresholds,
      '/performance/grade/thresholds',
      'gradeThresholds',
    );
    expectEqual(PERFORMANCE_PATHS.cycle('c1'), '/performance/cycles/c1', 'cycle(id)');
    expectEqual(PERFORMANCE_PATHS.schemeClone('s1'), '/performance/schemes/s1/clone', 'clone(id)');
    // grade 与 coefficients 不应混淆（字符串比较绕开 as const literal 类型）
    expectEqual(
      String(PERFORMANCE_PATHS.gradeThresholds) !== String(PERFORMANCE_PATHS.coefficients),
      true,
      'thresholds !== coefficients',
    );
  });

  it('CreateSchemeRequest.indicators min 1 · Coefficients / GradeThresholds 五键齐全', () => {
    const req: CreateSchemeRequest = {
      code: 'SCH_2026Q1',
      name: '2026 Q1 销售方案',
      applicableScope: 'department',
      applicableDeptId: 'd1',
      indicators: [{ indicatorId: 'i1', weight: 60 }, { indicatorId: 'i2', weight: 40 }],
    };
    expectEqual(req.indicators.length, 2, 'min 1 满足');
    expectEqual(req.indicators[0].weight + req.indicators[1].weight, 100, '权重和 100');

    const coefs: Coefficients = { S: 1.5, A: 1.2, B: 1.0, C: 0.8, D: 0.5 };
    expectEqual(Object.keys(coefs).length, 5, '5 档系数');
    expectEqual(Object.keys(coefs).sort().join(','), 'A,B,C,D,S', 'S/A/B/C/D 键名');

    const thr: GradeThresholds = { S: 90, A: 80, B: 70, C: 60, D: 0 };
    expectEqual(Object.keys(thr).length, 5, '5 档阈值');
    expectEqual(thr.S > thr.A && thr.A > thr.B && thr.B > thr.C && thr.C >= thr.D, true, '顺序合法');
  });

  it('状态映射完整性（CYCLE / SCHEME / INDICATOR 三组 + GRADE 5 键）', () => {
    expectEqual(CYCLE_STATUS_MAP.draft.label, '草稿', 'cycle draft');
    expectEqual(CYCLE_STATUS_MAP.active.label, '生效', 'cycle active');
    expectEqual(CYCLE_STATUS_MAP.closed.label, '已关闭', 'cycle closed');

    expectEqual(SCHEME_STATUS_MAP.draft.label, '草稿', 'scheme draft');
    expectEqual(SCHEME_STATUS_MAP.active.label, '生效', 'scheme active');
    expectEqual(SCHEME_STATUS_MAP.archived.label, '已归档', 'scheme archived');

    expectEqual(INDICATOR_STATUS_MAP.active.label, '启用', 'indicator active');
    expectEqual(INDICATOR_STATUS_MAP.archived.label, '已归档', 'indicator archived');

    expectEqual(Object.keys(GRADE_LABELS).sort().join(','), 'A,B,C,D,S', '5 档 grade 键');
  });
});

export function runPerformanceApiTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const performanceApiTestCount = cases.length;
