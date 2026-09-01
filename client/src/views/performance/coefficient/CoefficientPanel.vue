<script setup lang="ts">
/**
 * 绩效系数面板（M5-2-D1）· 消费 2 端点
 *  - GET /coefficients · PATCH /coefficients（整体对象 PATCH）
 *  - 写权限：admin / hr / **executive**（coefficient:write）
 *  - 字段范围：(0, 10]
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import { getCoefficients, updateCoefficients } from '@/api/performance';
import {
  GRADE_LABELS,
  type Coefficients,
  type Grade,
} from '@/api/types/performance';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';

const GRADES: Grade[] = ['S', 'A', 'B', 'C', 'D'];

const userStore = useUserStore();
const canWrite = computed(() =>
  hasPermission(userStore.userInfo, 'performance:coefficient:write'),
);

const loading = ref(false);
const submitting = ref(false);
const form = reactive<Coefficients>({ S: 1.5, A: 1.2, B: 1.0, C: 0.8, D: 0.5 });

async function load(): Promise<void> {
  loading.value = true;
  try {
    const data = await getCoefficients();
    GRADES.forEach((g) => {
      form[g] = Number(data[g] ?? form[g]);
    });
  } finally {
    loading.value = false;
  }
}

async function onSave(): Promise<void> {
  if (GRADES.some((g) => form[g] <= 0 || form[g] > 10)) {
    ElMessage.warning('每个系数需在 (0, 10]');
    return;
  }
  submitting.value = true;
  try {
    await updateCoefficients({ ...form });
    ElMessage.success('已保存系数');
    await load();
  } finally {
    submitting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <PageHeader
      title="绩效系数"
      :breadcrumb="[{ label: '绩效管理' }, { label: '绩效系数' }]"
    >
      <template #actions>
        <el-button
          v-if="canWrite"
          type="primary"
          :loading="submitting"
          @click="onSave"
        >
          保存
        </el-button>
      </template>
    </PageHeader>
    <el-card v-loading="loading" shadow="never">
      <div v-if="!canWrite" class="readonly-hint">
        当前角色仅可查看，保存操作需 coefficient:write 权限（admin / hr / executive）
      </div>
      <el-form label-width="120px">
        <el-form-item
          v-for="g in GRADES"
          :key="g"
          :label="`${g} 档系数`"
        >
          <el-input-number
            v-model="form[g]"
            :min="0.01"
            :max="10"
            :step="0.1"
            :precision="2"
            :disabled="!canWrite"
            style="width: 220px"
          />
          <span class="hint">{{ GRADE_LABELS[g] }} 等级 → 兑现倍数</span>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.readonly-hint {
  margin-bottom: 12px;
  color: #909399;
  font-size: 12px;
}
.hint {
  margin-left: 12px;
  color: #909399;
  font-size: 12px;
}
</style>
