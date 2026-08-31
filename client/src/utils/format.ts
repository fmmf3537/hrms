/**
 * 日期 / 金额 / 状态格式化（M5-2-0）
 * @module utils/format
 */

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  pending: '待处理',
  approved: '已通过',
  rejected: '已驳回',
  cancelled: '已取消',
  active: '生效',
  inactive: '停用',
  ok: '正常',
  error: '异常',
};

/**
 * 格式化日期为 YYYY-MM-DD
 * 纯日期字符串原样返回，避免 UTC 边界把日历日错一天
 */
export function formatDate(value: string | Date | null | undefined): string {
  if (value == null || value === '') {
    return '—';
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 金额千分位，保留 2 位小数
 */
export function formatAmount(value: number | string | null | undefined): string {
  if (value == null || value === '') {
    return '—';
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) {
    return '—';
  }
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * 状态码转中文；未知状态原样返回
 */
export function formatStatus(status: string | null | undefined): string {
  if (!status) {
    return '—';
  }
  return STATUS_LABELS[status] ?? status;
}
