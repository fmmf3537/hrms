<script setup lang="ts">
/**
 * 薪级列表（M5-2-C1）无 GET /:id；薪档管理跳 GradeDetail
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import SearchForm from '@/components/SearchForm.vue';
import EmptyState from '@/components/EmptyState.vue';
import StatusTag from '@/components/StatusTag.vue';
import FormDialog from '@/components/FormDialog.vue';
import { createGrade, listGrades } from '@/api/salaryGrade';
import {
  SEQUENCE_LABELS,
  salaryStatusLabel,
  salaryTagType,
  type CreateSalaryGradeRequest,
  type GradeStatus,
  type SalaryGrade,
  type SalarySequence,
} from '@/api/types/salary';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import { formatAmount } from '@/utils/format';

const SEQUENCES: SalarySequence[] = ['M', 'T', 'P', 'S', 'A'];

const router = useRouter();
const userStore = useUserStore();
const canWrite = computed(() => hasPermission(userStore.userInfo, 'salary:grade:write'));

const loading = ref(false);
const list = ref<SalaryGrade[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const sequenceFilter = ref<SalarySequence | ''>('');
const statusFilter = ref<GradeStatus | ''>('');
const formVisible = ref(false);
const submitting = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<CreateSalaryGradeRequest>({
  sequence: 'T',
  gradeCode: '',
  name: '',
  minBaseSalary: 0,
  maxBaseSalary: 0,
  minPerformanceBase: 0,
  maxPerformanceBase: 0,
});

const rules: FormRules<CreateSalaryGradeRequest> = {
  sequence: [{ required: true, message: '请选择序列', trigger: 'change' }],
  gradeCode: [{ required: true, message: '请输入薪级代码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  minBaseSalary: [{ required: true, message: '请填写最低基本工资', trigger: 'blur' }],
  maxBaseSalary: [{ required: true, message: '请填写最高基本工资', trigger: 'blur' }],
};

async function load(): Promise<void> {
  loading.value = true;
  try {
    const res = await listGrades({
      sequence: sequenceFilter.value || undefined,
      status: statusFilter.value || undefined,
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
  sequenceFilter.value = '';
  statusFilter.value = '';
  page.value = 1;
  load();
}

function openCreate(): void {
  form.sequence = 'T';
  form.gradeCode = '';
  form.name = '';
  form.minBaseSalary = 0;
  form.maxBaseSalary = 0;
  form.minPerformanceBase = 0;
  form.maxPerformanceBase = 0;
  formVisible.value = true;
}

async function onCreate(): Promise<void> {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) {
    return;
  }
  if (form.minBaseSalary > form.maxBaseSalary) {
    ElMessage.warning('基本工资下限须 ≤ 上限');
    return;
  }
  if (form.minPerformanceBase > form.maxPerformanceBase) {
    ElMessage.warning('绩效基数下限须 ≤ 上限');
    return;
  }
  submitting.value = true;
  try {
    await createGrade({ ...form });
    ElMessage.success('已创建薪级');
    formVisible.value = false;
    await load();
  } finally {
    submitting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <PageHeader title="薪级薪档" :breadcrumb="[{ label: '薪酬核算' }, { label: '薪级薪档' }]">
      <template #actions>
        <el-button v-if="canWrite" type="primary" @click="openCreate">创建薪级</el-button>
      </template>
    </PageHeader>
    <SearchForm @search="load" @reset="onReset">
      <el-form-item label="序列">
        <el-select v-model="sequenceFilter" clearable placeholder="全部" style="width: 140px">
          <el-option v-for="s in SEQUENCES" :key="s" :label="SEQUENCE_LABELS[s]" :value="s" />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="statusFilter" clearable placeholder="全部" style="width: 120px">
          <el-option label="生效" value="active" />
          <el-option label="已归档" value="archived" />
        </el-select>
      </el-form-item>
    </SearchForm>
    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column label="序列" width="110">
        <template #default="{ row }">
          {{ SEQUENCE_LABELS[row.sequence as SalarySequence] || row.sequence }}
        </template>
      </el-table-column>
      <el-table-column prop="gradeCode" label="薪级代码" width="110" />
      <el-table-column prop="name" label="名称" min-width="140" />
      <el-table-column label="基本工资" min-width="180">
        <template #default="{ row }">
          {{ formatAmount(row.minBaseSalary) }} ~ {{ formatAmount(row.maxBaseSalary) }}
        </template>
      </el-table-column>
      <el-table-column label="绩效基数" min-width="180">
        <template #default="{ row }">
          {{ formatAmount(row.minPerformanceBase) }} ~ {{ formatAmount(row.maxPerformanceBase) }}
        </template>
      </el-table-column>
      <el-table-column label="状态" width="130">
        <template #default="{ row }">
          <StatusTag :status="row.status" :type="salaryTagType(row.status)" />
          <span class="hint">{{ salaryStatusLabel(row.status) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="router.push(`/salary/grades/${row.id}`)">
            薪档管理
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <EmptyState v-if="!loading && list.length === 0" />
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
    <FormDialog v-model="formVisible" title="创建薪级" :confirm-loading="submitting" width="560px" @confirm="onCreate">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="120px">
        <el-form-item label="序列" prop="sequence">
          <el-select v-model="form.sequence" style="width: 100%">
            <el-option v-for="s in SEQUENCES" :key="s" :label="SEQUENCE_LABELS[s]" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="薪级代码" prop="gradeCode">
          <el-input v-model="form.gradeCode" placeholder="如 T3" />
        </el-form-item>
        <el-form-item label="名称" prop="name"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="最低基本工资" prop="minBaseSalary">
          <el-input-number v-model="form.minBaseSalary" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="最高基本工资" prop="maxBaseSalary">
          <el-input-number v-model="form.maxBaseSalary" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="最低绩效基数" prop="minPerformanceBase">
          <el-input-number v-model="form.minPerformanceBase" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="最高绩效基数" prop="maxPerformanceBase">
          <el-input-number v-model="form.maxPerformanceBase" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
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
.hint {
  margin-left: 6px;
  color: #909399;
  font-size: 12px;
}
</style>
