import { Router, type Router as RouterType } from 'express';

import approvalRoutes from './approval';
import auditRoutes from './audit';
import authRoutes from './auth';
import encryptedFieldRoutes from './encryptedField';
import integrationRoutes from './integration';
import notificationRoutes from './notification';

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
// M0.5-1: 审批流
router.use('/approvals', approvalRoutes);
// M0.5-2: 通知
router.use('/notifications', notificationRoutes);
// M0.5-3: 字段加密
router.use('/encrypted-fields', encryptedFieldRoutes);
// M0.5-4: 第三方对接
router.use('/integrations', integrationRoutes);

export default router;
