<script setup lang="ts">
/**
 * HR 工资单详情（M5-2-C2）重算仅 salary:payslip:write + calculated
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import { getPayslip, recalculatePayslip } from '@/api/payslip';
import { listEmployees } from '@/api/employee';
import {
  isEarningItemType,
  payslipStatusLabel,
  payslipTagType,
  type Payslip,
} from '@/api/types/payroll';
import type { Employee } from '@/api/types/organization';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import { formatAmount } from '@/utils/format';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const id = computed(() => String(route.params.id || ''));
const loading = ref(false);
const acting = ref(false);
const record = ref<Payslip | null>(null);
const canWrite = computed(() => hasPermission(userStore.userInfo, 'salary:payslip:write'));
const canRecalc = computed(
  () => canWrite.value && record.value?.status === 'calculated',
);
const employees = ref<Employee[]>([]);

function employeeLabel(empId: string): string {
  const e = employees.value.find((item) => item.id === empId);
  return e ? `${e.name} (${e.employeeNo})` : empId;
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    record.value = await getPayslip(id.value);
  } finally {
    loading.value = false;
  }
}

async function onRecalc(): Promise<void> {
  try {
    await ElMessageBox.confirm('确认按当前规则重新计算该工资单？', '重新计算', {
      type: 'warning',
    });
  } catch {
    return;
  }
  acting.value = true;
  try {
    record.value = await recalculatePayslip(id.value);
    ElMessage.success('已重算');
  } finally {
    acting.value = false;
  }
}

onMounted(async () => {
  const res = await listEmployees({ page: 1, pageSize: 100 });
  employees.value = res.items;
  await load();
});
</script>

<template>
  <div v-loading="loading">
    <PageHeader
      title="工资单详情"
      :breadcrumb="[
        { label: '薪酬核算', to: '/salary/payslips' },
        { label: '工资单管理', to: '/salary/payslips' },
        { label: '详情' },
      ]"
    >
      <template #actions>
        <el-button @click="router.push('/salary/payslips')">返回</el-button>
        <el-button v-if="canRecalc" type="primary" :loading="acting" @click="onRecalc">
          重新计算
        </el-button>
      </template>
    </PageHeader>
    <EmptyState v-if="!record && !loading" description="工资单不存在" />
    <template v-else-if="record">
      <el-descriptions :column="3" border class="mb">
        <el-descriptions-item label="员工">{{ employeeLabel(record.employeeId) }}</el-descriptions-item>
        <el-descriptions-item label="期间">{{ record.period }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="payslipTagType(record.status)" size="small">
            {{ payslipStatusLabel(record.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="应发合计">{{ formatAmount(record.grossAmount) }}</el-descriptions-item>
        <el-descriptions-item label="应扣合计">{{ formatAmount(record.deductionAmount) }}</el-descriptions-item>
        <el-descriptions-item label="实发">{{ formatAmount(record.netAmount) }}</el-descriptions-item>
        <el-descriptions-item label="重算次数">{{ record.recalculateCount }}</el-descriptions-item>
      </el-descriptions>
      <el-table :data="record.items || []" stripe>
        <el-table-column prop="itemName" label="名称" min-width="160" />
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            {{ isEarningItemType(row.itemType) ? '应发' : '应扣' }}
          </template>
        </el-table-column>
        <el-table-column label="金额" width="140">
          <template #default="{ row }">{{ formatAmount(row.amount) }}</template>
        </el-table-column>
      </el-table>
    </template>
  </div>
</template>

<style scoped>
.mb {
  margin-bottom: 16px;
}
</style>
