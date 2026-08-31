<script setup lang="ts">
/**
 * 员工详情（M5-2-A1）
 * 敏感字段后端已脱敏；完整明文二次授权留 TODO
 */
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import StatusTag from '@/components/StatusTag.vue';
import { getEmployee } from '@/api/employee';
import type { Employee } from '@/api/types/organization';
import { formatDate } from '@/utils/format';
import { maskSensitiveDisplay } from '@/api/types/organization';

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const emp = ref<Employee | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  try {
    emp.value = await getEmployee(String(route.params.id));
  } finally {
    loading.value = false;
  }
}

function onReveal(): void {
  ElMessage.info('查看完整敏感字段需二次授权（M0.5-7），留 TODO');
}

function onLifecycle(): void {
  ElMessage.info('调动 / 转正 / 离职走独立流程页（M5-2-A2）');
}

onMounted(load);
</script>

<template>
  <div v-loading="loading">
    <PageHeader
      :title="emp?.name || '员工详情'"
      :breadcrumb="[
        { label: '组织人事', to: '/org/employees' },
        { label: '员工档案', to: '/org/employees' },
        { label: '详情' },
      ]"
    >
      <template #actions>
        <el-button @click="router.push('/org/employees')">返回</el-button>
        <el-button @click="onLifecycle">人事异动</el-button>
      </template>
    </PageHeader>
    <el-card v-if="emp" shadow="never">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="工号">{{ emp.employeeNo }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <StatusTag :status="emp.status" />
        </el-descriptions-item>
        <el-descriptions-item label="姓名">{{ emp.name }}</el-descriptions-item>
        <el-descriptions-item label="性别">{{ emp.gender || '—' }}</el-descriptions-item>
        <el-descriptions-item label="入职">{{ formatDate(emp.hireDate) }}</el-descriptions-item>
        <el-descriptions-item label="离职日">
          {{ formatDate(emp.resignationDate) }}
        </el-descriptions-item>
        <el-descriptions-item label="邮箱">{{ emp.email || '—' }}</el-descriptions-item>
        <el-descriptions-item label="手机">
          {{ maskSensitiveDisplay(emp.phone) }}
          <el-button link type="primary" @click="onReveal">查看完整</el-button>
        </el-descriptions-item>
        <el-descriptions-item label="身份证">
          {{ maskSensitiveDisplay(emp.idCard) }}
        </el-descriptions-item>
        <el-descriptions-item label="银行卡">
          {{ maskSensitiveDisplay(emp.bankCard) }}
        </el-descriptions-item>
        <el-descriptions-item label="紧急联系人">
          {{ emp.emergencyContactName || '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="紧急电话">
          {{ maskSensitiveDisplay(emp.emergencyContactPhone) }}
        </el-descriptions-item>
      </el-descriptions>
    </el-card>
  </div>
</template>
