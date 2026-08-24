# AGENTS.md - HRMS 项目 AI Coding 上下文

## 项目简介
西安辰航卓越科技有限公司员工管理系统（HRMS），一期覆盖组织人事/考勤/薪酬/绩效。

## 技术栈
- pnpm monorepo：client (Vue3) / server (Express+Prisma+PG) / mobile (留空)
- 认证：JWT (access 15min + refresh 7d)
- 权限：RBAC（Role.permissions JSON 数组）
- 数据库：PostgreSQL 15+，软删除约定

## 参考项目
招聘系统：C:/Users/fmmf/Kimi/recruiting-system/（只读）

## 命名规范
- 数据库表：snake_case 复数（employees / departments）
- Prisma model：PascalCase 单数（Employee / Department）
- TS 类型：PascalCase
- API 路径：/api/<module>/<resource>，kebab-case
- Vue 组件：PascalCase
- 文件：kebab-case

## 业务规则配置化
工号规则 / 预警天数 / 试用期 / 绩效系数 / 固浮比 / 提成比例 / 差旅标准 → 全部走 configs 表

## 当前进度
- [x] M0-01 pnpm monorepo 初始化
- [x] M0-02 lint 配置
- [x] M0-03 docker-compose
- [x] M0-04 Prisma schema
- [x] M0-05 后端登录接口
- [x] M0-06 前端登录页
- [x] M0-07 RBAC 中间件
- [x] M0-08 审计日志
- [ ] M0-09 Nginx + Docker
