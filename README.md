# HRMS - 员工管理系统

西安辰航卓越科技有限公司内部 HRMS 系统。

## 一期范围
- 组织人事（M1）
- 考勤假勤（M2）
- 绩效管理（M3）
- 薪酬核算（M4）

## 技术栈
pnpm monorepo / Express + TS + Prisma + PostgreSQL / Vue 3 + Element Plus

## 参考项目
C:/Users/fmmf/Kimi/recruiting-system/（只读）

## 启动
```bash
pnpm install
pnpm dev
```

## 基础设施（开发）

```bash
# 启动 PostgreSQL + Redis
docker compose up -d

# 或使用一键脚本
bash scripts/dev.sh        # Linux/macOS
./scripts/dev.ps1          # Windows PowerShell

# 停止
docker compose down

# 停止并清空数据（谨慎）
docker compose down -v
```

## 环境变量
复制 `.env.example` 为 `.env` 并按需修改。
