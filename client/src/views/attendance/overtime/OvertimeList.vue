<script setup lang="ts">
/**
 * 加班列表（M5-2-B）无 GET /:id，详情 Dialog
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import SearchForm from '@/components/SearchForm.vue';
import EmptyState from '@/components/EmptyState.vue';
import StatusTag from '@/components/StatusTag.vue';
import { cancelOvertimeRequest, listOvertimeRequests } from '@/api/overtime';
import type { OvertimeRequest, OvertimeStatus } from '@/api/types/attendance';
import { attendanceStatusLabel, attendanceTagType } from '@/api/types/attendance';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import { formatDate } from '@/utils/format';

const COMP_LABEL: Record<string, string> = { pay: '加班费', comp: '调休' };

const router = useRouter();
const userStore = useUserStore();
const canRequest = computed(
  () =>
    hasPermission(userStore.userInfo, 'overtime:request') ||
    hasPermission(userStore.userInfo, 'overtime:apply'),
);
const canCancel = computed(() => hasPermission(userStore.userInfo, 'overtime:cancel'));
const canRead = computed(() => hasPermission(userStore.userInfo, 'overtime:read'));

const loading = ref(false);
const list = ref<OvertimeRequest[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const statusFilter = ref<OvertimeStatus | ''>('');
const detail = ref<OvertimeRequest | null>(null);
const detailVisible = computed({
  get: () => detail.value !== null,
  set: (open: boolean) => {
    if (!open) {
      detail.value = null;
    }
  },
});

async function load(): Promise<void> {
  if (!canRead.value) {
    list.value = [];
    total.value = 0;
    return;
  }
  loading.value = true;
  try {
    const res = await listOvertimeRequests({
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

async function onCancel(row: OvertimeRequest): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('请输入取消原因', '取消加班', {
      inputPattern: /\S+/,
      inputErrorMessage: '原因必填',
    });
    await cancelOvertimeRequest(row.id, { reason: String(value) });
    ElMessage.success('已取消');
    await load();
  } catch {
    /* 取消 */
  }
}

function onReset(): void {
  statusFilter.value = '';
  page.value = 1;
  load();
}

onMounted(load);
</script>

<template>
  <div>
    <PageHeader title="加班管理" :breadcrumb="[{ label: '考勤假勤' }, { label: '加班管理' }]">
      <template #actions>
        <el-button v-if="canRequest" type="primary" @click="router.push('/attendance/overtime/new')">
          自己申请
        </el-button>
      </template>
    </PageHeader>
    <SearchForm @search="load" @reset="onReset">
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
      <el-table-column label="开始" width="170">
        <template #default="{ row }">{{ formatDate(row.startTime) }}</template>
      </el-table-column>
      <el-table-column label="结束" width="170">
        <template #default="{ row }">{{ formatDate(row.endTime) }}</template>
      </el-table-column>
      <el-table-column prop="totalHours" label="时长" width="80" />
      <el-table-column prop="overtimeType" label="类型" width="90" />
      <el-table-column label="补偿" width="90">
        <template #default="{ row }">{{ COMP_LABEL[row.compensationType] || row.compensationType }}</template>
      </el-table-column>
      <el-table-column label="状态" width="130">
        <template #default="{ row }">
          <StatusTag :status="row.status" :type="attendanceTagType(row.status)" />
          <span class="hint">{{ attendanceStatusLabel(row.status) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="detail = row">详情</el-button>
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
    <el-dialog v-model="detailVisible" title="加班详情" width="520px">
      <el-descriptions v-if="detail" :column="1" border>
        <el-descriptions-item label="员工">{{ detail.employee?.name || '—' }}</el-descriptions-item>
        <el-descriptions-item label="开始">{{ formatDate(detail.startTime) }}</el-descriptions-item>
        <el-descriptions-item label="结束">{{ formatDate(detail.endTime) }}</el-descriptions-item>
        <el-descriptions-item label="时长">{{ detail.totalHours }}</el-descriptions-item>
        <el-descriptions-item label="事由">{{ detail.reason }}</el-descriptions-item>
      </el-descriptions>
      <p class="hint">后端无 GET /:id，以上为列表行数据。</p>
    </el-dialog>
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
