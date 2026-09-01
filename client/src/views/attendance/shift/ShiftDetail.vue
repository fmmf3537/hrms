<script setup lang="ts">
/**
 * 班次详情（M5-2-B）
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import StatusTag from '@/components/StatusTag.vue';
import { getShift, updateShift } from '@/api/shift';
import { attendanceStatusLabel, attendanceTagType, type Shift } from '@/api/types/attendance';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import { formatDate } from '@/utils/format';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const canWrite = computed(() => hasPermission(userStore.userInfo, 'shift:write'));
const canAssign = computed(() => hasPermission(userStore.userInfo, 'shift:assign'));
const loading = ref(false);
const record = ref<Shift | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  try {
    record.value = await getShift(String(route.params.id));
  } finally {
    loading.value = false;
  }
}

async function archive(): Promise<void> {
  if (!record.value) {
    return;
  }
  await updateShift(record.value.id, { status: 'archived' });
  ElMessage.success('已归档');
  await load();
}

onMounted(load);
</script>

<template>
  <div v-loading="loading">
    <PageHeader
      :title="record?.name || '班次详情'"
      :breadcrumb="[
        { label: '考勤假勤', to: '/attendance/shifts' },
        { label: '班次管理', to: '/attendance/shifts' },
        { label: '详情' },
      ]"
    >
      <template #actions>
        <el-button @click="router.push('/attendance/shifts')">返回</el-button>
        <el-button
          v-if="canAssign && record?.status === 'active'"
          type="primary"
          @click="router.push(`/attendance/shifts/${route.params.id}/assign`)"
        >
          排班
        </el-button>
        <el-button v-if="canWrite && record?.status === 'active'" @click="archive">归档</el-button>
      </template>
    </PageHeader>
    <el-card v-if="record" shadow="never">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="编码">{{ record.code }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <StatusTag :status="record.status" :type="attendanceTagType(record.status)" />
          {{ attendanceStatusLabel(record.status) }}
        </el-descriptions-item>
        <el-descriptions-item label="类型">{{ record.shiftType }}</el-descriptions-item>
        <el-descriptions-item label="工时">{{ record.workHours }}</el-descriptions-item>
        <el-descriptions-item label="上班">{{ record.startTime }}</el-descriptions-item>
        <el-descriptions-item label="下班">{{ record.endTime }}</el-descriptions-item>
        <el-descriptions-item label="生效">{{ formatDate(record.effectiveFrom) }}</el-descriptions-item>
        <el-descriptions-item label="失效">{{ formatDate(record.effectiveTo) }}</el-descriptions-item>
        <el-descriptions-item label="说明" :span="2">{{ record.description || '—' }}</el-descriptions-item>
      </el-descriptions>
    </el-card>
    <el-card v-if="record" shadow="never" class="block">
      <template #header>排班分配</template>
      <el-table :data="record.assignments || []" stripe>
        <el-table-column prop="assigneeType" label="维度" width="120" />
        <el-table-column prop="employeeId" label="员工" />
        <el-table-column prop="departmentId" label="部门" />
        <el-table-column label="生效">
          <template #default="{ row }">{{ formatDate(row.effectiveFrom) }}</template>
        </el-table-column>
      </el-table>
      <p v-if="!(record.assignments && record.assignments.length)" class="hint">暂无分配记录</p>
    </el-card>
  </div>
</template>

<style scoped>
.block {
  margin-top: 16px;
}
.hint {
  color: #909399;
  margin: 8px 0 0;
}
</style>
