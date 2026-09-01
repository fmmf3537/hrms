<script setup lang="ts">
/**
 * 调薪列表（M5-2-C3）read 全量 / read-self 本人；write 新建；execute 批量执行
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import SearchForm from '@/components/SearchForm.vue';
import EmptyState from '@/components/EmptyState.vue';
import FormDialog from '@/components/FormDialog.vue';
import {
  createAdjustment,
  executePendingAdjustments,
  listAdjustments,
} from '@/api/adjustment';
import { listEmployees } from '@/api/employee';
import {
  ADJUSTMENT_TYPE_LABELS,
  adjustmentStatusLabel,
  adjustmentTagType,
  type Adjustment,
  type AdjustmentStatus,
  type AdjustmentType,
  type CreateAdjustmentRequest,
} from '@/api/types/compensation';
import type { Employee } from '@/api/types/organization';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import { formatAmount, formatDate } from '@/utils/format';

const TYPES: AdjustmentType[] = [
  'promotion',
  'annual_adjust',
  'performance',
  'market_adjustment',
];
const STATUSES: AdjustmentStatus[] = [
  'draft',
  'pending',
  'approved',
  'rejected',
  'executed',
  'cancelled',
];

const router = useRouter();
const userStore = useUserStore();
const canReadAll = computed(() => hasPermission(userStore.userInfo, 'salary:adjustment:read'));
const canReadSelf = computed(() => hasPermission(userStore.userInfo, 'salary:adjustment:read-self'));
const canAccess = computed(() => canReadAll.value || canReadSelf.value);
const selfMode = computed(() => !canReadAll.value && canReadSelf.value);
const selfId = computed(() => userStore.userInfo?.employee?.id || '');
const missingArchive = computed(() => selfMode.value && !selfId.value);
const canWrite = computed(() => hasPermission(userStore.userInfo, 'salary:adjustment:write'));
const canExecute = computed(() => hasPermission(userStore.userInfo, 'salary:adjustment:execute'));
const pageTitle = computed(() => (selfMode.value ? '我的调薪' : '调薪管理'));

const loading = ref(false);
const list = ref<Adjustment[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const employeeFilter = ref('');
const statusFilter = ref<AdjustmentStatus | ''>('');
const typeFilter = ref<AdjustmentType | ''>('');
const employees = ref<Employee[]>([]);
const formVisible = ref(false);
const batchVisible = ref(false);
const submitting = ref(false);
const formRef = ref<FormInstance>();
const batchRef = ref<FormInstance>();
const form = reactive<CreateAdjustmentRequest>({
  employeeId: '',
  adjustmentType: 'annual_adjust',
  toBaseSalary: 1,
  toPerformanceSalary: undefined,
  effectiveDate: '',
  reason: '',
  remark: '',
});
const batchForm = reactive({ asOfDate: '' });

const rules: FormRules<CreateAdjustmentRequest> = {
  employeeId: [{ required: true, message: '请选择员工', trigger: 'change' }],
  adjustmentType: [{ required: true, message: '请选择类型', trigger: 'change' }],
  toBaseSalary: [{ required: true, message: '请填写调整后基本工资', trigger: 'blur' }],
  effectiveDate: [{ required: true, message: '请选择生效日期', trigger: 'change' }],
  reason: [{ required: true, message: '请填写原因', trigger: 'blur' }],
};
const batchRules: FormRules<{ asOfDate: string }> = {
  asOfDate: [{ required: true, message: '请选择截止日期', trigger: 'change' }],
};

function typeLabel(t: string): string {
  return ADJUSTMENT_TYPE_LABELS[t as AdjustmentType] ?? t;
}

function employeeName(id: string): string {
  if (selfMode.value && id === selfId.value) {
    return userStore.userInfo?.employee?.name || id;
  }
  return employees.value.find((e) => e.id === id)?.name || id;
}

async function load(): Promise<void> {
  if (!canAccess.value || missingArchive.value) {
    list.value = [];
    return;
  }
  loading.value = true;
  try {
    const res = await listAdjustments({
      employeeId: selfMode.value ? selfId.value : employeeFilter.value || undefined,
      status: statusFilter.value || undefined,
      adjustmentType: typeFilter.value || undefined,
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
  employeeFilter.value = '';
  statusFilter.value = '';
  typeFilter.value = '';
  page.value = 1;
  load();
}

function openCreate(): void {
  form.employeeId = '';
  form.adjustmentType = 'annual_adjust';
  form.toBaseSalary = 1;
  form.toPerformanceSalary = undefined;
  form.effectiveDate = '';
  form.reason = '';
  form.remark = '';
  formVisible.value = true;
}

async function onCreate(): Promise<void> {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) {
    return;
  }
  submitting.value = true;
  try {
    const rec = await createAdjustment({
      employeeId: form.employeeId,
      adjustmentType: form.adjustmentType,
      toBaseSalary: Number(form.toBaseSalary),
      toPerformanceSalary:
        form.toPerformanceSalary == null ? undefined : Number(form.toPerformanceSalary),
      effectiveDate: form.effectiveDate,
      reason: form.reason,
      remark: form.remark || undefined,
    });
    ElMessage.success('已创建调薪单');
    formVisible.value = false;
    router.push(`/salary/adjustments/${rec.id}`);
  } finally {
    submitting.value = false;
  }
}

async function onBatch(): Promise<void> {
  const ok = await batchRef.value?.validate().catch(() => false);
  if (!ok) {
    return;
  }
  submitting.value = true;
  try {
    const res = await executePendingAdjustments(batchForm.asOfDate);
    ElMessage.success(`批量执行完成：成功 ${res.successCount} / ${res.totalCount}`);
    batchVisible.value = false;
    await load();
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  if (canReadAll.value) {
    const res = await listEmployees({ page: 1, pageSize: 100 });
    employees.value = res.items;
  }
  await load();
});
</script>

<template>
  <div>
    <PageHeader
      :title="pageTitle"
      :breadcrumb="[{ label: '薪酬核算' }, { label: pageTitle }]"
    >
      <template #actions>
        <el-button v-if="canWrite" type="primary" @click="openCreate">新建调薪</el-button>
        <el-button v-if="canExecute" @click="batchVisible = true">批量执行</el-button>
      </template>
    </PageHeader>
    <EmptyState v-if="!canAccess" description="无权查看调薪" />
    <EmptyState v-else-if="missingArchive" description="尚未关联员工档案" />
    <template v-else>
      <SearchForm @search="load" @reset="onReset">
        <el-form-item v-if="!selfMode" label="员工">
          <el-select v-model="employeeFilter" clearable filterable style="width: 200px">
            <el-option v-for="e in employees" :key="e.id" :label="e.name" :value="e.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="typeFilter" clearable style="width: 150px">
            <el-option v-for="t in TYPES" :key="t" :label="typeLabel(t)" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="statusFilter" clearable style="width: 130px">
            <el-option v-for="s in STATUSES" :key="s" :label="adjustmentStatusLabel(s)" :value="s" />
          </el-select>
        </el-form-item>
      </SearchForm>
      <el-table v-loading="loading" :data="list" stripe>
        <el-table-column label="员工" min-width="140">
          <template #default="{ row }">{{ employeeName(row.employeeId) }}</template>
        </el-table-column>
        <el-table-column label="类型" width="120">
          <template #default="{ row }">{{ typeLabel(row.adjustmentType) }}</template>
        </el-table-column>
        <el-table-column label="调整后基本工资" width="150">
          <template #default="{ row }">{{ formatAmount(row.toBaseSalary) }}</template>
        </el-table-column>
        <el-table-column label="生效日期" width="120">
          <template #default="{ row }">{{ formatDate(row.effectiveDate) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="adjustmentTagType(row.status)" size="small">
              {{ adjustmentStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="router.push(`/salary/adjustments/${row.id}`)">
              查看
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        class="pager"
        layout="total, prev, pager, next"
        :total="total"
        @current-change="load"
      />
    </template>
    <FormDialog v-model="formVisible" title="新建调薪" :confirm-loading="submitting" @confirm="onCreate">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="128px">
        <el-form-item label="员工" prop="employeeId">
          <el-select v-model="form.employeeId" filterable style="width: 100%">
            <el-option v-for="e in employees" :key="e.id" :label="e.name" :value="e.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型" prop="adjustmentType">
          <el-select v-model="form.adjustmentType" style="width: 100%">
            <el-option v-for="t in TYPES" :key="t" :label="typeLabel(t)" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="调整后基本工资" prop="toBaseSalary">
          <el-input-number v-model="form.toBaseSalary" :min="0.01" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="调整后绩效工资">
          <el-input-number v-model="form.toPerformanceSalary" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="生效日期" prop="effectiveDate">
          <el-date-picker
            v-model="form.effectiveDate"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="原因" prop="reason">
          <el-input v-model="form.reason" type="textarea" maxlength="2000" show-word-limit :rows="3" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" maxlength="2000" show-word-limit :rows="2" />
        </el-form-item>
      </el-form>
    </FormDialog>
    <FormDialog v-model="batchVisible" title="批量执行到期调薪" :confirm-loading="submitting" @confirm="onBatch">
      <el-form ref="batchRef" :model="batchForm" :rules="batchRules" label-width="108px">
        <el-form-item label="截止日期" prop="asOfDate">
          <el-date-picker
            v-model="batchForm.asOfDate"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
    </FormDialog>
  </div>
</template>

<style scoped>
.pager {
  margin-top: 12px;
  justify-content: flex-end;
}
</style>
