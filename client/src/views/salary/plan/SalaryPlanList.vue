<script setup lang="ts">
/**
 * 薪酬方案列表（M5-2-C1）停用走 PATCH；employee 固定自己 employeeId
 */
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import SearchForm from '@/components/SearchForm.vue';
import EmptyState from '@/components/EmptyState.vue';
import StatusTag from '@/components/StatusTag.vue';
import FormDialog from '@/components/FormDialog.vue';
import { createPlan, deactivatePlan, listPlans } from '@/api/salaryPlan';
import { listGradeLevels, listGrades } from '@/api/salaryGrade';
import { listEmployees } from '@/api/employee';
import {
  salaryStatusLabel,
  salaryTagType,
  type CreateSalaryPlanRequest,
  type PlanStatus,
  type SalaryGrade,
  type SalaryGradeLevel,
  type SalaryPlan,
} from '@/api/types/salary';
import type { Employee } from '@/api/types/organization';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import { formatAmount, formatDate } from '@/utils/format';

const userStore = useUserStore();
const selfId = computed(() => userStore.userInfo?.employee?.id || '');
const canWrite = computed(() => hasPermission(userStore.userInfo, 'salary:plan:write'));
const canPickEmployee = computed(() => hasPermission(userStore.userInfo, 'salary:grade:read'));
const missingArchive = computed(() => !canPickEmployee.value && !selfId.value);

