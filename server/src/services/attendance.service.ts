// M2-B2: 打卡管理 service | HRMS
// 仅 import approval/audit/config/notification + prisma；员工/部门/班次走 prisma 直接查询

import type { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as approvalService from './approval.service';
import * as auditService from './audit.service';
import * as configService from './config.service';
import * as notificationService from './notification.service';

const RESOURCE_TYPE = 'AttendanceRecord';

const NOTIFY_MANUAL_APPROVED = 'attendance_manual_approved:in_app';
const NOTIFY_MANUAL_REJECTED = 'attendance_manual_rejected:in_app';
const NOTIFY_IMPORT_DONE = 'attendance_import_done:in_app';

const DEFAULT_WIFI_SSIDS = ['Office-WiFi-XACH', 'Office-WiFi-XACX'];
const DEFAULT_IMPORT_FORMATS = ['deli-e-plus-v1'];
const DEFAULT_MANUAL_FLOW_KEY = 'attendance:manual_clock_approval';

/** 西安办公区默认坐标（TODO: configs.attendance.office_lat/lng 二期配置化） */
const DEFAULT_OFFICE_LAT = 34.3416;
const DEFAULT_OFFICE_LNG = 108.9398;

const VALID_CLOCK_TYPES = ['wifi', 'gps', 'manual', 'imported'];

export interface ClockInInput {
  employeeId: string;
  clockType: 'wifi' | 'gps' | 'manual';
  clockInTime: Date | string;
  clockOutTime?: Date | string;
  wifiSsid?: string;
  wifiMac?: string;
  gpsLat?: number;
  gpsLng?: number;
  gpsAccuracy?: number;
  gpsAddress?: string;
}

export interface ManualClockInput {
  employeeId: string;
  clockInTime: Date | string;
  clockOutTime?: Date | string;
  clockType: 'manual';
  manualReason: string;
  wifiSsid?: string;
  gpsLat?: number;
  gpsLng?: number;
}

export interface ImportAttendanceInput {
  fileContent: string;
  format: string;
  effectiveDate?: Date | string;
}

export interface ImportError {
  row: number;
  message: string;
  employeeName?: string;
}

export interface ListAttendanceQuery {
  employeeId?: string;
  companyId?: string;
  departmentId?: string;
  status?: string;
  clockType?: string;
  dateFrom?: Date | string;
  dateTo?: Date | string;
  page?: number;
  pageSize?: number;
}

export interface AnomalyResult {
  isLate: boolean;
  lateMinutes: number;
  isEarlyLeave: boolean;
  earlyLeaveMinutes: number;
  isMissing: boolean;
}

export interface DeliEPlusRow {
  employeeName: string;
  clockDateTime: string;
  clockType: 'in' | 'out';
  externalId?: string;
}

interface ShiftLike {
  startTime: string;
  endTime: string;
  flexMinutes?: number;
}

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function clockMinutes(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function monthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

async function getWifiSsids(): Promise<string[]> {
  try {
    const v = await configService.getValue('attendance', 'wifi_ssids');
    if (Array.isArray(v)) return v.map(String);
    return [...DEFAULT_WIFI_SSIDS];
  } catch {
    // TODO: configs.attendance.wifi_ssids fallback
    return [...DEFAULT_WIFI_SSIDS];
  }
}

async function getGpsMaxDistance(): Promise<number> {
  try {
    const v = await configService.getValue('attendance', 'gps_max_distance');
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 100;
  } catch {
    return 100;
  }
}

async function getLateThreshold(): Promise<number> {
  try {
    const v = await configService.getValue('attendance', 'late_threshold');
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 30;
  } catch {
    return 30;
  }
}

async function getEarlyLeaveThreshold(): Promise<number> {
  try {
    const v = await configService.getValue('attendance', 'early_leave_threshold');
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 30;
  } catch {
    return 30;
  }
}

async function getImportFormats(): Promise<string[]> {
  try {
    const v = await configService.getValue('attendance', 'import_formats');
    if (Array.isArray(v)) return v.map(String);
    return [...DEFAULT_IMPORT_FORMATS];
  } catch {
    return [...DEFAULT_IMPORT_FORMATS];
  }
}

async function getManualFlowKey(): Promise<string> {
  try {
    const v = await configService.getValue('attendance', 'manual_clock_flow_key');
    return typeof v === 'string' && v.length > 0 ? v : DEFAULT_MANUAL_FLOW_KEY;
  } catch {
    return DEFAULT_MANUAL_FLOW_KEY;
  }
}

async function getMonthlyMaxManual(): Promise<number> {
  try {
    const v = await configService.getValue('attendance', 'monthly_max_manual');
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 3;
  } catch {
    return 3;
  }
}

async function validateEmployee(employeeId: string) {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
  });
  if (!employee) {
    throw new AppError('员工不存在', 404, 71201);
  }
  if (!employee.departmentId) {
    throw new AppError('员工未分配部门', 400, 71201);
  }
  return { ...employee, departmentId: employee.departmentId };
}

