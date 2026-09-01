<script setup lang="ts">
/**
 * 提成结算单列表（M5-2-C3）settle 仅 admin/hr
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import SearchForm from '@/components/SearchForm.vue';
import EmptyState from '@/components/EmptyState.vue';
import FormDialog from '@/components/FormDialog.vue';
import { createSettlement, listSettlements } from '@/api/commission';
import {
  settlementStatusLabel,
  settlementTagType,
  type CreateSettlementRequest,
  type Settlement,
  type SettlementStatus,
} from '@/api/types/compensation';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import { formatAmount, formatDate } from '@/utils/format';

const STATUSES: SettlementStatus[] = ['draft', 'pending_confirm', 'confirmed', 'cancelled'];

const router = useRouter();
const userStore = useUserStore();
const canRead = computed(() => hasPermission(userStore.userInfo, 'salary:commission:read'));
const canSettle = computed(() => hasPermission(userStore.userInfo, 'salary:commission:settle'));

const loading = ref(false);
const list = ref<Settlement[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const yearFilter = ref('');
const statusFilter = ref<SettlementStatus | ''>('');
const periodStart = ref('');
const periodEnd = ref('');
const formVisible = ref(false);
const submitting = ref(false);
const formRef = ref<FormInstance>();
const form = reactive({
  year: '',
  quarter: 1 as 1 | 2 | 3 | 4,
  initialStatus: 'draft' as 'draft' | 'pending_confirm',
});

const rules: FormRules<typeof form> = {
  year: [{ required: true, message: '请选择年份', trigger: 'change' }],
  quarter: [{ required: true, message: '请选择季度', trigger: 'change' }],
};

async function load(): Promise<void> {
  if (!canRead.value) {
    list.value = [];
    return;
  }
  loading.value = true;
  try {
    const res = await listSettlements({
      year: yearFilter.value ? Number(yearFilter.value) : undefined,
      status: statusFilter.value || undefined,
      periodStart: periodStart.value || undefined,
      periodEnd: periodEnd.value || undefined,
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
  yearFilter.value = '';
  statusFilter.value = '';
  periodStart.value = '';
  periodEnd.value = '';
  page.value = 1;
  load();
}

function openCreate(): void {
  form.year = '';
  form.quarter = 1;
  form.initialStatus = 'draft';
  formVisible.value = true;
}

async function onCreate(): Promise<void> {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) {
    return;
  }
  submitting.value = true;
  try {
    const body: CreateSettlementRequest = {
      year: Number(form.year),
      quarter: form.quarter,
      initialStatus: form.initialStatus,
    };
    const rec = await createSettlement(body);
    ElMessage.success('已创建结算单');
    formVisible.value = false;
    router.push(`/salary/commission-settlements/${rec.id}`);
  } finally {
    submitting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <PageHeader title="提成结算" :breadcrumb="[{ label: '薪酬核算' }, { label: '提成结算' }]">
      <template #actions>
        <el-button v-if="canSettle" type="primary" @click="openCreate">发起结算</el-button>
      </template>
    </PageHeader>
    <EmptyState v-if="!canRead" description="无权查看结算单" />
    <template v-else>
      <SearchForm @search="load" @reset="onReset">
        <el-form-item label="年份">
          <el-date-picker v-model="yearFilter" type="year" value-format="YYYY" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="statusFilter" clearable style="width: 140px">
            <el-option v-for="s in STATUSES" :key="s" :label="settlementStatusLabel(s)" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="期间起">
          <el-date-picker v-model="periodStart" type="date" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="期间止">
          <el-date-picker v-model="periodEnd" type="date" value-format="YYYY-MM-DD" />
        </el-form-item>
      </SearchForm>
      <el-table v-loading="loading" :data="list" stripe>
        <el-table-column label="年季" width="120">
          <template #default="{ row }">{{ row.year }} Q{{ row.quarter }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="settlementTagType(row.status)" size="small">
              {{ settlementStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="employeeCount" label="人数" width="80" />
        <el-table-column label="提成总额" width="140">
          <template #default="{ row }">{{ formatAmount(row.totalAmount) }}</template>
        </el-table-column>
        <el-table-column prop="recordCount" label="笔数" width="80" />
        <el-table-column label="创建时间" width="120">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              @click="router.push(`/salary/commission-settlements/${row.id}`)"
            >
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
    <FormDialog v-model="formVisible" title="发起结算" :confirm-loading="submitting" @confirm="onCreate">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="108px">
        <el-form-item label="年份" prop="year">
          <el-date-picker v-model="form.year" type="year" value-format="YYYY" style="width: 100%" />
        </el-form-item>
        <el-form-item label="季度" prop="quarter">
          <el-select v-model="form.quarter" style="width: 100%">
            <el-option :value="1" label="Q1" />
            <el-option :value="2" label="Q2" />
            <el-option :value="3" label="Q3" />
            <el-option :value="4" label="Q4" />
          </el-select>
        </el-form-item>
        <el-form-item label="初始状态">
          <el-radio-group v-model="form.initialStatus">
            <el-radio label="draft">草稿</el-radio>
            <el-radio label="pending_confirm">待确认</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
    </FormDialog>
  </div>
</template>

<style scoped>
.pager {
  margin-top: 12px;
  justify-content: flex-end;
}
</style>
