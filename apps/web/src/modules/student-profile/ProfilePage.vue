<template>
  <div class="page-stack">
    <section class="hero-panel">
      <div>
        <p class="eyebrow">个人资料中心</p>
        <h2>{{ pageTitle }}</h2>
        <p class="hero-copy">
          这里已经整合基础资料、签到记录、密码修改，以及姓名/性别/相片维护和转班申请。
          班级变更采用“提交申请-教师/管理员审核”机制，学生不能直接改动学籍班级。
        </p>
      </div>
      <div class="action-row">
        <el-button :loading="isLoading" type="primary" @click="loadProfile">刷新资料</el-button>
        <el-button plain @click="goToWorkCenter">查看我的作品</el-button>
      </div>
    </section>

    <el-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <div v-if="profileData" class="metric-grid">
      <article class="mini-panel">
        <p class="metric-label">当前班级</p>
        <p class="metric-value metric-value--small">{{ profileData.profile.class_name }}</p>
        <p class="metric-note">学号 {{ profileData.profile.student_no }} · {{ profileData.profile.grade_no }} 年级</p>
      </article>
      <article class="mini-panel">
        <p class="metric-label">累计签到</p>
        <p class="metric-value">{{ profileData.attendance_summary.total_count }}</p>
        <p class="metric-note">最近签到 {{ latestCheckInText }}</p>
      </article>
      <article class="mini-panel">
        <p class="metric-label">今日状态</p>
        <p class="metric-value metric-value--small">{{ profileData.attendance_summary.checked_in_today ? '已签到' : '未签到' }}</p>
        <p class="metric-note">{{ profileData.attendance_summary.latest_signin_source || '等待登录签到' }}</p>
      </article>
      <article class="mini-panel">
        <p class="metric-label">当前座位</p>
        <p class="metric-value metric-value--small">{{ currentSeatText }}</p>
        <p class="metric-note">{{ currentRoomText }}</p>
      </article>
    </div>

    <el-card class="soft-card">
      <el-skeleton :loading="isLoading" animated>
        <template #template>
          <el-skeleton :rows="10" />
        </template>

        <template #default>
          <el-tabs v-model="activeSection" @tab-change="handleTabChange">
            <el-tab-pane label="基础信息" name="overview">
              <div v-if="profileData" class="profile-grid">
                <el-card class="soft-card inner-card">
                  <template #header>基础资料</template>
                  <div class="avatar-row">
                    <div class="avatar-shell">
                      <img v-if="photoPreviewUrl" :src="photoPreviewUrl" alt="头像预览" class="avatar-image" />
                      <div v-else class="avatar-placeholder">暂无头像</div>
                    </div>
                    <div class="stack-list">
                      <el-tag round :type="profileData.profile.photo_available ? 'success' : 'info'">
                        {{ profileData.profile.photo_available ? '已上传头像' : '未上传头像' }}
                      </el-tag>
                      <el-space wrap>
                        <el-button :disabled="!canEditPhoto" plain @click="switchToSection('photo')">上传相片</el-button>
                        <el-button :disabled="!canEditName" plain @click="switchToSection('name')">修改姓名</el-button>
                        <el-button :disabled="!canEditGender" plain @click="switchToSection('gender')">修改性别</el-button>
                        <el-button :disabled="!canEditClass" plain @click="switchToSection('class-transfer')">修改班级</el-button>
                      </el-space>
                    </div>
                  </div>

                  <el-descriptions :column="1" border>
                    <el-descriptions-item label="姓名">{{ profileData.profile.name }}</el-descriptions-item>
                    <el-descriptions-item label="登录账号">{{ profileData.profile.username }}</el-descriptions-item>
                    <el-descriptions-item label="学号">{{ profileData.profile.student_no }}</el-descriptions-item>
                    <el-descriptions-item label="班级">{{ profileData.profile.class_name }}</el-descriptions-item>
                    <el-descriptions-item label="年级">{{ profileData.profile.grade_no }} 年级</el-descriptions-item>
                    <el-descriptions-item label="性别">{{ profileData.profile.gender }}</el-descriptions-item>
                    <el-descriptions-item label="入学年份">{{ profileData.profile.entry_year }}</el-descriptions-item>
                    <el-descriptions-item label="机房座位">{{ currentSeatText }}</el-descriptions-item>
                  </el-descriptions>
                </el-card>

                <el-card class="soft-card inner-card">
                  <template #header>常用入口</template>
                  <div class="stack-list">
                    <article class="tip-card">
                      <h3>资料维护提示</h3>
                      <p>姓名、性别、相片和班级修改权限由班级统一配置；如当前不可修改，请联系教师或管理员。</p>
                    </article>
                    <article class="tip-card">
                      <h3>课堂相关</h3>
                      <p>签到记录展示最近 20 条，异常可联系任课教师核对当日课堂会话。</p>
                    </article>
                    <article class="tip-card">
                      <h3>快捷跳转</h3>
                      <div class="action-group">
                        <el-button plain @click="goToHome">返回学习中心</el-button>
                        <el-button plain @click="goToWorkCenter">查看我的作品</el-button>
                        <el-button plain @click="goToAttendanceTab">查看签到记录</el-button>
                      </div>
                    </article>
                  </div>
                </el-card>
              </div>
            </el-tab-pane>

            <el-tab-pane :label="attendanceTabLabel" name="attendance">
              <el-card class="soft-card inner-card">
                <template #header>
                  <div class="info-row">
                    <span>最近签到记录</span>
                    <el-tag round type="success">{{ profileData?.attendance_records.length || 0 }} 条</el-tag>
                  </div>
                </template>

                <el-empty v-if="!profileData?.attendance_records.length" description="还没有签到记录" />

                <el-table v-else :data="profileData.attendance_records" stripe>
                  <el-table-column label="签到日期" min-width="120">
                    <template #default="{ row }">{{ formatDate(row.attendance_date) }}</template>
                  </el-table-column>
                  <el-table-column label="签到时间" min-width="160">
                    <template #default="{ row }">{{ formatDateTime(row.checked_in_at) }}</template>
                  </el-table-column>
                  <el-table-column label="位置" min-width="180">
                    <template #default="{ row }">
                      {{ row.room_name || '未绑定机房' }} / {{ row.seat_label || '未识别座位' }}
                    </template>
                  </el-table-column>
                  <el-table-column label="来源" min-width="120" prop="signin_source" />
                  <el-table-column label="登录 IP" min-width="140">
                    <template #default="{ row }">{{ row.client_ip || '--' }}</template>
                  </el-table-column>
                </el-table>
              </el-card>
            </el-tab-pane>

            <el-tab-pane label="密码修改" name="security">
              <div class="profile-grid">
                <el-card class="soft-card inner-card">
                  <template #header>修改密码</template>
                  <el-form label-position="top" @submit.prevent>
                    <el-form-item label="当前密码">
                      <el-input v-model="passwordForm.current_password" show-password />
                    </el-form-item>
                    <el-form-item label="新密码">
                      <el-input v-model="passwordForm.new_password" show-password />
                    </el-form-item>
                    <el-form-item label="确认新密码">
                      <el-input v-model="passwordForm.confirm_password" show-password />
                    </el-form-item>
                    <div class="action-group">
                      <el-button :loading="isSavingPassword" type="primary" @click="submitPasswordChange">保存新密码</el-button>
                      <el-button plain @click="resetPasswordForm">清空</el-button>
                    </div>
                  </el-form>
                </el-card>

                <el-card class="soft-card inner-card">
                  <template #header>密码规则</template>
                  <div class="stack-list">
                    <article class="tip-card">
                      <h3>建议做法</h3>
                      <p>建议至少 6 位，并尽量包含字母和数字，避免与旧密码重复。</p>
                    </article>
                    <article class="tip-card">
                      <h3>忘记密码</h3>
                      <p>若无法登录，请联系教师或管理员在教师后台重置密码。</p>
                    </article>
                  </div>
                </el-card>
              </div>
            </el-tab-pane>

            <el-tab-pane label="修改姓名" name="name">
              <el-card class="soft-card inner-card">
                <template #header>姓名维护</template>
                <el-form label-position="top" @submit.prevent>
                  <el-form-item label="姓名">
                    <el-input
                      v-model="nameForm.name"
                      :disabled="!canEditName"
                      maxlength="50"
                      placeholder="请输入真实姓名"
                    />
                  </el-form-item>
                  <div class="action-group">
                    <el-button :disabled="!canEditName" :loading="isSavingName" type="primary" @click="submitNameUpdate">保存姓名</el-button>
                  </div>
                  <p v-if="!canEditName" class="section-note">当前班级暂未开放姓名修改权限，请联系教师或管理员。</p>
                </el-form>
              </el-card>
            </el-tab-pane>

            <el-tab-pane label="修改性别" name="gender">
              <el-card class="soft-card inner-card">
                <template #header>性别维护</template>
                <el-form label-position="top" @submit.prevent>
                  <el-form-item label="性别">
                    <el-radio-group v-model="genderForm.gender" :disabled="!canEditGender">
                      <el-radio-button label="男">男</el-radio-button>
                      <el-radio-button label="女">女</el-radio-button>
                      <el-radio-button label="未知">未知</el-radio-button>
                    </el-radio-group>
                  </el-form-item>
                  <div class="action-group">
                    <el-button :disabled="!canEditGender" :loading="isSavingGender" type="primary" @click="submitGenderUpdate">保存性别</el-button>
                  </div>
                  <p v-if="!canEditGender" class="section-note">当前班级暂未开放性别修改权限，请联系教师或管理员。</p>
                </el-form>
              </el-card>
            </el-tab-pane>

            <el-tab-pane label="上传相片" name="photo">
              <div class="profile-grid">
                <el-card class="soft-card inner-card">
                  <template #header>相片上传</template>
                  <div class="stack-list">
                    <div class="avatar-shell avatar-shell--large">
                      <img v-if="photoPreviewUrl" :src="photoPreviewUrl" alt="头像预览" class="avatar-image" />
                      <div v-else class="avatar-placeholder">暂无头像</div>
                    </div>
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
                    <p class="section-note">
                      {{ selectedPhotoFileName || '尚未选择新图片' }}
                    </p>
                    <div class="action-group">
                      <el-button :disabled="!canEditPhoto" :loading="isSavingPhoto" type="primary" @click="submitPhotoUpload">上传相片</el-button>
                      <el-button :disabled="!canEditPhoto || !profileData?.profile.photo_available" plain type="danger" @click="deletePhoto">
                        删除相片
                      </el-button>
                    </div>
                    <p v-if="!canEditPhoto" class="section-note">当前班级暂未开放相片修改权限，请联系教师或管理员。</p>
                  </div>
                </el-card>

                <el-card class="soft-card inner-card">
                  <template #header>上传说明</template>
                  <div class="stack-list">
                    <article class="tip-card">
                      <h3>建议图片</h3>
                      <p>建议使用清晰正面头像，避免过暗、过曝或与本人不符的图片。</p>
                    </article>
                    <article class="tip-card">
                      <h3>替换规则</h3>
                      <p>每次上传都会覆盖旧相片，系统仅保留当前最新一张。</p>
                    </article>
                  </div>
                </el-card>
              </div>
            </el-tab-pane>

            <el-tab-pane label="修改班级" name="class-transfer">
              <div class="profile-grid">
                <el-card class="soft-card inner-card">
                  <template #header>转班申请</template>
                  <el-form label-position="top" @submit.prevent>
                    <el-form-item label="当前班级">
                      <el-input :model-value="classTransferOptions.current_class_name || '--'" disabled />
                    </el-form-item>
                    <el-form-item label="目标班级">
                      <el-select
                        v-model="classTransferForm.target_class_id"
                        :disabled="!canEditClass"
                        class="full-width"
                        filterable
                        placeholder="请选择目标班级"
                      >
                        <el-option
                          v-for="item in availableTransferClassOptions"
                          :key="item.id"
                          :label="item.class_name"
                          :value="item.id"
                        />
                      </el-select>
                    </el-form-item>
                    <el-form-item label="申请说明（可选）">
                      <el-input
                        v-model="classTransferForm.reason"
                        :disabled="!canEditClass"
                        :rows="4"
                        maxlength="300"
                        show-word-limit
                        type="textarea"
                        placeholder="可填写转班原因，便于教师审核"
                      />
                    </el-form-item>
                    <div class="action-group">
                      <el-button
                        :disabled="hasPendingClassTransfer || !canEditClass"
                        :loading="isSavingClassTransfer"
                        type="primary"
                        @click="submitClassTransferRequest"
                      >
                        提交申请
                      </el-button>
                    </div>
                    <p class="section-note">
                      {{
                        !canEditClass
                          ? '当前班级暂未开放班级修改权限，请联系教师或管理员。'
                          : hasPendingClassTransfer
                            ? '你已有待审核申请，请先等待审核结果。'
                            : '提交后需教师或管理员审核通过才会生效。'
                      }}
                    </p>
                  </el-form>
                </el-card>

                <el-card class="soft-card inner-card">
                  <template #header>
                    <div class="info-row">
                      <span>申请记录</span>
                      <el-tag round>{{ classTransferRequests.length }} 条</el-tag>
                    </div>
                  </template>

                  <el-empty v-if="!classTransferRequests.length" description="暂无转班申请记录" />
                  <el-table v-else :data="classTransferRequests" stripe>
                    <el-table-column label="申请时间" min-width="160">
                      <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
                    </el-table-column>
                    <el-table-column label="当前班级" min-width="120">
                      <template #default="{ row }">{{ row.current_class.class_name }}</template>
                    </el-table-column>
                    <el-table-column label="目标班级" min-width="120">
                      <template #default="{ row }">{{ row.target_class.class_name }}</template>
                    </el-table-column>
                    <el-table-column label="状态" min-width="100">
                      <template #default="{ row }">
                        <el-tag round :type="classTransferStatusType(row.status)">
                          {{ classTransferStatusLabel(row.status) }}
                        </el-tag>
                      </template>
                    </el-table-column>
                    <el-table-column label="审核备注" min-width="180">
                      <template #default="{ row }">{{ row.review_note || '--' }}</template>
                    </el-table-column>
                    <el-table-column label="审核人" min-width="120">
                      <template #default="{ row }">{{ row.reviewed_by_name || '--' }}</template>
                    </el-table-column>
                  </el-table>
                </el-card>
              </div>
            </el-tab-pane>
          </el-tabs>
        </template>
      </el-skeleton>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useRoute, useRouter } from 'vue-router';

