<script setup lang="ts">
/* eslint-disable vue/no-v-html */
/**
 * ESS 工资条详情（M5-2-C2）生成 / HTML 预览 / PDF / 投递
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import FormDialog from '@/components/FormDialog.vue';
import {
  deliverPayslip,
  downloadPayslipPdf,
  generatePayslip,
  getPayslip,
  getPayslipHtml,
} from '@/api/payslip';
import {
  isEarningItemType,
  payslipStatusLabel,
  payslipTagType,
  type Payslip,
} from '@/api/types/payroll';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import { formatAmount } from '@/utils/format';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const id = computed(() => String(route.params.id || ''));
const loading = ref(false);
const acting = ref(false);
const record = ref<Payslip | null>(null);
const canGenerate = computed(() =>
  hasPermission(userStore.userInfo, 'salary:payslip:generate'),
);
const canIssue = computed(() => {
  const s = record.value?.status;
  return canGenerate.value && (s === 'approved' || s === 'locked');
});
const html = ref('');
const deliverVisible = ref(false);
const deliverForm = reactive({ email: true, system: true });

async function load(): Promise<void> {
  loading.value = true;
  try {
    record.value = await getPayslip(id.value);
    if (canIssue.value) {
      try {
        html.value = await getPayslipHtml(id.value);
      } catch {
        html.value = '';
      }
    }
  } finally {
    loading.value = false;
  }
}

async function onGenerate(): Promise<void> {
  acting.value = true;
  try {
    const res = await generatePayslip(id.value);
    html.value = res.html;
    ElMessage.success('工资条已生成');
  } finally {
    acting.value = false;
  }
}

async function onPdf(): Promise<void> {
  const period = record.value?.period || 'payslip';
  await downloadPayslipPdf(id.value, `工资条-${period}.pdf`);
}

async function onDeliver(): Promise<void> {
  const methods: Array<'email' | 'system'> = [];
  if (deliverForm.email) {
    methods.push('email');
  }
  if (deliverForm.system) {
    methods.push('system');
  }
  if (methods.length === 0) {
    ElMessage.warning('请至少选择一种投递方式');
    return;
  }
  acting.value = true;
  try {
    await deliverPayslip(id.value, { methods });
    deliverVisible.value = false;
    ElMessage.success('已投递');
  } finally {
    acting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div v-loading="loading">
    <PageHeader
      title="工资条详情"
      :breadcrumb="[
        { label: '薪酬核算', to: '/salary/my-payslips' },
        { label: '我的工资条', to: '/salary/my-payslips' },
        { label: '详情' },
      ]"
    >
      <template #actions>
        <el-button @click="router.push('/salary/my-payslips')">返回</el-button>
        <el-button v-if="canIssue" type="primary" :loading="acting" @click="onGenerate">
          生成工资条
        </el-button>
        <el-button v-if="canIssue" :loading="acting" @click="onPdf">下载 PDF</el-button>
        <el-button v-if="canIssue" @click="deliverVisible = true">投递</el-button>
      </template>
    </PageHeader>
    <EmptyState v-if="!record && !loading" description="工资单不存在" />
    <template v-else-if="record">
      <el-descriptions :column="3" border class="mb">
        <el-descriptions-item label="期间">{{ record.period }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="payslipTagType(record.status)" size="small">
            {{ payslipStatusLabel(record.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="实发">{{ formatAmount(record.netAmount) }}</el-descriptions-item>
        <el-descriptions-item label="应发合计">{{ formatAmount(record.grossAmount) }}</el-descriptions-item>
        <el-descriptions-item label="应扣合计">{{ formatAmount(record.deductionAmount) }}</el-descriptions-item>
      </el-descriptions>
      <el-table :data="record.items || []" stripe class="mb">
        <el-table-column prop="itemName" label="名称" min-width="160" />
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            {{ isEarningItemType(row.itemType) ? '应发' : '应扣' }}
          </template>
        </el-table-column>
        <el-table-column label="金额" width="140">
          <template #default="{ row }">{{ formatAmount(row.amount) }}</template>
        </el-table-column>
      </el-table>
      <el-card v-if="html" shadow="never">
        <template #header>工资条预览</template>
        <!-- 后端生成 HTML，可信内容；不引入 sanitize 依赖 -->
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div class="preview" v-html="html" />
      </el-card>
    </template>
    <FormDialog v-model="deliverVisible" title="投递工资条" :confirm-loading="acting" @confirm="onDeliver">
      <el-checkbox v-model="deliverForm.email">邮件</el-checkbox>
      <el-checkbox v-model="deliverForm.system">站内信</el-checkbox>
    </FormDialog>
  </div>
</template>

<style scoped>
.mb {
  margin-bottom: 16px;
}

.preview {
  overflow: auto;
}
</style>
