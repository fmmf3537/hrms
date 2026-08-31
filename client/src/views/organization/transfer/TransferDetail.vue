<script setup lang="ts">
/**
 * 调动详情（M5-2-A2）
 * 4 级审批流节点展示留 TODO（M0.5-1 联动）
 */
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '@/components/PageHeader.vue';
import StatusTag from '@/components/StatusTag.vue';
import { getTransfer } from '@/api/transfer';
import type { Transfer } from '@/api/types/organization';
import { lifecycleStatusLabel, lifecycleTagType } from '@/api/types/organization';
import { formatAmount, formatDate } from '@/utils/format';

const TYPE_LABEL: Record<string, string> = {
  transfer: '平调',
  promote: '晋升',
  demote: '降职',
};

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const record = ref<Transfer | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  try {
    record.value = await getTransfer(String(route.params.id));
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div v-loading="loading">
    <PageHeader
      :title="record?.employee?.name || '调动详情'"
      :breadcrumb="[
        { label: '组织人事', to: '/org/transfers' },
        { label: '调动管理', to: '/org/transfers' },
        { label: '详情' },
      ]"
    >
      <template #actions>
        <el-button @click="router.push('/org/transfers')">返回</el-button>
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
          {{ TYPE_LABEL[record.transferType] || record.transferType }}
        </el-descriptions-item>
        <el-descriptions-item label="生效日">{{ formatDate(record.effectiveDate) }}</el-descriptions-item>
        <el-descriptions-item label="原岗位">{{ record.fromPosition || '—' }}</el-descriptions-item>
        <el-descriptions-item label="目标岗位">{{ record.toPosition }}</el-descriptions-item>
        <el-descriptions-item label="原因" :span="2">{{ record.reason || '—' }}</el-descriptions-item>
        <el-descriptions-item label="新基本工资">{{ formatAmount(record.newBaseSalary) }}</el-descriptions-item>
        <el-descriptions-item label="审批实例">{{ record.approvalInstanceId || '—' }}</el-descriptions-item>
      </el-descriptions>
    </el-card>
    <el-card v-if="record" shadow="never" class="block">
      <template #header>4 级审批流</template>
      <p class="hint">
        调出部门 → 调入部门 → HR → 总经理（M0.5-1 approval_instances）。节点时间轴留 TODO。
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
  margin: 0;
  font-size: 13px;
}
</style>
