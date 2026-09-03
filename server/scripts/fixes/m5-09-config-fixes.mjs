// M5-09 订正脚本 | HRMS | 2026-09-02
// 一次性脚本：旧库订正（缺陷 2 + 缺陷 3 + 缺陷 4 + E2E 04 finalGrade 兜底）
//
// 1. 缺陷 2：补 attendance.office_lat / attendance.office_lng configs（GPS 打卡坐标，二期配置化前置）
// 2. 缺陷 3：leave.approval_flow_short 改 'leave:leave_default'（对齐 seed 实际审批流 key）
// 3. 缺陷 4：为 5 名 seed 员工各建 1 条 active EmployeeSalaryPlan（算薪前置）
// 4. 缺陷 4：为 5 名 seed 员工各建 1 条 active EmployeeInsuranceRegistration（算薪前置）
// 5. E2E 04 兜底：5 名 seed 员工各确保 1 条 finalGrade performance record（calculateSinglePayroll 要求）
//    说明：spec §4.4 未列出此条，但 E2E 04「全链路算薪」要求 admin 至少算出，必须有 finalGrade。
//    现状：seed D3 demo 因存在性检查过窄（finalScore=95 才跳过）在 dev DB 崩溃从未跑成功，
//    故通过本脚本兜底补齐；seed.ts 内的 ensure 块保留，admin 重跑 seed 时也能 cover 新库。
//
// 运行方式：cd server && node scripts/fixes/m5-09-config-fixes.mjs

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ log: ['error'] });

const YEAR = new Date().getFullYear();
const EFFECTIVE_FROM = new Date(`${YEAR}-01-01`);

// C1 薪级 + 档位（兜底补建——dev DB 因 D3 种子崩溃从未跑到 C1）
const GRADE_DEFS = [
  { sequence: 'M', gradeCode: 'M1', name: '高管 M1', minBase: 20000, maxBase: 35000, minPerf: 8000, maxPerf: 20000 },
  { sequence: 'T', gradeCode: 'T3', name: '技术 T3', minBase: 8000, maxBase: 15000, minPerf: 1500, maxPerf: 4000 },
  { sequence: 'P', gradeCode: 'P3', name: '生产 P3', minBase: 6000, maxBase: 12000, minPerf: 1500, maxPerf: 4000 },
  { sequence: 'S', gradeCode: 'S3', name: '销售 S3', minBase: 4000, maxBase: 8000, minPerf: 0, maxPerf: 1000 },
  { sequence: 'A', gradeCode: 'A3', name: '职能 A3', minBase: 7000, maxBase: 13000, minPerf: 1000, maxPerf: 2500 },
];

const LEVEL_SERIES = [
  { code: 'M1', bases: [20000, 22000, 24000, 26000, 28000, 30000], perfs: [8000, 10000, 12000, 14000, 16000, 18000] },
  { code: 'T3', bases: [8000, 9000, 10000, 11000, 12000, 13000], perfs: [1500, 1800, 2100, 2400, 2700, 3000] },
  { code: 'A3', bases: [7000, 8000, 9000, 10000, 11000, 12000], perfs: [1000, 1200, 1400, 1600, 1800, 2000] },
];

const CITY_BASES = {
  xi_an: { min: 4500, max: 24000 },
  bei_jing: { min: 6300, max: 34000 },
  si_chuan: { min: 4300, max: 21500 },
};

const SOCIAL_DEFS = [
  { city: 'xi_an', insuranceType: 'pension', companyRate: 0.16, personalRate: 0.08 },
  { city: 'xi_an', insuranceType: 'medical', companyRate: 0.08, personalRate: 0.02 },
  { city: 'xi_an', insuranceType: 'unemployment', companyRate: 0.007, personalRate: 0.003 },
  { city: 'xi_an', insuranceType: 'work_injury', companyRate: 0.005, personalRate: 0 },
  { city: 'xi_an', insuranceType: 'maternity', companyRate: 0, personalRate: 0 },
  { city: 'bei_jing', insuranceType: 'pension', companyRate: 0.16, personalRate: 0.08 },
  { city: 'bei_jing', insuranceType: 'medical', companyRate: 0.1, personalRate: 0.02 },
  { city: 'bei_jing', insuranceType: 'unemployment', companyRate: 0.005, personalRate: 0.005 },
  { city: 'bei_jing', insuranceType: 'work_injury', companyRate: 0.005, personalRate: 0 },
  { city: 'bei_jing', insuranceType: 'maternity', companyRate: 0, personalRate: 0 },
  { city: 'si_chuan', insuranceType: 'pension', companyRate: 0.16, personalRate: 0.08 },
  { city: 'si_chuan', insuranceType: 'medical', companyRate: 0.085, personalRate: 0.02 },
  { city: 'si_chuan', insuranceType: 'unemployment', companyRate: 0.006, personalRate: 0.004 },
  { city: 'si_chuan', insuranceType: 'work_injury', companyRate: 0.005, personalRate: 0 },
  { city: 'si_chuan', insuranceType: 'maternity', companyRate: 0, personalRate: 0 },
];

