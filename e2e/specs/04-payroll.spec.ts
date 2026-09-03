/**
 * E2E #4 · 算薪主流程（M5-09 全链路升级）
 * @file e2e/specs/04-payroll.spec.ts
 * @description
 *  - UI 进入 /salary/payroll-runs 发起算薪
 *  - 提交期间 + 备注 → admin 算出至少 1 张工资单（缺陷 4 已 ensure 5 员工 plan/reg/finalGrade）
 *  - 跳详情页可见步骤条 + 工资单列表（admin 工资单）
 *  - API 推进状态机 draft → submitted → reviewed → approved → locked
 *  - UI 工资单列表断言 admin 工资单存在
 *
 * 已知问题（M5-02 → M5-09 修复）：
 *   原 seed 无 active salary plan + insurance registration + finalGrade performance record，
 *   导致 createPayrollRun 强校验 73408 必败。本切片通过
 *     server/prisma/seed.ts 新增 ensure 块（5 员工 plan/reg）
 *     server/scripts/fixes/m5-09-config-fixes.mjs 旧库兜底（plan/reg/finalGrade）
 *   两层修复保证 E2E 04 全链路可达。
 */
import { test, expect } from '@playwright/test';
import { apiLogin, apiPost, apiGet, uniqueName } from '../helpers';

test.describe.serial('04 · 算薪主流程', () => {
  test('发起算薪（含 admin）→ 全链路 → admin 工资单可见', async ({ page }) => {
    const { accessToken, user } = await apiLogin();
    const employeeId = user?.employee?.id;
    expect(employeeId).toBeTruthy();

    // ===== 1. UI 发起算薪 =====
    await page.goto('/salary/payroll-runs');
    await expect(page.locator('.page-header__title h1')).toContainText('算薪管理');

    await page.getByRole('button', { name: '发起算薪' }).click();
    const dialog = page.locator('.el-dialog').filter({ hasText: '发起算薪' });
    await expect(dialog).toBeVisible();

    // M5-09-fix1: 选「第一个空闲的未来月份」，而非固定下月。
    // 根因：历史重跑会残留 locked run（如 2026-10 E2E-算薪-*），后端同 period 重复创建必 400。
    // 做法：先扫已有 runs 的 period 集合，从下月起向后找首个未被占用的月份（幂等可重跑）。
    const existingRuns = await apiGet<{ items?: Array<{ period: string }> }>(
      accessToken,
      '/salary/payrolls/runs',
      { page: 1, pageSize: 100 },
    );
    const takenPeriods = new Set((existingRuns.items ?? []).map((r) => r.period));
    const period = (() => {
      const probe = new Date();
      probe.setDate(1);
      for (let i = 0; i < 24; i += 1) {
        probe.setMonth(probe.getMonth() + 1); // 从下月起逐一探测
        const y = probe.getFullYear();
        const m = String(probe.getMonth() + 1).padStart(2, '0');
        const cand = `${y}-${m}`;
        if (!takenPeriods.has(cand)) return cand;
      }
      throw new Error('未来 24 个月内没有空闲算薪期间，请人工清理历史 payroll run');
    })();
    const periodInput = dialog.locator('.el-date-editor input').first();
    await periodInput.fill(period);
    await periodInput.press('Enter');

    const remarkText = `E2E-算薪-${Date.now()}`;
    const remarkTextarea = dialog.locator('textarea').first();
    await remarkTextarea.fill(remarkText);

    // 监听 POST + 跳详情
    const createRespPromise = page.waitForResponse(
      (r) => r.url().includes('/api/salary/payrolls/runs') && r.request().method() === 'POST',
      { timeout: 30_000 },
    );
    await dialog.locator('.el-dialog__footer .el-button--primary').click();
    const createResp = await createRespPromise;
    expect(createResp.ok(), `发起算薪 POST 期望 2xx，实际 ${createResp.status()}`).toBeTruthy();

    // 跳详情页
    await page.waitForURL(/\/salary\/payroll-runs\/.+/, { timeout: 10_000 });
    await expect(page.locator('.el-steps')).toBeVisible();

    // 从 URL 拿 run id
    const runId = page.url().split('/').pop()!;

    // 解析 POST 返回的 payslipCount
    const createBody = await createResp.json();
    const payslipCount: number = createBody.data?.payslipCount ?? 0;
    expect(payslipCount, 'admin 应至少算出 1 张工资单').toBeGreaterThanOrEqual(1);

    // ===== 2. API 推进状态机：admin 一人多角色（hr + 财务兼任 + ceo）=====
    // draft → submitted
    await apiPost(accessToken, `/salary/payrolls/runs/${runId}/submit`, {});
    // submitted → reviewed
    await apiPost(accessToken, `/salary/payrolls/runs/${runId}/review`, { comment: 'E2E 复核通过' });
    // reviewed → approved（seed payroll.lock_after_approve=true 自动触发 lock，故不显式调用 lock）
    await apiPost(accessToken, `/salary/payrolls/runs/${runId}/approve`, {});

    // ===== 3. 验证 run 状态 =====
    const finalRun = await apiGet<{ status: string; locked: boolean }>(
      accessToken,
      `/salary/payrolls/runs/${runId}`,
    );
    expect(['approved', 'locked']).toContain(finalRun.status);
    expect(finalRun.locked, 'autoLock 后 run.locked=true').toBe(true);

    // ===== 4. UI 工资单列表断言：admin 工资单可见 =====
    await page.goto('/salary/payslips');
    await expect(page.locator('.page-header__title h1')).toContainText('工资单');

    // 期间过滤到本次
    const periodFilter = page.locator('.el-form-item').filter({ hasText: '期间' }).locator('input').first();
    await periodFilter.fill(period);
    await periodFilter.press('Enter');
    await page.waitForTimeout(800);

    // admin 行存在（含 admin 姓名）
    const adminRow = page.locator('.el-table__body tr').filter({ hasText: '系统管理员' }).first();
    await expect(adminRow, '工资单列表应出现 admin 工资单').toBeVisible({ timeout: 8_000 });
  });
});