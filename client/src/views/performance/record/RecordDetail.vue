<script setup lang="ts">
/**
 * 考核记录详情（M5-2-D2）· 消费 11 端点
 *  - GET /records/:id
 *  - PATCH /:id/self + POST /:id/submit-self（自评）
 *  - POST /:id/ai-suggest + GET /:id/ai-suggestions（AI 建议）
 *  - PATCH /:id/manager-score + POST /:id/submit-manager（经理评分）
 *  - PATCH /:id/calibrate + POST /:id/submit-calibrate（部门校准）
 *  - PATCH /:id/hr-summary + POST /:id/submit-hr（HR 汇总）
 *  - PATCH /:id/ceo-approve（CEO 审批）
 *  - POST /:id/archive + POST /:id/reject（归档/驳回）
 *
 * ElSteps 6 环节 + 5 阶段评分面板 + AI 建议区 + 归档/驳回 Dialog
 * 每阶段 PATCH 存草稿 → POST submit 定稿「两段式」是本切片核心范式
 * 驳回后 status='rejected' 不自动打回，按当前 status 重算各环节面板
 */
import { computed, defineComponent, h, onMounted, reactive, ref, type PropType } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import FormDialog from '@/components/FormDialog.vue';
import {
  archiveRecord,
  ceoApprove,
  getRecord,
  listAiSuggestions,
  rejectRecord,
  requestAiSuggest,
  saveCalibration,
  saveHrSummary,
  saveManagerScore,
  saveSelfScore,
  submitCalibration,
  submitHrSummary,
  submitManager,
  submitSelf,
} from '@/api/performanceRecord';
import {
  type AiSuggestionItem,
  type CeoApproveRequest,
  type PerformanceRecordDetail,
  type RecordAiSuggestion,
  type RecordScore,
  type RecordScoreItem,
  type RejectRecordRequest,
  type SaveScoreRequest,
  type ScoreItemInput,
  type ScoreStage,
  canRecordAiRead,
  canRecordSelfEdit,
  canRecordStageAction,
  GRADE_LABELS,
  RECORD_STEPS,
  recordStatusInfo,
  recordStepIndex,
  type Grade,
} from '@/api/types/performanceRecord';
import { useUserStore } from '@/stores/user';
import { formatDate } from '@/utils/format';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const user = computed(() => userStore.userInfo);

// 评分只读子组件（本地 render 函数；不引入 components/，避免越界创建第 8 个文件）
// 4 个评分面板（self / manager / calibrate / hr）的 v-else 只读分支复用
// `<script setup>` 内顶层 const 会被 Vue 自动注册为模板局部组件，故可直接 <ReadOnlyScoreTable>
const ReadOnlyScoreTable = defineComponent({
  name: 'ReadOnlyScoreTable',
  props: {
    score: { type: Object as PropType<RecordScore | undefined>, default: null },
  },
  setup(props) {
    return () => {
      const sc = props.score;
      if (!sc) {
        return h('div', { class: 'readonly-empty' }, '本环节尚未提交评分');
      }
      return h('div', { class: 'readonly-score' }, [
        h(
          'table',
          { class: 'readonly-score-table' },
          [
            h(
              'thead',
              h('tr', [
                h('th', '指标 ID'),
                h('th', '分数'),
                h('th', '权重'),
                h('th', '加权得分'),
                h('th', '备注'),
              ]),
            ),
            h(
              'tbody',
              sc.items.map((it) =>
                h('tr', [
                  h('td', `${it.indicatorId.slice(0, 8)}…`),
                  h('td', String(it.scoreValue)),
                  h('td', String(it.weight)),
                  h('td', String(it.weightedScore)),
                  h('td', it.comment ?? '—'),
                ]),
              ),
            ),
          ],
        ),
        sc.comment
          ? h('div', { class: 'readonly-comment' }, [`总评：${sc.comment}`])
          : null,
      ]);
    };
  },
});

