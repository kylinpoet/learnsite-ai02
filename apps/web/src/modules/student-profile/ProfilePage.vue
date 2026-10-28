<template>
  <div class="sw-profile">
    <StudentPageHead title="我的档案" :sub="headerSub">
      <template #actions>
        <n-button :loading="isLoading" @click="loadProfile">刷新</n-button>
      </template>
    </StudentPageHead>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <div v-if="isLoading" class="sw-panel">
      <div class="sw-panel__body">
        <n-skeleton :rows="6" animated />
      </div>
    </div>

    <template v-else-if="profileData">
      <StudentStatStrip :items="statItems" />

      <n-tabs v-model:value="activeSection" type="line" @update:value="handleTabChange">
        <n-tab-pane name="overview" tab="资料">
          <div class="sw-profile__pane">
            <div class="sw-grid-2">
              <StudentPanel title="基本信息" flush>
                <div v-for="row in infoRows" :key="row.label" class="sw-row">
                  <span class="sw-row__main">
                    <span class="sw-row__title">{{ row.label }}</span>
                    <span v-if="row.note" class="sw-row__meta">{{ row.note }}</span>
                  </span>
                  <span class="sw-row__value">{{ row.value }}</span>
                </div>
              </StudentPanel>

              <StudentPanel title="相片">
                <div class="sw-profile__photo">
                  <div class="avatar-shell">
                    <img v-if="photoPreviewUrl" :src="photoPreviewUrl" alt="当前相片" class="avatar-image" />
                    <div v-else class="avatar-placeholder">暂无相片</div>
                  </div>
                  <div class="sw-profile__photo-meta">
                    <span
                      :class="['sw-chip', profileData.profile.photo_available ? 'sw-chip--done' : 'sw-chip--todo']"
                    >
                      {{ profileData.profile.photo_available ? '已上传' : '未上传' }}
                    </span>
                    <n-button secondary size="small" @click="switchToSection('photo')">
                      更换相片
                    </n-button>
                  </div>
                </div>
              </StudentPanel>
            </div>
          </div>
        </n-tab-pane>

        <n-tab-pane name="attendance" tab="签到">
          <div class="sw-profile__pane">
            <StudentPanel
              title="签到记录"
              :count="`${profileData.attendance_records.length} 条`"
              flush
            >
              <template v-if="profileData.attendance_records.length">
                <article
                  v-for="record in profileData.attendance_records"
                  :key="record.id"
                  class="sw-row"
                >
                  <span class="sw-row__main">
                    <span class="sw-row__title">{{ formatDate(record.attendance_date) }}</span>
                    <span class="sw-row__meta">
                      <span>{{ record.room_name || '未绑定机房' }} · {{ record.seat_label || '未识别座位' }}</span>
                      <span>{{ record.signin_source }}</span>
                      <span v-if="record.client_ip">{{ record.client_ip }}</span>
                    </span>
                  </span>
                  <span class="sw-row__value">{{ formatTime(record.checked_in_at) }}</span>
                </article>
              </template>
              <StudentEmpty v-else box text="还没有签到记录，上课登录后会自动签到。" />
            </StudentPanel>
          </div>
        </n-tab-pane>

        <n-tab-pane name="security" tab="安全">
          <div class="sw-profile__pane">
            <StudentPanel title="修改密码">
              <n-form class="sw-profile__form" label-placement="top">
                <n-form-item label="当前密码">
                  <n-input v-model:value="passwordForm.current_password" show-password-on="click" type="password" />
                </n-form-item>
                <n-form-item label="新密码">
                  <n-input v-model:value="passwordForm.new_password" show-password-on="click" type="password" />
                </n-form-item>
                <n-form-item label="确认新密码">
                  <n-input v-model:value="passwordForm.confirm_password" show-password-on="click" type="password" />
                </n-form-item>
                <p class="sw-row__meta">至少 6 位，建议含字母和数字；忘记密码请联系教师重置。</p>
                <div class="action-group">
                  <n-button :loading="isSavingPassword" type="primary" @click="submitPasswordChange">
                    保存新密码
                  </n-button>
                  <n-button secondary @click="resetPasswordForm">清空</n-button>
                </div>
              </n-form>
            </StudentPanel>
          </div>
        </n-tab-pane>

        <n-tab-pane name="edit" tab="修改申请">
          <div class="sw-profile__pane">
            <div class="sw-grid-2">
              <StudentPanel title="姓名">
                <n-form label-placement="top">
                  <n-form-item label="姓名">
                    <n-input
                      v-model:value="nameForm.name"
                      :disabled="!canEditName"
                      :maxlength="50"
                      placeholder="请输入真实姓名"
                    />
                  </n-form-item>
                  <div class="action-group">
                    <n-button
                      :disabled="!canEditName"
                      :loading="isSavingName"
                      type="primary"
                      @click="submitNameUpdate"
                    >
                      保存姓名
                    </n-button>
                  </div>
                  <p v-if="!canEditName" class="sw-row__meta">
                    当前班级未开放姓名修改，请联系教师。
                  </p>
                </n-form>
              </StudentPanel>

              <StudentPanel title="性别">
                <n-form label-placement="top">
                  <n-form-item label="性别">
                    <n-radio-group v-model:value="genderForm.gender" :disabled="!canEditGender">
                      <n-radio-button value="男">男</n-radio-button>
                      <n-radio-button value="女">女</n-radio-button>
                      <n-radio-button value="未知">未知</n-radio-button>
                    </n-radio-group>
                  </n-form-item>
                  <div class="action-group">
                    <n-button
                      :disabled="!canEditGender"
                      :loading="isSavingGender"
                      type="primary"
                      @click="submitGenderUpdate"
                    >
                      保存性别
                    </n-button>
                  </div>
                  <p v-if="!canEditGender" class="sw-row__meta">
                    当前班级未开放性别修改，请联系教师。
                  </p>
                </n-form>
              </StudentPanel>
            </div>

            <div class="sw-grid-2">
              <StudentPanel title="相片">
                <label class="upload-label">
                  <span>选择图片（JPG/PNG/WEBP/GIF，≤2MB）</span>
                  <input
                    accept="image/*"
                    class="upload-input"
                    :disabled="!canEditPhoto"
                    type="file"
                    @change="handlePhotoFileChange"
                  />
                </label>
                <p class="sw-row__meta">{{ selectedPhotoFileName || '尚未选择新图片' }}</p>
                <div class="action-group">
                  <n-button
                    :disabled="!canEditPhoto"
                    :loading="isSavingPhoto"
                    type="primary"
                    @click="submitPhotoUpload"
                  >
                    上传相片
                  </n-button>
                  <n-button
                    :disabled="!canEditPhoto || !profileData.profile.photo_available"
                    secondary
                    type="error"
                    @click="deletePhoto"
                  >
                    删除相片
                  </n-button>
                </div>
                <p v-if="!canEditPhoto" class="sw-row__meta">当前班级未开放相片修改，请联系教师。</p>
              </StudentPanel>

              <StudentPanel title="转班申请">
                <n-form label-placement="top">
                  <n-form-item label="当前班级">
                    <n-input :value="classTransferOptions.current_class_name || '--'" disabled />
                  </n-form-item>
                  <n-form-item label="目标班级">
                    <n-select
                      v-model:value="classTransferForm.target_class_id"
                      :disabled="!canEditClass"
                      :options="transferClassOptions"
                      class="full-width"
                      filterable
                      placeholder="请选择目标班级"
                    />
                  </n-form-item>
                  <n-form-item label="申请说明（可选）">
                    <n-input
                      v-model:value="classTransferForm.reason"
                      :disabled="!canEditClass"
                      :maxlength="300"
                      :rows="4"
                      placeholder="可填写转班原因，便于教师审核"
                      show-count
                      type="textarea"
                    />
                  </n-form-item>
                  <div class="action-group">
                    <n-button
                      :disabled="hasPendingClassTransfer || !canEditClass"
                      :loading="isSavingClassTransfer"
                      type="primary"
                      @click="submitClassTransferRequest"
                    >
                      提交申请
                    </n-button>
                  </div>
                  <p class="sw-row__meta">{{ classTransferHint }}</p>
                </n-form>
              </StudentPanel>
            </div>

            <StudentPanel title="申请记录" :count="`${classTransferRequests.length} 条`" flush>
              <template v-if="classTransferRequests.length">
                <article v-for="request in classTransferRequests" :key="request.id" class="sw-row">
                  <span class="sw-row__main">
                    <span class="sw-row__title">
                      {{ request.current_class.class_name }} → {{ request.target_class.class_name }}
                    </span>
                    <span class="sw-row__meta">
                      <span>{{ formatDateTime(request.created_at) }} 提交</span>
                      <span v-if="request.reviewed_by_name">{{ request.reviewed_by_name }} 审核</span>
                      <span v-if="request.review_note">{{ request.review_note }}</span>
                    </span>
                  </span>
                  <span :class="['sw-chip', classTransferStatusChip(request.status)]">
                    {{ classTransferStatusLabel(request.status) }}
                  </span>
                </article>
              </template>
              <StudentEmpty v-else box text="还没有转班申请，提交后会在这里看到审核进度。" />
            </StudentPanel>
          </div>
        </n-tab-pane>
      </n-tabs>
    </template>
  </div>
