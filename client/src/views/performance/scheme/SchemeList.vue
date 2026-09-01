<script setup lang="ts">
/**
 * 考核方案列表（M5-2-D1）· 消费 3 端点
 *  - POST /schemes · GET /schemes · POST /schemes/:id/clone
 *  - 动态指标行编辑器（ElSelect 选 active 指标 + weight ElInputNumber）
 *  - 权重数组 sum == 100（service 强校验，前端做实时提示）
 */
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import SearchForm from '@/components/SearchForm.vue';
import EmptyState from '@/components/EmptyState.vue';
import StatusTag from '@/components/StatusTag.vue';
import FormDialog from '@/components/FormDialog.vue';
import {
  cloneScheme,
  createScheme,
  listCycles,
  listIndicators,
  listSchemes,
} from '@/api/performance';
import {
  SCOPE_LABELS,
  SCHEME_STATUS_MAP,
  schemeStatusInfo,
  type ApplicableScope,
  type CreateSchemeRequest,
  type PerformanceCycle,
  type PerformanceIndicator,
  type PerformanceScheme,
  type SchemeIndicator,
  type SchemeStatus,
} from '@/api/types/performance';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import { formatDate } from '@/utils/format';

const SCOPES: ApplicableScope[] = ['company', 'department', 'position'];
const SCHEME_STATUSES: SchemeStatus[] = ['draft', 'active', 'archived'];

const userStore = useUserStore();
const canWrite = computed(() => hasPermission(userStore.userInfo, 'performance:scheme:write'));