function validateClockType(clockType: string): void {
  if (!VALID_CLOCK_TYPES.includes(clockType)) {
    throw new AppError('打卡类型不合法', 400, 71910);
  }
}

function validateClockTime(clockInTime: Date): void {
  const now = Date.now();
  const maxFuture = now + 5 * 60 * 1000;
  const minPast = now - 365 * 24 * 60 * 60 * 1000;
  const ts = clockInTime.getTime();
  if (ts > maxFuture || ts < minPast) {
    throw new AppError('打卡时间不合法', 400, 71906);
  }
}

async function checkDuplicateClock(employeeId: string, clockInTime: Date): Promise<void> {
  const existing = await prisma.attendanceRecord.findFirst({
    where: { employeeId, clockInTime },
  });
  if (existing) {
    throw new AppError('该时间已打卡', 409, 71902);
  }
}

async function resolveShiftContext(employeeId: string, at: Date) {
  const day = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  const assignment = await prisma.shiftAssignment.findFirst({
    where: {
      employeeId,
      effectiveFrom: { lte: day },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: day } }],
    },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (!assignment) {
    return { assignment: null, shift: null };
  }
  const shift = await prisma.shiftTemplate.findUnique({
    where: { id: assignment.shiftId },
  });
  return { assignment, shift };
}

/**
 * 内部：WiFi SSID 是否在白名单
 */
export async function isValidWifiSsid(ssid: string): Promise<boolean> {
  const allowed = await getWifiSsids();
  return allowed.includes(ssid);
}

/**
 * 内部：Haversine 距离（米）
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * 内部：异常判定
 */
export async function calculateAnomaly(
  clockInTime: Date,
  clockOutTime: Date | null,
  shift: ShiftLike | null,
): Promise<AnomalyResult> {
  const result: AnomalyResult = {
    isLate: false,
    lateMinutes: 0,
    isEarlyLeave: false,
    earlyLeaveMinutes: 0,
    isMissing: !clockOutTime,
  };

  if (!shift) {
    return result;
  }

  const lateThreshold = await getLateThreshold();
  const earlyThreshold = await getEarlyLeaveThreshold();
  const startMin = timeToMinutes(shift.startTime);
  const endMin = timeToMinutes(shift.endTime);
  const inMin = clockMinutes(clockInTime);

  if (inMin > startMin + lateThreshold) {
    result.isLate = true;
    result.lateMinutes = inMin - startMin;
  }

  if (clockOutTime) {
    const outMin = clockMinutes(clockOutTime);
    if (outMin < endMin - earlyThreshold) {
      result.isEarlyLeave = true;
      result.earlyLeaveMinutes = endMin - outMin;
    }
    result.isMissing = false;
  }

  return result;
}

/**
 * 内部：得力 e+ Excel 解析（mock CSV 行，B2 不接真实 SaaS）
 */
export function parseDeliEPlusExcel(fileContent: string): DeliEPlusRow[] {
  const text = Buffer.from(fileContent, 'base64').toString('utf-8');
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows: DeliEPlusRow[] = [];

  lines.forEach((line, idx) => {
    if (idx === 0 && line.toUpperCase().startsWith('DELI-E-PLUS')) return;
    const parts = line.split(',').map((p) => p.trim());
    if (parts.length < 3) return;
    const [employeeName, clockDateTime, clockType, externalId] = parts;
    if (!employeeName || !clockDateTime) return;
    rows.push({
      employeeName,
      clockDateTime,
      clockType: clockType === 'out' ? 'out' : 'in',
      externalId,
    });
  });

  return rows;
}

