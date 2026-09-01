<script setup lang="ts">
/**
 * 提成汇总（M5-2-C3）employee 走本人明细，不展示全量 groupBy
 */
import { computed, onMounted, ref } from 'vue';
import PageHeader from '@/components/PageHeader.vue';
import SearchForm from '@/components/SearchForm.vue';
import EmptyState from '@/components/EmptyState.vue';
import {
  getCommissionSummary,
  getDepartmentCommission,
  getEmployeeCommission,
} from '@/api/commission';
import type {
  CommissionDepartmentSummary,
  CommissionEmployeeSummary,
  CommissionGroupBy,
  CommissionSummaryItem,
  CommissionSummaryResult,
} from '@/api/types/compensation';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import { formatAmount } from '@/utils/format';

const GROUPS: { value: CommissionGroupBy; label: string }[] = [
  { value: 'employee', label: '员工' },
  { value: 'department', label: '部门' },
  { value: 'product', label: '产品' },
  { value: 'report', label: '报表' },
];

const userStore = useUserStore();
const elevated = ['admin', 'hr', 'dept_head', 'executive'];
const isEmployee = computed(() => {
  const roles = userStore.userInfo?.roles ?? [];
  return roles.includes('employee') && !roles.some((r) => elevated.includes(r));
});
const selfId = computed(() => userStore.userInfo?.employee?.id || '');
const missingArchive = computed(() => isEmployee.value && !selfId.value);
const canRead = computed(() => hasPermission(userStore.userInfo, 'salary:commission:read'));

const loading = ref(false);
const groupBy = ref<CommissionGroupBy>('employee');
const filterMode = ref<'period' | 'quarter'>('period');
const period = ref('');
const quarterYear = ref('');
const quarter = ref<1 | 2 | 3 | 4>(1);
const summary = ref<CommissionSummaryResult | null>(null);
const selfDetail = ref<CommissionEmployeeSummary | null>(null);

const drawerVisible = ref(false);
const drawerTitle = ref('');
const empDetail = ref<CommissionEmployeeSummary | null>(null);
const deptDetail = ref<CommissionDepartmentSummary | null>(null);

const items = computed<CommissionSummaryItem[]>(() => summary.value?.items ?? []);
const totalAmount = computed(() => Number(summary.value?.totalAmount ?? 0));

function sharePercent(amount: number): number {
  if (totalAmount.value <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((Number(amount) / totalAmount.value) * 10000) / 100);
}

function rowLabel(row: CommissionSummaryItem): string {
  return (
    row.label ||
    row.employeeName ||
    row.departmentName ||
    row.productName ||
    row.key
  );
}

function queryPeriod(): { period?: string; quarter?: string } {
  if (filterMode.value === 'period') {
    return { period: period.value || undefined };
  }
  if (!quarterYear.value) {
    return {};
  }
  return { quarter: `${quarterYear.value}-Q${quarter.value}` };
}

async function load(): Promise<void> {
  if (!canRead.value) {
    return;
  }
  if (missingArchive.value) {
    return;
  }
  loading.value = true;
  try {
    const q = queryPeriod();
    if (isEmployee.value) {
      selfDetail.value = await getEmployeeCommission(selfId.value, q);
      summary.value = null;
      return;
    }
    summary.value = await getCommissionSummary({ groupBy: groupBy.value, ...q });
    selfDetail.value = null;
  } finally {
    loading.value = false;
  }
}

function onReset(): void {
  period.value = '';
  quarterYear.value = '';
  quarter.value = 1;
  groupBy.value = 'employee';
  filterMode.value = 'period';
  load();
}

async function openEmployee(id: string, name?: string): Promise<void> {
  drawerTitle.value = `员工提成 · ${name || id}`;
  empDetail.value = null;
  deptDetail.value = null;
  drawerVisible.value = true;
  empDetail.value = await getEmployeeCommission(id, queryPeriod());
}

async function openDepartment(id: string, name?: string): Promise<void> {
  drawerTitle.value = `部门提成 · ${name || id}`;
  empDetail.value = null;
  deptDetail.value = null;
  drawerVisible.value = true;
  deptDetail.value = await getDepartmentCommission(id, queryPeriod());
}

function onRowDetail(row: CommissionSummaryItem): void {
  if (groupBy.value === 'employee' && row.employeeId) {
    openEmployee(row.employeeId, row.employeeName);
    return;
  }
  if (groupBy.value === 'department' && row.departmentId) {
    openDepartment(row.departmentId, row.departmentName);
  }
}

onMounted(load);
</script>

