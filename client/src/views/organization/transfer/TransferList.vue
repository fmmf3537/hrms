<script setup lang="ts">
/**
 * 调动列表（M5-2-A2）
 */
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import SearchForm from '@/components/SearchForm.vue';
import EmptyState from '@/components/EmptyState.vue';
import StatusTag from '@/components/StatusTag.vue';
import FormDialog from '@/components/FormDialog.vue';
import { cancelTransfer, createTransfer, listTransfers, updateTransfer } from '@/api/transfer';
import { listEmployees } from '@/api/employee';
import { listCompanies } from '@/api/company';
import { listDepartments } from '@/api/department';
import type {
  Company,
  CreateTransferRequest,
  Department,
  Employee,
  Transfer,
  TransferStatus,
  TransferType,
  UpdateTransferRequest,
} from '@/api/types/organization';
import { lifecycleStatusLabel, lifecycleTagType } from '@/api/types/organization';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import { formatDate } from '@/utils/format';

const TYPE_LABEL: Record<string, string> = {
  transfer: '平调',
  promote: '晋升',
  demote: '降职',
};

const router = useRouter();
const userStore = useUserStore();
const canWrite = computed(() => hasPermission(userStore.userInfo, 'transfer:write'));

const loading = ref(false);
const list = ref<Transfer[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const statusFilter = ref<TransferStatus | ''>('');
const formVisible = ref(false);
const submitting = ref(false);
const editing = ref<Transfer | null>(null);
const formRef = ref<FormInstance>();
const employees = ref<Employee[]>([]);
const companies = ref<Company[]>([]);
const departments = ref<Department[]>([]);
const form = reactive<CreateTransferRequest>({
  employeeId: '',
  transferType: 'transfer',
  toCompanyId: '',
  toDeptId: '',
  toPosition: '',
  effectiveDate: '',
  reason: '',
});

const rules: FormRules<CreateTransferRequest> = {
  employeeId: [{ required: true, message: '请选择员工', trigger: 'change' }],
  transferType: [{ required: true, message: '请选择类型', trigger: 'change' }],
  toCompanyId: [{ required: true, message: '请选择目标公司', trigger: 'change' }],
  toDeptId: [{ required: true, message: '请选择目标部门', trigger: 'change' }],
  toPosition: [{ required: true, message: '请填写目标岗位', trigger: 'blur' }],
  effectiveDate: [{ required: true, message: '请选择生效日', trigger: 'change' }],
};

async function loadDepts(cid: string): Promise<void> {
  if (!cid) {
    departments.value = [];
    return;
  }
  departments.value = await listDepartments({ companyId: cid });
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const res = await listTransfers({
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
  editing.value = null;
  const [empRes, coRes] = await Promise.all([
    listEmployees({ page: 1, pageSize: 100 }),
    listCompanies({ page: 1, pageSize: 100 }),
  ]);
  employees.value = empRes.items;
  companies.value = coRes.items;
  form.employeeId = '';
  form.transferType = 'transfer';
  form.toCompanyId = companies.value[0]?.id ?? '';
  form.toDeptId = '';
  form.toPosition = '';
  form.effectiveDate = '';
  form.reason = '';
  await loadDepts(form.toCompanyId);
  formVisible.value = true;
}

async function openEdit(row: Transfer): Promise<void> {
  editing.value = row;
  const coRes = await listCompanies({ page: 1, pageSize: 100 });
  companies.value = coRes.items;
  form.employeeId = row.employeeId;
  form.transferType = (row.transferType as TransferType) || 'transfer';
  form.toCompanyId = row.toCompanyId;
  form.toDeptId = row.toDeptId;
  form.toPosition = row.toPosition;
  form.effectiveDate = row.effectiveDate?.slice(0, 10) ?? '';
  form.reason = row.reason ?? '';
  await loadDepts(form.toCompanyId);
  formVisible.value = true;
}

async function onSubmit(): Promise<void> {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) {
    return;
  }
  submitting.value = true;
  try {
    if (editing.value) {
      const patch: UpdateTransferRequest = {
        transferType: form.transferType,
        toCompanyId: form.toCompanyId,
        toDeptId: form.toDeptId,
        toPosition: form.toPosition,
        effectiveDate: form.effectiveDate,
        reason: form.reason,
      };
      await updateTransfer(editing.value.id, patch);
      ElMessage.success('已更新');
    } else {
      await createTransfer({ ...form, reason: form.reason || undefined });
      ElMessage.success('已创建调动');
    }
    formVisible.value = false;
    await load();
  } finally {
    submitting.value = false;
  }
}

async function onCancel(row: Transfer): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('请输入取消原因', '取消调动', {
      inputPattern: /\S+/,
      inputErrorMessage: '原因必填',
    });
    await cancelTransfer(row.id, { reason: String(value) });
    ElMessage.success('已取消');
    await load();
  } catch {
    /* 取消 */
  }
}

