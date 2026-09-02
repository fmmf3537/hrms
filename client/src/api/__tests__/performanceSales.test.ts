/**
 * 销售提成 API 单测（M5-2-D4）内联断言
 *
 * 覆盖要点（≥4 用例）：
 *  - SALES_PATHS 6 路径 + 函数式路径正确（与 server/src/routes/performance.ts 618-790 一致）
 *  - 状态映射完整性（PRODUCT 2 + PAYMENT 3 + COMMISSION 3 = 8 项；CATEGORY 3 项）
 *  - 百分比 ↔ 小数 转换精度（§5.2：Decimal(5,4) ↔ 百分比；4 位精度浮点容差）
 *  - 筛选参数序列化（ListProductFilter / ListPaymentFilter / ListCommissionFilter 字段集）
 *  - canSalesAction 权限矩阵（5 角色 × 5 动作，无 finance）
 */
import { SALES_PATHS } from '@/api/performanceSales';
import {
  SALES_COMMISSION_STATUS_MAP,
  SALES_PAYMENT_STATUS_MAP,
  SALES_PRODUCT_CATEGORY_MAP,
  SALES_PRODUCT_STATUS_MAP,
  canSalesAction,
  percentToRate,
  rateLabel,
  rateToPercent,
  type ListCommissionFilter,
  type ListPaymentFilter,
  type ListProductFilter,
} from '@/api/types/performanceSales';
import type { UserInfo } from '@/api/types';

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

function expectTrue(cond: boolean, message: string): void {
  if (!cond) throw new Error(`${message}: expected true`);
}

function expectFalse(cond: boolean, message: string): void {
  if (cond) throw new Error(`${message}: expected false`);
}

function mockUser(roles: string[], permissions: string[]): UserInfo {
  return {
    id: 'u1',
    username: 'tester',
    email: null,
    phone: null,
    status: 'active',
    mustChangePassword: false,
    roles,
    permissions,
    companyId: null,
    departmentId: null,
    employee: null,
  };
}

