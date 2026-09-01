<script setup lang="ts">
/**
 * 打卡详情（M5-2-B）
 */
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '@/components/PageHeader.vue';
import StatusTag from '@/components/StatusTag.vue';
import { getRecord } from '@/api/attendance';
import type { AttendanceRecord } from '@/api/types/attendance';
import { attendanceStatusLabel, attendanceTagType } from '@/api/types/attendance';
import { formatDate } from '@/utils/format';

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const record = ref<AttendanceRecord | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  try {
    record.value = await getRecord(String(route.params.id));
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div v-loading="loading">
    <PageHeader
      title="打卡详情"
      :breadcrumb="[
        { label: '考勤假勤', to: '/attendance/attendance' },
        { label: '打卡管理', to: '/attendance/attendance' },
        { label: '详情' },
      ]"
    >
      <template #actions>
        <el-button @click="router.push('/attendance/attendance')">返回</el-button>
      </template>
    </PageHeader>
    <el-card v-if="record" shadow="never">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="员工">{{ record.employee?.name || '—' }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <StatusTag :status="record.status" :type="attendanceTagType(record.status)" />
          {{ attendanceStatusLabel(record.status) }}
        </el-descriptions-item>
        <el-descriptions-item label="上班">{{ formatDate(record.clockInTime) }}</el-descriptions-item>
        <el-descriptions-item label="下班">{{ formatDate(record.clockOutTime) }}</el-descriptions-item>
        <el-descriptions-item label="方式">{{ record.clockType }}</el-descriptions-item>
        <el-descriptions-item label="迟到">
          {{ record.isLate ? `${record.lateMinutes} 分钟` : '否' }}
        </el-descriptions-item>
        <el-descriptions-item label="早退">
          {{ record.isEarlyLeave ? `${record.earlyLeaveMinutes} 分钟` : '否' }}
        </el-descriptions-item>
        <el-descriptions-item label="缺卡">{{ record.isMissing ? '是' : '否' }}</el-descriptions-item>
        <el-descriptions-item label="补卡原因" :span="2">{{ record.manualReason || '—' }}</el-descriptions-item>
        <el-descriptions-item label="GPS">{{ record.gpsAddress || '—' }}</el-descriptions-item>
        <el-descriptions-item label="WiFi">{{ record.wifiSsid || '—' }}</el-descriptions-item>
      </el-descriptions>
    </el-card>
  </div>
</template>
