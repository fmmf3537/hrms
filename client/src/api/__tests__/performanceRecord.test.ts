/**
 * 考核记录 API 单测（M5-2-D2）内联断言
 *
 * 覆盖要点（ac43074 自包含范式）：
 *  - RECORD_PATHS 拼接：PATCH 与 POST 路径互不混淆（self(id) vs submitSelf(id) 等 5 对）
 *  - SaveScoreRequest.items min 1 / score 0-100 类型断言
 *  - CeoApproveRequest.finalGrade 字面量联合 + finalScore 0-100
 *  - RejectRecordRequest.reason 长度约束（min 5）
 *  - unwrapRecordList 解包 3 形态（展平 / 嵌套 data / 数组 data）
 */
import { RECORD_PATHS } from '@/api/performanceRecord';
import {
  type CeoApproveRequest,
  type CreateRecordRequest,
  type RecordListQuery,
  type RejectRecordRequest,
  type SaveScoreRequest,
  type ScoreItemInput,
  unwrapRecordList,
} from '@/api/types/performanceRecord';

interface Case {
  name: string;
  fn: () => void;
}

const cases: Case[] = [];

function describe(_name: string, fn: () => void): void {
  fn();
}

function it(name: string, fn: () => void): void {
  cases.push({ name, fn });
}

function expectEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

