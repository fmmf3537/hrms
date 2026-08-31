<script setup lang="ts">
/**
 * 离职证明（M5-2-A2）
 * mock PDF 占位；V1.2 §三.6 真实 PDF 留二期
 */
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '@/components/PageHeader.vue';
import StatusTag from '@/components/StatusTag.vue';
import { getOffboarding } from '@/api/offboarding';
import type { Offboarding } from '@/api/types/organization';
import { lifecycleStatusLabel, lifecycleTagType } from '@/api/types/organization';
import { formatDate } from '@/utils/format';

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const record = ref<Offboarding | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  try {
    record.value = await getOffboarding(String(route.params.id));
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div v-loading="loading">
    <PageHeader
      title="离职证明"
      :breadcrumb="[
        { label: '组织人事', to: '/org/offboarding' },
        { label: '离职管理', to: '/org/offboarding' },
        { label: '离职证明' },
      ]"
    >
      <template #actions>
        <el-button @click="router.push(`/org/offboarding/${route.params.id}`)">返回详情</el-button>
      </template>
    </PageHeader>
    <el-card v-if="record" shadow="never" class="cert">
      <h2 class="cert__title">离职证明（Mock）</h2>
      <p class="cert__meta">水印占位 · 真实 PDF 生成留二期</p>
      <el-descriptions :column="1" border>
        <el-descriptions-item label="员工">{{ record.employee?.name || '—' }}</el-descriptions-item>
        <el-descriptions-item label="证明编号">{{ record.certificateNumber || '未发放' }}</el-descriptions-item>
        <el-descriptions-item label="发放状态">
          <StatusTag :status="record.status" :type="lifecycleTagType(record.status)" />
          {{ lifecycleStatusLabel(record.status) }}
        </el-descriptions-item>
        <el-descriptions-item label="最后工作日">
          {{ formatDate(record.lastWorkingDate) }}
        </el-descriptions-item>
        <el-descriptions-item label="证明链接">
          {{ record.certificateUrl || '（mock，无真实文件）' }}
        </el-descriptions-item>
      </el-descriptions>
    </el-card>
  </div>
</template>

<style scoped>
.cert {
  max-width: 720px;
}
.cert__title {
  text-align: center;
  margin: 0 0 8px;
}
.cert__meta {
  text-align: center;
  color: #909399;
  margin: 0 0 16px;
  font-size: 13px;
}
</style>
