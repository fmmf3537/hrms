<script setup lang="ts">
/**
 * 绩效奖金 · 奖金单列表（M5-2-D3）
 * @module views/performance/payout/PayoutList
 * @description 消费 5 端点：
 *  - GET    /payouts             performance:payout:read（列表 + 分页）
 *  - POST   /payouts/calculate   performance:payout:calculate（直乘 / 池化二选一）
 *  - POST   /payouts/calculate-pool performance:payout:calculate（按部门池）
 *  - POST   /payouts/prepay      performance:payout:settle（**月度** month: YYYY-MM）
 *  - POST   /payouts/settle      performance:payout:settle（**季度** quarter: 1-4）
 *
 * 双模式：
 *  - 管理角色（admin/hr/executive）：全量 + 筛选 + 三个操作按钮
 *  - dept_head / employee：「我的奖金」强制 employeeId=自己，隐藏所有操作区
 *
 * 关键约束：
 *  - calculate Dialog 按 mode 动态切换必填项（前端不做业务分流，仅组 body）
 *  - direct 模式忘传 employeeId 会被后端 400 → 前端表单校验拦截
 *  - prepay 按月（YYYY-MM）；settle 按季度（1-4）—— 两个 Dialog 期间控件不同
 */
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';

import EmptyState from '@/components/EmptyState.vue';

import { listCycles } from '@/api/performance';
import { listEmployees } from '@/api/employee';
import { listDepartments } from '@/api/department';
import {
  calculateDeptPool,
  calculatePayout,
  listPayouts,
  prepayPayout,
  settlePayout,
} from '@/api/performancePayout';
import {
  PAYOUT_MODE_LABELS,
  PAYOUT_STATUS_MAP,
  type Payout,
  type PayoutListQuery,
  type PayoutMode,
  type PayoutStatus,
  payoutStatusInfo,
} from '@/api/types/performancePayout';
import type { PerformanceCycle } from '@/api/types/performance';
import type { Department, Employee } from '@/api/types/organization';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import { formatAmount, formatDate } from '@/utils/format';

const router = useRouter();
const userStore = useUserStore();
const user = computed(() => userStore.userInfo);

const canCalculate = computed(() => hasPermission(user.value, 'performance:payout:calculate'));
const canSettle = computed(() => hasPermission(user.value, 'performance:payout:settle'));

// ESS 视角：仅 employee / dept_head 且无 wildcard
const isEmployeeScope = computed(() => {
  const roles = user.value?.roles ?? [];
  const isMgr = roles.includes('admin') || roles.includes('hr') || roles.includes('executive');
  return !isMgr;
});

const selfEmployeeId = computed(() => user.value?.employee?.id ?? '');

const loading = ref(false);
const list = ref<Payout[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);

const cycles = ref<PerformanceCycle[]>([]);
const employees = ref<Employee[]>([]);
const departments = ref<Department[]>([]);

// 筛选条件（管理角色用）
const filterForm = reactive<{
  cycleId: string;
  mode: PayoutMode | '';
  status: PayoutStatus | '';
  period: string;
}>({
  cycleId: '',
  mode: '',
  status: '',
  period: '',
});

const STATUS_OPTIONS = (Object.keys(PAYOUT_STATUS_MAP) as PayoutStatus[]).map((k) => ({
  key: k,
  label: PAYOUT_STATUS_MAP[k].label,
}));

async function loadDataSources(): Promise<void> {
  const [cycRes, empRes, deptRes] = await Promise.all([
    listCycles({ pageSize: 100 }),
    listEmployees({ pageSize: 200 }),
    listDepartments(),
  ]);
  cycles.value = cycRes.items;
  employees.value = empRes.items;
  departments.value = deptRes;
}

async function loadList(): Promise<void> {
  loading.value = true;
  try {
    const query: PayoutListQuery = {
      page: page.value,
      pageSize: pageSize.value,
    };
    if (filterForm.cycleId) query.cycleId = filterForm.cycleId;
    if (filterForm.mode) query.mode = filterForm.mode;
    if (filterForm.status) query.status = filterForm.status;
    if (filterForm.period) query.period = filterForm.period;
    if (isEmployeeScope.value && selfEmployeeId.value) {
      query.employeeId = selfEmployeeId.value;
    }
    const res = await listPayouts(query);
    list.value = res.items;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await loadDataSources();
  await loadList();
});

