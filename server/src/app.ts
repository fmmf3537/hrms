import compression from 'compression';
import cors from 'cors';
import express, { type Application } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from './lib/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rate-limit';
import routes from './routes';

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

// 日志中间件
if (env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// 解析 JSON 请求体
app.use(express.json({ limit: '10mb' }));

// 解析 URL 编码请求体
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 响应压缩
app.use(compression());

// 部署在 Nginx 反向代理之后：信任第一层代理，
// 使 req.ip 取 X-Forwarded-For 中的真实客户端 IP（限流按真实 IP 聚桶）
app.set('trust proxy', 1);

// 全局限流：1 分钟内最多 100 次请求
app.use(apiLimiter);

// 挂载 API 路由
app.use('/api', routes);

// 404 处理
app.use(notFoundHandler);

// 全局错误处理
app.use(errorHandler);

export default app;
