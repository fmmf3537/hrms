<script setup lang="ts">
/**
 * 页面标题 + 面包屑 + 操作按钮
 * @props title 页面标题
 * @props breadcrumb 面包屑 { label, to? }[]
 * @slots actions 右侧操作区
 */
interface BreadcrumbItem {
  label: string;
  to?: string;
}

interface Props {
  title: string;
  breadcrumb?: BreadcrumbItem[];
}

withDefaults(defineProps<Props>(), {
  breadcrumb: () => [],
});
</script>

<template>
  <div class="page-header">
    <el-breadcrumb v-if="breadcrumb.length" separator="/" class="page-header__crumb">
      <el-breadcrumb-item
        v-for="(item, index) in breadcrumb"
        :key="`${item.label}-${index}`"
        :to="item.to"
      >
        {{ item.label }}
      </el-breadcrumb-item>
    </el-breadcrumb>
    <div class="page-header__title">
      <h1>{{ title }}</h1>
      <div class="page-header__actions">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-header {
  margin-bottom: 16px;
}

.page-header__crumb {
  margin-bottom: 8px;
}

.page-header__title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.page-header__title h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #303133;
}

.page-header__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