import { apiDelete, apiGet, apiGetBlob, apiPost, apiPut, apiUpload } from '@/api/http';
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

const validSections = new Set([
  'overview',
  'attendance',
  'security',
  'password',
  'name',
  'gender',
  'photo',
  'class-transfer',
]);

const pageTitle = computed(() => {
  const displayName = profileData.value?.profile.name || authStore.user?.display_name || '同学';
  return `${displayName} 的个人中心`;
});

const currentSeatText = computed(() => profileData.value?.profile.seat_label || '未识别座位');
const currentRoomText = computed(() => profileData.value?.profile.room_name || '当前还没有机房定位记录');
const latestCheckInText = computed(() => {
  const latestValue = profileData.value?.attendance_summary.latest_checked_in_at;
  if (!latestValue) {
    return '暂无签到';
  }
  return formatDateTime(latestValue);
});
const attendanceTabLabel = computed(() => {
  const total = profileData.value?.attendance_summary.total_count || 0;
  return `签到记录 (${total})`;
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

function classTransferStatusType(statusValue: string) {
  if (statusValue === 'pending') {
    return 'warning';
  }
  if (statusValue === 'approved') {
    return 'success';
  }
  if (statusValue === 'rejected') {
    return 'danger';
  }
  return 'info';
}

function syncSectionFromRoute() {
  const section = typeof route.params.section === 'string' ? route.params.section : 'overview';
  if (!validSections.has(section)) {
    activeSection.value = 'overview';
    return;
  }
  activeSection.value = section === 'password' ? 'security' : section;
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

async function goToHome() {
  await router.push('/student/home');
}

async function goToWorkCenter() {
  await router.push('/student/work');
}

async function goToAttendanceTab() {
  await router.push('/student/profile/attendance');
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
.profile-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.inner-card {
  border: none;
  box-shadow: none;
}

.metric-value--small {
  font-size: 24px;
}

.avatar-row {
  display: flex;
  gap: 16px;
  margin-bottom: 14px;
  align-items: center;
}

.avatar-shell {
  width: 90px;
  height: 90px;
  border-radius: 50%;
  border: 1px solid var(--ls-border);
  background: rgba(255, 255, 255, 0.92);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-shell--large {
  width: 120px;
  height: 120px;
}

.avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  font-size: 12px;
  color: var(--ls-muted);
}

.tip-card {
  padding: 16px 18px;
  border: 1px solid var(--ls-border);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(255, 255, 255, 0.8));
}

.tip-card h3,
.tip-card p {
  margin: 0;
}

.tip-card h3 {
  margin-bottom: 8px;
  color: var(--ls-text);
}

.tip-card p {
  color: var(--ls-muted);
  line-height: 1.7;
}

.action-group {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.upload-label {
  display: grid;
  gap: 6px;
  color: var(--ls-text);
  font-size: 13px;
}

.upload-input {
  width: 100%;
}

.full-width {
  width: 100%;
}

@media (max-width: 1100px) {
  .profile-grid {
    grid-template-columns: 1fr;
  }

  .avatar-row {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
