<script setup lang="ts">
/**
 * 个税计算工具（M5-2-C1）4 tab；年终奖固定 isAnnual: true
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import {
  calculateBatchTax,
  calculateLaborIncomeTax,
  calculateMonthlyTax,
  calculateYearEndBonus,
} from '@/api/tax';
import { listEmployees } from '@/api/employee';
import { listDepartments } from '@/api/department';
import type {
  TaxBatchResult,
  TaxLaborIncomeResult,
  TaxMonthlyResult,
  TaxYearEndBonusResult,
} from '@/api/types/salary';
import type { Department, Employee } from '@/api/types/organization';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import { formatAmount } from '@/utils/format';

const userStore = useUserStore();
const canCalc = computed(() => hasPermission(userStore.userInfo, 'salary:tax:calculate'));
const selfId = computed(() => userStore.userInfo?.employee?.id || '');

const employees = ref<Employee[]>([]);
const departments = ref<Department[]>([]);
const submitting = ref(false);
const monthlyRef = ref<FormInstance>();
const batchRef = ref<FormInstance>();
const bonusRef = ref<FormInstance>();
const laborRef = ref<FormInstance>();

const monthlyForm = reactive({
  employeeId: '',
  period: '',
  baseAmount: 0,
  cumulativePrepaid: 0,
});
const batchForm = reactive({ period: '', deptIds: [] as string[] });
const bonusForm = reactive({ employeeId: '', bonusAmount: 0 });
const laborForm = reactive({ employeeId: '', incomeAmount: 0 });

const monthlyResult = ref<TaxMonthlyResult | null>(null);
const batchResult = ref<TaxBatchResult | null>(null);
const bonusResult = ref<TaxYearEndBonusResult | null>(null);
const laborResult = ref<TaxLaborIncomeResult | null>(null);

const empRules: FormRules<{ employeeId: string }> = {
  employeeId: [{ required: true, message: '请选择员工', trigger: 'change' }],
};

async function onMonthly(): Promise<void> {
  const ok = await monthlyRef.value?.validate().catch(() => false);
  if (!ok) {
    return;
  }
  submitting.value = true;
  try {
    monthlyResult.value = await calculateMonthlyTax({
      employeeId: monthlyForm.employeeId,
      period: monthlyForm.period,
      baseAmount: monthlyForm.baseAmount,
      cumulativePrepaid: monthlyForm.cumulativePrepaid || undefined,
    });
    ElMessage.success('计算完成');
  } finally {
    submitting.value = false;
  }
}

async function onBatch(): Promise<void> {
  if (!batchForm.period) {
    ElMessage.warning('请选择期间');
    return;
  }
  submitting.value = true;
  try {
    batchResult.value = await calculateBatchTax({
      period: batchForm.period,
      deptIds: batchForm.deptIds.length ? batchForm.deptIds : undefined,
    });
    ElMessage.success('批量计算完成');
  } finally {
    submitting.value = false;
  }
}

async function onBonus(): Promise<void> {
  const ok = await bonusRef.value?.validate().catch(() => false);
  if (!ok) {
    return;
  }
  submitting.value = true;
  try {
    bonusResult.value = await calculateYearEndBonus({
      employeeId: bonusForm.employeeId,
      bonusAmount: bonusForm.bonusAmount,
      isAnnual: true,
    });
    ElMessage.success('计算完成');
  } finally {
    submitting.value = false;
  }
}

async function onLabor(): Promise<void> {
  const ok = await laborRef.value?.validate().catch(() => false);
  if (!ok) {
    return;
  }
  submitting.value = true;
  try {
    laborResult.value = await calculateLaborIncomeTax({
      employeeId: laborForm.employeeId,
      incomeAmount: laborForm.incomeAmount,
    });
    ElMessage.success('计算完成');
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  if (!canCalc.value) {
    return;
  }
  const [empRes, depts] = await Promise.all([
    listEmployees({ page: 1, pageSize: 100 }),
    listDepartments(),
  ]);
  employees.value = empRes.items;
  departments.value = depts;
  monthlyForm.employeeId = selfId.value;
  bonusForm.employeeId = selfId.value;
  laborForm.employeeId = selfId.value;
});
</script>

<template>
  <div>
    <PageHeader title="个税工具" :breadcrumb="[{ label: '薪酬核算' }, { label: '个税工具' }]" />
    <el-alert
      v-if="!canCalc"
      title="当前角色无 salary:tax:calculate，无法计算"
      type="warning"
      :closable="false"
    />
    <el-tabs v-else>
      <el-tab-pane label="月度累计预扣">
        <el-form ref="monthlyRef" :model="monthlyForm" :rules="empRules" label-width="120px" style="max-width: 520px">
          <el-form-item label="员工" prop="employeeId">
            <el-select v-model="monthlyForm.employeeId" filterable style="width: 100%">
              <el-option
                v-for="e in employees"
                :key="e.id"
                :label="`${e.name} (${e.employeeNo})`"
                :value="e.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="期间">
            <el-date-picker v-model="monthlyForm.period" type="month" value-format="YYYY-MM" style="width: 100%" />
          </el-form-item>
          <el-form-item label="应税所得">
            <el-input-number v-model="monthlyForm.baseAmount" :min="0" :precision="2" style="width: 100%" />
          </el-form-item>
          <el-form-item label="累计已预扣">
            <el-input-number v-model="monthlyForm.cumulativePrepaid" :min="0" :precision="2" style="width: 100%" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="submitting" @click="onMonthly">计算</el-button>
          </el-form-item>
        </el-form>
        <el-descriptions v-if="monthlyResult" :column="2" border class="mt">
          <el-descriptions-item label="应纳税所得额">
            {{ formatAmount(monthlyResult.taxableIncome) }}
          </el-descriptions-item>
          <el-descriptions-item label="税率">
            {{ (monthlyResult.bracket.rate * 100).toFixed(0) }}%
          </el-descriptions-item>
          <el-descriptions-item label="税额">{{ formatAmount(monthlyResult.taxAmount) }}</el-descriptions-item>
          <el-descriptions-item label="累计已预扣">
            {{ formatAmount(monthlyResult.cumulativePrepaid) }}
          </el-descriptions-item>
        </el-descriptions>
      </el-tab-pane>
      <el-tab-pane label="批量计算">
        <el-form ref="batchRef" :model="batchForm" label-width="120px" style="max-width: 520px">
          <el-form-item label="期间">
            <el-date-picker v-model="batchForm.period" type="month" value-format="YYYY-MM" style="width: 100%" />
          </el-form-item>
          <el-form-item label="部门">
            <el-select v-model="batchForm.deptIds" multiple filterable style="width: 100%">
              <el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="submitting" @click="onBatch">批量计算</el-button>
          </el-form-item>
        </el-form>
        <el-table v-if="batchResult" :data="batchResult.succeeded" stripe class="mt">
          <el-table-column prop="employeeId" label="员工" />
          <el-table-column label="税额">
            <template #default="{ row }">{{ formatAmount(row.taxAmount) }}</template>
          </el-table-column>
        </el-table>
        <el-table v-if="batchResult?.failed.length" :data="batchResult.failed" stripe class="mt">
          <el-table-column prop="employeeId" label="失败员工" />
          <el-table-column prop="error" label="原因" />
        </el-table>
      </el-tab-pane>
      <el-tab-pane label="年终奖">
        <el-form ref="bonusRef" :model="bonusForm" :rules="empRules" label-width="120px" style="max-width: 520px">
          <el-form-item label="员工" prop="employeeId">
            <el-select v-model="bonusForm.employeeId" filterable style="width: 100%">
              <el-option
                v-for="e in employees"
                :key="e.id"
                :label="`${e.name} (${e.employeeNo})`"
                :value="e.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="年终奖">
            <el-input-number v-model="bonusForm.bonusAmount" :min="0" :precision="2" style="width: 100%" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="submitting" @click="onBonus">计算</el-button>
          </el-form-item>
        </el-form>
        <el-descriptions v-if="bonusResult" :column="2" border class="mt">
          <el-descriptions-item label="月换算">
            {{ formatAmount(bonusResult.monthlyEquivalent) }}
          </el-descriptions-item>
          <el-descriptions-item label="税率">
            {{ (bonusResult.bracket.rate * 100).toFixed(0) }}%
          </el-descriptions-item>
          <el-descriptions-item label="税额">{{ formatAmount(bonusResult.taxAmount) }}</el-descriptions-item>
          <el-descriptions-item label="年度">{{ bonusResult.year }}</el-descriptions-item>
        </el-descriptions>
      </el-tab-pane>
      <el-tab-pane label="劳务报酬">
        <el-form ref="laborRef" :model="laborForm" :rules="empRules" label-width="120px" style="max-width: 520px">
          <el-form-item label="员工" prop="employeeId">
            <el-select v-model="laborForm.employeeId" filterable style="width: 100%">
              <el-option
                v-for="e in employees"
                :key="e.id"
                :label="`${e.name} (${e.employeeNo})`"
                :value="e.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="收入额">
            <el-input-number v-model="laborForm.incomeAmount" :min="0" :precision="2" style="width: 100%" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="submitting" @click="onLabor">计算</el-button>
          </el-form-item>
        </el-form>
        <el-descriptions v-if="laborResult" :column="2" border class="mt">
          <el-descriptions-item label="减除">{{ formatAmount(laborResult.deduction) }}</el-descriptions-item>
          <el-descriptions-item label="应纳税所得额">
            {{ formatAmount(laborResult.taxableIncome) }}
          </el-descriptions-item>
          <el-descriptions-item label="税额">{{ formatAmount(laborResult.taxAmount) }}</el-descriptions-item>
          <el-descriptions-item label="税率">
            {{ (laborResult.bracket.rate * 100).toFixed(0) }}%
          </el-descriptions-item>
        </el-descriptions>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.mt {
  margin-top: 16px;
}
</style>
