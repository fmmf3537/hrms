<script setup lang="ts">
/**
 * 入职确认弹窗（M5-2-A2）
 * @page 二次确认 + approved / reason / instanceId
 * @permissions 仅 onboarding:confirm（hr/admin）
 */
import { reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import FormDialog from '@/components/FormDialog.vue';
import { confirmOnboarding } from '@/api/onboarding';
import type { ConfirmOnboardingRequest, Onboarding } from '@/api/types/organization';

type ConfirmAction = 'submit' | 'approve' | 'reject';

interface Props {
  modelValue: boolean;
  record: Onboarding | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'saved'): void;
}>();

const formRef = ref<FormInstance>();
const submitting = ref(false);
const form = reactive<{
  action: ConfirmAction;
  reason: string;
  instanceId: string;
}>({
  action: 'submit',
  reason: '',
  instanceId: '',
});

const rules: FormRules<{ action: ConfirmAction; reason: string }> = {
  action: [{ required: true, message: '请选择操作', trigger: 'change' }],
  reason: [
    {
      validator: (_rule, value: string, callback) => {
        if (form.action === 'reject' && !value.trim()) {
          callback(new Error('驳回须填写原因'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
};

watch(
  () => props.modelValue,
  (open) => {
    if (!open) {
      return;
    }
    form.action = 'submit';
    form.reason = '';
    form.instanceId = '';
  },
);

async function onConfirm(): Promise<void> {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok || !props.record) {
    return;
  }
  try {
    await ElMessageBox.confirm('确认提交入职审批操作？此操作不可轻易撤销。', '二次确认', {
      type: 'warning',
    });
  } catch {
    return;
  }
  submitting.value = true;
  try {
    const payload: ConfirmOnboardingRequest = {};
    if (form.action === 'approve') {
      payload.approved = true;
      payload.instanceId = form.instanceId || undefined;
    } else if (form.action === 'reject') {
      payload.approved = false;
      payload.reason = form.reason;
    }
    await confirmOnboarding(props.record.id, payload);
    ElMessage.success('已提交');
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
    title="入职确认"
    :confirm-loading="submitting"
    width="480px"
    @update:model-value="emit('update:modelValue', $event)"
    @confirm="onConfirm"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="96px">
      <el-form-item label="操作" prop="action">
        <el-radio-group v-model="form.action">
          <el-radio label="submit">提交审批</el-radio>
          <el-radio label="approve">审批通过</el-radio>
          <el-radio label="reject">审批驳回</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item v-if="form.action === 'approve'" label="审批实例">
        <el-input v-model="form.instanceId" placeholder="可选 UUID" />
      </el-form-item>
      <el-form-item v-if="form.action === 'reject'" label="原因" prop="reason">
        <el-input v-model="form.reason" type="textarea" :rows="3" />
      </el-form-item>
    </el-form>
  </FormDialog>
</template>