const recordId = computed(() => String(route.params.id || ''));
const loading = ref(false);
const record = ref<PerformanceRecordDetail | null>(null);
const aiSuggestions = ref<RecordAiSuggestion[]>([]);
const acting = ref(false);
const aiLoading = ref(false);
const isOwn = computed(
    () => Boolean(user.value?.employee?.id && record.value && record.value.employeeId === user.value.employee?.id),
);

// 评分明细编辑缓冲（本地数组 of {indicatorId, score, comment}）
function emptyRows(): ScoreItemInput[] {
  return [];
}

const selfRows = ref<ScoreItemInput[]>(emptyRows());
const selfComment = ref('');
const basedOnAiSuggestionId = ref<string>('');

const managerRows = ref<ScoreItemInput[]>(emptyRows());
const managerComment = ref('');

const calibrateRows = ref<ScoreItemInput[]>(emptyRows());
const calibrateComment = ref('');

const hrRows = ref<ScoreItemInput[]>(emptyRows());
const hrComment = ref('');

const ceoGrade = ref<Grade>('B');
const ceoFinalScore = ref<number>(80);
const ceoComment = ref('');

const rejectVisible = ref(false);
const rejectRef = ref<FormInstance>();
const rejectReason = reactive<{ reason: string }>({ reason: '' });

const rejectRules: FormRules<{ reason: string }> = {
  reason: [
    { required: true, message: '请填写驳回原因', trigger: 'blur' },
    {
      validator: (_rule, value, cb) => {
        const v = String(value || '').trim();
        if (v.length < 5) {
          cb(new Error('驳回原因至少 5 个字符'));
        } else {
          cb();
        }
      },
      trigger: 'blur',
    },
  ],
};

// 当前环节下展示的草稿 + 提交按钮显隐（仅权限 + 状态都满足时显示）
const canSelf = computed(() => {
    if (!record.value) {
      return false;
    }
  return canRecordSelfEdit(record.value, user.value, isOwn.value);
});
const canSelfSubmit = computed(() => {
    if (!record.value) {
      return false;
    }
  return record.value.status === 'draft' && canSelf.value && selfRows.value.length > 0;
});

const canManager = computed(() => {
    if (!record.value) {
      return false;
    }
  return canRecordStageAction('manager', record.value, user.value, false);
});
const canManagerSubmit = computed(() => {
    if (!record.value) {
      return false;
    }
  return record.value.status === 'manager_scoring' && canManager.value && managerRows.value.length > 0;
});

const canCalibrate = computed(() => {
    if (!record.value) {
      return false;
    }
  return canRecordStageAction('calibrate', record.value, user.value, false);
});
const canCalibrateSubmit = computed(() => {
    if (!record.value) {
      return false;
    }
  return record.value.status === 'dept_calibrating' && canCalibrate.value && calibrateRows.value.length > 0;
});

const canHr = computed(() => {
    if (!record.value) {
      return false;
    }
  return canRecordStageAction('hr', record.value, user.value, false);
});
const canHrSubmit = computed(() => {
    if (!record.value) {
      return false;
    }
  return record.value.status === 'hr_summarizing' && canHr.value && hrRows.value.length > 0;
});

const canCeo = computed(() => {
    if (!record.value) {
      return false;
    }
  return canRecordStageAction('ceo', record.value, user.value, false);
});

const canAi = computed(() => {
    if (!record.value) {
      return false;
    }
  return canRecordStageAction('ai', record.value, user.value, false);
});
const canAiRead = computed(() => canRecordAiRead(user.value));

const canArchive = computed(() => {
    if (!record.value) {
      return false;
    }
  return canRecordStageAction('archive', record.value, user.value, false);
});
const canReject = computed(() => {
    if (!record.value) {
      return false;
    }
  return canRecordStageAction('reject', record.value, user.value, false);
});

const stepIndex = computed(() => recordStepIndex(record.value?.status));

function findCurrentScore(stage: ScoreStage): RecordScore | undefined {
    if (!record.value) {
      return undefined;
    }
  return record.value.scores.find((s) => s.stage === stage && s.isCurrent);
}