watch(page, () => {
  loadList();
});
watch(pageSize, () => {
  page.value = 1;
  loadList();
});

function employeeName(employeeId: string): string {
  const e = employees.value.find((x) => x.id === employeeId);
  return e ? `${e.name}(${e.employeeNo})` : employeeId;
}

function goDetail(row: Payout): void {
  router.push(`/performance/payouts/${row.id}`);
}

// ============ 计算奖金 Dialog ============
const calcDialogVisible = ref(false);
const calcFormRef = ref<FormInstance>();
const calcForm = reactive<{
  mode: PayoutMode;
  employeeId: string;
  deptIds: string[];
  cycleId: string;
  month: string;
}>({
  mode: 'direct',
  employeeId: '',
  deptIds: [],
  cycleId: '',
  month: '',
});
const calcSubmitting = ref(false);

const calcRules: FormRules = {
  cycleId: [{ required: true, message: '请选择考核周期', trigger: 'change' }],
  month: [{ required: true, message: '请选择月份', trigger: 'change' }],
  employeeId: [
    {
      validator: (_rule, value, cb) => {
        if (calcForm.mode === 'direct' && !value) {
          cb(new Error('直乘模式必须选择员工'));
        } else {
          cb();
        }
      },
      trigger: 'change',
    },
  ],
  deptIds: [
    {
      validator: (_rule, value, cb) => {
        if (calcForm.mode === 'pool' && (!value || !value.length)) {
          cb(new Error('部门池模式必须选择至少 1 个部门'));
        } else {
          cb();
        }
      },
      trigger: 'change',
    },
  ],
};

function openCalcDialog(): void {
  calcForm.mode = 'direct';
  calcForm.employeeId = '';
  calcForm.deptIds = [];
  calcForm.cycleId = '';
  calcForm.month = '';
  calcDialogVisible.value = true;
}

async function onCalcSubmit(): Promise<void> {
  if (!calcFormRef.value) return;
  const valid = await calcFormRef.value.validate().catch(() => false);
  if (!valid) return;
  calcSubmitting.value = true;
  try {
    const body: {
      mode: PayoutMode;
      employeeId?: string;
      deptIds?: string[];
      cycleId: string;
      month: string;
    } = {
      mode: calcForm.mode,
      cycleId: calcForm.cycleId,
      month: calcForm.month,
    };
    if (calcForm.mode === 'direct') body.employeeId = calcForm.employeeId;
    else body.deptIds = [...calcForm.deptIds];
    const data = await calculatePayout(body);
    const count = Array.isArray(data) ? data.length : 1;
    ElMessage.success(`已生成 ${count} 条奖金单`);
    calcDialogVisible.value = false;
    page.value = 1;
    await loadList();
  } finally {
    calcSubmitting.value = false;
  }
}

// ============ 按部门池计算 Dialog ============
const poolDialogVisible = ref(false);
const poolFormRef = ref<FormInstance>();
const poolForm = reactive<{
  deptId: string;
  cycleId: string;
  month: string;
}>({ deptId: '', cycleId: '', month: '' });
const poolSubmitting = ref(false);
const poolRules: FormRules = {
  deptId: [{ required: true, message: '请选择部门', trigger: 'change' }],
  cycleId: [{ required: true, message: '请选择考核周期', trigger: 'change' }],
  month: [{ required: true, message: '请选择月份', trigger: 'change' }],
};

function openPoolDialog(): void {
  poolForm.deptId = '';
  poolForm.cycleId = '';
  poolForm.month = '';
  poolDialogVisible.value = true;
}

