<script setup lang="ts">
/**
 * 员工参保登记（M5-2-C1）选城市后才可选方案；employee 固定自己
 */
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import SearchForm from '@/components/SearchForm.vue';
import EmptyState from '@/components/EmptyState.vue';
import StatusTag from '@/components/StatusTag.vue';
import FormDialog from '@/components/FormDialog.vue';
import {
  createEmployeeInsurance,
  listEmployeeInsurances,
  listHousingFundSchemes,
  listSocialSchemes,
  updateEmployeeInsurance,
} from '@/api/insurance';
import { listEmployees } from '@/api/employee';
import {
  CITY_LABELS,
  INSURANCE_TYPE_LABELS,
  salaryStatusLabel,
  salaryTagType,
  type CityCode,
  type CreateEmployeeInsuranceRequest,
  type EmployeeInsuranceRegistration,
  type HousingFundScheme,
  type InsuranceType,
  type RegistrationStatus,
  type SocialInsuranceScheme,
} from '@/api/types/salary';
import type { Employee } from '@/api/types/organization';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import { formatAmount, formatDate } from '@/utils/format';

const CITIES: CityCode[] = ['xi_an', 'bei_jing', 'si_chuan'];

const userStore = useUserStore();
const selfId = computed(() => userStore.userInfo?.employee?.id || '');
const canWrite = computed(() => hasPermission(userStore.userInfo, 'salary:insurance:write'));
const canPickEmployee = computed(() => hasPermission(userStore.userInfo, 'salary:grade:read'));
const missingArchive = computed(() => !canPickEmployee.value && !selfId.value);

