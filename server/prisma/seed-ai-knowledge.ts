// M0.5-5: AI 知识库冷启动 seed | HRMS
// ≥28 篇：3 手册 + 7 假期 + 1 工资条 + 3 报销 + ≥20 FAQ
// embedding 使用固定 1536×0.1 向量（seed 不依赖真实 LLM）

import { randomUUID } from 'crypto';

import type { PrismaClient } from '@prisma/client';

import { chunkText, formatVectorLiteral } from '../src/services/ai/embedding.service';

const FIXED_VECTOR = formatVectorLiteral(Array.from({ length: 1536 }, () => 0.1));

interface SeedDoc {
  title: string;
  sourceType: string;
  category: string;
  content: string;
  tags?: string[];
}

const DOCS: SeedDoc[] = [
  // —— 员工手册 3 ——
  {
    title: '员工手册（员工版）',
    sourceType: 'employee_handbook',
    category: 'general',
    tags: ['手册', '员工'],
    content: `西安辰航卓越科技有限公司员工手册（员工版）
一、入职与试用：新员工入职需完成劳动合同签署、社保公积金办理与系统账号开通。试用期一般为 3 个月，试用期内双方可依法解除劳动关系。
二、考勤：标准工时制，工作日 9:00-18:00，午休 1 小时。迟到、早退、缺勤按考勤制度扣款。远程办公需事先审批。
三、请假：事假、病假、年假、调休等均需在 HRMS 提交申请并经审批通过后方可休假。紧急情况可事后补单，不超过 2 个工作日。
四、薪酬：薪资按月发放，通常为次月 10 日前；工资条可在系统查看。严禁私下打听或传播他人薪酬信息。
五、行为规范：遵守保密协议与信息安全规定，不得将公司资料外传。工作场所禁止赌博、饮酒及任何违法违纪行为。
六、离职：提出书面离职申请，办理工作交接、资产归还与证明开具。离职档案按公司规定保留。`,
  },
  {
    title: '员工手册（部门负责人版）',
    sourceType: 'employee_handbook',
    category: 'general',
    tags: ['手册', '部门负责人'],
    content: `部门负责人版员工手册补充条款
一、团队管理职责：负责本部门目标分解、绩效辅导、考勤异常跟进与关键审批节点及时处理。
二、招聘与编制：新增编制需经人力资源与分管领导审批；面试评价须客观、可追溯。
三、绩效：每周期组织自评与上级评分，评分建议可参考 AI 评分建议，但最终结果由管理者负责。
四、加班与排班：安排加班应事先审批，注意加班上限与排班冲突规则；不得强制连续超长加班。
五、敏感信息：涉及薪酬、绩效、合同等敏感字段仅限授权角色查看，解密操作写入审计。
六、员工关怀：关注试用期转正提醒与合同到期预警，及时与 HR 协同处理。`,
  },
  {
    title: '员工手册（HR 版）',
    sourceType: 'employee_handbook',
    category: 'general',
    tags: ['手册', 'HR'],
    content: `HR 版员工手册与制度执行要点
一、用工合规：劳动合同、保密协议、竞业限制按法务模板执行；电子签流程走公司指定供应商。
二、配置中心：工号规则、试用期月数、合同预警天数、年假额度、加班上限等业务规则一律走 configs，禁止硬编码。
三、入转调离：入职材料 OCR 识别后人工复核；转正、调岗、离职均走审批流并留审计。
四、知识库：维护 AI 问答知识库内容，每周补充未命中 FAQ，每季度合规 review。
五、隐私：身份证、银行卡等敏感字段加密存储；揭示操作二次审计。
六、应急：系统故障时启用降级 SOP，关键通知经短信/邮件通道触达。`,
  },

  // —— 假期政策 7 ——
  {
    title: '年假制度细则',
    sourceType: 'policy',
    category: 'leave',
    tags: ['年假', '假期'],
    content: `年假制度
一、额度：连续工作满 1 年不满 10 年者年休假 5 天；满 10 年不满 20 年 10 天；满 20 年 15 天。具体额度以配置中心 annual_leave.quota 为准。
二、申请：在 HRMS 提交年假申请，需注明起止日期；部门负责人与 HR 审批通过后生效。
三、结转：当年未休完年假原则上不跨年结转，特殊情况经公司批准可延期至次年 3 月 31 日。
四、与调休：年假优先于调休使用与否由员工选择，但不得与已排班冲突。
五、离职清算：离职时按实际在职天数折算应休未休年假，依法结算。`,
  },
  {
    title: '病假制度细则',
    sourceType: 'policy',
    category: 'leave',
    tags: ['病假'],
    content: `病假制度
一、证明：连续病假超过 1 天须提供医疗机构证明；慢性病长期假按当地法规与公司规定办理。
二、薪资：病假期间薪资按当地最低工资标准与公司病假工资比例执行，详见薪酬制度。
三、申请：提前或当日在系统提交病假，附件上传病假条照片；HR 可抽查真实性。
四、医疗期：符合医疗期条件的，按劳动法医疗期规定执行。`,
  },
  {
    title: '调休制度细则',
    sourceType: 'policy',
    category: 'leave',
    tags: ['调休'],
    content: `调休制度
一、来源：加班审批通过并实际出勤后，可按 1:1 生成调休额度（法定节假日加班规则另见加班制度）。
二、有效期：调休额度自产生之日起 6 个月内有效，逾期作废。
三、使用：在系统申请调休并经审批；单次调休不少于 0.5 天。
四、限制：关键项目交付窗口期，部门可限制集中调休，但不得剥夺已产生的合法额度结算权。`,
  },
  {
    title: '加班制度细则',
    sourceType: 'policy',
    category: 'leave',
    tags: ['加班'],
    content: `加班制度
一、审批：加班须事先在系统申请并获批；紧急加班可事后 1 个工作日内补单。
二、上限：月加班时长不得超过配置中心 overtime.max_hours_per_month；超限须分管领导特批。
三、补偿：工作日加班优先安排调休；不能调休的按法规支付加班费。法定节假日加班按规定倍率计薪。
四、禁止：禁止安排孕期、哺乳期员工违法加班；禁止未成年人加班。`,
  },
  {
    title: '婚假与产假制度细则',
    sourceType: 'policy',
    category: 'leave',
    tags: ['婚假', '产假'],
    content: `婚假与产假
一、婚假：依法登记结婚的员工享有婚假，天数按当地规定与公司补充福利执行，需提供结婚证。
二、产假：女职工产假天数按国家与陕西省规定执行；产前检查假、哺乳假按规定享受。
三、申请：提前在系统提交并上传证明材料；HR 审核后计入假期档案。
四、待遇：产假期间社保与薪资待遇按法规及公司福利政策执行。`,
  },
  {
    title: '陪产假制度细则',
    sourceType: 'policy',
    category: 'leave',
    tags: ['陪产假'],
    content: `陪产假制度
一、对象：配偶生育的男职工可申请陪产假，天数按当地规定执行。
二、时间：一般应在配偶分娩前后连续使用，特殊情况可分段，须经 HR 同意。
三、材料：出生医学证明或医院相关证明。
四、薪资：陪产假期间视同出勤，按正常出勤发薪（以当地法规为准）。`,
  },
  {
    title: '丧假制度细则',
    sourceType: 'policy',
    category: 'leave',
    tags: ['丧假'],
    content: `丧假制度
一、范围：直系亲属（父母、配偶、子女）去世可申请丧假；旁系亲属丧假由部门酌情批准。
二、天数：直系亲属丧假一般为 3 天，路程另计，具体以公司规定为准。
三、申请：事后补单亦可，需说明情况；HR 可要求提供相关证明。
四、薪资：批准的丧假期间按正常出勤计薪。`,
  },

  // —— 工资条 1 ——
  {
    title: '工资条说明与常见疑问',
    sourceType: 'procedure',
    category: 'salary',
    tags: ['工资条', '个税'],
    content: `工资条说明
一、应发：基本工资 + 岗位工资 + 绩效工资 + 津贴补贴 + 加班费等。
二、应扣：社保个人部分、公积金个人部分、个人所得税、事假/旷工扣款、其他代扣。
三、实发：应发合计 − 应扣合计。
四、常见疑问：
1) 为什么比上月少？请对照考勤异常、绩效等级变化、专项附加扣除变更。
2) 个税怎么算？按累计预扣预缴办法；可在个税 APP 核对专项附加。
3) 工资条在哪看？登录 HRMS → 薪酬 → 我的工资条。
五、隐私：禁止截图外传他人工资条；系统对薪资字段加密存储。`,
  },

  // —— 报销 3 ——
  {
    title: '出差报销流程 SOP',
    sourceType: 'procedure',
    category: 'reimbursement',
    tags: ['出差', '报销'],
    content: `出差报销 SOP
一、事前：提交出差申请（目的地、事由、预算、起止日期），审批通过后方可出行。
二、票证：保留发票、行程单、登机牌等；电子发票需查验真伪。
三、填报：出差结束后 15 日内在系统填写报销单，关联出差申请，上传附件。
四、审核：部门负责人 → 财务审核 → 出纳打款。
五、注意：超标准住宿/交通需说明并特批；私车公用按里程补贴规则。`,
  },
  {
    title: '差旅补助标准说明',
    sourceType: 'procedure',
    category: 'reimbursement',
    tags: ['差旅补助'],
    content: `差旅补助
一、标准：按出差城市档位与职级对应补助标准，具体金额以配置中心 travel.allowance 为准。
二、计算：按实际出差自然日计发；出发日与返回日可按规定折算。
三、与报销关系：补助与实报实销项目不重复领取（如已含餐补则不再报餐费）。
四、特殊：海外出差、展会值班等特殊场景走专项标准。`,
  },
  {
    title: '借款与还款 SOP',
    sourceType: 'procedure',
    category: 'reimbursement',
    tags: ['借款', '还款'],
    content: `借款还款 SOP
一、借款：因公务需要可申请备用金，填写借款单说明用途与预计核销时间。
二、限额：单笔与累计未还借款不得超过财务规定上限。
三、核销：费用发生后及时报销冲账；差额多退少补。
四、逾期：超期未还，财务可暂停后续借款并通知部门负责人；离职前必须结清。`,
  },

  // —— FAQ ≥20 ——
  {
    title: 'FAQ-年假怎么请',
    sourceType: 'faq',
    category: 'leave',
    tags: ['FAQ', '年假'],
    content: `问：年假怎么请？
答：登录 HRMS → 考勤假勤 → 请假申请 → 选择「年假」→ 填写起止日期与事由 → 提交。部门负责人与 HR 审批通过后生效。可在「我的假期」查看剩余年假天数。`,
  },
  {
    title: 'FAQ-还有几天年假',
    sourceType: 'faq',
    category: 'leave',
    tags: ['FAQ', '年假'],
    content: `问：我还有几天年假？
答：在「我的假期」或「个人中心-假期余额」查看。额度按司龄与配置规则计算；当年已休与冻结中的申请会扣减可用余额。`,
  },
  {
    title: 'FAQ-病假需要证明吗',
    sourceType: 'faq',
    category: 'leave',
    tags: ['FAQ', '病假'],
    content: `问：请病假需要医院证明吗？
答：连续超过 1 天的病假需上传医疗机构证明。当天请假可先口头报备，事后 2 个工作日内补单与材料。`,
  },
  {
    title: 'FAQ-加班如何申请',
    sourceType: 'faq',
    category: 'leave',
    tags: ['FAQ', '加班'],
    content: `问：加班怎么申请？
答：事前在系统提交加班申请（时间、事由、预估时长）。审批通过后打卡或填写实际加班时长。优先调休，不能调休再计加班费。`,
  },
  {
    title: 'FAQ-调休有效期',
    sourceType: 'faq',
    category: 'leave',
    tags: ['FAQ', '调休'],
    content: `问：调休多久有效？
答：自额度产生之日起 6 个月内有效，逾期作废。请及时在系统申请使用。`,
  },
  {
    title: 'FAQ-工资条在哪看',
    sourceType: 'faq',
    category: 'salary',
    tags: ['FAQ', '工资条'],
    content: `问：工资条在哪里看？
答：登录系统 → 薪酬 → 我的工资条。可查看应发、应扣与实发明细。如有疑问联系财务或 HR。`,
  },
  {
    title: 'FAQ-工资比上月少',
    sourceType: 'faq',
    category: 'salary',
    tags: ['FAQ', '工资'],
    content: `问：为什么本月工资比上月少？
答：常见原因：请假扣款、绩效等级变化、加班/补贴减少、个税累计预扣变化、社保基数调整。可对照工资条明细，或使用 AI 算薪差异摘要。`,
  },
  {
    title: 'FAQ-个税专项附加',
    sourceType: 'faq',
    category: 'salary',
    tags: ['FAQ', '个税'],
    content: `问：专项附加扣除如何影响工资？
答：子女教育、房贷利息、房租、赡养老人等在个税 APP 填报后，由税务同步扣缴义务人。变更当月起影响预扣税额。`,
  },
  {
    title: 'FAQ-差旅补助怎么算',
    sourceType: 'faq',
    category: 'reimbursement',
    tags: ['FAQ', '差旅'],
    content: `问：差旅补助怎么算？
答：按出差城市档位与职级对应标准，结合实际出差天数。标准见「差旅补助标准说明」，以配置中心为准。`,
  },
  {
    title: 'FAQ-报销多久到账',
    sourceType: 'faq',
    category: 'reimbursement',
    tags: ['FAQ', '报销'],
    content: `问：报销多久能到账？
答：材料齐全且审批通过后，财务一般在 5-10 个工作日内打款。节假日顺延。可在报销单进度中查看状态。`,
  },
  {
    title: 'FAQ-借款如何归还',
    sourceType: 'faq',
    category: 'reimbursement',
    tags: ['FAQ', '借款'],
    content: `问：备用金借款怎么还？
答：通过报销冲账核销；若有结余，按财务通知退回公司账户并上传回单。离职前必须结清全部借款。`,
  },
  {
    title: 'FAQ-试用期多久',
    sourceType: 'faq',
    category: 'hr',
    tags: ['FAQ', '试用期'],
    content: `问：试用期一般多久？
答：公司默认试用期 3 个月（以劳动合同与配置中心为准）。转正前 HR 与部门会进行考核评估。`,
  },
  {
    title: 'FAQ-转正流程',
    sourceType: 'faq',
    category: 'hr',
    tags: ['FAQ', '转正'],
    content: `问：转正流程是什么？
答：系统在试用期满前按配置天数提醒 → 员工提交转正总结 → 部门评价 → HR 审批 → 更新劳动合同与薪酬（如有调整）。`,
  },
  {
    title: 'FAQ-合同到期怎么办',
    sourceType: 'faq',
    category: 'hr',
    tags: ['FAQ', '合同'],
    content: `问：劳动合同快到期怎么办？
答：系统按 30/15/7 天预警。HR 与部门评估续签意向，走续签审批与电子签。员工也可主动联系 HR 沟通。`,
  },
  {
    title: 'FAQ-如何改密码',
    sourceType: 'faq',
    category: 'hr',
    tags: ['FAQ', '密码'],
    content: `问：如何修改登录密码？
答：登录后进入个人中心 → 修改密码。首次登录或使用默认口令时系统会强制改密。忘记密码请联系 HR 重置。`,
  },
  {
    title: 'FAQ-忘记打卡',
    sourceType: 'faq',
    category: 'attendance',
    tags: ['FAQ', '打卡'],
    content: `问：忘记打卡怎么办？
答：可在规定时限内提交补卡申请并说明原因，经部门审批后生效。补卡次数受制度限制，请养成及时打卡习惯。`,
  },
  {
    title: 'FAQ-远程办公',
    sourceType: 'faq',
    category: 'attendance',
    tags: ['FAQ', '远程'],
    content: `问：可以远程办公吗？
答：需提前申请并获部门与 HR 批准。远程办公期间仍须按考勤要求在线签到，并保证工作产出可衡量。`,
  },
  {
    title: 'FAQ-绩效等级含义',
    sourceType: 'faq',
    category: 'performance',
    tags: ['FAQ', '绩效'],
    content: `问：绩效 S/A/B/C/D 是什么意思？
答：S 卓越、A 优秀、B 达标、C 待改进、D 不合格。系数影响绩效工资，具体系数见配置中心。评分建议仅供参考。`,
  },
  {
    title: 'FAQ-同事工资能问吗',
    sourceType: 'faq',
    category: 'hr',
    tags: ['FAQ', '合规'],
    content: `问：可以打听同事工资吗？
答：不可以。公司禁止传播他人薪酬信息。AI 助手也不会回答涉及他人隐私薪资的问题。`,
  },
  {
    title: 'FAQ-AI问答范围',
    sourceType: 'faq',
    category: 'hr',
    tags: ['FAQ', 'AI'],
    content: `问：AI 智能问答能回答哪些问题？
答：主要覆盖员工手册、假期政策、工资条说明、报销流程与 FAQ。超出知识库或涉及他人隐私时，请转人工 HR。`,
  },
];

