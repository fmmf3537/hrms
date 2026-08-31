<script setup lang="ts">
/**
 * 离职详情（M5-2-A2）
 * 交接清单 5 项模板由后端 configs.offboarding.handover_template 生成
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import StatusTag from '@/components/StatusTag.vue';
import { confirmHandover, getOffboarding, issueCertificate } from '@/api/offboarding';
import type { Offboarding } from '@/api/types/organization';
import { lifecycleStatusLabel, lifecycleTagType } from '@/api/types/organization';
import { formatDate } from '@/utils/format';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';

const TYPE_LABEL: Record<string, string> = {
  employee_initiated: '员工主动',
  company_initiated: '公司辞退',
};

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const canWrite = computed(() => hasPermission(userStore.userInfo, 'offboarding:write'));
const canCert = computed(() => hasPermission(userStore.userInfo, 'offboarding:certificate'));
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

async function onHandover(): Promise<void> {
  if (!record.value) {
    return;
  }
  try {
    await ElMessageBox.confirm('确认工作交接完成？', '确认交接', { type: 'warning' });
    await confirmHandover(record.value.id);
    ElMessage.success('已确认交接');
    await load();
  } catch {
    /* 取消 */
  }
}

async function onIssue(): Promise<void> {
  if (!record.value) {
    return;
  }
  try {
    await ElMessageBox.confirm('发放离职证明？', '发放证明', { type: 'warning' });
    await issueCertificate(record.value.id);
    router.push(`/org/offboarding/${record.value.id}/certificate`);
  } catch {
    /* 取消 */
  }
}

onMounted(load);
</script>

<template>
  <div v-loading="loading">
    <PageHeader
      :title="record?.employee?.name || '离职详情'"
      :breadcrumb="[
        { label: '组织人事', to: '/org/offboarding' },
        { label: '离职管理', to: '/org/offboarding' },
        { label: '详情' },
      ]"
    >
      <template #actions>
        <el-button @click="router.push('/org/offboarding')">返回</el-button>
        <el-button
          v-if="canWrite && record && !record.handoverCompleted"
          type="primary"
          @click="onHandover"
        >
          确认交接
        </el-button>
        <el-button
          v-if="canCert && record && record.status === 'approved'"
          type="success"
          @click="onIssue"
        >
          发放证明
        </el-button>
      </template>
    </PageHeader>
    <el-card v-if="record" shadow="never">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="员工">{{ record.employee?.name || '—' }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <StatusTag :status="record.status" :type="lifecycleTagType(record.status)" />
          {{ lifecycleStatusLabel(record.status) }}
        </el-descriptions-item>
        <el-descriptions-item label="类型">
          {{ TYPE_LABEL[record.resignationType] || record.resignationType }}
        </el-descriptions-item>
        <el-descriptions-item label="最后工作日">
          {{ formatDate(record.lastWorkingDate) }}
        </el-descriptions-item>
        <el-descriptions-item label="原因" :span="2">{{ record.reason || '—' }}</el-descriptions-item>
        <el-descriptions-item label="交接完成">
          {{ record.handoverCompleted ? '是' : '否' }}
        </el-descriptions-item>
        <el-descriptions-item label="证明编号">{{ record.certificateNumber || '—' }}</el-descriptions-item>
        <el-descriptions-item label="档案保留">{{ record.archiveRetentionYears }} 年</el-descriptions-item>
      </el-descriptions>
    </el-card>
    <el-card v-if="record" shadow="never" class="block">
      <template #header>工作交接清单</template>
      <el-table :data="record.tasks || []" stripe>
        <el-table-column prop="name" label="事项" />
        <el-table-column prop="category" label="类别" width="120" />
        <el-table-column prop="status" label="状态" width="120" />
        <el-table-column label="完成时间" width="140">
          <template #default="{ row }">{{ formatDate(row.completedAt) }}</template>
        </el-table-column>
      </el-table>
      <p v-if="!(record.tasks && record.tasks.length)" class="hint">
        清单由后端 configs.offboarding.handover_template 生成；空表示尚未拉取任务。
      </p>
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
