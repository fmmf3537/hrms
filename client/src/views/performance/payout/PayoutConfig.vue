<script setup lang="ts">
/**
 * 绩效奖金 · 兑现配置（M5-2-D3）
 * @module views/performance/payout/PayoutConfig
 * @description 消费 2 端点：
 *  - GET    /payouts/config   performance:payout:read
 *  - PATCH  /payouts/config   performance:payout:write（admin / hr）
 *
 * 双角色行为：
 *  - admin / hr：可见 GET + 「切换模式」按钮（payout:write）
 *  - executive / dept_head / employee：仅只读展示（菜单隐藏，但页面本身按规范提供只读视图）
 *
 * 切换流程：mode Radio（direct / pool）+ effectiveFrom ElDatePicker（可选）+ remark ≤500
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import {
  getPayoutConfig,
  switchPayoutConfig,
} from '@/api/performancePayout';
import {
  PAYOUT_MODE_LABELS,
  type PayoutConfig,
  type PayoutMode,
} from '@/api/types/performancePayout';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import { formatDate } from '@/utils/format';

const userStore = useUserStore();
const canWrite = computed(() =>
  hasPermission(userStore.userInfo, 'performance:payout:write'),
);

const loading = ref(false);
const submitting = ref(false);
const config = ref<PayoutConfig | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  try {
    config.value = await getPayoutConfig();
  } finally {
    loading.value = false;
  }
}

onMounted(load);

// ============ 切换对话框 ============
const dialogVisible = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<{
  mode: PayoutMode;
  effectiveFrom: string | undefined;
  remark: string;
}>({
  mode: 'direct',
  effectiveFrom: undefined,
  remark: '',
});

const rules: FormRules = {
  mode: [{ required: true, message: '请选择兑现模式', trigger: 'change' }],
  remark: [{ max: 500, message: '备注最多 500 字符', trigger: 'blur' }],
};

function openSwitchDialog(): void {
  if (!config.value) return;
  form.mode = (config.value.mode as PayoutMode) ?? 'direct';
  form.effectiveFrom = undefined;
  form.remark = '';
  dialogVisible.value = true;
}

async function onSubmit(): Promise<void> {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;
  submitting.value = true;
  try {
    const body: { mode: PayoutMode; effectiveFrom?: string; remark?: string } = {
      mode: form.mode,
    };
    if (form.effectiveFrom) body.effectiveFrom = form.effectiveFrom;
    if (form.remark) body.remark = form.remark;
    await switchPayoutConfig(body);
    ElMessage.success('已切换兑现模式');
    dialogVisible.value = false;
    await load();
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div>
    <PageHeader
      title="兑现配置"
      :breadcrumb="[{ label: '绩效管理' }, { label: '兑现配置' }]"
    >
      <template #actions>
        <el-button
          v-if="canWrite"
          type="primary"
          :disabled="!config"
          @click="openSwitchDialog"
        >
          切换模式
        </el-button>
      </template>
    </PageHeader>

    <div v-if="!canWrite" class="readonly-hint">
      当前角色仅可查看，切换模式需 payout:write 权限（仅 admin / hr）。
    </div>

    <el-card v-loading="loading" shadow="never">
      <el-descriptions v-if="config" :column="2" border>
        <el-descriptions-item label="兑现模式">
          <el-tag :type="config.mode === 'pool' ? 'warning' : 'success'">
            {{ PAYOUT_MODE_LABELS[config.mode as PayoutMode] ?? config.mode }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="生效时间">
          {{ formatDate(config.effectiveFrom) }}
        </el-descriptions-item>
        <el-descriptions-item label="失效时间">
          {{ config.effectiveTo ? formatDate(config.effectiveTo) : '当前生效' }}
        </el-descriptions-item>
        <el-descriptions-item label="更新时间">
          {{ formatDate(config.updatedAt) }}
        </el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">
          {{ config.remark || '-' }}
        </el-descriptions-item>
      </el-descriptions>
      <el-empty v-else-if="!loading" description="暂无兑现配置" />
    </el-card>

    <!-- 切换模式对话框 -->
    <el-dialog
      v-model="dialogVisible"
      title="切换兑现模式"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="兑现模式" prop="mode">
          <el-radio-group v-model="form.mode">
            <el-radio value="direct">直乘（base × 系数）</el-radio>
            <el-radio value="pool">部门池（部门池 × 个人占比）</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="生效时间">
          <el-date-picker
            v-model="form.effectiveFrom"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="默认今日"
            style="width: 220px"
          />
        </el-form-item>
        <el-form-item label="备注" prop="remark">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="3"
            :maxlength="500"
            show-word-limit
            placeholder="变更原因（≤500 字）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="onSubmit">
          确认切换
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.readonly-hint {
  margin-bottom: 12px;
  color: #909399;
  font-size: 12px;
}
</style>