async function onPoolSubmit(): Promise<void> {
  if (!poolFormRef.value) return;
  const valid = await poolFormRef.value.validate().catch(() => false);
  if (!valid) return;
  poolSubmitting.value = true;
  try {
    const data = await calculateDeptPool({
      deptId: poolForm.deptId,
      cycleId: poolForm.cycleId,
      month: poolForm.month,
    });
    ElMessage.success(`已生成 ${data.length} 条奖金单`);
    poolDialogVisible.value = false;
    page.value = 1;
    await loadList();
  } finally {
    poolSubmitting.value = false;
  }
}

// ============ 预发 Dialog（月度）============
const prepayDialogVisible = ref(false);
const prepayFormRef = ref<FormInstance>();
const prepayForm = reactive<{
  cycleId: string;
  month: string;
  employeeId: string;
}>({ cycleId: '', month: '', employeeId: '' });
const prepaySubmitting = ref(false);
const prepayRules: FormRules = {
  cycleId: [{ required: true, message: '请选择考核周期', trigger: 'change' }],
  month: [{ required: true, message: '请选择月份', trigger: 'change' }],
};

function openPrepayDialog(): void {
  prepayForm.cycleId = '';
  prepayForm.month = '';
  prepayForm.employeeId = '';
  prepayDialogVisible.value = true;
}

async function onPrepaySubmit(): Promise<void> {
  if (!prepayFormRef.value) return;
  const valid = await prepayFormRef.value.validate().catch(() => false);
  if (!valid) return;
  prepaySubmitting.value = true;
  try {
    const body: { cycleId: string; month: string; employeeId?: string } = {
      cycleId: prepayForm.cycleId,
      month: prepayForm.month,
    };
    if (prepayForm.employeeId) body.employeeId = prepayForm.employeeId;
    const data = await prepayPayout(body);
    ElMessage.success(`已预发 ${data.length} 条奖金单`);
    prepayDialogVisible.value = false;
    page.value = 1;
    await loadList();
  } finally {
    prepaySubmitting.value = false;
  }
}

// ============ 季度结算 Dialog ============
const settleDialogVisible = ref(false);
const settleFormRef = ref<FormInstance>();
const settleForm = reactive<{
  cycleId: string;
  quarter: number;
  employeeId: string;
}>({ cycleId: '', quarter: 1, employeeId: '' });
const settleSubmitting = ref(false);
const settleRules: FormRules = {
  cycleId: [{ required: true, message: '请选择考核周期', trigger: 'change' }],
  quarter: [{ required: true, message: '请选择季度', trigger: 'change' }],
};

function openSettleDialog(): void {
  settleForm.cycleId = '';
  settleForm.quarter = 1;
  settleForm.employeeId = '';
  settleDialogVisible.value = true;
}

async function onSettleSubmit(): Promise<void> {
  if (!settleFormRef.value) return;
  const valid = await settleFormRef.value.validate().catch(() => false);
  if (!valid) return;
  settleSubmitting.value = true;
  try {
    const body: { cycleId: string; quarter: number; employeeId?: string } = {
      cycleId: settleForm.cycleId,
      quarter: settleForm.quarter,
    };
    if (settleForm.employeeId) body.employeeId = settleForm.employeeId;
    const data = await settlePayout(body);
    ElMessage.success(
      `季度结算完成：清算 ${data.settlements.length} 笔，差额 ${formatAmount(data.totalDifference)}`,
    );
    settleDialogVisible.value = false;
    page.value = 1;
    await loadList();
  } finally {
    settleSubmitting.value = false;
  }
}

function onSearch(): void {
  page.value = 1;
  loadList();
}

