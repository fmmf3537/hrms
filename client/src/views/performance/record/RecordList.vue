<script setup lang="ts">
/**
 * 考核记录列表（M5-2-D2）· 消费 5 端点
 *  - POST /records · GET /records · GET /records/:id · POST /:id/archive · POST /:id/reject
 *
 * 双模式：
 *  - 管理视角（admin/hr/dept_head/executive）：全量筛选（cycleId / status / deptId）
 *  - 员工视角（employee）：「我的考核」强制 employeeId = 当前用户 employee.id，隐藏员工维度筛选
 */
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import SearchForm from '@/components/SearchForm.vue';
import EmptyState from '@/components/EmptyState.vue';
import FormDialog from '@/components/FormDialog.vue';
import { listCycles, listSchemes } from '@/api/performance';
import { listEmployees } from '@/api/employee';
import { createRecord, listRecords } from '@/api/performanceRecord';
import {
  type CreateRecordRequest,
  type PerformanceRecord,
  RECORD_STATUS_MAP,
  recordStatusInfo,
} from '@/api/types/performanceRecord';
import type { PerformanceCycle, PerformanceScheme } from '@/api/types/performance';
import type { Employee } from '@/api/types/organization';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import { formatDate } from '@/utils/format';

const router = useRouter();
const userStore = useUserStore();
const user = computed(() => userStore.userInfo);

const canWrite = computed(() => hasPermission(user.value, 'performance:record:write'));
const canRead = computed(() => hasPermission(user.value, 'performance:record:read'));
const isEmployee = computed(
    () => (user.value?.roles ?? []).includes('employee') && !user.value?.permissions?.includes('*'),
);

const loading = ref(false);
const submitting = ref(false);
const list = ref<PerformanceRecord[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);

const cycleFilter = ref<string>('');
const statusFilter = ref<string>('');

const cyclesList = ref<PerformanceCycle[]>([]);
const schemesList = ref<PerformanceScheme[]>([]);
const employees = ref<Employee[]>([]);

const formVisible = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<{
  cycleId: string;
  employeeIds: string[];
  schemeId: string;
}>({
  cycleId: '',
  employeeIds: [],
  schemeId: '',
});

const rules: FormRules = {
  cycleId: [{ required: true, message: '请选择考核周期', trigger: 'change' }],
  employeeIds: [
    { required: true, message: '请选择至少 1 名员工', trigger: 'change' },
    {
      validator: (_rule, value, cb) => {
        if (Array.isArray(value) && value.length >= 1) {
          cb();
        } else {
          cb(new Error('请选择至少 1 名员工'));
        }
      },
      trigger: 'change',
    },
  ],
};

const STATUS_OPTIONS = Object.entries(RECORD_STATUS_MAP).map(([key, info]) => ({
  key,
  label: info.label,
}));

function buildListQuery(): Parameters<typeof listRecords>[0] {
  const q: Parameters<typeof listRecords>[0] = {
    cycleId: cycleFilter.value || undefined,
    status: statusFilter.value || undefined,
    page: page.value,
    pageSize: pageSize.value,
  };
  if (isEmployee.value) {
    const eid = user.value?.employee?.id;
    if (eid) {
      q.employeeId = eid;
    }
  }
  return q;
}

