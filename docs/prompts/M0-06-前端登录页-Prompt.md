# 【任务 ID】M0-06：前端登录页 + Vue3 应用骨架

## 【任务目标】
为 `D:/projects/hrms/client/` 实现最小可用的 Vue3 前端：
- Vite + Vue3 + Element Plus + Pinia + Vue Router 应用骨架
- 登录页（用户名 + 密码，调 `POST /api/auth/login`）
- 主布局（侧边栏 + 顶栏 + 内容区，含退出登录）
- 路由守卫（未登录跳 /login）
- axios 拦截器（自动带 token、401 时用 refreshToken 换新）

## 【前置状态】
- M0-01 ~ M0-05 已完成，后端 4 个接口可用：
  - `POST /api/auth/login` `{username, password}` → `{success, data: {user, accessToken, refreshToken}}`
  - `POST /api/auth/refresh` `{refreshToken}` → `{success, data: {accessToken}}`
  - `POST /api/auth/logout`（需 Authorization 头）
  - `GET /api/auth/me`（需 Authorization 头）→ `{success, data: {user}}`
  - `GET /api/health` → `{success, data: {status:'ok'}}`
- 后端运行在 `http://localhost:3000`，前端将通过 vite proxy 转发 `/api/*` 到 3000
- admin 账号：`admin / Admin@123`

## 【强制约束】
- 项目根目录：`D:/projects/hrms/`
- 参考项目（只读）：`C:/Users/fmmf/Kimi/recruiting-system/client/`
- **必须先 Read 以下参考文件，理解写法后适配**：
  - `C:/Users/fmmf/Kimi/recruiting-system/client/vite.config.ts`
  - `C:/Users/fmmf/Kimi/recruiting-system/client/index.html`
  - `C:/Users/fmmf/Kimi/recruiting-system/client/src/main.ts`
  - `C:/Users/fmmf/Kimi/recruiting-system/client/src/App.vue`
  - `C:/Users/fmmf/Kimi/recruiting-system/client/src/router/index.ts`
  - `C:/Users/fmmf/Kimi/recruiting-system/client/src/stores/auth.ts`
  - `C:/Users/fmmf/Kimi/recruiting-system/client/src/api/auth.ts` 和 `C:/Users/fmmf/Kimi/recruiting-system/client/src/api/index.ts`
  - `C:/Users/fmmf/Kimi/recruiting-system/client/src/views/login/index.vue`
  - `C:/Users/fmmf/Kimi/recruiting-system/client/src/layouts/DefaultLayout.vue`
- **不要执行 `pnpm install`**：完成代码后由 kimi 跑（用户已知会）
- **不要启动服务**：写完代码即可

## 【HRMS 适配点（与招聘系统的差异）】

| 项 | 招聘系统 | HRMS |
|---|---|---|
| localStorage key | `ats_token` / `ats_user` | `hrms_access_token` / `hrms_refresh_token` / `hrms_user` |
| 登录字段 | email | username |
| 登录响应 | `{token, user}` | `{accessToken, refreshToken, user}` |
| 用户角色 | `role: string`（单值） | `roles: string[]`（数组） |
| 品牌 | 招聘系统 | 西安辰航卓越 HRMS |
| 主题色 | 默认 | Element Plus 默认蓝（可后期改） |

## 【需要创建的文件】

### 1. `client/vite.config.ts`
- Vue 插件
- `@` 别名指向 `src`
- dev server 端口 5173
- proxy：`/api` → `http://localhost:3000`

### 2. `client/index.html`
- 中文 lang
- 标题"辰航卓越 HRMS"
- viewport meta

### 3. `client/src/main.ts`
- createApp + Pinia + Router + ElementPlus
- 引入 element-plus 中文 locale
- 引入 element-plus/dist/index.css

### 4. `client/src/App.vue`
- 仅 `<router-view />`

### 5. `client/src/types/index.ts`
```typescript
// 用户与登录相关类型
export interface UserInfo {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
  status: string;
  roles: string[];
  companyId: string | null;
  departmentId: string | null;
  employee?: {
    id: string;
    employeeNo: string;
    name: string;
  } | null;
}

export interface LoginParams {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: UserInfo;
  accessToken: string;
  refreshToken: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  code?: number;
  message?: string;
  error?: string;
  data?: T;
}
```

### 6. `client/src/api/request.ts`
- axios 实例：baseURL = `/api`，timeout 15s
- 请求拦截器：从 localStorage 读 `hrms_access_token`，加 `Authorization: Bearer <token>`
- 响应拦截器：
  - 成功：直接返回 `response.data`
  - 401：用 `hrms_refresh_token` 调 `/auth/refresh` 换新 accessToken，重放原请求；失败跳 /login
  - 其他错误：ElMessage.error 提示 + reject
- 防刷新并发：用 promise 队列

