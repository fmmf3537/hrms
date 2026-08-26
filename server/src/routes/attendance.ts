// M2-B2: 打卡管理 routes | HRMS
import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';

import { PERMISSIONS } from '../constants/permissions';
import * as attendanceController from '../controllers/attendance.controller';
import {
  authenticate, rejectIfMustChangePassword, requirePermission,
} from '../middleware/auth';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

router.use(authenticate, rejectIfMustChangePassword);

const listSchema = z.object({
  employeeId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  status: z.enum(['approved', 'pending', 'rejected']).optional(),
  clockType: z.enum(['wifi', 'gps', 'manual', 'imported']).optional(),
  dateFrom: z.string().min(1).optional(),
  dateTo: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100)
    .default(20),
});

const clockInSchema = z.object({
  employeeId: z.string().uuid(),
  clockType: z.enum(['wifi', 'gps']),
  clockInTime: z.string().min(1),
  clockOutTime: z.string().min(1).optional(),
  wifiSsid: z.string().max(100).optional(),
  wifiMac: z.string().max(50).optional(),
  gpsLat: z.number().optional(),
  gpsLng: z.number().optional(),
  gpsAccuracy: z.number().optional(),
  gpsAddress: z.string().max(500).optional(),
});

const manualSchema = z.object({
  employeeId: z.string().uuid(),
  clockInTime: z.string().min(1),
  clockOutTime: z.string().min(1).optional(),
  clockType: z.literal('manual'),
  manualReason: z.string().min(1).max(2000),
  wifiSsid: z.string().max(100).optional(),
  gpsLat: z.number().optional(),
  gpsLng: z.number().optional(),
});

const importSchema = z.object({
  fileContent: z.string().min(1),
  format: z.string().min(1),
  effectiveDate: z.string().min(1).optional(),
});

router.post(
  '/clock-in',
  requirePermission(PERMISSIONS.ATTENDANCE_CLOCK),
  validate(clockInSchema),
  attendanceController.clockIn,
);

router.get(
  '/records',
  requirePermission(PERMISSIONS.ATTENDANCE_READ),
  validate(listSchema, 'query'),
  attendanceController.list,
);

router.get(
  '/records/:id',
  requirePermission(PERMISSIONS.ATTENDANCE_READ),
  attendanceController.getById,
);

router.post(
  '/manual',
  requirePermission(PERMISSIONS.ATTENDANCE_MANUAL),
  validate(manualSchema),
  attendanceController.manual,
);

router.post(
  '/import',
  requirePermission(PERMISSIONS.ATTENDANCE_WRITE),
  validate(importSchema),
  attendanceController.importData,
);

export default router;
