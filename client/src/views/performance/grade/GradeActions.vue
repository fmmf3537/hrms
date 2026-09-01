<script setup lang="ts">
/**
 * 等级计算与部门比例校准（M5-2-D3）
 * @module views/performance/grade/GradeActions
 * @description 消费 3 端点：
 *  - POST /grade/calculate         等级计算（单笔）
 *  - POST /grade/calculate-batch   等级计算（批量）
 *  - POST /grade/calibrate-ratios  部门比例校准
 *
 * 三个区块：
 *  1. 单笔等级计算：记录选择 + force Checkbox → calculateGrade → 结果展示
 *  2. 批量等级计算：记录多选 + force + batchSize → calculateBatchGrade → 结果表格
 *  3. 部门比例校准：部门多选 + 周期可选 → calibrateDeptRatios → 表格 + ElProgress
 *
 * 权限：
 *  - 区块 1/2：grade:calculate（admin/hr/executive 可见可操作）
 *  - 区块 3：record:read（5 角色全可见，但菜单 grade-actions 仅 3 角色可达 → 实际 5 角色均不可达，
 *           见交付报告「主动识别」）
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import { listCycles } from '@/api/performance';
import { listEmployees } from '@/api/employee';
import { listRecords } from '@/api/performanceRecord';
import { listDepartments } from '@/api/department';
import {
  calculateBatchGrade,
  calculateGrade,
  calibrateDeptRatios,
} from '@/api/performanceGrade';
import {
  GRADE_LABELS,
  type Grade,
  type PerformanceCycle,
} from '@/api/types/performance';
import type { PerformanceRecord } from '@/api/types/performanceRecord';
import type { Department, Employee } from '@/api/types/organization';
import {
  type BatchGradeResult,
  type CalculateGradeResult,
  type CalibrationResult,
  type DeptCalibrationRatio,
} from '@/api/types/performancePayout';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';

const GRADES: Grade[] = ['S', 'A', 'B', 'C', 'D'];

const userStore = useUserStore();
const canCalculate = computed(() =>
  hasPermission(userStore.userInfo, 'performance:grade:calculate'),
);
const canCalibrate = computed(() =>
  hasPermission(userStore.userInfo, 'performance:record:read'),
);

// 共享数据
const records = ref<PerformanceRecord[]>([]);
const cycles = ref<PerformanceCycle[]>([]);
const departments = ref<Department[]>([]);
const employees = ref<Employee[]>([]);

function recordLabel(r: PerformanceRecord): string {
  const e = employees.value.find((x) => x.id === r.employeeId);
  const c = cycles.value.find((x) => x.id === r.cycleId);
  const name = e ? `${e.name}(${e.employeeNo})` : r.employeeId;
  const cyc = c ? c.name : r.cycleId;
  return `${name} - ${cyc} - ${r.status}`;
}

async function loadDataSources(): Promise<void> {
  const [recRes, cycRes, empRes, deptRes] = await Promise.all([
    listRecords({ pageSize: 100 }),
    listCycles({ pageSize: 100 }),
    listEmployees({ pageSize: 200 }),
    listDepartments(),
  ]);
  records.value = recRes.items;
  cycles.value = cycRes.items;
  employees.value = empRes.items;
  departments.value = deptRes;
}

onMounted(loadDataSources);

// ============ 区块 1：单笔等级计算 ============
const singleForm = reactive<{ recordId: string; force: boolean }>({
  recordId: '',
  force: false,
});
const singleLoading = ref(false);
const singleResult = ref<CalculateGradeResult | null>(null);

async function onSingleCalculate(): Promise<void> {
  if (!singleForm.recordId) {
    ElMessage.warning('请选择考核记录');
    return;
  }
  singleLoading.value = true;
  singleResult.value = null;
  try {
    const res = await calculateGrade(singleForm.recordId, singleForm.force);
    singleResult.value = res;
    ElMessage.success(
      `等级已计算：${res.oldGrade ?? '-'} → ${res.newGrade}（${res.finalScore} 分）`,
    );
  } finally {
    singleLoading.value = false;
  }
}

// ============ 区块 2：批量等级计算 ============
const batchForm = reactive<{
  recordIds: string[];
  force: boolean;
  batchSize: number | undefined;
}>({
  recordIds: [],
  force: true,
  batchSize: undefined,
});
const batchLoading = ref(false);
const batchResult = ref<BatchGradeResult | null>(null);

async function onBatchCalculate(): Promise<void> {
  if (!batchForm.recordIds.length) {
    ElMessage.warning('请至少选择 1 条记录');
    return;
  }
  batchLoading.value = true;
  batchResult.value = null;
  try {
    const opts: { force: boolean; batchSize?: number } = { force: batchForm.force };
    if (batchForm.batchSize !== undefined) opts.batchSize = batchForm.batchSize;
    batchResult.value = await calculateBatchGrade(batchForm.recordIds, opts);
    const ok = batchResult.value.succeeded.length;
    const fail = batchResult.value.failed.length;
    ElMessage.success(`批量完成：成功 ${ok} 笔，失败 ${fail} 笔`);
  } finally {
    batchLoading.value = false;
  }
}

// ============ 区块 3：部门比例校准 ============
const calForm = reactive<{ deptIds: string[]; cycleId: string }>({
  deptIds: [],
  cycleId: '',
});
const calLoading = ref(false);
const calResult = ref<CalibrationResult | null>(null);

async function onCalibrate(): Promise<void> {
  if (!calForm.deptIds.length) {
    ElMessage.warning('请至少选择 1 个部门');
    return;
  }
  calLoading.value = true;
  calResult.value = null;
  try {
    const opts: { cycleId?: string } = {};
    if (calForm.cycleId) opts.cycleId = calForm.cycleId;
    calResult.value = await calibrateDeptRatios(calForm.deptIds, opts.cycleId);
    ElMessage.success(`校准完成，共分析 ${calResult.value.results.length} 个部门`);
  } finally {
    calLoading.value = false;
  }
}

function ratioPercent(value: number | undefined): number {
  if (!value || Number.isNaN(value)) return 0;
  return Math.round(value * 100);
}

function getRowWarning(row: DeptCalibrationRatio): string {
  if (!row.warnings.length) return '';
  return row.warnings.join('；');
}
</script>

<template>
  <div>
    <PageHeader
      title="等级计算与部门比例校准"
      :breadcrumb="[{ label: '绩效管理' }, { label: '等级计算' }]"
    />

    <!-- 区块 1：单笔等级计算 -->
    <el-card v-if="canCalculate" shadow="never" class="block">
      <template #header>
        <span class="block-title">单笔等级计算</span>
        <span class="block-hint">对单条已 CEO 审批的考核记录执行等级判定</span>
      </template>
      <el-form :inline="true" label-width="80px">
        <el-form-item label="考核记录">
          <el-select
            v-model="singleForm.recordId"
            filterable
            placeholder="选择记录（员工 / 周期）"
            style="width: 360px"
          >
            <el-option
              v-for="r in records"
              :key="r.id"
              :label="recordLabel(r)"
              :value="r.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="强制覆盖">
          <el-checkbox v-model="singleForm.force">覆盖已有等级</el-checkbox>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="singleLoading" @click="onSingleCalculate">
            计算
          </el-button>
        </el-form-item>
      </el-form>
      <el-alert
        v-if="singleResult"
        :title="`等级 ${singleResult.oldGrade ?? '-'} → ${singleResult.newGrade}（${singleResult.finalScore} 分）`"
        type="success"
        show-icon
        :closable="false"
      />
    </el-card>

    <!-- 区块 2：批量等级计算 -->
    <el-card v-if="canCalculate" shadow="never" class="block">
      <template #header>
        <span class="block-title">批量等级计算</span>
        <span class="block-hint">一次处理多条记录，结果分成功 / 失败</span>
      </template>
      <el-form :inline="true" label-width="80px">
        <el-form-item label="考核记录">
          <el-select
            v-model="batchForm.recordIds"
            multiple
            filterable
            placeholder="选择多条记录"
            style="width: 380px"
          >
            <el-option
              v-for="r in records"
              :key="r.id"
              :label="recordLabel(r)"
              :value="r.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="批次上限">
          <el-input-number
            v-model="batchForm.batchSize"
            :min="1"
            :max="100"
            placeholder="默认 100"
            style="width: 140px"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="batchLoading" @click="onBatchCalculate">
            批量计算
          </el-button>
        </el-form-item>
      </el-form>
      <div v-if="batchResult" class="batch-summary">
        <el-tag type="success">成功 {{ batchResult.succeeded.length }}</el-tag>
        <el-tag type="danger">失败 {{ batchResult.failed.length }}</el-tag>
      </div>
      <el-table
        v-if="batchResult"
        :data="batchResult.succeeded"
        size="small"
        border
        class="block-table"
      >
        <el-table-column prop="recordId" label="记录 ID" min-width="200" />
        <el-table-column prop="finalScore" label="分数" width="80" />
        <el-table-column prop="oldGrade" label="原等级" width="80">
          <template #default="{ row }">
            {{ row.oldGrade ?? '-' }}
          </template>
        </el-table-column>
        <el-table-column label="新等级" width="80">
          <template #default="{ row }">
            <el-tag type="success">{{ row.newGrade }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
      <el-table
        v-if="batchResult && batchResult.failed.length"
        :data="batchResult.failed"
        size="small"
        border
        class="block-table"
      >
        <el-table-column prop="recordId" label="记录 ID" min-width="200" />
        <el-table-column prop="error" label="失败原因" />
        <el-table-column prop="code" label="错误码" width="100" />
      </el-table>
    </el-card>

    <!-- 区块 3：部门比例校准 -->
    <el-card v-if="canCalibrate" shadow="never" class="block">
      <template #header>
        <span class="block-title">部门比例校准</span>
        <span class="block-hint">warn_only 软警告，不修改 finalGrade</span>
      </template>
      <el-form :inline="true" label-width="80px">
        <el-form-item label="部门">
          <el-select
            v-model="calForm.deptIds"
            multiple
            filterable
            placeholder="选择部门"
            style="width: 320px"
          >
            <el-option
              v-for="d in departments"
              :key="d.id"
              :label="d.name"
              :value="d.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="考核周期">
          <el-select
            v-model="calForm.cycleId"
            clearable
            placeholder="可选，留空取最近 closed → active"
            style="width: 280px"
          >
            <el-option
              v-for="c in cycles"
              :key="c.id"
              :label="`${c.code} - ${c.name}`"
              :value="c.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="calLoading" @click="onCalibrate">
            校准
          </el-button>
        </el-form-item>
      </el-form>
      <EmptyState
        v-if="!calResult"
        description="选择部门并点击「校准」查看等级分布"
      />
      <el-table
        v-else
        :data="calResult.results"
        size="small"
        border
        class="block-table"
      >
        <el-table-column prop="deptName" label="部门" min-width="160" />
        <el-table-column prop="totalRecords" label="记录数" width="90" />
        <el-table-column
          v-for="g in GRADES"
          :key="g"
          :label="`${GRADE_LABELS[g]} 实际%`"
          width="120"
        >
          <template #default="{ row }">
            <el-progress
              :percentage="ratioPercent(row.actualRatios[g])"
              :stroke-width="10"
            />
          </template>
        </el-table-column>
        <el-table-column label="软警告" min-width="200">
          <template #default="{ row }">
            <el-tag v-if="row.warnings.length" type="warning">
              {{ getRowWarning(row) }}
            </el-tag>
            <span v-else class="hint">无</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-empty v-if="!canCalculate && !canCalibrate" description="当前角色无可用操作" />
  </div>
</template>

<style scoped>
.block {
  margin-bottom: 16px;
}
.block-title {
  font-weight: 600;
  margin-right: 12px;
}
.block-hint {
  color: #909399;
  font-size: 12px;
}
.block-table {
  margin-top: 12px;
}
.batch-summary {
  margin: 12px 0;
  display: flex;
  gap: 8px;
}
.hint {
  color: #909399;
  font-size: 12px;
}
</style>