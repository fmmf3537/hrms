/**
 * E2E #1 · 登录主流程（M5-02）
 * @file e2e/specs/01-login.spec.ts
 * @description
 *  - 登录页输入 admin / Admin@2026
 *  - 跳转 Dashboard（默认 /dashboard）
 *  - 顶栏用户名下拉可见「系统管理员」
 *  - 退出登录回到登录页
 */
import { test, expect } from '@playwright/test';
import { ADMIN_PASSWORD, ADMIN_USERNAME } from '../helpers';

test.describe.serial('01 · 登录主流程', () => {
  // 01 用例必须从「未登录」开始；覆盖项目级 storageState（项目级已注入 admin token，
  // 否则 /login 会被路由守卫重定向到 /dashboard，无法测登录页）
  test.use({ storageState: { cookies: [], origins: [] } });

  test('登录 → 主布局 → 退出', async ({ page }) => {
    // 1. 访问登录页
    await page.goto('/login');
    await expect(page).toHaveTitle(/登录/);

    // 2. 输入账号密码（支持 E2E_ADMIN_* 覆盖，便于远程实例回归）
    const usernameInput = page.getByPlaceholder('请输入用户名');
    const passwordInput = page.getByPlaceholder('请输入密码');
    await expect(usernameInput).toBeVisible();
    await usernameInput.fill(ADMIN_USERNAME);
    await passwordInput.fill(ADMIN_PASSWORD);

    // 3. 点击登录按钮
    const submitButton = page.getByRole('button', { name: '登录' });
    await submitButton.click();

    // 4. 跳转 Dashboard
    await page.waitForURL(/\/dashboard$/, { timeout: 15_000 });
    await expect(page.locator('.logo-text')).toContainText('辰航卓越');

    // 5. 顶栏用户区显示「系统管理员」
    const userInfo = page.locator('.user-info');
    await expect(userInfo).toContainText('系统管理员');

    // 6. 点击用户名下拉 → 退出登录
    await userInfo.click();
    const logoutItem = page.locator('.el-dropdown-menu__item').filter({ hasText: '退出登录' });
    await expect(logoutItem).toBeVisible();
    await logoutItem.click();

    // 7. 确认对话框
    const confirmButton = page.locator('.el-message-box .el-button--primary').filter({ hasText: '确定' });
    await confirmButton.click();

    // 8. 回到登录页
    await page.waitForURL(/\/login$/, { timeout: 15_000 });
    await expect(page.getByPlaceholder('请输入用户名')).toBeVisible();
    await expect(page.getByPlaceholder('请输入密码')).toBeVisible();
  });
});
