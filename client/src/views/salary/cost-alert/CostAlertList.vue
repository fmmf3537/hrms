<script setup lang="ts">
/**
 * 成本预警列表（M5-2-C3）scan 仅 admin/hr；summary period 必填 YYYY-MM
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import SearchForm from '@/components/SearchForm.vue';
import EmptyState from '@/components/EmptyState.vue';
import FormDialog from '@/components/FormDialog.vue';
import { listDepartments } from '@/api/department';
import { getCostAlertSummary, listCostAlerts, scanCostAlerts } from '@/api/costAlert';
import {
  COST_ALERT_TYPE_LABELS,
  costAlertSeverityTag,
  costAlertStatusLabel,
  costAlertTagType,
  type CostAlert,
  type CostAlertSeverity,
  type CostAlertStatus,
  type CostAlertSummary,
  type CostAlertType,
} from '@/api/types/compensation';
import type { Department } from '@/api/types/organization';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';

const TYPES: CostAlertType[] = ['overtime_ratio', 'attrition_monthly'];
const STATUSES: CostAlertStatus[] = ['active', 'acknowledged', 'closed'];
const SEVERITIES: CostAlertSeverity[] = ['warning', 'critical'];

function currentPeriod(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${m}`;
}

const router = useRouter();
const userStore = useUserStore();
const canRead = computed(() => hasPermission(userStore.userInfo, 'salary:cost-alert:read'));
const canScan = computed(() => hasPermission(userStore.userInfo, 'salary:cost-alert:scan'));

const loading = ref(false);
const list = ref<CostAlert[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const period = ref(currentPeriod());
const summary = ref<CostAlertSummary | null>(null);
const alertType = ref<CostAlertType | ''>('');
const statusFilter = ref<CostAlertStatus | ''>('');
const severityFilter = ref<CostAlertSeverity | ''>('');
const departmentId = ref('');
const departments = ref<Department[]>([]);
const scanVisible = ref(false);
const submitting = ref(false);
const scanRef = ref<FormInstance>();
const scanForm = reactive({
  period: currentPeriod(),
  alertType: 'all' as 'all' | CostAlertType,
});
const scanRules: FormRules<typeof scanForm> = {
  period: [{ required: true, message: '请选择期间', trigger: 'change' }],
};

function typeLabel(t: string): string {
  return COST_ALERT_TYPE_LABELS[t as CostAlertType] ?? t;
}

function countOf(map: Record<string, { count: number }> | undefined, key: string): number {
  return map?.[key]?.count ?? 0;
}

async function loadSummary(): Promise<void> {
  if (!canRead.value || !period.value) {
    summary.value = null;
    return;
  }
  summary.value = await getCostAlertSummary(period.value);
}

async function load(): Promise<void> {
  if (!canRead.value) {
    list.value = [];
    return;
  }
  loading.value = true;
  try {
    await loadSummary();
    const res = await listCostAlerts({
      period: period.value || undefined,
      alertType: alertType.value || undefined,
      status: statusFilter.value || undefined,
      severity: severityFilter.value || undefined,
      departmentId: departmentId.value || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
    list.value = res.items;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

function onReset(): void {
  period.value = currentPeriod();
  alertType.value = '';
  statusFilter.value = '';
  severityFilter.value = '';
  departmentId.value = '';
  page.value = 1;
  load();
}

function deptName(id?: string | null): string {
  if (!id) {
    return '公司级';
  }
  return departments.value.find((d) => d.id === id)?.name || id;
}

async function onScan(): Promise<void> {
  const ok = await scanRef.value?.validate().catch(() => false);
  if (!ok) {
    return;
  }
  submitting.value = true;
  try {
    const res = await scanCostAlerts({
      period: scanForm.period,
      alertType: scanForm.alertType,
    });
    ElMessage.success(`扫描完成，命中 ${res.alertCount} 条`);
    scanVisible.value = false;
    period.value = scanForm.period;
    await load();
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  if (canRead.value) {
    departments.value = await listDepartments();
  }
  await load();
});
</script>

<template>
  <div>
    <PageHeader title="成本预警" :breadcrumb="[{ label: '薪酬核算' }, { label: '成本预警' }]">
      <template #actions>
        <el-button v-if="canScan" type="primary" @click="scanVisible = true">扫描</el-button>
      </template>
    </PageHeader>
    <EmptyState v-if="!canRead" description="无权查看成本预警" />
    <template v-else>
      <el-row :gutter="12" class="cards">
        <el-col :span="6">
          <el-card shadow="never">待处理 {{ countOf(summary?.byStatus, 'active') }}</el-card>
        </el-col>
        <el-col :span="6">
          <el-card shadow="never">已确认 {{ countOf(summary?.byStatus, 'acknowledged') }}</el-card>
        </el-col>
        <el-col :span="6">
          <el-card shadow="never">已关闭 {{ countOf(summary?.byStatus, 'closed') }}</el-card>
        </el-col>
        <el-col :span="6">
          <el-card shadow="never">严重 {{ countOf(summary?.bySeverity, 'critical') }}</el-card>
        </el-col>
      </el-row>
      <SearchForm @search="load" @reset="onReset">
        <el-form-item label="期间">
          <el-date-picker v-model="period" type="month" value-format="YYYY-MM" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="alertType" clearable style="width: 160px">
            <el-option v-for="t in TYPES" :key="t" :label="typeLabel(t)" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="statusFilter" clearable style="width: 130px">
            <el-option v-for="s in STATUSES" :key="s" :label="costAlertStatusLabel(s)" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="严重度">
          <el-select v-model="severityFilter" clearable style="width: 120px">
            <el-option v-for="s in SEVERITIES" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="部门">
          <el-select v-model="departmentId" clearable filterable style="width: 180px">
            <el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
        </el-form-item>
      </SearchForm>
      <el-table v-loading="loading" :data="list" stripe>
        <el-table-column label="类型" width="130">
          <template #default="{ row }">{{ typeLabel(row.alertType) }}</template>
        </el-table-column>
        <el-table-column label="严重度" width="100">
          <template #default="{ row }">
            <el-tag :type="costAlertSeverityTag(row.severity)" size="small">{{ row.severity }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="costAlertTagType(row.status)" size="small">
              {{ costAlertStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="部门" min-width="140">
          <template #default="{ row }">{{ deptName(row.departmentId) }}</template>
        </el-table-column>
        <el-table-column prop="period" label="期间" width="100" />
        <el-table-column label="说明" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.remark || row.acknowledgeNote || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="router.push(`/salary/cost-alerts/${row.id}`)">
              查看
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        class="pager"
        layout="total, prev, pager, next"
        :total="total"
        @current-change="load"
      />
    </template>
    <FormDialog v-model="scanVisible" title="扫描预警" :confirm-loading="submitting" @confirm="onScan">
      <el-form ref="scanRef" :model="scanForm" :rules="scanRules" label-width="88px">
        <el-form-item label="期间" prop="period">
          <el-date-picker v-model="scanForm.period" type="month" value-format="YYYY-MM" style="width: 100%" />
        </el-form-item>
        <el-form-item label="类型">
          <el-radio-group v-model="scanForm.alertType">
            <el-radio label="all">全部</el-radio>
            <el-radio label="overtime_ratio">加班费占比</el-radio>
            <el-radio label="attrition_monthly">月度离职率</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
    </FormDialog>
  </div>
</template>

<style scoped>
.cards {
  margin-bottom: 12px;
}
.pager {
  margin-top: 12px;
  justify-content: flex-end;
}
</style>