function rowsFromScore(stage: ScoreStage): ScoreItemInput[] {
  const sc = findCurrentScore(stage);
  if (!sc) {
    return [];
  }
  return sc.items.map((it: RecordScoreItem) => ({
    indicatorId: it.indicatorId,
    score: Number(it.scoreValue),
    comment: it.comment ?? undefined,
  }));
}

function commentFromScore(stage: ScoreStage): string {
  const sc = findCurrentScore(stage);
  return sc?.comment ?? '';
}

function refreshRowBuffersFromRecord(): void {
    if (!record.value) {
      return;
    }
  selfRows.value = rowsFromScore('self');
  selfComment.value = commentFromScore('self');
  managerRows.value = rowsFromScore('manager');
  managerComment.value = commentFromScore('manager');
  calibrateRows.value = rowsFromScore('calibrate');
  calibrateComment.value = commentFromScore('calibrate');
  hrRows.value = rowsFromScore('hr');
  hrComment.value = commentFromScore('hr');
}

async function loadRecord(): Promise<void> {
  loading.value = true;
  try {
    record.value = await getRecord(recordId.value);
    refreshRowBuffersFromRecord();
    if (canAiRead.value && record.value) {
      aiSuggestions.value = await listAiSuggestions(recordId.value);
    } else {
      aiSuggestions.value = [];
    }
  } finally {
    loading.value = false;
  }
}

async function loadAiSuggestions(): Promise<void> {
  if (!canAiRead.value) {
    return;
  }
  aiSuggestions.value = await listAiSuggestions(recordId.value);
}

async function afterStageSave(): Promise<void> {
  ElMessage.success('已保存草稿');
  await loadRecord();
}

function buildSaveBody(rows: ScoreItemInput[], comment: string): SaveScoreRequest {
  const body: SaveScoreRequest = {
    items: rows.map((r) => ({
      indicatorId: r.indicatorId,
      score: Number(r.score),
      comment: r.comment,
    })),
  };
  if (comment) {
    body.comment = comment;
  }
  return body;
}

async function onSaveSelf(): Promise<void> {
  if (!record.value) {
    return;
  }
  acting.value = true;
  try {
    await saveSelfScore(record.value.id, buildSaveBody(selfRows.value, selfComment.value));
    await afterStageSave();
  } finally {
    acting.value = false;
  }
}

async function onSubmitSelf(): Promise<void> {
  if (!record.value) {
    return;
  }
  try {
    await ElMessageBox.confirm('提交后状态将推进至「上级评分中」，无法撤回。是否继续？', '提交自评', {
      type: 'warning',
    });
  } catch {
    return;
  }
  acting.value = true;
  try {
    await submitSelf(record.value.id);
    ElMessage.success('已提交自评');
    await loadRecord();
  } finally {
    acting.value = false;
  }
}

async function onSaveManager(): Promise<void> {
  if (!record.value) {
    return;
  }
  acting.value = true;
  try {
    await saveManagerScore(record.value.id, buildSaveBody(managerRows.value, managerComment.value));
    await afterStageSave();
  } finally {
    acting.value = false;
  }
}

async function onSubmitManager(): Promise<void> {
  if (!record.value) {
    return;
  }
  try {
    await ElMessageBox.confirm('提交后状态将推进至「部门校准中」。是否继续？', '提交上级评分', {
      type: 'warning',
    });
  } catch {
    return;
  }
  acting.value = true;
  try {
    await submitManager(record.value.id);
    ElMessage.success('已提交上级评分');
    await loadRecord();
  } finally {
    acting.value = false;
  }
}

async function onSaveCalibrate(): Promise<void> {
  if (!record.value) {
    return;
  }
  acting.value = true;
  try {
    await saveCalibration(record.value.id, buildSaveBody(calibrateRows.value, calibrateComment.value));
    await afterStageSave();
  } finally {
    acting.value = false;
  }
}

