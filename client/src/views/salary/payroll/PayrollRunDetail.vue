<script setup lang="ts">
/**
 * 算薪批次详情（M5-2-C2）状态机 + 三类导出 + 关联工资单
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import FormDialog from '@/components/FormDialog.vue';
import {
  approvePayrollRun,
  declareTax,
  exportBankingFile,
  exportReport,
  getPayrollRun,
  lockPayrollRun,
  rejectPayrollRun,
  requestAiSummary,
  reviewPayrollRun,
  submitPayrollRun,
} from '@/api/payroll';
import { listPayslips } from '@/api/payslip';
import { listEmployees } from '@/api/employee';
import {
  canPayrollRunAction,
  payrollRunStatusLabel,
  payrollRunTagType,
  payslipStatusLabel,
  payslipTagType,
  type AiSummaryResult,
  type BankingExportFormat,
  type Payslip,
  type PayrollRun,
  type ReportExportFormat,
} from '@/api/types/payroll';
import type { Employee } from '@/api/types/organization';
import { useUserStore } from '@/stores/user';
import { formatAmount, formatDate } from '@/utils/format';

const STEPS = ['draft', 'submitted', 'reviewed', 'approved', 'locked'] as const;

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const runId = computed(() => String(route.params.id || ''));

const loading = ref(false);
const run = ref<PayrollRun | null>(null);
const aiResult = ref<AiSummaryResult | null>(null);
const payslips = ref<Payslip[]>([]);
const payslipTotal = ref(0);
const payslipPage = ref(1);
const payslipPageSize = ref(20);
const employees = ref<Employee[]>([]);
const acting = ref(false);

const reviewVisible = ref(false);
const rejectVisible = ref(false);
const bankingVisible = ref(false);
const taxVisible = ref(false);
const reportVisible = ref(false);
const reviewRef = ref<FormInstance>();
const rejectRef = ref<FormInstance>();
const reviewForm = reactive({ comment: '' });
const rejectForm = reactive({ reason: '' });
const bankingFormat = ref<BankingExportFormat>('icbc');
const taxPeriod = ref('');
const reportFormat = ref<ReportExportFormat>('excel');

const rejectRules: FormRules<{ reason: string }> = {
  reason: [{ required: true, message: '请填写驳回原因', trigger: 'blur' }],
};

const stepIndex = computed(() => {
  const idx = STEPS.indexOf(run.value?.status as (typeof STEPS)[number]);
  return idx >= 0 ? idx : 0;
});

const user = computed(() => userStore.userInfo);

function can(action: Parameters<typeof canPayrollRunAction>[0]): boolean {
  if (!run.value) {
    return false;
  }
  return canPayrollRunAction(action, run.value, user.value);
}

function employeeLabel(id: string): string {
  const e = employees.value.find((item) => item.id === id);
  return e ? `${e.name} (${e.employeeNo})` : id;
}

async function loadRun(): Promise<void> {
  loading.value = true;
  try {
    run.value = await getPayrollRun(runId.value);
  } finally {
    loading.value = false;
  }
}

async function loadPayslips(): Promise<void> {
  const res = await listPayslips({
    runId: runId.value,
    page: payslipPage.value,
    pageSize: payslipPageSize.value,
  });
  payslips.value = res.items;
  payslipTotal.value = res.total;
}

async function afterAction(okText: string): Promise<void> {
  ElMessage.success(okText);
  await loadRun();
  await loadPayslips();
}

async function onSubmit(): Promise<void> {
  acting.value = true;
  try {
    await submitPayrollRun(runId.value);
    await afterAction('已提交');
  } finally {
    acting.value = false;
  }
}

async function onReview(): Promise<void> {
  acting.value = true;
  try {
    await reviewPayrollRun(runId.value, { comment: reviewForm.comment || undefined });
    reviewVisible.value = false;
    await afterAction('已复核');
  } finally {
    acting.value = false;
  }
}

async function onReject(): Promise<void> {
  const ok = await rejectRef.value?.validate().catch(() => false);
  if (!ok) {
    return;
  }
  acting.value = true;
  try {
    await rejectPayrollRun(runId.value, { reason: rejectForm.reason });
    rejectVisible.value = false;
    await afterAction('已驳回');
  } finally {
    acting.value = false;
  }
}

async function onApprove(): Promise<void> {
  acting.value = true;
  try {
    await approvePayrollRun(runId.value);
    await afterAction('已审批');
  } finally {
    acting.value = false;
  }
}

async function onAi(): Promise<void> {
  acting.value = true;
  try {
    aiResult.value = await requestAiSummary(runId.value);
    ElMessage.success('AI 摘要已生成');
  } finally {
    acting.value = false;
  }
}

async function onLock(): Promise<void> {
  acting.value = true;
  try {
    await lockPayrollRun(runId.value);
    await afterAction('已锁定');
  } finally {
    acting.value = false;
  }
}

async function onBanking(): Promise<void> {
  acting.value = true;
  try {
    const res = await exportBankingFile(runId.value, bankingFormat.value);
    bankingVisible.value = false;
    ElMessage.success(`已导出 ${res.recordCount} 条（mock）`);
  } finally {
    acting.value = false;
  }
}

async function onTax(): Promise<void> {
  if (!taxPeriod.value) {
    ElMessage.warning('请选择申报期间');
    return;
  }
  acting.value = true;
  try {
    const res = await declareTax(runId.value, taxPeriod.value);
    taxVisible.value = false;
    ElMessage.success(`申报完成，共 ${res.recordCount} 条，税额 ${formatAmount(res.totalTax)}`);
  } finally {
    acting.value = false;
  }
}

async function onReport(): Promise<void> {
  acting.value = true;
  try {
    await exportReport(runId.value, reportFormat.value);
    reportVisible.value = false;
    ElMessage.success('报表已导出（mock 文本）');
  } finally {
    acting.value = false;
  }
}

onMounted(async () => {
  const empRes = await listEmployees({ page: 1, pageSize: 100 });
  employees.value = empRes.items;
  await loadRun();
  await loadPayslips();
});
</script>

<template>
  <div v-loading="loading">
    <PageHeader
      :title="run ? `算薪 ${run.period}` : '算薪详情'"
      :breadcrumb="[
        { label: '薪酬核算', to: '/salary/payroll-runs' },
        { label: '算薪管理', to: '/salary/payroll-runs' },
        { label: '详情' },
      ]"
    >
      <template #actions>
        <el-button @click="router.push('/salary/payroll-runs')">返回</el-button>
      </template>
    </PageHeader>
    <EmptyState v-if="!run && !loading" description="算薪批次不存在" />
    <template v-else-if="run">
      <el-alert
        v-if="run.status === 'cancelled'"
        title="已作废"
        type="error"
        :closable="false"
        class="mb"
      />
      <div class="head">
        <el-tag :type="payrollRunTagType(run.status)" size="large">
          {{ payrollRunStatusLabel(run.status) }}
        </el-tag>
        <span class="period">{{ run.period }}</span>
      </div>
      <el-steps :active="stepIndex" align-center class="mb">
        <el-step title="草稿" />
        <el-step title="已提交" />
        <el-step title="已复核" />
        <el-step title="已审批" />
        <el-step title="已锁定" />
      </el-steps>
      <el-descriptions :column="3" border class="mb">
        <el-descriptions-item label="应发合计">{{ formatAmount(run.totalGross) }}</el-descriptions-item>
        <el-descriptions-item label="实发合计">{{ formatAmount(run.totalNet) }}</el-descriptions-item>
        <el-descriptions-item label="异常数">{{ run.anomalyCount }}</el-descriptions-item>
        <el-descriptions-item label="备注" :span="3">{{ run.remark || '—' }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatDate(run.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="提交时间">{{ formatDate(run.submittedAt) }}</el-descriptions-item>
        <el-descriptions-item label="复核时间">{{ formatDate(run.reviewedAt) }}</el-descriptions-item>
        <el-descriptions-item label="审批时间">{{ formatDate(run.approvedAt) }}</el-descriptions-item>
        <el-descriptions-item label="锁定时间">{{ formatDate(run.lockedAt) }}</el-descriptions-item>
      </el-descriptions>
      <div class="actions mb">
        <el-button v-if="can('submit')" type="primary" :loading="acting" @click="onSubmit">提交</el-button>
        <el-button v-if="can('review')" :loading="acting" @click="reviewVisible = true">复核</el-button>
        <el-button v-if="can('reject')" type="danger" :loading="acting" @click="rejectVisible = true">
          驳回
        </el-button>
        <el-button v-if="can('approve')" type="success" :loading="acting" @click="onApprove">审批</el-button>
        <el-button v-if="can('ai-summary')" :loading="acting" @click="onAi">AI 摘要</el-button>
        <el-button v-if="can('lock')" type="warning" :loading="acting" @click="onLock">锁定</el-button>
      </div>
      <el-card v-if="aiResult" shadow="never" class="mb">
        <template #header>AI 算薪摘要</template>
        <el-alert v-if="aiResult.isAnomaly" title="存在异常波动" type="warning" :closable="false" class="mb" />
        <p>{{ aiResult.summary }}</p>
        <ul v-if="aiResult.highlights?.length">
          <li v-for="(h, i) in aiResult.highlights" :key="i">{{ h }}</li>
        </ul>
      </el-card>
      <el-card
        v-if="can('banking-export') || can('tax-declare') || can('report-export')"
        shadow="never"
        class="mb"
      >
        <template #header>导出</template>
        <el-button v-if="can('banking-export')" @click="bankingVisible = true">银行代发</el-button>
        <el-button v-if="can('tax-declare')" @click="taxPeriod = run.period; taxVisible = true">
          个税申报
        </el-button>
        <el-button v-if="can('report-export')" @click="reportVisible = true">报表导出</el-button>
      </el-card>
      <h3>关联工资单</h3>
      <el-table :data="payslips" stripe>
        <el-table-column label="员工" min-width="160">
          <template #default="{ row }">{{ employeeLabel(row.employeeId) }}</template>
        </el-table-column>
        <el-table-column label="应发" width="120">
          <template #default="{ row }">{{ formatAmount(row.grossAmount) }}</template>
        </el-table-column>
        <el-table-column label="应扣" width="120">
          <template #default="{ row }">{{ formatAmount(row.deductionAmount) }}</template>
        </el-table-column>
        <el-table-column label="实发" width="120">
          <template #default="{ row }">{{ formatAmount(row.netAmount) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="payslipTagType(row.status)" size="small">
              {{ payslipStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90">
          <template #default="{ row }">
            <el-button link type="primary" @click="router.push(`/salary/payslips/${row.id}`)">
              查看
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-model:current-page="payslipPage"
        v-model:page-size="payslipPageSize"
        class="pager"
        layout="total, prev, pager, next"
        :total="payslipTotal"
        @current-change="loadPayslips"
      />
    </template>
    <FormDialog v-model="reviewVisible" title="复核" :confirm-loading="acting" @confirm="onReview">
      <el-form ref="reviewRef" :model="reviewForm" label-width="88px">
        <el-form-item label="意见">
          <el-input v-model="reviewForm.comment" type="textarea" maxlength="2000" show-word-limit :rows="3" />
        </el-form-item>
      </el-form>
    </FormDialog>
    <FormDialog v-model="rejectVisible" title="驳回" :confirm-loading="acting" @confirm="onReject">
      <el-form ref="rejectRef" :model="rejectForm" :rules="rejectRules" label-width="88px">
        <el-form-item label="原因" prop="reason">
          <el-input v-model="rejectForm.reason" type="textarea" maxlength="2000" show-word-limit :rows="3" />
        </el-form-item>
      </el-form>
    </FormDialog>
    <FormDialog v-model="bankingVisible" title="银行代发" :confirm-loading="acting" @confirm="onBanking">
      <el-radio-group v-model="bankingFormat">
        <el-radio label="icbc">工商银行</el-radio>
        <el-radio label="ccb">建设银行</el-radio>
        <el-radio label="cmb">招商银行</el-radio>
      </el-radio-group>
    </FormDialog>
    <FormDialog v-model="taxVisible" title="个税申报" :confirm-loading="acting" @confirm="onTax">
      <el-date-picker v-model="taxPeriod" type="month" value-format="YYYY-MM" />
    </FormDialog>
    <FormDialog v-model="reportVisible" title="报表导出" :confirm-loading="acting" @confirm="onReport">
      <el-radio-group v-model="reportFormat">
        <el-radio label="excel">Excel</el-radio>
        <el-radio label="pdf">PDF</el-radio>
      </el-radio-group>
    </FormDialog>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.period {
  font-size: 18px;
  font-weight: 600;
}

.mb {
  margin-bottom: 16px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.pager {
  margin-top: 12px;
  justify-content: flex-end;
}
</style>
