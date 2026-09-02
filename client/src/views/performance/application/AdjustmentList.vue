<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import { listEmployees } from '@/api/employee';
import {
  approveAdjustment,
  listAdjustments,
  proposeAdjustment,
} from '@/api/performanceApplication';
import {
  type AdjustmentItem,
  type ListAdjustmentFilter,
  PERFORMANCE_APPLICATION_PERIOD_PATTERN,
  adjustmentStatusInfo,
  getApplicationScope,
  rateLabel,
} from '@/api/types/performanceApplication';
import type { Employee } from '@/api/types/organization';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import { formatDate } from '@/utils/format';
import { getRequestErrorMessage } from '@/api/http';

const userStore = useUserStore();
const user = computed(() => userStore.userInfo);
const scope = computed(() => getApplicationScope(user.value));
const isEmployeeScope = computed(() => scope.value.isEmployee);
const selfEmployeeId = computed(() => scope.value.selfEmployeeId);
const canPropose = computed(() => hasPermission(user.value, 'performance:salary-adjustment:write'));
const canApprove = computed(() =>
  hasPermission(user.value, 'performance:salary-adjustment:approve'),
);

const loading = ref(false);
const list = ref<AdjustmentItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const employees = ref<Employee[]>([]);

const filterForm = reactive<{ employeeId: string; period: string }>({
  employeeId: '',
  period: '',
});

const visibleEmployees = computed(() => {
  if (!isEmployeeScope.value) return employees.value;
  return employees.value.filter((employee) => employee.id === selfEmployeeId.value);
});

async function loadDataSources(): Promise<void> {
  const response = await listEmployees({ page: 1, pageSize: 200 });
  employees.value = response.items;
}

async function loadList(): Promise<void> {
  if (isEmployeeScope.value && !selfEmployeeId.value) {
    list.value = [];
    total.value = 0;
    return;
  }
  if (filterForm.period && !PERFORMANCE_APPLICATION_PERIOD_PATTERN.test(filterForm.period)) {
    ElMessage.warning('调薪周期须为 YYYY-Q1~Q4 格式');
    return;
  }
  loading.value = true;
  try {
    const query: ListAdjustmentFilter = {
      page: page.value,
      pageSize: pageSize.value,
    };
    if (isEmployeeScope.value) {
      query.employeeId = selfEmployeeId.value;
    } else if (filterForm.employeeId) {
      query.employeeId = filterForm.employeeId;
    }
    if (filterForm.period) query.period = filterForm.period;
    const response = await listAdjustments(query);
    list.value = response.items;
    total.value = response.total;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await loadDataSources();
  await loadList();
});

function employeeName(employeeId: string): string {
  const employee = employees.value.find((item) => item.id === employeeId);
  return employee ? `${employee.name}(${employee.employeeNo})` : employeeId;
}

function onSearch(): void {
  page.value = 1;
  loadList();
}

function onReset(): void {
  filterForm.employeeId = '';
  filterForm.period = '';
  page.value = 1;
  loadList();
}

function onPageChange(): void {
  loadList();
}

function onPageSizeChange(): void {
  page.value = 1;
  loadList();
}

const proposeDialogVisible = ref(false);
const proposeFormRef = ref<FormInstance>();
const proposeSubmitting = ref(false);
const proposeForm = reactive<{ employeeId: string; period: string }>({
  employeeId: '',
  period: '',
});

const proposeRules: FormRules = {
  employeeId: [{ required: true, message: '请选择员工', trigger: 'change' }],
  period: [
    { required: true, message: '请输入调薪周期', trigger: 'blur' },
    {
      pattern: PERFORMANCE_APPLICATION_PERIOD_PATTERN,
      message: '调薪周期须为 YYYY-Q1~Q4 格式',
      trigger: 'blur',
    },
  ],
};

function openProposeDialog(): void {
  proposeForm.employeeId = isEmployeeScope.value ? selfEmployeeId.value : '';
  proposeForm.period = '';
  proposeDialogVisible.value = true;
}

