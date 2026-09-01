<script setup lang="ts">
/**
 * 加班申请（M5-2-B）前端提示至少提前 4h，校验在后端
 */
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import { createOvertimeRequest } from '@/api/overtime';
import { listEmployees } from '@/api/employee';
import type { CreateOvertimeRequestBody } from '@/api/types/attendance';
import type { Employee } from '@/api/types/organization';
import { useUserStore } from '@/stores/user';

const router = useRouter();
const userStore = useUserStore();
const formRef = ref<FormInstance>();
const submitting = ref(false);
const employees = ref<Employee[]>([]);
const form = reactive<CreateOvertimeRequestBody>({
  employeeId: '',
  startTime: '',
  endTime: '',
  compensationType: 'pay',
  overtimeType: 'weekday',
  reason: '',
});

const rules: FormRules<CreateOvertimeRequestBody> = {
  employeeId: [{ required: true, message: '请选择员工', trigger: 'change' }],
  startTime: [{ required: true, message: '请选择开始', trigger: 'change' }],
  endTime: [
    { required: true, message: '请选择结束', trigger: 'change' },
    {
      validator: (_r, value: string, callback) => {
        if (form.startTime && value && value <= form.startTime) {
          callback(new Error('结束须晚于开始'));
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
    await createOvertimeRequest({ ...form });
    ElMessage.success('已提交加班申请');
    router.push('/attendance/overtime');
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
      title="加班申请"
      :breadcrumb="[
        { label: '考勤假勤', to: '/attendance/overtime' },
        { label: '加班管理', to: '/attendance/overtime' },
        { label: '申请' },
      ]"
    >
      <template #actions>
        <el-button @click="router.push('/attendance/overtime')">返回</el-button>
      </template>
    </PageHeader>
    <el-alert title="请至少提前 4 小时申请（后端强制校验）" type="warning" :closable="false" class="mb" />
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
        <el-form-item label="开始" prop="startTime">
          <el-date-picker
            v-model="form.startTime"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="结束" prop="endTime">
          <el-date-picker
            v-model="form.endTime"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.overtimeType" style="width: 100%">
            <el-option label="工作日" value="weekday" />
            <el-option label="周末" value="weekend" />
            <el-option label="假日" value="holiday" />
          </el-select>
        </el-form-item>
        <el-form-item label="补偿">
          <el-radio-group v-model="form.compensationType">
            <el-radio label="pay">加班费</el-radio>
            <el-radio label="comp">调休 1:1</el-radio>
          </el-radio-group>
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
