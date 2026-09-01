<script setup lang="ts">
/**
 * 调薪详情（M5-2-C3）submit / approve(含 reject) / execute / cancel
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import FormDialog from '@/components/FormDialog.vue';
import {
  approveAdjustment,
  cancelAdjustment,
  executeAdjustment,
  getAdjustment,
  submitAdjustment,
} from '@/api/adjustment';
import { listEmployees } from '@/api/employee';
import {
  ADJUSTMENT_TYPE_LABELS,
  canAdjustmentAction,
  adjustmentStatusLabel,
  adjustmentTagType,
  type Adjustment,
  type AdjustmentType,
  type ApproveAdjustmentRequest,
} from '@/api/types/compensation';
import type { Employee } from '@/api/types/organization';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import { formatAmount, formatDate } from '@/utils/format';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const id = computed(() => String(route.params.id || ''));
const canReadAll = computed(() => hasPermission(userStore.userInfo, 'salary:adjustment:read'));

const loading = ref(false);
const rec = ref<Adjustment | null>(null);
const employees = ref<Employee[]>([]);
const acting = ref(false);
const submitVisible = ref(false);
const approveVisible = ref(false);
const cancelVisible = ref(false);
const submitRef = ref<FormInstance>();
const approveRef = ref<FormInstance>();
const cancelRef = ref<FormInstance>();
const submitForm = reactive({ comment: '' });
const approveForm = reactive<ApproveAdjustmentRequest>({ action: 'approve', comment: '' });
const cancelForm = reactive({ reason: '' });

const approveRules: FormRules<ApproveAdjustmentRequest> = {
  action: [{ required: true, message: '请选择动作', trigger: 'change' }],
  comment: [
    {
      validator: (_r, v, cb) => {
        if (approveForm.action === 'reject' && !String(v || '').trim()) {
          cb(new Error('驳回须填写意见'));
          return;
        }
        cb();
      },
      trigger: 'blur',
    },
  ],
};
const cancelRules: FormRules<{ reason: string }> = {
  reason: [{ required: true, message: '请填写作废原因', trigger: 'blur' }],
};

const user = computed(() => userStore.userInfo);
const canSubmit = computed(() => rec.value != null && canAdjustmentAction('submit', rec.value, user.value));
const canApprove = computed(() => rec.value != null && canAdjustmentAction('approve', rec.value, user.value));
const canExec = computed(() => rec.value != null && canAdjustmentAction('execute', rec.value, user.value));
const canCancel = computed(() => rec.value != null && canAdjustmentAction('cancel', rec.value, user.value));

function typeLabel(t: string): string {
  return ADJUSTMENT_TYPE_LABELS[t as AdjustmentType] ?? t;
}

function employeeName(empId: string): string {
  if (!canReadAll.value && empId === userStore.userInfo?.employee?.id) {
    return userStore.userInfo?.employee?.name || empId;
  }
  return employees.value.find((e) => e.id === empId)?.name || empId;
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    rec.value = await getAdjustment(id.value);
  } finally {
    loading.value = false;
  }
}

async function onSubmit(): Promise<void> {
  acting.value = true;
  try {
    rec.value = await submitAdjustment(id.value, { comment: submitForm.comment || undefined });
    ElMessage.success('已提交审批');
    submitVisible.value = false;
  } finally {
    acting.value = false;
  }
}

async function onApprove(): Promise<void> {
  const ok = await approveRef.value?.validate().catch(() => false);
  if (!ok) {
    return;
  }
  acting.value = true;
  try {
    rec.value = await approveAdjustment(id.value, {
      action: approveForm.action,
      comment: approveForm.comment || undefined,
    });
    ElMessage.success(approveForm.action === 'reject' ? '已驳回' : '已通过');
    approveVisible.value = false;
  } finally {
    acting.value = false;
  }
}

async function onExecute(): Promise<void> {
  await ElMessageBox.confirm('确认执行该调薪？将写入薪资历史并同步薪酬方案。', '执行调薪', {
    type: 'warning',
  });
  acting.value = true;
  try {
    rec.value = await executeAdjustment(id.value);
    ElMessage.success('已执行');
  } finally {
    acting.value = false;
  }
}

async function onCancel(): Promise<void> {
  const ok = await cancelRef.value?.validate().catch(() => false);
  if (!ok) {
    return;
  }
  acting.value = true;
  try {
    rec.value = await cancelAdjustment(id.value, { reason: cancelForm.reason });
    ElMessage.success('已作废');
    cancelVisible.value = false;
  } finally {
    acting.value = false;
  }
}

onMounted(async () => {
  if (canReadAll.value) {
    const res = await listEmployees({ page: 1, pageSize: 100 });
    employees.value = res.items;
  }
  await load();
});
</script>

<template>
  <div>
    <PageHeader
      title="调薪详情"
      :breadcrumb="[
        { label: '薪酬核算' },
        { label: '调薪管理', to: '/salary/adjustments' },
        { label: '详情' },
      ]"
    >
      <template #actions>
        <el-button @click="router.push('/salary/adjustments')">返回</el-button>
        <el-button v-if="canSubmit" type="primary" @click="submitVisible = true">提交</el-button>
        <el-button v-if="canApprove" type="primary" @click="approveVisible = true">审批</el-button>
        <el-button v-if="canExec" type="success" :loading="acting" @click="onExecute">执行</el-button>
        <el-button v-if="canCancel" type="danger" @click="cancelVisible = true">作废</el-button>
      </template>
    </PageHeader>
    <EmptyState v-if="!loading && !rec" description="调薪单不存在" />
    <el-descriptions v-else-if="rec" v-loading="loading" :column="2" border>
      <el-descriptions-item label="员工">{{ employeeName(rec.employeeId) }}</el-descriptions-item>
      <el-descriptions-item label="类型">{{ typeLabel(rec.adjustmentType) }}</el-descriptions-item>
      <el-descriptions-item label="状态">
        <el-tag :type="adjustmentTagType(rec.status)" size="small">
          {{ adjustmentStatusLabel(rec.status) }}
        </el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="生效日期">{{ formatDate(rec.effectiveDate) }}</el-descriptions-item>
      <el-descriptions-item label="调整前基本工资">{{ formatAmount(rec.fromBaseSalary) }}</el-descriptions-item>
      <el-descriptions-item label="调整后基本工资">{{ formatAmount(rec.toBaseSalary) }}</el-descriptions-item>
      <el-descriptions-item label="调整前绩效工资">
        {{ formatAmount(rec.fromPerformanceSalary) }}
      </el-descriptions-item>
      <el-descriptions-item label="调整后绩效工资">
        {{ formatAmount(rec.toPerformanceSalary) }}
      </el-descriptions-item>
      <el-descriptions-item label="差额">{{ formatAmount(rec.delta) }}</el-descriptions-item>
      <el-descriptions-item label="执行时间">{{ formatDate(rec.executedAt) }}</el-descriptions-item>
      <el-descriptions-item label="原因" :span="2">{{ rec.reason }}</el-descriptions-item>
      <el-descriptions-item label="备注" :span="2">{{ rec.remark || '—' }}</el-descriptions-item>
      <el-descriptions-item label="作废原因">{{ rec.cancelReason || '—' }}</el-descriptions-item>
      <el-descriptions-item label="创建时间">{{ formatDate(rec.createdAt) }}</el-descriptions-item>
    </el-descriptions>

    <FormDialog v-model="submitVisible" title="提交审批" :confirm-loading="acting" @confirm="onSubmit">
      <el-form ref="submitRef" :model="submitForm" label-width="88px">
        <el-form-item label="意见">
          <el-input v-model="submitForm.comment" type="textarea" maxlength="2000" show-word-limit :rows="3" />
        </el-form-item>
      </el-form>
    </FormDialog>
    <FormDialog v-model="approveVisible" title="审批调薪" :confirm-loading="acting" @confirm="onApprove">
      <el-form ref="approveRef" :model="approveForm" :rules="approveRules" label-width="88px">
        <el-form-item label="动作" prop="action">
          <el-radio-group v-model="approveForm.action">
            <el-radio label="approve">通过</el-radio>
            <el-radio label="reject">驳回</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="意见" prop="comment">
          <el-input v-model="approveForm.comment" type="textarea" maxlength="2000" show-word-limit :rows="3" />
        </el-form-item>
      </el-form>
    </FormDialog>
    <FormDialog v-model="cancelVisible" title="作废调薪" :confirm-loading="acting" @confirm="onCancel">
      <el-form ref="cancelRef" :model="cancelForm" :rules="cancelRules" label-width="88px">
        <el-form-item label="原因" prop="reason">
          <el-input v-model="cancelForm.reason" type="textarea" maxlength="2000" show-word-limit :rows="3" />
        </el-form-item>
      </el-form>
    </FormDialog>
  </div>
</template>