</template>

<script setup lang="ts">
import {
  NAlert,
  NButton,
  NForm,
  NFormItem,
  NInput,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSkeleton,
  NTabPane,
  NTabs,
} from 'naive-ui';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElMessage } from '@/ui/feedback';
import { useRoute, useRouter } from 'vue-router';

import { apiDelete, apiGet, apiGetBlob, apiPost, apiPut, apiUpload } from '@/api/http';
import StudentEmpty from '@/components/student/StudentEmpty.vue';
import StudentPageHead from '@/components/student/StudentPageHead.vue';
import StudentPanel from '@/components/student/StudentPanel.vue';
import StudentStatStrip, { type StudentStatItem } from '@/components/student/StudentStatStrip.vue';
import { useAuthStore } from '@/stores/auth';

type ProfileEditPermissions = {
  can_edit_name: boolean;
  can_edit_gender: boolean;
  can_edit_photo: boolean;
  can_edit_class: boolean;
};

type ProfilePayload = {
  profile: {
    name: string;
    username: string;
    student_no: string;
    class_id: number;
    class_name: string;
    grade_no: number;
    gender: string;
    entry_year: number;
    seat_label: string | null;
    room_name: string | null;
    photo_available: boolean;
  };
  attendance_summary: {
    total_count: number;
    checked_in_today: boolean;
    latest_checked_in_at: string | null;
    latest_signin_source: string | null;
  };
  attendance_records: Array<{
    id: number;
    attendance_date: string;
    checked_in_at: string;
    class_name: string;
    seat_label: string | null;
    room_name: string | null;
    client_ip: string | null;
    signin_source: string;
  }>;
  profile_edit_permissions: ProfileEditPermissions;
};

