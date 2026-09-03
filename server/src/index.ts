import app from './app';
import {
  registerBusinessSchedules, startBusinessWorkers, stopBusinessWorkers,
} from './jobs/business.jobs';
import { startNotificationWorker, stopNotificationWorker } from './jobs/notification.queue';
import { env } from './lib/env';
import prisma from './lib/prisma';
import { redis, connectRedis } from './lib/redis';
import { startCacheRefresh, stopCacheRefresh } from './services/config.service';

const { PORT } = env;

const server = app.listen(PORT, async () => {
  await connectRedis();
  await startNotificationWorker();
  // M5-10: 业务定时任务（月结 / AI 摘要 / 季度结算 / 成本预警 / 调薪执行）
  await registerBusinessSchedules();
  await startBusinessWorkers();
  startCacheRefresh();

  console.log(`
🚀 HRMS Server is running!

📡 Environment: ${env.NODE_ENV}
🔗 API URL: http://localhost:${PORT}

Available endpoints:
- GET  /api/health
- POST /api/auth/login
- POST /api/auth/change-password
- GET  /api/configs
- GET  /api/approvals/flows
- GET  /api/notifications
- GET  /api/integrations
  `);
});

function shutdown(signal: string) {
  console.log(`${signal} received, closing server...`);
  server.close(async () => {
    console.log('Server closed');
    stopCacheRefresh();
    await stopNotificationWorker();
    await stopBusinessWorkers();
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});
