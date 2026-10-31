<template>
  <div class="page-stack">
    <StaffPageHead title="签到考勤" :sub="pageSummary">
      <template #actions>
        <n-button :loading="isLoading" text @click="loadAttendance">刷新</n-button>
        <n-button :disabled="!attendance?.selected_class_id" secondary @click="downloadAttendance('all')">
          导出签到表
        </n-button>
        <n-button :disabled="!attendance?.selected_class_id" type="primary" @click="downloadAttendance('absent')">
          导出缺席名单
        </n-button>
      </template>
    </StaffPageHead>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <div v-if="isLoading" class="sf-panel">
      <div class="sf-panel__body"><n-skeleton :rows="9" animated /></div>
    </div>

    <template v-else-if="attendance">
      <StaffStatStrip :items="statItems" />

      <section class="sf-panel">
        <div class="sf-tabs">
          <button
            v-for="tab in statusTabs"
            :key="tab.key"
            type="button"
            :class="['sf-tabs__item', { 'is-active': statusFilter === tab.key }]"
            @click="statusFilter = tab.key"
          >
            {{ tab.label }}
            <span class="sf-tabs__count">{{ tab.count }}</span>
          </button>
        </div>

        <div class="sf-toolbar">
          <n-select
            v-model:value="filters.classId"
            :options="classOptions"
            class="filter-select"
            placeholder="选择班级"
            @update:value="loadAttendance"
          />
          <n-date-picker
            v-model:formatted-value="filters.attendanceDate"
            class="filter-select filter-select--date"
            format="yyyy-MM-dd"
            type="date"
            value-format="yyyy-MM-dd"
            @update:formatted-value="loadAttendance"
          />
          <div class="sf-toolbar__right">
            <span>
              {{ attendance.selected_class?.class_name || '全部班级' }} ·
              {{ filteredRecords.length }} / {{ records.length }} 人
            </span>
          </div>
        </div>

        <p v-if="!records.length" class="sf-empty">
          {{ attendance.attendance_date }} 这天还没有该班的名单数据。
        </p>

        <p v-else-if="!filteredRecords.length" class="sf-empty">
          {{ statusFilter === 'present' ? '这个班今天还没有人签到。' : '这个班今天全部已签到。' }}
        </p>

        <div v-else class="sf-rows">
          <div class="sf-rows__head roster-cols">
            <span>学生</span>
            <span>座位</span>
            <span>签到时间</span>
            <span>来源</span>
          </div>
          <article
            v-for="row in filteredRecords"
            :key="row.user_id"
            :class="['sf-row', 'sf-row--cols', 'roster-cols', row.status === 'absent' ? 'is-absent' : '']"
          >
            <div class="sf-row__main">
              <p class="sf-row__title">
                <span class="sf-row__title-text">{{ row.display_name }}</span>
                <span :class="['sf-pill', row.status === 'present' ? 'sf-pill--pos' : 'sf-pill--warn']">
                  <span v-if="row.status === 'present'" class="sf-pill__dot" />
                  {{ row.status === 'present' ? '已签到' : '未签到' }}
                </span>
              </p>
              <p class="sf-row__meta">
                <span>{{ row.student_no }}</span>
                <span v-if="row.client_ip">IP {{ row.client_ip }}</span>
              </p>
            </div>

            <span class="seat-cell">{{ seatText(row) }}</span>
            <span class="sf-row__num time-cell" data-label="签到">
              {{ row.checked_in_at ? formatTime(row.checked_in_at) : '—' }}
            </span>
            <span class="source-cell">{{ row.signin_source || '—' }}</span>
          </article>
        </div>
      </section>

      <section class="sf-panel">
        <header class="sf-panel__head">
          <h2 class="sf-panel__title">
            各班签到
            <span class="sf-panel__count">{{ attendance.classes.length }} 个班</span>
          </h2>
          <span class="head-fact">
            {{ attendance.selected_class?.class_name || '全部班级' }} 已签到
            {{ attendance.selected_class?.present_count ?? 0 }} /
            {{ attendance.selected_class?.student_count ?? 0 }} 人 · {{ classRateValue }}%
          </span>
        </header>
        <div class="sf-panel__body class-grid">
          <button
            v-for="item in attendance.classes"
            :key="item.id"
            type="button"
            :class="['class-cell', item.id === attendance.selected_class_id ? 'is-current' : '']"
            @click="selectClass(item.id)"
          >
            <span class="class-cell__name">{{ item.class_name }}</span>
            <span class="class-cell__value">{{ item.present_count }}/{{ item.student_count }}</span>
            <span class="class-cell__bar">
              <span class="class-cell__bar-fill" :style="{ width: `${classRate(item)}%` }" />
            </span>
          </button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { NAlert, NButton, NDatePicker, NSelect, NSkeleton } from 'naive-ui';
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';

import { apiGet, apiGetBlob } from '@/api/http';
import StaffPageHead from '@/components/staff/StaffPageHead.vue';
import StaffStatStrip, { type StaffStatItem } from '@/components/staff/StaffStatStrip.vue';
import { useAuthStore } from '@/stores/auth';
import { ElMessage } from '@/ui/feedback';

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

const classOptions = computed(() =>
  (attendance.value?.classes || []).map((item) => ({
    label: `${item.class_name} · 已到 ${item.present_count}/${item.student_count}`,
    value: item.id,
  })),
);

