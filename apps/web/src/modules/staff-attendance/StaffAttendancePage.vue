<template>
  <div class="page-stack">
    <SaPageHeader
      compact
      description="按班级和日期查看签到状态，可导出全量、已签到与缺席名单。"
      eyebrow="签到管理"
      title="教师签到与出勤"
    >
      <template #actions>
        <n-button :loading="isLoading" type="primary" @click="loadAttendance">刷新</n-button>
        <n-button :disabled="!attendance?.selected_class_id" secondary @click="downloadAttendance('all')">
          导出签到表
        </n-button>
        <n-button :disabled="!attendance?.selected_class_id" secondary @click="downloadAttendance('absent')">
          导出缺席名单
        </n-button>
      </template>
    </SaPageHeader>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <SaPanel v-if="isLoading">
      <n-skeleton :rows="9" animated />
    </SaPanel>

    <div v-else-if="attendance" class="page-stack">
      <div class="attendance-head">
        <div class="ls-row">
          <article class="metric-tile">
            <p class="metric-label">出勤率</p>
            <p class="metric-value">{{ overallRate }}%</p>
            <p class="metric-note">按当天全班签到人数计算</p>
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
          <article class="metric-tile">
            <p class="metric-label">学生总数</p>
            <p class="metric-value">{{ attendance.summary.student_count }}</p>
            <p class="metric-note">{{ attendance.summary.class_count }} 个班级汇总</p>
          </article>
        </div>
        <div class="filter-row attendance-filters">
          <n-select
            v-model:value="filters.classId"
            :options="classOptions"
            class="filter-select"
            placeholder="选择班级"
            @update:value="loadAttendance"
          />
          <n-date-picker
            v-model:formatted-value="filters.attendanceDate"
            class="filter-select"
            format="yyyy-MM-dd"
            type="date"
            value-format="yyyy-MM-dd"
            @update:formatted-value="loadAttendance"
          />
          <n-select
            v-model:value="statusFilter"
            :options="statusOptions"
            class="filter-select filter-select--status"
            placeholder="状态筛选"
          />
        </div>
      </div>

      <div class="attendance-body-grid">
        <SaPanel class="attendance-table-panel">
          <template #header>
            <div class="toolbar-row">
              <div class="info-row">
                <span>当班签到明细</span>
                <n-tag v-if="attendance.selected_class" round>
                  {{ attendance.selected_class.class_name }}
                </n-tag>
                <n-tag v-if="attendance.selected_class" round type="success">
                  已签到 {{ attendance.selected_class.present_count }}
                </n-tag>
                <n-tag v-if="attendance.selected_class" round type="warning">
                  未签到 {{ attendance.selected_class.absent_count }}
                </n-tag>
              </div>
              <span class="section-note">当前显示 {{ filteredRecords.length }} 条</span>
            </div>
          </template>

          <SaDataTable
            :data="filteredRecords"
            empty-text="当前日期没有签到数据"
            row-key="user_id"
            stripe
          >
            <SaTableColumn label="学号" min-width="110" prop="student_no" />
            <SaTableColumn label="姓名" min-width="120" prop="display_name" />
            <SaTableColumn label="账号" min-width="120" prop="username" />
            <SaTableColumn label="状态" min-width="110">
              <template #default="{ row }">
                <n-tag :type="row.status === 'present' ? 'success' : 'warning'" round>
                  {{ row.status === 'present' ? '已签到' : '未签到' }}
                </n-tag>
              </template>
            </SaTableColumn>
            <SaTableColumn label="签到时间" min-width="170">
              <template #default="{ row }">{{ formatDateTime(row.checked_in_at) }}</template>
            </SaTableColumn>
            <SaTableColumn label="签到来源" min-width="120">
              <template #default="{ row }">{{ row.signin_source || '--' }}</template>
            </SaTableColumn>
            <SaTableColumn label="座位" min-width="100">
              <template #default="{ row }">{{ row.seat_label || '--' }}</template>
            </SaTableColumn>
            <SaTableColumn label="机房" min-width="130">
              <template #default="{ row }">{{ row.room_name || '--' }}</template>
            </SaTableColumn>
            <SaTableColumn label="登录 IP" min-width="140">
              <template #default="{ row }">{{ row.client_ip || '--' }}</template>
            </SaTableColumn>
          </SaDataTable>
        </SaPanel>

        <div class="attendance-rail">
          <SaPanel title="出勤率">
            <template #actions>
              <n-tag round :type="overallRate >= 90 ? 'success' : overallRate >= 60 ? 'warning' : 'error'">
                {{ overallRate }}%
              </n-tag>
            </template>
            <n-empty v-if="!attendance.summary.student_count" description="当天还没有可统计的签到数据。" />
            <AppChart v-else :height="190" :option="attendanceDonutOption" />
          </SaPanel>

          <SaPanel title="各班出勤对比" description="柱高为该班学生总数，深色为已签到">
            <n-empty v-if="!attendance.classes.length" description="暂无可对比的班级。" />
            <AppChart v-else :height="210" :option="classAttendanceOption" />
          </SaPanel>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { NAlert, NButton, NDatePicker, NEmpty, NSelect, NSkeleton, NTag } from 'naive-ui';
