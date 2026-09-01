<script setup lang="ts">
/**
 * 成本预警详情（M5-2-C3）ack 仅 active；close 仅 acknowledged
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import FormDialog from '@/components/FormDialog.vue';
import { acknowledgeCostAlert, closeCostAlert, getCostAlert } from '@/api/costAlert';
import { listDepartments } from '@/api/department';
import {
  COST_ALERT_TYPE_LABELS,
  canCostAlertAction,
  costAlertSeverityTag,
  costAlertStatusLabel,
  costAlertTagType,
  type CostAlert,
  type CostAlertType,
} from '@/api/types/compensation';
import type { Department } from '@/api/types/organization';
import { useUserStore } from '@/stores/user';
import { formatDate } from '@/utils/format';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const id = computed(() => String(route.params.id || ''));

const loading = ref(false);
const rec = ref<CostAlert | null>(null);
const departments = ref<Department[]>([]);
const acting = ref(false);
const ackVisible = ref(false);
const closeVisible = ref(false);
const ackRef = ref<FormInstance>();
const closeRef = ref<FormInstance>();
const ackForm = reactive({ note: '' });
const closeForm = reactive({ reason: '', remark: '' });
const closeRules: FormRules<{ reason: string }> = {
  reason: [{ required: true, message: '请填写关闭原因', trigger: 'blur' }],
};

const user = computed(() => userStore.userInfo);
const canAck = computed(() => rec.value != null && canCostAlertAction('acknowledge', rec.value, user.value));
const canClose = computed(() => rec.value != null && canCostAlertAction('close', rec.value, user.value));

function typeLabel(t: string): string {
  return COST_ALERT_TYPE_LABELS[t as CostAlertType] ?? t;
}

function ratioText(v: string | number | null | undefined): string {
  const n = Number(v);
  if (!Number.isFinite(n)) {
    return '—';
  }
  return `${(n * 100).toFixed(2)}%`;
}

function deptName(deptId?: string | null): string {
  if (!deptId) {
    return '公司级';
  }
  return departments.value.find((d) => d.id === deptId)?.name || deptId;
}

function snapshotText(snap: Record<string, unknown> | null | undefined): string {
  if (!snap) {
    return '—';
  }
  try {
    return JSON.stringify(snap, null, 2);
  } catch {
    return String(snap);
  }
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    rec.value = await getCostAlert(id.value);
  } finally {
    loading.value = false;
  }
}

async function onAck(): Promise<void> {
  acting.value = true;
  try {
    rec.value = await acknowledgeCostAlert(id.value, { note: ackForm.note || undefined });
    ElMessage.success('已确认知晓');
    ackVisible.value = false;
  } finally {
    acting.value = false;
  }
}

async function onClose(): Promise<void> {
  const ok = await closeRef.value?.validate().catch(() => false);
  if (!ok) {
    return;
  }
  acting.value = true;
  try {
    rec.value = await closeCostAlert(id.value, {
      reason: closeForm.reason,
      remark: closeForm.remark || undefined,
    });
    ElMessage.success('已关闭');
    closeVisible.value = false;
  } finally {
    acting.value = false;
  }
}

onMounted(async () => {
  departments.value = await listDepartments();
  await load();
});
</script>

<template>
  <div>
    <PageHeader
      title="预警详情"
      :breadcrumb="[
        { label: '薪酬核算' },
        { label: '成本预警', to: '/salary/cost-alerts' },
        { label: '详情' },
      ]"
    >
      <template #actions>
        <el-button @click="router.push('/salary/cost-alerts')">返回</el-button>
        <el-button v-if="canAck" type="primary" @click="ackVisible = true">确认知晓</el-button>
        <el-button v-if="canClose" type="danger" @click="closeVisible = true">关闭</el-button>
      </template>
    </PageHeader>
    <EmptyState v-if="!loading && !rec" description="预警不存在" />
    <el-descriptions v-else-if="rec" v-loading="loading" :column="2" border>
      <el-descriptions-item label="类型">{{ typeLabel(rec.alertType) }}</el-descriptions-item>
      <el-descriptions-item label="状态">
        <el-tag :type="costAlertTagType(rec.status)" size="small">
          {{ costAlertStatusLabel(rec.status) }}
        </el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="严重度">
        <el-tag :type="costAlertSeverityTag(rec.severity)" size="small">{{ rec.severity }}</el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="期间">{{ rec.period }}</el-descriptions-item>
      <el-descriptions-item label="部门">{{ deptName(rec.departmentId) }}</el-descriptions-item>
      <el-descriptions-item label="扫描时间">{{ formatDate(rec.scanAt) }}</el-descriptions-item>
      <el-descriptions-item label="阈值">{{ ratioText(rec.threshold) }}</el-descriptions-item>
      <el-descriptions-item label="实际值">{{ ratioText(rec.actualValue) }}</el-descriptions-item>
      <el-descriptions-item label="确认备注">{{ rec.acknowledgeNote || '—' }}</el-descriptions-item>
      <el-descriptions-item label="关闭原因">{{ rec.closeReason || '—' }}</el-descriptions-item>
      <el-descriptions-item label="备注" :span="2">{{ rec.remark || '—' }}</el-descriptions-item>
      <el-descriptions-item label="指标快照" :span="2">
        <pre class="snap">{{ snapshotText(rec.contextSnapshot) }}</pre>
      </el-descriptions-item>
    </el-descriptions>

    <FormDialog v-model="ackVisible" title="确认知晓" :confirm-loading="acting" @confirm="onAck">
      <el-form ref="ackRef" :model="ackForm" label-width="88px">
        <el-form-item label="说明">
          <el-input v-model="ackForm.note" type="textarea" maxlength="2000" show-word-limit :rows="3" />
        </el-form-item>
      </el-form>
    </FormDialog>
    <FormDialog v-model="closeVisible" title="关闭预警" :confirm-loading="acting" @confirm="onClose">
      <el-form ref="closeRef" :model="closeForm" :rules="closeRules" label-width="88px">
        <el-form-item label="原因" prop="reason">
          <el-input v-model="closeForm.reason" type="textarea" maxlength="2000" show-word-limit :rows="3" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="closeForm.remark" type="textarea" maxlength="2000" show-word-limit :rows="3" />
        </el-form-item>
      </el-form>
    </FormDialog>
  </div>
</template>

<style scoped>
.snap {
  margin: 0;
  white-space: pre-wrap;
  font-size: 12px;
}
</style>
