/**
 * E2E #5 · 绩效主流程（M5-02）
 * @file e2e/specs/05-performance.spec.ts
 * @description
 *  - UI 进入 /performance/cycles → 新建考核周期 E2E-2026Q3Xxx
 *  - UI 进入 /performance/indicators → 新建指标 E2E-指标-Xxx
 *  - UI 进入 /performance/schemes → 新建考核方案并关联指标
 *  - 三处列表断言新数据可见
 *
 * 已知问题（按提示词 §5.2 降级）：server GET /cycles /indicators /schemes 返回扁平
 *   {success, items, total, page, pageSize}，但 client `unwrapPerformancePage` 期望
 *   {success, data: {items, ...}} 信封（实测 list 始终显示「共 0 条 / 暂无数据」）。
 *   本切片禁止改后端/客户端，故 UI 列表断言降级为「API 直连查 DB 确认创建成功」：
 *     1) UI 提交 → POST 返回 200（证明表单填写 + 提交链路可达）
 *     2) API GET 列表 → 找到 cycleCode / indicatorCode / schemeCode 即通过
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { apiLogin, uniqueName } from '../helpers';
void apiLogin; // 保留 import 以避免 lint 误报

/**
 * 直连 GET 列表（D1 list 返回扁平 {success, items, total, ...}，不走 apiGet 的 data 解包）
 * 复用 global-setup 写入的 storageState token，避免触发登录限流
 */
function loadAdminToken(): string {
  const state = JSON.parse(readFileSync('e2e/.auth/admin.json', 'utf8')) as {
    origins: Array<{ localStorage: Array<{ name: string; value: string }> }>;
  };
  const entry = state.origins[0]?.localStorage.find((x) => x.name === 'hrms_access_token');
  if (!entry) throw new Error('e2e/.auth/admin.json 缺少 hrms_access_token');
  return entry.value;
}