function onReset(): void {
  filterForm.cycleId = '';
  filterForm.mode = '';
  filterForm.status = '';
  filterForm.period = '';
  page.value = 1;
  loadList();
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
</script>

<template>
  <div>
    <PageHeader
      :title="isEmployeeScope ? '我的奖金' : '奖金兑现'"
      :breadcrumb="[{ label: '绩效管理' }, { label: isEmployeeScope ? '我的奖金' : '奖金兑现' }]"
    >
      <template #actions>
        <template v-if="!isEmployeeScope">
          <el-button
            v-if="canCalculate"
            type="primary"
            @click="openCalcDialog"
          >
            计算奖金
          </el-button>
          <el-button v-if="canCalculate" @click="openPoolDialog">
            按部门池计算
          </el-button>
          <el-button v-if="canSettle" @click="openPrepayDialog">
            预发（月度）
          </el-button>
          <el-button v-if="canSettle" @click="openSettleDialog">
            季度结算
          </el-button>
        </template>
      </template>
    </PageHeader>

    <!-- ESS 视角：未关联员工档案 -->
    <EmptyState
      v-if="isEmployeeScope && !selfEmployeeId"
      description="尚未关联员工档案"
    />

    <template v-else>
      <!-- 管理角色筛选区 -->
      <el-card v-if="!isEmployeeScope" shadow="never" class="filter-card">
        <el-form :inline="true">
          <el-form-item label="考核周期">
            <el-select
              v-model="filterForm.cycleId"
              clearable
              placeholder="全部周期"
              style="width: 200px"
            >
              <el-option
                v-for="c in cycles"
                :key="c.id"
                :label="`${c.code} - ${c.name}`"
                :value="c.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="模式">
            <el-select v-model="filterForm.mode" clearable placeholder="全部" style="width: 120px">
              <el-option label="直乘" value="direct" />
              <el-option label="部门池" value="pool" />
            </el-select>
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="filterForm.status" clearable placeholder="全部" style="width: 120px">
              <el-option
                v-for="opt in STATUS_OPTIONS"
                :key="opt.key"
                :label="opt.label"
                :value="opt.key"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="期间">
            <el-input
              v-model="filterForm.period"
              placeholder="YYYY-MM"
              clearable
              style="width: 140px"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="onSearch">查询</el-button>
            <el-button @click="onReset">重置</el-button>
          </el-form-item>
        </el-form>
      </el-card>

      <el-table v-loading="loading" :data="list" border stripe>
        <el-table-column label="员工" min-width="160">
          <template #default="{ row }">
            {{ employeeName(row.employeeId) }}
          </template>
        </el-table-column>
        <el-table-column label="周期" min-width="160">
          <template #default="{ row }">
            {{ row.cycle?.name ?? row.cycleId }}
          </template>
        </el-table-column>
        <el-table-column label="期间" width="100">
          <template #default="{ row }">
            {{ row.period ?? formatDate(row.month) }}
          </template>
        </el-table-column>
        <el-table-column label="模式" width="90">
          <template #default="{ row }">
            <el-tag :type="row.mode === 'pool' ? 'warning' : 'info'">
              {{ PAYOUT_MODE_LABELS[row.mode as PayoutMode] ?? row.mode }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="140" align="right">
          <template #default="{ row }">
            {{ formatAmount(row.actualAmount) }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="payoutStatusInfo(row.status).type">
              {{ payoutStatusInfo(row.status).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" @click="goDetail(row)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        class="pager"
      />
    </template>

    <!-- 计算奖金 Dialog -->
    <el-dialog
      v-model="calcDialogVisible"
      title="计算奖金"
      width="540px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="calcFormRef"
        :model="calcForm"
        :rules="calcRules"
        label-width="100px"
      >
        <el-form-item label="模式" prop="mode">
          <el-radio-group v-model="calcForm.mode">
            <el-radio value="direct">直乘（必传 employeeId）</el-radio>
            <el-radio value="pool">部门池（必传 deptIds）</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="calcForm.mode === 'direct'" label="员工" prop="employeeId">
          <el-select v-model="calcForm.employeeId" filterable placeholder="选择员工" style="width: 100%">
            <el-option
              v-for="e in employees"
              :key="e.id"
              :label="`${e.name}(${e.employeeNo})`"
              :value="e.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-else label="部门" prop="deptIds">
          <el-select
            v-model="calcForm.deptIds"
            multiple
            filterable
            placeholder="选择部门"
            style="width: 100%"
          >
            <el-option
              v-for="d in departments"
              :key="d.id"
              :label="d.name"
              :value="d.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="考核周期" prop="cycleId">
          <el-select v-model="calcForm.cycleId" filterable placeholder="选择周期" style="width: 100%">
            <el-option
              v-for="c in cycles"
              :key="c.id"
              :label="`${c.code} - ${c.name}`"
              :value="c.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="月份" prop="month">
          <el-date-picker
            v-model="calcForm.month"
            type="month"
            value-format="YYYY-MM"
            :placeholder="currentMonth()"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="calcDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="calcSubmitting" @click="onCalcSubmit">
          计算
        </el-button>
      </template>
    </el-dialog>

    <!-- 按部门池计算 Dialog -->
    <el-dialog
      v-model="poolDialogVisible"
      title="按部门池计算"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form ref="poolFormRef" :model="poolForm" :rules="poolRules" label-width="100px">
        <el-form-item label="部门" prop="deptId">
          <el-select v-model="poolForm.deptId" filterable placeholder="选择部门" style="width: 100%">
            <el-option
              v-for="d in departments"
              :key="d.id"
              :label="d.name"
              :value="d.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="考核周期" prop="cycleId">
          <el-select v-model="poolForm.cycleId" filterable placeholder="选择周期" style="width: 100%">
            <el-option
              v-for="c in cycles"
              :key="c.id"
              :label="`${c.code} - ${c.name}`"
              :value="c.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="月份" prop="month">
          <el-date-picker
            v-model="poolForm.month"
            type="month"
            value-format="YYYY-MM"
            :placeholder="currentMonth()"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="poolDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="poolSubmitting" @click="onPoolSubmit">
          计算
        </el-button>
      </template>
    </el-dialog>

    <!-- 预发 Dialog（月度）-->
    <el-dialog
      v-model="prepayDialogVisible"
      title="预发（月度）"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="prepayFormRef"
        :model="prepayForm"
        :rules="prepayRules"
        label-width="100px"
      >
        <el-form-item label="考核周期" prop="cycleId">
          <el-select v-model="prepayForm.cycleId" filterable placeholder="选择周期" style="width: 100%">
            <el-option
              v-for="c in cycles"
              :key="c.id"
              :label="`${c.code} - ${c.name}`"
              :value="c.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="月份" prop="month">
          <el-date-picker
            v-model="prepayForm.month"
            type="month"
            value-format="YYYY-MM"
            :placeholder="currentMonth()"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="员工">
          <el-select
            v-model="prepayForm.employeeId"
            clearable
            filterable
            placeholder="留空 = 全员"
            style="width: 100%"
          >
            <el-option
              v-for="e in employees"
              :key="e.id"
              :label="`${e.name}(${e.employeeNo})`"
              :value="e.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="prepayDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="prepaySubmitting" @click="onPrepaySubmit">
          预发
        </el-button>
      </template>
    </el-dialog>

    <!-- 季度结算 Dialog -->
    <el-dialog
      v-model="settleDialogVisible"
      title="季度结算"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="settleFormRef"
        :model="settleForm"
        :rules="settleRules"
        label-width="100px"
      >
        <el-form-item label="考核周期" prop="cycleId">
          <el-select v-model="settleForm.cycleId" filterable placeholder="选择周期" style="width: 100%">
            <el-option
              v-for="c in cycles"
              :key="c.id"
              :label="`${c.code} - ${c.name}`"
              :value="c.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="季度" prop="quarter">
          <el-select v-model="settleForm.quarter" placeholder="选择季度" style="width: 100%">
            <el-option label="Q1（3月）" :value="1" />
            <el-option label="Q2（6月）" :value="2" />
            <el-option label="Q3（9月）" :value="3" />
            <el-option label="Q4（12月）" :value="4" />
          </el-select>
        </el-form-item>
        <el-form-item label="员工">
          <el-select
            v-model="settleForm.employeeId"
            clearable
            filterable
            placeholder="留空 = 全员"
            style="width: 100%"
          >
            <el-option
              v-for="e in employees"
              :key="e.id"
              :label="`${e.name}(${e.employeeNo})`"
              :value="e.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="settleDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="settleSubmitting" @click="onSettleSubmit">
          结算
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.filter-card {
  margin-bottom: 16px;
}
.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
</style>
