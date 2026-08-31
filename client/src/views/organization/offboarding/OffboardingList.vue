<script setup lang="ts">
/**
 * 离职列表（M5-2-A2）
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import SearchForm from '@/components/SearchForm.vue';
import EmptyState from '@/components/EmptyState.vue';
import StatusTag from '@/components/StatusTag.vue';
import FormDialog from '@/components/FormDialog.vue';
import {
  cancelOffboarding,
  confirmHandover,
  createOffboarding,
  issueCertificate,
  listOffboardings,
} from '@/api/offboarding';
import { listEmployees } from '@/api/employee';
import type {
  CreateOffboardingRequest,
  Employee,
  Offboarding,
  OffboardingStatus,
} from '@/api/types/organization';
import { lifecycleStatusLabel, lifecycleTagType } from '@/api/types/organization';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import { formatDate } from '@/utils/format';

const TYPE_LABEL: Record<string, string> = {
  employee_initiated: '员工主动',
  company_initiated: '公司辞退',
};

const router = useRouter();
const userStore = useUserStore();
const canWrite = computed(() => hasPermission(userStore.userInfo, 'offboarding:write'));
const canCert = computed(() => hasPermission(userStore.userInfo, 'offboarding:certificate'));

const loading = ref(false);
const list = ref<Offboarding[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const statusFilter = ref<OffboardingStatus | ''>('');
const formVisible = ref(false);
const submitting = ref(false);
const formRef = ref<FormInstance>();
const employees = ref<Employee[]>([]);
const form = reactive<CreateOffboardingRequest>({
  employeeId: '',
  resignationType: 'employee_initiated',
  lastWorkingDate: '',
  reason: '',
});

const rules: FormRules<CreateOffboardingRequest> = {
  employeeId: [{ required: true, message: '请选择员工', trigger: 'change' }],
  resignationType: [{ required: true, message: '请选择类型', trigger: 'change' }],
  lastWorkingDate: [{ required: true, message: '请选择最后工作日', trigger: 'change' }],
};

async function load(): Promise<void> {
  loading.value = true;
  try {
    const res = await listOffboardings({
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
  statusFilter.value = '';
  page.value = 1;
  load();
}

async function openCreate(): Promise<void> {
  const res = await listEmployees({ page: 1, pageSize: 100 });
  employees.value = res.items;
  form.employeeId = '';
  form.resignationType = 'employee_initiated';
  form.lastWorkingDate = '';
  form.reason = '';
  formVisible.value = true;
}

async function onCreate(): Promise<void> {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) {
    return;
  }
  submitting.value = true;
  try {
    await createOffboarding({
      employeeId: form.employeeId,
      resignationType: form.resignationType,
      lastWorkingDate: form.lastWorkingDate,
      reason: form.reason || undefined,
    });
    ElMessage.success('已创建离职单');
    formVisible.value = false;
    await load();
  } finally {
    submitting.value = false;
  }
}

async function onHandover(row: Offboarding): Promise<void> {
  try {
    await ElMessageBox.confirm(`确认员工「${row.employee?.name || row.employeeId}」工作交接完成？`, '确认交接', {
      type: 'warning',
    });
    await confirmHandover(row.id);
    ElMessage.success('已确认交接');
    await load();
  } catch {
    /* 取消 */
  }
}

async function onCancel(row: Offboarding): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('请输入取消原因', '取消离职', {
      inputPattern: /\S+/,
      inputErrorMessage: '原因必填',
    });
    await cancelOffboarding(row.id, { reason: String(value) });
    ElMessage.success('已取消');
    await load();
  } catch {
    /* 取消 */
  }
}

async function onIssue(row: Offboarding): Promise<void> {
  try {
    await ElMessageBox.confirm('发放离职证明？（mock PDF，真实版留二期）', '发放证明', { type: 'warning' });
    await issueCertificate(row.id);
    ElMessage.success('已发放');
    router.push(`/org/offboarding/${row.id}/certificate`);
  } catch {
    /* 取消 */
  }
}

onMounted(load);
</script>

<template>
  <div>
    <PageHeader title="离职管理" :breadcrumb="[{ label: '组织人事' }, { label: '离职管理' }]">
      <template #actions>
        <el-button v-if="canWrite" type="primary" @click="openCreate">创建离职</el-button>
      </template>
    </PageHeader>
    <SearchForm @search="load" @reset="onReset">
      <el-form-item label="状态">
        <el-select v-model="statusFilter" clearable placeholder="全部" style="width: 160px">
          <el-option label="草稿" value="draft" />
          <el-option label="待交接" value="handover_pending" />
          <el-option label="已提交" value="submitted" />
          <el-option label="已通过" value="approved" />
          <el-option label="已发证明" value="certificate_issued" />
          <el-option label="已驳回" value="rejected" />
          <el-option label="已取消" value="cancelled" />
        </el-select>
      </el-form-item>
    </SearchForm>
    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column label="员工" min-width="110">
        <template #default="{ row }">{{ row.employee?.name || '—' }}</template>
      </el-table-column>
      <el-table-column label="类型" width="110">
        <template #default="{ row }">{{ TYPE_LABEL[row.resignationType] || row.resignationType }}</template>
      </el-table-column>
      <el-table-column label="最后工作日" width="120">
        <template #default="{ row }">{{ formatDate(row.lastWorkingDate) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="150">
        <template #default="{ row }">
          <StatusTag :status="row.status" :type="lifecycleTagType(row.status)" />
          <span class="status-hint">{{ lifecycleStatusLabel(row.status) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="router.push(`/org/offboarding/${row.id}`)">
            详情
          </el-button>
          <el-button
            v-if="canWrite && !row.handoverCompleted && row.status !== 'cancelled'"
            link
            type="primary"
            @click="onHandover(row)"
          >
            确认交接
          </el-button>
          <el-button
            v-if="canCert && row.status === 'approved'"
            link
            type="success"
            @click="onIssue(row)"
          >
            发放证明
          </el-button>
          <el-button
            v-if="row.certificateIssued"
            link
            type="primary"
            @click="router.push(`/org/offboarding/${row.id}/certificate`)"
          >
            证明
          </el-button>
          <el-button
            v-if="canWrite && (row.status === 'draft' || row.status === 'handover_pending')"
            link
            type="danger"
            @click="onCancel(row)"
          >
            取消
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
      title="创建离职"
      :confirm-loading="submitting"
      @confirm="onCreate"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="112px">
        <el-form-item label="员工" prop="employeeId">
          <el-select v-model="form.employeeId" filterable style="width: 100%">
            <el-option
              v-for="e in employees"
              :key="e.id"
              :label="`${e.name} (${e.employeeNo})`"
              :value="e.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="离职类型" prop="resignationType">
          <el-select v-model="form.resignationType" style="width: 100%">
            <el-option label="员工主动" value="employee_initiated" />
            <el-option label="公司辞退" value="company_initiated" />
          </el-select>
        </el-form-item>
        <el-form-item label="最后工作日" prop="lastWorkingDate">
          <el-date-picker
            v-model="form.lastWorkingDate"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="form.reason" type="textarea" :rows="3" />
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
.status-hint {
  margin-left: 6px;
  color: #909399;
  font-size: 12px;
}
</style>
