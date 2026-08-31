<script setup lang="ts">
/**
 * 公司组织树（部门树）（M5-2-A1）
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ElTree } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import TreeNode from '@/components/TreeNode.vue';
import { getCompany } from '@/api/company';
import { getDepartmentTree } from '@/api/department';
import type { Company, Department, TreeNodeData } from '@/api/types/organization';

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const company = ref<Company | null>(null);
const tree = ref<Department[]>([]);
const treeRef = ref<InstanceType<typeof ElTree>>();

function toNode(dept: Department): TreeNodeData {
  return {
    id: dept.id,
    label: `${dept.name}（${dept.code}）`,
    children: (dept.children ?? []).map(toNode),
  };
}

const abstractTree = computed(() => tree.value.map(toNode));

async function load(): Promise<void> {
  const id = String(route.params.id);
  loading.value = true;
  try {
    company.value = await getCompany(id);
    tree.value = await getDepartmentTree(id);
  } finally {
    loading.value = false;
  }
}

function onNodeClick(data: Department): void {
  router.push(`/org/departments/${data.id}`);
}

onMounted(load);
</script>

<template>
  <div v-loading="loading">
    <PageHeader
      :title="`${company?.name || ''} 组织树`"
      :breadcrumb="[
        { label: '组织人事', to: '/org/companies' },
        { label: '法人公司', to: '/org/companies' },
        { label: '组织树' },
      ]"
    >
      <template #actions>
        <el-button @click="router.push('/org/companies')">返回列表</el-button>
      </template>
    </PageHeader>
    <el-row :gutter="16">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>部门树</template>
          <el-tree
            ref="treeRef"
            :data="tree"
            node-key="id"
            :props="{ label: 'name', children: 'children' }"
            default-expand-all
            highlight-current
            @node-click="onNodeClick"
          />
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>结构预览</template>
          <TreeNode v-for="node in abstractTree" :key="node.id" :node="node" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>
