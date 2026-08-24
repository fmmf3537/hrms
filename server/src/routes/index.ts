import { Router, type Router as RouterType } from 'express';

import auditRoutes from './audit';
import authRoutes from './auth';

const router: RouterType = Router();

// 健康检查
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
  });
});

// 挂载各模块路由
router.use('/auth', authRoutes);
router.use('/audit-logs', auditRoutes);

export default router;
