<script setup lang="ts">
/**
 * 班次列表（M5-2-B）
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import SearchForm from '@/components/SearchForm.vue';
import EmptyState from '@/components/EmptyState.vue';
import StatusTag from '@/components/StatusTag.vue';
import FormDialog from '@/components/FormDialog.vue';
import { createShift, listShifts } from '@/api/shift';
import { listCompanies } from '@/api/company';
import type { CreateShiftRequest, Shift, ShiftStatus, ShiftType } from '@/api/types/attendance';
import { attendanceStatusLabel, attendanceTagType } from '@/api/types/attendance';
import type { Company as OrgCompany } from '@/api/types/organization';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';

const TYPE_LABEL: Record<string, string> = {
  standard: '标准工时',
  comprehensive: '综合工时',
  flexible: '弹性工时',
};

const router = useRouter();
const userStore = useUserStore();
const canWrite = computed(() => hasPermission(userStore.userInfo, 'shift:write'));
const canAssign = computed(() => hasPermission(userStore.userInfo, 'shift:assign'));

const loading = ref(false);
const list = ref<Shift[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const statusFilter = ref<ShiftStatus | ''>('');
const typeFilter = ref<ShiftType | ''>('');
const companyId = ref('');
const companies = ref<OrgCompany[]>([]);
const formVisible = ref(false);
const submitting = ref(false);
const formRef = ref<FormInstance>();
const form = ref<CreateShiftRequest>({
  code: '',
  name: '',
  shiftType: 'standard',
  startTime: '09:00',
  endTime: '18:00',
  workHours: 8,
  companyId: '',
  effectiveFrom: '',
});

const rules: FormRules<CreateShiftRequest> = {
  code: [{ required: true, message: '请输入编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  companyId: [{ required: true, message: '请选择公司', trigger: 'change' }],
  startTime: [{ required: true, message: '请输入上班时间', trigger: 'blur' }],
  endTime: [{ required: true, message: '请输入下班时间', trigger: 'blur' }],
  workHours: [{ required: true, message: '请填写工时', trigger: 'blur' }],
  effectiveFrom: [{ required: true, message: '请选择生效日', trigger: 'change' }],
};

async function load(): Promise<void> {
  loading.value = true;
  try {
    const res = await listShifts({
      companyId: companyId.value || undefined,
      shiftType: typeFilter.value || undefined,
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
  typeFilter.value = '';
  companyId.value = '';
  page.value = 1;
  load();
}

async function openCreate(): Promise<void> {
  form.value = {
    code: '',
    name: '',
    shiftType: 'standard',
    startTime: '09:00',
    endTime: '18:00',
    workHours: 8,
    companyId: companies.value[0]?.id ?? '',
    effectiveFrom: '',
  };
  formVisible.value = true;
}

async function onCreate(): Promise<void> {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) {
    return;
  }
  submitting.value = true;
  try {
    await createShift({ ...form.value });
    ElMessage.success('已创建班次');
    formVisible.value = false;
    await load();
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  const res = await listCompanies({ page: 1, pageSize: 100 });
  companies.value = res.items;
  await load();
});
</script>

<template>
  <div>
    <PageHeader title="班次管理" :breadcrumb="[{ label: '考勤假勤' }, { label: '班次管理' }]">
      <template #actions>
        <el-button v-if="canWrite" type="primary" @click="openCreate">创建班次</el-button>
      </template>
    </PageHeader>
    <SearchForm @search="load" @reset="onReset">
      <el-form-item label="公司">
        <el-select v-model="companyId" clearable placeholder="全部" style="width: 180px">
          <el-option v-for="c in companies" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="类型">
        <el-select v-model="typeFilter" clearable placeholder="全部" style="width: 140px">
          <el-option label="标准工时" value="standard" />
          <el-option label="综合工时" value="comprehensive" />
          <el-option label="弹性工时" value="flexible" />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="statusFilter" clearable placeholder="全部" style="width: 120px">
          <el-option label="草稿" value="draft" />
          <el-option label="生效" value="active" />
          <el-option label="已归档" value="archived" />
        </el-select>
      </el-form-item>
    </SearchForm>
    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column prop="code" label="编码" width="120" />
      <el-table-column prop="name" label="名称" min-width="140" />
      <el-table-column label="类型" width="110">
        <template #default="{ row }">{{ TYPE_LABEL[row.shiftType] || row.shiftType }}</template>
      </el-table-column>
      <el-table-column label="上下班" width="140">
        <template #default="{ row }">{{ row.startTime }} - {{ row.endTime }}</template>
      </el-table-column>
      <el-table-column prop="workHours" label="工时" width="80" />
      <el-table-column label="状态" width="130">
        <template #default="{ row }">
          <StatusTag :status="row.status" :type="attendanceTagType(row.status)" />
          <span class="hint">{{ attendanceStatusLabel(row.status) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="router.push(`/attendance/shifts/${row.id}`)">
            详情
          </el-button>
          <el-button
            v-if="canAssign && row.status === 'active'"
            link
            type="primary"
            @click="router.push(`/attendance/shifts/${row.id}/assign`)"
          >
            排班
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
    <FormDialog v-model="formVisible" title="创建班次" :confirm-loading="submitting" width="560px" @confirm="onCreate">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="96px">
        <el-form-item label="编码" prop="code"><el-input v-model="form.code" /></el-form-item>
        <el-form-item label="名称" prop="name"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="公司" prop="companyId">
          <el-select v-model="form.companyId" style="width: 100%">
            <el-option v-for="c in companies" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型" prop="shiftType">
          <el-select v-model="form.shiftType" style="width: 100%">
            <el-option label="标准工时" value="standard" />
            <el-option label="综合工时" value="comprehensive" />
            <el-option label="弹性工时" value="flexible" />
          </el-select>
        </el-form-item>
        <el-form-item label="上班" prop="startTime">
          <el-time-picker v-model="form.startTime" value-format="HH:mm" format="HH:mm" style="width: 100%" />
        </el-form-item>
        <el-form-item label="下班" prop="endTime">
          <el-time-picker v-model="form.endTime" value-format="HH:mm" format="HH:mm" style="width: 100%" />
        </el-form-item>
        <el-form-item label="工时" prop="workHours">
          <el-input-number v-model="form.workHours" :min="0" :max="24" :precision="1" />
        </el-form-item>
        <el-form-item label="生效日" prop="effectiveFrom">
          <el-date-picker v-model="form.effectiveFrom" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
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
</style>