### 7. `client/src/api/auth.ts`
- `login(params: LoginParams)` → POST /auth/login
- `refreshToken(refreshToken: string)` → POST /auth/refresh
- `logout(refreshToken: string)` → POST /auth/logout
- `getCurrentUser()` → GET /auth/me

### 8. `client/src/stores/auth.ts`
参考招聘系统的写法，但适配 HRMS：
- state: `accessToken / refreshToken / userInfo / isLoading`
- getters: `isLoggedIn / isAdmin (roles.includes('admin')) / isHR (roles.includes('hr')) / userName (userInfo?.employee?.name || userInfo?.username)`
- actions: `login / logout / fetchCurrentUser / refreshAccessToken / restoreFromStorage`
- localStorage keys：`hrms_access_token` / `hrms_refresh_token` / `hrms_user`

### 9. `client/src/router/index.ts`
路由：
- `/login` → Login（公开）
- `/` → DefaultLayout，redirect 到 `/dashboard`
  - `/dashboard` → Dashboard 占位（含欢迎语 + 当前用户信息卡片）
- `/403` → 无权限页
- `/404` → 不存在页
- catch-all `/:pathMatch(.*)*` → 404

路由守卫：
- 公开路由（meta.public）直接放行
- 非公开 + 无 token → 跳 `/login?redirect=<原路径>`
- 非公开 + 有 token + 无 userInfo → 先调 `getCurrentUser()` 再放行
- 登录后访问 /login → 跳 `/`

### 10. `client/src/layouts/DefaultLayout.vue`
- el-container 布局：
  - el-aside：logo（"辰航卓越 HRMS"）+ 菜单（Dashboard / 组织人事 / 考勤 / 薪酬 / 绩效，后 4 个 disabled 占位）
  - el-header：面包屑 + 右侧用户下拉（个人中心、退出登录）
  - el-main：`<router-view />`
- 退出登录：调 `authStore.logout()` + 跳 /login

### 11. `client/src/views/login/index.vue`
- 居中卡片
- logo + 标题"西安辰航卓越 HRMS"
- el-form：username + password + 登录按钮（loading 状态）
- 校验：必填，密码 ≥6 位
- 登录成功：跳 `route.query.redirect || '/'`
- 失败：ElMessage.error 显示后端返回的 error 信息
- 底部：默认账号提示（仅 development 环境）

### 12. `client/src/views/dashboard/index.vue`
- 欢迎卡片：欢迎 {userName}，当前角色 {roles.join(' / ')}
- 4 个统计卡片占位（员工总数 / 部门数 / 在职 / 待办审批）— 数字先写 0，留 TODO 注释
- 提示：M1 模块上线后这里将展示真实数据

### 13. `client/src/views/error/403.vue` 和 `404.vue`
- 简单居中提示 + 返回首页按钮

### 14. 修改 `client/package.json`

dependencies 添加（版本与招聘系统对齐）：
```
"vue": "^3.4.3",
"vue-router": "^4.2.5",
"pinia": "^2.1.7",
"element-plus": "^2.5.0",
"@element-plus/icons-vue": "^2.3.1",
"axios": "^1.6.2"
```

devDependencies 添加：
```
"vite": "^5.0.10",
"@vitejs/plugin-vue": "^5.0.2",
"vue-tsc": "^1.8.25"
```

scripts 更新：
```json
"dev": "vite --port 5173",
"build": "vue-tsc --noEmit && vite build",
"preview": "vite preview"
```

### 15. 更新 `D:/projects/hrms/AGENTS.md`
`- [ ] M0-06 前端登录页` → `- [x] M0-06 前端登录页`

## 【执行步骤】

1. 先 Read 上述 9 个参考文件
2. 创建所有文件
3. 更新 client/package.json
4. 更新 AGENTS.md
5. **不要执行 pnpm install**（用户会让 kimi 跑）
6. **不要执行 pnpm dev**

## 【验收】

完成后输出：

1. 完整目录树（重点：client/src/）
2. 文件清单表：路径 / 字节数 / 新建或修改
3. 与招聘系统的差异说明
4. 路由清单
5. localStorage 键清单
6. axios 拦截器工作流描述

## 【用户后续手动验证步骤（仅供你参考，不要执行）】

```bash
cd D:/projects/hrms
pnpm install
pnpm dev
# 浏览器访问 http://localhost:5173
# 用 admin / Admin@123 登录
# 期望：进入 dashboard，显示欢迎语
# 关闭浏览器，重新打开 → 仍登录
# 点退出 → 跳登录页
# 直接访问 /dashboard → 跳 /login
```

## 【禁止事项】
- 不要执行任何 pnpm / npm 命令
- 不要写真实业务页面（员工列表/部门树等留到 M1）
- 不要写复杂的 echarts 仪表盘（M5 再做）
- 不要修改 server/ 任何文件
- 不要修改 prisma/schema.prisma
- 不要初始化 git
