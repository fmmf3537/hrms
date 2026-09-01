<script setup lang="ts">
/**
 * 月度汇总列表（M5-2-B）list 必传 year+month；无 GET /:id
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import SearchForm from '@/components/SearchForm.vue';
import EmptyState from '@/components/EmptyState.vue';
import StatusTag from '@/components/StatusTag.vue';
import {
  confirmMonthlySummary,
  listMonthlySummaries,
  lockMonthlySummary,
} from '@/api/monthlySummary';
import { listCompanies } from '@/api/company';
import type { MonthlySummary, SummaryStatus } from '@/api/types/attendance';
import { attendanceStatusLabel, attendanceTagType } from '@/api/types/attendance';
import type { Company } from '@/api/types/organization';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';

const router = useRouter();
const userStore = useUserStore();
const canLock = computed(() => hasPermission(userStore.userInfo, 'summary:lock'));
const canRead = computed(() => hasPermission(userStore.userInfo, 'summary:read'));

const loading = ref(false);
const list = ref<MonthlySummary[]>([]);
const companies = ref<Company[]>([]);
const companyId = ref('');
const monthValue = ref(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
const statusFilter = ref<SummaryStatus | ''>('');
const detail = ref<MonthlySummary | null>(null);
const detailVisible = computed({
  get: () => detail.value !== null,
  set: (open: boolean) => {
    if (!open) {
      detail.value = null;
    }
  },
});

function parseYearMonth(): { year: number; month: number } {
  const [y, m] = monthValue.value.split('-').map(Number);
  return { year: y, month: m };
}

async function load(): Promise<void> {
  if (!canRead.value) {
    list.value = [];
    return;
  }
  const { year, month } = parseYearMonth();
  if (!companyId.value && !userStore.userInfo?.employee?.id) {
    ElMessage.warning('请选择公司或使用已绑定员工账号');
    return;
  }
  loading.value = true;
  try {
    list.value = await listMonthlySummaries({
      year,
      month,
      companyId: companyId.value || undefined,
      employeeId: companyId.value ? undefined : userStore.userInfo?.employee?.id,
      status: statusFilter.value || undefined,
    });
  } finally {
    loading.value = false;
  }
}

function onReset(): void {
  statusFilter.value = '';
  load();
}

async function onConfirm(row: MonthlySummary): Promise<void> {
  try {
    await ElMessageBox.confirm('确认本月考勤汇总？', '员工确认', { type: 'warning' });
    await confirmMonthlySummary(row.id);
    ElMessage.success('已确认');
    await load();
  } catch {
    /* 取消 */
  }
}

async function onLock(row: MonthlySummary): Promise<void> {
  try {
    await ElMessageBox.confirm('锁定后供 M4 薪酬读取，不可再改。', 'HR 锁定', { type: 'warning' });
    await lockMonthlySummary(row.id);
    ElMessage.success('已锁定');
    await load();
  } catch {
    /* 取消 */
  }
}

onMounted(async () => {
  const res = await listCompanies({ page: 1, pageSize: 100 });
  companies.value = res.items;
  companyId.value = companies.value[0]?.id ?? '';
  await load();
});
</script>

<template>
  <div>
    <PageHeader title="月度汇总" :breadcrumb="[{ label: '考勤假勤' }, { label: '月度汇总' }]">
      <template #actions>
        <el-button v-if="canLock" type="primary" @click="router.push('/attendance/monthly-summaries/new')">
          生成月报
        </el-button>
      </template>
    </PageHeader>
    <SearchForm @search="load" @reset="onReset">
      <el-form-item label="公司">
        <el-select v-model="companyId" clearable placeholder="全部" style="width: 180px">
          <el-option v-for="c in companies" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="月份">
        <el-date-picker v-model="monthValue" type="month" value-format="YYYY-MM" />
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="statusFilter" clearable placeholder="全部" style="width: 150px">
          <el-option label="草稿" value="draft" />
          <el-option label="员工已确认" value="employee_confirmed" />
          <el-option label="HR 已锁定" value="hr_locked" />
        </el-select>
      </el-form-item>
    </SearchForm>
    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column label="员工" min-width="110">
        <template #default="{ row }">{{ row.employee?.name || '—' }}</template>
      </el-table-column>
      <el-table-column label="月份" width="100">
        <template #default="{ row }">{{ row.year }}-{{ String(row.month).padStart(2, '0') }}</template>
      </el-table-column>
      <el-table-column prop="workDays" label="出勤" width="80" />
      <el-table-column prop="lateCount" label="迟到" width="70" />
      <el-table-column prop="earlyLeaveCount" label="早退" width="70" />
      <el-table-column prop="missingCount" label="缺卡" width="70" />
      <el-table-column prop="leaveDays" label="请假" width="70" />
      <el-table-column prop="overtimeHours" label="加班h" width="80" />
      <el-table-column prop="tripDays" label="出差" width="70" />
      <el-table-column label="状态" width="150">
        <template #default="{ row }">
          <StatusTag :status="row.status" :type="attendanceTagType(row.status)" />
          <span class="hint">{{ attendanceStatusLabel(row.status) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="detail = row">详情</el-button>
          <el-button v-if="row.status === 'draft'" link type="success" @click="onConfirm(row)">
            确认
          </el-button>
          <el-button
            v-if="canLock && row.status === 'employee_confirmed'"
            link
            type="warning"
            @click="onLock(row)"
          >
            锁定
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <EmptyState v-if="!loading && list.length === 0" />
    <el-dialog v-model="detailVisible" title="月报详情" width="560px">
      <el-descriptions v-if="detail" :column="2" border>
        <el-descriptions-item label="出勤">{{ detail.workDays }}</el-descriptions-item>
        <el-descriptions-item label="迟到">{{ detail.lateCount }}</el-descriptions-item>
        <el-descriptions-item label="早退">{{ detail.earlyLeaveCount }}</el-descriptions-item>
        <el-descriptions-item label="缺卡">{{ detail.missingCount }}</el-descriptions-item>
        <el-descriptions-item label="请假天">{{ detail.leaveDays }}</el-descriptions-item>
        <el-descriptions-item label="加班时">{{ detail.overtimeHours }}</el-descriptions-item>
        <el-descriptions-item label="出差天">{{ detail.tripDays }}</el-descriptions-item>
        <el-descriptions-item label="调休余额">{{ detail.compBalance }}</el-descriptions-item>
      </el-descriptions>
      <p class="hint">后端无 GET /:id；数据来自列表接口聚合（B1-B5）。</p>
    </el-dialog>
  </div>
</template>

<style scoped>
.hint {
  margin-left: 6px;
  color: #909399;
  font-size: 12px;
}
</style>
