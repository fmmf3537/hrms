/**
 * HTML 转义工具（M5-04 安全加固）
 * 用于所有"用户可控字段 → 拼接 HTML"的生成点（工资条 HTML / 离职证明 HTML 等），
 * 防存储型 XSS / 同源 HTML 注入。
 */
export function escapeHtml(value: unknown): string {
  const s = value == null ? '' : String(value);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default escapeHtml;
