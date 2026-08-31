<script setup lang="ts">
/**
 * 入职详情（M5-2-A2）
 * 任务清单 onboarding_tasks + OCR 字段；审批流节点留 TODO
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '@/components/PageHeader.vue';
import StatusTag from '@/components/StatusTag.vue';
import OnboardingConfirm from './OnboardingConfirm.vue';
import { getOnboarding } from '@/api/onboarding';
import type { Onboarding } from '@/api/types/organization';
import {
  lifecycleStatusLabel,
  lifecycleTagType,
  maskSensitiveDisplay,
} from '@/api/types/organization';
import { formatAmount, formatDate } from '@/utils/format';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const canConfirm = computed(() => hasPermission(userStore.userInfo, 'onboarding:confirm'));
const loading = ref(false);
const record = ref<Onboarding | null>(null);
const confirmVisible = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  try {
    record.value = await getOnboarding(String(route.params.id));
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div v-loading="loading">
    <PageHeader
      :title="record?.name || '入职详情'"
      :breadcrumb="[
        { label: '组织人事', to: '/org/onboarding' },
        { label: '入职管理', to: '/org/onboarding' },
        { label: '详情' },
      ]"
    >
      <template #actions>
        <el-button @click="router.push('/org/onboarding')">返回</el-button>
        <el-button
          v-if="canConfirm && record && (record.status === 'draft' || record.status === 'submitted')"
          type="primary"
          @click="confirmVisible = true"
        >
          确认
        </el-button>
      </template>
    </PageHeader>
    <el-card v-if="record" shadow="never">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="姓名">{{ record.name }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <StatusTag :status="record.status" :type="lifecycleTagType(record.status)" />
          {{ lifecycleStatusLabel(record.status) }}
        </el-descriptions-item>
        <el-descriptions-item label="公司">{{ record.company?.name || '—' }}</el-descriptions-item>
        <el-descriptions-item label="部门">{{ record.department?.name || '—' }}</el-descriptions-item>
        <el-descriptions-item label="入职日期">{{ formatDate(record.hireDate) }}</el-descriptions-item>
        <el-descriptions-item label="合同类型">{{ record.contractType }}</el-descriptions-item>
        <el-descriptions-item label="试用期">{{ record.probationMonths ?? '—' }} 月</el-descriptions-item>
        <el-descriptions-item label="薪资">{{ formatAmount(record.baseSalary) }}</el-descriptions-item>
        <el-descriptions-item label="手机">{{ maskSensitiveDisplay(record.phone) }}</el-descriptions-item>
        <el-descriptions-item label="身份证">{{ maskSensitiveDisplay(record.idCard) }}</el-descriptions-item>
        <el-descriptions-item label="银行卡">{{ maskSensitiveDisplay(record.bankCard) }}</el-descriptions-item>
        <el-descriptions-item label="审批实例">{{ record.approvalInstanceId || '—' }}</el-descriptions-item>
      </el-descriptions>
    </el-card>
    <el-card v-if="record" shadow="never" class="block">
      <template #header>入职任务清单</template>
      <el-table :data="record.tasks || []" stripe>
        <el-table-column prop="name" label="任务" />
        <el-table-column prop="category" label="类别" width="120" />
        <el-table-column prop="status" label="状态" width="120" />
        <el-table-column label="完成时间" width="140">
          <template #default="{ row }">{{ formatDate(row.completedAt) }}</template>
        </el-table-column>
      </el-table>
      <p v-if="!(record.tasks && record.tasks.length)" class="hint">暂无任务</p>
    </el-card>
    <OnboardingConfirm v-model="confirmVisible" :record="record" @saved="load" />
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
