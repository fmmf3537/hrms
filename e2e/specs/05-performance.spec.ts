/**
 * E2E #5 · 绩效主流程（M5-09 还原）
 * @file e2e/specs/05-performance.spec.ts
 * @description
 *  - 进入 /performance/cycles → 新建考核周期 E2E-2026Q3Xxx
 *  - 进入 /performance/indicators → 新建指标 E2E-指标-Xxx
 *  - 进入 /performance/schemes → 新建考核方案并关联指标
 *  - 三处列表 UI 断言新数据可见
 *
 * 已知问题（M5-02 → M5-09 修复）：
 *   原 server GET /cycles /indicators /schemes 三个 list 端点返回扁平信封
 *   `{ success, items, total, page, pageSize }`，与 client `unwrapPerformancePage`
 *   期望的嵌套 `{ success, data: { items, ... } }` 信封不一致，导致三处列表恒为「共 0 条」。
 *   M5-09 已修复 controller 信封（`server/src/controllers/performance.controller.ts`
 *   40/68/88 三行 `...result` → `data: result`），本 spec 同步还原为全链路 UI 断言：
 *     1) UI 提交 → 列表真实出现新条目（行内文本断言）
 *     2) 无 page.evaluate Vue 实例注入、无 API 直连兜底
 */
import { test, expect } from '@playwright/test';

test.describe.serial('05 · 绩效主流程', () => {
  test('周期 → 指标 → 方案 三处创建（UI 全链路断言）', async ({ page }) => {
    const cycleCode = `E2EC${Date.now().toString().slice(-10)}`; // 例：E2EC1788320916
    const cycleName = `E2E 周期 ${cycleCode}`;
    const indicatorCode = `E2EI${Date.now().toString().slice(-8)}`;
    const indicatorName = `E2E-指标-${Date.now()}`;
    const schemeCode = `E2ES${Date.now().toString().slice(-8)}`;
    const schemeName = `E2E-方案-${Date.now()}`;

    // ============ 1. 考核周期（UI 提交 + UI 列表可见）============
    await page.goto('/performance/cycles');
    await expect(page.locator('.page-header__title h1')).toContainText('考核周期');

    await page.getByRole('button', { name: '新建周期' }).click();
    const cycleDialog = page.locator('.el-dialog').filter({ hasText: '新建周期' });
    await expect(cycleDialog).toBeVisible();

    await cycleDialog.locator('.el-form-item').filter({ hasText: '周期 code' }).locator('input').fill(cycleCode);
    await cycleDialog.locator('.el-form-item').filter({ hasText: '名称' }).locator('input').fill(cycleName);

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
    expect(cycleResp.ok(), `新建周期 POST 期望 2xx，实际 ${cycleResp.status()}`).toBeTruthy();

    // M5-09: UI 列表真实可见新条目（不再走 page.evaluate / API 直连兜底）
    await expect(page.locator('.el-table__body tr').filter({ hasText: cycleCode })).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('.el-table__body tr').filter({ hasText: cycleName })).toBeVisible();

    // ============ 2. 指标库（UI 提交 + UI 列表可见）============
    await page.goto('/performance/indicators');
    await expect(page.locator('.page-header__title h1')).toContainText('指标库');

    await page.getByRole('button', { name: '新建指标' }).click();
    const indicatorDialog = page.locator('.el-dialog').filter({ hasText: '新建指标' });
    await expect(indicatorDialog).toBeVisible();

    await indicatorDialog.locator('.el-form-item').filter({ hasText: '指标 code' }).locator('input').fill(indicatorCode);
    await indicatorDialog.locator('.el-form-item').filter({ hasText: '名称' }).locator('input').fill(indicatorName);

    const indSubmit = page.waitForResponse(
      (r) => r.url().includes('/api/performance/indicators') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await indicatorDialog.locator('.el-dialog__footer .el-button--primary').click();
    const indResp = await indSubmit;
    expect(indResp.ok(), `新建指标 POST 期望 2xx，实际 ${indResp.status()}`).toBeTruthy();

    // M5-09: UI 列表真实可见新条目
    await expect(page.locator('.el-table__body tr').filter({ hasText: indicatorCode })).toBeVisible({ timeout: 8_000 });

    // ============ 3. 考核方案（UI 提交 + UI 列表可见）============
    await page.goto('/performance/schemes');
    await expect(page.locator('.page-header__title h1')).toContainText('考核方案');

    await page.getByRole('button', { name: '新建方案' }).click();
    const schemeDialog = page.locator('.el-dialog').filter({ hasText: '新建考核方案' });
    await expect(schemeDialog).toBeVisible();

    await schemeDialog.locator('.el-form-item').filter({ hasText: '方案 code' }).locator('input').fill(schemeCode);
    await schemeDialog.locator('.el-form-item').filter({ hasText: '名称' }).locator('input').fill(schemeName);

    // 关联指标：选择刚创建的 indicator + 权重 100
    const indicatorSelect = schemeDialog.locator('.el-form-item').filter({ hasText: '指标' }).first().locator('.el-select');
    await indicatorSelect.click();
    const indicatorOption = page.locator('.el-select-dropdown__item').filter({ hasText: indicatorCode }).first();
    await expect(indicatorOption).toBeVisible({ timeout: 5_000 });
    await indicatorOption.click();

    const weightInput = schemeDialog.locator('input[type="number"]').first();
    await weightInput.fill('100');

    const schSubmit = page.waitForResponse(
      (r) => r.url().includes('/api/performance/schemes') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await schemeDialog.locator('.el-dialog__footer .el-button--primary').click();
    const schResp = await schSubmit;
    expect(schResp.ok(), `新建方案 POST 期望 2xx，实际 ${schResp.status()}`).toBeTruthy();

    // M5-09: UI 列表真实可见新条目
    await expect(page.locator('.el-table__body tr').filter({ hasText: schemeCode })).toBeVisible({ timeout: 8_000 });
  });
});