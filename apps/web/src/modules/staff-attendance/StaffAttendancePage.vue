<template>
  <div class="page-stack">
    <section class="hero-panel">
      <div>
        <p class="eyebrow">签到管理</p>
        <h2>教师签到与出勤</h2>
        <p class="hero-copy">
          按班级和日期查看签到状态，支持导出全量、已签到和缺席名单。
        </p>
      </div>
      <el-space wrap>
        <el-button :loading="isLoading" type="primary" @click="loadAttendance">刷新</el-button>
        <el-button :disabled="!attendance?.selected_class_id" plain @click="downloadAttendance('all')">
          导出签到表
        </el-button>
        <el-button :disabled="!attendance?.selected_class_id" plain @click="downloadAttendance('absent')">
          导出缺席名单
        </el-button>
      </el-space>
    </section>

    <el-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <el-skeleton :loading="isLoading" animated>
      <template #template>
        <el-card class="soft-card">
          <el-skeleton :rows="9" />
        </el-card>
      </template>

      <template #default>
        <div v-if="attendance" class="page-stack">
          <div class="metric-grid">
            <article class="metric-tile">
              <p class="metric-label">班级数</p>
              <p class="metric-value">{{ attendance.summary.class_count }}</p>
              <p class="metric-note">当前账号可访问班级</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">学生总数</p>
              <p class="metric-value">{{ attendance.summary.student_count }}</p>
              <p class="metric-note">按权限范围汇总</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">已签到</p>
              <p class="metric-value">{{ attendance.summary.present_count }}</p>
              <p class="metric-note">当天签到记录</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">未签到</p>
              <p class="metric-value">{{ attendance.summary.absent_count }}</p>
              <p class="metric-note">当天缺席人数</p>
            </article>
          </div>

          <el-card class="soft-card">
            <template #header>
              <div class="toolbar-row">
                <div class="filter-row">
                  <el-select v-model="filters.classId" class="filter-select" placeholder="选择班级" @change="loadAttendance">
                    <el-option
                      v-for="item in attendance.classes"
                      :key="item.id"
                      :label="`${item.class_name} · 已到 ${item.present_count} / ${item.student_count}`"
                      :value="item.id"
                    />
                  </el-select>
                  <el-date-picker
                    v-model="filters.attendanceDate"
                    class="filter-select"
                    format="YYYY-MM-DD"
                    type="date"
                    value-format="YYYY-MM-DD"
                    @change="loadAttendance"
                  />
                  <el-select v-model="statusFilter" class="filter-select" placeholder="状态筛选">
                    <el-option label="全部" value="all" />
                    <el-option label="已签到" value="present" />
                    <el-option label="未签到" value="absent" />
                  </el-select>
                </div>
                <div class="chip-row">
                  <el-tag v-if="attendance.selected_class" round>
                    {{ attendance.selected_class.class_name }}
                  </el-tag>
                  <el-tag v-if="attendance.selected_class" round type="success">
                    已签到 {{ attendance.selected_class.present_count }}
                  </el-tag>
                  <el-tag v-if="attendance.selected_class" round type="warning">
                    未签到 {{ attendance.selected_class.absent_count }}
                  </el-tag>
                </div>
              </div>
            </template>

            <el-empty v-if="!attendance.records.length" description="当前日期没有签到数据" />

            <el-table v-else :data="filteredRecords" stripe>
              <el-table-column label="学号" min-width="110" prop="student_no" />
              <el-table-column label="姓名" min-width="120" prop="display_name" />
              <el-table-column label="账号" min-width="120" prop="username" />
              <el-table-column label="状态" min-width="110">
                <template #default="{ row }">
                  <el-tag :type="row.status === 'present' ? 'success' : 'warning'" round>
                    {{ row.status === 'present' ? '已签到' : '未签到' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="签到时间" min-width="170">
                <template #default="{ row }">{{ formatDateTime(row.checked_in_at) }}</template>
              </el-table-column>
              <el-table-column label="签到来源" min-width="120">
                <template #default="{ row }">{{ row.signin_source || '--' }}</template>
              </el-table-column>
              <el-table-column label="座位" min-width="100">
                <template #default="{ row }">{{ row.seat_label || '--' }}</template>
              </el-table-column>
              <el-table-column label="机房" min-width="130">
                <template #default="{ row }">{{ row.room_name || '--' }}</template>
              </el-table-column>
              <el-table-column label="登录 IP" min-width="140">
                <template #default="{ row }">{{ row.client_ip || '--' }}</template>
              </el-table-column>
            </el-table>
          </el-card>
        </div>
      </template>
    </el-skeleton>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useRoute } from 'vue-router';

import { apiGet, apiGetBlob } from '@/api/http';
import { useAuthStore } from '@/stores/auth';

type AttendanceClassItem = {
  id: number;
  class_name: string;
  grade_no: number;
  class_no: number;
  student_count: number;
  present_count: number;
  absent_count: number;
};

type AttendanceRecordItem = {
  user_id: number;
  student_no: string;
  username: string;
  display_name: string;
  status: 'present' | 'absent';
  checked_in_at: string | null;
  signin_source: string | null;
  seat_label: string | null;
  room_name: string | null;
  client_ip: string | null;
};

type AttendancePayload = {
  attendance_date: string;
  classes: AttendanceClassItem[];
  selected_class_id: number | null;
  selected_class: {
    id: number;
    class_name: string;
    grade_no: number;
    class_no: number;
    student_count: number;
    present_count: number;
    absent_count: number;
  } | null;
  summary: {
    class_count: number;
    student_count: number;
    present_count: number;
    absent_count: number;
  };
  records: AttendanceRecordItem[];
};

const authStore = useAuthStore();
const route = useRoute();
const attendance = ref<AttendancePayload | null>(null);
const isLoading = ref(true);
const errorMessage = ref('');
const statusFilter = ref<'all' | 'present' | 'absent'>('all');
const filters = ref({
  classId: undefined as number | undefined,
  attendanceDate: '',
});

const filteredRecords = computed(() => {
  const records = attendance.value?.records || [];
  if (statusFilter.value === 'all') {
    return records;
  }
  return records.filter((item) => item.status === statusFilter.value);
});

function formatDateTime(value: string | null) {
  if (!value) {
    return '--';
  }
  return value.replace('T', ' ').slice(0, 16);
}

function extractFilename(disposition: string | null, fallback: string) {
  if (!disposition) {
    return fallback;
  }
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }
  const basicMatch = disposition.match(/filename="([^"]+)"/i);
  if (basicMatch?.[1]) {
    return basicMatch[1];
  }
  return fallback;
}

