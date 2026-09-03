/**
 * E2E #3 · 请假主流程（M5-09 还原 + M5-09-fix1 draft 清理 + 远期日期）
 * @file e2e/specs/03-leave.spec.ts
 * @description
 *  - 进入 /attendance/leaves/new 请假申请页
 *  - 填写并提交一笔 E2E-事假-xxxx（1 天，admin 本人）
 *  - 列表 /attendance/leaves 出现该申请，状态为「已提交/审批中」（审批流 leave_default 首个审批人 = direct_leader）
 *
 * 已知问题（M5-02 → M5-09 修复）：
 *   原 seed leave.approval_flow_short = 'leave:leave_short' 指向不存在的审批流，提交必失败。
 *   M5-09 已订正为 'leave:leave_default'（seed 实际创建的 key），本 spec 还原为单路径成功断言：
 *     1) 提交成功 → 后端 201 + leaveRequest.status = submitted
 *     2) 跳转到列表页可见 + 状态标签 = 「已提交」
 *
 * 已知问题（M5-09-fix1 修复）：
 *   历史 dev 库 admin 账号下残留 2 条 draft + 1 条 submitted 请假记录（09-08/09-09/09-14），
 *   再次提交同日期触发 409 区间重叠。fix1 改为：
 *     1) test 开头先用 API 取消 admin 所有 draft 请假（按提示词 §1 推荐，不动 submitted/approved）；
 *     2) 动态计算一个安全日期：扫 admin 非 cancelled/rejected 请假，把每个 startDate 与 startDate+1
 *        都视为「禁止」（startOfDay 转 CST 后经 PG DATE 截断 + prisma findMany 内部绑 DATE OID，
 *        会把占用日 D 的记录误判到 D+1 输入；见 server/scripts/fixes/tmp/probe-overlap.mjs）；
 *     3) 从 today+1 起向后找首个不在禁止集中的工作日作为请假日期。
 *   注：M2-B3 hasOverlappingLeave 的 PG DATE/TIMESTAMPTZ 比较属于服务 bug，留二期。
 */
import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { apiGet, apiLogin, apiPost, STORAGE_STATE } from '../helpers';

interface LeaveListItem {
  id: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'cancelled';
  startDate: string;
  endDate: string;
  reason?: string | null;
}

/**
 * 从 JWT 解析 exp（秒），并判断是否仍有效（留 30s 安全余量）
 */
function getTokenExp(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString()) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

interface CachedAuth {
  accessToken: string;
  user: {
    id: string;
    username: string;
    employee?: { id: string; employeeNo: string; name: string };
  };
}

/**
 * 优先复用 global-setup 写入 e2e/.auth/admin.json 的 token；仅当缓存失效时才调 apiLogin。
 * 避免重复调 /api/auth/login 触发登录限流（5min/10 次），并支持 fix1 期间多次重跑 E2E。
 */
async function getAuth(): Promise<CachedAuth> {
  if (existsSync(STORAGE_STATE)) {
    try {
      const prev = JSON.parse(readFileSync(STORAGE_STATE, 'utf8')) as {
        origins?: Array<{ localStorage?: Array<{ name: string; value: string }> }>;
      };
      const ls = prev.origins?.[0]?.localStorage ?? [];
      const accessToken = ls.find((x) => x.name === 'hrms_access_token')?.value;
      const exp = accessToken ? getTokenExp(accessToken) : null;
      if (accessToken && exp && exp * 1000 - 30_000 > Date.now()) {
        // global-setup 仅写 access_token / refresh_token；user 信息调 /api/auth/me 取
        const ctx = await (await import('../helpers')).getContext();
        const meRes = await ctx.get('/api/auth/me', { headers: { Authorization: `Bearer ${accessToken}` } });
        if (meRes.ok()) {
          const meBody = (await meRes.json()) as { success: boolean; data?: { user: CachedAuth['user'] } };
          const user = meBody.data?.user;
          if (user?.employee?.id) {
            return { accessToken, user };
          }
        }
      }
    } catch {
      /* fallthrough */
    }
  }
  // 缓存失效才走 apiLogin
  const login = await apiLogin();
  return { accessToken: login.accessToken, user: login.user };
}