/**
 * 打卡（WiFi / GPS）
 */
export async function clockIn(
  input: ClockInInput,
  operatorId: string,
) {
  if (input.clockType === 'manual') {
    throw new AppError('补卡请走 /attendance/manual 接口', 400, 71910);
  }

  validateClockType(input.clockType);
  const employee = await validateEmployee(input.employeeId);
  const clockInTime = toDate(input.clockInTime);
  validateClockTime(clockInTime);
  await checkDuplicateClock(input.employeeId, clockInTime);

  if (input.clockType === 'wifi') {
    if (!input.wifiSsid) {
      throw new AppError('WiFi SSID 必填', 400, 71903);
    }
    const valid = await isValidWifiSsid(input.wifiSsid);
    if (!valid) {
      throw new AppError('请连接办公 WiFi', 403, 71903);
    }
  }

  if (input.clockType === 'gps') {
    if (input.gpsLat === undefined || input.gpsLng === undefined) {
      throw new AppError('GPS 坐标必填', 400, 71904);
    }
    const maxDist = await getGpsMaxDistance();
    const dist = haversineDistance(
      input.gpsLat,
      input.gpsLng,
      DEFAULT_OFFICE_LAT,
      DEFAULT_OFFICE_LNG,
    );
    if (dist > maxDist) {
      throw new AppError('请在办公区域打卡', 403, 71904);
    }
  }

  const clockOutTime = input.clockOutTime ? toDate(input.clockOutTime) : null;
  const { assignment, shift } = await resolveShiftContext(input.employeeId, clockInTime);

  const anomaly = await calculateAnomaly(clockInTime, clockOutTime, shift);

  const record = await prisma.attendanceRecord.create({
    data: {
      employeeId: employee.id,
      companyId: employee.companyId,
      departmentId: employee.departmentId,
      shiftAssignmentId: assignment?.id,
      clockInTime,
      clockOutTime,
      clockType: input.clockType,
      source: 'app',
      wifiSsid: input.wifiSsid,
      wifiMac: input.wifiMac,
      gpsLat: input.gpsLat !== undefined ? new Decimal(input.gpsLat) : undefined,
      gpsLng: input.gpsLng !== undefined ? new Decimal(input.gpsLng) : undefined,
      gpsAccuracy: input.gpsAccuracy !== undefined
        ? new Decimal(input.gpsAccuracy)
        : undefined,
      gpsAddress: input.gpsAddress,
      isLate: anomaly.isLate,
      lateMinutes: anomaly.lateMinutes,
      isEarlyLeave: anomaly.isEarlyLeave,
      earlyLeaveMinutes: anomaly.earlyLeaveMinutes,
      isMissing: anomaly.isMissing,
      status: 'approved',
      isManual: false,
      createdBy: operatorId,
    },
  });

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: 'CLOCK_IN',
    resourceType: RESOURCE_TYPE,
    resourceId: record.id,
    description: `${input.clockType} 打卡`,
    newValue: { employeeId: employee.id, clockType: input.clockType },
  });

  return record;
}

/**
 * 补卡申请（走 M0.5-1 审批流）
 */
