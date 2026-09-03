<script setup lang="ts">
/**
 * 打卡列表（M5-2-B）
 * employee 打卡；hr/admin 补卡/导入；日历视图
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import PageHeader from '@/components/PageHeader.vue';
import SearchForm from '@/components/SearchForm.vue';
import EmptyState from '@/components/EmptyState.vue';
import StatusTag from '@/components/StatusTag.vue';
import Calendar from '@/components/Calendar.vue';
import { clockIn, listRecords } from '@/api/attendance';
import type { AttendanceRecord, AttendanceStatus, CalendarData } from '@/api/types/attendance';
import { attendanceStatusLabel, attendanceTagType } from '@/api/types/attendance';
import { useUserStore } from '@/stores/user';
import { hasPermission } from '@/utils/permission';
import { formatDate } from '@/utils/format';

const router = useRouter();
const userStore = useUserStore();
const canClock = computed(() => hasPermission(userStore.userInfo, 'attendance:clock'));
const canManual = computed(() => hasPermission(userStore.userInfo, 'attendance:manual'));
const canImport = computed(() => hasPermission(userStore.userInfo, 'attendance:write'));
const canReadList = computed(
  () =>
    hasPermission(userStore.userInfo, 'attendance:read') ||
    hasPermission(userStore.userInfo, 'attendance:read:self-dept'),
);

const loading = ref(false);
const list = ref<AttendanceRecord[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const statusFilter = ref<AttendanceStatus | ''>('');
const dateFrom = ref('');
const viewMode = ref<'table' | 'calendar'>('table');
const clocking = ref(false);

const calendarData = computed<CalendarData>(() => {
  const map: CalendarData = {};
  list.value.forEach((row) => {
    const day = row.clockInTime ? String(row.clockInTime).slice(0, 10) : '';
    if (!day) {
      return;
    }
    let status: CalendarData[string]['status'] = 'normal';
    if (row.isMissing) {
      status = 'absent';
    } else if (row.isLate) {
      status = 'late';
    } else if (row.isEarlyLeave) {
      status = 'early';
    }
    map[day] = { status, summary: row.clockType };
  });
  return map;
});

async function load(): Promise<void> {
  if (!canReadList.value) {
    list.value = [];
    total.value = 0;
    return;
  }
  loading.value = true;
  try {
    const res = await listRecords({
      status: statusFilter.value || undefined,
      dateFrom: dateFrom.value || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
    list.value = res.items;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

function onReset(): void {
  statusFilter.value = '';
  dateFrom.value = '';
  page.value = 1;
  load();
}

async function onClock(): Promise<void> {
  const employeeId = userStore.userInfo?.employee?.id;
  if (!employeeId) {
    ElMessage.warning('当前账号未绑定员工档案，无法打卡');
    return;
  }
  // M5-09: web 端打卡改 GPS（浏览器无 WiFi SSID 取值能力，原 wifi 路径必败）
  // 用 Geolocation API 取办公坐标，提交 clockType='gps' + 经纬度
  // server attendance.service.ts gps 分支用 configs.attendance.gps_max_distance + 内置 DEFAULT_OFFICE_LAT/LNG
  let coords: { lat: number; lng: number; accuracy?: number };
  try {
    coords = await new Promise<{ lat: number; lng: number; accuracy?: number }>((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        reject(new Error('浏览器不支持定位'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
      );
    });
  } catch (err) {
    ElMessage.warning('请允许浏览器定位后打卡');
    return;
  }
  clocking.value = true;
  try {
    await clockIn({
      employeeId,
      clockType: 'gps',
      clockInTime: new Date().toISOString(),
      gpsLat: coords.lat,
      gpsLng: coords.lng,
      gpsAccuracy: coords.accuracy,
    });
    ElMessage.success('打卡成功');
    await load();
  } finally {
    clocking.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <PageHeader title="打卡管理" :breadcrumb="[{ label: '考勤假勤' }, { label: '打卡管理' }]">
      <template #actions>
        <el-button v-if="canClock" type="primary" :loading="clocking" @click="onClock">自己打卡</el-button>
        <el-button v-if="canManual" @click="router.push('/attendance/attendance/correction')">
          手动补卡
        </el-button>
        <el-button v-if="canImport" @click="router.push('/attendance/attendance/correction?tab=import')">
          导入
        </el-button>
      </template>
    </PageHeader>
    <SearchForm @search="load" @reset="onReset">
      <el-form-item label="状态">
        <el-select v-model="statusFilter" clearable placeholder="全部" style="width: 120px">
          <el-option label="已通过" value="approved" />
          <el-option label="待处理" value="pending" />
          <el-option label="已驳回" value="rejected" />
        </el-select>
      </el-form-item>
      <el-form-item label="日期从">
        <el-date-picker v-model="dateFrom" type="date" value-format="YYYY-MM-DD" />
      </el-form-item>
      <el-form-item>
        <el-radio-group v-model="viewMode">
          <el-radio-button label="table">列表</el-radio-button>
          <el-radio-button label="calendar">日历</el-radio-button>
        </el-radio-group>
      </el-form-item>
    </SearchForm>
    <Calendar v-if="viewMode === 'calendar'" mode="attendance" :data="calendarData" />
    <template v-else>
      <el-table v-loading="loading" :data="list" stripe>
        <el-table-column label="员工" min-width="110">
          <template #default="{ row }">{{ row.employee?.name || '—' }}</template>
        </el-table-column>
        <el-table-column label="上班" width="170">
          <template #default="{ row }">{{ formatDate(row.clockInTime) }}</template>
        </el-table-column>
        <el-table-column label="下班" width="170">
          <template #default="{ row }">{{ formatDate(row.clockOutTime) }}</template>
        </el-table-column>
        <el-table-column prop="clockType" label="方式" width="100" />
        <el-table-column label="异常" width="120">
          <template #default="{ row }">
            <span v-if="row.isLate">迟到{{ row.lateMinutes }}分</span>
            <span v-else-if="row.isEarlyLeave">早退</span>
            <span v-else-if="row.isMissing">缺卡</span>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="130">
          <template #default="{ row }">
            <StatusTag :status="row.status" :type="attendanceTagType(row.status)" />
            <span class="hint">{{ attendanceStatusLabel(row.status) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              @click="router.push(`/attendance/attendance/records/${row.id}`)"
            >
              详情
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <EmptyState v-if="!loading && list.length === 0" />
      <div class="pager">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          background
          @current-change="load"
          @size-change="load"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
.hint {
  margin-left: 6px;
  color: #909399;
  font-size: 12px;
}
</style>
