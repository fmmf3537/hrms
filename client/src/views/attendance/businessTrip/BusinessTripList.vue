<script setup lang="ts">
/**
 * 出差列表（M5-2-B）无 GET /:id，详情 Dialog
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import SearchForm from '@/components/SearchForm.vue';
import EmptyState from '@/components/EmptyState.vue';
import StatusTag from '@/components/StatusTag.vue';
import { cancelBusinessTrip, listBusinessTrips } from '@/api/businessTrip';
import type { BusinessTrip, BusinessTripStatus } from '@/api/types/attendance';
import { attendanceStatusLabel, attendanceTagType } from '@/api/types/attendance';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import { formatAmount, formatDate } from '@/utils/format';

const router = useRouter();
const userStore = useUserStore();
const canRequest = computed(() => hasPermission(userStore.userInfo, 'trip:request'));
const canCancel = computed(() => hasPermission(userStore.userInfo, 'trip:cancel'));
const canRead = computed(() => hasPermission(userStore.userInfo, 'trip:read'));

const loading = ref(false);
const list = ref<BusinessTrip[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const statusFilter = ref<BusinessTripStatus | ''>('');
const destination = ref('');
const detail = ref<BusinessTrip | null>(null);
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
    const res = await listBusinessTrips({
      status: statusFilter.value || undefined,
      destination: destination.value || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
    list.value = res.items;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

async function onCancel(row: BusinessTrip): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('请输入取消原因', '取消出差', {
      inputPattern: /\S+/,
      inputErrorMessage: '原因必填',
    });
    await cancelBusinessTrip(row.id, { reason: String(value) });
    ElMessage.success('已取消');
    await load();
  } catch {
    /* 取消 */
  }
}

function onReset(): void {
  statusFilter.value = '';
  destination.value = '';
  page.value = 1;
  load();
}

onMounted(load);
</script>

<template>
  <div>
    <PageHeader title="出差管理" :breadcrumb="[{ label: '考勤假勤' }, { label: '出差管理' }]">
      <template #actions>
        <el-button v-if="canRequest" type="primary" @click="router.push('/attendance/business-trips/new')">
          自己申请
        </el-button>
      </template>
    </PageHeader>
    <SearchForm @search="load" @reset="onReset">
      <el-form-item label="目的地">
        <el-input v-model="destination" clearable placeholder="关键字" />
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
      <el-table-column prop="destination" label="目的地" min-width="120" />
      <el-table-column label="开始" width="120">
        <template #default="{ row }">{{ formatDate(row.startDate) }}</template>
      </el-table-column>
      <el-table-column label="结束" width="120">
        <template #default="{ row }">{{ formatDate(row.endDate) }}</template>
      </el-table-column>
      <el-table-column label="补助" width="110">
        <template #default="{ row }">{{ formatAmount(row.allowanceAmount) }}</template>
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
    <el-dialog v-model="detailVisible" title="出差详情" width="520px">
      <el-descriptions v-if="detail" :column="1" border>
        <el-descriptions-item label="目的地">{{ detail.destination }}</el-descriptions-item>
        <el-descriptions-item label="事由">{{ detail.reason }}</el-descriptions-item>
        <el-descriptions-item label="项目">{{ detail.projectCode || '—' }}</el-descriptions-item>
        <el-descriptions-item label="补助">{{ formatAmount(detail.allowanceAmount) }}</el-descriptions-item>
        <el-descriptions-item label="城市档">{{ detail.cityTier || '—' }}</el-descriptions-item>
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
