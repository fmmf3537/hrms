<script setup lang="ts">
/**
 * 合同创建/编辑表单（M5-2-A2）
 * @validation endDate > startDate；5 类模板 formal/intern/consultant/labor/nda
 */
import { reactive, ref, watch } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import FormDialog from '@/components/FormDialog.vue';
import { createContract, updateContract } from '@/api/contract';
import { listEmployees } from '@/api/employee';
import type {
  Contract,
  ContractType,
  CreateContractRequest,
  Employee,
  UpdateContractRequest,
} from '@/api/types/organization';

interface Props {
  modelValue: boolean;
  contract: Contract | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'saved'): void;
}>();

const TEMPLATE_BY_TYPE: Record<ContractType, string> = {
  formal: 'formal',
  intern: 'intern',
  consultant: 'consultant',
  labor: 'labor',
  nda: 'nda',
};

const formRef = ref<FormInstance>();
const submitting = ref(false);
const employees = ref<Employee[]>([]);
const form = reactive<CreateContractRequest>({
  employeeId: '',
  contractType: 'formal',
  title: '',
  startDate: '',
  endDate: '',
  templateKey: 'formal',
});

const rules: FormRules<CreateContractRequest> = {
  employeeId: [{ required: true, message: '请选择员工', trigger: 'change' }],
  contractType: [{ required: true, message: '请选择类型', trigger: 'change' }],
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
  startDate: [{ required: true, message: '请选择开始日期', trigger: 'change' }],
  endDate: [
    { required: true, message: '请选择结束日期', trigger: 'change' },
    {
      validator: (_rule, value: string, callback) => {
        if (form.startDate && value && value <= form.startDate) {
          callback(new Error('结束日期须晚于开始日期'));
          return;
        }
        callback();
      },
      trigger: 'change',
    },
  ],
};

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) {
      return;
    }
    const res = await listEmployees({ page: 1, pageSize: 100 });
    employees.value = res.items;
    if (props.contract) {
      form.employeeId = props.contract.employeeId;
      form.contractType = (props.contract.contractType as ContractType) || 'formal';
      form.title = props.contract.title;
      form.startDate = props.contract.startDate?.slice(0, 10) ?? '';
      form.endDate = props.contract.endDate?.slice(0, 10) ?? '';
      form.templateKey = props.contract.templateKey || TEMPLATE_BY_TYPE[form.contractType];
    } else {
      form.employeeId = '';
      form.contractType = 'formal';
      form.title = '';
      form.startDate = '';
      form.endDate = '';
      form.templateKey = 'formal';
    }
  },
);

function onTypeChange(value: ContractType): void {
  form.templateKey = TEMPLATE_BY_TYPE[value];
}

async function onConfirm(): Promise<void> {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) {
    return;
  }
  submitting.value = true;
  try {
    form.templateKey = TEMPLATE_BY_TYPE[form.contractType];
    if (props.contract) {
      const patch: UpdateContractRequest = {
        contractType: form.contractType,
        title: form.title,
        startDate: form.startDate,
        endDate: form.endDate,
        templateKey: form.templateKey,
      };
      await updateContract(props.contract.id, patch);
      ElMessage.success('已更新');
    } else {
      await createContract({ ...form });
      ElMessage.success('已创建合同');
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
    :title="contract ? '编辑合同' : '创建合同'"
    :confirm-loading="submitting"
    width="560px"
    @update:model-value="emit('update:modelValue', $event)"
    @confirm="onConfirm"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="96px">
      <el-form-item v-if="!contract" label="员工" prop="employeeId">
        <el-select v-model="form.employeeId" filterable style="width: 100%">
          <el-option
            v-for="e in employees"
            :key="e.id"
            :label="`${e.name} (${e.employeeNo})`"
            :value="e.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="类型" prop="contractType">
        <el-select v-model="form.contractType" style="width: 100%" @change="onTypeChange">
          <el-option label="劳动合同" value="formal" />
          <el-option label="实习" value="intern" />
          <el-option label="顾问" value="consultant" />
          <el-option label="劳务" value="labor" />
          <el-option label="保密协议" value="nda" />
        </el-select>
      </el-form-item>
      <el-form-item label="标题" prop="title">
        <el-input v-model="form.title" />
      </el-form-item>
      <el-form-item label="开始日期" prop="startDate">
        <el-date-picker
          v-model="form.startDate"
          type="date"
          value-format="YYYY-MM-DD"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="结束日期" prop="endDate">
        <el-date-picker
          v-model="form.endDate"
          type="date"
          value-format="YYYY-MM-DD"
          style="width: 100%"
        />
      </el-form-item>
    </el-form>
  </FormDialog>
</template>
