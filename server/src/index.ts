import app from './app';
import { env } from './lib/env';
import prisma from './lib/prisma';
import { redis, connectRedis } from './lib/redis';

const { PORT } = env;

// 启动服务器
const server = app.listen(PORT, async () => {
  // 启动时预连接 Redis，尽早暴露连接问题
  await connectRedis();

  console.log(`
🚀 HRMS Server is running!

📡 Environment: ${env.NODE_ENV}
🔗 API URL: http://localhost:${PORT}

Available endpoints:
- GET  /api/health        Health check
- POST /api/auth/login    User login (username + password)
- POST /api/auth/refresh  Refresh access token
- POST /api/auth/logout   User logout
- GET  /api/auth/me       Get current user
  `);
});

// 优雅关闭
function shutdown(signal: string) {
  console.log(`${signal} received, closing server...`);
  server.close(async () => {
    console.log('Server closed');
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// 未捕获的错误处理
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});
