<script setup lang="ts">
/**
 * 员工档案列表（M5-2-A1）
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import SearchForm from '@/components/SearchForm.vue';
import EmptyState from '@/components/EmptyState.vue';
import StatusTag from '@/components/StatusTag.vue';
import EmployeeFormDialog from './EmployeeFormDialog.vue';
import EmployeeImportDialog from './EmployeeImportDialog.vue';
import { deleteEmployee, getEmployeeStatistics, listEmployees } from '@/api/employee';
import { listCompanies } from '@/api/company';
import { listDepartments } from '@/api/department';
import type {
  Company,
  Department,
  Employee,
  EmployeeStatistics,
  EmployeeStatus,
} from '@/api/types/organization';
import { formatDate } from '@/utils/format';
import { maskSensitiveDisplay } from '@/api/types/organization';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';

const router = useRouter();
const userStore = useUserStore();
const canWrite = computed(() => hasPermission(userStore.userInfo, 'employee:write'));

const loading = ref(false);
const list = ref<Employee[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const companies = ref<Company[]>([]);
const departments = ref<Department[]>([]);
const companyId = ref('');
const departmentId = ref('');
const status = ref<EmployeeStatus | ''>('');
const keyword = ref('');
const stats = ref<EmployeeStatistics | null>(null);
const formVisible = ref(false);
const importVisible = ref(false);
const editing = ref<Employee | null>(null);

async function loadFilters(): Promise<void> {
  const res = await listCompanies({ page: 1, pageSize: 100 });
  companies.value = res.items;
}

async function loadDepts(): Promise<void> {
  if (!companyId.value) {
    departments.value = [];
    return;
  }
  departments.value = await listDepartments({ companyId: companyId.value });
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const res = await listEmployees({
      companyId: companyId.value || undefined,
      departmentId: departmentId.value || undefined,
      status: status.value || undefined,
      keyword: keyword.value || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
    list.value = res.items;
    total.value = res.total;
    stats.value = await getEmployeeStatistics(companyId.value || undefined);
  } finally {
    loading.value = false;
  }
}

function onSearch(): void {
  page.value = 1;
  load();
}

function onReset(): void {
  companyId.value = '';
  departmentId.value = '';
  status.value = '';
  keyword.value = '';
  page.value = 1;
  load();
}

function openCreate(): void {
  editing.value = null;
  formVisible.value = true;
}

function openEdit(row: Employee): void {
  editing.value = row;
  formVisible.value = true;
}

async function onDelete(row: Employee): Promise<void> {
  await ElMessageBox.confirm(`删除员工「${row.name}」？`, '提示', { type: 'warning' });
  await deleteEmployee(row.id);
  ElMessage.success('已删除');
  await load();
}

function onExport(): void {
  ElMessage.info('后端无 /employees/export，导出留后续切片');
}

onMounted(async () => {
  await loadFilters();
  await load();
});
</script>

<template>
  <div>
    <PageHeader title="员工档案" :breadcrumb="[{ label: '组织人事' }, { label: '员工档案' }]">
      <template #actions>
        <el-button @click="router.push('/org/employees/org-chart')">组织架构图</el-button>
        <el-button @click="onExport">导出</el-button>
        <el-button v-if="canWrite" @click="importVisible = true">导入</el-button>
        <el-button v-if="canWrite" type="primary" @click="openCreate">创建</el-button>
      </template>
    </PageHeader>
    <el-row v-if="stats" :gutter="12" class="stats">
      <el-col :span="6"><el-tag>合计 {{ stats.total }}</el-tag></el-col>
      <el-col :span="6"><el-tag type="success">在职 {{ stats.active }}</el-tag></el-col>
      <el-col :span="6"><el-tag type="warning">试用 {{ stats.probation }}</el-tag></el-col>
      <el-col :span="6"><el-tag type="danger">离职 {{ stats.resigned }}</el-tag></el-col>
    </el-row>
    <SearchForm @search="onSearch" @reset="onReset">
      <el-form-item label="公司">
        <el-select v-model="companyId" clearable style="width: 200px" @change="loadDepts">
          <el-option v-for="c in companies" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="部门">
        <el-select v-model="departmentId" clearable style="width: 180px">
          <el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="status" clearable style="width: 140px">
          <el-option label="试用期" value="probation" />
          <el-option label="在职" value="active" />
          <el-option label="已离职" value="resigned" />
        </el-select>
      </el-form-item>
      <el-form-item label="关键词">
        <el-input v-model="keyword" clearable placeholder="姓名/工号/邮箱" />
      </el-form-item>
    </SearchForm>
    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column prop="employeeNo" label="工号" width="130" />
      <el-table-column prop="name" label="姓名" width="100" />
      <el-table-column label="手机" width="120">
        <template #default="{ row }">{{ maskSensitiveDisplay(row.phone) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <StatusTag :status="row.status" />
        </template>
      </el-table-column>
      <el-table-column label="入职" width="120">
        <template #default="{ row }">{{ formatDate(row.hireDate) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="router.push(`/org/employees/${row.id}`)">
            详情
          </el-button>
          <el-button v-if="canWrite" link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button v-if="canWrite" link type="danger" @click="onDelete(row)">删除</el-button>
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
      />
    </div>
    <EmployeeFormDialog v-model="formVisible" :employee="editing" @saved="load" />
    <EmployeeImportDialog v-model="importVisible" />
  </div>
</template>

<style scoped>
.stats {
  margin-bottom: 12px;
}

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
