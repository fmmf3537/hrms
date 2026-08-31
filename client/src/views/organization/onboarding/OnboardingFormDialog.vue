<script setup lang="ts">
/**
 * 入职创建表单（M5-2-A2）
 * @validation 工号不传（后端生成）/ baseSalary 必填 / 试用期 0-24 月
 * @emit saved
 */
import { reactive, ref, watch } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import FormDialog from '@/components/FormDialog.vue';
import { createOnboarding } from '@/api/onboarding';
import { listCompanies } from '@/api/company';
import { listDepartments } from '@/api/department';
import type {
  Company,
  CreateOnboardingRequest,
  Department,
} from '@/api/types/organization';

interface Props {
  modelValue: boolean;
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
const form = reactive<CreateOnboardingRequest>({
  name: '',
  companyId: '',
  departmentId: '',
  hireDate: '',
  contractType: 'formal',
  gender: undefined,
  birthDate: '',
  phone: '',
  email: '',
  probationMonths: 3,
  baseSalary: undefined,
  idCard: '',
  bankName: '',
  bankCard: '',
});

const rules: FormRules<CreateOnboardingRequest> = {
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  companyId: [{ required: true, message: '请选择公司', trigger: 'change' }],
  departmentId: [{ required: true, message: '请选择部门', trigger: 'change' }],
  hireDate: [{ required: true, message: '请选择入职日期', trigger: 'change' }],
  contractType: [{ required: true, message: '请选择合同类型', trigger: 'change' }],
  baseSalary: [{ required: true, message: '请填写试用期薪资', trigger: 'blur' }],
  probationMonths: [
    {
      validator: (_rule, value: number | undefined, callback) => {
        if (value == null) {
          callback();
          return;
        }
        if (value < 0 || value > 24) {
          callback(new Error('试用期须 0-24 月'));
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
    form.name = '';
    form.companyId = companies.value[0]?.id ?? '';
    form.departmentId = '';
    form.hireDate = '';
    form.contractType = 'formal';
    form.gender = undefined;
    form.birthDate = '';
    form.phone = '';
    form.email = '';
    form.probationMonths = 3;
    form.baseSalary = undefined;
    form.idCard = '';
    form.bankName = '';
    form.bankCard = '';
    await loadDepts(form.companyId);
  },
);

async function onConfirm(): Promise<void> {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) {
    return;
  }
  submitting.value = true;
  try {
    const payload: CreateOnboardingRequest = {
      name: form.name,
      companyId: form.companyId,
      departmentId: form.departmentId,
      hireDate: form.hireDate,
      contractType: form.contractType,
      gender: form.gender,
      birthDate: form.birthDate || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      probationMonths: form.probationMonths,
      baseSalary: form.baseSalary,
      idCard: form.idCard || undefined,
      bankName: form.bankName || undefined,
      bankCard: form.bankCard || undefined,
    };
    await createOnboarding(payload);
    ElMessage.success('已创建入职单（工号由系统生成）');
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
    title="创建入职"
    :confirm-loading="submitting"
    width="640px"
    @update:model-value="emit('update:modelValue', $event)"
    @confirm="onConfirm"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="112px">
      <el-form-item label="姓名" prop="name">
        <el-input v-model="form.name" />
      </el-form-item>
      <el-form-item label="公司" prop="companyId">
        <el-select
          v-model="form.companyId"
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
      <el-form-item label="入职日期" prop="hireDate">
        <el-date-picker
          v-model="form.hireDate"
          type="date"
          value-format="YYYY-MM-DD"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="合同类型" prop="contractType">
        <el-select v-model="form.contractType" style="width: 100%">
          <el-option label="劳动合同" value="formal" />
          <el-option label="实习" value="intern" />
          <el-option label="顾问" value="consultant" />
          <el-option label="劳务" value="labor" />
        </el-select>
      </el-form-item>
      <el-form-item label="性别" prop="gender">
        <el-select v-model="form.gender" clearable style="width: 100%">
          <el-option label="男" value="male" />
          <el-option label="女" value="female" />
        </el-select>
      </el-form-item>
      <el-form-item label="出生日期" prop="birthDate">
        <el-date-picker
          v-model="form.birthDate"
          type="date"
          value-format="YYYY-MM-DD"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="手机" prop="phone">
        <el-input v-model="form.phone" />
      </el-form-item>
      <el-form-item label="邮箱" prop="email">
        <el-input v-model="form.email" />
      </el-form-item>
      <el-form-item label="试用期(月)" prop="probationMonths">
        <el-input-number v-model="form.probationMonths" :min="0" :max="24" />
      </el-form-item>
      <el-form-item label="试用期薪资" prop="baseSalary">
        <el-input-number v-model="form.baseSalary" :min="0" :precision="2" />
      </el-form-item>
      <el-form-item label="身份证" prop="idCard">
        <el-input v-model="form.idCard" />
      </el-form-item>
      <el-form-item label="开户行" prop="bankName">
        <el-input v-model="form.bankName" />
      </el-form-item>
      <el-form-item label="银行卡" prop="bankCard">
        <el-input v-model="form.bankCard" />
      </el-form-item>
    </el-form>
  </FormDialog>
</template>
