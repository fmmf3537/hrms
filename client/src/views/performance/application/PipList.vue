<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import { listEmployees } from '@/api/employee';
import { listPips, reviewPip, triggerPip } from '@/api/performanceApplication';
import {
  type ListPipFilter,
  type Pip,
  type PipReview,
  type PipReviewRating,
  PIP_RATING_MAP,
  PIP_STATUS_MAP,
  getApplicationScope,
  pipRatingInfo,
  pipStatusInfo,
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
const canTrigger = computed(() => hasPermission(user.value, 'performance:pip:write'));
const canReview = computed(() => hasPermission(user.value, 'performance:pip:review'));

const loading = ref(false);
const list = ref<Pip[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const employees = ref<Employee[]>([]);

type PipStatusValue = '' | 'active' | 'completed' | 'failed' | 'cancelled';

const filterForm = reactive<{ employeeId: string; status: PipStatusValue }>({
  employeeId: '',
  status: '',
});

const statusOptions = Object.keys(PIP_STATUS_MAP).map((key) => ({
  key: key as PipStatusValue,
  label: PIP_STATUS_MAP[key as keyof typeof PIP_STATUS_MAP].label,
}));

const ratingOptions = Object.keys(PIP_RATING_MAP).map((key) => ({
  key: key as PipReviewRating,
  label: PIP_RATING_MAP[key as PipReviewRating].label,
}));

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
    const query: ListPipFilter = {
      page: page.value,
      pageSize: pageSize.value,
    };
    if (isEmployeeScope.value) {
      query.employeeId = selfEmployeeId.value;
    } else if (filterForm.employeeId) {
      query.employeeId = filterForm.employeeId;
    }
    if (filterForm.status) query.status = filterForm.status;
    const response = await listPips(query);
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

function reviewsFor(row: Pip): PipReview[] {
  return row.reviews ?? [];
}

function onSearch(): void {
  page.value = 1;
  loadList();
}

function onReset(): void {
  filterForm.employeeId = '';
  filterForm.status = '';
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

const triggerDialogVisible = ref(false);
const triggerFormRef = ref<FormInstance>();
const triggerSubmitting = ref(false);
const triggerForm = reactive<{ employeeId: string; reason: string }>({
  employeeId: '',
  reason: '',
});

const triggerRules: FormRules = {
  employeeId: [{ required: true, message: '请选择员工', trigger: 'change' }],
  reason: [
    { required: true, message: '请输入触发原因', trigger: 'blur' },
    { min: 5, message: '触发原因不少于 5 个字符', trigger: 'blur' },
  ],
};

function openTriggerDialog(): void {
  triggerForm.employeeId = isEmployeeScope.value ? selfEmployeeId.value : '';
  triggerForm.reason = '';
  triggerDialogVisible.value = true;
}

async function onTriggerSubmit(): Promise<void> {
  const valid = await triggerFormRef.value?.validate().catch(() => false);
  if (!valid) return;
  triggerSubmitting.value = true;
  try {
    await triggerPip({ employeeId: triggerForm.employeeId, reason: triggerForm.reason });
    ElMessage.success('PIP 已触发');
    triggerDialogVisible.value = false;
    page.value = 1;
    await loadList();
  } catch (error: unknown) {
    ElMessage.error(getRequestErrorMessage(error));
  } finally {
    triggerSubmitting.value = false;
  }
}

const reviewDialogVisible = ref(false);
const reviewFormRef = ref<FormInstance>();
const reviewSubmitting = ref(false);
const reviewRow = ref<Pip | null>(null);
const reviewForm = reactive<{ rating: PipReviewRating; comment: string }>({
  rating: 'improved',
  comment: '',
});

const reviewRules: FormRules = {
  rating: [{ required: true, message: '请选择评审结果', trigger: 'change' }],
};

function openReviewDialog(row: Pip): void {
  reviewRow.value = row;
  reviewForm.rating = 'improved';
  reviewForm.comment = '';
  reviewDialogVisible.value = true;
}

async function onReviewSubmit(): Promise<void> {
  const valid = await reviewFormRef.value?.validate().catch(() => false);
  if (!valid || !reviewRow.value) return;
  reviewSubmitting.value = true;
  try {
    await reviewPip(reviewRow.value.id, reviewForm.rating, reviewForm.comment || undefined);
    ElMessage.success('PIP 月度评审已提交');
    reviewDialogVisible.value = false;
    await loadList();
  } catch (error: unknown) {
    ElMessage.error(getRequestErrorMessage(error));
  } finally {
    reviewSubmitting.value = false;
  }
}
</script>

<template>
  <div>
    <PageHeader
      :title="isEmployeeScope ? '我的 PIP' : 'PIP 管理'"
      :breadcrumb="[{ label: '绩效管理' }, { label: 'PIP 管理' }]"
    >
      <template #actions>
        <el-button v-if="canTrigger" type="primary" @click="openTriggerDialog">
          触发 PIP
        </el-button>
      </template>
    </PageHeader>

    <EmptyState
      v-if="isEmployeeScope && !selfEmployeeId"
      description="尚未关联员工档案，无法查看个人 PIP"
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
          <el-form-item label="状态">
            <el-select
              v-model="filterForm.status"
              clearable
              placeholder="全部状态"
              style="width: 140px"
            >
              <el-option
                v-for="option in statusOptions"
                :key="option.key"
                :label="option.label"
                :value="option.key"
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
        <el-table-column type="expand" label="评审记录" width="110">
          <template #default="{ row }">
            <el-timeline v-if="reviewsFor(row).length" class="review-list">
              <el-timeline-item
                v-for="review in reviewsFor(row)"
                :key="review.id"
                :timestamp="formatDate(review.reviewDate)"
                placement="top"
                color="#409eff"
              >
                <div class="review-content">
                  <el-tag :type="pipRatingInfo(review.rating).type">
                    第 {{ review.reviewMonth }} 月 · {{ pipRatingInfo(review.rating).label }}
                  </el-tag>
                  <span>{{ review.comment || '—' }}</span>
                </div>
              </el-timeline-item>
            </el-timeline>
            <span v-else>暂无评审记录</span>
          </template>
        </el-table-column>
        <el-table-column label="员工" min-width="160">
          <template #default="{ row }">{{ employeeName(row.employeeId) }}</template>
        </el-table-column>
        <el-table-column label="开始日期" width="120">
          <template #default="{ row }">{{ formatDate(row.startDate) }}</template>
        </el-table-column>
        <el-table-column label="结束日期" width="120">
          <template #default="{ row }">{{ formatDate(row.endDate) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="pipStatusInfo(row.status).type">
              {{ pipStatusInfo(row.status).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="reason" label="触发原因" min-width="220" show-overflow-tooltip />
        <el-table-column label="结果" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.outcome || '—' }}</template>
        </el-table-column>
        <el-table-column v-if="canReview" label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'active'"
              text
              type="primary"
              @click="openReviewDialog(row)"
            >
              月度评审
            </el-button>
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

      <el-empty v-if="!loading && list.length === 0" description="暂无 PIP 记录" />
    </template>

    <el-dialog
      v-model="triggerDialogVisible"
      title="触发 PIP"
      width="560px"
      :close-on-click-modal="false"
    >
      <el-form ref="triggerFormRef" :model="triggerForm" :rules="triggerRules" label-width="100px">
        <el-form-item label="员工" prop="employeeId">
          <el-select
            v-model="triggerForm.employeeId"
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
        <el-form-item label="触发原因" prop="reason">
          <el-input
            v-model="triggerForm.reason"
            type="textarea"
            :rows="4"
            maxlength="2000"
            show-word-limit
            placeholder="请输入触发原因（不少于 5 个字符）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="triggerDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="triggerSubmitting" @click="onTriggerSubmit">
          确认触发
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="reviewDialogVisible"
      title="PIP 月度评审"
      width="520px"
      :close-on-click-modal="false"
    >
      <el-form ref="reviewFormRef" :model="reviewForm" :rules="reviewRules" label-width="100px">
        <el-form-item label="评审结果" prop="rating">
          <el-radio-group v-model="reviewForm.rating">
            <el-radio v-for="option in ratingOptions" :key="option.key" :value="option.key">
              {{ option.label }}
            </el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="评审意见">
          <el-input
            v-model="reviewForm.comment"
            type="textarea"
            :rows="4"
            maxlength="2000"
            show-word-limit
            placeholder="可选，最多 2000 字"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reviewDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="reviewSubmitting" @click="onReviewSubmit">
          提交评审
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

.review-list {
  padding: 8px 16px;
}

.review-content {
  display: flex;
  gap: 12px;
  align-items: center;
  color: var(--el-text-color-secondary);
}
</style>
