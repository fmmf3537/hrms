<script setup lang="ts">
/**
 * 生成月报（M5-2-B）year ∈ [1970,9999] month ∈ [1,12]
 */
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import { generateMonthlySummary } from '@/api/monthlySummary';
import { listEmployees } from '@/api/employee';
import type { GenerateSummaryRequest } from '@/api/types/attendance';
import type { Employee } from '@/api/types/organization';

const router = useRouter();
const formRef = ref<FormInstance>();
const submitting = ref(false);
const employees = ref<Employee[]>([]);
const form = reactive<GenerateSummaryRequest & { monthStr: string }>({
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  employeeId: '',
  monthStr: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
});

const rules: FormRules<{ year: number; month: number }> = {
  year: [{ required: true, message: '请填写年', trigger: 'blur' }],
  month: [{ required: true, message: '请填写月', trigger: 'blur' }],
};

async function onSubmit(): Promise<void> {
  const [yearPart, monthPart] = form.monthStr.split('-').map(Number);
  form.year = yearPart;
  form.month = monthPart;
  if (form.year < 1970 || form.year > 9999 || form.month < 1 || form.month > 12) {
    ElMessage.warning('年月不合法');
    return;
  }
  submitting.value = true;
  try {
    const data = await generateMonthlySummary({
      year: form.year,
      month: form.month,
      employeeId: form.employeeId || undefined,
    });
    const n = Array.isArray(data) ? data.length : 1;
    ElMessage.success(`已生成 ${n} 份月报`);
    router.push('/attendance/monthly-summaries');
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  const res = await listEmployees({ page: 1, pageSize: 100 });
  employees.value = res.items;
});
</script>

<template>
  <div>
    <PageHeader
      title="生成月报"
      :breadcrumb="[
        { label: '考勤假勤', to: '/attendance/monthly-summaries' },
        { label: '月度汇总', to: '/attendance/monthly-summaries' },
        { label: '生成' },
      ]"
    >
      <template #actions>
        <el-button @click="router.push('/attendance/monthly-summaries')">返回</el-button>
      </template>
    </PageHeader>
    <el-card shadow="never">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="112px" style="max-width: 480px">
        <el-form-item label="月份" prop="month">
          <el-date-picker v-model="form.monthStr" type="month" value-format="YYYY-MM" style="width: 100%" />
        </el-form-item>
        <el-form-item label="员工（可选）">
          <el-select v-model="form.employeeId" clearable filterable style="width: 100%">
            <el-option
              v-for="e in employees"
              :key="e.id"
              :label="`${e.name} (${e.employeeNo})`"
              :value="e.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="submitting" @click="onSubmit">生成</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>