const FUND_DEFS = [
  { city: 'xi_an', companyRate: 0.05, personalRate: 0.05 },
  { city: 'bei_jing', companyRate: 0.12, personalRate: 0.12 },
  { city: 'si_chuan', companyRate: 0.08, personalRate: 0.08 },
];

// 5 名 seed 员工 + 默认 plan / registration / finalGrade 映射
const EMPLOYEE_PLAN_DEFAULTS = [
  { employeeNo: `XACH${YEAR}0001`, gradeCode: 'T3', level: 3, base: 10000, perf: 2100 },
  { employeeNo: `XACH${YEAR}0002`, gradeCode: 'A3', level: 2, base: 8000, perf: 1200 },
  { employeeNo: `XACH${YEAR}0003`, gradeCode: 'M1', level: 1, base: 20000, perf: 8000 },
  { employeeNo: `XACH${YEAR}0004`, gradeCode: 'M1', level: 1, base: 20000, perf: 8000 },
  { employeeNo: `XACH${YEAR}0005`, gradeCode: 'T3', level: 2, base: 9000, perf: 1800 },
];

const EMPLOYEE_REG_DEFAULTS = [
  { employeeNo: `XACH${YEAR}0001`, city: 'xi_an', base: 10000 },
  { employeeNo: `XACH${YEAR}0002`, city: 'bei_jing', base: 12000 },
  { employeeNo: `XACH${YEAR}0003`, city: 'si_chuan', base: 8000 },
  { employeeNo: `XACH${YEAR}0004`, city: 'xi_an', base: 20000 },
  { employeeNo: `XACH${YEAR}0005`, city: 'xi_an', base: 9000 },
];

// finalGrade 映射：复用 D3 demo 规则（score >= 90 → S；>= 80 → A；>= 70 → B；>= 60 → C；else D）
const EMPLOYEE_FINALGRADE_DEFAULTS = [
  { employeeNo: `XACH${YEAR}0001`, finalScore: 95, finalGrade: 'S' },
  { employeeNo: `XACH${YEAR}0002`, finalScore: 88, finalGrade: 'A' },
  { employeeNo: `XACH${YEAR}0003`, finalScore: 85, finalGrade: 'A' },
  { employeeNo: `XACH${YEAR}0004`, finalScore: 75, finalGrade: 'B' },
  { employeeNo: `XACH${YEAR}0005`, finalScore: 65, finalGrade: 'C' },
];

const CONFIG_FIXES = [
  {
    category: 'attendance',
    key: 'office_lat',
    value: 34.3416,
    remark: 'M5-09 西安办公区纬度（GPS 打卡中心点，需行政确认真实坐标）',
  },
  {
    category: 'attendance',
    key: 'office_lng',
    value: 108.9398,
    remark: 'M5-09 西安办公区经度（GPS 打卡中心点，需行政确认真实坐标）',
  },
  {
    category: 'leave',
    key: 'approval_flow_short',
    value: 'leave:leave_default',
    remark: "M5-09 订正：原 'leave:leave_short' 不存在，对齐 seed 创建的 leave_default 流程",
  },
];

async function upsertConfig(fix) {
  const existing = await prisma.config.findFirst({
    where: { category: fix.category, key: fix.key, version: 1 },
  });
  if (existing) {
    const updated = await prisma.config.update({
      where: { id: existing.id },
      data: { value: fix.value, remark: fix.remark },
    });
    console.log(`  ✓ ${fix.category}.${fix.key} (UPDATE) value=${JSON.stringify(updated.value)}`);
    return 'updated';
  }
  const created = await prisma.config.create({
    data: {
      category: fix.category,
      key: fix.key,
      value: fix.value,
      version: 1,
      effectiveFrom: new Date('2020-01-01'),
      effectiveTo: null,
      remark: fix.remark,
    },
  });
  console.log(`  ✓ ${fix.category}.${fix.key} (CREATE) value=${JSON.stringify(created.value)}`);
  return 'created';
}

