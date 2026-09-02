<script setup lang="ts">
/**
 * 销售提成列表（M5-2-D4）
 * @module views/performance/sales/CommissionList
 * @description 消费 2 端点：
 *  - GET  /sales/commissions           performance:sales:commission:read
 *  - POST /sales/commissions/calculate performance:sales:commission:write
 *
 * 触发计算的 payment 候选列表复用 listPayments（status=confirmed 过滤），
 * 见客户端复用：listPayments 已消费过的 GET /sales/payments。
 *
 * 角色：
 *  - admin/hr/executive：可见全部 + 可触发计算（commission:write 3 角色共用，注意 executive 无 payment:write）
 *  - dept_head：可见全部（只读，无按钮）
 *  - employee：无菜单（后端 403，菜单已过滤）
 *
 * 关键约束：
 *  - commission list 不 include employee/product（service 实读确认）；名称前端联查
 *  - targetBonusRate 默认 0（D5 不实现销售目标，固定值无上浮）
 *  - 提成发放走 M4 薪酬联动（payoutCommission 标记状态），本切片不提供发放按钮
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';

import { calculateCommission, listCommissions, listPayments, listProducts } from '@/api/performanceSales';
import { listEmployees } from '@/api/employee';
import {
  type ListCommissionFilter,
  type ListPaymentFilter,
  SALES_COMMISSION_STATUS_MAP,
  type SalesCommission,
  type SalesCommissionStatus,
  type SalesPayment,
  type SalesProduct,
  canSalesAction,
  rateLabel,
  salesCommissionStatusInfo,
} from '@/api/types/performanceSales';
import type { Employee } from '@/api/types/organization';
import { useUserStore } from '@/stores/user';
import { formatAmount, formatDate } from '@/utils/format';

const userStore = useUserStore();
const user = computed(() => userStore.userInfo);

const canCalculate = computed(() => canSalesAction('commission:calculate', user.value));

const loading = ref(false);
const list = ref<SalesCommission[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);

const employees = ref<Employee[]>([]);
const products = ref<SalesProduct[]>([]);

const filterForm = reactive<{
  employeeId: string;
  productId: string;
  status: SalesCommissionStatus | '';
  period: string;
}>({
  employeeId: '',
  productId: '',
  status: '',
  period: '',
});

const STATUS_OPTIONS = (Object.keys(SALES_COMMISSION_STATUS_MAP) as SalesCommissionStatus[]).map(
  (k) => ({ key: k, label: SALES_COMMISSION_STATUS_MAP[k].label }),
);

async function loadDataSources(): Promise<void> {
  const [empRes, prodRes] = await Promise.all([
    listEmployees({ pageSize: 200 }),
    listProducts({ pageSize: 100 }),
  ]);
  employees.value = empRes.items;
  products.value = prodRes.items;
}

async function loadList(): Promise<void> {
  loading.value = true;
  try {
    const query: ListCommissionFilter = {
      page: page.value,
      pageSize: pageSize.value,
    };
    if (filterForm.employeeId) query.employeeId = filterForm.employeeId;
    if (filterForm.productId) query.productId = filterForm.productId;
    if (filterForm.status) query.status = filterForm.status;
    if (filterForm.period) query.period = filterForm.period;
    const res = await listCommissions(query);
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

function employeeName(employeeId: string): string {
  const e = employees.value.find((x) => x.id === employeeId);
  return e ? `${e.name}(${e.employeeNo})` : employeeId;
}

function productName(productId: string): string {
  const p = products.value.find((x) => x.id === productId);
  return p ? `${p.code} - ${p.name}` : productId;
}

// ============ 触发计算 Dialog ============

const calcDialogVisible = ref(false);
const calcSubmitting = ref(false);
const confirmedPayments = ref<SalesPayment[]>([]);
const confirmedPaymentsLoading = ref(false);
const calcForm = reactive<{ paymentId: string }>({ paymentId: '' });

function employeeNameById(id: string): string {
  const e = employees.value.find((x) => x.id === id);
  return e ? `${e.name}(${e.employeeNo})` : id;
}

function productNameById(id: string): string {
  const p = products.value.find((x) => x.id === id);
  return p ? `${p.code} - ${p.name}` : id;
}

function paymentOptionLabel(p: SalesPayment): string {
  return `${employeeNameById(p.employeeId)} | ${productNameById(p.productId)} | ${p.customerName} | ${formatAmount(p.amount)} | ${p.period}`;
}

async function openCalcDialog(): Promise<void> {
  calcForm.paymentId = '';
  calcDialogVisible.value = true;
  confirmedPaymentsLoading.value = true;
  try {
    // 调 listPayments 已 validated 接口；最多 100 条（D5+ 联调再考虑自动滚动 / 搜索）
    const query: ListPaymentFilter = {
      page: 1,
      pageSize: 100,
      status: 'confirmed',
    };
    const res = await listPayments(query);
    confirmedPayments.value = res.items;
  } catch {
    confirmedPayments.value = [];
  } finally {
    confirmedPaymentsLoading.value = false;
  }
}

async function onCalcSubmit(): Promise<void> {
  if (!calcForm.paymentId) {
    ElMessage.warning('请选择一笔已确认的回款');
    return;
  }
  calcSubmitting.value = true;
  try {
    await calculateCommission({ paymentId: calcForm.paymentId });
    ElMessage.success('提成已计算');
    calcDialogVisible.value = false;
    page.value = 1;
    await loadList();
  } finally {
    calcSubmitting.value = false;
  }
}

// ============ 筛选 ============

function onSearch(): void {
  page.value = 1;
  loadList();
}

function onReset(): void {
  filterForm.employeeId = '';
  filterForm.productId = '';
  filterForm.status = '';
  filterForm.period = '';
  page.value = 1;
  loadList();
}
</script>

<template>
  <div>
    <PageHeader
      title="销售提成"
      :breadcrumb="[{ label: '绩效管理' }, { label: '销售提成' }, { label: '提成列表' }]"
    >
      <template #actions>
        <el-button v-if="canCalculate" type="primary" @click="openCalcDialog">
          触发计算
        </el-button>
      </template>
    </PageHeader>

    <el-card shadow="never" class="filter-card">
      <el-form :inline="true">
        <el-form-item label="员工">
          <el-select v-model="filterForm.employeeId" clearable filterable placeholder="全部员工" style="width: 200px">
            <el-option
              v-for="e in employees"
              :key="e.id"
              :label="`${e.name}(${e.employeeNo})`"
              :value="e.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="产品">
          <el-select v-model="filterForm.productId" clearable filterable placeholder="全部产品" style="width: 200px">
            <el-option
              v-for="p in products"
              :key="p.id"
              :label="`${p.code} - ${p.name}`"
              :value="p.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filterForm.status" clearable placeholder="全部" style="width: 140px">
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
        <template #default="{ row }">{{ employeeName(row.employeeId) }}</template>
      </el-table-column>
      <el-table-column label="产品" min-width="200">
        <template #default="{ row }">{{ productName(row.productId) }}</template>
      </el-table-column>
      <el-table-column label="回款金额" width="140" align="right">
        <template #default="{ row }">{{ formatAmount(row.baseAmount) }}</template>
      </el-table-column>
      <el-table-column label="提成比例" width="110" align="right">
        <template #default="{ row }">{{ rateLabel(row.commissionRate) }}</template>
      </el-table-column>
      <el-table-column label="完成率上浮" width="120" align="right">
        <template #default="{ row }">{{ rateLabel(row.targetBonusRate) }}</template>
      </el-table-column>
      <el-table-column label="实发金额" width="140" align="right">
        <template #default="{ row }">{{ formatAmount(row.finalAmount) }}</template>
      </el-table-column>
      <el-table-column label="期间" prop="period" width="100" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="salesCommissionStatusInfo(row.status).type">
            {{ salesCommissionStatusInfo(row.status).label }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="计算时间" width="160">
        <template #default="{ row }">{{ formatDate(row.calculatedAt) }}</template>
      </el-table-column>
      <el-table-column label="发放时间" width="160">
        <template #default="{ row }">{{ row.paidAt ? formatDate(row.paidAt) : '—' }}</template>
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

    <!-- 触发计算 Dialog：选一笔 confirmed 的回款 -->
    <el-dialog
      v-model="calcDialogVisible"
      title="触发提成计算"
      width="640px"
      :close-on-click-modal="false"
    >
      <el-form label-width="100px">
        <el-form-item label="已确认回款">
          <el-select
            v-model="calcForm.paymentId"
            filterable
            placeholder="选择一笔 status=confirmed 的回款"
            style="width: 100%"
            :loading="confirmedPaymentsLoading"
            no-data-text="暂无已确认回款"
          >
            <el-option
              v-for="p in confirmedPayments"
              :key="p.id"
              :value="p.id"
              :label="paymentOptionLabel(p)"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="calcDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="calcSubmitting" @click="onCalcSubmit">
          计算
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