const loading = ref(false);
const list = ref<SalaryPlan[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const statusFilter = ref<PlanStatus | ''>('');
const employeeFilter = ref('');
const employees = ref<Employee[]>([]);
const grades = ref<SalaryGrade[]>([]);
const levels = ref<SalaryGradeLevel[]>([]);
const formVisible = ref(false);
const deactVisible = ref(false);
const submitting = ref(false);
const formRef = ref<FormInstance>();
const deactRef = ref<FormInstance>();
const deactTarget = ref<SalaryPlan | null>(null);
const form = reactive<CreateSalaryPlanRequest>({
  employeeId: '',
  gradeId: '',
  levelId: '',
  baseSalary: 0,
  performanceBase: 0,
  allowance: 0,
  welfare: '',
  effectiveFrom: '',
});
const deactForm = reactive({ effectiveTo: '', reason: '' });

const rules: FormRules<CreateSalaryPlanRequest> = {
  employeeId: [{ required: true, message: '请选择员工', trigger: 'change' }],
  gradeId: [{ required: true, message: '请选择薪级', trigger: 'change' }],
  levelId: [{ required: true, message: '请选择薪档', trigger: 'change' }],
  baseSalary: [{ required: true, message: '请填写基本工资', trigger: 'blur' }],
  performanceBase: [{ required: true, message: '请填写绩效基数', trigger: 'blur' }],
};

const deactRules: FormRules<{ effectiveTo: string }> = {
  effectiveTo: [{ required: true, message: '请选择停用日期', trigger: 'change' }],
};

function employeeName(id: string): string {
  return employees.value.find((e) => e.id === id)?.name || id;
}

function gradeName(id: string): string {
  const g = grades.value.find((item) => item.id === id);
  return g ? `${g.gradeCode} ${g.name}` : id;
}

function levelName(id: string): string {
  const fromCache = levels.value.find((item) => item.id === id);
  return fromCache ? `档 ${fromCache.level}` : id.slice(0, 8);
}

async function loadLevels(gradeId: string): Promise<void> {
  if (!gradeId) {
    levels.value = [];
    return;
  }
  const res = await listGradeLevels({ gradeId, page: 1, pageSize: 100 });
  levels.value = res.items;
}

watch(
  () => form.gradeId,
  (id) => {
    form.levelId = '';
    loadLevels(id);
  },
);

watch(
  () => form.levelId,
  (id) => {
    const lv = levels.value.find((item) => item.id === id);
    if (lv) {
      form.baseSalary = Number(lv.baseSalary);
      form.performanceBase = Number(lv.performanceBase);
    }
  },
);

async function load(): Promise<void> {
  if (missingArchive.value) {
    list.value = [];
    return;
  }
  loading.value = true;
  try {
    const res = await listPlans({
      employeeId: canPickEmployee.value
        ? employeeFilter.value || undefined
        : selfId.value || undefined,
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
  employeeFilter.value = '';
  page.value = 1;
  load();
}

function openCreate(): void {
  form.employeeId = canPickEmployee.value ? '' : selfId.value;
  form.gradeId = '';
  form.levelId = '';
  form.baseSalary = 0;
  form.performanceBase = 0;
  form.allowance = 0;
  form.welfare = '';
  form.effectiveFrom = '';
  formVisible.value = true;
}

async function onCreate(): Promise<void> {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) {
    return;
  }
  submitting.value = true;
  try {
    await createPlan({
      employeeId: form.employeeId,
      gradeId: form.gradeId,
      levelId: form.levelId,
      baseSalary: form.baseSalary,
      performanceBase: form.performanceBase,
      allowance: form.allowance || undefined,
      welfare: form.welfare || undefined,
      effectiveFrom: form.effectiveFrom || undefined,
    });
    ElMessage.success('已创建薪酬方案');
    formVisible.value = false;
    await load();
  } finally {
    submitting.value = false;
  }
}

function openDeact(row: SalaryPlan): void {
  deactTarget.value = row;
  deactForm.effectiveTo = '';
  deactForm.reason = '';
  deactVisible.value = true;
}

async function onDeact(): Promise<void> {
  if (!deactTarget.value) {
    return;
  }
  const ok = await deactRef.value?.validate().catch(() => false);
  if (!ok) {
    return;
  }
  submitting.value = true;
  try {
    await deactivatePlan(deactTarget.value.id, {
      effectiveTo: deactForm.effectiveTo,
      reason: deactForm.reason || undefined,
    });
    ElMessage.success('已停用');
    deactVisible.value = false;
    await load();
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  if (canPickEmployee.value) {
    const [empRes, gradeRes] = await Promise.all([
      listEmployees({ page: 1, pageSize: 100 }),
      listGrades({ status: 'active', page: 1, pageSize: 100 }),
    ]);
    employees.value = empRes.items;
    grades.value = gradeRes.items;
  }
  await load();
});
</script>

<template>
  <div>
    <PageHeader title="薪酬方案" :breadcrumb="[{ label: '薪酬核算' }, { label: '薪酬方案' }]">
      <template #actions>
        <el-button v-if="canWrite" type="primary" @click="openCreate">创建方案</el-button>
      </template>
    </PageHeader>
    <EmptyState v-if="missingArchive" description="尚未关联员工档案" />
    <template v-else>
      <SearchForm @search="load" @reset="onReset">
        <el-form-item v-if="canPickEmployee" label="员工">
          <el-select v-model="employeeFilter" clearable filterable style="width: 200px">
            <el-option
              v-for="e in employees"
              :key="e.id"
              :label="`${e.name} (${e.employeeNo})`"
              :value="e.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="statusFilter" clearable placeholder="全部" style="width: 130px">
            <el-option label="生效" value="active" />
            <el-option label="已停用" value="inactive" />
            <el-option label="已替代" value="superseded" />
          </el-select>
        </el-form-item>
      </SearchForm>
      <el-table v-loading="loading" :data="list" stripe>
        <el-table-column label="员工" min-width="120">
          <template #default="{ row }">{{ employeeName(row.employeeId) }}</template>
        </el-table-column>
        <el-table-column label="薪级" min-width="120">
          <template #default="{ row }">{{ gradeName(row.gradeId) }}</template>
        </el-table-column>
        <el-table-column label="薪档" width="90">
          <template #default="{ row }">{{ levelName(row.levelId) }}</template>
        </el-table-column>
        <el-table-column label="基本工资" width="120">
          <template #default="{ row }">{{ formatAmount(row.baseSalary) }}</template>
        </el-table-column>
        <el-table-column label="绩效基数" width="120">
          <template #default="{ row }">{{ formatAmount(row.performanceBase) }}</template>
        </el-table-column>
        <el-table-column label="补贴" width="100">
          <template #default="{ row }">{{ formatAmount(row.allowance) }}</template>
        </el-table-column>
        <el-table-column label="生效" width="120">
          <template #default="{ row }">{{ formatDate(row.effectiveFrom) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="130">
          <template #default="{ row }">
            <StatusTag :status="row.status" :type="salaryTagType(row.status)" />
            <span class="hint">{{ salaryStatusLabel(row.status) }}</span>
          </template>
        </el-table-column>
        <el-table-column v-if="canWrite" label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'active'"
              link
              type="danger"
              @click="openDeact(row)"
            >
              停用
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
    </template>
    <FormDialog v-model="formVisible" title="创建薪酬方案" :confirm-loading="submitting" width="560px" @confirm="onCreate">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="112px">
        <el-form-item label="员工" prop="employeeId">
          <el-select v-model="form.employeeId" filterable :disabled="!canPickEmployee" style="width: 100%">
            <el-option
              v-for="e in employees"
              :key="e.id"
              :label="`${e.name} (${e.employeeNo})`"
              :value="e.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="薪级" prop="gradeId">
          <el-select v-model="form.gradeId" filterable style="width: 100%">
            <el-option
              v-for="g in grades"
              :key="g.id"
              :label="`${g.gradeCode} ${g.name}`"
              :value="g.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="薪档" prop="levelId">
          <el-select v-model="form.levelId" :disabled="!form.gradeId" style="width: 100%">
            <el-option
              v-for="lv in levels"
              :key="lv.id"
              :label="`档 ${lv.level}`"
              :value="lv.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="基本工资" prop="baseSalary">
          <el-input-number v-model="form.baseSalary" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="绩效基数" prop="performanceBase">
          <el-input-number v-model="form.performanceBase" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="补贴">
          <el-input-number v-model="form.allowance" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="生效日">
          <el-date-picker v-model="form.effectiveFrom" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="福利说明">
          <el-input v-model="form.welfare" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
    </FormDialog>
    <FormDialog v-model="deactVisible" title="停用方案" :confirm-loading="submitting" @confirm="onDeact">
      <el-form ref="deactRef" :model="deactForm" :rules="deactRules" label-width="96px">
        <el-form-item label="停用日期" prop="effectiveTo">
          <el-date-picker v-model="deactForm.effectiveTo" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="deactForm.reason" type="textarea" :rows="2" />
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
