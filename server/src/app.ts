import compression from 'compression';
import cors from 'cors';
import express, { type Application } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { env } from './lib/env';
import { logger } from './lib/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { ipLimiter } from './middleware/rate-limit';
import routes from './routes';
import { handleHealth } from './routes/health';

// 创建 Express 应用
const app: Application = express();

// 安全中间件
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS 配置（支持逗号分隔的多 origin）
const corsOrigins = env.CORS_ORIGIN.split(',').map((s) => s.trim());
app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));

// M5-11: 结构化请求日志（pino-http）；健康检查轮询不打日志
app.use(pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => req.url === '/api/health',
  },
}));

// 解析 JSON 请求体
app.use(express.json({ limit: '10mb' }));

// 解析 URL 编码请求体
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 响应压缩
app.use(compression());

// 部署在 Nginx 反向代理之后：信任第一层代理，
// 使 req.ip 取 X-Forwarded-For 中的真实客户端 IP（限流按真实 IP 聚桶）
app.set('trust proxy', 1);

// M5-1: 运维健康检查（公开、不限流，供 Docker healthcheck）
app.get('/api/health', handleHealth);

// M5-09 fix2: 全局 IP 级兜底限流 3000/min（防未认证 flood / 共享出口挤兑）。
// 已认证用户的 300/min 限流由 authenticate 内部串联 userLimiter 生效（按 userId 取桶）。
app.use(ipLimiter);

// 挂载 API 路由
app.use('/api', routes);

// 404 处理
app.use(notFoundHandler);

// 全局错误处理
app.use(errorHandler);

export default app;