export async function submitManualClock(
  input: ManualClockInput,
  operatorId: string,
) {
  if (!input.manualReason || input.manualReason.trim().length <= 10) {
    throw new AppError('补卡原因至少 10 个字符', 400, 71906);
  }

  const employee = await validateEmployee(input.employeeId);
  const clockInTime = toDate(input.clockInTime);
  validateClockTime(clockInTime);
  await checkDuplicateClock(input.employeeId, clockInTime);

  const maxManual = await getMonthlyMaxManual();
  const manualCount = await prisma.attendanceRecord.count({
    where: {
      employeeId: input.employeeId,
      isManual: true,
      createdAt: { gte: monthStart(clockInTime) },
    },
  });
  if (manualCount >= maxManual) {
    throw new AppError('当月补卡次数已达上限', 429, 71909);
  }

  const clockOutTime = input.clockOutTime ? toDate(input.clockOutTime) : null;
  const { assignment } = await resolveShiftContext(input.employeeId, clockInTime);

  const record = await prisma.attendanceRecord.create({
    data: {
      employeeId: employee.id,
      companyId: employee.companyId,
      departmentId: employee.departmentId,
      shiftAssignmentId: assignment?.id,
      clockInTime,
      clockOutTime,
      clockType: 'manual',
      source: 'admin',
      wifiSsid: input.wifiSsid,
      gpsLat: input.gpsLat !== undefined ? new Decimal(input.gpsLat) : undefined,
      gpsLng: input.gpsLng !== undefined ? new Decimal(input.gpsLng) : undefined,
      isManual: true,
      manualReason: input.manualReason.trim(),
      status: 'pending',
      createdBy: operatorId,
    },
  });

  const flowKey = await getManualFlowKey();
  const instance = await approvalService.submitApproval({
    flowKey,
    businessType: 'attendance_manual',
    businessId: record.id,
    title: `${employee.name} 补卡申请 - ${clockInTime.toISOString().slice(0, 10)}`,
    initiatorId: operatorId,
    data: {
      employeeId: employee.id,
      clockInTime: clockInTime.toISOString(),
      manualReason: input.manualReason,
    },
  });

  await prisma.attendanceRecord.update({
    where: { id: record.id },
    data: { approvalInstanceId: instance.id },
  });

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: 'SUBMIT_MANUAL',
    resourceType: RESOURCE_TYPE,
    resourceId: record.id,
    description: '提交补卡申请',
    newValue: { approvalInstanceId: instance.id },
  });

  return prisma.attendanceRecord.findUniqueOrThrow({ where: { id: record.id } });
}

/**
 * 补卡审批通过/拒绝回调
 */
export async function confirmManualClock(
  id: string,
  approvalResult: { approved: boolean; instanceId?: string },
  operatorId: string,
  rejectedReason?: string,
) {
  const existing = await prisma.attendanceRecord.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('打卡记录不存在', 404, 71901);
  }
  if (existing.status !== 'pending') {
    throw new AppError('补卡已审批', 409, 71908);
  }

  const employee = await prisma.employee.findFirst({
    where: { id: existing.employeeId, deletedAt: null },
    select: { id: true, name: true, userId: true },
  });

  if (approvalResult.approved) {
    const { shift } = await resolveShiftContext(
      existing.employeeId,
      existing.clockInTime ?? new Date(),
    );
    const anomaly = await calculateAnomaly(
      existing.clockInTime!,
      existing.clockOutTime,
      shift,
    );

    const updated = await prisma.attendanceRecord.update({
      where: { id },
      data: {
        status: 'approved',
        isLate: anomaly.isLate,
        lateMinutes: anomaly.lateMinutes,
        isEarlyLeave: anomaly.isEarlyLeave,
        earlyLeaveMinutes: anomaly.earlyLeaveMinutes,
        isMissing: anomaly.isMissing,
      },
    });

    if (employee?.userId) {
      await notificationService.sendNotification({
        templateKey: NOTIFY_MANUAL_APPROVED,
        userId: employee.userId,
        data: { employee_name: employee.name },
        bypassTemplate: {
          channel: 'in_app',
          subject: '补卡已通过',
          content: `${employee.name}，您的补卡申请已通过。`,
        },
      }).catch(() => undefined);
    }

    await auditService.auditLog({
      userId: operatorId,
      actorType: 'USER',
      action: 'APPROVE',
      resourceType: RESOURCE_TYPE,
      resourceId: id,
      description: '补卡审批通过',
    });

    return updated;
  }

  const updated = await prisma.attendanceRecord.update({
    where: { id },
    data: {
      status: 'rejected',
      rejectedAt: new Date(),
      rejectedBy: operatorId,
      rejectedReason: rejectedReason ?? '审批驳回',
    },
  });

  if (employee?.userId) {
    await notificationService.sendNotification({
      templateKey: NOTIFY_MANUAL_REJECTED,
      userId: employee.userId,
      data: { employee_name: employee.name },
      bypassTemplate: {
        channel: 'in_app',
        subject: '补卡已驳回',
        content: `${employee.name}，您的补卡申请已驳回。`,
      },
    }).catch(() => undefined);
  }

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: 'REJECT',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: '补卡审批驳回',
  });

  return updated;
}

/**
 * 考勤数据导入（得力 e+ mock 解析）
 */