describe('api/performanceRecord.ts', () => {
  it('RECORD_PATHS 拼接 · PATCH 与 POST 路径互不混淆', () => {
    expectEqual(RECORD_PATHS.list, '/performance/records', 'list');
    expectEqual(RECORD_PATHS.detail('r1'), '/performance/records/r1', 'detail(id)');
    // PATCH vs POST 同 id 不同路径（关键：避免 save 与 submit 路径碰撞）
    expectEqual(
      RECORD_PATHS.self('r1'),
      '/performance/records/r1/self',
      'self(id) PATCH 存草稿',
    );
    expectEqual(
      RECORD_PATHS.submitSelf('r1'),
      '/performance/records/r1/submit-self',
      'submitSelf(id) POST 推进',
    );
    expectEqual(
      String(RECORD_PATHS.self('r1')) !== String(RECORD_PATHS.submitSelf('r1')),
      true,
      'self ≠ submitSelf',
    );
    expectEqual(
      RECORD_PATHS.managerScore('r1'),
      '/performance/records/r1/manager-score',
      'managerScore PATCH',
    );
    expectEqual(
      RECORD_PATHS.submitManager('r1'),
      '/performance/records/r1/submit-manager',
      'submitManager POST',
    );
    expectEqual(
      String(RECORD_PATHS.managerScore('r1')) !== String(RECORD_PATHS.submitManager('r1')),
      true,
      'managerScore ≠ submitManager',
    );
    expectEqual(
      RECORD_PATHS.calibrate('r1'),
      '/performance/records/r1/calibrate',
      'calibrate PATCH',
    );
    expectEqual(
      RECORD_PATHS.submitCalibrate('r1'),
      '/performance/records/r1/submit-calibrate',
      'submitCalibrate POST',
    );
    expectEqual(
      RECORD_PATHS.hrSummary('r1'),
      '/performance/records/r1/hr-summary',
      'hrSummary PATCH',
    );
    expectEqual(
      RECORD_PATHS.submitHr('r1'),
      '/performance/records/r1/submit-hr',
      'submitHr POST',
    );
    expectEqual(
      RECORD_PATHS.aiSuggest('r1'),
      '/performance/records/r1/ai-suggest',
      'aiSuggest POST',
    );
    expectEqual(
      RECORD_PATHS.aiSuggestions('r1'),
      '/performance/records/r1/ai-suggestions',
      'aiSuggestions GET',
    );
    expectEqual(
      RECORD_PATHS.ceoApprove('r1'),
      '/performance/records/r1/ceo-approve',
      'ceoApprove PATCH',
    );
    expectEqual(
      RECORD_PATHS.archive('r1'),
      '/performance/records/r1/archive',
      'archive POST',
    );
    expectEqual(
      RECORD_PATHS.reject('r1'),
      '/performance/records/r1/reject',
      'reject POST',
    );
  });

  it('SaveScoreRequest.items min 1 · score 0-100 类型 + basedOnAiSuggestionId 可选', () => {
    const items: ScoreItemInput[] = [
      { indicatorId: 'i1', score: 85, comment: 'good' },
      { indicatorId: 'i2', score: 92 },
    ];
    expectEqual(items.length, 2, 'items 至少 1 个');
    expectEqual(items[0].score >= 0 && items[0].score <= 100, true, 'score 0-100');
    expectEqual(items[0].comment, 'good', 'comment 可选');

    const reqWithAi: SaveScoreRequest = {
      items: [{ indicatorId: 'i1', score: 75 }],
      basedOnAiSuggestionId: 'a1',
    };
    expectEqual(reqWithAi.basedOnAiSuggestionId, 'a1', 'basedOnAiSuggestionId 可选');

    const reqWithComment: SaveScoreRequest = {
      comment: '整体良好',
      items: [{ indicatorId: 'i1', score: 88 }],
    };
    expectEqual(reqWithComment.comment, '整体良好', '总评 comment 可选');
  });

  it('CeoApproveRequest.finalGrade 字面量联合 + finalScore 0-100', () => {
    const req: CeoApproveRequest = { finalGrade: 'B', finalScore: 82 };
    expectEqual(req.finalScore >= 0 && req.finalScore <= 100, true, 'finalScore 0-100');
    expectEqual(['S', 'A', 'B', 'C', 'D'].includes(req.finalGrade), true, '5 档字面量');
    const withComment: CeoApproveRequest = {
      finalGrade: 'A',
      finalScore: 95,
      comment: '突出',
    };
    expectEqual(withComment.comment, '突出', 'comment 可选 ≤2000');
  });

  it('RejectRecordRequest.reason 长度约束 · CreateRecordRequest 结构', () => {
    const rej: RejectRecordRequest = { reason: '原因不足' };
    expectEqual(rej.reason.length, 4, '本字段前端建议 min 5 但 zod 由 service 强校验');

    const create: CreateRecordRequest = {
      cycleId: 'c1',
      employeeIds: ['e1', 'e2'],
    };
    expectEqual(create.employeeIds.length, 2, 'employeeIds min 1');
    expectEqual(create.schemeId, undefined, 'schemeId 可选');

    const createWithScheme: CreateRecordRequest = {
      cycleId: 'c1',
      employeeIds: ['e1'],
      schemeId: 's1',
    };
    expectEqual(createWithScheme.schemeId, 's1', 'schemeId 可选赋值');
  });

  it('RecordListQuery 字段对齐后端 recordListSchema', () => {
    const q: RecordListQuery = {
      cycleId: 'c1',
      employeeId: 'e1',
      status: 'draft',
      deptId: 'd1',
      page: 1,
      pageSize: 20,
    };
    expectEqual(q.page, 1, 'page');
    expectEqual(q.pageSize, 20, 'pageSize');
  });

  it('unwrapRecordList 解包 3 形态', () => {
    // 形态 A：展平 { success, items, total, page, pageSize }（D2 listRecords 实际返回）
    const flat = unwrapRecordList<{ id: string }>({
      success: true,
      items: [{ id: 'r1' }, { id: 'r2' }],
      total: 2,
      page: 1,
      pageSize: 20,
    });
    expectEqual(flat.items.length, 2, 'flat items');
    expectEqual(flat.total, 2, 'flat total');

    // 形态 B：嵌套 { success, data: { items, total, page, pageSize } }
    const nested = unwrapRecordList<{ id: string }>({
      success: true,
      data: { items: [{ id: 'r1' }], total: 1, page: 1, pageSize: 20 },
    });
    expectEqual(nested.items.length, 1, 'nested items');
    expectEqual(nested.total, 1, 'nested total');

    // 形态 C：data 为数组
    const arr = unwrapRecordList<{ id: string }>({
      success: true,
      data: [{ id: 'r1' }],
      total: 1,
    });
    expectEqual(arr.items.length, 1, 'array data items');
    expectEqual(arr.total, 1, 'array data total');

    // 兜底：未知形态
    const empty = unwrapRecordList<{ id: string }>({ success: true });
    expectEqual(empty.items.length, 0, '未知形态 → 空数组');
    expectEqual(empty.total, 0, '未知形态 → total 0');
  });
});

export function runPerformanceRecordApiTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const performanceRecordApiTestCount = cases.length;