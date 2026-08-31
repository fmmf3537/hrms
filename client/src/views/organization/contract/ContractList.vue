<script setup lang="ts">
/**
 * 合同列表（M5-2-A2）
 * 6 状态：draft / pending_signature / signing / signed / expired / cancelled
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import SearchForm from '@/components/SearchForm.vue';
import EmptyState from '@/components/EmptyState.vue';
import StatusTag from '@/components/StatusTag.vue';
import ContractFormDialog from './ContractFormDialog.vue';
import { cancelContract, listContracts } from '@/api/contract';
import type {
  Contract,
  ContractStatus,
  ContractType,
} from '@/api/types/organization';
import { lifecycleStatusLabel, lifecycleTagType } from '@/api/types/organization';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import { formatDate } from '@/utils/format';

const TYPE_LABEL: Record<string, string> = {
  formal: '劳动合同',
  intern: '实习',
  consultant: '顾问',
  labor: '劳务',
  nda: '保密协议',
};

const router = useRouter();
const userStore = useUserStore();
const canWrite = computed(() => hasPermission(userStore.userInfo, 'contract:write'));

const loading = ref(false);
const list = ref<Contract[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const statusFilter = ref<ContractStatus | ''>('');
const typeFilter = ref<ContractType | ''>('');
const formVisible = ref(false);
const editing = ref<Contract | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const res = await listContracts({
      status: statusFilter.value || undefined,
      contractType: typeFilter.value || undefined,
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

function openCreate(): void {
  editing.value = null;
  formVisible.value = true;
}

function openEdit(row: Contract): void {
  editing.value = row;
  formVisible.value = true;
}

async function onCancel(row: Contract): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('请输入取消原因', '取消合同', {
      inputPattern: /\S+/,
      inputErrorMessage: '原因必填',
    });
    await cancelContract(row.id, { reason: String(value) });
    ElMessage.success('已取消');
    await load();
  } catch {
    /* 取消 */
  }
}

onMounted(load);
</script>

<template>
  <div>
    <PageHeader title="合同管理" :breadcrumb="[{ label: '组织人事' }, { label: '合同管理' }]">
      <template #actions>
        <el-button v-if="canWrite" type="primary" @click="openCreate">创建合同</el-button>
      </template>
    </PageHeader>
    <SearchForm @search="load" @reset="onReset">
      <el-form-item label="类型">
        <el-select v-model="typeFilter" clearable placeholder="全部" style="width: 140px">
          <el-option label="劳动合同" value="formal" />
          <el-option label="实习" value="intern" />
          <el-option label="顾问" value="consultant" />
          <el-option label="劳务" value="labor" />
          <el-option label="保密协议" value="nda" />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="statusFilter" clearable placeholder="全部" style="width: 150px">
          <el-option label="草稿" value="draft" />
          <el-option label="待签署" value="pending_signature" />
          <el-option label="签署中" value="signing" />
          <el-option label="已签署" value="signed" />
          <el-option label="已到期" value="expired" />
          <el-option label="已取消" value="cancelled" />
        </el-select>
      </el-form-item>
    </SearchForm>
    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column label="员工" min-width="110">
        <template #default="{ row }">{{ row.employee?.name || '—' }}</template>
      </el-table-column>
      <el-table-column prop="contractNo" label="合同编号" width="140" />
      <el-table-column label="类型" width="110">
        <template #default="{ row }">{{ TYPE_LABEL[row.contractType] || row.contractType }}</template>
      </el-table-column>
      <el-table-column label="起始" width="120">
        <template #default="{ row }">{{ formatDate(row.startDate) }}</template>
      </el-table-column>
      <el-table-column label="结束" width="120">
        <template #default="{ row }">{{ formatDate(row.endDate) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="150">
        <template #default="{ row }">
          <StatusTag :status="row.status" :type="lifecycleTagType(row.status)" />
          <span class="status-hint">{{ lifecycleStatusLabel(row.status) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="router.push(`/org/contracts/${row.id}`)">
            详情
          </el-button>
          <el-button
            v-if="canWrite && row.status === 'draft'"
            link
            type="primary"
            @click="openEdit(row)"
          >
            编辑
          </el-button>
          <el-button
            v-if="canWrite && row.status === 'draft'"
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
    <ContractFormDialog v-model="formVisible" :contract="editing" @saved="load" />
  </div>
</template>

<style scoped>
.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
.status-hint {
  margin-left: 6px;
  color: #909399;
  font-size: 12px;
}
</style>
