<script setup lang="ts">
/**
 * 提成结算单详情（M5-2-C3）confirm 仅 pending_confirm；cancel 仅 draft/pending_confirm
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import FormDialog from '@/components/FormDialog.vue';
import { cancelSettlement, confirmSettlement, getSettlement } from '@/api/commission';
import {
  canSettlementAction,
  settlementStatusLabel,
  settlementTagType,
  type Settlement,
} from '@/api/types/compensation';
import { useUserStore } from '@/stores/user';
import { formatAmount, formatDate } from '@/utils/format';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const id = computed(() => String(route.params.id || ''));

const loading = ref(false);
const rec = ref<Settlement | null>(null);
const acting = ref(false);
const confirmVisible = ref(false);
const cancelVisible = ref(false);
const confirmRef = ref<FormInstance>();
const cancelRef = ref<FormInstance>();
const confirmForm = reactive({ remark: '' });
const cancelForm = reactive({ reason: '' });
const cancelRules: FormRules<{ reason: string }> = {
  reason: [{ required: true, message: '请填写作废原因', trigger: 'blur' }],
};

const user = computed(() => userStore.userInfo);
const canConfirm = computed(() => rec.value != null && canSettlementAction('confirm', rec.value, user.value));
const canCancel = computed(() => rec.value != null && canSettlementAction('cancel', rec.value, user.value));

async function load(): Promise<void> {
  loading.value = true;
  try {
    rec.value = await getSettlement(id.value);
  } finally {
    loading.value = false;
  }
}

async function onConfirm(): Promise<void> {
  acting.value = true;
  try {
    rec.value = await confirmSettlement(id.value, {
      remark: confirmForm.remark || undefined,
    });
    ElMessage.success('已确认');
    confirmVisible.value = false;
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
    rec.value = await cancelSettlement(id.value, { reason: cancelForm.reason });
    ElMessage.success('已作废');
    cancelVisible.value = false;
  } finally {
    acting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <PageHeader
      title="结算单详情"
      :breadcrumb="[
        { label: '薪酬核算' },
        { label: '提成结算', to: '/salary/commission-settlements' },
        { label: '详情' },
      ]"
    >
      <template #actions>
        <el-button @click="router.push('/salary/commission-settlements')">返回</el-button>
        <el-button v-if="canConfirm" type="primary" @click="confirmVisible = true">确认</el-button>
        <el-button v-if="canCancel" type="danger" @click="cancelVisible = true">作废</el-button>
      </template>
    </PageHeader>
    <EmptyState v-if="!loading && !rec" description="结算单不存在" />
    <el-descriptions v-else-if="rec" v-loading="loading" :column="2" border>
      <el-descriptions-item label="年季">{{ rec.year }} Q{{ rec.quarter }}</el-descriptions-item>
      <el-descriptions-item label="状态">
        <el-tag :type="settlementTagType(rec.status)" size="small">
          {{ settlementStatusLabel(rec.status) }}
        </el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="提成总额">{{ formatAmount(rec.totalAmount) }}</el-descriptions-item>
      <el-descriptions-item label="人数">{{ rec.employeeCount }}</el-descriptions-item>
      <el-descriptions-item label="笔数">{{ rec.recordCount }}</el-descriptions-item>
      <el-descriptions-item label="产品数">{{ rec.productCount }}</el-descriptions-item>
      <el-descriptions-item label="关联提成">{{ rec.commissionCount ?? '—' }}</el-descriptions-item>
      <el-descriptions-item label="期间">
        {{ formatDate(rec.periodStart) }} ~ {{ formatDate(rec.periodEnd) }}
      </el-descriptions-item>
      <el-descriptions-item label="确认时间">{{ formatDate(rec.confirmedAt) }}</el-descriptions-item>
      <el-descriptions-item label="作废原因">{{ rec.cancelReason || '—' }}</el-descriptions-item>
      <el-descriptions-item label="备注" :span="2">{{ rec.remark || '—' }}</el-descriptions-item>
      <el-descriptions-item label="创建时间">{{ formatDate(rec.createdAt) }}</el-descriptions-item>
    </el-descriptions>

    <FormDialog v-model="confirmVisible" title="确认结算" :confirm-loading="acting" @confirm="onConfirm">
      <el-form ref="confirmRef" :model="confirmForm" label-width="88px">
        <el-form-item label="备注">
          <el-input v-model="confirmForm.remark" type="textarea" maxlength="2000" show-word-limit :rows="3" />
        </el-form-item>
      </el-form>
    </FormDialog>
    <FormDialog v-model="cancelVisible" title="作废结算单" :confirm-loading="acting" @confirm="onCancel">
      <el-form ref="cancelRef" :model="cancelForm" :rules="cancelRules" label-width="88px">
        <el-form-item label="原因" prop="reason">
          <el-input v-model="cancelForm.reason" type="textarea" maxlength="2000" show-word-limit :rows="3" />
        </el-form-item>
      </el-form>
    </FormDialog>
  </div>
</template>