watch(
  () => form.toCompanyId,
  (cid) => {
    if (formVisible.value) {
      loadDepts(cid);
    }
  },
);

onMounted(load);
</script>

<template>
  <div>
    <PageHeader title="调动管理" :breadcrumb="[{ label: '组织人事' }, { label: '调动管理' }]">
      <template #actions>
        <el-button v-if="canWrite" type="primary" @click="openCreate">创建调动</el-button>
      </template>
    </PageHeader>
    <SearchForm @search="load" @reset="onReset">
      <el-form-item label="状态">
        <el-select v-model="statusFilter" clearable placeholder="全部" style="width: 140px">
          <el-option label="草稿" value="draft" />
          <el-option label="已提交" value="submitted" />
          <el-option label="已通过" value="approved" />
          <el-option label="已驳回" value="rejected" />
          <el-option label="已取消" value="cancelled" />
        </el-select>
      </el-form-item>
    </SearchForm>
    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column label="员工" min-width="110">
        <template #default="{ row }">{{ row.employee?.name || '—' }}</template>
      </el-table-column>
      <el-table-column label="类型" width="90">
        <template #default="{ row }">{{ TYPE_LABEL[row.transferType] || row.transferType }}</template>
      </el-table-column>
      <el-table-column label="目标岗位" min-width="120" prop="toPosition" />
      <el-table-column label="生效日" width="120">
        <template #default="{ row }">{{ formatDate(row.effectiveDate) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="140">
        <template #default="{ row }">
          <StatusTag :status="row.status" :type="lifecycleTagType(row.status)" />
          <span class="status-hint">{{ lifecycleStatusLabel(row.status) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="router.push(`/org/transfers/${row.id}`)">
            详情
          </el-button>
          <el-button
            v-if="canWrite && row.status === 'draft'"
            link
            type="primary"
            @click="openEdit(row)"
          >
            编辑
          </el-button>
          <el-button
            v-if="canWrite && (row.status === 'draft' || row.status === 'submitted')"
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
      :title="editing ? '编辑调动' : '创建调动'"
      :confirm-loading="submitting"
      width="560px"
      @confirm="onSubmit"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="96px">
        <el-form-item v-if="!editing" label="员工" prop="employeeId">
          <el-select v-model="form.employeeId" filterable style="width: 100%">
            <el-option
              v-for="e in employees"
              :key="e.id"
              :label="`${e.name} (${e.employeeNo})`"
              :value="e.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="类型" prop="transferType">
          <el-select v-model="form.transferType" style="width: 100%">
            <el-option label="平调" value="transfer" />
            <el-option label="晋升" value="promote" />
            <el-option label="降职" value="demote" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标公司" prop="toCompanyId">
          <el-select v-model="form.toCompanyId" style="width: 100%">
            <el-option v-for="c in companies" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标部门" prop="toDeptId">
          <el-select v-model="form.toDeptId" style="width: 100%">
            <el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标岗位" prop="toPosition">
          <el-input v-model="form.toPosition" />
        </el-form-item>
        <el-form-item label="生效日" prop="effectiveDate">
          <el-date-picker
            v-model="form.effectiveDate"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="form.reason" type="textarea" :rows="2" />
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
