<script setup lang="ts">
/**
 * 社保方案列表（M5-2-C1）比例页面用百分比，提交 ÷100
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import SearchForm from '@/components/SearchForm.vue';
import EmptyState from '@/components/EmptyState.vue';
import StatusTag from '@/components/StatusTag.vue';
import FormDialog from '@/components/FormDialog.vue';
import { createSocialScheme, listSocialSchemes, updateSocialScheme } from '@/api/insurance';
import {
  CITY_LABELS,
  INSURANCE_TYPE_LABELS,
  formatRatePercent,
  percentToRate,
  rateToPercent,
  salaryStatusLabel,
  salaryTagType,
  type CityCode,
  type CreateSocialSchemeRequest,
  type GradeStatus,
  type InsuranceType,
  type SocialInsuranceScheme,
} from '@/api/types/salary';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import { formatAmount } from '@/utils/format';

const CITIES: CityCode[] = ['xi_an', 'bei_jing', 'si_chuan'];
const TYPES: InsuranceType[] = [
  'pension',
  'medical',
  'unemployment',
  'work_injury',
  'maternity',
];

const userStore = useUserStore();
const canWrite = computed(() => hasPermission(userStore.userInfo, 'salary:insurance:write'));

const loading = ref(false);
const list = ref<SocialInsuranceScheme[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const cityFilter = ref<CityCode | ''>('');
const typeFilter = ref<InsuranceType | ''>('');
const statusFilter = ref<GradeStatus | ''>('');
const formVisible = ref(false);
const submitting = ref(false);
const editingId = ref<string | null>(null);
const formRef = ref<FormInstance>();
const form = reactive({
  city: 'xi_an' as CityCode,
  insuranceType: 'pension' as InsuranceType,
  companyPercent: 0,
  personalPercent: 0,
  baseMin: 0,
  baseMax: 0,
  baseAdjustmentMonth: 7,
});

const rules: FormRules<typeof form> = {
  city: [{ required: true, message: '请选择城市', trigger: 'change' }],
  insuranceType: [{ required: true, message: '请选择险种', trigger: 'change' }],
  companyPercent: [{ required: true, message: '请填写单位比例', trigger: 'blur' }],
  personalPercent: [{ required: true, message: '请填写个人比例', trigger: 'blur' }],
  baseMin: [{ required: true, message: '请填写基数下限', trigger: 'blur' }],
  baseMax: [{ required: true, message: '请填写基数上限', trigger: 'blur' }],
};

async function load(): Promise<void> {
  loading.value = true;
  try {
    const res = await listSocialSchemes({
      city: cityFilter.value || undefined,
      insuranceType: typeFilter.value || undefined,
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
  typeFilter.value = '';
  statusFilter.value = '';
  page.value = 1;
  load();
}

function openCreate(): void {
  editingId.value = null;
  form.city = 'xi_an';
  form.insuranceType = 'pension';
  form.companyPercent = 0;
  form.personalPercent = 0;
  form.baseMin = 0;
  form.baseMax = 0;
  form.baseAdjustmentMonth = 7;
  formVisible.value = true;
}

function openEdit(row: SocialInsuranceScheme): void {
  editingId.value = row.id;
  form.city = row.city as CityCode;
  form.insuranceType = row.insuranceType as InsuranceType;
  form.companyPercent = rateToPercent(row.companyRate);
  form.personalPercent = rateToPercent(row.personalRate);
  form.baseMin = Number(row.baseMin);
  form.baseMax = Number(row.baseMax);
  form.baseAdjustmentMonth = row.baseAdjustmentMonth;
  formVisible.value = true;
}

async function onSubmit(): Promise<void> {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) {
    return;
  }
  if (form.baseMin >= form.baseMax) {
    ElMessage.warning('基数下限须 < 上限');
    return;
  }
  submitting.value = true;
  try {
    const payload: CreateSocialSchemeRequest = {
      city: form.city,
      insuranceType: form.insuranceType,
      companyRate: percentToRate(form.companyPercent),
      personalRate: percentToRate(form.personalPercent),
      baseMin: form.baseMin,
      baseMax: form.baseMax,
      baseAdjustmentMonth: form.baseAdjustmentMonth,
    };
    if (editingId.value) {
      await updateSocialScheme(editingId.value, {
        companyRate: payload.companyRate,
        personalRate: payload.personalRate,
        baseMin: payload.baseMin,
        baseMax: payload.baseMax,
        baseAdjustmentMonth: payload.baseAdjustmentMonth,
      });
      ElMessage.success('已更新');
    } else {
      await createSocialScheme(payload);
      ElMessage.success('已创建');
    }
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
    <PageHeader title="社保方案" :breadcrumb="[{ label: '薪酬核算' }, { label: '社保方案' }]">
      <template #actions>
        <el-button v-if="canWrite" type="primary" @click="openCreate">创建方案</el-button>
      </template>
    </PageHeader>
    <SearchForm @search="load" @reset="onReset">
      <el-form-item label="城市">
        <el-select v-model="cityFilter" clearable style="width: 120px">
          <el-option v-for="c in CITIES" :key="c" :label="CITY_LABELS[c]" :value="c" />
        </el-select>
      </el-form-item>
      <el-form-item label="险种">
        <el-select v-model="typeFilter" clearable style="width: 120px">
          <el-option v-for="t in TYPES" :key="t" :label="INSURANCE_TYPE_LABELS[t]" :value="t" />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="statusFilter" clearable style="width: 120px">
          <el-option label="生效" value="active" />
          <el-option label="已归档" value="archived" />
        </el-select>
      </el-form-item>
    </SearchForm>
    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column label="城市" width="90">
        <template #default="{ row }">{{ CITY_LABELS[row.city as CityCode] || row.city }}</template>
      </el-table-column>
      <el-table-column label="险种" width="90">
        <template #default="{ row }">
          {{ INSURANCE_TYPE_LABELS[row.insuranceType as InsuranceType] || row.insuranceType }}
        </template>
      </el-table-column>
      <el-table-column label="单位比例" width="100">
        <template #default="{ row }">{{ formatRatePercent(row.companyRate) }}</template>
      </el-table-column>
      <el-table-column label="个人比例" width="100">
        <template #default="{ row }">{{ formatRatePercent(row.personalRate) }}</template>
      </el-table-column>
      <el-table-column label="基数下限" width="120">
        <template #default="{ row }">{{ formatAmount(row.baseMin) }}</template>
      </el-table-column>
      <el-table-column label="基数上限" width="120">
        <template #default="{ row }">{{ formatAmount(row.baseMax) }}</template>
      </el-table-column>
      <el-table-column prop="baseAdjustmentMonth" label="调基月" width="80" />
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
    <FormDialog
      v-model="formVisible"
      :title="editingId ? '编辑社保方案' : '创建社保方案'"
      :confirm-loading="submitting"
      width="560px"
      @confirm="onSubmit"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="112px">
        <el-form-item label="城市" prop="city">
          <el-select v-model="form.city" :disabled="Boolean(editingId)" style="width: 100%">
            <el-option v-for="c in CITIES" :key="c" :label="CITY_LABELS[c]" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="险种" prop="insuranceType">
          <el-select v-model="form.insuranceType" :disabled="Boolean(editingId)" style="width: 100%">
            <el-option v-for="t in TYPES" :key="t" :label="INSURANCE_TYPE_LABELS[t]" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="单位比例%" prop="companyPercent">
          <el-input-number v-model="form.companyPercent" :min="0" :max="100" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="个人比例%" prop="personalPercent">
          <el-input-number v-model="form.personalPercent" :min="0" :max="100" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="基数下限" prop="baseMin">
          <el-input-number v-model="form.baseMin" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="基数上限" prop="baseMax">
          <el-input-number v-model="form.baseMax" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="调基月">
          <el-input-number v-model="form.baseAdjustmentMonth" :min="1" :max="12" />
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
