-- M0.5-5: 启用 pgvector 扩展（V1.2 AI 底座依赖）
-- 仅首次容器启动时自动执行（docker-entrypoint-initdb.d 机制）
-- 参考：https://github.com/pgvector/pgvector

CREATE EXTENSION IF NOT EXISTS vector;

-- 验证（开发期方便排查，生产可移除）
-- SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';