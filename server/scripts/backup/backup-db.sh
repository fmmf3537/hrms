#!/usr/bin/env bash
# ============================================================================
# HRMS 备份脚本（M5-11, 公司自建服务器）| 每日全量 + 可选每小时增量档 + 上传文件备份
#
# 依赖：
#   - docker compose postgres 服务（默认容器 hrms_postgres）
#   - gzip / tar
#
# 用法：
#   backup-db.sh                  # 每日全量备份（含 uploads）
#   backup-db.sh --hourly         # 每小时档（小库可作 RPO≈1h 的增量；独立保留 48 份）
#   backup-db.sh --files-only     # 仅备份 uploads/ 文件
#
# 保留策略：
#   DAILY_RETENTION   = 30（天）     —— 每日档
#   HOURLY_RETENTION  = 48（小时）   —— 每小时档
#   超过保留期的备份文件自动清理
#
# 环境变量覆盖（默认值见下）：
#   BACKUP_ROOT / PG_CONTAINER / PG_USER / PG_DB / COMPOSE_DIR
#
# crontab 建议（服务器）：
#   0 3 * * *   /opt/hrms/server/scripts/backup/backup-db.sh >> /var/log/hrms-backup.log 2>&1
#   0 * * * *   /opt/hrms/server/scripts/backup/backup-db.sh --hourly >> /var/log/hrms-backup.log 2>&1
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="${COMPOSE_DIR:-$(cd "${SCRIPT_DIR}/../../.." && pwd)}"

BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/hrms}"
PG_CONTAINER="${PG_CONTAINER:-hrms_postgres}"
PG_USER="${PG_USER:-postgres}"
PG_DB="${PG_DB:-hrms}"

DAILY_RETENTION="${DAILY_RETENTION:-30}"
HOURLY_RETENTION="${HOURLY_RETENTION:-48}"
MODE="${1:-daily}"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

case "${MODE}" in
  daily)   DEST_DIR="${BACKUP_ROOT}/daily";;
  hourly)  DEST_DIR="${BACKUP_ROOT}/hourly";;
  files)   DEST_DIR="${BACKUP_ROOT}/files";;
  *)       echo "未知模式: ${MODE}（daily|hourly|files）" >&2; exit 2;;
esac
mkdir -p "${DEST_DIR}"

echo "[backup:${MODE}] ${TIMESTAMP} start"

# ---------- 1. PostgreSQL dump（docker exec） ----------
if [[ "${MODE}" != "files" ]]; then
  DB_FILE="${DEST_DIR}/hrms-${TIMESTAMP}.sql.gz"
  # docker exec 内的 pg_dump 走本地 socket（trust）→ 无需密码
  docker exec "${PG_CONTAINER}" pg_dump -U "${PG_USER}" -d "${PG_DB}" \
    | gzip > "${DB_FILE}"
  SIZE="$(du -h "${DB_FILE}" | cut -f1)"
  echo "[backup:${MODE}] db dump ok: ${DB_FILE} (${SIZE})"
  test -s "${DB_FILE}" || { echo "!! 备份文件为空，中止" >&2; exit 1; }
fi

# ---------- 2. uploads 文件（离职证明 / 合同附件等） ----------
UPLOADS_DIR="${COMPOSE_DIR}/server/uploads"
if [[ -d "${UPLOADS_DIR}" ]] && [[ "${MODE}" != "hourly" ]]; then
  FILES_FILE="${DEST_DIR}/hrms-uploads-${TIMESTAMP}.tar.gz"
  tar -czf "${FILES_FILE}" -C "${COMPOSE_DIR}/server" uploads
  echo "[backup:${MODE}] uploads ok: ${FILES_FILE}"
fi

# ---------- 3. 按保留期清理 ----------
if [[ "${MODE}" == "hourly" ]]; then
  find "${DEST_DIR}" -name 'hrms-*.sql.gz' -mmin "+$(( HOURLY_RETENTION * 60 ))" -delete
else
  find "${DEST_DIR}" -name 'hrms-*.sql.gz' -mtime "+${DAILY_RETENTION}" -delete
  find "${DEST_DIR}" -name 'hrms-uploads-*.tar.gz' -mtime "+${DAILY_RETENTION}" -delete
fi
echo "[backup:${MODE}] ${TIMESTAMP} done（保留期：daily=${DAILY_RETENTION}d / hourly=${HOURLY_RETENTION}h）"
