<script setup lang="ts">
/**
 * 公司创建/编辑表单（M5-2-A1）
 * @emit saved
 */
import { reactive, ref, watch } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import FormDialog from '@/components/FormDialog.vue';
import { createCompany, updateCompany } from '@/api/company';
import type { Company, CreateCompanyRequest, UpdateCompanyRequest } from '@/api/types/organization';

interface Props {
  modelValue: boolean;
  company: Company | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'saved'): void;
}>();

const formRef = ref<FormInstance>();
const submitting = ref(false);
const form = reactive<CreateCompanyRequest>({
  code: '',
  name: '',
  shortName: '',
  city: '',
  address: '',
  contact: '',
  legalRep: '',
  taxNo: '',
});

const rules: FormRules<CreateCompanyRequest> = {
  code: [{ required: true, message: '请输入编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
};

watch(
  () => [props.modelValue, props.company] as const,
  () => {
    if (!props.modelValue) {
      return;
    }
    if (props.company) {
      form.code = props.company.code;
      form.name = props.company.name;
      form.shortName = props.company.shortName ?? '';
      form.city = props.company.city ?? '';
      form.address = props.company.address ?? '';
      form.contact = props.company.contact ?? '';
      form.legalRep = props.company.legalRep ?? '';
      form.taxNo = props.company.taxNo ?? '';
    } else {
      form.code = '';
      form.name = '';
      form.shortName = '';
      form.city = '';
      form.address = '';
      form.contact = '';
      form.legalRep = '';
      form.taxNo = '';
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
    if (props.company) {
      const rest: UpdateCompanyRequest = {
        name: form.name,
        shortName: form.shortName,
        city: form.city,
        address: form.address,
        contact: form.contact,
        legalRep: form.legalRep,
        taxNo: form.taxNo,
      };
      await updateCompany(props.company.id, rest);
      ElMessage.success('已更新');
    } else {
      await createCompany({ ...form });
      ElMessage.success('已创建');
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
    :title="company ? '编辑法人' : '创建法人'"
    :confirm-loading="submitting"
    width="560px"
    @update:model-value="emit('update:modelValue', $event)"
    @confirm="onConfirm"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="96px">
      <el-form-item label="编码" prop="code">
        <el-input v-model="form.code" :disabled="Boolean(company)" placeholder="如 XACH" />
      </el-form-item>
      <el-form-item label="名称" prop="name">
        <el-input v-model="form.name" />
      </el-form-item>
      <el-form-item label="简称" prop="shortName">
        <el-input v-model="form.shortName" />
      </el-form-item>
      <el-form-item label="城市" prop="city">
        <el-input v-model="form.city" />
      </el-form-item>
      <el-form-item label="地址" prop="address">
        <el-input v-model="form.address" />
      </el-form-item>
      <el-form-item label="联系方式" prop="contact">
        <el-input v-model="form.contact" />
      </el-form-item>
      <el-form-item label="法人代表" prop="legalRep">
        <el-input v-model="form.legalRep" />
      </el-form-item>
      <el-form-item label="税号" prop="taxNo">
        <el-input v-model="form.taxNo" />
      </el-form-item>
    </el-form>
  </FormDialog>
</template>