type ClassTransferOptionItem = {
  id: number;
  class_name: string;
  grade_no: number;
};

type ClassTransferOptionsPayload = {
  current_class_id: number;
  current_class_name: string;
  grade_no: number;
  has_pending_request: boolean;
  class_edit_enabled?: boolean;
  classes: ClassTransferOptionItem[];
};

type ClassTransferRequestItem = {
  id: number;
  status: 'pending' | 'approved' | 'rejected' | string;
  reason: string | null;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  student: {
    user_id: number;
    name: string;
    student_no: string;
  };
  current_class: {
    id: number;
    class_name: string;
    grade_no: number;
  };
  target_class: {
    id: number;
    class_name: string;
    grade_no: number;
  };
  reviewed_by_name: string | null;
};

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const defaultProfileEditPermissions: ProfileEditPermissions = {
  can_edit_name: true,
  can_edit_gender: true,
  can_edit_photo: true,
  can_edit_class: true,
};

const profileData = ref<ProfilePayload | null>(null);
const classTransferOptions = ref<ClassTransferOptionsPayload>({
  current_class_id: 0,
  current_class_name: '',
  grade_no: 0,
  has_pending_request: false,
  class_edit_enabled: true,
  classes: [],
});
const classTransferRequests = ref<ClassTransferRequestItem[]>([]);
const photoPreviewUrl = ref('');
const selectedPhotoFile = ref<File | null>(null);

const isLoading = ref(true);
const isSavingPassword = ref(false);
const isSavingName = ref(false);
const isSavingGender = ref(false);
const isSavingPhoto = ref(false);
const isSavingClassTransfer = ref(false);
const errorMessage = ref('');
const activeSection = ref('overview');

const passwordForm = ref({
  current_password: '',
  new_password: '',
  confirm_password: '',
});
const nameForm = ref({ name: '' });
const genderForm = ref({ gender: '未知' });
const classTransferForm = ref({
  target_class_id: null as number | null,
  reason: '',
});

