<template>
  <div class="dashboard">
    <!-- 欢迎卡片 -->
    <el-card class="welcome-card" shadow="hover">
      <div class="welcome-content">
        <h2 class="welcome-title">欢迎，{{ authStore.userName }}！</h2>
        <p class="welcome-subtitle">
          当前角色：{{ rolesText }}
          <span v-if="authStore.userInfo?.employee" class="employee-no">
            ｜ 工号：{{ authStore.userInfo.employee.employeeNo }}
          </span>
        </p>
      </div>
    </el-card>

    <!-- 统计卡片占位 -->
    <el-row :gutter="20" class="stat-row">
      <el-col v-for="card in statCards" :key="card.title" :xs="12" :sm="12" :md="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-title">{{ card.title }}</div>
          <div class="stat-value">{{ card.value }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-alert
      class="tip"
      type="info"
      :closable="false"
      title="M1 模块（组织人事 / 考勤 / 薪酬 / 绩效）上线后，这里将展示真实业务数据。"
      show-icon
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();

const rolesText = computed(() => authStore.userInfo?.roles.join(' / ') || '-');

// TODO: M1 模块上线后接入真实统计数据
const statCards = [
  { title: '员工总数', value: 0 },
  { title: '部门数', value: 0 },
  { title: '在职', value: 0 },
  { title: '待办审批', value: 0 },
];
</script>

<style scoped>
.dashboard {
  max-width: 1200px;
}

.welcome-card {
  margin-bottom: 20px;
}

.welcome-content .welcome-title {
  margin: 0 0 8px;
  font-size: 22px;
  color: #303133;
}

.welcome-content .welcome-subtitle {
  margin: 0;
  font-size: 14px;
  color: #909399;
}

.welcome-content .employee-no {
  color: #606266;
}

.stat-row {
  margin-bottom: 20px;
}

.stat-card {
  text-align: center;
  margin-bottom: 20px;
}

.stat-card .stat-title {
  font-size: 14px;
  color: #909399;
  margin-bottom: 8px;
}

.stat-card .stat-value {
  font-size: 32px;
  font-weight: 600;
  color: #303133;
}

.tip {
  margin-top: 4px;
}
</style>
