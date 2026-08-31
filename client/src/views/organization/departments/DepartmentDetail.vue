<script setup lang="ts">
/**
 * 部门详情 + 部门员工（M5-2-A1）
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import StatusTag from '@/components/StatusTag.vue';
import EmptyState from '@/components/EmptyState.vue';
import { getDepartment, getDepartmentHeadcount, listDepartmentEmployees, moveDepartment } from '@/api/department';
import type { Department, DepartmentHeadcount, Employee } from '@/api/types/organization';
import { formatDate } from '@/utils/format';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import DepartmentHead from './DepartmentHead.vue';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const canWrite = computed(() => hasPermission(userStore.userInfo, 'department:write'));

const loading = ref(false);
const dept = ref<Department | null>(null);
const headcount = ref<DepartmentHeadcount | null>(null);
const employees = ref<Employee[]>([]);
const empTotal = ref(0);

async function load(): Promise<void> {
  const id = String(route.params.id);
  loading.value = true;
  try {
    dept.value = await getDepartment(id);
    headcount.value = await getDepartmentHeadcount(id);
    const page = await listDepartmentEmployees(id, 1, 50);
    employees.value = page.items;
    empTotal.value = page.total;
  } finally {
    loading.value = false;
  }
}

async function onMoveRoot(): Promise<void> {
  if (!dept.value) {
    return;
  }
  await moveDepartment(dept.value.id, { newParentId: null });
  ElMessage.success('已移至根级');
  await load();
}

onMounted(load);
</script>

<template>
  <div v-loading="loading">
    <PageHeader
      :title="dept?.name || '部门详情'"
      :breadcrumb="[
        { label: '组织人事', to: '/org/departments' },
        { label: '部门管理', to: '/org/departments' },
        { label: '详情' },
      ]"
    >
      <template #actions>
        <el-button @click="router.push('/org/departments')">返回</el-button>
        <el-button v-if="canWrite && dept?.parentId" @click="onMoveRoot">移至根级</el-button>
      </template>
    </PageHeader>
    <el-row v-if="dept" :gutter="16">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>基础信息</template>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="编码">{{ dept.code }}</el-descriptions-item>
            <el-descriptions-item label="状态">
              <StatusTag :status="dept.status" />
            </el-descriptions-item>
            <el-descriptions-item label="编制">{{ dept.headcount }}</el-descriptions-item>
            <el-descriptions-item v-if="headcount" label="在岗">
              {{ headcount.currentCount }}（{{ headcount.warningLevel }}）
            </el-descriptions-item>
            <el-descriptions-item label="排序">{{ dept.order }}</el-descriptions-item>
            <el-descriptions-item label="更新">{{ formatDate(dept.updatedAt) }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
        <DepartmentHead :department="dept" @saved="load" />
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>部门员工（{{ empTotal }}）</template>
          <el-table v-if="employees.length" :data="employees" stripe>
            <el-table-column prop="employeeNo" label="工号" width="120" />
            <el-table-column prop="name" label="姓名" />
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <StatusTag :status="row.status" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="80">
              <template #default="{ row }">
                <el-button link type="primary" @click="router.push(`/org/employees/${row.id}`)">
                  详情
                </el-button>
              </template>
            </el-table-column>
          </el-table>
          <EmptyState v-else />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>