function applyRouteFilters() {
  const classId = Number(route.query.class_id);
  if (Number.isFinite(classId) && classId > 0) {
    filters.value.classId = classId;
  }
  const attendanceDate = String(route.query.attendance_date || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)) {
    filters.value.attendanceDate = attendanceDate;
  }
}

async function loadAttendance() {
  if (!authStore.token) {
    errorMessage.value = '请先登录教职工账号';
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';
  try {
    const query = new URLSearchParams();
    if (filters.value.classId) {
      query.set('class_id', String(filters.value.classId));
    }
    if (filters.value.attendanceDate) {
      query.set('attendance_date', filters.value.attendanceDate);
    }
    const suffix = query.toString();
    const payload = await apiGet<AttendancePayload>(
      `/staff/attendance${suffix ? `?${suffix}` : ''}`,
      authStore.token
    );
    attendance.value = payload;
    filters.value.classId = payload.selected_class_id || undefined;
    if (!filters.value.attendanceDate) {
      filters.value.attendanceDate = payload.attendance_date;
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载签到数据失败';
  } finally {
    isLoading.value = false;
  }
}

async function downloadAttendance(mode: 'all' | 'present' | 'absent') {
  if (!authStore.token) {
    return;
  }
  const query = new URLSearchParams();
  if (filters.value.classId) {
    query.set('class_id', String(filters.value.classId));
  }
  if (filters.value.attendanceDate) {
    query.set('attendance_date', filters.value.attendanceDate);
  }
  query.set('mode', mode);

  try {
    const response = await apiGetBlob(`/staff/attendance/export?${query.toString()}`, authStore.token);
    const blob = await response.blob();
    const fallback = `attendance-${filters.value.attendanceDate || 'today'}.csv`;
    const filename = extractFilename(response.headers.get('content-disposition'), fallback);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '导出签到失败');
  }
}

onMounted(() => {
  applyRouteFilters();
  void loadAttendance();
});
</script>

<style scoped>
.toolbar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-select {
  width: 220px;
}
</style>