const loading = ref(false);
const list = ref<EmployeeInsuranceRegistration[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const cityFilter = ref<CityCode | ''>('');
const statusFilter = ref<RegistrationStatus | ''>('');
const employeeFilter = ref('');
const employees = ref<Employee[]>([]);
const socials = ref<SocialInsuranceScheme[]>([]);
const funds = ref<HousingFundScheme[]>([]);
const formVisible = ref(false);
const editVisible = ref(false);
const submitting = ref(false);
const formRef = ref<FormInstance>();
const editRef = ref<FormInstance>();
const editing = ref<EmployeeInsuranceRegistration | null>(null);
const form = reactive<CreateEmployeeInsuranceRequest>({
  employeeId: '',
  city: 'xi_an',
  socialInsuranceSchemeId: '',
  housingFundSchemeId: '',
  baseSalary: undefined,
  effectiveFrom: '',
});
const editForm = reactive({ effectiveTo: '', baseSalary: 0 });

const rules: FormRules<CreateEmployeeInsuranceRequest> = {
  employeeId: [{ required: true, message: '请选择员工', trigger: 'change' }],
  city: [{ required: true, message: '请选择城市', trigger: 'change' }],
};

async function loadSchemes(city: CityCode): Promise<void> {
  const [s, f] = await Promise.all([
    listSocialSchemes({ city, status: 'active', page: 1, pageSize: 100 }),
    listHousingFundSchemes({ city, status: 'active', page: 1, pageSize: 100 }),
  ]);
  socials.value = s.items;
  funds.value = f.items;
}

watch(
  () => form.city,
  (city) => {
    form.socialInsuranceSchemeId = '';
    form.housingFundSchemeId = '';
    if (city && canWrite.value) {
      loadSchemes(city);
    } else {
      socials.value = [];
      funds.value = [];
    }
  },
);

function employeeName(id: string): string {
  return employees.value.find((e) => e.id === id)?.name || id;
}

function socialLabel(id: string | null | undefined): string {
  if (!id) {
    return '—';
  }
  const row = socials.value.find((s) => s.id === id);
  if (!row) {
    return id.slice(0, 8);
  }
  return INSURANCE_TYPE_LABELS[row.insuranceType as InsuranceType] || row.insuranceType;
}

async function load(): Promise<void> {
  if (missingArchive.value) {
    list.value = [];
    return;
  }
  loading.value = true;
  try {
    const res = await listEmployeeInsurances({
      employeeId: canPickEmployee.value
        ? employeeFilter.value || undefined
        : selfId.value || undefined,
      city: cityFilter.value || undefined,
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
  cityFilter.value = '';
  statusFilter.value = '';
  employeeFilter.value = '';
  page.value = 1;
  load();
}

function openCreate(): void {
  form.employeeId = canPickEmployee.value ? '' : selfId.value;
  form.city = 'xi_an';
  form.socialInsuranceSchemeId = '';
  form.housingFundSchemeId = '';
  form.baseSalary = undefined;
  form.effectiveFrom = '';
  formVisible.value = true;
  loadSchemes(form.city);
}

async function onCreate(): Promise<void> {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) {
    return;
  }
  submitting.value = true;
  try {
    await createEmployeeInsurance({
      employeeId: form.employeeId,
      city: form.city,
      socialInsuranceSchemeId: form.socialInsuranceSchemeId || undefined,
      housingFundSchemeId: form.housingFundSchemeId || undefined,
      baseSalary: form.baseSalary,
      effectiveFrom: form.effectiveFrom || undefined,
    });
    ElMessage.success('已登记');
    formVisible.value = false;
    await load();
  } finally {
    submitting.value = false;
  }
}

function openEdit(row: EmployeeInsuranceRegistration): void {
  editing.value = row;
  editForm.effectiveTo = '';
  editForm.baseSalary = Number(row.baseSalary);
  editVisible.value = true;
}

async function onEdit(): Promise<void> {
  if (!editing.value) {
    return;
  }
  submitting.value = true;
  try {
    await updateEmployeeInsurance(editing.value.id, {
      effectiveTo: editForm.effectiveTo || undefined,
      baseSalary: editForm.baseSalary || undefined,
    });
    ElMessage.success('已更新');
    editVisible.value = false;
    await load();
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  if (canPickEmployee.value) {
    const empRes = await listEmployees({ page: 1, pageSize: 100 });
    employees.value = empRes.items;
  }
  await load();
});
</script>

<template>
  <div>
    <PageHeader title="参保登记" :breadcrumb="[{ label: '薪酬核算' }, { label: '参保登记' }]">
      <template #actions>
        <el-button v-if="canWrite" type="primary" @click="openCreate">登记参保</el-button>
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
        <el-form-item label="城市">
          <el-select v-model="cityFilter" clearable style="width: 120px">
            <el-option v-for="c in CITIES" :key="c" :label="CITY_LABELS[c]" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="statusFilter" clearable style="width: 120px">
            <el-option label="生效" value="active" />
            <el-option label="已停用" value="inactive" />
          </el-select>
        </el-form-item>
      </SearchForm>
      <el-table v-loading="loading" :data="list" stripe>
        <el-table-column label="员工" min-width="120">
          <template #default="{ row }">{{ employeeName(row.employeeId) }}</template>
        </el-table-column>
        <el-table-column label="城市" width="90">
          <template #default="{ row }">{{ CITY_LABELS[row.city as CityCode] || row.city }}</template>
        </el-table-column>
        <el-table-column label="社保方案" min-width="110">
          <template #default="{ row }">{{ socialLabel(row.socialInsuranceSchemeId) }}</template>
        </el-table-column>
        <el-table-column label="缴费基数" width="120">
          <template #default="{ row }">{{ formatAmount(row.baseSalary) }}</template>
        </el-table-column>
        <el-table-column label="生效" width="120">
          <template #default="{ row }">{{ formatDate(row.effectiveFrom) }}</template>
        </el-table-column>
        <el-table-column label="失效" width="120">
          <template #default="{ row }">{{ formatDate(row.effectiveTo) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="130">
          <template #default="{ row }">
            <StatusTag :status="row.status" :type="salaryTagType(row.status)" />
            <span class="hint">{{ salaryStatusLabel(row.status) }}</span>
          </template>
        </el-table-column>
        <el-table-column v-if="canWrite" label="操作" width="80" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'active'" link type="primary" @click="openEdit(row)">
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
    </template>
    <FormDialog v-model="formVisible" title="登记参保" :confirm-loading="submitting" width="560px" @confirm="onCreate">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="120px">
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
        <el-form-item label="城市" prop="city">
          <el-select v-model="form.city" style="width: 100%">
            <el-option v-for="c in CITIES" :key="c" :label="CITY_LABELS[c]" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="社保方案">
          <el-select
            v-model="form.socialInsuranceSchemeId"
            clearable
            :disabled="!form.city"
            style="width: 100%"
          >
            <el-option
              v-for="s in socials"
              :key="s.id"
              :label="INSURANCE_TYPE_LABELS[s.insuranceType as InsuranceType]"
              :value="s.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="公积金方案">
          <el-select
            v-model="form.housingFundSchemeId"
            clearable
            :disabled="!form.city"
            style="width: 100%"
          >
            <el-option v-for="f in funds" :key="f.id" :label="CITY_LABELS[f.city as CityCode]" :value="f.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="缴费基数">
          <el-input-number v-model="form.baseSalary" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="生效日">
          <el-date-picker v-model="form.effectiveFrom" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
      </el-form>
    </FormDialog>
    <FormDialog v-model="editVisible" title="更新登记" :confirm-loading="submitting" @confirm="onEdit">
      <el-form ref="editRef" :model="editForm" label-width="96px">
        <el-form-item label="缴费基数">
          <el-input-number v-model="editForm.baseSalary" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="失效日">
          <el-date-picker v-model="editForm.effectiveTo" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
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
