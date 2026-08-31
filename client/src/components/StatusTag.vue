<script lang="ts">
import { computed } from 'vue';

/**
 * 状态标签（M5-2-A1）
 * @module components/StatusTag
 */
export type StatusTagType = 'success' | 'warning' | 'info' | 'danger';

export interface StatusTagInfo {
  label: string;
  type: StatusTagType;
}

export const STATUS_TAG_MAP: Record<string, StatusTagInfo> = {
  active: { label: '正常', type: 'success' },
  suspended: { label: '暂停', type: 'warning' },
  merged: { label: '已合并', type: 'info' },
  probation: { label: '试用期', type: 'warning' },
  resigned: { label: '已离职', type: 'danger' },
};

export function resolveStatusTag(status: string): StatusTagInfo {
  return STATUS_TAG_MAP[status] ?? { label: status, type: 'info' };
}
</script>

<script setup lang="ts">
interface Props {
  status: string;
  type?: StatusTagType;
}

const props = defineProps<Props>();

const statusInfo = computed(() => resolveStatusTag(props.status));
const tagType = computed(() => props.type ?? statusInfo.value.type);
</script>

<template>
  <el-tag :type="tagType">{{ statusInfo.label }}</el-tag>
</template>
