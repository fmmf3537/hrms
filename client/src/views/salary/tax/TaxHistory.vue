<script setup lang="ts">
/**
 * 个税历史 + 年度汇总（M5-2-C1）settle 仅在 true 时传 query
 */
import { computed, onMounted, ref, watch } from 'vue';
import PageHeader from '@/components/PageHeader.vue';
import SearchForm from '@/components/SearchForm.vue';
import EmptyState from '@/components/EmptyState.vue';
import { getTaxAnnualSummary, getTaxHistory } from '@/api/tax';
import { listEmployees } from '@/api/employee';
import type { TaxAnnualSummary, TaxHistoryItem } from '@/api/types/salary';
import type { Employee } from '@/api/types/organization';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import { formatAmount, formatDate } from '@/utils/format';

const userStore = useUserStore();
const selfId = computed(() => userStore.userInfo?.employee?.id || '');
const canPickEmployee = computed(() => hasPermission(userStore.userInfo, 'salary:grade:read'));
const missingArchive = computed(() => !canPickEmployee.value && !selfId.value);

const employees = ref<Employee[]>([]);
const employeeId = ref('');
const yearStr = ref(`${new Date().getFullYear()}`);
const settle = ref(false);
const loading = ref(false);
const history = ref<TaxHistoryItem[]>([]);
const summary = ref<TaxAnnualSummary | null>(null);

async function load(): Promise<void> {
  const id = canPickEmployee.value ? employeeId.value : selfId.value;
  if (!id) {
    history.value = [];
    summary.value = null;
    return;
  }
  loading.value = true;
  try {
    const [h, s] = await Promise.all([
      getTaxHistory({ employeeId: id, year: Number(yearStr.value) }),
      getTaxAnnualSummary({
        employeeId: id,
        year: Number(yearStr.value),
        settle: settle.value || undefined,
      }),
    ]);
    history.value = h;
    summary.value = s;
  } finally {
    loading.value = false;
  }
}

function onReset(): void {
  if (canPickEmployee.value) {
    employeeId.value = '';
  }
  yearStr.value = `${new Date().getFullYear()}`;
  settle.value = false;
  load();
}

watch(settle, load);

onMounted(async () => {
  if (canPickEmployee.value) {
    const res = await listEmployees({ page: 1, pageSize: 100 });
    employees.value = res.items;
  } else {
    employeeId.value = selfId.value;
  }
  await load();
});
</script>

<template>
  <div>
    <PageHeader title="个税查询" :breadcrumb="[{ label: '薪酬核算' }, { label: '个税查询' }]" />
    <EmptyState v-if="missingArchive" description="尚未关联员工档案" />
    <template v-else>
      <SearchForm @search="load" @reset="onReset">
        <el-form-item v-if="canPickEmployee" label="员工">
          <el-select v-model="employeeId" filterable style="width: 200px">
            <el-option
              v-for="e in employees"
              :key="e.id"
              :label="`${e.name} (${e.employeeNo})`"
              :value="e.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="年份">
          <el-date-picker v-model="yearStr" type="year" value-format="YYYY" />
        </el-form-item>
        <el-form-item label="汇算窗口">
          <el-switch v-model="settle" />
        </el-form-item>
      </SearchForm>
      <el-row v-if="summary" :gutter="12" class="cards">
        <el-col :span="6">
          <el-card shadow="never">
            <div class="mini">工资薪金税</div>
            <div class="num">{{ formatAmount(summary.monthlyTaxTotal) }}</div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card shadow="never">
            <div class="mini">年终奖税</div>
            <div class="num">{{ formatAmount(summary.yearEndBonusTaxTotal) }}</div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card shadow="never">
            <div class="mini">劳务报酬税</div>
            <div class="num">{{ formatAmount(summary.laborIncomeTaxTotal) }}</div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card shadow="never">
            <div class="mini">合计</div>
            <div class="num">{{ formatAmount(summary.taxTotal) }}</div>
          </el-card>
        </el-col>
      </el-row>
      <el-table v-loading="loading" :data="history" stripe>
        <el-table-column prop="action" label="动作" min-width="180" />
        <el-table-column label="时间" width="180">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="税额" width="120">
          <template #default="{ row }">
            {{ formatAmount(typeof row.details.taxAmount === 'number' ? row.details.taxAmount : null) }}
          </template>
        </el-table-column>
      </el-table>
      <EmptyState v-if="!loading && history.length === 0" />
    </template>
  </div>
</template>

<style scoped>
.cards {
  margin-bottom: 12px;
}
.mini {
  color: #909399;
  font-size: 12px;
}
.num {
  font-size: 18px;
  font-weight: 600;
  margin-top: 4px;
}
</style>
