# M3-D5 销售提成模块

## 范围

- 产品字典（`performance_sales_products`）：product / service / training 三类 + 差异化 baseRate
- 回款登记（`performance_sales_payments`）：draft → confirmed / cancelled；财务确认由 hr 兼任
- 提成计算（`performance_sales_commissions`）：财务确认后自动计算；发放仅标记 paid
- 8 个 API 端点（`/api/performance/sales/*`）
- 7 个权限点、10 个错误码（72801-72810）、8 项 configs

## 提成公式（V1.2 §二.5.4）

```
finalAmount = baseAmount × (commissionRate + targetBonusRate)
```

- `commissionRate` = 产品 `baseRate`（无人机整机 5% / 服务 8% / 培训 3%）
- `targetBonusRate` = 0（D5 不实现销售目标表，留 D5+ 联调）
- 实际乘法上浮 `commissionRate × (1 + bonus)` 留 D5+ 细化

## 8 个端点

| Method | Path | 权限 |
|---|---|---|
| POST | `/api/performance/sales/products` | `performance:sales:product:write` |
| GET | `/api/performance/sales/products` | `performance:sales:product:read` |
| PATCH | `/api/performance/sales/products/:id` | `performance:sales:product:write` |
| POST | `/api/performance/sales/payments` | `performance:sales:payment:write` |
| GET | `/api/performance/sales/payments` | `performance:sales:payment:read` |
| PATCH | `/api/performance/sales/payments/:id/confirm` | `performance:sales:payment:confirm` |
| GET | `/api/performance/sales/commissions` | `performance:sales:commission:read` |
| POST | `/api/performance/sales/commissions/calculate` | `performance:sales:commission:write` |

## Service

- `performance_sales_product.service.ts` — createProduct / listProducts / updateProduct / archiveProduct
- `performance_sales_payment.service.ts` — createPayment / listPayments / confirmPayment / cancelPayment
- `performance_sales_commission.service.ts` — calculateCommission / listCommissions / payoutCommission

## 红线

- 不创建 `performance_pips` / `performance_sales_targets` 表
- 不实现 PIP / 调薪 / 晋升
- 不联动 M4 薪酬（仅写 commission 表 + audit）
- 不修改 D1+D2+D3+D4 十一个 performance service
- 5 角色 RBAC 不含 finance（hr 兼任财务确认）
