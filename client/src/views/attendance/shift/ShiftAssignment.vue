<script setup lang="ts">
/**
 * 班次排班（M5-2-B）
 * assigneeType 切换时清空另一组 ID
 */
import { onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import { assignShift, getShift } from '@/api/shift';
import { listEmployees } from '@/api/employee';
import { listDepartments } from '@/api/department';
import type { AssignShiftRequest, AssigneeType, Shift } from '@/api/types/attendance';
import type { Department as OrgDept, Employee as OrgEmployee } from '@/api/types/organization';

const route = useRoute();
const router = useRouter();
const formRef = ref<FormInstance>();
const submitting = ref(false);
const shift = ref<Shift | null>(null);
const employees = ref<OrgEmployee[]>([]);
const departments = ref<OrgDept[]>([]);
const form = reactive<AssignShiftRequest>({
  shiftId: '',
  assigneeType: 'employee',
  employeeIds: [],
  departmentIds: [],
  effectiveFrom: '',
  remark: '',
});

const rules: FormRules<AssignShiftRequest> = {
  assigneeType: [{ required: true, message: '请选择维度', trigger: 'change' }],
  effectiveFrom: [{ required: true, message: '请选择生效日', trigger: 'change' }],
};

watch(
  () => form.assigneeType,
  (type: AssigneeType) => {
    if (type === 'employee') {
      form.departmentIds = [];
    } else {
      form.employeeIds = [];
    }
  },
);

async function onSubmit(): Promise<void> {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) {
    return;
  }
  if (form.assigneeType === 'employee' && !form.employeeIds?.length) {
    ElMessage.warning('请选择员工');
    return;
  }
  if (form.assigneeType === 'department' && !form.departmentIds?.length) {
    ElMessage.warning('请选择部门');
    return;
  }
  submitting.value = true;
  try {
    const result = await assignShift({
      shiftId: form.shiftId,
      assigneeType: form.assigneeType,
      employeeIds: form.assigneeType === 'employee' ? form.employeeIds : undefined,
      departmentIds: form.assigneeType === 'department' ? form.departmentIds : undefined,
      effectiveFrom: form.effectiveFrom,
      effectiveTo: form.effectiveTo,
      remark: form.remark || undefined,
    });
    ElMessage.success(`已创建 ${result.created} 条排班，冲突 ${result.conflicts.length} 条`);
    router.push(`/attendance/shifts/${form.shiftId}`);
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  const id = String(route.params.id);
  form.shiftId = id;
  shift.value = await getShift(id);
  const [empRes, deptList] = await Promise.all([
    listEmployees({ page: 1, pageSize: 100 }),
    listDepartments({ companyId: shift.value.companyId }),
  ]);
  employees.value = empRes.items;
  departments.value = deptList;
});
</script>

<template>
  <div>
    <PageHeader
      :title="`排班 · ${shift?.name || ''}`"
      :breadcrumb="[
        { label: '考勤假勤', to: '/attendance/shifts' },
        { label: '班次管理', to: '/attendance/shifts' },
        { label: '排班' },
      ]"
    >
      <template #actions>
        <el-button @click="router.push(`/attendance/shifts/${route.params.id}`)">返回</el-button>
      </template>
    </PageHeader>
    <el-card shadow="never">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="112px" style="max-width: 560px">
        <el-form-item label="维度" prop="assigneeType">
          <el-radio-group v-model="form.assigneeType">
            <el-radio label="employee">按员工</el-radio>
            <el-radio label="department">按部门</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.assigneeType === 'employee'" label="员工">
          <el-select v-model="form.employeeIds" multiple filterable style="width: 100%">
            <el-option
              v-for="e in employees"
              :key="e.id"
              :label="`${e.name} (${e.employeeNo})`"
              :value="e.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.assigneeType === 'department'" label="部门">
          <el-select v-model="form.departmentIds" multiple filterable style="width: 100%">
            <el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="生效日" prop="effectiveFrom">
          <el-date-picker v-model="form.effectiveFrom" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="失效日">
          <el-date-picker v-model="form.effectiveTo" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="submitting" @click="onSubmit">提交排班</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>
