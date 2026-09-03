/**
 * E2E #2 · 打卡主流程（M5-09 还原）
 * @file e2e/specs/02-attendance.spec.ts
 * @description
 *  - 进入 /attendance/attendance 打卡管理
 *  - 授予浏览器定位权限 + setGeolocation 设到 office 坐标
 *  - 点击「自己打卡」（admin 绑定了员工档案，client onClock 走 Geolocation API）
 *  - server 接收 clockType='gps' + 经纬度，校验通过后写入 AttendanceRecord
 *  - 列表 UI 真实断言新记录出现
 *
 * 已知问题（M5-02 → M5-09 修复）：
 *   原 client `AttendanceList.vue` onClock() 硬编码 `clockType:'wifi'` 但漏发 wifiSsid，
 *   server 强校验 71903 必败。旧 spec 用 page.route() mock 伪造成功响应，本切片还原为
 *   真实 GPS 链路：context.grantPermissions + context.setGeolocation(office 坐标)。
 *
 * 坐标：seed attendance.office_lat = 34.3416 / office_lng = 108.9398（与 service
 *   DEFAULT_OFFICE_LAT/LNG 一致），gps_max_distance = 100m，所以 setGeolocation 偏差 < 100m 即通过。
 */
import { test, expect } from '@playwright/test';

// 实读 server/seed.ts + server/src/services/attendance.service.ts 确认坐标
const OFFICE_LAT = 34.3416;
const OFFICE_LNG = 108.9398;

test.describe.serial('02 · 打卡主流程', () => {
  test('GPS 打卡 → 列表出现新记录', async ({ page, context }) => {
    // 1. 授予定位权限 + 设置坐标为 office 中心点（实测服务 DEFAULT_OFFICE_LAT/LNG 同值）
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: OFFICE_LAT, longitude: OFFICE_LNG, accuracy: 10 });

    // 2. 进入打卡管理（菜单 disabled，URL 可达）
    await page.goto('/attendance/attendance');
    await expect(page.locator('.page-header__title h1')).toContainText('打卡管理');

    // 3. 监听 POST /api/attendance/clock-in（无 mock，必走真实 server gps 分支）
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('/api/attendance/clock-in') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );

    // 4. 点击「自己打卡」
    const clockButton = page.getByRole('button', { name: '自己打卡' });
    await expect(clockButton).toBeVisible();
    await clockButton.click();

    // 5. 断言响应 2xx（gps 分支返回 201）
    const resp = await responsePromise;
    expect(resp.ok(), `GPS 打卡期望 2xx，实际 ${resp.status()}`).toBeTruthy();

    // 6. ElMessage 成功 toast
    const successToast = page.locator('.el-message--success').filter({ hasText: '打卡成功' });
    await expect(successToast).toBeVisible({ timeout: 5_000 });

    // 7. 等 toast 消失 + 列表 load
    await successToast.waitFor({ state: 'hidden', timeout: 8_000 }).catch(() => undefined);
    await page.waitForTimeout(800);

    // 8. M5-09: UI 列表真实出现 gps 类型记录（不再降级为 mock 行数断言）
    const gpsRow = page.locator('.el-table__body tr').filter({ hasText: 'gps' }).first();
    await expect(gpsRow, '列表应出现 clockType=gps 的新记录').toBeVisible({ timeout: 5_000 });
  });
});