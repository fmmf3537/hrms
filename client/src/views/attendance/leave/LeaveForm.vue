<script setup lang="ts">
/**
 * 请假申请（M5-2-B）
 */
import { onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import { createLeaveRequest, getLeaveBalance } from '@/api/leave';
import { listEmployees } from '@/api/employee';
import type { CreateLeaveRequestBody, LeaveBalance } from '@/api/types/attendance';
import type { Employee } from '@/api/types/organization';
import { useUserStore } from '@/stores/user';

const TYPE_LABEL: Record<string, string> = {
  annual: '年假',
  sick: '病假',
  personal: '事假',
  compensatory: '调休',
  marriage: '婚假',
  maternity: '产假',
  paternity: '陪产假',
  bereavement: '丧假',
};

const router = useRouter();
const userStore = useUserStore();
const formRef = ref<FormInstance>();
const submitting = ref(false);
const employees = ref<Employee[]>([]);
const balance = ref<LeaveBalance | null>(null);
const form = reactive<CreateLeaveRequestBody>({
  employeeId: '',
  leaveType: 'annual',
  startDate: '',
  endDate: '',
  reason: '',
});

const rules: FormRules<CreateLeaveRequestBody> = {
  employeeId: [{ required: true, message: '请选择员工', trigger: 'change' }],
  leaveType: [{ required: true, message: '请选择类型', trigger: 'change' }],
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
};

async function refreshBalance(): Promise<void> {
  if (!form.employeeId || !form.leaveType) {
    balance.value = null;
    return;
  }
  try {
    balance.value = await getLeaveBalance(form.employeeId, form.leaveType);
  } catch {
    balance.value = null;
  }
}

watch(() => [form.employeeId, form.leaveType] as const, refreshBalance);

async function onSubmit(): Promise<void> {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) {
    return;
  }
  submitting.value = true;
  try {
    await createLeaveRequest({
      employeeId: form.employeeId,
      leaveType: form.leaveType,
      startDate: form.startDate,
      endDate: form.endDate,
      reason: form.reason || undefined,
    });
    ElMessage.success('已提交请假');
    router.push('/attendance/leaves');
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  const res = await listEmployees({ page: 1, pageSize: 100 });
  employees.value = res.items;
  form.employeeId = userStore.userInfo?.employee?.id || employees.value[0]?.id || '';
  await refreshBalance();
});
</script>

<template>
  <div>
    <PageHeader
      title="请假申请"
      :breadcrumb="[
        { label: '考勤假勤', to: '/attendance/leaves' },
        { label: '请假管理', to: '/attendance/leaves' },
        { label: '申请' },
      ]"
    >
      <template #actions>
        <el-button @click="router.push('/attendance/leaves')">返回</el-button>
      </template>
    </PageHeader>
    <el-alert
      v-if="balance"
      :title="`${TYPE_LABEL[form.leaveType]} 剩余 ${balance.remainingDays} 天（总额 ${balance.totalDays}）`"
      type="info"
      :closable="false"
      class="mb"
    />
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
        <el-form-item label="类型" prop="leaveType">
          <el-select v-model="form.leaveType" style="width: 100%">
            <el-option v-for="(label, key) in TYPE_LABEL" :key="key" :label="label" :value="key" />
          </el-select>
        </el-form-item>
        <el-form-item label="开始" prop="startDate">
          <el-date-picker v-model="form.startDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="结束" prop="endDate">
          <el-date-picker v-model="form.endDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="事由">
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
