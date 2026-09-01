<script setup lang="ts">
/**
 * 考核周期列表（M5-2-D1）· 消费 3 端点
 *  - POST /cycles  · PATCH /cycles/:id（含 status 流转）· GET /cycles
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import SearchForm from '@/components/SearchForm.vue';
import EmptyState from '@/components/EmptyState.vue';
import FormDialog from '@/components/FormDialog.vue';
import {
  createCycle,
  listCycles,
  updateCycle,
} from '@/api/performance';
import {
  CYCLE_STATUS_MAP,
  CYCLE_TYPE_LABELS,
  cycleStatusInfo,
  type CreateCycleRequest,
  type CycleStatus,
  type CycleType,
  type PerformanceCycle,
  type UpdateCycleRequest,
} from '@/api/types/performance';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import { formatDate } from '@/utils/format';

const CYCLE_TYPES: CycleType[] = ['monthly', 'quarterly', 'yearly'];
const CYCLE_STATUSES: CycleStatus[] = ['draft', 'active', 'closed'];

const userStore = useUserStore();
const canWrite = computed(() => hasPermission(userStore.userInfo, 'performance:cycle:write'));

const loading = ref(false);
const list = ref<PerformanceCycle[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const typeFilter = ref<CycleType | ''>('');
const statusFilter = ref<CycleStatus | ''>('');
const yearFilter = ref<number | null>(null);

const formVisible = ref(false);
const editingId = ref<string | null>(null);
const submitting = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<CreateCycleRequest>({
  code: '',
  name: '',
  type: 'monthly',
  startDate: '',
  endDate: '',
  description: '',
});

const rules: FormRules<CreateCycleRequest> = {
  code: [{ required: true, message: '请输入周期 code', trigger: 'blur' }],
  name: [{ required: true, message: '请输入周期名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择周期类型', trigger: 'change' }],
  startDate: [{ required: true, message: '请选择开始日期', trigger: 'change' }],
  endDate: [{ required: true, message: '请选择结束日期', trigger: 'change' }],
};

async function load(): Promise<void> {
  loading.value = true;
  try {
    const res = await listCycles({
      type: typeFilter.value || undefined,
      status: statusFilter.value || undefined,
      year: yearFilter.value ?? undefined,
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
  yearFilter.value = null;
  page.value = 1;
  load();
}

function openCreate(): void {
  editingId.value = null;
  form.code = '';
  form.name = '';
  form.type = 'monthly';
  form.startDate = '';
  form.endDate = '';
  form.description = '';
  formVisible.value = true;
}

function openEdit(row: PerformanceCycle): void {
  editingId.value = row.id;
  form.code = row.code;
  form.name = row.name;
  form.type = (row.type as CycleType) ?? 'monthly';
  form.startDate = row.startDate?.slice(0, 10) ?? '';
  form.endDate = row.endDate?.slice(0, 10) ?? '';
  form.description = row.description ?? '';
  formVisible.value = true;
}

async function onSubmit(): Promise<void> {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) {
    return;
  }
  if (form.startDate >= form.endDate) {
    ElMessage.warning('结束日期必须晚于开始日期');
    return;
  }
  submitting.value = true;
  try {
    if (editingId.value) {
      // 仅提交变化的字段；status 流转走同一端点
      const body: UpdateCycleRequest = {
        code: form.code,
        name: form.name,
        startDate: form.startDate,
        endDate: form.endDate,
        description: form.description,
      };
      await updateCycle(editingId.value, body);
      ElMessage.success('已更新周期');
    } else {
      await createCycle({ ...form });
      ElMessage.success('已创建周期');
    }
    formVisible.value = false;
    await load();
  } finally {
    submitting.value = false;
  }
}

async function onChangeStatus(row: PerformanceCycle, status: CycleStatus): Promise<void> {
  try {
    await updateCycle(row.id, { status });
    ElMessage.success('状态已变更');
    await load();
  } catch {
    /* 拦截器已 toast */
  }
}

onMounted(load);
</script>

<template>
  <div>
    <PageHeader
      title="考核周期"
      :breadcrumb="[{ label: '绩效管理' }, { label: '考核周期' }]"
    >
      <template #actions>
        <el-button v-if="canWrite" type="primary" @click="openCreate">
          新建周期
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
            v-for="t in CYCLE_TYPES"
            :key="t"
            :label="CYCLE_TYPE_LABELS[t]"
            :value="t"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select
          v-model="statusFilter"
          clearable
          placeholder="全部"
          style="width: 130px"
        >
          <el-option
            v-for="s in CYCLE_STATUSES"
            :key="s"
            :label="CYCLE_STATUS_MAP[s].label"
            :value="s"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="年份">
        <el-input-number
          v-model="yearFilter"
          :min="2000"
          :max="2100"
          placeholder="如 2026"
          style="width: 130px"
          clearable
        />
      </el-form-item>
    </SearchForm>
    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column prop="code" label="周期 code" width="120" />
      <el-table-column prop="name" label="名称" min-width="160" />
      <el-table-column label="类型" width="100">
        <template #default="{ row }">
          {{ CYCLE_TYPE_LABELS[row.type as CycleType] || row.type }}
        </template>
      </el-table-column>
      <el-table-column label="开始" width="120">
        <template #default="{ row }">{{ formatDate(row.startDate) }}</template>
      </el-table-column>
      <el-table-column label="结束" width="120">
        <template #default="{ row }">{{ formatDate(row.endDate) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="220">
        <template #default="{ row }">
          <el-tag :type="cycleStatusInfo(row.status).type">
            {{ cycleStatusInfo(row.status).label }}
          </el-tag>
          <el-select
            v-if="canWrite && row.status !== 'closed'"
            :model-value="row.status"
            size="small"
            class="status-select"
            @change="(v: CycleStatus) => onChangeStatus(row, v)"
          >
            <el-option
              v-for="s in CYCLE_STATUSES"
              :key="s"
              :label="CYCLE_STATUS_MAP[s].label"
              :value="s"
              :disabled="s === 'closed' && row.status !== 'active'"
            />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="canWrite && row.status !== 'closed'"
            link
            type="primary"
            @click="openEdit(row)"
          >
            编辑
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
      :title="editingId ? '编辑周期' : '新建周期'"
      :confirm-loading="submitting"
      width="560px"
      @confirm="onSubmit"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="周期 code" prop="code">
          <el-input v-model="form.code" :disabled="Boolean(editingId)" placeholder="如 2026Q1" />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="如 2026 Q1 季度考核" />
        </el-form-item>
        <el-form-item label="类型" prop="type">
          <el-radio-group v-model="form.type">
            <el-radio
              v-for="t in CYCLE_TYPES"
              :key="t"
              :value="t"
            >
              {{ CYCLE_TYPE_LABELS[t] }}
            </el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="开始日期" prop="startDate">
          <el-date-picker
            v-model="form.startDate"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="结束日期" prop="endDate">
          <el-date-picker
            v-model="form.endDate"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            maxlength="2000"
            show-word-limit
          />
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
.status-select {
  margin-left: 8px;
  width: 110px;
}
</style>