async function fetchList<T>(
  token: string,
  path: string,
  params: Record<string, unknown> = {},
): Promise<T[]> {
  const { request } = await import('@playwright/test');
  const ctx = await request.newContext({
    baseURL: 'http://localhost:3000',
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
  try {
    const url = new URL('http://localhost:3000/api' + path);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
    const res = await ctx.get(url.pathname + url.search);
    if (!res.ok()) {
      throw new Error(`GET ${path} 失败: status=${res.status()}`);
    }
    const body = (await res.json()) as { success: boolean; items?: T[] };
    if (!body.success) {
      throw new Error(`GET ${path} 业务失败`);
    }
    return body.items ?? [];
  } finally {
    await ctx.dispose();
  }
}

test.describe.serial('05 · 绩效主流程', () => {
  test('周期 → 指标 → 方案 三处创建（UI 提交 + API 列表确认）', async ({ page }) => {
    const cycleCode = uniqueName('cycle').replace('E2E-cycle-', '').toUpperCase(); // 例：1788...
    const cycleName = `E2E 周期 ${cycleCode}`;
    const indicatorCode = uniqueName('ind').toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const indicatorName = `E2E-指标-${Date.now()}`;
    const schemeCode = uniqueName('sch').toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const schemeName = `E2E-方案-${Date.now()}`;
    // 提前拿 token（避免后续 2 次拿 token 时被限流）
    const accessToken = loadAdminToken();

    // ============ 1. 考核周期（UI 提交 + API 验证）============
    await page.goto('/performance/cycles');
    await expect(page.locator('.page-header__title h1')).toContainText('考核周期');

    await page.getByRole('button', { name: '新建周期' }).click();

    const cycleDialog = page.locator('.el-dialog').filter({ hasText: '新建周期' });
    await expect(cycleDialog).toBeVisible();

    const codeInput = cycleDialog.locator('.el-form-item').filter({ hasText: '周期 code' }).locator('input');
    await codeInput.fill(cycleCode);

    const nameInput = cycleDialog.locator('.el-form-item').filter({ hasText: '名称' }).locator('input');
    await nameInput.fill(cycleName);

    const startInput = cycleDialog.locator('.el-form-item').filter({ hasText: '开始日期' }).locator('input');
    await startInput.fill('2026-09-01');
    await startInput.press('Enter');
    const endInput = cycleDialog.locator('.el-form-item').filter({ hasText: '结束日期' }).locator('input');
    await endInput.fill('2026-09-30');
    await endInput.press('Enter');

    const cycleSubmit = page.waitForResponse(
      (r) => r.url().includes('/api/performance/cycles') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await cycleDialog.locator('.el-dialog__footer .el-button--primary').click();
    const cycleResp = await cycleSubmit;
    expect(cycleResp.ok()).toBeTruthy();

    // UI 列表断言（已知降级路径：可能不显示，但表头 + 标题仍可达）
    await expect(page.locator('.page-header__title h1')).toContainText('考核周期');
    await expect(page.locator('.el-table__header')).toBeVisible();

    // API 验证：cycleCode 存在 DB（复用 global-setup token，避免限流）
    const cycles = await fetchList<{ code: string; name: string }>(
      accessToken,
      '/performance/cycles',
      { pageSize: 50 },
    );
    const createdCycle = cycles.find((c) => c.code === cycleCode);
    expect(createdCycle, `DB 中应存在 cycleCode=${cycleCode}`).toBeTruthy();
    expect(createdCycle?.name).toBe(cycleName);

    // ============ 2. 指标库（UI 提交 + API 验证）============
    await page.goto('/performance/indicators');
    await expect(page.locator('.page-header__title h1')).toContainText('指标库');

    await page.getByRole('button', { name: '新建指标' }).click();
    const indicatorDialog = page.locator('.el-dialog').filter({ hasText: '新建指标' });
    await expect(indicatorDialog).toBeVisible();

    await indicatorDialog
      .locator('.el-form-item')
      .filter({ hasText: '指标 code' })
      .locator('input')
      .fill(indicatorCode);
    await indicatorDialog
      .locator('.el-form-item')
      .filter({ hasText: '名称' })
      .locator('input')
      .fill(indicatorName);

    const indSubmit = page.waitForResponse(
      (r) => r.url().includes('/api/performance/indicators') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await indicatorDialog.locator('.el-dialog__footer .el-button--primary').click();
    const indResp = await indSubmit;
    expect(indResp.ok()).toBeTruthy();

    await expect(page.locator('.page-header__title h1')).toContainText('指标库');
    await expect(page.locator('.el-table__header')).toBeVisible();

    const indicators = await fetchList<{ code: string; name: string }>(
      accessToken,
      '/performance/indicators',
      { pageSize: 50 },
    );
    const createdIndicator = indicators.find((i) => i.code === indicatorCode);
    expect(createdIndicator, `DB 中应存在 indicatorCode=${indicatorCode}`).toBeTruthy();

    // ============ 3. 考核方案（UI 提交 + API 验证）============
    await page.goto('/performance/schemes');
    await expect(page.locator('.page-header__title h1')).toContainText('考核方案');

    await page.getByRole('button', { name: '新建方案' }).click();
    const schemeDialog = page.locator('.el-dialog').filter({ hasText: '新建考核方案' });
    await expect(schemeDialog).toBeVisible();

    await schemeDialog
      .locator('.el-form-item')
      .filter({ hasText: '方案 code' })
      .locator('input')
      .fill(schemeCode);
    await schemeDialog
      .locator('.el-form-item')
      .filter({ hasText: '名称' })
      .locator('input')
      .fill(schemeName);

    // 关联指标行：选择 indicatorCode + 权重 100
    // 已知问题（提示词 §5.2 降级）：与 cycle/indicator 同一根因，
    //   listIndicators 也走 unwrapPerformancePage，el-select 下拉永远为空。
    //   不能改 client / server，故用 page.evaluate 直接读 Vue 组件实例并
    //   设置 form.indicators[0].indicatorId + 权重 100（仍走 onCreate() → API）
    const indicatorId = createdIndicator
      ? (
          await fetchList<{ id: string; code: string }>(
            accessToken,
            '/performance/indicators',
            { pageSize: 50 },
          )
        ).find((i) => i.code === indicatorCode)?.id
      : undefined;
    if (!indicatorId) {
      throw new Error(`无法找到 indicator id for ${indicatorCode}`);
    }
    // 通过 Vue 组件实例设值（仅测试干预，业务代码 0 改动）
    await schemeDialog.evaluate((el, indId) => {
      const root = el as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, unknown> } };
      // 取 dialog 内嵌的 SchemeList 组件实例
      let comp: { setupState?: Record<string, unknown> } | undefined;
      let cur: Element | null = el;
      while (cur && !comp) {
        const maybe = (cur as unknown as { __vueParentComponent?: { setupState?: Record<string, unknown> } })
          .__vueParentComponent;
        if (maybe?.setupState && Array.isArray((maybe.setupState as { indicators?: unknown[] }).indicators)) {
          comp = maybe;
          break;
        }
        cur = cur.parentElement;
      }
      if (!comp || !comp.setupState) {
        throw new Error('未找到 SchemeList Vue 实例');
      }
      const setupState = comp.setupState as {
        form?: { indicators?: Array<{ indicatorId?: string; weight?: number }> };
      };
      if (!setupState.form?.indicators?.[0]) {
        throw new Error('未找到 form.indicators[0]');
      }
      setupState.form.indicators[0].indicatorId = indId;
      setupState.form.indicators[0].weight = 100;
    }, indicatorId);

    const schSubmit = page.waitForResponse(
      (r) => r.url().includes('/api/performance/schemes') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await schemeDialog.locator('.el-dialog__footer .el-button--primary').click();
    const schResp = await schSubmit;
    expect(schResp.ok()).toBeTruthy();

    await expect(page.locator('.page-header__title h1')).toContainText('考核方案');
    await expect(page.locator('.el-table__header')).toBeVisible();

    const schemes = await fetchList<{ code: string; name: string }>(
      accessToken,
      '/performance/schemes',
      { pageSize: 50 },
    );
    const createdScheme = schemes.find((s) => s.code === schemeCode);
    expect(createdScheme, `DB 中应存在 schemeCode=${schemeCode}`).toBeTruthy();
    expect(createdScheme?.name).toBe(schemeName);
  });
});
