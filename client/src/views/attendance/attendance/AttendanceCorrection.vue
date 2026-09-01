<script setup lang="ts">
/**
 * 手动补卡 / 导入（M5-2-B）
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import { importData, manualClock } from '@/api/attendance';
import { listEmployees } from '@/api/employee';
import type { Employee } from '@/api/types/organization';
import type { ManualClockRequest as ManualBody } from '@/api/types/attendance';

const route = useRoute();
const router = useRouter();
const tab = computed(() => (route.query.tab === 'import' ? 'import' : 'manual'));
const formRef = ref<FormInstance>();
const submitting = ref(false);
const employees = ref<Employee[]>([]);
const form = reactive<ManualBody>({
  employeeId: '',
  clockInTime: '',
  clockOutTime: '',
  clockType: 'manual',
  manualReason: '',
});
const importForm = reactive({ fileContent: '', format: 'deli-eplus' });

const rules: FormRules<ManualBody> = {
  employeeId: [{ required: true, message: '请选择员工', trigger: 'change' }],
  clockInTime: [{ required: true, message: '请选择上班时间', trigger: 'change' }],
  manualReason: [{ required: true, message: '补卡原因必填', trigger: 'blur' }],
};

async function onManual(): Promise<void> {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) {
    return;
  }
  submitting.value = true;
  try {
    await manualClock({
      employeeId: form.employeeId,
      clockInTime: form.clockInTime,
      clockOutTime: form.clockOutTime || undefined,
      clockType: 'manual',
      manualReason: form.manualReason,
    });
    ElMessage.success('补卡已提交');
    router.push('/attendance/attendance');
  } finally {
    submitting.value = false;
  }
}

async function onImport(): Promise<void> {
  if (!importForm.fileContent.trim()) {
    ElMessage.warning('请粘贴导入内容');
    return;
  }
  submitting.value = true;
  try {
    const result = await importData({
      fileContent: importForm.fileContent,
      format: importForm.format,
    });
    ElMessage.success(`导入成功 ${result.successCount}，失败 ${result.failedCount}`);
    router.push('/attendance/attendance');
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
      :title="tab === 'import' ? '导入打卡' : '手动补卡'"
      :breadcrumb="[
        { label: '考勤假勤', to: '/attendance/attendance' },
        { label: '打卡管理', to: '/attendance/attendance' },
        { label: tab === 'import' ? '导入' : '补卡' },
      ]"
    >
      <template #actions>
        <el-button @click="router.push('/attendance/attendance')">返回</el-button>
      </template>
    </PageHeader>
    <el-card v-if="tab === 'manual'" shadow="never">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="112px" style="max-width: 560px">
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
        <el-form-item label="上班时间" prop="clockInTime">
          <el-date-picker
            v-model="form.clockInTime"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="下班时间">
          <el-date-picker
            v-model="form.clockOutTime"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="原因" prop="manualReason">
          <el-input v-model="form.manualReason" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="submitting" @click="onManual">提交补卡</el-button>
        </el-form-item>
      </el-form>
    </el-card>
    <el-card v-else shadow="never">
      <el-form label-width="112px" style="max-width: 640px">
        <el-form-item label="格式">
          <el-select v-model="importForm.format" style="width: 240px">
            <el-option label="得力 e+ mock" value="deli-eplus" />
          </el-select>
        </el-form-item>
        <el-form-item label="文件内容">
          <el-input v-model="importForm.fileContent" type="textarea" :rows="10" placeholder="粘贴 CSV/Excel 解析文本" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="submitting" @click="onImport">导入</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>