async function onSubmitCalibrate(): Promise<void> {
  if (!record.value) {
    return;
  }
  try {
    await ElMessageBox.confirm('提交后状态将推进至「HR 汇总中」。是否继续？', '提交部门校准', {
      type: 'warning',
    });
  } catch {
    return;
  }
  acting.value = true;
  try {
    await submitCalibration(record.value.id);
    ElMessage.success('已提交部门校准');
    await loadRecord();
  } finally {
    acting.value = false;
  }
}

async function onSaveHr(): Promise<void> {
  if (!record.value) {
    return;
  }
  acting.value = true;
  try {
    await saveHrSummary(record.value.id, buildSaveBody(hrRows.value, hrComment.value));
    await afterStageSave();
  } finally {
    acting.value = false;
  }
}

async function onSubmitHr(): Promise<void> {
  if (!record.value) {
    return;
  }
  try {
    await ElMessageBox.confirm('提交后状态将推进至「总经理审批」。是否继续？', '提交 HR 汇总', {
      type: 'warning',
    });
  } catch {
    return;
  }
  acting.value = true;
  try {
    await submitHrSummary(record.value.id);
    ElMessage.success('已提交 HR 汇总');
    await loadRecord();
  } finally {
    acting.value = false;
  }
}

function gradeToScoreHint(grade: Grade | string): number {
  switch (grade) {
    case 'S':
      return 95;
    case 'A':
      return 85;
    case 'B':
      return 75;
    case 'C':
      return 65;
    case 'D':
      return 50;
    default:
      return 70;
  }
}

async function onRequestAi(): Promise<void> {
  if (!record.value) {
    return;
  }
  aiLoading.value = true;
  try {
    const res = await requestAiSuggest(record.value.id);
    ElMessage.success(
      `AI 建议已生成（${res.suggestions.length} 条；tokens=${res.tokens}；耗时 ${res.durationMs}ms）`,
    );
    // 把首条建议填入经理评分（基于建议）
    if (res.suggestions.length > 0 && managerRows.value.length > 0) {
      const first = res.suggestions[0] as AiSuggestionItem;
      const avgScore = gradeToScoreHint(first.grade);
      managerRows.value = managerRows.value.map((row) => ({
        ...row,
        score: avgScore,
      }));
      basedOnAiSuggestionId.value = res.suggestionId;
    }
    await loadAiSuggestions();
  } finally {
    aiLoading.value = false;
  }
}

async function onCeoApprove(): Promise<void> {
  if (!record.value) {
    return;
  }
  if (ceoFinalScore.value < 0 || ceoFinalScore.value > 100) {
    ElMessage.warning('最终得分须在 0-100 之间');
    return;
  }
  const body: CeoApproveRequest = {
    finalGrade: ceoGrade.value,
    finalScore: Number(ceoFinalScore.value),
  };
  if (ceoComment.value) {
    body.comment = ceoComment.value;
  }
  acting.value = true;
  try {
    await ceoApprove(record.value.id, body);
    ElMessage.success('已审批');
    await loadRecord();
  } finally {
    acting.value = false;
  }
}

function openArchive(): void {
  if (!record.value) {
    return;
  }
  ElMessageBox.confirm(
    `确定归档 ${record.value.employee.name} 的考核记录？归档后不可再修改。`,
    '归档考核',
    { type: 'warning' },
  )
    .then(async () => {
      acting.value = true;
      try {
        await archiveRecord(record.value!.id);
        ElMessage.success('已归档');
        await loadRecord();
      } finally {
        acting.value = false;
      }
    })
    .catch(() => undefined);
}

function openReject(): void {
  rejectReason.reason = '';
  rejectVisible.value = true;
}

async function onConfirmReject(): Promise<void> {
  if (!record.value) {
    return;
  }
  const ok = await rejectRef.value?.validate().catch(() => false);
  if (!ok) {
    return;
  }
  const body: RejectRecordRequest = { reason: rejectReason.reason.trim() };
  acting.value = true;
  try {
    await rejectRecord(record.value.id, body);
    ElMessage.success('已驳回');
    rejectVisible.value = false;
    await loadRecord();
  } finally {
    acting.value = false;
  }
}

