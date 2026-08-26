# M3-D3 五档评分 + 系数配置

## 范围

- **0 新表** / **0 migration**（复用 D1 `performance_coefficients` + D2 `performance_records`）
- 等级判定算法（finalScore → S/A/B/C/D）
- 阈值 configs 读写（`performance.grade.thresholds`）
- 部门比例校准软警告（`warn_only`，不修改 finalGrade）
- 系数比例分析辅助函数 `analyzeCoefficientRatios`

## 5 个端点

| Method | Path | 权限 |
|---|---|---|
| POST | `/api/performance/grade/calculate` | `performance:grade:calculate` |
| POST | `/api/performance/grade/calculate-batch` | `performance:grade:calculate` |
| GET | `/api/performance/grade/thresholds` | `performance:grade:threshold:read` |
| PATCH | `/api/performance/grade/thresholds` | `performance:grade:threshold:write` |
| POST | `/api/performance/grade/calibrate-ratios` | `performance:record:read` |

## Service

- `performance_grade.service.ts` — calculateGrade / calculateBatchGrade / getGradeThresholds / updateGradeThresholds / analyzeCoefficientRatios
- `performance_calibration_ratio.service.ts` — calibrateDepartmentRatios / getCalibrationWarnings

## D3 红线

- 不创建 `performance_calibrations` 表
- 不修改 D1+D2 九个 service 文件
- 不实现 force 硬分配（仅 warn_only）
- 不联动 M4 薪酬

## 错误码

72601–72610（见 `docs/error-codes.md` §7.4）
