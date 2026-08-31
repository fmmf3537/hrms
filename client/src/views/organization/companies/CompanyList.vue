<script setup lang="ts">
/**
 * 法人公司列表（M5-2-A1）
 * admin/hr 可写；executive 无 company:read 时看不到本菜单
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import SearchForm from '@/components/SearchForm.vue';
import EmptyState from '@/components/EmptyState.vue';
import StatusTag from '@/components/StatusTag.vue';
import CompanyFormDialog from './CompanyFormDialog.vue';
import {
  deleteCompany,
  listCompanies,
  reactivateCompany,
  suspendCompany,
} from '@/api/company';
import type { Company, CompanyStatus } from '@/api/types/organization';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';

const router = useRouter();
const userStore = useUserStore();
const canWrite = computed(() => hasPermission(userStore.userInfo, 'company:write'));

const loading = ref(false);
const list = ref<Company[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const statusFilter = ref<CompanyStatus | ''>('');
const keyword = ref('');
const formVisible = ref(false);
const editing = ref<Company | null>(null);

const displayList = computed(() => {
  const q = keyword.value.trim();
  if (!q) {
    return list.value;
  }
  return list.value.filter((row) => row.name.includes(q) || row.code.includes(q));
});

async function load(): Promise<void> {
  loading.value = true;
  try {
    const res = await listCompanies({
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

function openCreate(): void {
  editing.value = null;
  formVisible.value = true;
}

function openEdit(row: Company): void {
  editing.value = row;
  formVisible.value = true;
}

async function onSuspend(row: Company): Promise<void> {
  try {
    await ElMessageBox.confirm(`暂停法人「${row.name}」？`, '提示', { type: 'warning' });
    await suspendCompany(row.id);
    ElMessage.success('已暂停');
    await load();
  } catch {
    /* 取消 */
  }
}

async function onReactivate(row: Company): Promise<void> {
  await reactivateCompany(row.id);
  ElMessage.success('已恢复');
  await load();
}

async function onDelete(row: Company): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除法人「${row.name}」？须无下属部门/员工`, '提示', { type: 'warning' });
    await deleteCompany(row.id);
    ElMessage.success('已删除');
    await load();
  } catch {
    /* 取消 */
  }
}

function onReset(): void {
  statusFilter.value = '';
  keyword.value = '';
  page.value = 1;
  load();
}

onMounted(load);
</script>

<template>
  <div>
    <PageHeader title="法人公司" :breadcrumb="[{ label: '组织人事' }, { label: '法人公司' }]">
      <template #actions>
        <el-button v-if="canWrite" type="primary" @click="openCreate">创建</el-button>
      </template>
    </PageHeader>
    <SearchForm @search="load" @reset="onReset">
      <el-form-item label="状态">
        <el-select v-model="statusFilter" clearable placeholder="全部" style="width: 140px">
          <el-option label="正常" value="active" />
          <el-option label="暂停" value="suspended" />
        </el-select>
      </el-form-item>
      <el-form-item label="名称/编码">
        <el-input v-model="keyword" clearable placeholder="本页筛选" />
      </el-form-item>
    </SearchForm>
    <el-table v-loading="loading" :data="displayList" stripe>
      <el-table-column prop="code" label="编码" width="120" />
      <el-table-column prop="name" label="名称" min-width="160" />
      <el-table-column prop="city" label="城市" width="100" />
      <el-table-column prop="legalRep" label="法人代表" width="120" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <StatusTag :status="row.status" />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="router.push(`/org/companies/${row.id}`)">
            详情
          </el-button>
          <el-button link type="primary" @click="router.push(`/org/companies/${row.id}/tree`)">
            组织树
          </el-button>
          <template v-if="canWrite">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button
              v-if="row.status === 'active'"
              link
              type="warning"
              @click="onSuspend(row)"
            >
              暂停
            </el-button>
            <el-button v-else link type="success" @click="onReactivate(row)">恢复</el-button>
            <el-button link type="danger" @click="onDelete(row)">删除</el-button>
          </template>
        </template>
      </el-table-column>
    </el-table>
    <EmptyState v-if="!loading && displayList.length === 0" />
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
    <CompanyFormDialog v-model="formVisible" :company="editing" @saved="load" />
  </div>
</template>

<style scoped>
.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