async function ensureGradesAndLevels(adminId) {
  // C1 薪级：5 个（M1/T3/P3/S3/A3），ensure 语义
  let gradesCreated = 0;
  const gradeIdByCode = {};
  for (const g of GRADE_DEFS) {
    const existing = await prisma.salaryGrade.findFirst({ where: { gradeCode: g.gradeCode } });
    if (existing) {
      gradeIdByCode[g.gradeCode] = existing.id;
      continue;
    }
    const created = await prisma.salaryGrade.create({
      data: {
        sequence: g.sequence,
        gradeCode: g.gradeCode,
        name: g.name,
        minBaseSalary: g.minBase,
        maxBaseSalary: g.maxBase,
        minPerformanceBase: g.minPerf,
        maxPerformanceBase: g.maxPerf,
        status: 'active',
        createdById: adminId,
      },
    });
    gradeIdByCode[g.gradeCode] = created.id;
    gradesCreated += 1;
  }
  console.log(`  → 新建 salary_grade: ${gradesCreated} 条（已有 ${GRADE_DEFS.length - gradesCreated} 条）`);

  // C1 档位：3 个 series × 6 levels（M1/T3/A3），ensure 语义
  let levelsCreated = 0;
  const levelIdByKey = {};
  for (const series of LEVEL_SERIES) {
    const gradeId = gradeIdByCode[series.code];
    if (!gradeId) continue;
    for (let i = 0; i < series.bases.length; i += 1) {
      const existing = await prisma.salaryGradeLevel.findFirst({
        where: { gradeId, level: i + 1 },
      });
      if (existing) {
        levelIdByKey[`${series.code}-${i + 1}`] = existing.id;
        continue;
      }
      const created = await prisma.salaryGradeLevel.create({
        data: {
          gradeId,
          level: i + 1,
          baseSalary: series.bases[i],
          performanceBase: series.perfs[i],
          status: 'active',
          createdById: adminId,
        },
      });
      levelIdByKey[`${series.code}-${i + 1}`] = created.id;
      levelsCreated += 1;
    }
  }
  console.log(`  → 新建 salary_grade_level: ${levelsCreated} 条`);

  return { gradeIdByCode, levelIdByKey };
}

async function ensureInsuranceSchemes(adminId) {
  let socialCreated = 0;
  const socialIdByCity = {};
  for (const s of SOCIAL_DEFS) {
    const existing = await prisma.socialInsuranceScheme.findFirst({
      where: { city: s.city, insuranceType: s.insuranceType },
    });
    if (existing) {
      socialIdByCity[s.city] ??= existing.id;
      continue;
    }
    const created = await prisma.socialInsuranceScheme.create({
      data: {
        city: s.city,
        insuranceType: s.insuranceType,
        companyRate: s.companyRate,
        personalRate: s.personalRate,
        baseMin: CITY_BASES[s.city].min,
        baseMax: CITY_BASES[s.city].max,
        baseAdjustmentMonth: 7,
        status: 'active',
        createdById: adminId,
      },
    });
    socialIdByCity[s.city] ??= created.id;
    socialCreated += 1;
  }
  console.log(`  → 新建 social_insurance_scheme: ${socialCreated} 条`);

  let fundCreated = 0;
  const fundIdByCity = {};
  for (const f of FUND_DEFS) {
    const existing = await prisma.housingFundScheme.findFirst({ where: { city: f.city } });
    if (existing) {
      fundIdByCity[f.city] = existing.id;
      continue;
    }
    const created = await prisma.housingFundScheme.create({
      data: {
        city: f.city,
        companyRate: f.companyRate,
        personalRate: f.personalRate,
        baseMin: CITY_BASES[f.city].min,
        baseMax: CITY_BASES[f.city].max,
        status: 'active',
        createdById: adminId,
      },
    });
    fundIdByCity[f.city] = created.id;
    fundCreated += 1;
  }
  console.log(`  → 新建 housing_fund_scheme: ${fundCreated} 条`);

  return { socialIdByCity, fundIdByCity };
}