import { computed, defineAsyncComponent, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';

import { apiGet, apiGetBlob } from '@/api/http';
import SaDataTable from '@/components/sa/SaDataTable.vue';
import SaPageHeader from '@/components/sa/SaPageHeader.vue';
import SaPanel from '@/components/sa/SaPanel.vue';
import SaTableColumn from '@/components/sa/SaTableColumn.vue';
import { useChartTheme } from '@/composables/useChartTheme';
import { useAuthStore } from '@/stores/auth';
import { ElMessage } from '@/ui/feedback';

const AppChart = defineAsyncComponent(() => import('@/components/AppChart.vue'));

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
const { axisX, axisY, base, grid, legend, palette, tokens, tooltip } = useChartTheme();
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
    label: `${item.class_name} · 已到 ${item.present_count} / ${item.student_count}`,
    value: item.id,
  })),
);

const statusOptions = [
  { label: '全部', value: 'all' },
  { label: '已签到', value: 'present' },
  { label: '未签到', value: 'absent' },
];

const filteredRecords = computed(() => {
  const records = attendance.value?.records || [];
  if (statusFilter.value === 'all') {
    return records;
  }
  return records.filter((item) => item.status === statusFilter.value);
});

const overallRate = computed(() => {
  const summary = attendance.value?.summary;
  if (!summary?.student_count) {
    return 0;
  }
  return Math.round((summary.present_count / summary.student_count) * 100);
});

const attendanceDonutOption = computed(() => {
  const summary = attendance.value?.summary;
  const present = summary?.present_count ?? 0;
  const absent = summary?.absent_count ?? 0;
  const rate = overallRate.value;

  return base({
    tooltip: tooltip('item'),
    legend: legend({ bottom: 0, top: 'auto' }),
    series: [
      {
        type: 'pie',
        radius: ['52%', '74%'],
        center: ['50%', '44%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 12, borderColor: tokens.value.surface, borderWidth: 3 },
        label: { show: false },
        data: [
          { value: present, name: '已签到', itemStyle: { color: palette.value[2] } },
          { value: absent, name: '未签到', itemStyle: { color: tokens.value.border } },
        ],
      },
    ],
    graphic: [
      {
        type: 'text',
        left: 'center',
        top: '38%',
        style: { text: `${rate}%`, fill: tokens.value.ink, fontSize: 28, fontWeight: 700 },
      },
      {
        type: 'text',
        left: 'center',
        top: '50%',
        style: { text: '出勤率', fill: tokens.value.muted, fontSize: 12 },
      },
    ],
  });
});

const classAttendanceOption = computed(() => {
  const classes = attendance.value?.classes || [];
  return base({
    tooltip: tooltip('axis'),
    legend: legend({ top: 0 }),
    grid: grid(),
    xAxis: axisX(classes.map((item) => item.class_name)),
    yAxis: axisY(),
    series: [
      {
        name: '已签到',
        type: 'bar',
        stack: 'attendance',
        barMaxWidth: 34,
        itemStyle: { color: palette.value[2], borderRadius: [0, 0, 0, 0] },
        emphasis: { focus: 'series' },
        data: classes.map((item) => item.present_count),
      },
      {
        name: '未签到',
        type: 'bar',
        stack: 'attendance',
        barMaxWidth: 34,
        itemStyle: { color: tokens.value.warning, borderRadius: [6, 6, 0, 0] },
        emphasis: { focus: 'series' },
        data: classes.map((item) => item.absent_count),
      },
    ],
  });
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
/* 顶部：摘要条与筛选并排成一行，避免「四张指标卡 + 独立筛选面板」两层留白 */
.attendance-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
}

.attendance-filters {
  flex-wrap: nowrap;
}

/* 主体：签到明细为 8 列主区，出勤图表收进 4 列上下文栏 */
.attendance-body-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(300px, 1fr);
  gap: 12px;
  align-items: start;
}

.attendance-rail {
  display: grid;
  gap: 12px;
  align-content: start;
  min-width: 0;
}

.attendance-rail :deep(.sa-panel__body) {
  padding: 12px;
}

.toolbar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  width: 100%;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-select {
  width: 200px;
}

.filter-select--status {
  width: 140px;
}

@media (max-width: 1439px) {
  .attendance-body-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .attendance-rail {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 1100px) {
  .attendance-head {
    grid-template-columns: minmax(0, 1fr);
  }

  .attendance-filters {
    flex-wrap: wrap;
  }
}

@media (max-width: 760px) {
  .attendance-rail {
    grid-template-columns: minmax(0, 1fr);
  }

  .filter-select,
  .filter-select--status {
    width: 100%;
  }
}
</style>
