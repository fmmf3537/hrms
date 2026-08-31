<script setup lang="ts">
/**
 * 转正列表（M5-2-A2）
 * @permissions admin/hr 可写；dept_head 只读本部门（后端过滤）
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
  cancelRegularization,
  createRegularization,
  listRegularizations,
} from '@/api/regularization';
import { listEmployees } from '@/api/employee';
import type {
  CreateRegularizationRequest,
  Employee,
  Regularization,
  RegularizationStatus,
} from '@/api/types/organization';
import { lifecycleStatusLabel, lifecycleTagType } from '@/api/types/organization';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import { formatDate } from '@/utils/format';

const router = useRouter();
const userStore = useUserStore();
const canWrite = computed(() => hasPermission(userStore.userInfo, 'regularization:write'));

const loading = ref(false);
const list = ref<Regularization[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const statusFilter = ref<RegularizationStatus | ''>('');
const formVisible = ref(false);
const submitting = ref(false);
const formRef = ref<FormInstance>();
const employees = ref<Employee[]>([]);
const form = reactive<CreateRegularizationRequest>({
  employeeId: '',
  selfEvaluation: '',
  managerEvaluation: '',
});

const rules: FormRules<CreateRegularizationRequest> = {
  employeeId: [{ required: true, message: '请选择员工', trigger: 'change' }],
};

async function load(): Promise<void> {
  loading.value = true;
  try {
    const res = await listRegularizations({
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
  const res = await listEmployees({ status: 'probation', page: 1, pageSize: 100 });
  employees.value = res.items;
  form.employeeId = '';
  form.selfEvaluation = '';
  form.managerEvaluation = '';
  formVisible.value = true;
}

async function onCreate(): Promise<void> {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) {
    return;
  }
  submitting.value = true;
  try {
    await createRegularization({
      employeeId: form.employeeId,
      selfEvaluation: form.selfEvaluation || undefined,
      managerEvaluation: form.managerEvaluation || undefined,
    });
    ElMessage.success('已创建转正申请');
    formVisible.value = false;
    await load();
  } finally {
    submitting.value = false;
  }
}

async function onCancel(row: Regularization): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('请输入取消原因', '取消转正', {
      inputPattern: /\S+/,
      inputErrorMessage: '原因必填',
    });
    await cancelRegularization(row.id, { reason: String(value) });
    ElMessage.success('已取消');
    await load();
  } catch {
    /* 取消对话框 */
  }
}

function empName(row: Regularization): string {
  return row.employee?.name ?? '—';
}

onMounted(load);
</script>

<template>
  <div>
    <PageHeader title="转正管理" :breadcrumb="[{ label: '组织人事' }, { label: '转正管理' }]">
      <template #actions>
        <el-button v-if="canWrite" type="primary" @click="openCreate">创建转正</el-button>
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
      <el-table-column label="员工" min-width="120">
        <template #default="{ row }">{{ empName(row) }}</template>
      </el-table-column>
      <el-table-column label="入职日" width="120">
        <template #default="{ row }">{{ formatDate(row.hireDate) }}</template>
      </el-table-column>
      <el-table-column label="试用期满" width="120">
        <template #default="{ row }">{{ formatDate(row.probationEndDate) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="140">
        <template #default="{ row }">
          <StatusTag :status="row.status" :type="lifecycleTagType(row.status)" />
          <span class="status-hint">{{ lifecycleStatusLabel(row.status) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="router.push(`/org/regularizations/${row.id}`)">
            详情
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
      title="创建转正"
      :confirm-loading="submitting"
      @confirm="onCreate"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="96px">
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
        <el-form-item label="自评">
          <el-input v-model="form.selfEvaluation" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="主管评">
          <el-input v-model="form.managerEvaluation" type="textarea" :rows="3" />
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
