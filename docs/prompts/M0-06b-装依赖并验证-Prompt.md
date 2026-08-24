# 【任务】在 D:/projects/hrms/ 下执行 pnpm install + 启动开发服务器并验证

## 【背景】
HRMS 项目（D:/projects/hrms/）刚完成了 M0-06（前端登录页代码生成），需要装新加的前端依赖（vue / vue-router / pinia / element-plus / axios / vite 等）并验证整个系统能跑通。

后端之前已经装好依赖并实测过登录接口可用。

## 【执行步骤（严格按序）】

### 1. 安装依赖
```bash
cd D:/projects/hrms
pnpm install
```

预期：装约 100+ 个前端包，无 ERR。

### 2. 验证依赖装上
确认 `D:/projects/hrms/client/node_modules/` 下存在：
- vue
- vue-router
- pinia
- element-plus
- @element-plus/icons-vue
- axios
- vite
- @vitejs/plugin-vue
- vue-tsc

### 3. 类型检查
```bash
cd D:/projects/hrms/client
pnpm type-check
```
预期：0 错误。如有错误，列出来但**不要修复**（让用户决定）。

### 4. 构建测试
```bash
cd D:/projects/hrms/client
pnpm build
```
预期：成功生成 `client/dist/`。如失败列出错误。

### 5. 启动开发服务器（后台）
```bash
cd D:/projects/hrms
pnpm dev
```

让 server (3000) 和 client (5173) 都在后台跑起来。

### 6. 用 curl 验证
```bash
# 等 5-10 秒让两端都启动
sleep 8

# 后端健康检查
curl -s http://localhost:3000/api/health

# 前端首页
curl -s -I http://localhost:5173/

# 前端代理到后端
curl -s http://localhost:5173/api/health
```

预期：
- 后端 200 + JSON
- 前端 200 + HTML
- 前端代理 200 + 同样的 JSON（说明 vite proxy 工作）

### 7. 完成后**关闭后台进程**
```bash
# 杀掉 node 进程（仅当前项目的）
# 或者直接用 Ctrl+C 如果能交互
```

## 【验收报告格式】

1. **pnpm install**：装了多少包、用时、是否有警告/错误
2. **依赖核对**：§2 中每个包 ✓/✗
3. **type-check 结果**：通过/失败 + 错误数
4. **build 结果**：通过/失败 + 产物大小（dist/assets/*.js 文件列表）
5. **dev 启动状态**：server 和 client 是否都起来
6. **接口验证**：3 个 curl 的状态码和返回内容
7. **遇到的问题**及解决方案

## 【禁止事项】
- 不要修改任何源代码文件
- 不要执行 pnpm db:migrate 或 db:seed（已做过）
- 不要执行 git 操作
- 如果 build/type-check 报错，**只报告不修复**
- 完成后**一定要关闭 dev 进程**（不要让它一直跑）
