<script setup lang="ts">
/**
 * 销售回款登记（M5-2-D4）
 * @module views/performance/sales/PaymentList
 * @description 消费 3 端点：
 *  - GET   /sales/payments             performance:sales:payment:read
 *  - POST  /sales/payments             performance:sales:payment:write
 *  - PATCH /sales/payments/:id/confirm performance:sales:payment:confirm
 *
 * 角色：
 *  - admin/hr：可见全部 + 登记回款 + 确认到账
 *  - dept_head/executive：可见全部（只读，无按钮）
 *  - employee：无菜单（后端 403，菜单已过滤）
 *
 * 关键约束：
 *  - 列表接口不 include employee / product（service 实读确认）；名称前端联查
 *  - 登记 Dialog：员工 + 产品下拉（产品仅 status=active）+ 客户 + 金额 + 回款日期 + 期间（YYYY-MM，默认当前月）
 *  - 确认按钮仅 draft 状态行展示；后端 confirm 内部根据 calculation_strategy 决定是否自动算提成，
 *    本切片不假设，提示用户「请在提成页查看计算结果」
 *  - 不提供取消按钮（无对应端点，且 draft → cancelled 仅 backend cancelPayment，前端不消费）
 *  - 员工列表沿用 D3 同款 200 分页限制（已知问题）
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';

import {
  confirmPayment,
  createPayment,
  listPayments,
  listProducts,
} from '@/api/performanceSales';
import { listEmployees } from '@/api/employee';
import {
  type CreatePaymentRequest,
  type ListPaymentFilter,
  SALES_PAYMENT_STATUS_MAP,
  type SalesPayment,
  type SalesPaymentStatus,
  type SalesProduct,
  canSalesAction,
  salesPaymentStatusInfo,
} from '@/api/types/performanceSales';
import type { Employee } from '@/api/types/organization';
import { useUserStore } from '@/stores/user';
import { formatAmount, formatDate } from '@/utils/format';

const userStore = useUserStore();
const user = computed(() => userStore.userInfo);

const canCreate = computed(() => canSalesAction('payment:create', user.value));
const canConfirm = computed(() => canSalesAction('payment:confirm', user.value));

const loading = ref(false);
const list = ref<SalesPayment[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);

const employees = ref<Employee[]>([]);
const products = ref<SalesProduct[]>([]);

const filterForm = reactive<{
  employeeId: string;
  productId: string;
  status: SalesPaymentStatus | '';
  period: string;
}>({
  employeeId: '',
  productId: '',
  status: '',
  period: '',
});

const STATUS_OPTIONS = (Object.keys(SALES_PAYMENT_STATUS_MAP) as SalesPaymentStatus[]).map(
  (k) => ({ key: k, label: SALES_PAYMENT_STATUS_MAP[k].label }),
);

async function loadDataSources(): Promise<void> {
  const [empRes, prodRes] = await Promise.all([
    listEmployees({ pageSize: 200 }),
    listProducts({ pageSize: 100, status: 'active' }),
  ]);
  employees.value = empRes.items;
  products.value = prodRes.items;
}

async function loadList(): Promise<void> {
  loading.value = true;
  try {
    const query: ListPaymentFilter = {
      page: page.value,
      pageSize: pageSize.value,
    };
    if (filterForm.employeeId) query.employeeId = filterForm.employeeId;
    if (filterForm.productId) query.productId = filterForm.productId;
    if (filterForm.status) query.status = filterForm.status;
    if (filterForm.period) query.period = filterForm.period;
    const res = await listPayments(query);
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

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ============ 登记回款 Dialog ============

interface CreateForm {
  employeeId: string;
  productId: string;
  customerName: string;
  amount: number | '';
  paymentDate: string;
  period: string;
  remark: string;
}

function emptyCreateForm(): CreateForm {
  return {
    employeeId: '',
    productId: '',
    customerName: '',
    amount: '',
    paymentDate: '',
    period: currentMonth(),
    remark: '',
  };
}

const createDialogVisible = ref(false);
const createFormRef = ref<FormInstance>();
const createForm = reactive<CreateForm>(emptyCreateForm());
const createSubmitting = ref(false);

const createRules: FormRules = {
  employeeId: [{ required: true, message: '请选择员工', trigger: 'change' }],
  productId: [{ required: true, message: '请选择产品', trigger: 'change' }],
  customerName: [{ required: true, message: '请输入客户名称', trigger: 'blur' }],
  amount: [
    {
      validator: (_r, value, cb) => {
        if (value === '' || value == null) {
          cb(new Error('请输入回款金额'));
          return;
        }
        if (Number(value) <= 0) {
          cb(new Error('回款金额必须 > 0'));
        } else {
          cb();
        }
      },
      trigger: 'blur',
    },
  ],
  paymentDate: [{ required: true, message: '请选择回款日期', trigger: 'change' }],
  period: [
    {
      pattern: /^\d{4}-\d{2}$/,
      message: '期间须为 YYYY-MM 格式',
      trigger: 'blur',
    },
  ],
};

function openCreateDialog(): void {
  Object.assign(createForm, emptyCreateForm());
  createDialogVisible.value = true;
}

async function onCreateSubmit(): Promise<void> {
  if (!createFormRef.value) return;
  const valid = await createFormRef.value.validate().catch(() => false);
  if (!valid) return;
  createSubmitting.value = true;
  try {
    const body: CreatePaymentRequest = {
      employeeId: createForm.employeeId,
      productId: createForm.productId,
      customerName: createForm.customerName,
      amount: Number(createForm.amount),
      paymentDate: createForm.paymentDate,
      period: createForm.period || undefined,
      remark: createForm.remark || undefined,
    };
    await createPayment(body);
    ElMessage.success('回款已登记，待财务确认');
    createDialogVisible.value = false;
    page.value = 1;
    await loadList();
  } finally {
    createSubmitting.value = false;
  }
}

// ============ 确认到账 ============

const confirmingId = ref<string | null>(null);
async function onConfirm(row: SalesPayment): Promise<void> {
  if (row.status !== 'draft') return;
  try {
    confirmingId.value = row.id;
    await confirmPayment(row.id, {});
    ElMessage.success('回款已确认；如开启自动计算策略，提成记录将在「销售提成」页可见');
    await loadList();
  } finally {
    confirmingId.value = null;
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
      title="销售回款登记"
      :breadcrumb="[{ label: '绩效管理' }, { label: '销售提成' }, { label: '回款管理' }]"
    >
      <template #actions>
        <el-button v-if="canCreate" type="primary" @click="openCreateDialog">
          登记回款
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
      <el-table-column label="客户" prop="customerName" min-width="160" show-overflow-tooltip />
      <el-table-column label="金额" width="140" align="right">
        <template #default="{ row }">{{ formatAmount(row.amount) }}</template>
      </el-table-column>
      <el-table-column label="回款日期" width="120">
        <template #default="{ row }">{{ formatDate(row.paymentDate) }}</template>
      </el-table-column>
      <el-table-column label="期间" prop="period" width="100" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="salesPaymentStatusInfo(row.status).type">
            {{ salesPaymentStatusInfo(row.status).label }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="确认时间" width="160">
        <template #default="{ row }">{{ row.confirmedAt ? formatDate(row.confirmedAt) : '—' }}</template>
      </el-table-column>
      <el-table-column label="备注" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">{{ row.remark || '—' }}</template>
      </el-table-column>
      <el-table-column v-if="canConfirm" label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="row.status === 'draft'"
            text
            type="primary"
            :loading="confirmingId === row.id"
            @click="onConfirm(row)"
          >
            确认到账
          </el-button>
          <span v-else class="row-noop">—</span>
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

    <!-- 登记回款 Dialog -->
    <el-dialog
      v-model="createDialogVisible"
      title="登记回款"
      width="540px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="createFormRef"
        :model="createForm"
        :rules="createRules"
        label-width="100px"
      >
        <el-form-item label="员工" prop="employeeId">
          <el-select v-model="createForm.employeeId" filterable placeholder="选择员工" style="width: 100%">
            <el-option
              v-for="e in employees"
              :key="e.id"
              :label="`${e.name}(${e.employeeNo})`"
              :value="e.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="产品" prop="productId">
          <el-select v-model="createForm.productId" filterable placeholder="仅显示已启用产品" style="width: 100%">
            <el-option
              v-for="p in products"
              :key="p.id"
              :label="`${p.code} - ${p.name}`"
              :value="p.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="客户名称" prop="customerName">
          <el-input v-model="createForm.customerName" placeholder="1-200 字符" maxlength="200" show-word-limit />
        </el-form-item>
        <el-form-item label="回款金额" prop="amount">
          <el-input-number
            v-model="createForm.amount"
            :min="0"
            :precision="2"
            :step="100"
            placeholder="> 0"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="回款日期" prop="paymentDate">
          <el-date-picker
            v-model="createForm.paymentDate"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择日期"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="期间" prop="period">
          <el-input v-model="createForm.period" placeholder="YYYY-MM（留空从日期推算）" maxlength="7" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="createForm.remark"
            type="textarea"
            :rows="3"
            maxlength="2000"
            show-word-limit
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="createSubmitting" @click="onCreateSubmit">
          登记
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
.row-noop {
  color: var(--el-text-color-secondary);
}
</style>
