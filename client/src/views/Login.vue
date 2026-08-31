<script setup lang="ts">
/**
 * 登录页（M5-2-0 重写）
 * 集成 user store + 路由守卫 redirect；改密 / 2FA 仅预留提示（不实现页面）
 */
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { Lock, User } from '@element-plus/icons-vue';
import axios from 'axios';
import { useUserStore } from '@/stores/user';
import type { ApiResponse, LoginRequest } from '@/api/types';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

const formRef = ref<FormInstance>();
const loading = ref(false);
const mustChangePassword = ref(false);
const form = reactive<LoginRequest>({
  username: '',
  password: '',
});

const rules: FormRules<LoginRequest> = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码长度至少 6 位', trigger: 'blur' },
  ],
};

function isMustChangePasswordError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) {
    return false;
  }
  const body = error.response?.data as ApiResponse | undefined;
  return body?.code === 10112;
}

async function onSubmit(): Promise<void> {
  if (!formRef.value) {
    return;
  }
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) {
    return;
  }
  loading.value = true;
  mustChangePassword.value = false;
  try {
    await userStore.login({ ...form });
    ElMessage.success('登录成功');
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard';
    await router.push(redirect);
  } catch (error) {
    if (isMustChangePasswordError(error)) {
      mustChangePassword.value = true;
      return;
    }
    /* http 拦截器已 toast，此处不再重复 */
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login">
    <div class="login__box">
      <div class="login__header">
        <h1 class="login__title">西安辰航卓越 HRMS</h1>
        <p class="login__subtitle">员工管理系统 · Human Resource Management System</p>
      </div>
      <el-card class="login__card" shadow="always">
        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          size="large"
          @keyup.enter="onSubmit"
        >
          <el-form-item prop="username">
            <el-input
              v-model="form.username"
              placeholder="请输入用户名"
              :prefix-icon="User"
              clearable
            />
          </el-form-item>
          <el-form-item prop="password">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="请输入密码"
              :prefix-icon="Lock"
              show-password
              clearable
            />
          </el-form-item>
          <el-form-item v-if="mustChangePassword">
            <el-alert type="warning" :closable="false" title="首次登录必须改密（改密页留后续切片）" />
          </el-form-item>
          <el-form-item>
            <el-button
              type="primary"
              class="login__button"
              :loading="loading"
              @click="onSubmit"
            >
              登录
            </el-button>
          </el-form-item>
        </el-form>
      </el-card>
    </div>
    <div class="login__footer">
      <p>© 2026 西安辰航卓越科技有限公司</p>
    </div>
  </div>
</template>

<style scoped>
.login {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: linear-gradient(135deg, #1f2d3d 0%, #304156 50%, #409eff 130%);
  position: relative;
}

.login__box {
  width: 420px;
  z-index: 1;
}

.login__header {
  text-align: center;
  margin-bottom: 30px;
}

.login__title {
  font-size: 32px;
  font-weight: 600;
  color: #ffffff;
  margin: 0 0 10px;
}

.login__subtitle {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
  margin: 0;
}

.login__card {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.97);
  border: none;
}

.login__card :deep(.el-card__body) {
  padding: 40px;
}

.login__button {
  width: 100%;
  height: 44px;
  font-size: 16px;
  border-radius: 8px;
}

.login__footer {
  position: absolute;
  bottom: 20px;
  left: 0;
  right: 0;
  text-align: center;
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
}

.login__footer p {
  margin: 0;
}
</style>