async function ensurePlan(adminId, employee, gradeIdByCode, levelIdByKey) {
  const existing = await prisma.employeeSalaryPlan.findFirst({
    where: { employeeId: employee.id, status: 'active' },
  });
  if (existing) return { action: 'skip', planId: existing.id };

  const planDefault = EMPLOYEE_PLAN_DEFAULTS.find((p) => p.employeeNo === employee.employeeNo);
  if (!planDefault) return { action: 'no-default' };

  const gradeId = gradeIdByCode[planDefault.gradeCode];
  const levelId = levelIdByKey[`${planDefault.gradeCode}-${planDefault.level}`];
  if (!gradeId || !levelId) {
    console.log(`  !! ${employee.employeeNo}: grade=${planDefault.gradeCode} level=${planDefault.level} 找不到，跳过`);
    return { action: 'missing-grade-level' };
  }

  const created = await prisma.employeeSalaryPlan.create({
    data: {
      employeeId: employee.id,
      gradeId,
      levelId,
      baseSalary: planDefault.base,
      performanceBase: planDefault.perf,
      allowance: 0,
      welfare: 'demo',
      effectiveFrom: EFFECTIVE_FROM,
      effectiveTo: null,
      status: 'active',
      createdById: adminId,
    },
  });
  return { action: 'created', planId: created.id };
}

async function ensureRegistration(adminId, employee, socialIdByCity, fundIdByCity) {
  const existing = await prisma.employeeInsuranceRegistration.findFirst({
    where: { employeeId: employee.id, status: 'active' },
  });
  if (existing) return { action: 'skip', regId: existing.id };

  const regDefault = EMPLOYEE_REG_DEFAULTS.find((r) => r.employeeNo === employee.employeeNo);
  if (!regDefault) return { action: 'no-default' };

  const socialId = socialIdByCity[regDefault.city];
  const fundId = fundIdByCity[regDefault.city];
  if (!socialId || !fundId) {
    console.log(`  !! ${employee.employeeNo}: city=${regDefault.city} 找不到社保/公积金方案，跳过`);
    return { action: 'missing-scheme' };
  }

  const created = await prisma.employeeInsuranceRegistration.create({
    data: {
      employeeId: employee.id,
      city: regDefault.city,
      socialInsuranceSchemeId: socialId,
      housingFundSchemeId: fundId,
      baseSalary: regDefault.base,
      effectiveFrom: EFFECTIVE_FROM,
      effectiveTo: null,
      status: 'active',
      createdById: adminId,
    },
  });
  return { action: 'created', regId: created.id };
}

async function ensureFinalGrade(adminId, quarterCycle) {
  let updated = 0;
  let created = 0;
  for (const fg of EMPLOYEE_FINALGRADE_DEFAULTS) {
    const emp = await prisma.employee.findUnique({ where: { employeeNo: fg.employeeNo } });
    if (!emp) continue;

    // 1. 已有 finalGrade 记录 → 跳过
    const existingWithGrade = await prisma.performanceRecord.findFirst({
      where: { employeeId: emp.id, finalGrade: { not: null } },
    });
    if (existingWithGrade) continue;

    // 2. 已有非 finalGrade 记录 → 在原记录上 UPDATE 加 finalGrade（保留原 cycle/scheme/status）
    const existingNoGrade = await prisma.performanceRecord.findFirst({
      where: { employeeId: emp.id },
      orderBy: { updatedAt: 'desc' },
    });
    if (existingNoGrade) {
      await prisma.performanceRecord.update({
        where: { id: existingNoGrade.id },
        data: {
          finalScore: fg.finalScore,
          finalGrade: fg.finalGrade,
          status: 'archived',
          archivedAt: new Date(),
        },
      });
      updated += 1;
      continue;
    }

    // 3. 没有任何 performance record → 在 quarterCycle 创建（避免与 D2 唯一约束冲突）
    if (!quarterCycle) continue;
    const peduScheme = await prisma.performanceScheme.findFirst({
      where: { code: 'SCH-PEDU-MONTHLY' },
      select: { id: true },
    });
    await prisma.performanceRecord.create({
      data: {
        employeeId: emp.id,
        cycleId: quarterCycle.id,
        schemeId: peduScheme?.id ?? null,
        status: 'archived',
        finalScore: fg.finalScore,
        finalGrade: fg.finalGrade,
        archivedAt: new Date(),
        createdBy: adminId,
      },
    });
    created += 1;
  }
  return { updated, created };
}

