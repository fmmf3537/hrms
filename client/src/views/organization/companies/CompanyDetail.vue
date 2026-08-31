<script setup lang="ts">
/**
 * 公司详情（M5-2-A1）
 */
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '@/components/PageHeader.vue';
import StatusTag from '@/components/StatusTag.vue';
import { getCompany, getCompanyStatistics } from '@/api/company';
import type { Company, CompanyStatistics } from '@/api/types/organization';
import { formatDate } from '@/utils/format';

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const company = ref<Company | null>(null);
const stats = ref<CompanyStatistics | null>(null);

async function load(): Promise<void> {
  const id = String(route.params.id);
  loading.value = true;
  try {
    company.value = await getCompany(id);
    stats.value = await getCompanyStatistics(id);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div v-loading="loading">
    <PageHeader
      :title="company?.name || '公司详情'"
      :breadcrumb="[
        { label: '组织人事', to: '/org/companies' },
        { label: '法人公司', to: '/org/companies' },
        { label: '详情' },
      ]"
    >
      <template #actions>
        <el-button @click="router.push('/org/companies')">返回</el-button>
        <el-button
          v-if="company"
          type="primary"
          @click="router.push(`/org/companies/${company.id}/tree`)"
        >
          组织树
        </el-button>
      </template>
    </PageHeader>
    <el-row v-if="company" :gutter="16">
      <el-col :span="14">
        <el-card shadow="never">
          <template #header>基础信息</template>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="编码">{{ company.code }}</el-descriptions-item>
            <el-descriptions-item label="状态">
              <StatusTag :status="company.status" />
            </el-descriptions-item>
            <el-descriptions-item label="简称">{{ company.shortName || '—' }}</el-descriptions-item>
            <el-descriptions-item label="城市">{{ company.city || '—' }}</el-descriptions-item>
            <el-descriptions-item label="法人代表">{{ company.legalRep || '—' }}</el-descriptions-item>
            <el-descriptions-item label="税号">{{ company.taxNo || '—' }}</el-descriptions-item>
            <el-descriptions-item label="联系方式" :span="2">
              {{ company.contact || '—' }}
            </el-descriptions-item>
            <el-descriptions-item label="地址" :span="2">
              {{ company.address || '—' }}
            </el-descriptions-item>
            <el-descriptions-item label="创建时间">
              {{ formatDate(company.createdAt) }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
      <el-col :span="10">
        <el-card v-if="stats" shadow="never">
          <template #header>编制汇总</template>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="部门数">{{ stats.departmentCount }}</el-descriptions-item>
            <el-descriptions-item label="在职人数">{{ stats.employeeCount }}</el-descriptions-item>
            <el-descriptions-item label="编制合计">{{ stats.headcountTotal }}</el-descriptions-item>
            <el-descriptions-item label="预警">
              <StatusTag :status="stats.warningLevel === 'ok' ? 'active' : 'suspended'" />
              {{ stats.warningLevel }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>