function goBack(): void {
  router.push('/performance/records');
}

onMounted(loadRecord);
</script>

<template>
  <div v-loading="loading">
    <PageHeader
      :title="record ? `${record.employee.name} · 考核详情` : '考核详情'"
      :breadcrumb="[
        { label: '绩效管理', to: '/performance' },
        { label: '考核记录', to: '/performance/records' },
        { label: '详情' },
      ]"
    >
      <template #actions>
        <el-button @click="goBack">返回列表</el-button>
      </template>
    </PageHeader>

    <EmptyState
      v-if="!record && !loading"
      description="考核记录不存在或已被删除"
    />

    <template v-else-if="record">
      <div class="head">
        <span class="title">{{ record.employee.name }}</span>
        <span class="cycle">{{ record.cycle.name }}</span>
        <el-tag :type="recordStatusInfo(record.status).type" size="large">
          {{ recordStatusInfo(record.status).label }}
        </el-tag>
        <el-tag v-if="record.finalGrade" type="success" size="large">
          最终 {{ GRADE_LABELS[record.finalGrade as Grade] ?? record.finalGrade }}
          {{ record.finalScore ?? '' }}
        </el-tag>
      </div>

      <el-alert
        v-if="record.status === 'rejected'"
        title="记录已被驳回"
        type="error"
        :closable="false"
        class="mb"
        show-icon
      >
        被打回环节：{{ recordStatusInfo(record.status).label }}；当前记录已锁定，请新建一条考核记录重新走流程。
      </el-alert>

      <el-alert
        v-if="record.status === 'cancelled'"
        title="记录已作废"
        type="error"
        :closable="false"
        class="mb"
        show-icon
      />

      <el-steps :active="stepIndex" align-center class="mb">
        <el-step v-for="(title, i) in RECORD_STEPS" :key="i" :title="title" />
      </el-steps>

      <el-descriptions :column="3" border class="mb">
        <el-descriptions-item label="员工">{{ record.employee.name }}</el-descriptions-item>
        <el-descriptions-item label="考核周期">{{ record.cycle.name }}</el-descriptions-item>
        <el-descriptions-item label="考核方案">
          {{ record.scheme?.name ?? '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatDate(record.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="提交时间">
          {{ record.submittedAt ? formatDate(record.submittedAt) : '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="归档时间">
          {{ record.archivedAt ? formatDate(record.archivedAt) : '—' }}
        </el-descriptions-item>
      </el-descriptions>

      <!-- 阶段动作条 -->
      <div class="actions mb">
        <el-button
          v-if="canArchive"
          type="warning"
          :loading="acting"
          @click="openArchive"
        >
          归档
        </el-button>
        <el-button
          v-if="canReject"
          type="danger"
          :loading="acting"
          @click="openReject"
        >
          驳回
        </el-button>
      </div>

      <!-- 自评面板 -->
      <el-card
        v-if="record.status === 'draft' || findCurrentScore('self')"
        shadow="never"
        class="mb"
      >
        <template #header>
          <span>① 自评阶段</span>
          <el-tag
            v-if="findCurrentScore('self')"
            type="info"
            size="small"
            class="ml"
          >
            v{{ findCurrentScore('self')?.version ?? '—' }}
          </el-tag>
        </template>
        <template v-if="canSelf">
          <el-table :data="selfRows" border>
            <el-table-column label="指标 ID" prop="indicatorId" min-width="220">
              <template #default="{ row }">
                <code>{{ row.indicatorId.slice(0, 8) }}…</code>
              </template>
            </el-table-column>
            <el-table-column label="分数 (0-100)" width="160">
              <template #default="{ row }">
                <el-input-number
                  v-model="row.score"
                  :min="0"
                  :max="100"
                  :precision="0"
                  style="width: 100%"
                />
              </template>
            </el-table-column>
            <el-table-column label="备注">
              <template #default="{ row }">
                <el-input v-model="row.comment" maxlength="2000" show-word-limit />
              </template>
            </el-table-column>
          </el-table>
          <el-form-item label="总评" class="mt">
            <el-input
              v-model="selfComment"
              type="textarea"
              :rows="2"
              maxlength="2000"
              show-word-limit
            />
          </el-form-item>
          <div class="actions">
            <el-button
              type="primary"
              :loading="acting"
              :disabled="selfRows.length === 0"
              @click="onSaveSelf"
            >
              保存自评草稿
            </el-button>
            <el-button
              type="success"
              :loading="acting"
              :disabled="!canSelfSubmit"
              @click="onSubmitSelf"
            >
              提交自评
            </el-button>
          </div>
        </template>
        <template v-else>
          <ReadOnlyScoreTable :score="findCurrentScore('self')" />
        </template>
      </el-card>

      <!-- AI 建议面板 -->
      <el-card
        v-if="(canAi || canAiRead) && (record.status === 'manager_scoring' || aiSuggestions.length > 0)"
        shadow="never"
        class="mb"
      >
        <template #header>AI 评分建议</template>
        <div v-if="canAi" class="mb">
          <el-button type="primary" :loading="aiLoading" @click="onRequestAi">
            生成 AI 建议
          </el-button>
          <span class="hint">（基于历史绩效 + 考勤 + 自评；同步返回；上限 5 次/24h）</span>
        </div>
        <template v-if="canAiRead">
          <el-table v-if="aiSuggestions.length > 0" :data="aiSuggestions" border>
            <el-table-column label="生成时间" width="170">
              <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column label="模型" width="100">
              <template #default="{ row }">{{ row.modelName }}</template>
            </el-table-column>
            <el-table-column label="建议" min-width="200">
              <template #default="{ row }">
                <el-tag
                  v-for="(s, idx) in row.suggestions"
                  :key="idx"
                  type="info"
                  size="small"
                  class="grade-tag"
                >
                  {{ GRADE_LABELS[s.grade as Grade] ?? s.grade }}
                  ({{ Math.round(Number(s.confidence) * 100) }}%)
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="tokens" width="80" prop="tokens" />
            <el-table-column label="耗时 (ms)" width="100" prop="durationMs" />
          </el-table>
          <EmptyState v-else description="尚无 AI 建议；点击上方按钮发起" />
        </template>
      </el-card>

      <!-- 经理评分面板 -->
      <el-card
        v-if="record.status === 'manager_scoring' || findCurrentScore('manager')"
        shadow="never"
        class="mb"
      >
        <template #header>
          <span>② 上级评分</span>
          <el-tag
            v-if="findCurrentScore('manager')"
            type="info"
            size="small"
            class="ml"
          >
            v{{ findCurrentScore('manager')?.version ?? '—' }}
          </el-tag>
        </template>
        <template v-if="canManager">
          <el-table :data="managerRows" border>
            <el-table-column label="指标 ID" min-width="220">
              <template #default="{ row }">
                <code>{{ row.indicatorId.slice(0, 8) }}…</code>
              </template>
            </el-table-column>
            <el-table-column label="分数 (0-100)" width="160">
              <template #default="{ row }">
                <el-input-number
                  v-model="row.score"
                  :min="0"
                  :max="100"
                  :precision="0"
                  style="width: 100%"
                />
              </template>
            </el-table-column>
            <el-table-column label="备注">
              <template #default="{ row }">
                <el-input v-model="row.comment" maxlength="2000" show-word-limit />
              </template>
            </el-table-column>
          </el-table>
          <el-form-item label="总评" class="mt">
            <el-input
              v-model="managerComment"
              type="textarea"
              :rows="2"
              maxlength="2000"
              show-word-limit
            />
          </el-form-item>
          <el-alert
            v-if="basedOnAiSuggestionId"
            type="info"
            :closable="false"
            class="mb"
            :title="`采纳 AI 建议 ${basedOnAiSuggestionId.slice(0, 8)}…`"
          />
          <div class="actions">
            <el-button
              type="primary"
              :loading="acting"
              :disabled="managerRows.length === 0"
              @click="onSaveManager"
            >
              保存上级评分草稿
            </el-button>
            <el-button
              type="success"
              :loading="acting"
              :disabled="!canManagerSubmit"
              @click="onSubmitManager"
            >
              提交上级评分
            </el-button>
          </div>
        </template>
        <template v-else>
          <ReadOnlyScoreTable :score="findCurrentScore('manager')" />
        </template>
      </el-card>

      <!-- 部门校准面板 -->
      <el-card
        v-if="record.status === 'dept_calibrating' || findCurrentScore('calibrate')"
        shadow="never"
        class="mb"
      >
        <template #header>
          <span>③ 部门校准</span>
          <el-tag
            v-if="findCurrentScore('calibrate')"
            type="info"
            size="small"
            class="ml"
          >
            v{{ findCurrentScore('calibrate')?.version ?? '—' }}
          </el-tag>
        </template>
        <template v-if="canCalibrate">
          <el-table :data="calibrateRows" border>
            <el-table-column label="指标 ID" min-width="220">
              <template #default="{ row }">
                <code>{{ row.indicatorId.slice(0, 8) }}…</code>
              </template>
            </el-table-column>
            <el-table-column label="分数 (0-100)" width="160">
              <template #default="{ row }">
                <el-input-number
                  v-model="row.score"
                  :min="0"
                  :max="100"
                  :precision="0"
                  style="width: 100%"
                />
              </template>
            </el-table-column>
            <el-table-column label="备注">
              <template #default="{ row }">
                <el-input v-model="row.comment" maxlength="2000" show-word-limit />
              </template>
            </el-table-column>
          </el-table>
          <el-form-item label="总评" class="mt">
            <el-input
              v-model="calibrateComment"
              type="textarea"
              :rows="2"
              maxlength="2000"
              show-word-limit
            />
          </el-form-item>
          <div class="actions">
            <el-button
              type="primary"
              :loading="acting"
              :disabled="calibrateRows.length === 0"
              @click="onSaveCalibrate"
            >
              保存部门校准草稿
            </el-button>
            <el-button
              type="success"
              :loading="acting"
              :disabled="!canCalibrateSubmit"
              @click="onSubmitCalibrate"
            >
              提交部门校准
            </el-button>
          </div>
        </template>
        <template v-else>
          <ReadOnlyScoreTable :score="findCurrentScore('calibrate')" />
        </template>
      </el-card>

      <!-- HR 汇总面板 -->
      <el-card
        v-if="record.status === 'hr_summarizing' || findCurrentScore('hr')"
        shadow="never"
        class="mb"
      >
        <template #header>
          <span>④ HR 汇总</span>
          <el-tag
            v-if="findCurrentScore('hr')"
            type="info"
            size="small"
            class="ml"
          >
            v{{ findCurrentScore('hr')?.version ?? '—' }}
          </el-tag>
        </template>
        <template v-if="canHr">
          <el-table :data="hrRows" border>
            <el-table-column label="指标 ID" min-width="220">
              <template #default="{ row }">
                <code>{{ row.indicatorId.slice(0, 8) }}…</code>
              </template>
            </el-table-column>
            <el-table-column label="分数 (0-100)" width="160">
              <template #default="{ row }">
                <el-input-number
                  v-model="row.score"
                  :min="0"
                  :max="100"
                  :precision="0"
                  style="width: 100%"
                />
              </template>
            </el-table-column>
            <el-table-column label="备注">
              <template #default="{ row }">
                <el-input v-model="row.comment" maxlength="2000" show-word-limit />
              </template>
            </el-table-column>
          </el-table>
          <el-form-item label="总评" class="mt">
            <el-input
              v-model="hrComment"
              type="textarea"
              :rows="2"
              maxlength="2000"
              show-word-limit
            />
          </el-form-item>
          <div class="actions">
            <el-button
              type="primary"
              :loading="acting"
              :disabled="hrRows.length === 0"
              @click="onSaveHr"
            >
              保存 HR 汇总草稿
            </el-button>
            <el-button
              type="success"
              :loading="acting"
              :disabled="!canHrSubmit"
              @click="onSubmitHr"
            >
              提交 HR 汇总
            </el-button>
          </div>
        </template>
        <template v-else>
          <ReadOnlyScoreTable :score="findCurrentScore('hr')" />
        </template>
      </el-card>

      <!-- CEO 审批面板 -->
      <el-card
        v-if="record.status === 'ceo_approving' || record.status === 'ceo_approved'"
        shadow="never"
        class="mb"
      >
        <template #header>⑤ CEO 审批</template>
        <template v-if="canCeo">
          <el-form label-width="100px">
            <el-form-item label="最终等级">
              <el-radio-group v-model="ceoGrade">
                <el-radio
                  v-for="g in (['S', 'A', 'B', 'C', 'D'] as Grade[])"
                  :key="g"
                  :value="g"
                >
                  {{ GRADE_LABELS[g] }}
                </el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="最终得分">
              <el-input-number
                v-model="ceoFinalScore"
                :min="0"
                :max="100"
                :precision="0"
                style="width: 200px"
              />
            </el-form-item>
            <el-form-item label="审批意见">
              <el-input
                v-model="ceoComment"
                type="textarea"
                :rows="2"
                maxlength="2000"
                show-word-limit
              />
            </el-form-item>
          </el-form>
          <div class="actions">
            <el-button type="primary" :loading="acting" @click="onCeoApprove">
              提交审批
            </el-button>
          </div>
        </template>
        <template v-else>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="最终等级">
              {{ record.finalGrade ? GRADE_LABELS[record.finalGrade as Grade] ?? record.finalGrade : '—' }}
            </el-descriptions-item>
            <el-descriptions-item label="最终得分">{{ record.finalScore ?? '—' }}</el-descriptions-item>
          </el-descriptions>
        </template>
      </el-card>
    </template>

    <FormDialog
      v-model="rejectVisible"
      title="驳回考核记录"
      :confirm-loading="acting"
      width="520px"
      @confirm="onConfirmReject"
    >
      <el-form
        ref="rejectRef"
        :model="rejectReason"
        :rules="rejectRules"
        label-width="80px"
      >
        <el-form-item label="驳回原因" prop="reason">
          <el-input
            v-model="rejectReason.reason"
            type="textarea"
            :rows="4"
            maxlength="2000"
            show-word-limit
            placeholder="至少 5 个字符"
          />
        </el-form-item>
        <el-alert
          type="warning"
          :closable="false"
          title="驳回后记录状态变为「已驳回」，不再可编辑；如有需要请新建一条考核记录"
        />
      </el-form>
    </FormDialog>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.title {
  font-size: 18px;
  font-weight: 600;
}
.cycle {
  color: #606266;
}
.mb {
  margin-bottom: 16px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.ml {
  margin-left: 8px;
}
.hint {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
}
.grade-tag {
  margin-right: 4px;
}
.mt {
  margin-top: 12px;
}
</style>

<style>
/* 全局样式：render 函数输出的原始元素不受 scoped data-attr 影响 */
.readonly-empty {
  color: #909399;
  padding: 12px 0;
}
.readonly-score-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.readonly-score-table th,
.readonly-score-table td {
  border: 1px solid #ebeef5;
  padding: 6px 10px;
  text-align: left;
}
.readonly-score-table th {
  background: #f5f7fa;
  font-weight: 500;
}
.readonly-comment {
  margin-top: 12px;
  padding: 8px 12px;
  background: #f5f7fa;
  border-radius: 4px;
  font-size: 13px;
}
</style>