async function main() {
  console.log('==> M5-09 订正脚本（缺陷 2 + 3 + 4 + E2E 04 finalGrade 兜底）');

  // ===== 缺陷 2 + 3：configs =====
  console.log('\n[Step 1] configs upsert（缺陷 2 + 缺陷 3）');
  for (const fix of CONFIG_FIXES) {
    await upsertConfig(fix);
  }

  const admin = await prisma.user.findUnique({ where: { username: 'admin' } });
  if (!admin) {
    console.error('!! admin user 不存在，终止');
    process.exit(1);
  }

  // ===== 缺陷 4：5 个 active plan =====
  console.log('\n[Step 2] C1 薪级薪档 ensure（缺陷 4 前置——dev DB 因 D3 种子崩溃从未跑到 C1）');
  const { gradeIdByCode: c1GradeIdByCode, levelIdByKey: c1LevelIdByKey } =
    await ensureGradesAndLevels(admin.id);

  console.log('\n[Step 3] C2 社保/公积金方案 ensure（缺陷 4 前置）');
  const { socialIdByCity: c2SocialIdByCity, fundIdByCity: c2FundIdByCity } =
    await ensureInsuranceSchemes(admin.id);

  const seedEmps = await prisma.employee.findMany({
    where: { employeeNo: { startsWith: `XACH${YEAR}` } },
    orderBy: { employeeNo: 'asc' },
  });
  console.log(`\n[Step 4] 找到 ${seedEmps.length} 名 XACH${YEAR}* 员工，开始 ensure plan / registration`);

  let plansCreated = 0;
  for (const emp of seedEmps) {
    const r = await ensurePlan(admin.id, emp, c1GradeIdByCode, c1LevelIdByKey);
    if (r.action === 'created') {
      plansCreated += 1;
      console.log(`  ✓ ${emp.employeeNo}: active plan 已创建`);
    }
  }
  console.log(`  → 新建 active plan: ${plansCreated} 条`);

  let regsCreated = 0;
  for (const emp of seedEmps) {
    const r = await ensureRegistration(admin.id, emp, c2SocialIdByCity, c2FundIdByCity);
    if (r.action === 'created') {
      regsCreated += 1;
      console.log(`  ✓ ${emp.employeeNo}: active insurance registration 已创建`);
    }
  }
  console.log(`  → 新建 active registration: ${regsCreated} 条`);

  // ===== E2E 04 finalGrade 兜底 =====
  console.log('\n[Step 5] 5 名 seed 员工 finalGrade performanceRecord 兜底（E2E 04 全链路算薪前置）');
  const quarterCycle = await prisma.performanceCycle.findFirst({
    where: { code: `${YEAR}-Q3` },
  });
  if (!quarterCycle) {
    console.log('  !! 未找到 Q3 cycle；new-record 兜底路径将跳过（仅做已有记录的 UPDATE）');
  }
  const fgResult = await ensureFinalGrade(admin.id, quarterCycle);
  console.log(`  → UPDATE 已有 record 加 finalGrade: ${fgResult.updated} 条`);
  console.log(`  → CREATE 新 record（quarterCycle）带 finalGrade: ${fgResult.created} 条`);

  // ===== 验证 =====
  console.log('\n==> 验证：configs / 5 员工档案');
  for (const k of [
    { category: 'attendance', key: 'office_lat' },
    { category: 'attendance', key: 'office_lng' },
    { category: 'attendance', key: 'gps_max_distance' },
    { category: 'leave', key: 'approval_flow_short' },
  ]) {
    const row = await prisma.config.findFirst({
      where: { category: k.category, key: k.key, version: 1 },
    });
    console.log(`  ${k.category}.${k.key} = ${JSON.stringify(row?.value)}`);
  }

  const flow = await prisma.approvalFlow.findFirst({
    where: { category: 'leave', key: 'leave_default' },
  });
  console.log(`  approval_flows.leave_default enabled = ${flow?.enabled}`);

  console.log('\n  --- 5 名 seed 员工最终状态 ---');
  for (const emp of seedEmps) {
    const plan = await prisma.employeeSalaryPlan.findFirst({
      where: { employeeId: emp.id, status: 'active' },
    });
    const reg = await prisma.employeeInsuranceRegistration.findFirst({
      where: { employeeId: emp.id, status: 'active' },
    });
    const fg = await prisma.performanceRecord.findFirst({
      where: { employeeId: emp.id, finalGrade: { not: null } },
    });
    const planMark = plan ? '✓' : '✗';
    const regMark = reg ? '✓' : '✗';
    const fgMark = fg ? `✓ ${fg.finalGrade}` : '✗';
    console.log(`  ${planMark} plan  ${regMark} reg  ${fgMark} finalGrade  | ${emp.employeeNo} ${emp.name}`);
  }
}

main()
  .catch((e) => {
    console.error('!! 订正脚本异常:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());