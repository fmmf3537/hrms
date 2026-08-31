<script setup lang="ts">
/**
 * 合同详情（M5-2-A2）
 * e-签宝真实 SaaS 留二期；附件下载留 TODO
 */
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '@/components/PageHeader.vue';
import StatusTag from '@/components/StatusTag.vue';
import { getContract } from '@/api/contract';
import type { Contract } from '@/api/types/organization';
import { lifecycleStatusLabel, lifecycleTagType } from '@/api/types/organization';
import { formatAmount, formatDate } from '@/utils/format';

const TYPE_LABEL: Record<string, string> = {
  formal: '劳动合同',
  intern: '实习',
  consultant: '顾问',
  labor: '劳务',
  nda: '保密协议',
};

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const record = ref<Contract | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  try {
    record.value = await getContract(String(route.params.id));
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div v-loading="loading">
    <PageHeader
      :title="record?.title || '合同详情'"
      :breadcrumb="[
        { label: '组织人事', to: '/org/contracts' },
        { label: '合同管理', to: '/org/contracts' },
        { label: '详情' },
      ]"
    >
      <template #actions>
        <el-button @click="router.push('/org/contracts')">返回</el-button>
      </template>
    </PageHeader>
    <el-card v-if="record" shadow="never">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="员工">{{ record.employee?.name || '—' }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <StatusTag :status="record.status" :type="lifecycleTagType(record.status)" />
          {{ lifecycleStatusLabel(record.status) }}
        </el-descriptions-item>
        <el-descriptions-item label="合同编号">{{ record.contractNo }}</el-descriptions-item>
        <el-descriptions-item label="类型">
          {{ TYPE_LABEL[record.contractType] || record.contractType }}
        </el-descriptions-item>
        <el-descriptions-item label="标题" :span="2">{{ record.title }}</el-descriptions-item>
        <el-descriptions-item label="开始">{{ formatDate(record.startDate) }}</el-descriptions-item>
        <el-descriptions-item label="结束">{{ formatDate(record.endDate) }}</el-descriptions-item>
        <el-descriptions-item label="岗位">{{ record.position || '—' }}</el-descriptions-item>
        <el-descriptions-item label="薪资">{{ formatAmount(record.baseSalary) }}</el-descriptions-item>
        <el-descriptions-item label="e-签宝流水">{{ record.esignFlowId || '（mock）' }}</el-descriptions-item>
        <el-descriptions-item label="签署时间">{{ formatDate(record.signedAt) }}</el-descriptions-item>
      </el-descriptions>
    </el-card>
    <el-card v-if="record" shadow="never" class="block">
      <template #header>电子签 / 附件</template>
      <p class="hint">e-签宝真实 SaaS 集成留二期（当前 provider={{ record.esignProvider || 'mock' }}）。</p>
      <p class="hint">附件下载留 TODO；附件数 {{ record.attachments?.length ?? 0 }}。</p>
    </el-card>
  </div>
</template>

<style scoped>
.block {
  margin-top: 16px;
}
.hint {
  color: #909399;
  margin: 0 0 8px;
  font-size: 13px;
}
</style>
