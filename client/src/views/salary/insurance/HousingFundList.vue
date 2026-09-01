<script setup lang="ts">
/**
 * 公积金方案列表（M5-2-C1）无险种列；比例页面用百分比
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import SearchForm from '@/components/SearchForm.vue';
import EmptyState from '@/components/EmptyState.vue';
import StatusTag from '@/components/StatusTag.vue';
import FormDialog from '@/components/FormDialog.vue';
import {
  createHousingFundScheme,
  listHousingFundSchemes,
  updateHousingFundScheme,
} from '@/api/insurance';
import {
  CITY_LABELS,
  formatRatePercent,
  percentToRate,
  rateToPercent,
  salaryStatusLabel,
  salaryTagType,
  type CityCode,
  type CreateHousingFundRequest,
  type GradeStatus,
  type HousingFundScheme,
} from '@/api/types/salary';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import { formatAmount } from '@/utils/format';

const CITIES: CityCode[] = ['xi_an', 'bei_jing', 'si_chuan'];

const userStore = useUserStore();
const canWrite = computed(() => hasPermission(userStore.userInfo, 'salary:housing-fund:write'));

const loading = ref(false);
const list = ref<HousingFundScheme[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const cityFilter = ref<CityCode | ''>('');
const statusFilter = ref<GradeStatus | ''>('');
const formVisible = ref(false);
const submitting = ref(false);
const editingId = ref<string | null>(null);
const formRef = ref<FormInstance>();
const form = reactive({
  city: 'xi_an' as CityCode,
  companyPercent: 0,
  personalPercent: 0,
  baseMin: 0,
  baseMax: 0,
});

const rules: FormRules<typeof form> = {
  city: [{ required: true, message: '请选择城市', trigger: 'change' }],
  companyPercent: [{ required: true, message: '请填写单位比例', trigger: 'blur' }],
  personalPercent: [{ required: true, message: '请填写个人比例', trigger: 'blur' }],
  baseMin: [{ required: true, message: '请填写基数下限', trigger: 'blur' }],
  baseMax: [{ required: true, message: '请填写基数上限', trigger: 'blur' }],
};

async function load(): Promise<void> {
  loading.value = true;
  try {
    const res = await listHousingFundSchemes({
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
  page.value = 1;
  load();
}

function openCreate(): void {
  editingId.value = null;
  form.city = 'xi_an';
  form.companyPercent = 0;
  form.personalPercent = 0;
  form.baseMin = 0;
  form.baseMax = 0;
  formVisible.value = true;
}

function openEdit(row: HousingFundScheme): void {
  editingId.value = row.id;
  form.city = row.city as CityCode;
  form.companyPercent = rateToPercent(row.companyRate);
  form.personalPercent = rateToPercent(row.personalRate);
  form.baseMin = Number(row.baseMin);
  form.baseMax = Number(row.baseMax);
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
    const payload: CreateHousingFundRequest = {
      city: form.city,
      companyRate: percentToRate(form.companyPercent),
      personalRate: percentToRate(form.personalPercent),
      baseMin: form.baseMin,
      baseMax: form.baseMax,
    };
    if (editingId.value) {
      await updateHousingFundScheme(editingId.value, {
        companyRate: payload.companyRate,
        personalRate: payload.personalRate,
        baseMin: payload.baseMin,
        baseMax: payload.baseMax,
      });
      ElMessage.success('已更新');
    } else {
      await createHousingFundScheme(payload);
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
    <PageHeader title="公积金方案" :breadcrumb="[{ label: '薪酬核算' }, { label: '公积金方案' }]">
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
      <el-form-item label="状态">
        <el-select v-model="statusFilter" clearable style="width: 120px">
          <el-option label="生效" value="active" />
          <el-option label="已归档" value="archived" />
        </el-select>
      </el-form-item>
    </SearchForm>
    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column label="城市" width="100">
        <template #default="{ row }">{{ CITY_LABELS[row.city as CityCode] || row.city }}</template>
      </el-table-column>
      <el-table-column label="单位比例" width="110">
        <template #default="{ row }">{{ formatRatePercent(row.companyRate) }}</template>
      </el-table-column>
      <el-table-column label="个人比例" width="110">
        <template #default="{ row }">{{ formatRatePercent(row.personalRate) }}</template>
      </el-table-column>
      <el-table-column label="基数下限" width="130">
        <template #default="{ row }">{{ formatAmount(row.baseMin) }}</template>
      </el-table-column>
      <el-table-column label="基数上限" width="130">
        <template #default="{ row }">{{ formatAmount(row.baseMax) }}</template>
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
    <FormDialog
      v-model="formVisible"
      :title="editingId ? '编辑公积金方案' : '创建公积金方案'"
      :confirm-loading="submitting"
      @confirm="onSubmit"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="112px">
        <el-form-item label="城市" prop="city">
          <el-select v-model="form.city" :disabled="Boolean(editingId)" style="width: 100%">
            <el-option v-for="c in CITIES" :key="c" :label="CITY_LABELS[c]" :value="c" />
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
