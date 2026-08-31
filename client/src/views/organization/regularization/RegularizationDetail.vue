<script setup lang="ts">
/**
 * 转正详情（M5-2-A2）
 * 转正前后薪资对比：薪资明细由 M4 切片管，此处仅展示申请单字段
 */
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '@/components/PageHeader.vue';
import StatusTag from '@/components/StatusTag.vue';
import { getRegularization } from '@/api/regularization';
import type { Regularization } from '@/api/types/organization';
import { lifecycleStatusLabel, lifecycleTagType } from '@/api/types/organization';
import { formatAmount, formatDate } from '@/utils/format';

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const record = ref<Regularization | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  try {
    record.value = await getRegularization(String(route.params.id));
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div v-loading="loading">
    <PageHeader
      :title="record?.employee?.name || '转正详情'"
      :breadcrumb="[
        { label: '组织人事', to: '/org/regularizations' },
        { label: '转正管理', to: '/org/regularizations' },
        { label: '详情' },
      ]"
    >
      <template #actions>
        <el-button @click="router.push('/org/regularizations')">返回</el-button>
      </template>
    </PageHeader>
    <el-card v-if="record" shadow="never">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="员工">{{ record.employee?.name || '—' }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <StatusTag :status="record.status" :type="lifecycleTagType(record.status)" />
          {{ lifecycleStatusLabel(record.status) }}
        </el-descriptions-item>
        <el-descriptions-item label="入职日">{{ formatDate(record.hireDate) }}</el-descriptions-item>
        <el-descriptions-item label="试用期满">
          {{ formatDate(record.probationEndDate) }}
        </el-descriptions-item>
        <el-descriptions-item label="申请时间">{{ formatDate(record.appliedAt) }}</el-descriptions-item>
        <el-descriptions-item label="绩效分">{{ record.performanceScore ?? '—' }}</el-descriptions-item>
        <el-descriptions-item label="自评" :span="2">{{ record.selfEvaluation || '—' }}</el-descriptions-item>
        <el-descriptions-item label="主管评" :span="2">
          {{ record.managerEvaluation || '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="HR 评" :span="2">{{ record.hrEvaluation || '—' }}</el-descriptions-item>
      </el-descriptions>
    </el-card>
    <el-card v-if="record" shadow="never" class="block">
      <template #header>转正后薪资（对比明细由 M4 薪酬切片管，此处仅展示申请单）</template>
      <el-descriptions :column="3" border>
        <el-descriptions-item label="基本工资">
          {{ formatAmount(record.newBaseSalary) }}
        </el-descriptions-item>
        <el-descriptions-item label="绩效工资">
          {{ formatAmount(record.newPerformanceSalary) }}
        </el-descriptions-item>
        <el-descriptions-item label="合计">
          {{ formatAmount(record.newTotalSalary) }}
        </el-descriptions-item>
      </el-descriptions>
      <p class="hint">转正前后完整对比需联调 employee_salary_history（M4）。</p>
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
  font-size: 13px;
}
</style>