/** 四个 tab 的 name；旧地址里的 name / gender / photo / class-transfer 统一落到「修改申请」 */
const tabSections = new Set(['overview', 'attendance', 'security', 'edit']);
const legacySectionTabMap: Record<string, string> = {
  overview: 'overview',
  attendance: 'attendance',
  security: 'security',
  password: 'security',
  edit: 'edit',
  name: 'edit',
  gender: 'edit',
  photo: 'edit',
  'class-transfer': 'edit',
};

const currentSeatText = computed(() => profileData.value?.profile.seat_label || '未识别座位');
const currentRoomText = computed(() => profileData.value?.profile.room_name || '当前还没有机房定位记录');
const latestCheckInText = computed(() => {
  const latestValue = profileData.value?.attendance_summary.latest_checked_in_at;
  if (!latestValue) {
    return '暂无签到';
  }
  return formatDateTime(latestValue);
});
const selectedPhotoFileName = computed(() => selectedPhotoFile.value?.name || '');
const profileEditPermissions = computed<ProfileEditPermissions>(() => ({
  ...defaultProfileEditPermissions,
  ...(profileData.value?.profile_edit_permissions || {}),
}));
const canEditName = computed(() => profileEditPermissions.value.can_edit_name);
const canEditGender = computed(() => profileEditPermissions.value.can_edit_gender);
const canEditPhoto = computed(() => profileEditPermissions.value.can_edit_photo);
const canEditClass = computed(
  () => profileEditPermissions.value.can_edit_class && (classTransferOptions.value.class_edit_enabled ?? true)
);
const hasPendingClassTransfer = computed(
  () =>
    classTransferOptions.value.has_pending_request ||
    classTransferRequests.value.some((item) => item.status === 'pending')
);
const availableTransferClassOptions = computed(() => {
  const currentClassId = profileData.value?.profile.class_id ?? 0;
  return classTransferOptions.value.classes.filter((item) => item.id !== currentClassId);
});
const transferClassOptions = computed(() =>
  availableTransferClassOptions.value.map((item) => ({
    label: item.class_name,
    value: item.id,
  })),
);

const headerSub = computed(() => {
  const profile = profileData.value?.profile;
  if (!profile) {
    return '';
  }
  return [profile.class_name, `学号 ${profile.student_no}`, currentSeatText.value].join(' · ');
});

const statItems = computed<StudentStatItem[]>(() => {
  const attendance = profileData.value?.attendance_summary;
  const profile = profileData.value?.profile;
  return [
    {
      label: '班级',
      value: profile?.class_name ?? '--',
      note: `${profile?.grade_no ?? '--'} 年级 · 学号 ${profile?.student_no ?? '--'}`,
    },
    {
      label: '累计签到',
      value: attendance?.total_count ?? 0,
      unit: '次',
      note: `最近 ${latestCheckInText.value}`,
    },
    {
      label: '今日状态',
      value: attendance?.checked_in_today ? '已签到' : '未签到',
      note: attendance?.latest_signin_source || '等待登录签到',
    },
    {
      label: '座位',
      value: currentSeatText.value,
      note: currentRoomText.value,
    },
  ];
});

const infoRows = computed(() => {
  const profile = profileData.value?.profile;
  if (!profile) {
    return [];
  }
  return [
    { label: '姓名', value: profile.name, note: '' },
    { label: '学号', value: profile.student_no, note: '' },
    { label: '登录账号', value: profile.username, note: '' },
    { label: '班级', value: profile.class_name, note: `${profile.grade_no} 年级` },
    { label: '性别', value: profile.gender, note: '' },
    { label: '入学年份', value: `${profile.entry_year} 年`, note: '' },
  ];
});

const classTransferHint = computed(() => {
  if (!canEditClass.value) {
    return '当前班级未开放班级修改，请联系教师。';
  }
  if (hasPendingClassTransfer.value) {
    return '你已有待审核申请，请等待审核结果。';
  }
  return '提交后需教师或管理员审核通过才生效。';
});

function formatDate(value: string | null) {
  if (!value) {
    return '--';
  }
  return value.split('-').join('.');
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '--';
  }
  return value.replace('T', ' ').slice(0, 16);
}

function formatTime(value: string | null) {
  if (!value) {
    return '--';
  }
  return value.replace('T', ' ').slice(11, 16);
}

