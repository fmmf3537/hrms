<script setup lang="ts">
/**
 * 日历通用组件（M5-2-B）
 * ElCalendar 封装：打卡 / 月报 / 排班 3 模式
 */
import { ref, watch } from 'vue';
import type { CalendarData, CalendarMode } from '@/api/types/attendance';

interface Props {
  mode: CalendarMode;
  data: CalendarData;
  defaultDate?: string;
}

const props = withDefaults(defineProps<Props>(), {
  defaultDate: '',
});

const emit = defineEmits<{
  (e: 'dateClick', date: string): void;
}>();

const current = ref<Date>(props.defaultDate ? new Date(props.defaultDate) : new Date());

watch(
  () => props.defaultDate,
  (value) => {
    if (value) {
      current.value = new Date(value);
    }
  },
);

function onClick(day: string): void {
  emit('dateClick', day);
}
</script>

<template>
  <el-calendar v-model="current">
    <template #date-cell="{ data: cell }">
      <div
        role="button"
        tabindex="0"
        :class="[
          'calendar-cell',
          props.data[cell.day]?.status ? `is-${props.data[cell.day]?.status}` : '',
          `mode-${props.mode}`,
        ]"
        @click="onClick(cell.day)"
        @keydown.enter.prevent="onClick(cell.day)"
        @keydown.space.prevent="onClick(cell.day)"
      >
        <div class="calendar-cell__day">{{ cell.day.split('-').slice(2).join('') }}</div>
        <div v-if="props.data[cell.day]?.summary" class="calendar-cell__summary">
          {{ props.data[cell.day]?.summary }}
        </div>
      </div>
    </template>
  </el-calendar>
</template>

<style scoped>
.calendar-cell {
  min-height: 48px;
  cursor: pointer;
  padding: 2px;
}
.calendar-cell__day {
  font-size: 13px;
}
.calendar-cell__summary {
  font-size: 11px;
  color: #909399;
}
.is-late,
.is-early,
.is-absent {
  background: #fef0f0;
}
.is-leave,
.is-overtime,
.is-business_trip {
  background: #f4f4f5;
}
.is-scheduled,
.is-normal {
  background: #f0f9eb;
}
</style>
