# HRMS Postman 联调

## 导入

在 Postman 中选择 **Import**，分别导入 `postman/hrms-api.postman_collection.json` 集合和 `postman/hrms-local.postman_environment.json` 环境。集合使用环境中的 `baseUrl`，登录和刷新请求会将响应中的 token 写入集合变量。

## 命令行

```bash
pnpm dlx newman run postman/hrms-api.postman_collection.json -e postman/hrms-local.postman_environment.json --folder Auth
```

## 本地启动

```bash
# 本机为连字符版 docker-compose；compose 插值要求 ENCRYPTION_KEY（任意 64 位十六进制，仅本地）
ENCRYPTION_KEY=aaaa...(64 个 a) docker-compose up -d postgres redis
pnpm --filter hrms-server exec prisma migrate deploy
pnpm --filter hrms-server exec prisma db seed
pnpm --filter hrms-server dev
```

启动后可在 Postman、浏览器或 newman 中执行集合请求。

## 首次使用：强制改密（真实联调发现）

种子账号 `admin` 首次登录后 `mustChangePassword=true`，业务接口一律返回 **403（错误码 10112 必须先修改密码）**，这是 M0.5-7 的设计行为而非故障。先调用 `Auth/修改密码`（body 已预填 `{{password}}` 与 `NewPass@123` 示例），用新密码重新登录后再跑其他目录。

> 当前本地库 admin 密码已改为 `Admin@2026`（环境文件已同步）；若重新 seed，初始密码恢复为 `Admin@123`，需再走一遍改密流程。

## 请求占位

- 路径参数转换为 `:param` 变量，请在 Postman 中填写。
- 列表接口的 query 参数未展开，请按 `docs/api-spec.md` 手动补充。
- 带 `requestBody` 的请求使用空 JSON 对象占位，请按接口契约填写实际字段。
- 本地环境的账号仅用于开发种子数据，不要用于生产环境。

## 再生成

端点变更后执行：

```bash
node scripts/build-postman-collection.mjs
node scripts/check-api-coverage.mjs
```
