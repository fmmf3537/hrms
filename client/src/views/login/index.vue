<template>
  <div class="login-container">
    <div class="login-box">
      <div class="login-header">
        <h1 class="title">西安辰航卓越 HRMS</h1>
        <p class="subtitle">员工管理系统 · Human Resource Management System</p>
      </div>

      <el-card class="login-card" shadow="always">
        <el-form
          ref="formRef"
          :model="loginForm"
          :rules="loginRules"
          size="large"
          @keyup.enter="handleLogin"
        >
          <el-form-item prop="username">
            <el-input
              v-model="loginForm.username"
              placeholder="请输入用户名"
              :prefix-icon="User"
              clearable
            />
          </el-form-item>

          <el-form-item prop="password">
            <el-input
              v-model="loginForm.password"
              type="password"
              placeholder="请输入密码"
              :prefix-icon="Lock"
              show-password
              clearable
            />
          </el-form-item>

          <el-form-item>
            <el-button
              type="primary"
              :loading="loading"
              class="login-button"
              @click="handleLogin"
            >
              登 录
            </el-button>
          </el-form-item>
        </el-form>

        <!-- 默认账号提示（仅开发环境显示） -->
        <div v-if="isDev" class="default-account-tip">
          默认账号：admin / Admin@123
        </div>
      </el-card>
    </div>

    <div class="login-footer">
      <p>© 2026 西安辰航卓越科技有限公司 - All Rights Reserved</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { User, Lock } from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';
import type { LoginParams } from '@/types';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

// 是否开发环境（用于显示默认账号提示）
const isDev = import.meta.env.DEV;

// 表单引用
const formRef = ref<FormInstance>();

// 加载状态
const loading = ref(false);

// 登录表单
const loginForm = reactive<LoginParams>({
  username: '',
  password: '',
});

// 表单验证规则
const loginRules: FormRules<LoginParams> = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码长度至少6位', trigger: 'blur' },
  ],
};

// 处理登录
async function handleLogin() {
  if (!formRef.value) return;

  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  loading.value = true;
  try {
    const result = await authStore.login(loginForm);

    if (result.success) {
      ElMessage.success('登录成功');
      // 跳转到登录前想访问的页面，默认首页
      const redirect = (route.query.redirect as string) || '/';
      await router.push(redirect);
    } else {
      ElMessage.error(result.message || '登录失败');
    }
  } catch (error: any) {
    ElMessage.error(error.message || '登录失败');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: linear-gradient(135deg, #1f2d3d 0%, #304156 50%, #409eff 130%);
  position: relative;
  overflow: hidden;
}

.login-box {
  width: 420px;
  z-index: 1;
}

.login-header {
  text-align: center;
  margin-bottom: 30px;
}

.login-header .title {
  font-size: 32px;
  font-weight: 600;
  color: #ffffff;
  margin: 0 0 10px;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.login-header .subtitle {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
  margin: 0;
}

.login-card {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.97);
  border: none;
}

.login-card :deep(.el-card__body) {
  padding: 40px;
}

.login-button {
  width: 100%;
  height: 44px;
  font-size: 16px;
  border-radius: 8px;
  margin-top: 10px;
}

.default-account-tip {
  margin-top: 8px;
  text-align: center;
  font-size: 12px;
  color: #909399;
}

.login-footer {
  position: absolute;
  bottom: 20px;
  left: 0;
  right: 0;
  text-align: center;
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
}

.login-footer p {
  margin: 0;
}

:deep(.el-input__wrapper) {
  border-radius: 8px;
  padding: 4px 11px;
}
</style>
