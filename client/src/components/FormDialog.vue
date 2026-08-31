<script setup lang="ts">
/**
 * 表单弹窗
 * @props modelValue 显隐
 * @props title 标题
 * @props confirmLoading 确认按钮 loading
 * @emits update:modelValue / confirm / cancel
 * @slots default 表单内容
 */
interface Props {
  modelValue: boolean;
  title: string;
  confirmLoading?: boolean;
  width?: string;
}

const props = withDefaults(defineProps<Props>(), {
  confirmLoading: false,
  width: '520px',
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();

function onClose(): void {
  emit('cancel');
  emit('update:modelValue', false);
}
</script>

<template>
  <el-dialog
    :model-value="props.modelValue"
    :title="props.title"
    :width="props.width"
    destroy-on-close
    @update:model-value="(value: boolean) => emit('update:modelValue', value)"
    @close="onClose"
  >
    <slot />
    <template #footer>
      <el-button @click="onClose">取消</el-button>
      <el-button type="primary" :loading="props.confirmLoading" @click="emit('confirm')">
        确定
      </el-button>
    </template>
  </el-dialog>
</template>