/**
 * 写入一篇文档及其固定向量 embedding（不依赖 LLM）
 */
async function insertDocWithFixedEmbedding(
  prisma: PrismaClient,
  doc: SeedDoc,
): Promise<void> {
  const existing = await prisma.aiDocument.findFirst({
    where: { title: doc.title, deletedAt: null },
  });
  if (existing) return;

  const created = await prisma.aiDocument.create({
    data: {
      title: doc.title,
      sourceType: doc.sourceType,
      content: doc.content,
      metadata: {
        category: doc.category,
        tags: doc.tags ?? [],
        seeded: true,
      },
      enabled: true,
    },
  });

  const chunks = chunkText(doc.content, 500, 50);
  for (let i = 0; i < chunks.length; i += 1) {
    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO ai_embeddings (id, document_id, chunk_index, chunk_text, embedding, token_count, created_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5::vector, $6, NOW())`,
      id,
      created.id,
      i,
      chunks[i],
      FIXED_VECTOR,
      Math.ceil(chunks[i]!.length / 2),
    );
  }
}

/**
 * 冷启动 AI 知识库（≥28 篇）。失败由调用方 try/catch，不中断其他 seed。
 */
export async function seedAiKnowledgeBase(prisma: PrismaClient): Promise<number> {
  let count = 0;
  for (const doc of DOCS) {
    await insertDocWithFixedEmbedding(prisma, doc);
    count += 1;
  }
  return count;
}

export const AI_KNOWLEDGE_DOC_COUNT = DOCS.length;