async function load(): Promise<void> {
  if (!canRead.value) {
    list.value = [];
    total.value = 0;
    return;
  }
  loading.value = true;
  try {
    const res = await listRecords(buildListQuery());
    list.value = res.items;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

function onReset(): void {
  cycleFilter.value = '';
  statusFilter.value = '';
  page.value = 1;
  load();
}

function openCreate(): void {
  form.cycleId = '';
  form.employeeIds = [];
  form.schemeId = '';
  formVisible.value = true;
}

async function onSubmitCreate(): Promise<void> {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) {
    return;
  }
  const body: CreateRecordRequest = {
    cycleId: form.cycleId,
    employeeIds: [...form.employeeIds],
  };
  if (form.schemeId) {
    body.schemeId = form.schemeId;
  }
  submitting.value = true;
  try {
    const res = await createRecord(body);
    const created = res.created?.length ?? 0;
    const skipped = res.skipped?.length ?? 0;
    const msg = skipped > 0
      ? `已创建 ${created} 条，跳过重复 ${skipped} 条`
      : `已创建 ${created} 条`;
    ElMessage.success(msg);
    formVisible.value = false;
    page.value = 1;
    await load();
  } finally {
    submitting.value = false;
  }
}

function employeeName(employeeId: string): string {
  const e = employees.value.find((item) => item.id === employeeId);
  return e ? `${e.name} (${e.employeeNo})` : employeeId;
}

function cycleName(cycleId: string): string {
  const c = cyclesList.value.find((item) => item.id === cycleId);
  return c ? `${c.code} · ${c.name}` : cycleId;
}

function schemeName(schemeId: string | null | undefined): string {
  if (!schemeId) {
    return '—';
  }
  const s = schemesList.value.find((item) => item.id === schemeId);
  return s ? s.name : schemeId;
}

function currentScore(record: PerformanceRecord): string {
  if (record.finalScore !== null && record.finalScore !== undefined) {
    return String(record.finalScore);
  }
  return '—';
}

function viewDetail(row: PerformanceRecord): void {
  router.push(`/performance/records/${row.id}`);
}

watch([cycleFilter, statusFilter], () => {
  page.value = 1;
  load();
});

onMounted(async () => {
  if (!canRead.value) {
    return;
  }
  const [cycleRes, schemeRes, empRes] = await Promise.all([
    listCycles({ page: 1, pageSize: 100 }),
    listSchemes({ page: 1, pageSize: 100 }),
    listEmployees({ page: 1, pageSize: 100 }),
  ]);
  cyclesList.value = cycleRes.items.filter((c) => c.status === 'active');
  if (cyclesList.value.length === 0) {
    cyclesList.value = cycleRes.items;
  }
  schemesList.value = schemeRes.items.filter((s) => s.status === 'active');
  employees.value = empRes.items;
  await load();
});
</script>

<template>
  <div>
    <PageHeader
      :title="isEmployee ? '我的考核' : '考核记录'"
      :breadcrumb="[
        { label: '绩效管理', to: '/performance' },
        { label: isEmployee ? '我的考核' : '考核记录' },
      ]"
    >
      <template #actions>
        <el-button v-if="canWrite" type="primary" @click="openCreate">
          发起考核
        </el-button>
      </template>
    </PageHeader>

    <EmptyState
      v-if="!canRead"
      description="当前角色无考核记录查看权限"
    />

    <EmptyState
      v-else-if="isEmployee && !user?.employee?.id"
      description="尚未关联员工档案，无法查看个人考核"
    />

    <template v-else>
      <SearchForm @search="load" @reset="onReset">
        <el-form-item v-if="!isEmployee" label="考核周期">
          <el-select
            v-model="cycleFilter"
            clearable
            placeholder="全部"
            style="width: 200px"
            filterable
          >
            <el-option
              v-for="c in cyclesList"
              :key="c.id"
              :label="`${c.code} · ${c.name}`"
              :value="c.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="statusFilter"
            clearable
            placeholder="全部"
            style="width: 160px"
          >
            <el-option
              v-for="opt in STATUS_OPTIONS"
              :key="opt.key"
              :label="opt.label"
              :value="opt.key"
            />
          </el-select>
        </el-form-item>
      </SearchForm>

      <el-table v-loading="loading" :data="list" stripe>
        <el-table-column v-if="!isEmployee" label="员工" min-width="160">
          <template #default="{ row }">{{ employeeName(row.employeeId) }}</template>
        </el-table-column>
        <el-table-column v-else label="周期" min-width="180">
          <template #default="{ row }">{{ cycleName(row.cycleId) }}</template>
        </el-table-column>
        <el-table-column v-if="!isEmployee" label="周期" min-width="180">
          <template #default="{ row }">{{ cycleName(row.cycleId) }}</template>
        </el-table-column>
        <el-table-column label="方案" min-width="140">
          <template #default="{ row }">{{ schemeName(row.schemeId) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="130">
          <template #default="{ row }">
            <el-tag :type="recordStatusInfo(row.status).type" size="small">
              {{ recordStatusInfo(row.status).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="当前得分" width="110">
          <template #default="{ row }">{{ currentScore(row) }}</template>
        </el-table-column>
        <el-table-column label="创建时间" width="160">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="viewDetail(row)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>

      <EmptyState v-if="!loading && list.length === 0" description="暂无考核记录" />

      <div class="pager">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          background
          @current-change="load"
          @size-change="load"
        />
      </div>
    </template>

    <FormDialog
      v-model="formVisible"
      title="发起考核"
      :confirm-loading="submitting"
      width="600px"
      @confirm="onSubmitCreate"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="考核周期" prop="cycleId">
          <el-select v-model="form.cycleId" placeholder="选择 active 周期" style="width: 100%">
            <el-option
              v-for="c in cyclesList"
              :key="c.id"
              :label="`${c.code} · ${c.name}`"
              :value="c.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="员工" prop="employeeIds">
          <el-select
            v-model="form.employeeIds"
            multiple
            filterable
            collapse-tags
            placeholder="支持多选；同名搜索 employeeNo / name"
            style="width: 100%"
          >
            <el-option
              v-for="e in employees"
              :key="e.id"
              :label="`${e.name} (${e.employeeNo})`"
              :value="e.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="考核方案" prop="schemeId">
          <el-select
            v-model="form.schemeId"
            clearable
            placeholder="可选；未选则不绑定方案（评分环节强校验要求有方案）"
            style="width: 100%"
          >
            <el-option
              v-for="s in schemesList"
              :key="s.id"
              :label="s.name"
              :value="s.id"
            />
          </el-select>
        </el-form-item>
        <el-alert
          type="info"
          :closable="false"
          title="创建后员工将收到站内通知；同周期同员工已存在记录会被跳过（去重）"
        />
      </el-form>
    </FormDialog>
  </div>
</template>

<style scoped>
.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>