<template>
  <div>
    <PageHeader
      :title="isEmployee ? '我的提成' : '提成查询'"
      :breadcrumb="[{ label: '薪酬核算' }, { label: isEmployee ? '我的提成' : '提成查询' }]"
    />
    <EmptyState v-if="!canRead" description="无权查看提成" />
    <EmptyState v-else-if="missingArchive" description="尚未关联员工档案" />
    <template v-else>
      <SearchForm @search="load" @reset="onReset">
        <el-form-item v-if="!isEmployee" label="维度">
          <el-radio-group v-model="groupBy" @change="load">
            <el-radio v-for="g in GROUPS" :key="g.value" :label="g.value">{{ g.label }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="期间类型">
          <el-radio-group v-model="filterMode">
            <el-radio label="period">月份</el-radio>
            <el-radio label="quarter">季度</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="filterMode === 'period'" label="月份">
          <el-date-picker v-model="period" type="month" value-format="YYYY-MM" />
        </el-form-item>
        <template v-else>
          <el-form-item label="年份">
            <el-date-picker v-model="quarterYear" type="year" value-format="YYYY" />
          </el-form-item>
          <el-form-item label="季度">
            <el-select v-model="quarter" style="width: 100px">
              <el-option :value="1" label="Q1" />
              <el-option :value="2" label="Q2" />
              <el-option :value="3" label="Q3" />
              <el-option :value="4" label="Q4" />
            </el-select>
          </el-form-item>
        </template>
      </SearchForm>

      <template v-if="isEmployee">
        <el-descriptions v-if="selfDetail" :column="3" border class="mb">
          <el-descriptions-item label="员工">{{ selfDetail.employeeName }}</el-descriptions-item>
          <el-descriptions-item label="部门">{{ selfDetail.departmentName || '—' }}</el-descriptions-item>
          <el-descriptions-item label="提成合计">{{ formatAmount(selfDetail.totalAmount) }}</el-descriptions-item>
        </el-descriptions>
        <el-table v-loading="loading" :data="selfDetail?.items ?? []" stripe>
          <el-table-column prop="period" label="期间" width="110" />
          <el-table-column prop="productName" label="产品" min-width="140" />
          <el-table-column label="计佣基数" width="130">
            <template #default="{ row }">{{ formatAmount(row.baseAmount) }}</template>
          </el-table-column>
          <el-table-column label="比例" width="90">
            <template #default="{ row }">{{ row.commissionRate }}</template>
          </el-table-column>
          <el-table-column label="提成额" width="130">
            <template #default="{ row }">{{ formatAmount(row.finalAmount) }}</template>
          </el-table-column>
        </el-table>
      </template>

      <template v-else>
        <el-descriptions v-if="summary" :column="3" border class="mb">
          <el-descriptions-item label="维度">{{ summary.groupBy }}</el-descriptions-item>
          <el-descriptions-item label="合计">{{ formatAmount(summary.totalAmount) }}</el-descriptions-item>
          <el-descriptions-item label="行数">{{ items.length }}</el-descriptions-item>
        </el-descriptions>
        <el-table v-loading="loading" :data="items" stripe>
          <el-table-column label="名称" min-width="160">
            <template #default="{ row }">{{ rowLabel(row) }}</template>
          </el-table-column>
          <el-table-column label="提成额" width="140">
            <template #default="{ row }">{{ formatAmount(row.totalAmount) }}</template>
          </el-table-column>
          <el-table-column label="占比" min-width="180">
            <template #default="{ row }">
              <el-progress :percentage="sharePercent(row.totalAmount)" :stroke-width="10" />
            </template>
          </el-table-column>
          <el-table-column prop="recordCount" label="笔数" width="80" />
          <el-table-column v-if="groupBy === 'employee' || groupBy === 'department'" label="操作" width="90">
            <template #default="{ row }">
              <el-button link type="primary" @click="onRowDetail(row)">明细</el-button>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </template>

    <el-drawer v-model="drawerVisible" :title="drawerTitle" size="480px">
      <template v-if="empDetail">
        <el-descriptions :column="1" border class="mb">
          <el-descriptions-item label="合计">{{ formatAmount(empDetail.totalAmount) }}</el-descriptions-item>
          <el-descriptions-item label="笔数">{{ empDetail.recordCount }}</el-descriptions-item>
        </el-descriptions>
        <el-table :data="empDetail.items" stripe>
          <el-table-column prop="period" label="期间" width="100" />
          <el-table-column prop="productName" label="产品" />
          <el-table-column label="金额" width="110">
            <template #default="{ row }">{{ formatAmount(row.finalAmount) }}</template>
          </el-table-column>
        </el-table>
      </template>
      <template v-else-if="deptDetail">
        <el-descriptions :column="1" border class="mb">
          <el-descriptions-item label="合计">{{ formatAmount(deptDetail.totalAmount) }}</el-descriptions-item>
          <el-descriptions-item label="人数">{{ deptDetail.employeeCount }}</el-descriptions-item>
        </el-descriptions>
        <el-table :data="deptDetail.items" stripe>
          <el-table-column prop="employeeName" label="员工" />
          <el-table-column label="金额" width="110">
            <template #default="{ row }">{{ formatAmount(row.totalAmount) }}</template>
          </el-table-column>
        </el-table>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.mb {
  margin-bottom: 12px;
}
</style>
