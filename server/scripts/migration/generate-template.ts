// M5-03: 员工数据迁移 | HRMS | 2026-09-02
// 用途：生成员工档案迁移模板 xlsx + 40 行合成样例 + 5 行错误样例
// 用法：pnpm --filter hrms-server migration:template
// 产物：server/scripts/migration/output/ 下三个 .xlsx 文件
// 注意：本脚本仅生成模板/样例文件，不连接数据库

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import * as XLSX from 'xlsx';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(SCRIPT_DIR, 'output');

const COLUMNS: ReadonlyArray<{ name: string; required: boolean; example: string }> = [
  { name: '工号', required: true, example: 'XACH20260006' },
  { name: '姓名', required: true, example: '张三' },
  { name: '部门代码', required: true, example: 'PEDU' },
  { name: '入职日期', required: true, example: '2024-03-15' },
  { name: '性别', required: false, example: '男 / 女' },
  { name: '出生日期', required: false, example: '1990-05-20' },
  { name: '身份证号', required: false, example: '11010119900520001X（18 位）' },
  { name: '籍贯', required: false, example: '陕西省西安市' },
  { name: '民族', required: false, example: '汉' },
  { name: '政治面貌', required: false, example: '群众 / 共青团员 / 中共党员 / 民主党派 / 无党派人士' },
  { name: '手机号', required: false, example: '13800138000（11 位）' },
  { name: '邮箱', required: false, example: 'zhangsan@example.com' },
  { name: '紧急联系人', required: false, example: '李四' },
  { name: '紧急联系人电话', required: false, example: '13900139000（11 位）' },
  { name: '家庭住址', required: false, example: '陕西省西安市雁塔区xx路xx号' },
  { name: '学历', required: false, example: '高中 / 中专 / 大专 / 本科 / 硕士 / 博士' },
  { name: '学位', required: false, example: '无 / 学士 / 硕士 / 博士' },
  { name: '毕业院校', required: false, example: '西安交通大学' },
  { name: '专业', required: false, example: '计算机科学与技术' },
  { name: '毕业日期', required: false, example: '2015-07-01' },
  { name: '合同类型', required: false, example: '正式 / 实习 / 顾问 / 劳务' },
  { name: '合同开始日期', required: false, example: '2024-03-15' },
  { name: '合同结束日期', required: false, example: '2027-03-14' },
  { name: '开户银行', required: false, example: '中国工商银行' },
  { name: '银行卡号', required: false, example: '6222021234567890123' },
  { name: '参加社保', required: false, example: '是 / 否' },
  { name: '社保城市', required: false, example: '西安' },
  { name: '社保基数', required: false, example: '8000.00' },
  { name: '公积金城市', required: false, example: '西安' },
  { name: '公积金比例(%)', required: false, example: '12（Excel 填百分数，脚本按 0.12 存入）' },
  { name: '公积金基数', required: false, example: '8000.00' },
  { name: '状态', required: false, example: '试用期 / 在职（默认 在职）' },
  { name: '入职岗位', required: false, example: '高级工程师' },
  { name: '基本工资', required: false, example: '12000.00（写入薪资历史；不更新 employees 表）' },
  { name: '绩效工资', required: false, example: '3000.00' },
  { name: '备注', required: false, example: '自由文本' },
];

const DEPARTMENT_CODES = [
  { code: 'PEDU', name: '产教服务中心' },
  { code: 'HR', name: '人力资源部' },
  { code: 'FIN', name: '财务部' },
  { code: 'TECH', name: '技术部' },
];

function ensureDir(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

function writeXlsx(filePath: string, sheets: Array<{ name: string; rows: unknown[][] }>): void {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  }
  XLSX.writeFile(wb, filePath);
  console.log(`  ✓ ${path.relative(SCRIPT_DIR, filePath)}`);
}

