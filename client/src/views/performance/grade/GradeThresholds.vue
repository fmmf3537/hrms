<script setup lang="ts">
/**
 * 等级阈值面板（M5-2-D1）· 消费 2 端点
 *  - GET /grade/thresholds · PATCH /grade/thresholds（整体对象 PATCH）
 *  - 写权限：admin / hr（executive 只读；dept_head 无 read → 菜单不可见）
 *  - 约束：S > A > B > C > D ≥ 0（service 强校验）；前端实时显示顺序状态
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import { getGradeThresholds, updateGradeThresholds } from '@/api/performance';
import { type Grade, type GradeThresholds } from '@/api/types/performance';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';

const GRADES: Grade[] = ['S', 'A', 'B', 'C', 'D'];

const userStore = useUserStore();
const canWrite = computed(() =>
  hasPermission(userStore.userInfo, 'performance:grade:threshold:write'),
);

const loading = ref(false);
const submitting = ref(false);
const form = reactive<GradeThresholds>({ S: 90, A: 80, B: 70, C: 60, D: 0 });

const orderValid = computed(() => {
  return form.S > form.A && form.A > form.B && form.B > form.C && form.C >= form.D && form.D >= 0;
});

const rangeValid = computed(() =>
  GRADES.every((g) => form[g] >= 0 && form[g] <= 100),
);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const data = await getGradeThresholds();
    GRADES.forEach((g) => {
      form[g] = Number(data[g] ?? form[g]);
    });
  } finally {
    loading.value = false;
  }
}

async function onSave(): Promise<void> {
  if (!rangeValid.value) {
    ElMessage.warning('每个阈值需在 [0, 100]');
    return;
  }
  if (!orderValid.value) {
    ElMessage.warning('阈值顺序必须满足 S > A > B > C > D ≥ 0');
    return;
  }
  submitting.value = true;
  try {
    await updateGradeThresholds({ ...form });
    ElMessage.success('已保存阈值');
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
      title="等级阈值"
      :breadcrumb="[{ label: '绩效管理' }, { label: '等级阈值' }]"
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
        当前角色仅可查看，保存操作需 grade:threshold:write 权限（仅 admin / hr）
      </div>
      <el-form label-width="160px">
        <el-form-item
          v-for="g in GRADES"
          :key="g"
          :label="`${g} 等级阈值（≥）`"
        >
          <el-input-number
            v-model="form[g]"
            :min="0"
            :max="100"
            :step="1"
            :precision="0"
            :disabled="!canWrite"
            style="width: 220px"
          />
          <span class="hint">
            分数 ≥ {{ form[g] }} → {{ g }} 档
          </span>
        </el-form-item>
        <el-form-item label="顺序校验">
          <el-tag v-if="orderValid && rangeValid" type="success">顺序与范围合法</el-tag>
          <el-tag v-else type="danger">
            {{ !rangeValid ? '存在越界（需 0-100）' : '顺序错乱：S > A > B > C > D ≥ 0' }}
          </el-tag>
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
