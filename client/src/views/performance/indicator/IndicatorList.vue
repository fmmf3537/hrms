<script setup lang="ts">
/**
 * 指标库列表（M5-2-D1）· 消费 2 端点
 *  - POST /indicators · GET /indicators
 *  - **没有 PATCH /indicators/:id**（无编辑入口）
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import SearchForm from '@/components/SearchForm.vue';
import EmptyState from '@/components/EmptyState.vue';
import StatusTag from '@/components/StatusTag.vue';
import FormDialog from '@/components/FormDialog.vue';
import { createIndicator, listIndicators } from '@/api/performance';
import {
  INDICATOR_STATUS_MAP,
  INDICATOR_TYPE_LABELS,
  indicatorStatusInfo,
  type CreateIndicatorRequest,
  type IndicatorStatus,
  type IndicatorType,
  type PerformanceIndicator,
} from '@/api/types/performance';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';

const INDICATOR_TYPES: IndicatorType[] = ['KPI', 'OKR', 'BSC', '360'];
const INDICATOR_STATUSES: IndicatorStatus[] = ['active', 'archived'];

const userStore = useUserStore();
const canWrite = computed(() => hasPermission(userStore.userInfo, 'performance:indicator:write'));

const loading = ref(false);
const list = ref<PerformanceIndicator[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const typeFilter = ref<IndicatorType | ''>('');
const statusFilter = ref<IndicatorStatus | ''>('');
const categoryFilter = ref<string>('');

const detailVisible = ref(false);
const detailRow = ref<PerformanceIndicator | null>(null);

const formVisible = ref(false);
const submitting = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<CreateIndicatorRequest>({
  code: '',
  name: '',
  type: 'KPI',
  category: '',
  description: '',
  defaultWeight: 10,
  target: '',
  unit: '',
  scoringRule: '',
});

const rules: FormRules<CreateIndicatorRequest> = {
  code: [{ required: true, message: '请输入指标 code', trigger: 'blur' }],
  name: [{ required: true, message: '请输入指标名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择类型', trigger: 'change' }],
};

async function load(): Promise<void> {
  loading.value = true;
  try {
    const res = await listIndicators({
      type: typeFilter.value || undefined,
      status: statusFilter.value || undefined,
      category: categoryFilter.value || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
    list.value = res.items;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

function onReset(): void {
  typeFilter.value = '';
  statusFilter.value = '';
  categoryFilter.value = '';
  page.value = 1;
  load();
}

function openCreate(): void {
  form.code = '';
  form.name = '';
  form.type = 'KPI';
  form.category = '';
  form.description = '';
  form.defaultWeight = 10;
  form.target = '';
  form.unit = '';
  form.scoringRule = '';
  formVisible.value = true;
}

function openDetail(row: PerformanceIndicator): void {
  detailRow.value = row;
  detailVisible.value = true;
}

async function onCreate(): Promise<void> {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) {
    return;
  }
  submitting.value = true;
  try {
    await createIndicator({ ...form });
    ElMessage.success('已创建指标');
    formVisible.value = false;
    await load();
  } finally {
    submitting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <PageHeader title="指标库" :breadcrumb="[{ label: '绩效管理' }, { label: '指标库' }]">
      <template #actions>
        <el-button v-if="canWrite" type="primary" @click="openCreate">
          新建指标
        </el-button>
      </template>
    </PageHeader>
    <SearchForm @search="load" @reset="onReset">
      <el-form-item label="类型">
        <el-select
          v-model="typeFilter"
          clearable
          placeholder="全部"
          style="width: 130px"
        >
          <el-option
            v-for="t in INDICATOR_TYPES"
            :key="t"
            :label="INDICATOR_TYPE_LABELS[t]"
            :value="t"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="statusFilter" clearable placeholder="全部" style="width: 130px">
          <el-option
            v-for="s in INDICATOR_STATUSES"
            :key="s"
            :label="INDICATOR_STATUS_MAP[s].label"
            :value="s"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="类别">
        <el-input
          v-model="categoryFilter"
          placeholder="如 财务/客户/流程"
          clearable
          style="width: 160px"
        />
      </el-form-item>
    </SearchForm>
    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column prop="code" label="指标 code" width="130" />
      <el-table-column prop="name" label="名称" min-width="160" />
      <el-table-column label="类型" width="100">
        <template #default="{ row }">
          {{ INDICATOR_TYPE_LABELS[row.type as IndicatorType] || row.type }}
        </template>
      </el-table-column>
      <el-table-column prop="category" label="类别" width="120">
        <template #default="{ row }">{{ row.category || '—' }}</template>
      </el-table-column>
      <el-table-column label="默认权重" width="100">
        <template #default="{ row }">{{ row.defaultWeight ?? '—' }}</template>
      </el-table-column>
      <el-table-column label="单位" width="100">
        <template #default="{ row }">{{ row.unit || '—' }}</template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <StatusTag :status="row.status" :type="indicatorStatusInfo(row.status).type" />
          <span class="hint">{{ indicatorStatusInfo(row.status).label }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row)">查看</el-button>
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
      title="新建指标"
      :confirm-loading="submitting"
      width="560px"
      @confirm="onCreate"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="指标 code" prop="code">
          <el-input v-model="form.code" placeholder="如 SALES_LEAD" />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="如 销售线索数" />
        </el-form-item>
        <el-form-item label="类型" prop="type">
          <el-radio-group v-model="form.type">
            <el-radio v-for="t in INDICATOR_TYPES" :key="t" :value="t">
              {{ INDICATOR_TYPE_LABELS[t] }}
            </el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="类别">
          <el-input v-model="form.category" placeholder="如 财务/客户/流程" />
        </el-form-item>
        <el-form-item label="默认权重">
          <el-input-number
            v-model="form.defaultWeight"
            :min="0.01"
            :max="100"
            :precision="2"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="单位">
          <el-input v-model="form.unit" placeholder="如 元/个/%/次" />
        </el-form-item>
        <el-form-item label="目标">
          <el-input v-model="form.target" placeholder="如 月度 100 条" />
        </el-form-item>
        <el-form-item label="评分规则">
          <el-input
            v-model="form.scoringRule"
            type="textarea"
            :rows="3"
            maxlength="2000"
            show-word-limit
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
      </el-form>
    </FormDialog>
    <el-dialog
      v-model="detailVisible"
      :title="detailRow?.name || '指标详情'"
      width="560px"
    >
      <el-descriptions v-if="detailRow" :column="1" border>
        <el-descriptions-item label="指标 code">
          {{ detailRow.code }}
        </el-descriptions-item>
        <el-descriptions-item label="名称">
          {{ detailRow.name }}
        </el-descriptions-item>
        <el-descriptions-item label="类型">
          {{ INDICATOR_TYPE_LABELS[detailRow.type as IndicatorType] || detailRow.type }}
        </el-descriptions-item>
        <el-descriptions-item label="类别">
          {{ detailRow.category || '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="默认权重">
          {{ detailRow.defaultWeight ?? '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="单位">
          {{ detailRow.unit || '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="目标">
          {{ detailRow.target || '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="评分规则">
          {{ detailRow.scoringRule || '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="描述">
          {{ detailRow.description || '—' }}
        </el-descriptions-item>
      </el-descriptions>
    </el-dialog>
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
</style>
