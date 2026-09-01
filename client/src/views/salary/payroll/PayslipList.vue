<script setup lang="ts">
/**
 * HR 工资单列表（M5-2-C2）可从算薪详情带 runId query
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '@/components/PageHeader.vue';
import SearchForm from '@/components/SearchForm.vue';
import EmptyState from '@/components/EmptyState.vue';
import { listPayslips } from '@/api/payslip';
import { listEmployees } from '@/api/employee';
import {
  payslipStatusLabel,
  payslipTagType,
  type Payslip,
  type PayslipStatus,
} from '@/api/types/payroll';
import type { Employee } from '@/api/types/organization';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import { formatAmount } from '@/utils/format';

const STATUSES: PayslipStatus[] = ['calculated', 'approved', 'locked'];

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const canRead = computed(() => hasPermission(userStore.userInfo, 'salary:payslip:read'));
const canPickEmployee = computed(() =>
  hasPermission(userStore.userInfo, 'salary:payroll-run:read'),
);

const loading = ref(false);
const list = ref<Payslip[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const periodFilter = ref('');
const statusFilter = ref<PayslipStatus | ''>('');
const employeeFilter = ref('');
const runIdFilter = ref('');
const employees = ref<Employee[]>([]);

function employeeLabel(id: string): string {
  const e = employees.value.find((item) => item.id === id);
  return e ? `${e.name} (${e.employeeNo})` : id;
}

async function load(): Promise<void> {
  if (!canRead.value) {
    list.value = [];
    return;
  }
  loading.value = true;
  try {
    const res = await listPayslips({
      period: periodFilter.value || undefined,
      status: statusFilter.value || undefined,
      employeeId: canPickEmployee.value ? employeeFilter.value || undefined : undefined,
      runId: runIdFilter.value || undefined,
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
  periodFilter.value = '';
  statusFilter.value = '';
  employeeFilter.value = '';
  runIdFilter.value = typeof route.query.runId === 'string' ? route.query.runId : '';
  page.value = 1;
  load();
}

watch(
  () => route.query.runId,
  (id) => {
    runIdFilter.value = typeof id === 'string' ? id : '';
    page.value = 1;
    load();
  },
);

onMounted(async () => {
  runIdFilter.value = typeof route.query.runId === 'string' ? route.query.runId : '';
  if (canPickEmployee.value) {
    const res = await listEmployees({ page: 1, pageSize: 100 });
    employees.value = res.items;
  }
  await load();
});
</script>

<template>
  <div>
    <PageHeader title="工资单管理" :breadcrumb="[{ label: '薪酬核算' }, { label: '工资单管理' }]" />
    <EmptyState v-if="!canRead" description="无权查看工资单" />
    <template v-else>
      <SearchForm @search="load" @reset="onReset">
        <el-form-item label="期间">
          <el-date-picker v-model="periodFilter" type="month" value-format="YYYY-MM" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="statusFilter" clearable style="width: 140px">
            <el-option v-for="s in STATUSES" :key="s" :label="payslipStatusLabel(s)" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="canPickEmployee" label="员工">
          <el-select v-model="employeeFilter" filterable clearable style="width: 200px">
            <el-option
              v-for="e in employees"
              :key="e.id"
              :label="`${e.name} (${e.employeeNo})`"
              :value="e.id"
            />
          </el-select>
        </el-form-item>
      </SearchForm>
      <el-table v-loading="loading" :data="list" stripe>
        <el-table-column label="员工" min-width="180">
          <template #default="{ row }">{{ employeeLabel(row.employeeId) }}</template>
        </el-table-column>
        <el-table-column prop="period" label="期间" width="110" />
        <el-table-column label="应发合计" width="130">
          <template #default="{ row }">{{ formatAmount(row.grossAmount) }}</template>
        </el-table-column>
        <el-table-column label="应扣合计" width="130">
          <template #default="{ row }">{{ formatAmount(row.deductionAmount) }}</template>
        </el-table-column>
        <el-table-column label="实发" width="130">
          <template #default="{ row }">{{ formatAmount(row.netAmount) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="payslipTagType(row.status)" size="small">
              {{ payslipStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="router.push(`/salary/payslips/${row.id}`)">
              查看
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        class="pager"
        layout="total, prev, pager, next"
        :total="total"
        @current-change="load"
      />
    </template>
  </div>
</template>

<style scoped>
.pager {
  margin-top: 12px;
  justify-content: flex-end;
}
</style>
