<script setup lang="ts">
/**
 * 出差申请（M5-2-B）至少提前 3 天：前端提示，后端强制
 */
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import { createBusinessTrip } from '@/api/businessTrip';
import { listEmployees } from '@/api/employee';
import type { CreateBusinessTripRequest } from '@/api/types/attendance';
import type { Employee } from '@/api/types/organization';
import { useUserStore } from '@/stores/user';

const router = useRouter();
const userStore = useUserStore();
const formRef = ref<FormInstance>();
const submitting = ref(false);
const employees = ref<Employee[]>([]);
const form = reactive<CreateBusinessTripRequest>({
  employeeId: '',
  destination: '',
  startDate: '',
  endDate: '',
  reason: '',
  projectCode: '',
});

const rules: FormRules<CreateBusinessTripRequest> = {
  employeeId: [{ required: true, message: '请选择员工', trigger: 'change' }],
  destination: [{ required: true, message: '请填写目的地', trigger: 'blur' }],
  startDate: [{ required: true, message: '请选择开始日', trigger: 'change' }],
  endDate: [
    { required: true, message: '请选择结束日', trigger: 'change' },
    {
      validator: (_r, value: string, callback) => {
        if (form.startDate && value && value < form.startDate) {
          callback(new Error('结束日须不早于开始日'));
          return;
        }
        callback();
      },
      trigger: 'change',
    },
  ],
  reason: [{ required: true, message: '请填写事由', trigger: 'blur' }],
};

async function onSubmit(): Promise<void> {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) {
    return;
  }
  submitting.value = true;
  try {
    await createBusinessTrip({
      ...form,
      projectCode: form.projectCode || undefined,
    });
    ElMessage.success('已提交出差申请');
    router.push('/attendance/business-trips');
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  const res = await listEmployees({ page: 1, pageSize: 100 });
  employees.value = res.items;
  form.employeeId = userStore.userInfo?.employee?.id || employees.value[0]?.id || '';
});
</script>

<template>
  <div>
    <PageHeader
      title="出差申请"
      :breadcrumb="[
        { label: '考勤假勤', to: '/attendance/business-trips' },
        { label: '出差管理', to: '/attendance/business-trips' },
        { label: '申请' },
      ]"
    >
      <template #actions>
        <el-button @click="router.push('/attendance/business-trips')">返回</el-button>
      </template>
    </PageHeader>
    <el-alert title="请至少提前 3 天申请（后端强制校验）" type="warning" :closable="false" class="mb" />
    <el-card shadow="never">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="96px" style="max-width: 560px">
        <el-form-item label="员工" prop="employeeId">
          <el-select v-model="form.employeeId" filterable style="width: 100%">
            <el-option
              v-for="e in employees"
              :key="e.id"
              :label="`${e.name} (${e.employeeNo})`"
              :value="e.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="目的地" prop="destination">
          <el-input v-model="form.destination" />
        </el-form-item>
        <el-form-item label="开始" prop="startDate">
          <el-date-picker v-model="form.startDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="结束" prop="endDate">
          <el-date-picker v-model="form.endDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="项目编码">
          <el-input v-model="form.projectCode" />
        </el-form-item>
        <el-form-item label="事由" prop="reason">
          <el-input v-model="form.reason" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="submitting" @click="onSubmit">提交</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.mb {
  margin-bottom: 12px;
}
</style>