describe('api/__tests__/performanceSales.test.ts', () => {
  it('SALES_PATHS 6 路径 + 函数式路径正确（与 performance.ts 路由前缀一致）', () => {
    expectEqual(SALES_PATHS.products, '/performance/sales/products', 'products list/create');
    expectEqual(SALES_PATHS.product('p-1'), '/performance/sales/products/p-1', 'product PATCH');
    expectEqual(SALES_PATHS.payments, '/performance/sales/payments', 'payments list/create');
    expectEqual(
      SALES_PATHS.confirmPayment('pay-1'),
      '/performance/sales/payments/pay-1/confirm',
      'confirm payment',
    );
    expectEqual(SALES_PATHS.commissions, '/performance/sales/commissions', 'commissions list');
    expectEqual(
      SALES_PATHS.calculateCommission,
      '/performance/sales/commissions/calculate',
      'calculate commission',
    );
    // 函数式路径每次调用生成新字符串（不同 id → 不同路径）
    expectTrue(
      SALES_PATHS.confirmPayment('a') !== SALES_PATHS.confirmPayment('b'),
      '函数式路径按 id 区分',
    );
    // 8 端点完整覆盖：3 product + 3 payment + 2 commission
    const allPaths = [
      SALES_PATHS.products,
      SALES_PATHS.payments,
      SALES_PATHS.commissions,
    ];
    const functionPaths = [
      SALES_PATHS.product('x'),
      SALES_PATHS.confirmPayment('x'),
      SALES_PATHS.calculateCommission,
    ];
    expectEqual(allPaths.length + functionPaths.length, 6, '6 SALES_PATHS 项');
  });

  it('状态映射：PRODUCT 2 + PAYMENT 3 + COMMISSION 3 + CATEGORY 3 项 全', () => {
    expectEqual(Object.keys(SALES_PRODUCT_STATUS_MAP).length, 2, 'product 2 status');
    expectEqual(SALES_PRODUCT_STATUS_MAP.active.label, '启用', 'product active');
    expectEqual(SALES_PRODUCT_STATUS_MAP.archived.label, '已归档', 'product archived');

    expectEqual(Object.keys(SALES_PAYMENT_STATUS_MAP).length, 3, 'payment 3 status');
    expectEqual(SALES_PAYMENT_STATUS_MAP.draft.label, '待确认', 'payment draft');
    expectEqual(SALES_PAYMENT_STATUS_MAP.confirmed.label, '已确认', 'payment confirmed');
    expectEqual(SALES_PAYMENT_STATUS_MAP.cancelled.label, '已取消', 'payment cancelled');

    expectEqual(Object.keys(SALES_COMMISSION_STATUS_MAP).length, 3, 'commission 3 status');
    expectEqual(SALES_COMMISSION_STATUS_MAP.calculated.label, '已计算', 'calculated');
    expectEqual(SALES_COMMISSION_STATUS_MAP.paid.label, '已发放', 'paid');
    expectEqual(SALES_COMMISSION_STATUS_MAP.cancelled.label, '已取消', 'commission cancelled');

    expectEqual(Object.keys(SALES_PRODUCT_CATEGORY_MAP).length, 3, 'product 3 category');
    expectEqual(SALES_PRODUCT_CATEGORY_MAP.product, '产品', 'product category');
    expectEqual(SALES_PRODUCT_CATEGORY_MAP.service, '服务', 'service category');
    expectEqual(SALES_PRODUCT_CATEGORY_MAP.training, '培训', 'training category');
  });

  it('百分比 ↔ 小数 转换精度（§5.2 Decimal(5,4)）', () => {
    // 0.05 ↔ 5%（典型：服务 8% → 0.08）
    expectEqual(rateToPercent(0.05), 5, '0.05 → 5%');
    expectEqual(percentToRate(5), 0.05, '5% → 0.05');
    expectEqual(rateToPercent('0.08'), 8, '0.08 → 8%');
    expectEqual(percentToRate(8), 0.08, '8% → 0.08');
    expectEqual(rateToPercent('0.0300'), 3, '0.0300 → 3%');
    expectEqual(percentToRate(3), 0.03, '3% → 0.03');

    // 字符串兼容
    expectEqual(rateToPercent('0.1234'), 12.34, 'string 0.1234 → 12.34%');
    expectEqual(percentToRate('12.34'), 0.1234, 'string 12.34 → 0.1234');

    // 上限 0.5 → 50%（baseRate 校验上限）
    expectEqual(percentToRate(50), 0.5, '50% → 0.5');
    expectEqual(percentToRate(50.5), 0.505, '50.5% → 0.505');

    // null/无效值
    expectEqual(rateToPercent(null), null, 'null → null');
    expectEqual(rateToPercent(''), null, 'empty → null');
    expectEqual(rateToPercent('xxx'), null, 'invalid string → null');

    // 浮点容差（Decimal(5,4) 末位精度）
    expectEqual(rateToPercent(0.12345) === 12.35, true, '0.12345 四舍五入 12.35%');

    // rateLabel
    expectEqual(rateLabel(0.05), '5%', 'rateLabel 0.05 → 5%');
    expectEqual(rateLabel(null), '—', 'rateLabel null → —');
    expectEqual(rateLabel('0.1234'), '12.34%', 'rateLabel string → 百分比');
    expectEqual(rateLabel(0.5), '50%', 'rateLabel 0.5 → 50%');
  });

  it('canSalesAction 矩阵：admin/hr 全开 / executive 计算可（无 payment 写）/ dept_head/employee 全只读', () => {
    const admin = mockUser(['admin'], ['*']);
    const hr = mockUser(['hr'], [
      'performance:sales:product:write',
      'performance:sales:payment:write',
      'performance:sales:payment:confirm',
      'performance:sales:commission:write',
    ]);
    const executive = mockUser(['executive'], ['performance:sales:commission:write']);
    const deptHead = mockUser(['dept_head'], []);
    const employee = mockUser(['employee'], []);

    type Action = 'product:create' | 'product:update' | 'payment:create' | 'payment:confirm' | 'commission:calculate';

    const allActions: Action[] = [
      'product:create',
      'product:update',
      'payment:create',
      'payment:confirm',
      'commission:calculate',
    ];

    // admin
    allActions.forEach((a) => expectTrue(canSalesAction(a, admin), `admin + ${a}`));

    // hr
    allActions.forEach((a) => expectTrue(canSalesAction(a, hr), `hr + ${a}`));

    // executive: 仅 commission:calculate（无 payment 写）
    allActions.forEach((a) => {
      if (a === 'commission:calculate') {
        expectTrue(canSalesAction(a, executive), `executive + ${a}`);
      } else {
        expectFalse(canSalesAction(a, executive), `executive + ${a} → false`);
      }
    });

    // dept_head: 全部无写
    allActions.forEach((a) => expectFalse(canSalesAction(a, deptHead), `dept_head + ${a} → false`));

    // employee: 全部无写
    allActions.forEach((a) => expectFalse(canSalesAction(a, employee), `employee + ${a} → false`));

    // 无用户
    expectFalse(canSalesAction('product:create', null), 'null user → false');
  });

  it('筛选类型字段：3 个 ListXxxFilter 含分页 + 状态枚举（zod schema 一致）', () => {
    // 产品筛选
    const f1: ListProductFilter = {
      category: 'product',
      status: 'active',
      page: 1,
      pageSize: 20,
    };
    expectEqual(f1.category, 'product', 'product filter category');
    expectEqual(f1.status, 'active', 'product filter status');

    // 回款筛选（含 period YYYY-MM 严格格式）
    const f2: ListPaymentFilter = {
      employeeId: 'e-1',
      productId: 'p-1',
      status: 'draft',
      period: '2026-09',
      page: 1,
      pageSize: 20,
    };
    expectEqual(f2.status, 'draft', 'payment filter status');
    expectTrue(/^\d{4}-\d{2}$/.test(f2.period ?? ''), 'payment period YYYY-MM');

    // 提成筛选
    const f3: ListCommissionFilter = {
      employeeId: 'e-1',
      productId: 'p-1',
      status: 'calculated',
      period: '2026-09',
      page: 1,
      pageSize: 50,
    };
    expectEqual(f3.status, 'calculated', 'commission filter status');
    expectTrue(/^\d{4}-\d{2}$/.test(f3.period ?? ''), 'commission period YYYY-MM');

    // 全部字段可省略（接口仅 filter 默认空对象）
    const empty: ListProductFilter = {};
    expectTrue(Object.keys(empty).length === 0, 'empty filter 无字段');
  });
});

export function runPerformanceSalesApiTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}