async function onProposeSubmit(): Promise<void> {
  const valid = await proposeFormRef.value?.validate().catch(() => false);
  if (!valid) return;
  try {
    await ElMessageBox.confirm(
      '提交后将按近 N 个季度的归档绩效自动计算调薪幅度，是否继续？',
      '确认提议调薪',
      { type: 'warning', confirmButtonText: '确认', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  proposeSubmitting.value = true;
  try {
    const result = await proposeAdjustment({
      employeeId: proposeForm.employeeId,
      period: proposeForm.period,
    });
    ElMessage.success(`调薪提议已创建，审计日志 ${result.auditLogId}`);
    proposeDialogVisible.value = false;
    page.value = 1;
    await loadList();
  } catch (error: unknown) {
    ElMessage.error(getRequestErrorMessage(error));
  } finally {
    proposeSubmitting.value = false;
  }
}

const approvalDialogVisible = ref(false);
const approvalFormRef = ref<FormInstance>();
const approvalSubmitting = ref(false);
const approvalRow = ref<AdjustmentItem | null>(null);
const approvalDecision = ref(true);
const approvalForm = reactive<{ comment: string }>({ comment: '' });

function openApprovalDialog(row: AdjustmentItem, approved: boolean): void {
  approvalRow.value = row;
  approvalDecision.value = approved;
  approvalForm.comment = '';
  approvalDialogVisible.value = true;
}

async function onApprovalSubmit(): Promise<void> {
  const valid = await approvalFormRef.value?.validate().catch(() => false);
  if (!valid || !approvalRow.value) return;
  approvalSubmitting.value = true;
  try {
    await approveAdjustment(
      approvalRow.value.id,
      approvalDecision.value,
      approvalForm.comment || undefined,
    );
    ElMessage.success(approvalDecision.value ? '调薪提议已批准' : '调薪提议已驳回');
    approvalDialogVisible.value = false;
    await loadList();
  } catch (error: unknown) {
    ElMessage.error(getRequestErrorMessage(error));
  } finally {
    approvalSubmitting.value = false;
  }
}
</script>

<template>
  <div>
    <PageHeader
      :title="isEmployeeScope ? '我的调薪提议' : '调薪联动'"
      :breadcrumb="[{ label: '绩效管理' }, { label: '调薪联动' }]"
    >
      <template #actions>
        <el-button v-if="canPropose" type="primary" @click="openProposeDialog">
          提议调薪
        </el-button>
      </template>
    </PageHeader>

    <EmptyState
      v-if="isEmployeeScope && !selfEmployeeId"
      description="尚未关联员工档案，无法查看个人调薪提议"
    />

    <template v-else>
      <el-card v-if="!isEmployeeScope" shadow="never" class="filter-card">
        <el-form :inline="true">
          <el-form-item label="员工">
            <el-select
              v-model="filterForm.employeeId"
              clearable
              filterable
              placeholder="全部员工"
              style="width: 200px"
            >
              <el-option
                v-for="employee in visibleEmployees"
                :key="employee.id"
                :label="`${employee.name}(${employee.employeeNo})`"
                :value="employee.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="调薪周期">
            <el-input
              v-model="filterForm.period"
              clearable
              maxlength="7"
              placeholder="YYYY-Q1~Q4"
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
          <template #default="{ row }">{{ employeeName(row.newValue.employeeId) }}</template>
        </el-table-column>
        <el-table-column prop="newValue.period" label="调薪周期" width="120" />
        <el-table-column prop="newValue.evaluationQuarters" label="考察季度数" width="110" />
        <el-table-column label="S 比例" width="100" align="right">
          <template #default="{ row }">{{ rateLabel(row.newValue.sRatio) }}</template>
        </el-table-column>
        <el-table-column label="A 比例" width="100" align="right">
          <template #default="{ row }">{{ rateLabel(row.newValue.aRatio) }}</template>
        </el-table-column>
        <el-table-column label="调薪幅度" width="110" align="right">
          <template #default="{ row }">{{ rateLabel(row.newValue.adjustmentRate) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="adjustmentStatusInfo(row.newValue.approvalStatus).type">
              {{ adjustmentStatusInfo(row.newValue.approvalStatus).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="提议时间" width="150">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column v-if="canApprove" label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <template v-if="row.newValue.approvalStatus === 'proposed'">
              <el-button text type="success" @click="openApprovalDialog(row, true)">批准</el-button>
              <el-button text type="danger" @click="openApprovalDialog(row, false)">驳回</el-button>
            </template>
            <span v-else>—</span>
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
        @current-change="onPageChange"
        @size-change="onPageSizeChange"
      />

      <el-empty v-if="!loading && list.length === 0" description="暂无调薪提议" />
    </template>

    <el-dialog
      v-model="proposeDialogVisible"
      title="提议调薪"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form ref="proposeFormRef" :model="proposeForm" :rules="proposeRules" label-width="100px">
        <el-form-item label="员工" prop="employeeId">
          <el-select
            v-model="proposeForm.employeeId"
            filterable
            placeholder="选择员工"
            style="width: 100%"
          >
            <el-option
              v-for="employee in visibleEmployees"
              :key="employee.id"
              :label="`${employee.name}(${employee.employeeNo})`"
              :value="employee.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="调薪周期" prop="period">
          <el-input v-model="proposeForm.period" maxlength="7" placeholder="YYYY-Q1~Q4" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="proposeDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="proposeSubmitting" @click="onProposeSubmit">
          提交提议
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="approvalDialogVisible"
      :title="approvalDecision ? '批准调薪提议' : '驳回调薪提议'"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form ref="approvalFormRef" :model="approvalForm" label-width="100px">
        <el-form-item label="审批意见">
          <el-input
            v-model="approvalForm.comment"
            type="textarea"
            :rows="4"
            maxlength="2000"
            show-word-limit
            placeholder="可选，最多 2000 字"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="approvalDialogVisible = false">取消</el-button>
        <el-button
          :type="approvalDecision ? 'success' : 'danger'"
          :loading="approvalSubmitting"
          @click="onApprovalSubmit"
        >
          {{ approvalDecision ? '确认批准' : '确认驳回' }}
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
