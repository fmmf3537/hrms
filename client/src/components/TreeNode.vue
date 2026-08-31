<script setup lang="ts">
/**
 * 树形节点 DOM 抽象（M5-2-A1）
 * @props node { id, label, children? }
 */
import type { TreeNodeData } from '@/api/types/organization';

defineOptions({ name: 'TreeNode' });

interface Props {
  node: TreeNodeData;
}

defineProps<Props>();
</script>

<template>
  <div class="tree-node">
    <div class="tree-node__content">
      <span class="tree-node__label">{{ node.label }}</span>
      <slot />
    </div>
    <div v-if="node.children?.length" class="tree-node__children">
      <TreeNode v-for="child in node.children" :key="child.id" :node="child" />
    </div>
  </div>
</template>

<style scoped>
.tree-node__content {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

.tree-node__label {
  font-size: 14px;
  color: #303133;
}

.tree-node__children {
  padding-left: 20px;
  border-left: 1px dashed #dcdfe6;
  margin-left: 8px;
}
</style>