export async function importAttendance(
  input: ImportAttendanceInput,
  operatorId: string,
): Promise<{ imported: number; skipped: number; errors: ImportError[] }> {
  const formats = await getImportFormats();
  if (!formats.includes(input.format)) {
    throw new AppError('导入格式不支持', 400, 71907);
  }

  const rows = parseDeliEPlusExcel(input.fileContent);
  const errors: ImportError[] = [];
  const toCreate: Prisma.AttendanceRecordCreateManyInput[] = [];
  let skipped = 0;

  /* eslint-disable no-await-in-loop -- 逐行解析需查员工与去重 */
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const employee = await prisma.employee.findFirst({
      where: { name: row.employeeName, deletedAt: null },
    });
    if (!employee) {
      errors.push({
        row: i + 1,
        message: '员工不存在',
        employeeName: row.employeeName,
      });
    } else {
      const externalId = row.externalId ?? `deli-${row.employeeName}-${row.clockDateTime}`;
      const dup = await prisma.attendanceRecord.findFirst({
        where: { importedExternalId: externalId },
      });
      if (dup) {
        skipped += 1;
      } else {
        const clockInTime = toDate(row.clockDateTime);
        const { assignment, shift } = await resolveShiftContext(employee.id, clockInTime);
        const clockOutTime = row.clockType === 'out' ? clockInTime : null;
        const clockInOnly = row.clockType === 'in' ? clockInTime : clockInTime;
        const anomaly = await calculateAnomaly(clockInOnly, clockOutTime, shift);

        toCreate.push({
          employeeId: employee.id,
          companyId: employee.companyId,
          departmentId: employee.departmentId!,
          shiftAssignmentId: assignment?.id,
          clockInTime: clockInOnly,
          clockOutTime: row.clockType === 'out' ? clockInTime : null,
          clockType: 'imported',
          source: 'import',
          importedExternalId: externalId,
          importedFrom: input.format,
          importedAt: new Date(),
          isLate: anomaly.isLate,
          lateMinutes: anomaly.lateMinutes,
          isEarlyLeave: anomaly.isEarlyLeave,
          earlyLeaveMinutes: anomaly.earlyLeaveMinutes,
          isMissing: anomaly.isMissing,
          status: 'approved',
          createdBy: operatorId,
        });
      }
    }
  }
  /* eslint-enable no-await-in-loop */

  if (toCreate.length > 0) {
    await prisma.attendanceRecord.createMany({ data: toCreate, skipDuplicates: true });
  }

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: 'IMPORT',
    resourceType: RESOURCE_TYPE,
    resourceId: operatorId,
    description: `导入考勤 ${toCreate.length} 条`,
    newValue: { imported: toCreate.length, skipped, errors: errors.length },
  });

  await notificationService.sendNotification({
    templateKey: NOTIFY_IMPORT_DONE,
    userId: operatorId,
    data: { imported: toCreate.length },
    bypassTemplate: {
      channel: 'in_app',
      subject: '考勤导入完成',
      content: `考勤导入完成：成功 ${toCreate.length} 条，跳过 ${skipped} 条，错误 ${errors.length} 条。`,
    },
  }).catch(() => undefined);

  return {
    imported: toCreate.length,
    skipped,
    errors,
  };
}

/**
 * 单查打卡记录
 */
export async function getAttendanceById(id: string) {
  const record = await prisma.attendanceRecord.findUnique({ where: { id } });
  if (!record) {
    throw new AppError('打卡记录不存在', 404, 71901);
  }
  return record;
}

/**
 * 打卡记录列表
 */
export async function listAttendance(query: ListAttendanceQuery = {}) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const where: Prisma.AttendanceRecordWhereInput = {
    ...(query.employeeId ? { employeeId: query.employeeId } : {}),
    ...(query.companyId ? { companyId: query.companyId } : {}),
    ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.clockType ? { clockType: query.clockType } : {}),
  };

  if (query.dateFrom || query.dateTo) {
    where.clockInTime = {
      ...(query.dateFrom ? { gte: toDate(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: toDate(query.dateTo) } : {}),
    };
  }

  const [data, total] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where,
      orderBy: { clockInTime: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.attendanceRecord.count({ where }),
  ]);

  return {
    data,
    total,
    page,
    pageSize,
  };
}