const records = computed(() => {
  const list = attendance.value?.records || [];
  return [...list].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'absent' ? -1 : 1;
    }
    return a.student_no.localeCompare(b.student_no);
  });
});

const filteredRecords = computed(() => {
  if (statusFilter.value === 'all') {
    return records.value;
  }
  return records.value.filter((item) => item.status === statusFilter.value);
});

const presentInScope = computed(() => records.value.filter((item) => item.status === 'present').length);

const statusTabs = computed(() => [
  { key: 'all' as const, label: '全部', count: records.value.length },
  { key: 'absent' as const, label: '未签到', count: records.value.length - presentInScope.value },
  { key: 'present' as const, label: '已签到', count: presentInScope.value },
]);

const overallRate = computed(() => {
  const summary = attendance.value?.summary;
  if (!summary?.student_count) {
    return 0;
  }
  return Math.round((summary.present_count / summary.student_count) * 100);
});

const absentInScope = computed(() => attendance.value?.records.filter((item) => item.status === 'absent').length ?? 0);

const pageSummary = computed(() => {
  if (!attendance.value) {
    return '按班级和日期查看签到状态，并导出缺席名单。';
  }
  const cls = attendance.value.selected_class;
  const head = `${attendance.value.attendance_date} · ${cls?.class_name || '全部班级'}`;
  if (!cls) {
    return `${head} · 还没有班级名单`;
  }
  return `${head} · 未签到 ${absentInScope.value} 人，已签到 ${cls.present_count} 人`;
});

const statItems = computed<StaffStatItem[]>(() => {
  const summary = attendance.value?.summary;
  return [
    {
      label: '全校出勤率',
      value: overallRate.value,
      unit: '%',
      note: `${attendance.value?.attendance_date || '--'} 全部 ${summary?.class_count ?? 0} 个班`,
    },
    {
      label: '已签到',
      value: summary?.present_count ?? 0,
      unit: ` / ${summary?.student_count ?? 0}`,
      note: '当天有签到记录的学生',
    },
    {
      label: '未签到',
      value: summary?.absent_count ?? 0,
      note: '含未登录过的学生',
    },
    {
      label: '覆盖班级',
      value: summary?.class_count ?? 0,
      unit: '个',
      note: `当前查看 ${attendance.value?.selected_class?.class_name || '全部班级'}`,
    },
  ];
});

/** 本班出勤率：与「全校出勤率」是两个口径，分开标注 */
const classRateValue = computed(() => {
  const cls = attendance.value?.selected_class;
  if (!cls?.student_count) {
    return 0;
  }
  return Math.round((cls.present_count / cls.student_count) * 100);
});

function classRate(item: AttendanceClassItem) {
  if (!item.student_count) {
    return 0;
  }
  return Math.round((item.present_count / item.student_count) * 100);
}

function seatText(row: AttendanceRecordItem) {
  if (!row.seat_label && !row.room_name) {
    return '—';
  }
  return [row.seat_label, row.room_name].filter(Boolean).join(' · ');
}

function formatTime(value: string | null) {
  if (!value) {
    return '—';
  }
  return value.replace('T', ' ').slice(11, 16);
}

function selectClass(classId: number) {
  if (filters.value.classId === classId) {
    return;
  }
  filters.value.classId = classId;
  void loadAttendance();
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
.filter-select {
  width: 210px;
}

.filter-select--date {
  width: 160px;
}

.class-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 2px 12px;
}

.class-cell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 5px 10px;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--sf-r-ctl, 6px);
  background: none;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.class-cell:hover {
  background: var(--sf-surface-2);
}

.class-cell.is-current {
  background: var(--sf-accent-soft);
}

.class-cell:focus-visible {
  outline: 2px solid var(--sf-accent);
  outline-offset: -2px;
}

.class-cell__name {
  color: var(--sf-ink);
  font-size: 13px;
}

.class-cell__value {
  color: var(--sf-ink);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.class-cell__bar {
  grid-column: 1 / -1;
  height: 2px;
  border-radius: 999px;
  background: var(--sf-surface-3);
  overflow: hidden;
}

.class-cell__bar-fill {
  display: block;
  height: 100%;
  background: var(--sf-accent);
}

.roster-cols {
  grid-template-columns: minmax(0, 1fr) 140px 96px 96px;
}

.roster-cols > span:nth-child(3),
.roster-cols > span:nth-child(4) {
  text-align: right;
}

.sf-row.roster-cols {
  align-items: center;
}

.seat-cell,
.source-cell {
  color: var(--sf-muted);
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.time-cell {
  font-size: 13px;
}

.source-cell {
  text-align: right;
}

/* 未签到先读：只给一条左侧墨色标记，不给整行上色 */
.sf-row.is-absent .sf-row__title-text {
  font-weight: 600;
}

.head-fact {
  color: var(--sf-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 860px) {
  .roster-cols {
    grid-template-columns: minmax(0, 1fr);
  }

  .sf-row.roster-cols {
    flex-wrap: wrap;
    gap: 4px 12px;
  }

  .sf-row.roster-cols .sf-row__main {
    flex: 1 1 auto;
  }

  .seat-cell,
  .time-cell,
  .source-cell {
    flex: none;
    font-size: 12px;
    text-align: left;
  }

  .source-cell {
    margin-left: auto;
  }

  .filter-select,
  .filter-select--date {
    width: 100%;
  }
}
</style>
