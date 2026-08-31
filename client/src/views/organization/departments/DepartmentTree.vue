<script setup lang="ts">
/**
 * 部门树管理（M5-2-A1）
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import StatusTag from '@/components/StatusTag.vue';
import DepartmentFormDialog from './DepartmentFormDialog.vue';
import { listCompanies } from '@/api/company';
import { deleteDepartment, getDepartmentTree } from '@/api/department';
import type { Company, Department } from '@/api/types/organization';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import { useDictStore } from '@/stores/dict';

const router = useRouter();
const userStore = useUserStore();
const dictStore = useDictStore();
const canWrite = computed(() => hasPermission(userStore.userInfo, 'department:write'));

const companies = ref<Company[]>([]);
const companyId = ref('');
const tree = ref<Department[]>([]);
const loading = ref(false);
const formVisible = ref(false);
const editing = ref<Department | null>(null);
const parentForCreate = ref<Department | null>(null);

async function loadCompanies(): Promise<void> {
  const res = await dictStore.get('companies:all', () => listCompanies({ page: 1, pageSize: 100 }));
  companies.value = res.items;
  if (!companyId.value && companies.value[0]) {
    companyId.value = companies.value[0].id;
  }
}

async function loadTree(): Promise<void> {
  if (!companyId.value) {
    tree.value = [];
    return;
  }
  loading.value = true;
  try {
    tree.value = await getDepartmentTree(companyId.value);
  } finally {
    loading.value = false;
  }
}

function openCreate(parent: Department | null): void {
  parentForCreate.value = parent;
  editing.value = null;
  formVisible.value = true;
}

function openEdit(row: Department): void {
  editing.value = row;
  parentForCreate.value = null;
  formVisible.value = true;
}

async function onDelete(row: Department): Promise<void> {
  await ElMessageBox.confirm(`删除部门「${row.name}」？`, '提示', { type: 'warning' });
  await deleteDepartment(row.id);
  ElMessage.success('已删除');
  await loadTree();
}

onMounted(async () => {
  await loadCompanies();
  await loadTree();
});
</script>

<template>
  <div>
    <PageHeader title="部门管理" :breadcrumb="[{ label: '组织人事' }, { label: '部门管理' }]">
      <template #actions>
        <el-button v-if="canWrite" type="primary" :disabled="!companyId" @click="openCreate(null)">
          创建根部门
        </el-button>
      </template>
    </PageHeader>
    <el-form inline>
      <el-form-item label="法人公司">
        <el-select v-model="companyId" style="width: 240px" @change="loadTree">
          <el-option
            v-for="c in companies"
            :key="c.id"
            :label="`${c.name}（${c.code}）`"
            :value="c.id"
          />
        </el-select>
      </el-form-item>
    </el-form>
    <el-card v-loading="loading" shadow="never">
      <el-tree
        v-if="tree.length"
        :data="tree"
        node-key="id"
        default-expand-all
        :props="{ label: 'name', children: 'children' }"
      >
        <template #default="{ data }">
          <span class="dept-node">
            <span>{{ data.name }}（{{ data.code }}）</span>
            <StatusTag :status="data.status" />
            <el-button link type="primary" @click.stop="router.push(`/org/departments/${data.id}`)">
              详情
            </el-button>
            <template v-if="canWrite">
              <el-button link type="primary" @click.stop="openCreate(data)">子部门</el-button>
              <el-button link type="primary" @click.stop="openEdit(data)">编辑</el-button>
              <el-button link type="danger" @click.stop="onDelete(data)">删除</el-button>
            </template>
          </span>
        </template>
      </el-tree>
      <EmptyState v-else description="请选择法人公司或创建部门" />
    </el-card>
    <DepartmentFormDialog
      v-model="formVisible"
      :company-id="companyId"
      :department="editing"
      :parent="parentForCreate"
      @saved="loadTree"
    />
  </div>
</template>

<style scoped>
.dept-node {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
</style>
