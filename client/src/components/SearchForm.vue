<script setup lang="ts">
/**
 * 搜索表单
 * @emits search / reset
 * @slots default 查询字段（el-form-item）
 */
const emit = defineEmits<{
  (e: 'search'): void;
  (e: 'reset'): void;
}>();
</script>

<template>
  <el-form inline class="search-form" @submit.prevent="emit('search')">
    <slot />
    <el-form-item>
      <el-button type="primary" native-type="submit">查询</el-button>
      <el-button native-type="button" @click="emit('reset')">重置</el-button>
    </el-form-item>
  </el-form>
</template>

<style scoped>
.search-form {
  margin-bottom: 12px;
}
</style>
