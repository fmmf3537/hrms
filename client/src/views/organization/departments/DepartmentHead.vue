<script setup lang="ts">
/**
 * 部门负责人选择（M5-2-A1）
 */
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { listEmployees } from '@/api/employee';
import { updateDepartment } from '@/api/department';
import type { Department, Employee } from '@/api/types/organization';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';

interface Props {
  department: Department;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'saved'): void;
}>();

const userStore = useUserStore();
const canWrite = computed(() => hasPermission(userStore.userInfo, 'department:write'));
const options = ref<Employee[]>([]);
const leaderId = ref<string | null>(props.department.leaderId);
const saving = ref(false);

watch(
  () => props.department.id,
  async (id) => {
    leaderId.value = props.department.leaderId;
    const page = await listEmployees({ departmentId: id, pageSize: 100 });
    options.value = page.items;
  },
  { immediate: true },
);

const currentLeader = computed(() => options.value.find((e) => e.id === leaderId.value));

async function save(): Promise<void> {
  saving.value = true;
  try {
    await updateDepartment(props.department.id, { leaderId: leaderId.value });
    ElMessage.success('负责人已更新');
    emit('saved');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <el-card class="head-card" shadow="never">
    <template #header>部门负责人</template>
    <el-form label-width="88px">
      <el-form-item label="负责人">
        <el-select
          v-model="leaderId"
          filterable
          clearable
          :disabled="!canWrite"
          placeholder="选择本部门员工"
          style="width: 100%"
        >
          <el-option
            v-for="emp in options"
            :key="emp.id"
            :label="`${emp.name}（${emp.employeeNo}）`"
            :value="emp.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item v-if="currentLeader" label="工号">
        {{ currentLeader.employeeNo }}
      </el-form-item>
      <el-form-item v-if="canWrite">
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<style scoped>
.head-card {
  margin-top: 16px;
}
</style>
