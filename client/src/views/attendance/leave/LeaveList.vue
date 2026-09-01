<script setup lang="ts">
/**
 * 请假列表（M5-2-B）
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import SearchForm from '@/components/SearchForm.vue';
import EmptyState from '@/components/EmptyState.vue';
import StatusTag from '@/components/StatusTag.vue';
import { cancelLeaveRequest, getLeaveBalance, listLeaveRequests } from '@/api/leave';
import type { LeaveBalance, LeaveRequest, LeaveStatus, LeaveType } from '@/api/types/attendance';
import { attendanceStatusLabel, attendanceTagType } from '@/api/types/attendance';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import { formatDate } from '@/utils/format';

const TYPE_LABEL: Record<string, string> = {
  annual: '年假',
  sick: '病假',
  personal: '事假',
  compensatory: '调休',
  marriage: '婚假',
  maternity: '产假',
  paternity: '陪产假',
  bereavement: '丧假',
};

const LEAVE_TYPES: LeaveType[] = [
  'annual',
  'sick',
  'personal',
  'compensatory',
  'marriage',
  'maternity',
  'paternity',
  'bereavement',
];

const router = useRouter();
const userStore = useUserStore();
const canRequest = computed(
  () =>
    hasPermission(userStore.userInfo, 'leave:request') ||
    hasPermission(userStore.userInfo, 'leave:apply'),
);
const canCancel = computed(() => hasPermission(userStore.userInfo, 'leave:cancel'));
const canRead = computed(() => hasPermission(userStore.userInfo, 'leave:read'));

const loading = ref(false);
const list = ref<LeaveRequest[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const statusFilter = ref<LeaveStatus | ''>('');
const typeFilter = ref<LeaveType | ''>('');
const balances = ref<Record<string, LeaveBalance>>({});

async function loadBalances(): Promise<void> {
  const employeeId = userStore.userInfo?.employee?.id;
  if (!employeeId || !canRequest.value) {
    return;
  }
  const year = new Date().getFullYear();
  const entries = await Promise.all(
    LEAVE_TYPES.map(async (t) => {
      try {
        const b = await getLeaveBalance(employeeId, t, year);
        return [t, b] as const;
      } catch {
        return [t, { totalDays: 0, usedDays: 0, remainingDays: 0 }] as const;
      }
    }),
  );
  const next: Record<string, LeaveBalance> = {};
  entries.forEach(([k, v]) => {
    next[k] = v;
  });
  balances.value = next;
}

async function load(): Promise<void> {
  if (!canRead.value) {
    list.value = [];
    total.value = 0;
    return;
  }
  loading.value = true;
  try {
    const res = await listLeaveRequests({
      status: statusFilter.value || undefined,
      leaveType: typeFilter.value || undefined,
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
  statusFilter.value = '';
  typeFilter.value = '';
  page.value = 1;
  load();
}

async function onCancel(row: LeaveRequest): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('请输入取消原因', '取消请假', {
      inputPattern: /\S+/,
      inputErrorMessage: '原因必填',
    });
    await cancelLeaveRequest(row.id, { reason: String(value) });
    ElMessage.success('已取消');
    await load();
  } catch {
    /* 取消 */
  }
}

onMounted(async () => {
  await Promise.all([load(), loadBalances()]);
});
</script>

<template>
  <div>
    <PageHeader title="请假管理" :breadcrumb="[{ label: '考勤假勤' }, { label: '请假管理' }]">
      <template #actions>
        <el-button v-if="canRequest" type="primary" @click="router.push('/attendance/leaves/new')">
          自己申请
        </el-button>
      </template>
    </PageHeader>
    <el-row v-if="Object.keys(balances).length" :gutter="12" class="cards">
      <el-col v-for="t in LEAVE_TYPES" :key="t" :span="6">
        <el-card shadow="never" class="mini">
          <div class="mini__name">{{ TYPE_LABEL[t] }}</div>
          <div class="mini__num">{{ balances[t]?.remainingDays ?? '—' }}</div>
          <div class="mini__sub">剩余 / 总额 {{ balances[t]?.totalDays ?? 0 }}</div>
        </el-card>
      </el-col>
    </el-row>
    <SearchForm @search="load" @reset="onReset">
      <el-form-item label="类型">
        <el-select v-model="typeFilter" clearable placeholder="全部" style="width: 130px">
          <el-option v-for="t in LEAVE_TYPES" :key="t" :label="TYPE_LABEL[t]" :value="t" />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="statusFilter" clearable placeholder="全部" style="width: 120px">
          <el-option label="草稿" value="draft" />
          <el-option label="已提交" value="submitted" />
          <el-option label="已通过" value="approved" />
          <el-option label="已驳回" value="rejected" />
          <el-option label="已取消" value="cancelled" />
        </el-select>
      </el-form-item>
    </SearchForm>
    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column label="员工" min-width="110">
        <template #default="{ row }">{{ row.employee?.name || '—' }}</template>
      </el-table-column>
      <el-table-column label="类型" width="100">
        <template #default="{ row }">{{ TYPE_LABEL[row.leaveType] || row.leaveType }}</template>
      </el-table-column>
      <el-table-column label="开始" width="120">
        <template #default="{ row }">{{ formatDate(row.startDate) }}</template>
      </el-table-column>
      <el-table-column label="结束" width="120">
        <template #default="{ row }">{{ formatDate(row.endDate) }}</template>
      </el-table-column>
      <el-table-column prop="totalDays" label="天数" width="80" />
      <el-table-column label="状态" width="130">
        <template #default="{ row }">
          <StatusTag :status="row.status" :type="attendanceTagType(row.status)" />
          <span class="hint">{{ attendanceStatusLabel(row.status) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="router.push(`/attendance/leaves/requests/${row.id}`)">
            详情
          </el-button>
          <el-button
            v-if="canCancel && (row.status === 'draft' || row.status === 'submitted')"
            link
            type="danger"
            @click="onCancel(row)"
          >
            取消
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
  </div>
</template>

<style scoped>
.cards {
  margin-bottom: 12px;
}
.mini {
  margin-bottom: 12px;
}
.mini__name {
  color: #909399;
  font-size: 12px;
}
.mini__num {
  font-size: 20px;
  font-weight: 600;
}
.mini__sub {
  font-size: 12px;
  color: #c0c4cc;
}
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