function classTransferStatusLabel(statusValue: string) {
  if (statusValue === 'pending') {
    return '待审核';
  }
  if (statusValue === 'approved') {
    return '已通过';
  }
  if (statusValue === 'rejected') {
    return '已拒绝';
  }
  return statusValue;
}

function classTransferStatusChip(statusValue: string) {
  if (statusValue === 'pending') {
    return 'sw-chip--warn';
  }
  if (statusValue === 'approved') {
    return 'sw-chip--done';
  }
  if (statusValue === 'rejected') {
    return 'sw-chip--danger';
  }
  return 'sw-chip--todo';
}

function syncSectionFromRoute() {
  const section = typeof route.params.section === 'string' ? route.params.section : 'overview';
  const tab = legacySectionTabMap[section] || (tabSections.has(section) ? section : 'overview');
  activeSection.value = tab;
}

function revokePhotoPreviewUrl() {
  if (!photoPreviewUrl.value) {
    return;
  }
  URL.revokeObjectURL(photoPreviewUrl.value);
  photoPreviewUrl.value = '';
}

async function loadPhotoPreview() {
  revokePhotoPreviewUrl();
  if (!authStore.token || !profileData.value?.profile.photo_available) {
    return;
  }
  try {
    const response = await apiGetBlob('/profiles/student/photo', authStore.token);
    const photoBlob = await response.blob();
    photoPreviewUrl.value = URL.createObjectURL(photoBlob);
  } catch {
    photoPreviewUrl.value = '';
  }
}

async function loadClassTransferOptions() {
  if (!authStore.token) {
    return;
  }
  classTransferOptions.value = await apiGet<ClassTransferOptionsPayload>(
    '/profiles/student/class-transfer/options',
    authStore.token
  );
}

async function loadClassTransferRequests() {
  if (!authStore.token) {
    return;
  }
  const payload = await apiGet<{ requests: ClassTransferRequestItem[] }>(
    '/profiles/student/class-transfer/requests',
    authStore.token
  );
  classTransferRequests.value = payload.requests;
}

async function loadProfile() {
  if (!authStore.token) {
    errorMessage.value = '请先登录学生账号';
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';
  try {
    const profilePayload = await apiGet<ProfilePayload>('/profiles/student/me', authStore.token);
    profileData.value = profilePayload;
    nameForm.value.name = profilePayload.profile.name;
    genderForm.value.gender = profilePayload.profile.gender;
    await Promise.all([loadClassTransferOptions(), loadClassTransferRequests(), loadPhotoPreview()]);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载个人资料失败';
  } finally {
    isLoading.value = false;
  }
}

function resetPasswordForm() {
  passwordForm.value = {
    current_password: '',
    new_password: '',
    confirm_password: '',
  };
}

async function submitPasswordChange() {
  if (!authStore.token) {
    ElMessage.error('请先登录学生账号');
    return;
  }
  if (!passwordForm.value.current_password || !passwordForm.value.new_password || !passwordForm.value.confirm_password) {
    ElMessage.warning('请先填写完整的密码信息');
    return;
  }

  isSavingPassword.value = true;
  try {
    await apiPost(
      '/profiles/student/password',
      {
        current_password: passwordForm.value.current_password,
        new_password: passwordForm.value.new_password,
        confirm_password: passwordForm.value.confirm_password,
      },
      authStore.token
    );
    resetPasswordForm();
    ElMessage.success('密码已更新，下次登录请使用新密码');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '修改密码失败');
  } finally {
    isSavingPassword.value = false;
  }
}

async function submitNameUpdate() {
  if (!authStore.token) {
    return;
  }
  if (!canEditName.value) {
    ElMessage.warning('当前班级暂未开放姓名修改权限');
    return;
  }
  const normalizedName = nameForm.value.name.trim();
  if (!normalizedName) {
    ElMessage.warning('请先输入姓名');
    return;
  }

  isSavingName.value = true;
  try {
    await apiPut('/profiles/student/name', { name: normalizedName }, authStore.token);
    ElMessage.success('姓名已更新');
    await loadProfile();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '姓名更新失败');
  } finally {
    isSavingName.value = false;
  }
}

async function submitGenderUpdate() {
  if (!authStore.token) {
    return;
  }
  if (!canEditGender.value) {
    ElMessage.warning('当前班级暂未开放性别修改权限');
    return;
  }
  isSavingGender.value = true;
  try {
    await apiPut('/profiles/student/gender', { gender: genderForm.value.gender }, authStore.token);
    ElMessage.success('性别已更新');
    await loadProfile();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '性别更新失败');
  } finally {
    isSavingGender.value = false;
  }
}

