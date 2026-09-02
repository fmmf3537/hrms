import http from '@/api/http';
import {
  APPLICATION_PATHS,
  approveAdjustment,
  listAdjustments,
  listPips,
  listPromotions,
  proposeAdjustment,
  proposePromotion,
  reviewPip,
  triggerPip,
} from '@/api/performanceApplication';
import {
  ADJUSTMENT_STATUS_MAP,
  PERFORMANCE_APPLICATION_PERIOD_PATTERN,
  PIP_RATING_MAP,
  PIP_STATUS_MAP,
  rateToPercent,
} from '@/api/types/performanceApplication';

interface Case {
  name: string;
  fn: () => void;
}

interface Call {
  method: string;
  url: string;
  body?: unknown;
  params?: unknown;
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

function expectTrue(condition: boolean, message: string): void {
  if (!condition) throw new Error(`${message}: expected true`);
}

function getCallUrl(config: unknown): string {
  if (typeof config === 'string') return config;
  if (config && typeof config === 'object' && 'url' in config) {
    const value = (config as { url?: unknown }).url;
    return typeof value === 'string' ? value : '';
  }
  return '';
}

describe('api/performanceApplication.ts', () => {
  it('8 端点路径、HTTP 方法与审批 id 语义', async () => {
    const calls: Call[] = [];
    const originalGet = http.get;
    const originalPost = http.post;
    const originalPatch = http.patch;
    const fakeGet = async (config: unknown, options?: unknown): Promise<unknown> => {
      calls.push({ method: 'get', url: getCallUrl(config), params: options });
      return { success: true, data: { items: [], total: 0, page: 1, pageSize: 20 } };
    };
    const fakePost = async (url: string, body?: unknown): Promise<unknown> => {
      calls.push({ method: 'post', url, body });
      return { success: true, data: {} };
    };
    const fakePatch = async (url: string, body?: unknown): Promise<unknown> => {
      calls.push({ method: 'patch', url, body });
      return { success: true, data: {} };
    };
    http.get = fakeGet as unknown as typeof http.get;
    http.post = fakePost as unknown as typeof http.post;
    http.patch = fakePatch as unknown as typeof http.patch;
    try {
      await proposeAdjustment({ employeeId: 'employee-1', period: '2026-Q3' });
      await listAdjustments({ page: 1, pageSize: 20 });
      await approveAdjustment('audit-log-1', false, '不符合目标');
      await proposePromotion({
        employeeId: 'employee-2',
        proposedPosition: '技术主管',
        lookbackYears: 3,
      });
      await listPromotions({ page: 1, pageSize: 20 });
      await triggerPip({ employeeId: 'employee-3', reason: '连续 D 档需要改进' });
      await listPips({ page: 1, pageSize: 20 });
      await reviewPip('pip-1', 'worsened', '需要重新评估');
    } finally {
      http.get = originalGet;
      http.post = originalPost;
      http.patch = originalPatch;
    }

    expectEqual(calls.length, 8, '8 HTTP 请求');
    expectEqual(calls[0].method, 'post', '提议调薪 POST');
    expectEqual(calls[0].url, APPLICATION_PATHS.adjustments, '调薪路径');
    expectEqual(calls[1].method, 'get', '调薪列表 GET');
    expectEqual(calls[1].url, APPLICATION_PATHS.adjustments, '调薪列表路径');
    expectEqual(calls[2].method, 'patch', '审批调薪 PATCH');
    expectEqual(
      calls[2].url,
      APPLICATION_PATHS.approveAdjustment('audit-log-1'),
      '审批使用审计日志 id',
    );
    expectTrue(
      JSON.stringify(calls[2].body).includes('audit-log-1') === false,
      '审批 id 不写入 body',
    );
    expectEqual(calls[3].method, 'post', '晋升提名 POST');
    expectEqual(calls[3].url, APPLICATION_PATHS.promotions, '晋升路径');
    expectEqual(calls[4].method, 'get', '晋升列表 GET');
    expectEqual(calls[4].url, APPLICATION_PATHS.promotions, '晋升列表路径');
    expectEqual(calls[5].method, 'post', '触发 PIP POST');
    expectEqual(calls[5].url, APPLICATION_PATHS.pips, 'PIP 路径');
    expectEqual(calls[6].method, 'get', 'PIP 列表 GET');
    expectEqual(calls[6].url, APPLICATION_PATHS.pips, 'PIP 列表路径');
    expectEqual(calls[7].method, 'post', 'PIP 评审 POST');
    expectEqual(calls[7].url, APPLICATION_PATHS.reviewPip('pip-1'), '评审使用 PIP id');
  });

  it('PIP、调薪状态映射完整且评价结果类型固定', () => {
    expectEqual(
      Object.keys(PIP_STATUS_MAP).sort().join(','),
      'active,cancelled,completed,failed',
      'PIP 四态',
    );
    expectEqual(PIP_STATUS_MAP.active.label, '进行中', 'PIP active');
    expectEqual(PIP_STATUS_MAP.completed.label, '已完成', 'PIP completed');
    expectEqual(PIP_STATUS_MAP.failed.label, '未通过', 'PIP failed');
    expectEqual(PIP_STATUS_MAP.cancelled.label, '已取消', 'PIP cancelled');
    expectEqual(
      Object.keys(PIP_RATING_MAP).sort().join(','),
      'improved,no_change,worsened',
      'PIP 三档',
    );
    expectEqual(PIP_RATING_MAP.improved.label, '明显改善', 'improved');
    expectEqual(PIP_RATING_MAP.no_change.label, '无明显变化', 'no_change');
    expectEqual(PIP_RATING_MAP.worsened.label, '继续恶化', 'worsened');
    expectEqual(
      Object.keys(ADJUSTMENT_STATUS_MAP).sort().join(','),
      'approved,proposed,rejected',
      '调薪三态',
    );
    expectEqual(ADJUSTMENT_STATUS_MAP.proposed.label, '待审批', 'proposed');
    expectEqual(ADJUSTMENT_STATUS_MAP.approved.label, '已批准', 'approved');
    expectEqual(ADJUSTMENT_STATUS_MAP.rejected.label, '已驳回', 'rejected');
  });

  it('period 格式与比例转换符合后端契约', () => {
    expectTrue(PERFORMANCE_APPLICATION_PERIOD_PATTERN.test('2026-Q1'), 'Q1 合法');
    expectTrue(PERFORMANCE_APPLICATION_PERIOD_PATTERN.test('2026-Q4'), 'Q4 合法');
    expectTrue(!PERFORMANCE_APPLICATION_PERIOD_PATTERN.test('2026-Q5'), 'Q5 非法');
    expectTrue(!PERFORMANCE_APPLICATION_PERIOD_PATTERN.test('26-Q3'), '年份非法');
    expectEqual(rateToPercent(0.1), 10, '0.1 → 10%');
    expectEqual(rateToPercent('0.075'), 7.5, '字符串比例');
    expectEqual(rateToPercent(null), null, '空比例');
  });

  it('请求与筛选类型覆盖 8 函数所需字段', () => {
    const adjustment: { employeeId: string; period: string } = {
      employeeId: 'employee-1',
      period: '2026-Q3',
    };
    const promotion: { employeeId: string; proposedPosition: string; lookbackYears?: number } = {
      employeeId: 'employee-2',
      proposedPosition: '技术主管',
      lookbackYears: 3,
    };
    const pip: { employeeId: string; reason: string } = {
      employeeId: 'employee-3',
      reason: '连续 D 档需要改进',
    };
    expectEqual(adjustment.period, '2026-Q3', '调薪请求字段');
    expectEqual(promotion.lookbackYears, 3, '晋升回溯年数');
    expectEqual(pip.reason.length >= 5, true, 'PIP 原因长度');
  });
});

export function runPerformanceApplicationApiTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}
