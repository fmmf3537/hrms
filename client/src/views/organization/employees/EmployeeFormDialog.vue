<script setup lang="ts">
/**
 * 员工创建/编辑（M5-2-A1）
 * 工号由后端自动生成，创建时不传 employeeNo
 */
import { reactive, ref, watch } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import FormDialog from '@/components/FormDialog.vue';
import { createEmployee, updateEmployee } from '@/api/employee';
import { listCompanies } from '@/api/company';
import { listDepartments } from '@/api/department';
import type {
  Company,
  CreateEmployeeRequest,
  Department,
  Employee,
  Gender,
} from '@/api/types/organization';

interface Props {
  modelValue: boolean;
  employee: Employee | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'saved'): void;
}>();

const formRef = ref<FormInstance>();
const submitting = ref(false);
const companies = ref<Company[]>([]);
const departments = ref<Department[]>([]);
const form = reactive<CreateEmployeeRequest>({
  companyId: '',
  departmentId: '',
  name: '',
  hireDate: '',
  gender: undefined,
  phone: '',
  email: '',
  idCard: '',
  bankCard: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  position: '',
});

const rules: FormRules<CreateEmployeeRequest> = {
  companyId: [{ required: true, message: '请选择公司', trigger: 'change' }],
  departmentId: [{ required: true, message: '请选择部门', trigger: 'change' }],
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  hireDate: [{ required: true, message: '请选择入职日期', trigger: 'change' }],
  phone: [
    {
      validator: (_rule, value: string, callback) => {
        if (!value) {
          callback();
          return;
        }
        if (!/^1\d{10}$/.test(value)) {
          callback(new Error('手机号须 11 位'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
  idCard: [
    {
      validator: (_rule, value: string, callback) => {
        if (!value) {
          callback();
          return;
        }
        if (!/^\d{17}[\dXx]$/.test(value)) {
          callback(new Error('身份证须 18 位'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
};

async function loadDepts(cid: string): Promise<void> {
  if (!cid) {
    departments.value = [];
    return;
  }
  departments.value = await listDepartments({ companyId: cid });
}

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) {
      return;
    }
    const res = await listCompanies({ page: 1, pageSize: 100 });
    companies.value = res.items;
    if (props.employee) {
      form.companyId = props.employee.companyId;
      form.departmentId = props.employee.departmentId ?? '';
      form.name = props.employee.name;
      form.hireDate = props.employee.hireDate?.slice(0, 10) ?? '';
      form.gender = (props.employee.gender as Gender | undefined) || undefined;
      form.phone = '';
      form.email = props.employee.email ?? '';
      form.idCard = '';
      form.bankCard = '';
      form.emergencyContactName = props.employee.emergencyContactName ?? '';
      form.emergencyContactPhone = '';
      form.position = '';
      await loadDepts(form.companyId);
    } else {
      form.companyId = companies.value[0]?.id ?? '';
      form.departmentId = '';
      form.name = '';
      form.hireDate = '';
      form.gender = undefined;
      form.phone = '';
      form.email = '';
      form.idCard = '';
      form.bankCard = '';
      form.emergencyContactName = '';
      form.emergencyContactPhone = '';
      form.position = '';
      await loadDepts(form.companyId);
    }
  },
);

async function onConfirm(): Promise<void> {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) {
    return;
  }
  submitting.value = true;
  try {
    if (props.employee) {
      await updateEmployee(props.employee.id, {
        name: form.name,
        departmentId: form.departmentId,
        gender: form.gender,
        email: form.email,
        phone: form.phone || undefined,
        idCard: form.idCard || undefined,
        bankCard: form.bankCard || undefined,
        emergencyContactName: form.emergencyContactName,
        emergencyContactPhone: form.emergencyContactPhone || undefined,
      });
      ElMessage.success('已更新');
    } else {
      await createEmployee({ ...form });
      ElMessage.success('已创建（工号由系统生成）');
    }
    emit('update:modelValue', false);
    emit('saved');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <FormDialog
    :model-value="modelValue"
    :title="employee ? '编辑员工' : '创建员工'"
    :confirm-loading="submitting"
    width="640px"
    @update:model-value="emit('update:modelValue', $event)"
    @confirm="onConfirm"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="112px">
      <el-form-item label="公司" prop="companyId">
        <el-select
          v-model="form.companyId"
          :disabled="Boolean(employee)"
          style="width: 100%"
          @change="loadDepts(form.companyId)"
        >
          <el-option v-for="c in companies" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="部门" prop="departmentId">
        <el-select v-model="form.departmentId" style="width: 100%">
          <el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="姓名" prop="name">
        <el-input v-model="form.name" />
      </el-form-item>
      <el-form-item label="入职日期" prop="hireDate">
        <el-date-picker
          v-model="form.hireDate"
          type="date"
          value-format="YYYY-MM-DD"
          :disabled="Boolean(employee)"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="性别" prop="gender">
        <el-select v-model="form.gender" clearable style="width: 100%">
          <el-option label="男" value="male" />
          <el-option label="女" value="female" />
        </el-select>
      </el-form-item>
      <el-form-item label="手机" prop="phone">
        <el-input v-model="form.phone" placeholder="留空则不改（编辑时）" />
      </el-form-item>
      <el-form-item label="邮箱" prop="email">
        <el-input v-model="form.email" />
      </el-form-item>
      <el-form-item label="身份证" prop="idCard">
        <el-input v-model="form.idCard" placeholder="18 位，留空不改" />
      </el-form-item>
      <el-form-item label="银行卡" prop="bankCard">
        <el-input v-model="form.bankCard" placeholder="留空不改" />
      </el-form-item>
      <el-form-item label="紧急联系人" prop="emergencyContactName">
        <el-input v-model="form.emergencyContactName" />
      </el-form-item>
      <el-form-item label="紧急电话" prop="emergencyContactPhone">
        <el-input v-model="form.emergencyContactPhone" />
      </el-form-item>
      <el-form-item v-if="!employee" label="岗位" prop="position">
        <el-input v-model="form.position" placeholder="写入任职历史" />
      </el-form-item>
    </el-form>
  </FormDialog>
</template>
