<script setup lang="ts">
/**
 * 组织架构图（M5-2-A1）
 * 部门树 + 按部门聚合员工卡片
 */
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import StatusTag from '@/components/StatusTag.vue';
import { listCompanies } from '@/api/company';
import { getDepartmentTree } from '@/api/department';
import { listEmployees } from '@/api/employee';
import type { Company, Department, Employee } from '@/api/types/organization';

const router = useRouter();
const companies = ref<Company[]>([]);
const companyId = ref('');
const tree = ref<Department[]>([]);
const employees = ref<Employee[]>([]);
const loading = ref(false);

function flattenDepts(nodes: Department[]): Department[] {
  const out: Department[] = [];
  nodes.forEach((n) => {
    out.push(n);
    if (n.children?.length) {
      out.push(...flattenDepts(n.children));
    }
  });
  return out;
}

function employeesOf(deptId: string): Employee[] {
  return employees.value.filter((e) => e.departmentId === deptId);
}

async function load(): Promise<void> {
  if (!companyId.value) {
    return;
  }
  loading.value = true;
  try {
    tree.value = await getDepartmentTree(companyId.value);
    const page = await listEmployees({ companyId: companyId.value, pageSize: 100 });
    employees.value = page.items;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  const res = await listCompanies({ page: 1, pageSize: 100 });
  companies.value = res.items;
  if (companies.value[0]) {
    companyId.value = companies.value[0].id;
    await load();
  }
});
</script>

<template>
  <div>
    <PageHeader
      title="组织架构图"
      :breadcrumb="[{ label: '组织人事' }, { label: '组织架构图' }]"
    />
    <el-form inline>
      <el-form-item label="法人公司">
        <el-select v-model="companyId" style="width: 240px" @change="load">
          <el-option v-for="c in companies" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
      </el-form-item>
    </el-form>
    <div v-loading="loading">
      <EmptyState v-if="!tree.length" description="暂无部门" />
      <el-row v-else :gutter="12">
        <el-col v-for="dept in flattenDepts(tree)" :key="dept.id" :xs="24" :sm="12" :md="8">
          <el-card shadow="hover" class="dept-card">
            <template #header>{{ dept.name }}</template>
            <div v-if="employeesOf(dept.id).length === 0" class="muted">暂无员工</div>
            <el-button
              v-for="emp in employeesOf(dept.id)"
              :key="emp.id"
              class="emp-row"
              text
              @click="router.push(`/org/employees/${emp.id}`)"
            >
              <span>{{ emp.name }}</span>
              <StatusTag :status="emp.status" />
            </el-button>
          </el-card>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<style scoped>
.dept-card {
  margin-bottom: 12px;
}

.emp-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  cursor: pointer;
  border-bottom: 1px solid #f0f0f0;
}

.muted {
  color: #909399;
  font-size: 13px;
}
</style>
