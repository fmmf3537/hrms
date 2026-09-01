<script setup lang="ts">
/**
 * 算薪批次列表（M5-2-C2）发起算薪；employee 无 payroll-run:read
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import SearchForm from '@/components/SearchForm.vue';
import EmptyState from '@/components/EmptyState.vue';
import FormDialog from '@/components/FormDialog.vue';
import { createPayrollRun, listPayrollRuns } from '@/api/payroll';
import { listDepartments } from '@/api/department';
import {
  payrollRunStatusLabel,
  payrollRunTagType,
  type CreatePayrollRunRequest,
  type PayrollRun,
  type PayrollRunStatus,
} from '@/api/types/payroll';
import type { Department } from '@/api/types/organization';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import { formatAmount, formatDate } from '@/utils/format';

const STATUSES: PayrollRunStatus[] = [
  'draft',
  'submitted',
  'reviewed',
  'approved',
  'locked',
  'cancelled',
];

const router = useRouter();
const userStore = useUserStore();
const canRead = computed(() => hasPermission(userStore.userInfo, 'salary:payroll-run:read'));
const canWrite = computed(() => hasPermission(userStore.userInfo, 'salary:payroll-run:write'));

const loading = ref(false);
const list = ref<PayrollRun[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const periodFilter = ref('');
const statusFilter = ref<PayrollRunStatus | ''>('');
const departments = ref<Department[]>([]);
const formVisible = ref(false);
const submitting = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<CreatePayrollRunRequest>({
  period: '',
  deptIds: [],
  remark: '',
});

const rules: FormRules<CreatePayrollRunRequest> = {
  period: [{ required: true, message: '请选择期间', trigger: 'change' }],
};

async function load(): Promise<void> {
  if (!canRead.value) {
    list.value = [];
    return;
  }
  loading.value = true;
  try {
    const res = await listPayrollRuns({
      period: periodFilter.value || undefined,
      status: statusFilter.value || undefined,
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
  periodFilter.value = '';
  statusFilter.value = '';
  page.value = 1;
  load();
}

function openCreate(): void {
  form.period = '';
  form.deptIds = [];
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
    const res = await createPayrollRun({
      period: form.period,
      deptIds: form.deptIds && form.deptIds.length > 0 ? form.deptIds : undefined,
      remark: form.remark || undefined,
    });
    ElMessage.success(`已发起算薪，共 ${res.payslipCount} 张工资单`);
    formVisible.value = false;
    router.push(`/salary/payroll-runs/${res.run.id}`);
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  if (canWrite.value) {
    departments.value = await listDepartments();
  }
  await load();
});
</script>

<template>
  <div>
    <PageHeader title="算薪管理" :breadcrumb="[{ label: '薪酬核算' }, { label: '算薪管理' }]">
      <template #actions>
        <el-button v-if="canWrite" type="primary" @click="openCreate">发起算薪</el-button>
      </template>
    </PageHeader>
    <EmptyState v-if="!canRead" description="无权查看算薪批次" />
    <template v-else>
      <SearchForm @search="load" @reset="onReset">
        <el-form-item label="期间">
          <el-date-picker v-model="periodFilter" type="month" value-format="YYYY-MM" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="statusFilter" clearable style="width: 140px">
            <el-option v-for="s in STATUSES" :key="s" :label="payrollRunStatusLabel(s)" :value="s" />
          </el-select>
        </el-form-item>
      </SearchForm>
      <el-table v-loading="loading" :data="list" stripe>
        <el-table-column prop="period" label="期间" width="110" />
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="payrollRunTagType(row.status)" size="small">
              {{ payrollRunStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="应发合计" width="130">
          <template #default="{ row }">{{ formatAmount(row.totalGross) }}</template>
        </el-table-column>
        <el-table-column label="实发合计" width="130">
          <template #default="{ row }">{{ formatAmount(row.totalNet) }}</template>
        </el-table-column>
        <el-table-column prop="anomalyCount" label="异常数" width="90" />
        <el-table-column prop="remark" label="备注" min-width="140" show-overflow-tooltip />
        <el-table-column label="创建时间" width="120">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="router.push(`/salary/payroll-runs/${row.id}`)">
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
    <FormDialog v-model="formVisible" title="发起算薪" :confirm-loading="submitting" @confirm="onCreate">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="88px">
        <el-form-item label="期间" prop="period">
          <el-date-picker v-model="form.period" type="month" value-format="YYYY-MM" style="width: 100%" />
        </el-form-item>
        <el-form-item label="部门">
          <el-select v-model="form.deptIds" multiple filterable clearable style="width: 100%">
            <el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" maxlength="2000" show-word-limit :rows="3" />
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
