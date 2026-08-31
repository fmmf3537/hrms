<script setup lang="ts">
/**
 * 员工导入弹窗（M5-2-A1）
 * 后端无 /employees/import，仅占位 UI
 */
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import type { UploadFile } from 'element-plus';
import FormDialog from '@/components/FormDialog.vue';

interface Props {
  modelValue: boolean;
}

defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const fileName = ref('');

function onChange(uploadFile: UploadFile): void {
  fileName.value = uploadFile.name;
}

function onConfirm(): void {
  ElMessage.warning('后端未提供 POST /employees/import，请使用「创建」逐条录入（导入留后续切片）');
  emit('update:modelValue', false);
}

function onTemplate(): void {
  ElMessage.info('导入模板端点未建（/employees/import-template）');
}
</script>

<template>
  <FormDialog
    :model-value="modelValue"
    title="导入员工"
    @update:model-value="emit('update:modelValue', $event)"
    @confirm="onConfirm"
  >
    <el-alert
      type="info"
      :closable="false"
      title="当前后端员工路由无 multipart 导入接口，本弹窗为占位。"
      class="mb"
    />
    <el-button class="mb" @click="onTemplate">下载模板</el-button>
    <el-upload
      :auto-upload="false"
      :limit="1"
      accept=".xlsx,.xls"
      :on-change="onChange"
    >
      <el-button type="primary">选择 Excel</el-button>
    </el-upload>
    <p v-if="fileName" class="file-name">已选：{{ fileName }}</p>
  </FormDialog>
</template>

<style scoped>
.mb {
  margin-bottom: 12px;
}

.file-name {
  margin-top: 8px;
  color: #606266;
  font-size: 13px;
}
</style>
