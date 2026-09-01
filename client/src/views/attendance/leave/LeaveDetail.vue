<script setup lang="ts">
/**
 * 请假详情（M5-2-B）审批流节点留 TODO
 */
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '@/components/PageHeader.vue';
import StatusTag from '@/components/StatusTag.vue';
import { getLeaveRequest } from '@/api/leave';
import type { LeaveRequest } from '@/api/types/attendance';
import { attendanceStatusLabel, attendanceTagType } from '@/api/types/attendance';
import { formatDate } from '@/utils/format';

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const record = ref<LeaveRequest | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  try {
    record.value = await getLeaveRequest(String(route.params.id));
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div v-loading="loading">
    <PageHeader
      title="请假详情"
      :breadcrumb="[
        { label: '考勤假勤', to: '/attendance/leaves' },
        { label: '请假管理', to: '/attendance/leaves' },
        { label: '详情' },
      ]"
    >
      <template #actions>
        <el-button @click="router.push('/attendance/leaves')">返回</el-button>
      </template>
    </PageHeader>
    <el-card v-if="record" shadow="never">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="员工">{{ record.employee?.name || '—' }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <StatusTag :status="record.status" :type="attendanceTagType(record.status)" />
          {{ attendanceStatusLabel(record.status) }}
        </el-descriptions-item>
        <el-descriptions-item label="类型">{{ record.leaveType }}</el-descriptions-item>
        <el-descriptions-item label="天数">{{ record.totalDays }}</el-descriptions-item>
        <el-descriptions-item label="开始">{{ formatDate(record.startDate) }}</el-descriptions-item>
        <el-descriptions-item label="结束">{{ formatDate(record.endDate) }}</el-descriptions-item>
        <el-descriptions-item label="事由" :span="2">{{ record.reason || '—' }}</el-descriptions-item>
        <el-descriptions-item label="审批实例">{{ record.approvalInstanceId || '—' }}</el-descriptions-item>
        <el-descriptions-item label="附件数">{{ record.attachments?.length ?? 0 }}</el-descriptions-item>
      </el-descriptions>
    </el-card>
    <el-card v-if="record" shadow="never" class="block">
      <template #header>审批流</template>
      <p class="hint">M0.5-1 审批节点时间轴留 TODO。</p>
    </el-card>
  </div>
</template>

<style scoped>
.block {
  margin-top: 16px;
}
.hint {
  color: #909399;
  margin: 0;
}
</style>
