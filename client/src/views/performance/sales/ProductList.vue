<script setup lang="ts">
/**
 * 销售产品字典（M5-2-D4）
 * @module views/performance/sales/ProductList
 * @description 消费 3 端点：
 *  - GET    /sales/products        performance:sales:product:read
 *  - POST   /sales/products        performance:sales:product:write
 *  - PATCH  /sales/products/:id    performance:sales:product:write（含归档 status=archived）
 *
 * 角色：
 *  - admin/hr：可见全部 + 新建/编辑/归档
 *  - dept_head/executive/employee：只读
 *
 * 关键约束：
 *  - baseRate Decimal(5,4) → 列表展示百分比标签；编辑表单输入百分比数字 5（提交时 ÷100）
 *  - 归档通过编辑 Dialog 改 status='archived'，无独立端点
 *  - 删除按钮不提供（D5 仅有软归档）
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';

import { createProduct, listProducts, updateProduct } from '@/api/performanceSales';
import {
  type ListProductFilter,
  SALES_PRODUCT_CATEGORY_MAP,
  SALES_PRODUCT_STATUS_MAP,
  type SalesProduct,
  type SalesProductCategory,
  type SalesProductStatus,
  canSalesAction,
  rateLabel,
  rateToPercent,
  salesProductStatusInfo,
} from '@/api/types/performanceSales';
import { useUserStore } from '@/stores/user';
import { formatDate } from '@/utils/format';

const userStore = useUserStore();
const user = computed(() => userStore.userInfo);

const canWrite = computed(() => canSalesAction('product:create', user.value));

const loading = ref(false);
const list = ref<SalesProduct[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);

const filterForm = reactive<{
  category: SalesProductCategory | '';
  status: SalesProductStatus | '';
}>({
  category: '',
  status: '',
});

const CATEGORY_OPTIONS = (Object.keys(SALES_PRODUCT_CATEGORY_MAP) as SalesProductCategory[]).map(
  (k) => ({ key: k, label: SALES_PRODUCT_CATEGORY_MAP[k] }),
);
const STATUS_OPTIONS = (Object.keys(SALES_PRODUCT_STATUS_MAP) as SalesProductStatus[]).map(
  (k) => ({ key: k, label: SALES_PRODUCT_STATUS_MAP[k].label }),
);

async function loadList(): Promise<void> {
  loading.value = true;
  try {
    const query: ListProductFilter = {
      page: page.value,
      pageSize: pageSize.value,
    };
    if (filterForm.category) query.category = filterForm.category;
    if (filterForm.status) query.status = filterForm.status;
    const res = await listProducts(query);
    list.value = res.items;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadList();
});

function categoryLabel(category: string | null | undefined): string {
  if (!category) return '—';
  return SALES_PRODUCT_CATEGORY_MAP[category as SalesProductCategory] ?? category;
}

// ============ 新建 / 编辑 Dialog ============

interface EditForm {
  id: string;
  code: string;
  name: string;
  category: SalesProductCategory | '';
  baseRatePercent: number | '';
  description: string;
  status: SalesProductStatus;
}

function emptyEditForm(): EditForm {
  return {
    id: '',
    code: '',
    name: '',
    category: '',
    baseRatePercent: '',
    description: '',
    status: 'active',
  };
}

const editDialogVisible = ref(false);
const editDialogMode = ref<'create' | 'edit'>('create');
const editFormRef = ref<FormInstance>();
const editForm = reactive<EditForm>(emptyEditForm());
const editSubmitting = ref(false);

const editRules: FormRules = {
  code: [{ required: true, message: '请输入产品编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入产品名称', trigger: 'blur' }],
  category: [{ required: true, message: '请选择产品分类', trigger: 'change' }],
  baseRatePercent: [
    {
      validator: (_r, value, cb) => {
        if (value === '' || value == null) {
          cb(); // 可选，不传走后端 rate_tiers
          return;
        }
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0 || n > 50) {
          cb(new Error('提成比例须 > 0 且 ≤ 50（百分比）'));
        } else {
          cb();
        }
      },
      trigger: 'blur',
    },
  ],
};

function openCreateDialog(): void {
  editDialogMode.value = 'create';
  Object.assign(editForm, emptyEditForm());
  editDialogVisible.value = true;
}

function openEditDialog(row: SalesProduct): void {
  editDialogMode.value = 'edit';
  editForm.id = row.id;
  editForm.code = row.code;
  editForm.name = row.name;
  editForm.category = (row.category as SalesProductCategory) ?? '';
  const p = rateToPercent(row.baseRate);
  editForm.baseRatePercent = p ?? '';
  editForm.description = row.description ?? '';
  editForm.status = (row.status as SalesProductStatus) ?? 'active';
  editDialogVisible.value = true;
}

async function onEditSubmit(): Promise<void> {
  if (!editFormRef.value) return;
  const valid = await editFormRef.value.validate().catch(() => false);
  if (!valid) return;
  editSubmitting.value = true;
  try {
    if (editDialogMode.value === 'create') {
      await createProduct({
        code: editForm.code,
        name: editForm.name,
        category: editForm.category as SalesProductCategory,
        baseRatePercent: editForm.baseRatePercent === '' ? undefined : Number(editForm.baseRatePercent),
        description: editForm.description || undefined,
      });
      ElMessage.success('产品已创建');
    } else {
      const isArchive = editForm.status === 'archived';
      await updateProduct(editForm.id, {
        name: editForm.name,
        category: editForm.category as SalesProductCategory,
        baseRatePercent:
          editForm.baseRatePercent === '' ? undefined : Number(editForm.baseRatePercent),
        description: editForm.description,
        ...(isArchive ? { status: 'archived' as SalesProductStatus } : {}),
      });
      ElMessage.success(isArchive ? '产品已归档' : '产品已更新');
    }
    editDialogVisible.value = false;
    page.value = 1;
    await loadList();
  } finally {
    editSubmitting.value = false;
  }
}

function onSearch(): void {
  page.value = 1;
  loadList();
}

function onReset(): void {
  filterForm.category = '';
  filterForm.status = '';
  page.value = 1;
  loadList();
}
</script>

<template>
  <div>
    <PageHeader
      title="销售产品字典"
      :breadcrumb="[{ label: '绩效管理' }, { label: '销售提成' }, { label: '产品字典' }]"
    >
      <template #actions>
        <el-button v-if="canWrite" type="primary" @click="openCreateDialog">
          新建产品
        </el-button>
      </template>
    </PageHeader>

    <el-card shadow="never" class="filter-card">
      <el-form :inline="true">
        <el-form-item label="分类">
          <el-select v-model="filterForm.category" clearable placeholder="全部" style="width: 140px">
            <el-option
              v-for="opt in CATEGORY_OPTIONS"
              :key="opt.key"
              :label="opt.label"
              :value="opt.key"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filterForm.status" clearable placeholder="全部" style="width: 140px">
            <el-option
              v-for="opt in STATUS_OPTIONS"
              :key="opt.key"
              :label="opt.label"
              :value="opt.key"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="onSearch">查询</el-button>
          <el-button @click="onReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-table v-loading="loading" :data="list" border stripe>
      <el-table-column label="编码" prop="code" width="160" />
      <el-table-column label="名称" prop="name" min-width="180" />
      <el-table-column label="分类" width="100">
        <template #default="{ row }">{{ categoryLabel(row.category) }}</template>
      </el-table-column>
      <el-table-column label="提成比例" width="110" align="right">
        <template #default="{ row }">{{ rateLabel(row.baseRate) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="salesProductStatusInfo(row.status).type">
            {{ salesProductStatusInfo(row.status).label }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="160">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="描述" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">{{ row.description || '—' }}</template>
      </el-table-column>
      <el-table-column v-if="canWrite" label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button text type="primary" :disabled="row.status === 'archived'" @click="openEditDialog(row)">
            {{ row.status === 'archived' ? '已归档' : '编辑' }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      :page-sizes="[10, 20, 50, 100]"
      layout="total, sizes, prev, pager, next"
      class="pager"
    />

    <el-dialog
      v-model="editDialogVisible"
      :title="editDialogMode === 'create' ? '新建产品' : '编辑产品'"
      width="540px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="editFormRef"
        :model="editForm"
        :rules="editRules"
        label-width="100px"
      >
        <el-form-item label="编码" prop="code">
          <el-input
            v-model="editForm.code"
            placeholder="1-50 字符"
            :disabled="editDialogMode === 'edit'"
            maxlength="50"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="editForm.name" placeholder="1-200 字符" maxlength="200" show-word-limit />
        </el-form-item>
        <el-form-item label="分类" prop="category">
          <el-select v-model="editForm.category" placeholder="选择分类" style="width: 100%">
            <el-option
              v-for="opt in CATEGORY_OPTIONS"
              :key="opt.key"
              :label="opt.label"
              :value="opt.key"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="提成比例" prop="baseRatePercent">
          <el-input-number
            v-model="editForm.baseRatePercent"
            :min="0"
            :max="50"
            :precision="2"
            :step="0.5"
            placeholder="可选；留空走后端默认"
            style="width: 100%"
          />
          <span class="form-hint">单位：%；后端 baseRate=小数（如 5 → 0.05）</span>
        </el-form-item>
        <el-form-item v-if="editDialogMode === 'edit'" label="状态">
          <el-radio-group v-model="editForm.status">
            <el-radio value="active">启用</el-radio>
            <el-radio value="archived">已归档</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="editForm.description"
            type="textarea"
            :rows="3"
            maxlength="2000"
            show-word-limit
            placeholder="≤ 2000 字符"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="editSubmitting" @click="onEditSubmit">
          {{ editDialogMode === 'create' ? '创建' : (editForm.status === 'archived' ? '归档' : '保存') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.filter-card {
  margin-bottom: 16px;
}
.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
.form-hint {
  margin-left: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