const loading = ref(false);
const list = ref<PerformanceScheme[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const cycleIdFilter = ref<string>('');
const statusFilter = ref<SchemeStatus | ''>('');
const scopeFilter = ref<ApplicableScope | ''>('');

const cycles = ref<PerformanceCycle[]>([]);
const indicators = ref<PerformanceIndicator[]>([]);

const formVisible = ref(false);
const submitting = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<CreateSchemeRequest & { indicators: SchemeIndicator[] }>({
  code: '',
  name: '',
  cycleId: '',
  applicableScope: 'company',
  applicableDeptId: '',
  applicablePositionLevel: '',
  description: '',
  indicators: [{ indicatorId: '', weight: 100 }],
});

const indicatorSum = computed(() =>
  form.indicators.reduce((sum, item) => sum + Number(item.weight || 0), 0),
);

const rules: FormRules<CreateSchemeRequest> = {
  code: [{ required: true, message: '请输入方案 code', trigger: 'blur' }],
  name: [{ required: true, message: '请输入方案名称', trigger: 'blur' }],
  applicableScope: [{ required: true, message: '请选择适用范围', trigger: 'change' }],
  indicators: [
    {
      validator: (_rule, _value, cb) => {
        if (!form.indicators.length) {
          cb(new Error('至少 1 个指标'));
          return;
        }
        if (form.indicators.some((i) => !i.indicatorId)) {
          cb(new Error('请为每行选择指标'));
          return;
        }
        if (form.indicators.some((i) => i.weight <= 0 || i.weight > 100)) {
          cb(new Error('单指标权重需在 (0,100]'));
          return;
        }
        if (Math.abs(indicatorSum.value - 100) > 0.01) {
          cb(new Error('权重之和必须 = 100'));
          return;
        }
        cb();
      },
      trigger: 'change',
    },
  ],
};

async function load(): Promise<void> {
  loading.value = true;
  try {
    const res = await listSchemes({
      cycleId: cycleIdFilter.value || undefined,
      status: statusFilter.value || undefined,
      applicableScope: scopeFilter.value || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
    list.value = res.items;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

async function loadFilters(): Promise<void> {
  try {
    const [c, i] = await Promise.all([
      listCycles({ page: 1, pageSize: 100 }),
      listIndicators({ status: 'active', page: 1, pageSize: 100 }),
    ]);
    cycles.value = c.items;
    indicators.value = i.items;
  } catch {
    /* ignore */
  }
}

function onReset(): void {
  cycleIdFilter.value = '';
  statusFilter.value = '';
  scopeFilter.value = '';
  page.value = 1;
  load();
}

function addIndicatorRow(): void {
  form.indicators.push({ indicatorId: '', weight: 0 });
}

function removeIndicatorRow(idx: number): void {
  if (form.indicators.length <= 1) {
    ElMessage.warning('至少保留 1 个指标');
    return;
  }
  form.indicators.splice(idx, 1);
}

watch(
  () => form.indicators.length,
  () => {
    formRef.value?.validateField('indicators').catch(() => undefined);
  },
);

function openCreate(): void {
  form.code = '';
  form.name = '';
  form.cycleId = '';
  form.applicableScope = 'company';
  form.applicableDeptId = '';
  form.applicablePositionLevel = '';
  form.description = '';
  form.indicators = [{ indicatorId: '', weight: 100 }];
  formVisible.value = true;
}

async function onCreate(): Promise<void> {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) {
    return;
  }
  if (Math.abs(indicatorSum.value - 100) > 0.01) {
    ElMessage.warning('权重之和必须 = 100');
    return;
  }
  submitting.value = true;
  try {
    const payload: CreateSchemeRequest = {
      code: form.code,
      name: form.name,
      cycleId: form.cycleId || undefined,
      applicableScope: form.applicableScope,
      applicableDeptId: form.applicableDeptId || undefined,
      applicablePositionLevel: form.applicablePositionLevel || undefined,
      description: form.description,
      indicators: form.indicators.map((i, idx) => ({
        indicatorId: i.indicatorId,
        weight: Number(i.weight),
        sortOrder: idx,
      })),
    };
    await createScheme(payload);
    ElMessage.success('已创建方案');
    formVisible.value = false;
    await load();
  } finally {
    submitting.value = false;
  }
}

// 克隆
const cloneVisible = ref(false);
const cloningId = ref<string | null>(null);
const cloneForm = reactive({ newCode: '', newName: '' });
const cloning = ref(false);

function openClone(row: PerformanceScheme): void {
  cloningId.value = row.id;
  cloneForm.newCode = `${row.code}_COPY`;
  cloneForm.newName = `${row.name}（副本）`;
  cloneVisible.value = true;
}

async function onClone(): Promise<void> {
  if (!cloningId.value) {
    return;
  }
  if (!cloneForm.newCode.trim() || !cloneForm.newName.trim()) {
    ElMessage.warning('请填写新 code 与名称');
    return;
  }
  cloning.value = true;
  try {
    await cloneScheme(cloningId.value, {
      newCode: cloneForm.newCode.trim(),
      newName: cloneForm.newName.trim(),
    });
    ElMessage.success('已克隆方案');
    cloneVisible.value = false;
    await load();
  } finally {
    cloning.value = false;
  }
}

onMounted(async () => {
  await loadFilters();
  await load();
});
</script>

<template>
  <div>
    <PageHeader
      title="考核方案"
      :breadcrumb="[{ label: '绩效管理' }, { label: '考核方案' }]"
    >
      <template #actions>
        <el-button v-if="canWrite" type="primary" @click="openCreate">
          新建方案
        </el-button>
      </template>
    </PageHeader>
    <SearchForm @search="load" @reset="onReset">
      <el-form-item label="考核周期">
        <el-select
          v-model="cycleIdFilter"
          clearable
          placeholder="全部"
          style="width: 180px"
        >
          <el-option
            v-for="c in cycles"
            :key="c.id"
            :label="`${c.code} · ${c.name}`"
            :value="c.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="statusFilter" clearable placeholder="全部" style="width: 130px">
          <el-option
            v-for="s in SCHEME_STATUSES"
            :key="s"
            :label="SCHEME_STATUS_MAP[s].label"
            :value="s"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="适用范围">
        <el-select v-model="scopeFilter" clearable placeholder="全部" style="width: 130px">
          <el-option
            v-for="s in SCOPES"
            :key="s"
            :label="SCOPE_LABELS[s]"
            :value="s"
          />
        </el-select>
      </el-form-item>
    </SearchForm>
    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column prop="code" label="方案 code" width="130" />
      <el-table-column prop="name" label="名称" min-width="160" />
      <el-table-column label="适用范围" width="110">
        <template #default="{ row }">
          {{ SCOPE_LABELS[row.applicableScope as ApplicableScope] || row.applicableScope }}
        </template>
      </el-table-column>
      <el-table-column label="关联周期" min-width="160">
        <template #default="{ row }">
          <span v-if="row.cycleId">
            {{ cycles.find((c) => c.id === row.cycleId)?.name || row.cycleId }}
          </span>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column label="指标数" width="90">
        <template #default="{ row }">{{ row.indicators?.length ?? 0 }}</template>
      </el-table-column>
      <el-table-column label="状态" width="120">
        <template #default="{ row }">
          <StatusTag :status="row.status" :type="schemeStatusInfo(row.status).type" />
          <span class="hint">{{ schemeStatusInfo(row.status).label }}</span>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="140">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button v-if="canWrite" link type="primary" @click="openClone(row)">
            克隆
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <EmptyState v-if="!loading && list.length === 0" />
    <div class="pager">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        background
        @current-change="load"
        @size-change="load"
      />
    </div>

    <FormDialog
      v-model="formVisible"
      title="新建考核方案"
      :confirm-loading="submitting"
      width="640px"
      @confirm="onCreate"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="方案 code" prop="code">
          <el-input v-model="form.code" placeholder="如 SCHEME_2026Q1" />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="如 2026 Q1 销售方案" />
        </el-form-item>
        <el-form-item label="考核周期">
          <el-select v-model="form.cycleId" clearable placeholder="不指定" style="width: 100%">
            <el-option
              v-for="c in cycles"
              :key="c.id"
              :label="`${c.code} · ${c.name}`"
              :value="c.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="适用范围" prop="applicableScope">
          <el-radio-group v-model="form.applicableScope">
            <el-radio v-for="s in SCOPES" :key="s" :value="s">
              {{ SCOPE_LABELS[s] }}
            </el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item
          v-if="form.applicableScope === 'department'"
          label="适用部门"
        >
          <el-input
            v-model="form.applicableDeptId"
            placeholder="部门 ID（uuid）"
          />
        </el-form-item>
        <el-form-item
          v-if="form.applicableScope === 'position'"
          label="岗位级别"
        >
          <el-input
            v-model="form.applicablePositionLevel"
            placeholder="如 T3 / M2"
          />
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="2"
            maxlength="2000"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="指标与权重" prop="indicators">
          <div class="indicator-editor">
            <div
              v-for="(row, idx) in form.indicators"
              :key="idx"
              class="indicator-editor__row"
            >
              <el-select
                v-model="row.indicatorId"
                placeholder="选择指标"
                filterable
                style="flex: 1; margin-right: 8px"
              >
                <el-option
                  v-for="i in indicators"
                  :key="i.id"
                  :label="`${i.code} · ${i.name}`"
                  :value="i.id"
                />
              </el-select>
              <el-input-number
                v-model="row.weight"
                :min="0.01"
                :max="100"
                :precision="2"
                style="width: 140px; margin-right: 8px"
              />
              <el-button
                link
                type="danger"
                :disabled="form.indicators.length <= 1"
                @click="removeIndicatorRow(idx)"
              >
                删除
              </el-button>
            </div>
            <div class="indicator-editor__footer">
              <el-button link type="primary" @click="addIndicatorRow">
                + 添加指标
              </el-button>
              <span
                class="indicator-editor__sum"
                :class="{ 'is-error': Math.abs(indicatorSum - 100) > 0.01 }"
              >
                合计权重：{{ indicatorSum.toFixed(2) }}
              </span>
            </div>
          </div>
        </el-form-item>
      </el-form>
    </FormDialog>

    <FormDialog
      v-model="cloneVisible"
      title="克隆方案"
      :confirm-loading="cloning"
      width="480px"
      @confirm="onClone"
    >
      <el-form label-width="100px">
        <el-form-item label="新 code" required>
          <el-input v-model="cloneForm.newCode" placeholder="新方案 code" />
        </el-form-item>
        <el-form-item label="新名称" required>
          <el-input v-model="cloneForm.newName" placeholder="新方案名称" />
        </el-form-item>
      </el-form>
    </FormDialog>
  </div>
</template>

<style scoped>
.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
.hint {
  margin-left: 6px;
  color: #909399;
  font-size: 12px;
}
.indicator-editor__row {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}
.indicator-editor__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  color: #909399;
  font-size: 12px;
}
.indicator-editor__sum.is-error {
  color: #f56c6c;
  font-weight: 600;
}
</style>