function buildTemplate(): void {
  const headerRow = COLUMNS.map((c) => (c.required ? `${c.name}*` : c.name));
  const exampleRow = COLUMNS.map((c) => c.example);

  const employeeSheet: unknown[][] = [headerRow, exampleRow];

  const docRows: unknown[][] = [
    ['员工档案迁移模板 - 填写说明'],
    [],
    ['一、基本要求'],
    ['1. 文件格式：必须使用本模板（不要新增/删除/重排列）'],
    ['2. 表头列名固定：带 * 的为必填项，其余选填'],
    ['3. 首次行（第 2 行）是示例，提交前请删除'],
    ['4. 日期一律使用 YYYY-MM-DD 格式（如 2024-03-15）'],
    ['5. 工号规则：公司代码(3 位)+年份(4 位)+4 位流水，示例 XACH20260006'],
    ['6. 工号在数据库已存在时脚本会自动跳过该行（不视为错误）'],
    [],
    ['二、字段枚举值'],
    ['性别', '男 / 女（对应 male / female）'],
    ['合同类型', '正式 / 实习 / 顾问 / 劳务（对应 formal / intern / consultant / labor）'],
    ['状态', '试用期 / 在职（对应 probation / active；默认 在职）'],
    ['参加社保', '是 / 否（对应 true / false）'],
    ['公积金比例(%)', '填百分数（如 12 表示 12%，脚本按 0.12 存储，精度 Decimal(4,2)）'],
    [],
    ['三、部门代码对照表（XACH 法人下）'],
    ['代码', '部门名称'],
    ...DEPARTMENT_CODES.map((d) => [d.code, d.name]),
    [],
    ['提示：组织架构中的其他部门（如生产交付中心等）需先在系统组织模块创建，拿到部门代码后再填模板'],
    [],
    ['四、数据卫生'],
    ['1. 不修改表头列名（导入脚本会按列名对齐）'],
    ['2. 文件内工号不可重复（重复会报错该行）'],
    ['3. 手机号必须 11 位数字；身份证号必须 18 位'],
    ['4. 加密字段（身份证 / 银行卡 / 手机号 / 紧急联系人电话）由系统自动加密，模板填明文即可'],
    [],
    ['五、运行步骤'],
    ['① 模板生成：pnpm --filter hrms-server migration:template'],
    ['② HR 按模板填写真实数据（删掉示例行）'],
    ['③ dry-run 预演：pnpm --filter hrms-server migration:employees -- --file <xlsx> --dry-run'],
    ['④ 正式导入：pnpm --filter hrms-server migration:employees -- --file <xlsx>'],
    ['⑤ 双跑校验：再跑一次 ④，期望全部"跳过"（员工总数不变）'],
    [],
    ['六、本期不迁字段（上线后由 HR 在系统内补录）'],
    ['workHistory（工作经历 JSON）/ certificates（资质证书 JSON）'],
    ['账号开通（userId 留空，由 HR 逐个开通）'],
    ['薪资方案 / 社保参保登记 / 绩效档案等关联数据'],
  ];

  const filePath = path.join(OUTPUT_DIR, '员工档案迁移模板.xlsx');
  writeXlsx(filePath, [
    { name: '员工档案', rows: employeeSheet },
    { name: '填写说明', rows: docRows },
  ]);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * 生成 18 位身份证号：6 位地区 + 8 位生日 + 3 位流水 + 1 位校验位
 * 校验位按 GB 11643-1999 加权因子计算
 */
function generateIdCard(seq: number): string {
  const area = '110101';
  const birth = '19900101';
  const seqStr = String(seq).padStart(3, '0');
  const prefix17 = `${area}${birth}${seqStr}`;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checkMap = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
  let sum = 0;
  for (let i = 0; i < 17; i += 1) sum += Number(prefix17[i]) * weights[i];
  const check = checkMap[sum % 11];
  return `${prefix17}${check}`;
}

function generateValidSample(): unknown[][] {
  const header = COLUMNS.map((c) => c.name);
  const rows: unknown[][] = [header];
  const depts = DEPARTMENT_CODES.map((d) => d.code);
  for (let i = 1; i <= 40; i += 1) {
    const seq = String(i).padStart(4, '0');
    const deptCode = depts[(i - 1) % depts.length];
    const hireYear = 2020 + (i % 7);
    const hireMonth = ((i * 3) % 12) + 1;
    const hireDay = ((i * 7) % 27) + 1;
    const hireDate = `${hireYear}-${pad2(hireMonth)}-${pad2(hireDay)}`;
    const contractStart = hireDate;
    const contractEnd = `${hireYear + 3}-${pad2(hireMonth)}-${pad2(hireDay)}`;
    const birthYear = 1985 + (i % 15);
    const birthDate = `${birthYear}-${pad2((i % 12) + 1)}-${pad2((i % 27) + 1)}`;
    const idCard = generateIdCard(i);
    const phone = `138${String(10000000 + i).slice(-8)}`;
    const emergencyPhone = `139${String(20000000 + i).slice(-8)}`;
    const baseSalary = 6000 + (i % 25) * 600;
    const perfSalary = Math.round(baseSalary * 0.3);
    const socialBase = baseSalary;
    const housingFundRate = [7, 10, 12][i % 3];
    const status = i <= 5 ? '试用期' : '在职';
    const name = `迁移测试${String(i).padStart(2, '0')}`;
    rows.push([
      `XACH2099${seq}`,          // 工号
      name,                       // 姓名
      deptCode,                   // 部门代码
      hireDate,                   // 入职日期
      i % 2 === 0 ? '男' : '女',  // 性别
      birthDate,                  // 出生日期
      idCard,                     // 身份证号
      '陕西省西安市',              // 籍贯
      '汉',                       // 民族
      i % 3 === 0 ? '中共党员' : '群众', // 政治面貌
      phone,                      // 手机号
      `migtest${i}@example.com`,  // 邮箱
      `紧急联系人${i}`,            // 紧急联系人
      emergencyPhone,             // 紧急联系人电话
      `陕西省西安市雁塔区xx路${i}号`, // 家庭住址
      i % 4 === 0 ? '硕士' : '本科', // 学历
      i % 4 === 0 ? '硕士' : '学士', // 学位
      ['西安交通大学', '西北工业大学', '陕西师范大学', '西安电子科技大学'][i % 4], // 毕业院校
      ['计算机科学与技术', '软件工程', '工商管理', '会计学'][i % 4], // 专业
      `${birthYear + 22}-07-01`,  // 毕业日期
      '正式',                     // 合同类型
      contractStart,              // 合同开始日期
      contractEnd,                // 合同结束日期
      ['中国工商银行', '中国建设银行', '招商银行'][i % 3], // 开户银行
      `622202${String(100000000 + i).slice(-9)}`, // 银行卡号
      '是',                       // 参加社保
      '西安',                     // 社保城市
      socialBase.toFixed(2),      // 社保基数
      '西安',                     // 公积金城市
      String(housingFundRate),    // 公积金比例
      socialBase.toFixed(2),      // 公积金基数
      status,                     // 状态
      '高级工程师',                // 入职岗位
      baseSalary.toFixed(2),      // 基本工资
      perfSalary.toFixed(2),      // 绩效工资
      `M5-03 合成测试数据 第 ${i} 行`, // 备注
    ]);
  }
  return rows;
}

function generateErrorSample(): unknown[][] {
  const header = COLUMNS.map((c) => c.name);
  const rows: unknown[][] = [header];
  rows.push([
    '',                  // 行 2: 缺工号（必填缺失）
    '缺工号员工',
    'PEDU',
    '2024-03-15',
    '男',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '正式',
    '2024-03-15',
    '2027-03-14',
    '',
    '',
    '否',
    '',
    '',
    '',
    '',
    '',
    '在职',
    '',
    '',
    '',
    '',
  ]);
  rows.push([
    'XACH20999001',      // 行 3: 部门代码不存在（DEP9999）
    '张三',
    'DEP9999',
    '2024-03-15',
    '男',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '正式',
    '2024-03-15',
    '2027-03-14',
    '',
    '',
    '否',
    '',
    '',
    '',
    '',
    '',
    '在职',
    '',
    '',
    '',
    '',
  ]);
  rows.push([
    'XACH20999002',      // 行 4: 日期非法
    '李四',
    'HR',
    '2024-13-40',        // 非法日期
    '男',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '正式',
    '',
    '',
    '',
    '',
    '否',
    '',
    '',
    '',
    '',
    '',
    '在职',
    '',
    '',
    '',
    '',
  ]);
  rows.push([
    'XACH20999003',      // 行 5: 枚举非法（性别=未知）
    '王五',
    'FIN',
    '2024-03-15',
    '未知',              // 非法枚举
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '正式',
    '2024-03-15',
    '2027-03-14',
    '',
    '',
    '否',
    '',
    '',
    '',
    '',
    '',
    '在职',
    '',
    '',
    '',
    '',
  ]);
  rows.push([
    'XACH20260001',      // 行 6: 工号与已有员工重复（admin 档案）
    '赵六',
    'TECH',
    '2024-03-15',
    '女',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '正式',
    '2024-03-15',
    '2027-03-14',
    '',
    '',
    '否',
    '',
    '',
    '',
    '',
    '',
    '在职',
    '',
    '',
    '',
    '',
  ]);
  return rows;
}

function main(): void {
  ensureDir();
  console.log('开始生成模板与样例文件...');
  buildTemplate();
  writeXlsx(path.join(OUTPUT_DIR, '员工档案迁移样例.xlsx'), [
    { name: '员工档案', rows: generateValidSample() },
  ]);
  writeXlsx(path.join(OUTPUT_DIR, '员工档案迁移错误样例.xlsx'), [
    { name: '员工档案', rows: generateErrorSample() },
  ]);
  console.log('\n✓ 全部生成完成，产物目录:', OUTPUT_DIR);
  console.log('  - 员工档案迁移模板.xlsx（含填写说明 sheet）');
  console.log('  - 员工档案迁移样例.xlsx（40 行合成合法数据）');
  console.log('  - 员工档案迁移错误样例.xlsx（5 行典型错误演示）');
}

main();
