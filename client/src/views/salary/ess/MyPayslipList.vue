<script setup lang="ts">
/**
 * ESS 我的工资条列表（M5-2-C2）固定自己 employeeId
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import PageHeader from '@/components/PageHeader.vue';
import SearchForm from '@/components/SearchForm.vue';
import EmptyState from '@/components/EmptyState.vue';
import { listPayslips } from '@/api/payslip';
import {
  payslipStatusLabel,
  payslipTagType,
  type Payslip,
} from '@/api/types/payroll';
import { useUserStore } from '@/stores/user';
import { formatAmount } from '@/utils/format';

const router = useRouter();
const userStore = useUserStore();
const selfId = computed(() => userStore.userInfo?.employee?.id || '');
const missingArchive = computed(() => !selfId.value);

const loading = ref(false);
const list = ref<Payslip[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const periodFilter = ref('');

async function load(): Promise<void> {
  if (!selfId.value) {
    list.value = [];
    return;
  }
  loading.value = true;
  try {
    const res = await listPayslips({
      employeeId: selfId.value,
      period: periodFilter.value || undefined,
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
  page.value = 1;
  load();
}

onMounted(load);
</script>

<template>
  <div>
    <PageHeader title="我的工资条" :breadcrumb="[{ label: '薪酬核算' }, { label: '我的工资条' }]" />
    <EmptyState v-if="missingArchive" description="尚未关联员工档案" />
    <template v-else>
      <SearchForm @search="load" @reset="onReset">
        <el-form-item label="期间">
          <el-date-picker v-model="periodFilter" type="month" value-format="YYYY-MM" />
        </el-form-item>
      </SearchForm>
      <el-table v-loading="loading" :data="list" stripe>
        <el-table-column prop="period" label="期间" width="120" />
        <el-table-column label="实发" width="140">
          <template #default="{ row }">{{ formatAmount(row.netAmount) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="payslipTagType(row.status)" size="small">
              {{ payslipStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90">
          <template #default="{ row }">
            <el-button link type="primary" @click="router.push(`/salary/my-payslips/${row.id}`)">
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
