// M5-1: Dockerfile / nginx / docker-compose / 部署脚本静态分析（不启真实 Docker）
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../../../..');

function readRoot(name: string): string {
  return readFileSync(resolve(ROOT, name), 'utf8');
}

describe('Dockerfile.server', () => {
  const df = readRoot('Dockerfile.server');

  it('包含 4 阶段 build（deps / builder / prod-deps / runner）', () => {
    expect(df).toMatch(/AS deps/);
    expect(df).toMatch(/AS builder/);
    expect(df).toMatch(/AS prod-deps/);
    expect(df).toMatch(/AS runner/);
    const froms = df.match(/^FROM /gm) ?? [];
    expect(froms.length).toBe(4);
  });

  it('非 root 用户（USER hrms）', () => {
    expect(df).toMatch(/USER hrms/);
    expect(df).toMatch(/adduser -S hrms/);
  });

  it('HEALTHCHECK 检查 /api/health', () => {
    expect(df).toMatch(/HEALTHCHECK/);
    expect(df).toMatch(/\/api\/health/);
  });

  it('CMD 跑 prisma migrate deploy + node dist/index.js', () => {
    expect(df).toMatch(/prisma migrate deploy/);
    expect(df).toMatch(/node dist\/index\.js/);
  });
});

describe('nginx reverse proxy', () => {
  const conf = readRoot('nginx-client.conf');

  it('反代 /api/ → http://server:3001/api/', () => {
    expect(conf).toMatch(/location \/api\//);
    expect(conf).toMatch(/proxy_pass http:\/\/server:3001\/api\//);
  });

  it('SPA fallback 所有请求 → /index.html', () => {
    expect(conf).toMatch(/try_files \$uri \$uri\/ \/index\.html/);
  });

  it('gzip 压缩启用（text/css / application/javascript）', () => {
    expect(conf).toMatch(/gzip on/);
    expect(conf).toMatch(/text\/css/);
    expect(conf).toMatch(/application\/javascript/);
  });

  it('安全 headers 启用（X-Frame-Options / X-Content-Type-Options）', () => {
    expect(conf).toMatch(/X-Frame-Options/);
    expect(conf).toMatch(/X-Content-Type-Options/);
  });
});

describe('static assets', () => {
  const conf = readRoot('nginx-client.conf');

  it('location /assets/ 永久缓存', () => {
    expect(conf).toMatch(/location \/assets\//);
    expect(conf).toMatch(/expires 1y/);
  });

  it('SSL 配置注释存在（生产环境启用）', () => {
    expect(conf).toMatch(/# listen 443 ssl http2;/);
    expect(conf).toMatch(/# ssl_certificate /);
  });
});

describe('docker-compose.yml', () => {
  const yml = readRoot('docker-compose.yml');

  it('4 服务：postgres / redis / server / client', () => {
    expect(yml).toMatch(/^\s+postgres:/m);
    expect(yml).toMatch(/^\s+redis:/m);
    expect(yml).toMatch(/^\s+server:/m);
    expect(yml).toMatch(/^\s+client:/m);
  });

  it('server depends_on postgres + redis healthcheck', () => {
    expect(yml).toMatch(/condition: service_healthy/);
    expect(yml).toMatch(/pgvector\/pgvector:pg16/);
  });

  it('server 不暴露端口（仅 client 暴露 80）', () => {
    expect(yml).toMatch(/CLIENT_PORT:-80/);
    expect(yml).not.toMatch(/3001:3001/);
  });

  it('JWT_SECRET / ENCRYPTION_KEY 必填（?: 语法）', () => {
    expect(yml).toMatch(/JWT_SECRET:\s*\$\{JWT_SECRET:\?/);
    expect(yml).toMatch(/ENCRYPTION_KEY:\s*\$\{ENCRYPTION_KEY:\?/);
  });
});

describe('deploy.sh / deploy.ps1', () => {
  const sh = readRoot('deploy.sh');
  const ps1 = readRoot('deploy.ps1');

  it('检查 Docker + docker-compose 已安装', () => {
    expect(sh).toMatch(/command -v docker/);
    expect(sh).toMatch(/docker-compose|docker compose/);
    expect(ps1).toMatch(/Get-Command docker/);
  });

  it('检查必填环境变量（JWT_SECRET / ENCRYPTION_KEY / DB_*）', () => {
    expect(sh).toMatch(/JWT_SECRET/);
    expect(sh).toMatch(/ENCRYPTION_KEY/);
    expect(sh).toMatch(/DB_USER/);
    expect(ps1).toMatch(/JWT_SECRET/);
    expect(ps1).toMatch(/ENCRYPTION_KEY/);
  });

  it('docker-compose down + build + up -d + ps + logs', () => {
    expect(sh).toMatch(/docker-compose down/);
    expect(sh).toMatch(/docker-compose build --no-cache/);
    expect(sh).toMatch(/docker-compose up -d/);
    expect(ps1).toMatch(/docker-compose down/);
    expect(ps1).toMatch(/docker-compose build --no-cache/);
    expect(ps1).toMatch(/docker-compose up -d/);
  });
});
