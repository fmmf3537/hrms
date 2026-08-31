// M5-1: GET /api/health 单元测试（mock prisma + redis，不启 Docker）
/* eslint-disable import/first, import/order */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */

import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  ping: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: { $queryRaw: mocks.queryRaw },
}));

vi.mock('../lib/redis', () => ({
  redis: { ping: mocks.ping },
}));

import { getHealthCheck, handleHealth } from './health';

function mockRes() {
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queryRaw.mockResolvedValue([{ '?column?': 1 }]);
  mocks.ping.mockResolvedValue('PONG');
});

describe('GET /api/health', () => {
  it('200 + status=ok + db=ok + redis=ok', async () => {
    const res = mockRes();
    await handleHealth({} as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('ok');
    expect(res.body.redis).toBe('ok');
    expect(typeof res.body.uptime).toBe('number');
  });

  it('500 + status=error（db 与 redis 均失败）', async () => {
    mocks.queryRaw.mockRejectedValue(new Error('db down'));
    mocks.ping.mockRejectedValue(new Error('redis down'));
    const res = mockRes();
    await handleHealth({} as any, res);
    expect(res.statusCode).toBe(500);
    expect(res.body.status).toBe('error');
    expect(res.body.db).toBe('error');
    expect(res.body.redis).toBe('error');
  });

  it('缺 db → db=error + status=error', async () => {
    mocks.queryRaw.mockRejectedValue(new Error('db down'));
    const result = await getHealthCheck();
    expect(result.db).toBe('error');
    expect(result.redis).toBe('ok');
    expect(result.status).toBe('error');
  });

  it('缺 redis → redis=error + status=error', async () => {
    mocks.ping.mockRejectedValue(new Error('redis down'));
    const result = await getHealthCheck();
    expect(result.db).toBe('ok');
    expect(result.redis).toBe('error');
    expect(result.status).toBe('error');
  });
});