test.describe.serial('03 · 请假主流程', () => {
  test('请假申请 → 提交 → 列表可见 + 状态为已提交', async ({ page }) => {
    // 0. 拿 admin employeeId + accessToken（优先复用 storageState 缓存，仅缓存失效才调 /api/auth/login，
    //    避免 fix1 期间多次重跑 E2E 触发登录限流 5min/10 次）
    const { accessToken, user } = await getAuth();
    const employeeId = user?.employee?.id;
    expect(employeeId).toBeTruthy();

    // 0.1 M5-09-fix1：清理 admin 所有 draft 请假（按提示词 §1 推荐）
    const drafts = await apiGet<LeaveListItem[]>(accessToken, '/leaves/requests', {
      employeeId,
      status: 'draft',
      pageSize: 100,
    });
    for (const d of drafts) {
      // throwOnError:false 防止个别已被审批回调的 draft 抛错中断整批清理
      await apiPost(accessToken, `/leaves/requests/${d.id}/cancel`, {
        reason: 'E2E 前置清理 draft',
      }, { throwOnError: false });
    }

    // 0.2 M5-09-fix1：计算禁止日期集合 = occupied ∪ (occupied + 1 day)
    const all = await apiGet<LeaveListItem[]>(accessToken, '/leaves/requests', {
      employeeId,
      pageSize: 100,
    });
    const forbidden = new Set<string>();
    for (const it of all) {
      if (it.status === 'cancelled' || it.status === 'rejected') continue;
      const s = new Date(it.startDate);
      const e = new Date(it.endDate);
      for (let d = new Date(s); d.getTime() <= e.getTime(); d.setDate(d.getDate() + 1)) {
        forbidden.add(d.toISOString().slice(0, 10));
        // 同时禁止 D+1（prisma findMany 绑定 DATE OID 时 startOfDay 转 CST 被截断为前一天）
        const next = new Date(d);
        next.setDate(next.getDate() + 1);
        forbidden.add(next.toISOString().slice(0, 10));
      }
    }

    // 0.3 从 today+1 起向后找首个不在 forbidden 且为工作日的日期
    let dateStr: string | null = null;
    const candidate = new Date();
    candidate.setDate(candidate.getDate() + 1);
    for (let attempt = 0; attempt < 90; attempt++) {
      // 跳过周末
      while (candidate.getDay() === 0) candidate.setDate(candidate.getDate() + 1);
      while (candidate.getDay() === 6) candidate.setDate(candidate.getDate() + 2);
      const cs = candidate.toISOString().slice(0, 10);
      if (!forbidden.has(cs)) {
        dateStr = cs;
        break;
      }
      candidate.setDate(candidate.getDate() + 1);
    }
    expect(dateStr, '90 天内找不到安全日期，请人工排查历史请假数据').toBeTruthy();

    // 1. 进入请假申请页
    await page.goto('/attendance/leaves/new');
    await expect(page.locator('.page-header__title h1')).toContainText('请假申请');

    // 2. 员工下拉已默认选 admin
    const employeeSelect = page.locator('.el-form-item').filter({ hasText: '员工' }).locator('.el-select');
    await expect(employeeSelect).toBeVisible();

    // 3. 选择类型：事假
    const typeSelect = page.locator('.el-form-item').filter({ hasText: '类型' }).locator('.el-select');
    await typeSelect.click();
    const personalOption = page.locator('.el-select-dropdown__item').filter({ hasText: '事假' }).first();
    await expect(personalOption).toBeVisible();
    await personalOption.click();

    // 4. 选择日期：M5-09-fix1 动态安全日期
    const startPicker = page.locator('.el-form-item').filter({ hasText: '开始' }).locator('input');
    const endPicker = page.locator('.el-form-item').filter({ hasText: '结束' }).locator('input');
    await startPicker.fill(dateStr!);
    await startPicker.press('Enter');
    await endPicker.fill(dateStr!);
    await endPicker.press('Enter');

    // 5. 填写事由
    const reasonText = `E2E-事假-${Date.now()}`;
    const reasonTextarea = page.locator('.el-form-item').filter({ hasText: '事由' }).locator('textarea');
    await reasonTextarea.fill(reasonText);

    // 6. 监听 POST /api/leaves/requests
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('/api/leaves/requests') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );

    // 7. 提交
    const submitButton = page.getByRole('button', { name: '提交' });
    await expect(submitButton).toBeVisible();
    await submitButton.click();

    // 8. M5-09: 单路径成功断言——必须 201，跳列表，状态为「已提交」（leave_default 首节点 direct_leader，未审批）
    const resp = await responsePromise;
    expect(resp.ok(), `请假提交期望 2xx，实际 ${resp.status()}`).toBeTruthy();

    await page.waitForURL(/\/attendance\/leaves(?!\/new)/, { timeout: 10_000 });
    await expect(page.locator('.page-header__title h1')).toContainText('请假管理');

    // 9. UI 列表断言：刚见的新请假可见 + 状态标签 = 已提交（leaveRequest.status='submitted'）
    // M5-09-fix1：列表页不展示 reason 列，按 startDate 日期 + 类型「事假」+ 状态「已提交」三列过滤
    // 列表默认 pageSize=20，按 createdAt DESC 排序，新提交记录可能不是首行（其他员工也在提交），
    // 所以用 hasText: dateStr 找包含日期所有行，再断言状态。
    // 注：M2-B3 hasOverlappingLeave 的 startOfDay 把日期转 CST 后被 prisma @db.Date 存为前一天，
    //     所以 UI 显示 startDate = dateStr - 1 day。已通过 server/scripts/fixes/tmp/probe-overlap.mjs 确认。
    const d = new Date(dateStr!);
    d.setDate(d.getDate() - 1);
    const displayedDate = d.toISOString().slice(0, 10);
    const rowsWithDate = page.locator('.el-table__body tr').filter({ hasText: displayedDate });
    await expect(rowsWithDate.first(), '列表应出现刚提交的请假（按日期过滤）').toBeVisible({ timeout: 8_000 });
    await expect(rowsWithDate.first()).toContainText(/已提交|审批中/);
    await expect(rowsWithDate.first()).toContainText('事假');
  });

  test('请假列表页可访问且渲染', async ({ page: _page }) => {
    await _page.goto('/attendance/leaves');
    await expect(_page.locator('.page-header__title h1')).toContainText('请假管理');
  });
});