function handlePhotoFileChange(event: Event) {
  if (!canEditPhoto.value) {
    selectedPhotoFile.value = null;
    return;
  }
  const input = event.target as HTMLInputElement;
  const selected = input.files?.[0] || null;
  selectedPhotoFile.value = selected;
}

async function submitPhotoUpload() {
  if (!authStore.token) {
    return;
  }
  if (!canEditPhoto.value) {
    ElMessage.warning('当前班级暂未开放相片修改权限');
    return;
  }
  if (!selectedPhotoFile.value) {
    ElMessage.warning('请先选择图片文件');
    return;
  }

  isSavingPhoto.value = true;
  try {
    const formData = new FormData();
    formData.append('file', selectedPhotoFile.value);
    await apiUpload('/profiles/student/photo', formData, authStore.token);
    selectedPhotoFile.value = null;
    ElMessage.success('相片已上传');
    await loadProfile();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '相片上传失败');
  } finally {
    isSavingPhoto.value = false;
  }
}

async function deletePhoto() {
  if (!authStore.token) {
    return;
  }
  if (!canEditPhoto.value) {
    ElMessage.warning('当前班级暂未开放相片修改权限');
    return;
  }
  isSavingPhoto.value = true;
  try {
    await apiDelete('/profiles/student/photo', authStore.token);
    selectedPhotoFile.value = null;
    ElMessage.success('相片已删除');
    await loadProfile();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除相片失败');
  } finally {
    isSavingPhoto.value = false;
  }
}

async function submitClassTransferRequest() {
  if (!authStore.token) {
    return;
  }
  if (!canEditClass.value) {
    ElMessage.warning('当前班级暂未开放班级修改权限');
    return;
  }
  if (!classTransferForm.value.target_class_id) {
    ElMessage.warning('请先选择目标班级');
    return;
  }

  isSavingClassTransfer.value = true;
  try {
    await apiPost(
      '/profiles/student/class-transfer/requests',
      {
        target_class_id: classTransferForm.value.target_class_id,
        reason: classTransferForm.value.reason.trim() || null,
      },
      authStore.token
    );
    classTransferForm.value.reason = '';
    classTransferForm.value.target_class_id = null;
    ElMessage.success('转班申请已提交');
    await Promise.all([loadClassTransferOptions(), loadClassTransferRequests()]);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '提交转班申请失败');
  } finally {
    isSavingClassTransfer.value = false;
  }
}

async function switchToSection(section: string) {
  const target = section === 'overview' ? '/student/profile' : `/student/profile/${section}`;
  if (route.fullPath !== target) {
    await router.push(target);
  }
}

async function handleTabChange(name: string | number) {
  const tab = `${name}`;
  const section = tab === 'security' ? 'password' : tab;
  const target = section === 'overview' ? '/student/profile' : `/student/profile/${section}`;
  if (route.fullPath !== target) {
    await router.push(target);
  }
}

watch(() => route.params.section, syncSectionFromRoute, { immediate: true });

onMounted(() => {
  syncSectionFromRoute();
  void loadProfile();
});

onBeforeUnmount(() => {
  revokePhotoPreviewUrl();
});
</script>

<style scoped>
.sw-profile {
  display: grid;
  gap: var(--sw-section-gap);
}

.sw-profile :deep(.n-tabs-nav) {
  margin-bottom: var(--sw-gap);
}

.sw-profile__pane {
  display: grid;
  gap: var(--sw-gap);
}

.sw-profile__photo {
  display: flex;
  align-items: center;
  gap: 16px;
}

.sw-profile__photo-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.sw-profile__form {
  max-width: 380px;
}

.avatar-shell {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 84px;
  height: 84px;
  border: 1px solid var(--sw-line);
  border-radius: 999px;
  background: var(--sw-surface-2);
  overflow: hidden;
}

.avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  color: var(--sw-muted);
  font-size: 12px;
}

.action-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.upload-label {
  display: grid;
  gap: 6px;
  color: var(--sw-text);
  font-size: 13px;
}

.upload-input {
  width: 100%;
}

.full-width {
  width: 100%;
}

@media (max-width: 560px) {
  .sw-profile__photo {
    align-items: flex-start;
  }
}
</style>
