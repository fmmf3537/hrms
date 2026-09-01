<script setup lang="ts">
/**
 * 薪档管理（M5-2-C1）后端无 GET /grades/:id，薪级信息从 listGrades 匹配
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import StatusTag from '@/components/StatusTag.vue';
import FormDialog from '@/components/FormDialog.vue';
import { createGradeLevel, listGradeLevels, listGrades } from '@/api/salaryGrade';
import {
  SEQUENCE_LABELS,
  salaryStatusLabel,
  salaryTagType,
  type CreateGradeLevelRequest,
  type SalaryGrade,
  type SalaryGradeLevel,
  type SalarySequence,
} from '@/api/types/salary';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import { formatAmount } from '@/utils/format';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const canWrite = computed(() => hasPermission(userStore.userInfo, 'salary:grade:write'));
const gradeId = computed(() => String(route.params.id));

const loading = ref(false);
const grade = ref<SalaryGrade | null>(null);
const levels = ref<SalaryGradeLevel[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const formVisible = ref(false);
const submitting = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<CreateGradeLevelRequest>({
  gradeId: '',
  level: 1,
  baseSalary: 0,
  performanceBase: 0,
});

const rules: FormRules<CreateGradeLevelRequest> = {
  level: [{ required: true, message: '请选择档级', trigger: 'change' }],
  baseSalary: [{ required: true, message: '请填写基本工资', trigger: 'blur' }],
  performanceBase: [{ required: true, message: '请填写绩效基数', trigger: 'blur' }],
};

async function load(): Promise<void> {
  loading.value = true;
  try {
    const [gradeRes, levelRes] = await Promise.all([
      listGrades({ page: 1, pageSize: 100 }),
      listGradeLevels({ gradeId: gradeId.value, page: page.value, pageSize: pageSize.value }),
    ]);
    grade.value = gradeRes.items.find((g) => g.id === gradeId.value) ?? null;
    levels.value = levelRes.items;
    total.value = levelRes.total;
  } finally {
    loading.value = false;
  }
}

function openCreate(): void {
  form.gradeId = gradeId.value;
  form.level = 1;
  form.baseSalary = 0;
  form.performanceBase = 0;
  formVisible.value = true;
}

async function onCreate(): Promise<void> {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) {
    return;
  }
  submitting.value = true;
  try {
    await createGradeLevel({
      gradeId: gradeId.value,
      level: form.level,
      baseSalary: form.baseSalary,
      performanceBase: form.performanceBase,
    });
    ElMessage.success('已创建薪档');
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
    <PageHeader
      :title="grade ? `薪档 · ${grade.name}` : '薪档管理'"
      :breadcrumb="[
        { label: '薪酬核算', to: '/salary/grades' },
        { label: '薪级薪档', to: '/salary/grades' },
        { label: '薪档' },
      ]"
    >
      <template #actions>
        <el-button @click="router.push('/salary/grades')">返回</el-button>
        <el-button v-if="canWrite" type="primary" @click="openCreate">新增薪档</el-button>
      </template>
    </PageHeader>
    <el-card v-if="grade" shadow="never" class="block">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="序列">
          {{ SEQUENCE_LABELS[grade.sequence as SalarySequence] || grade.sequence }}
        </el-descriptions-item>
        <el-descriptions-item label="代码">{{ grade.gradeCode }}</el-descriptions-item>
        <el-descriptions-item label="基本工资">
          {{ formatAmount(grade.minBaseSalary) }} ~ {{ formatAmount(grade.maxBaseSalary) }}
        </el-descriptions-item>
        <el-descriptions-item label="绩效基数">
          {{ formatAmount(grade.minPerformanceBase) }} ~
          {{ formatAmount(grade.maxPerformanceBase) }}
        </el-descriptions-item>
      </el-descriptions>
    </el-card>
    <el-table v-loading="loading" :data="levels" stripe class="block">
      <el-table-column prop="level" label="档级" width="80" />
      <el-table-column label="基本工资" min-width="140">
        <template #default="{ row }">{{ formatAmount(row.baseSalary) }}</template>
      </el-table-column>
      <el-table-column label="绩效基数" min-width="140">
        <template #default="{ row }">{{ formatAmount(row.performanceBase) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="130">
        <template #default="{ row }">
          <StatusTag :status="row.status" :type="salaryTagType(row.status)" />
          <span class="hint">{{ salaryStatusLabel(row.status) }}</span>
        </template>
      </el-table-column>
    </el-table>
    <EmptyState v-if="!loading && levels.length === 0" />
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
    <FormDialog v-model="formVisible" title="新增薪档" :confirm-loading="submitting" @confirm="onCreate">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="112px">
        <el-form-item label="薪级">
          <el-input :model-value="grade?.name || gradeId" disabled />
        </el-form-item>
        <el-form-item label="档级" prop="level">
          <el-input-number v-model="form.level" :min="1" :max="7" />
        </el-form-item>
        <el-form-item label="基本工资" prop="baseSalary">
          <el-input-number v-model="form.baseSalary" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="绩效基数" prop="performanceBase">
          <el-input-number v-model="form.performanceBase" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
      </el-form>
    </FormDialog>
  </div>
</template>

<style scoped>
.block {
  margin-top: 12px;
}
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
