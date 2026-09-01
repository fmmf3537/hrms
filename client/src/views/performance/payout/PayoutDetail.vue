<script setup lang="ts">
/**
 * 绩效奖金 · 奖金单详情（M5-2-D3）
 * @module views/performance/payout/PayoutDetail
 * @description 消费 1 端点：
 *  - GET /payouts/:id  performance:payout:read（含 employee + cycle）
 *
 * 只读页面：无操作按钮（操作在 PayoutList 发起）
 * 展示：描述列表 + 金额明细 + 状态时间线（draft → calculated → prepaid → settled）
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '@/components/PageHeader.vue';
import { getPayout } from '@/api/performancePayout';
import {
  PAYOUT_MODE_LABELS,
  type Payout,
  type PayoutMode,
  type PayoutStatus,
  payoutStatusInfo,
} from '@/api/types/performancePayout';
import { formatAmount, formatDate } from '@/utils/format';

const route = useRoute();
const router = useRouter();
const id = String(route.params.id);

const loading = ref(false);
const payout = ref<Payout | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  try {
    payout.value = await getPayout(id);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function goBack(): void {
  router.push('/performance/payouts');
}

const TIMELINE: Array<{ key: PayoutStatus; label: string }> = [
  { key: 'draft', label: '草稿' },
  { key: 'calculated', label: '已计算' },
  { key: 'prepaid', label: '已预发' },
  { key: 'settled', label: '已结算' },
];

function reachedStatus(current: string, step: PayoutStatus): boolean {
  const order: PayoutStatus[] = ['draft', 'calculated', 'prepaid', 'settled', 'cancelled'];
  const ci = order.indexOf(current as PayoutStatus);
  const si = order.indexOf(step);
  if (current === 'cancelled') return step === 'draft';
  return ci >= 0 && si >= 0 && ci >= si;
}

function stepTime(p: Payout, step: PayoutStatus): string {
  if (step === 'draft') return formatDate(p.createdAt);
  if (step === 'calculated') return p.status !== 'draft' ? formatDate(p.updatedAt) : '';
  if (step === 'prepaid') return p.status === 'prepaid' || p.status === 'settled' ? formatDate(p.updatedAt) : '';
  if (step === 'settled') return p.status === 'settled' ? formatDate(p.updatedAt) : '';
  return '';
}

const activeStep = computed(() => {
  if (!payout.value) return 1;
  const idx = TIMELINE.findIndex((t) => t.key === payout.value!.status);
  return idx >= 0 ? idx + 1 : 1;
});
</script>

<template>
  <div>
    <PageHeader
      title="奖金单详情"
      :breadcrumb="[{ label: '绩效管理' }, { label: '奖金单详情' }]"
    >
      <template #actions>
        <el-button @click="goBack">返回列表</el-button>
      </template>
    </PageHeader>

    <el-card v-loading="loading" shadow="never">
      <el-descriptions v-if="payout" :column="2" border>
        <el-descriptions-item label="奖金单 ID">{{ payout.id }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="payoutStatusInfo(payout.status).type">
            {{ payoutStatusInfo(payout.status).label }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="员工">
          {{ payout.employee?.name ?? payout.employeeId }}
        </el-descriptions-item>
        <el-descriptions-item label="考核周期">
          {{ payout.cycle?.name ?? payout.cycleId }}
        </el-descriptions-item>
        <el-descriptions-item label="期间">
          {{ payout.period ?? formatDate(payout.month) }}
        </el-descriptions-item>
        <el-descriptions-item label="模式">
          <el-tag :type="payout.mode === 'pool' ? 'warning' : 'info'">
            {{ PAYOUT_MODE_LABELS[payout.mode as PayoutMode] ?? payout.mode }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="基数">
          {{ formatAmount(payout.baseAmount) }}
        </el-descriptions-item>
        <el-descriptions-item label="系数">
          {{ payout.coefficient ?? '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="个人占比">
          {{ payout.ratio ?? '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="实际金额">
          <span class="amount">{{ formatAmount(payout.actualAmount) }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="创建时间">
          {{ formatDate(payout.createdAt) }}
        </el-descriptions-item>
        <el-descriptions-item label="更新时间">
          {{ formatDate(payout.updatedAt) }}
        </el-descriptions-item>
        <el-descriptions-item label="创建人" :span="2">
          {{ payout.createdBy ?? '-' }}
        </el-descriptions-item>
      </el-descriptions>

      <div v-if="payout" class="timeline">
        <div class="block-title">状态时间线</div>
        <el-steps :active="activeStep" finish-status="success">
          <el-step
            v-for="t in TIMELINE"
            :key="t.key"
            :title="t.label"
            :description="reachedStatus(payout.status, t.key) ? stepTime(payout, t.key) || '-' : '未到达'"
          />
        </el-steps>
      </div>

      <el-empty v-if="!payout && !loading" description="未找到奖金单" />
    </el-card>
  </div>
</template>

<style scoped>
.amount {
  font-weight: 600;
  color: #67c23a;
  font-size: 16px;
}
.timeline {
  margin-top: 24px;
}
.block-title {
  font-weight: 600;
  margin-bottom: 12px;
}
</style>