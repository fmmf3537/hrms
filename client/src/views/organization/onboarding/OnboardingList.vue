<script setup lang="ts">
/**
 * 入职列表页（M5-2-A2）
 * @page PageHeader + 搜索 + DataTable 列表
 * @permissions admin/hr 可写；dept_head/executive 只读（无 onboarding:write 则隐藏按钮）
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import SearchForm from '@/components/SearchForm.vue';
import EmptyState from '@/components/EmptyState.vue';
import StatusTag from '@/components/StatusTag.vue';
import OnboardingFormDialog from './OnboardingFormDialog.vue';
import OnboardingConfirm from './OnboardingConfirm.vue';
import { listOnboardings, parseOcr } from '@/api/onboarding';
import { listCompanies } from '@/api/company';
import type {
  Company,
  Onboarding,
  OnboardingStatus,
  OcrType,
} from '@/api/types/organization';
import { lifecycleStatusLabel, lifecycleTagType } from '@/api/types/organization';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import { formatDate } from '@/utils/format';

const router = useRouter();
const userStore = useUserStore();
const canWrite = computed(() => hasPermission(userStore.userInfo, 'onboarding:write'));
const canConfirm = computed(() => hasPermission(userStore.userInfo, 'onboarding:confirm'));

const loading = ref(false);
const list = ref<Onboarding[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const statusFilter = ref<OnboardingStatus | ''>('');
const companyId = ref('');
const keyword = ref('');
const companies = ref<Company[]>([]);
const formVisible = ref(false);
const confirmVisible = ref(false);
const confirmRecord = ref<Onboarding | null>(null);
const ocrVisible = ref(false);
const ocrRecord = ref<Onboarding | null>(null);
const ocrType = ref<OcrType>('idCard');
const ocrLoading = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const res = await listOnboardings({
      companyId: companyId.value || undefined,
      status: statusFilter.value || undefined,
      keyword: keyword.value || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
    list.value = res.items;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

function onReset(): void {
  statusFilter.value = '';
  companyId.value = '';
  keyword.value = '';
  page.value = 1;
  load();
}

function openConfirm(row: Onboarding): void {
  confirmRecord.value = row;
  confirmVisible.value = true;
}

function openOcr(row: Onboarding): void {
  ocrRecord.value = row;
  ocrType.value = 'idCard';
  ocrVisible.value = true;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const { result } = reader;
      if (typeof result !== 'string') {
        reject(new Error('读取失败'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('读取失败'));
    reader.readAsDataURL(file);
  });
}

async function onOcrChange(uploadFile: { raw?: File }): Promise<void> {
  if (!uploadFile.raw || !ocrRecord.value) {
    return;
  }
  ocrLoading.value = true;
  try {
    const imageBase64 = await fileToBase64(uploadFile.raw);
    await parseOcr(ocrRecord.value.id, { type: ocrType.value, imageBase64 });
    ElMessage.success('OCR 解析已提交');
    ocrVisible.value = false;
    await load();
  } finally {
    ocrLoading.value = false;
  }
}

onMounted(async () => {
  const res = await listCompanies({ page: 1, pageSize: 100 });
  companies.value = res.items;
  await load();
});
</script>

<template>
  <div>
    <PageHeader title="入职管理" :breadcrumb="[{ label: '组织人事' }, { label: '入职管理' }]">
      <template #actions>
        <el-button v-if="canWrite" type="primary" @click="formVisible = true">创建入职</el-button>
      </template>
    </PageHeader>
    <SearchForm @search="load" @reset="onReset">
      <el-form-item label="公司">
        <el-select v-model="companyId" clearable placeholder="全部" style="width: 180px">
          <el-option v-for="c in companies" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="statusFilter" clearable placeholder="全部" style="width: 140px">
          <el-option label="草稿" value="draft" />
          <el-option label="已提交" value="submitted" />
          <el-option label="已通过" value="approved" />
          <el-option label="已取消" value="cancelled" />
        </el-select>
      </el-form-item>
      <el-form-item label="姓名">
        <el-input v-model="keyword" clearable placeholder="关键字" />
      </el-form-item>
    </SearchForm>
    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column prop="name" label="姓名" min-width="100" />
      <el-table-column label="公司" min-width="120">
        <template #default="{ row }">{{ row.company?.name || '—' }}</template>
      </el-table-column>
      <el-table-column label="部门" min-width="120">
        <template #default="{ row }">{{ row.department?.name || '—' }}</template>
      </el-table-column>
      <el-table-column label="入职日期" width="120">
        <template #default="{ row }">{{ formatDate(row.hireDate) }}</template>
      </el-table-column>
      <el-table-column prop="contractType" label="合同类型" width="110" />
      <el-table-column label="状态" width="120">
        <template #default="{ row }">
          <StatusTag :status="row.status" :type="lifecycleTagType(row.status)" />
          <span class="status-hint">{{ lifecycleStatusLabel(row.status) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="router.push(`/org/onboarding/${row.id}`)">
            详情
          </el-button>
          <el-button v-if="canWrite && row.status === 'draft'" link type="primary" @click="openOcr(row)">
            OCR
          </el-button>
          <el-button
            v-if="canConfirm && (row.status === 'draft' || row.status === 'submitted')"
            link
            type="success"
            @click="openConfirm(row)"
          >
            确认
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <EmptyState v-if="!loading && list.length === 0" />
    <div class="pager">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        background
        @current-change="load"
        @size-change="load"
      />
    </div>
    <OnboardingFormDialog v-model="formVisible" @saved="load" />
    <OnboardingConfirm v-model="confirmVisible" :record="confirmRecord" @saved="load" />
    <el-dialog v-model="ocrVisible" title="OCR 解析证件" width="440px">
      <el-form label-width="96px">
        <el-form-item label="类型">
          <el-select v-model="ocrType" style="width: 100%">
            <el-option label="身份证" value="idCard" />
            <el-option label="银行卡" value="bankCard" />
            <el-option label="证书" value="certificate" />
          </el-select>
        </el-form-item>
        <el-form-item label="图片">
          <el-upload
            :auto-upload="false"
            :show-file-list="false"
            accept="image/*"
            :disabled="ocrLoading"
            :on-change="onOcrChange"
          >
            <el-button type="primary" :loading="ocrLoading">选择图片</el-button>
          </el-upload>
        </el-form-item>
      </el-form>
    </el-dialog>
  </div>
</template>

<style scoped>
.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
.status-hint {
  margin-left: 6px;
  color: #909399;
  font-size: 12px;
}
</style>
