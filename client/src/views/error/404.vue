<template>
  <div class="error-page">
    <div class="error-code">404</div>
    <p class="error-message">抱歉，您访问的页面不存在</p>
    <el-button type="primary" @click="goHome">返回首页</el-button>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

function goHome() {
  router.push('/');
}
</script>

<style scoped>
.error-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background-color: #f0f2f5;
}

.error-code {
  font-size: 96px;
  font-weight: 700;
  color: #409eff;
  line-height: 1;
}

.error-message {
  font-size: 16px;
  color: #606266;
  margin: 20px 0 30px;
}
</style>
