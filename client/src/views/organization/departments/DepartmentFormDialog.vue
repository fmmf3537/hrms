<script setup lang="ts">
/**
 * 部门创建/编辑（M5-2-A1）
 */
import { reactive, ref, watch } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import FormDialog from '@/components/FormDialog.vue';
import { createDepartment, updateDepartment } from '@/api/department';
import type { CreateDepartmentRequest, Department } from '@/api/types/organization';

interface Props {
  modelValue: boolean;
  companyId: string;
  department: Department | null;
  parent: Department | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'saved'): void;
}>();

const formRef = ref<FormInstance>();
const submitting = ref(false);
const form = reactive<CreateDepartmentRequest>({
  companyId: '',
  parentId: null,
  code: '',
  name: '',
  headcount: 0,
  order: 0,
});

const rules: FormRules<CreateDepartmentRequest> = {
  code: [{ required: true, message: '请输入部门编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入部门名称', trigger: 'blur' }],
};

watch(
  () => [props.modelValue, props.department, props.parent, props.companyId] as const,
  () => {
    if (!props.modelValue) {
      return;
    }
    form.companyId = props.companyId;
    if (props.department) {
      form.code = props.department.code;
      form.name = props.department.name;
      form.parentId = props.department.parentId;
      form.headcount = props.department.headcount;
      form.order = props.department.order;
      form.leaderId = props.department.leaderId ?? undefined;
    } else {
      form.code = '';
      form.name = '';
      form.parentId = props.parent?.id ?? null;
      form.headcount = 0;
      form.order = 0;
      form.leaderId = undefined;
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
    if (props.department) {
      await updateDepartment(props.department.id, {
        name: form.name,
        headcount: form.headcount,
        order: form.order,
        leaderId: form.leaderId ?? null,
        parentId: form.parentId,
      });
      ElMessage.success('已更新');
    } else {
      await createDepartment({ ...form, companyId: props.companyId });
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
    :title="department ? '编辑部门' : '创建部门'"
    :confirm-loading="submitting"
    @update:model-value="emit('update:modelValue', $event)"
    @confirm="onConfirm"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="96px">
      <el-form-item v-if="parent && !department" label="上级部门">
        <el-input :model-value="parent.name" disabled />
      </el-form-item>
      <el-form-item label="编码" prop="code">
        <el-input v-model="form.code" :disabled="Boolean(department)" />
      </el-form-item>
      <el-form-item label="名称" prop="name">
        <el-input v-model="form.name" />
      </el-form-item>
      <el-form-item label="编制" prop="headcount">
        <el-input-number v-model="form.headcount" :min="0" />
      </el-form-item>
      <el-form-item label="排序" prop="order">
        <el-input-number v-model="form.order" />
      </el-form-item>
    </el-form>
  </FormDialog>
</template>
