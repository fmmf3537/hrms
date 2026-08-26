import { Router, type Router as RouterType } from 'express';

import aiRoutes from './ai';
import approvalRoutes from './approval';
import auditRoutes from './audit';
import authRoutes from './auth';
import companyRoutes from './company';
import configRoutes from './config';
import contractRoutes from './contract';
import departmentRoutes from './department';
import employeeRoutes from './employee';
import encryptedFieldRoutes from './encryptedField';
import integrationRoutes from './integration';
import notificationRoutes from './notification';
import offboardingRoutes from './offboarding';
import onboardingRoutes from './onboarding';
import regularizationRoutes from './regularization';
import transferRoutes from './transfer';

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
// M0.5-5: AI 底座
router.use('/ai', aiRoutes);
// M0.5-6: 配置中心
router.use('/configs', configRoutes);
// M1-A1+A2: 组织架构 + 员工档案
router.use('/companies', companyRoutes);
router.use('/departments', departmentRoutes);
router.use('/employees', employeeRoutes);
router.use('/onboarding', onboardingRoutes);
router.use('/regularizations', regularizationRoutes);
router.use('/offboarding', offboardingRoutes);
router.use('/transfers', transferRoutes);
router.use('/contracts', contractRoutes);

export default router;
