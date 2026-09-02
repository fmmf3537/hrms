<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import { listEmployees } from '@/api/employee';
import { listPromotions, proposePromotion } from '@/api/performanceApplication';
import {
  type ListPromotionFilter,
  type PromotionItem,
  getApplicationScope,
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
const canPropose = computed(() => hasPermission(user.value, 'performance:promotion:write'));

const loading = ref(false);
const list = ref<PromotionItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const employees = ref<Employee[]>([]);

const filterForm = reactive<{ employeeId: string }>({ employeeId: '' });

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
  loading.value = true;
  try {
    const query: ListPromotionFilter = {
      page: page.value,
      pageSize: pageSize.value,
    };
    if (isEmployeeScope.value) {
      query.employeeId = selfEmployeeId.value;
    } else if (filterForm.employeeId) {
      query.employeeId = filterForm.employeeId;
    }
    const response = await listPromotions(query);
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
const proposeForm = reactive<{
  employeeId: string;
  proposedPosition: string;
  lookbackYears: number;
}>({
  employeeId: '',
  proposedPosition: '',
  lookbackYears: 3,
});

const proposeRules: FormRules = {
  employeeId: [{ required: true, message: '请选择员工', trigger: 'change' }],
  proposedPosition: [
    { required: true, message: '请输入拟任职位', trigger: 'blur' },
    { max: 100, message: '拟任职位不能超过 100 个字符', trigger: 'blur' },
  ],
  lookbackYears: [
    { required: true, message: '请输入考察年数', trigger: 'change' },
    {
      validator: (_rule, value: number | undefined, callback) => {
        if (value == null || value < 1 || value > 5) {
          callback(new Error('考察年数须为 1-5'));
        } else {
          callback();
        }
      },
      trigger: 'change',
    },
  ],
};

function openProposeDialog(): void {
  proposeForm.employeeId = isEmployeeScope.value ? selfEmployeeId.value : '';
  proposeForm.proposedPosition = '';
  proposeForm.lookbackYears = 3;
  proposeDialogVisible.value = true;
}

async function onProposeSubmit(): Promise<void> {
  const valid = await proposeFormRef.value?.validate().catch(() => false);
  if (!valid) return;
  proposeSubmitting.value = true;
  try {
    const result = await proposePromotion({
      employeeId: proposeForm.employeeId,
      proposedPosition: proposeForm.proposedPosition,
      lookbackYears: proposeForm.lookbackYears,
    });
    ElMessage.success(`晋升提名已创建，审计日志 ${result.auditLogId}`);
    proposeDialogVisible.value = false;
    page.value = 1;
    await loadList();
  } catch (error: unknown) {
    ElMessage.error(getRequestErrorMessage(error));
  } finally {
    proposeSubmitting.value = false;
  }
}
</script>

<template>
  <div>
    <PageHeader
      :title="isEmployeeScope ? '我的晋升提名' : '晋升提名'"
      :breadcrumb="[{ label: '绩效管理' }, { label: '晋升提名' }]"
    >
      <template #actions>
        <el-button v-if="canPropose" type="primary" @click="openProposeDialog">
          晋升提名
        </el-button>
      </template>
    </PageHeader>

    <EmptyState
      v-if="isEmployeeScope && !selfEmployeeId"
      description="尚未关联员工档案，无法查看个人晋升提名"
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
        <el-table-column prop="newValue.proposedPosition" label="拟任职位" min-width="180" />
        <el-table-column prop="newValue.lookbackYears" label="考察年数" width="100" />
        <el-table-column label="提名时间" width="150">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
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

      <el-empty v-if="!loading && list.length === 0" description="暂无晋升提名" />
    </template>

    <el-dialog
      v-model="proposeDialogVisible"
      title="晋升提名"
      width="520px"
      :close-on-click-modal="false"
    >
      <el-form ref="proposeFormRef" :model="proposeForm" :rules="proposeRules" label-width="110px">
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
        <el-form-item label="拟任职位" prop="proposedPosition">
          <el-input
            v-model="proposeForm.proposedPosition"
            maxlength="100"
            show-word-limit
            placeholder="请输入拟任职位"
          />
        </el-form-item>
        <el-form-item label="考察年数" prop="lookbackYears">
          <el-input-number
            v-model="proposeForm.lookbackYears"
            :min="1"
            :max="5"
            :step="1"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="proposeDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="proposeSubmitting" @click="onProposeSubmit">
          提交提名
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
