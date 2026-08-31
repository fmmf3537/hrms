<script setup lang="ts">
/**
 * 空状态
 * @props description 描述文案
 * @slots default 操作按钮
 */
interface Props {
  description?: string;
}

withDefaults(defineProps<Props>(), {
  description: '暂无数据',
});
</script>

<template>
  <el-empty :description="description">
    <slot />
  </el-empty>
</template>
