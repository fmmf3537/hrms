// M4-C5: 工资条 HTML / PDF 生成（mock PDF，不接真实 PDF 库）| HRMS
// 复用 C4 payslips + payslip_items；0 新表

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';

const RESOURCE_TYPE = 'payslip';
const FALLBACK_TEMPLATE = 'default';

export interface GeneratePayslipResult {
  payslipId: string;
  employeeId: string;
  period: string;
  html: string;
  pdf: Buffer;
  fileName: string;
  generatedAt: Date;
}

function toNum(v: { toString(): string } | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : Number(v);
}

async function getTemplateName(): Promise<string> {
  try {
    const v = await configService.getValue('salary', 'payslip.template');
    return typeof v === 'string' && v.length > 0 ? v : FALLBACK_TEMPLATE;
  } catch {
    // TODO: configs.salary.payslip.template 未配置时 fallback
    return FALLBACK_TEMPLATE;
  }
}

function buildHtml(input: {
  employeeName: string;
  employeeNo: string;
  period: string;
  template: string;
  gross: number;
  deduction: number;
  net: number;
  tax: number;
  items: Array<{ itemName: string; amount: number }>;
}): string {
  const rows = input.items
    .map((it) => `<tr><td>${it.itemName}</td><td>${it.amount.toFixed(2)}</td></tr>`)
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${input.period} 工资条</title></head>
<body data-template="${input.template}">
<h1>电子工资条</h1>
<p>员工：${input.employeeName}（${input.employeeNo}） 期间：${input.period}</p>
<table>
<tr><th>项目</th><th>金额</th></tr>
${rows}
</table>
<p>应发合计：${input.gross.toFixed(2)}</p>
<p>各项扣款：${input.deduction.toFixed(2)}</p>
<p>实发金额：${input.net.toFixed(2)}</p>
<p>个税明细：${input.tax.toFixed(2)}</p>
</body></html>`;
}

/**
 * 生成工资条（HTML + mock PDF，V1.2 §二.4.6）
 * @param actorId 操作人 ID
 * @param payslipId payslip ID
 * @returns html + pdf Buffer + fileName
 * @throws AppError(400, 73501) 不存在
 * @throws AppError(400, 73502) 未审批
 * @throws AppError(400, 73503) 生成失败
 * 校验链：
 *  1. 查 payslip（含 items + employee）
 *  2. status 必须为 approved 或 locked
 *  3. 读 configs.salary.payslip.template
 *  4. 拼接 HTML（应发合计 / 各项扣款 / 实发 / 个税明细）
 *  5. PDF 留 mock（Buffer，fileName 以 .pdf 结尾）
 *  6. 写 audit PAYSLIP_GENERATE
 */
export async function generatePayslip(
  actorId: string,
  payslipId: string,
): Promise<GeneratePayslipResult> {
  const rec = await prisma.payslip.findUnique({
    where: { id: payslipId },
    include: { items: true, employee: true },
  });
  if (!rec) {
    throw new AppError('工资单不存在', 400, 73501);
  }
  if (rec.status !== 'approved' && rec.status !== 'locked') {
    throw new AppError('工资单尚未审批，无法生成工资条', 400, 73502);
  }

  const template = await getTemplateName();
  const gross = toNum(rec.grossAmount);
  const deduction = toNum(rec.deductionAmount);
  const net = toNum(rec.netAmount);
  const tax = toNum(rec.taxAmount);

  let html: string;
  let pdf: Buffer;
  try {
    html = buildHtml({
      employeeName: rec.employee.name,
      employeeNo: rec.employee.employeeNo,
      period: rec.period,
      template,
      gross,
      deduction,
      net,
      tax,
      items: rec.items.map((it) => ({
        itemName: it.itemName,
        amount: toNum(it.amount),
      })),
    });
    pdf = Buffer.from(`%PDF-1.4 mock\n${html}`, 'utf8');
  } catch {
    throw new AppError('工资条生成失败', 400, 73503);
  }

  const generatedAt = new Date();
  const fileName = `payslip-${rec.employee.employeeNo}-${rec.period}.pdf`;
  const result: GeneratePayslipResult = {
    payslipId: rec.id,
    employeeId: rec.employeeId,
    period: rec.period,
    html,
    pdf,
    fileName,
    generatedAt,
  };

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'PAYSLIP_GENERATE',
    resourceType: RESOURCE_TYPE,
    resourceId: payslipId,
    description: `生成 ${rec.period} 工资条`,
    newValue: {
      payslipId, employeeId: rec.employeeId, period: rec.period, format: 'html+pdf',
    },
  });

  return result;
}

/**
 * 读取 HTML 工资条（即时生成，0 新表不落库）
 */
export async function getPayslipHtml(actorId: string, payslipId: string): Promise<string> {
  const r = await generatePayslip(actorId, payslipId);
  return r.html;
}

/**
 * 读取 mock PDF 工资条
 */
export async function getPayslipPdf(actorId: string, payslipId: string): Promise<{
  fileName: string;
  pdf: Buffer;
}> {
  const r = await generatePayslip(actorId, payslipId);
  return { fileName: r.fileName, pdf: r.pdf };
}
