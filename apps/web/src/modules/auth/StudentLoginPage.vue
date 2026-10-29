<template>
  <section :class="['page-stack', 'auth-login-page', 'student-login-page', { 'student-login-page--focus': isNamePickingStep }]">
    <div class="auth-stage">
      <div class="auth-copy-column">
        <p class="eyebrow">{{ appStore.title }}</p>
        <h1>学生登录</h1>
        <p class="hero-copy">
          选自己的班级，点名单里的名字，再输密码即可进入学习空间；不用记学号。
          老师投屏了班级码的话，直接输入班级码也能进本班。
          只想看看这节课讲什么，进入班级后选择「仅旁听」即可，不需要账号。
        </p>

        <div class="auth-pill-row">
          <span class="auth-pill">选班级</span>
          <span class="auth-pill">点名字登录</span>
          <span class="auth-pill">仅旁听</span>
        </div>

        <article class="auth-note-card student-note-card">
          <p class="auth-note-card__kicker">登录后可继续</p>
          <ul class="auth-feature-list">
            <li>老师推送学案后，阅读、提交作品和编程活动会自动衔接到同一学习路径。</li>
            <li>登录成功即完成今日签到，座位按机房电脑自动识别。</li>
          </ul>
        </article>
      </div>

      <SaPanel panel-class="auth-form-panel">
        <!-- 第一步：选班级 -->
        <template v-if="step === 'class'">
          <div class="auth-form-panel__top">
            <span class="auth-form-panel__tag">第 1 步 / 共 3 步</span>
            <p class="auth-form-panel__title">先选择你在的班级</p>
          </div>

          <n-skeleton v-if="isLoadingClasses" :rows="5" animated />

          <template v-else>
            <div class="grade-chip-row">
              <button
                v-for="item in gradeFilters"
                :key="String(item.value)"
                :class="['grade-chip', { 'grade-chip--active': pickedGradeNo === item.value }]"
                type="button"
                @click="pickedGradeNo = item.value"
              >
                {{ item.label }}
              </button>
            </div>

            <div v-if="visibleClasses.length" class="class-chip-grid">
              <button
                v-for="item in visibleClasses"
                :key="item.id"
                class="class-chip"
                type="button"
                @click="openRosterByClass(item)"
              >
                {{ item.class_name }}
              </button>
            </div>
            <n-empty v-else :description="classLoadError ? '班级列表加载失败' : '还没有可选的班级'" size="small" />

            <n-alert v-if="classLoadError" :closable="false" :title="classLoadError" type="error" />
            <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

            <div v-if="classLoadError" class="action-row">
              <n-button size="large" type="primary" @click="ensureClassOptions(true)">重新加载班级</n-button>
            </div>

            <!-- 班级码是「更快进班」的快捷方式：老师投屏的码，输完直接跳到本班名单 -->
            <div class="class-code-block">
              <p class="class-code-block__label">有班级码？直接进班</p>
              <div class="class-code-block__row">
                <n-input
                  v-model:value="classCodeInput"
                  :maxlength="6"
                  class="class-code-input"
                  placeholder="例如 7K3M9Q"
                  size="large"
                  @input="onClassCodeInput"
                  @keyup.enter="submitClassCode"
                />
                <n-button
                  :disabled="classCodeInput.length !== 6"
                  :loading="isSubmitting"
                  size="large"
                  type="primary"
                  @click="submitClassCode"
                >
                  进班
                </n-button>
              </div>
            </div>
          </template>

          <div class="auth-link-stack auth-link-stack--footer">
            <RouterLink to="/login/staff">切换到教师登录</RouterLink>
            <RouterLink to="/rules">查看课堂守则</RouterLink>
          </div>
        </template>

        <!-- 第二步：点名字 -->
        <template v-else-if="step === 'roster' && roster">
          <div class="auth-form-panel__top">
            <span class="auth-form-panel__tag">第 2 步 / 共 3 步 · {{ roster.class_name }}</span>
            <p class="auth-form-panel__title">{{ roster.class_name }} · 找到你自己的名字</p>
          </div>

          <n-input
            v-model:value="rosterFilter"
            clearable
            placeholder="输入姓名筛选"
            size="large"
          />

          <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

          <div class="roster-grid">
            <button
              v-for="student in filteredRoster"
              :key="student.user_id"
              class="roster-card"
              type="button"
              @click="pickStudent(student)"
            >
              <span class="roster-card__name">{{ student.display_name }}</span>
              <span v-if="rosterMeta.get(student.user_id)" class="roster-card__meta">
                {{ rosterMeta.get(student.user_id) }}
              </span>
            </button>
          </div>
          <n-empty v-if="!filteredRoster.length" description="没有匹配的同学，换个关键词试试" />

          <div class="action-row action-row--split">
            <n-button secondary size="large" @click="backToClass">返回选班级</n-button>
            <n-button size="large" tertiary @click="startGuestObserve">不登录，仅旁听</n-button>
          </div>
        </template>

        <!-- 第三步：输密码 -->
        <template v-else-if="step === 'password' && pickedStudent">
          <div class="auth-form-panel__top">
            <span class="auth-form-panel__tag">第 3 步 / 共 3 步 · {{ roster?.class_name }}</span>
            <p class="auth-form-panel__title">{{ pickedStudent.display_name }}</p>
          </div>

          <n-form :show-feedback="false" @submit.prevent="submitPassword">
            <n-form-item label="密码">
              <n-input
                ref="passwordFieldRef"
                v-model:value="passwordInput"
                placeholder="请输入你的密码"
                show-password-on="click"
                size="large"
                type="password"
                @keyup.enter="submitPassword"
              />
            </n-form-item>

            <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

            <div class="action-row action-row--split">
              <n-button secondary size="large" @click="backToRoster">不是本人</n-button>
              <n-button :loading="isSubmitting" attr-type="submit" size="large" type="primary">
                登录
              </n-button>
            </div>
          </n-form>
        </template>
      </SaPanel>
    </div>
  </section>
</template>

<script setup lang="ts">
import { NAlert, NButton, NEmpty, NForm, NFormItem, NInput, NSkeleton } from 'naive-ui';
import { computed, nextTick, onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';

import { apiGet, apiPost } from '@/api/http';
import SaPanel from '@/components/sa/SaPanel.vue';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';

type LoginPayload = {
  access_token: string;
  expires_at: string;
  user: { id: string; username: string; display_name: string; role: string; roles: string[] };
};

type ClassOptionItem = { id: number; class_name: string; grade_no: number; class_no: number };
type ClassOptionGrade = { grade_no: number; classes: ClassOptionItem[] };

type RosterStudent = {
  user_id: number;
  display_name: string;
  student_no: string;
  seat_label: string | null;
};

type RosterPayload = {
  class_id: number;
  class_name: string;
  class_code: string;
  student_count: number;
  students: RosterStudent[];
};

const router = useRouter();
const authStore = useAuthStore();
const appStore = useAppStore();

const step = ref<'class' | 'roster' | 'password'>('class');
const isSubmitting = ref(false);
const errorMessage = ref('');

const classOptions = ref<ClassOptionGrade[]>([]);
const isLoadingClasses = ref(true);
const classLoadError = ref('');
const pickedGradeNo = ref<number | null>(null);
const classCodeInput = ref('');

const roster = ref<RosterPayload | null>(null);
const rosterFilter = ref('');
const pickedStudent = ref<RosterStudent | null>(null);
const passwordInput = ref('');
const passwordFieldRef = ref<{ focus: () => void } | null>(null);

/** 点名字 / 输密码这两步把版面让给名单：48 个名字比介绍文案更需要空间 */
const isNamePickingStep = computed(() => step.value !== 'class');

const gradeFilters = computed(() => [
  { label: '全部', value: null as number | null },
  ...classOptions.value.map((item) => ({ label: `${item.grade_no} 年级`, value: item.grade_no as number | null })),
]);

const visibleClasses = computed(() => {
  const all = classOptions.value.flatMap((grade) => grade.classes);
  if (pickedGradeNo.value === null) return all;
  return all.filter((item) => item.grade_no === pickedGradeNo.value);
});

const filteredRoster = computed(() => {
  const students = roster.value?.students || [];
  const keyword = rosterFilter.value.trim().toLowerCase();
  if (!keyword) return students;
  return students.filter((student) => student.display_name.toLowerCase().includes(keyword));
});

/**
 * 名单卡片上的补充信息：机位号用于机房辨认。本班有重名时才补学号，
 * 避免把学号当作常规身份信息公开展示（班级名单现在不需要口令即可查看）。
 */
const rosterMeta = computed(() => {
  const students = roster.value?.students || [];
  const nameCount = new Map<string, number>();
  for (const student of students) {
    nameCount.set(student.display_name, (nameCount.get(student.display_name) || 0) + 1);
  }
  const meta = new Map<number, string>();
  for (const student of students) {
    const parts: string[] = [];
    if (student.seat_label) parts.push(`${student.seat_label} 号机`);
    if ((nameCount.get(student.display_name) || 0) > 1) parts.push(`学号 ${student.student_no}`);
    meta.set(student.user_id, parts.join(' · '));
  }
  return meta;
});

function resetError() {
  errorMessage.value = '';
}

async function ensureClassOptions(force = false) {
  if (classOptions.value.length && !force) return;
  isLoadingClasses.value = true;
  classLoadError.value = '';
  try {
    classOptions.value = await apiGet<ClassOptionGrade[]>('/auth/class/options');
  } catch (error) {
    classOptions.value = [];
    classLoadError.value = error instanceof Error ? error.message : '无法加载班级列表，请检查网络后重试';
  } finally {
    isLoadingClasses.value = false;
  }
}

async function openRoster(target: { class_id?: number; class_code?: string }, fallbackMessage: string) {
  resetError();
  isSubmitting.value = true;
  try {
    roster.value = await apiPost<RosterPayload>('/auth/class/roster', target);
    rosterFilter.value = '';
    pickedStudent.value = null;
    passwordInput.value = '';
    step.value = 'roster';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : fallbackMessage;
  } finally {
    isSubmitting.value = false;
  }
}

function openRosterByClass(target: ClassOptionItem) {
  return openRoster({ class_id: target.id }, '无法加载本班名单，请重试');
}

/** 班级码只作为「直接进班」的快捷方式：老师投屏的 6 位码，输完即进本班名单。 */
function onClassCodeInput(value: string) {
  classCodeInput.value = value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 6);
}

function submitClassCode() {
  if (classCodeInput.value.length !== 6) {
    errorMessage.value = '班级码是 6 位字母数字';
    return;
  }
  void openRoster({ class_code: classCodeInput.value }, '班级码无效，请核对黑板上的码，或直接选班级');
}

function pickStudent(student: RosterStudent) {
  resetError();
  pickedStudent.value = student;
  passwordInput.value = '';
  step.value = 'password';
  void nextTick(() => passwordFieldRef.value?.focus());
}

function backToClass() {
  resetError();
  step.value = 'class';
  roster.value = null;
  pickedStudent.value = null;
}

function backToRoster() {
  resetError();
  pickedStudent.value = null;
  passwordInput.value = '';
  step.value = 'roster';
}

async function submitPassword() {
  if (!roster.value || !pickedStudent.value) return;
  resetError();
  isSubmitting.value = true;
  try {
    const payload = await apiPost<LoginPayload>('/auth/student/login-by-class', {
      class_id: roster.value.class_id,
      student_user_id: pickedStudent.value.user_id,
      password: passwordInput.value,
    });
    authStore.setSession(payload.access_token, payload.user, payload.expires_at);
    await router.push('/student/home');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '登录失败，请核对密码';
  } finally {
    isSubmitting.value = false;
  }
}

async function startGuestObserve() {
  if (!roster.value) return;
  await router.push(`/class/${roster.value.class_code}`);
}

onMounted(() => {
  void ensureClassOptions();
});
</script>

<style scoped>
.student-login-page {
  gap: 20px;
}

.student-login-page :deep(.hero-copy) {
  max-width: 60ch;
  font-size: 14px;
  line-height: 1.8;
}

.student-note-card {
  max-width: 560px;
  border-color: var(--ls-auth-note-border);
  background: var(--ls-auth-note-bg);
  border-radius: 22px;
  box-shadow: var(--ls-soft-shadow);
}

.student-login-page :deep(.auth-form-panel) {
  border-radius: 24px;
}

.student-login-page :deep(.auth-form-panel__title) {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.student-login-page :deep(.n-form-item) {
  margin-bottom: 14px;
}

.student-login-page :deep(.n-form-item-label) {
  color: var(--ls-text);
  font-weight: 700;
}

.student-login-page :deep(.n-input) {
  border-radius: 14px;
  background-color: var(--ls-input-bg);
  transition: box-shadow 0.2s ease;
}

.student-login-page :deep(.n-input .n-input__input-el) {
  height: 47px;
  line-height: 47px;
}

.student-login-page :deep(.n-input .n-input__border) {
  border-color: var(--ls-border);
}

.student-login-page :deep(.n-input:focus-within) {
  box-shadow: var(--ls-focus-ring);
}

.student-login-page :deep(.n-input:focus-within .n-input__state-border) {
  border-color: var(--ls-primary);
  box-shadow: none;
}

.student-login-page :deep(.n-button) {
  border-radius: 14px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.student-login-page :deep(.n-button--primary-type) {
  min-height: 48px;
  height: auto;
  background: var(--ls-button-gradient);
  box-shadow: var(--ls-button-shadow);
  transition: transform 0.2s ease;
}

.student-login-page :deep(.n-button--primary-type .n-button__border),
.student-login-page :deep(.n-button--primary-type .n-button__state-border) {
  border: none;
}

.student-login-page :deep(.n-button--primary-type:hover) {
  filter: brightness(1.02);
  transform: translateY(-1px);
}

.student-login-page :deep(.n-alert) {
  box-sizing: border-box;
  border: 1px solid var(--ls-border);
  border-radius: 14px;
}

.action-row {
  gap: 12px;
  flex-wrap: wrap;
}

.action-row--split {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

/* 名单步骤：收起介绍栏，把整行宽度留给 48 个名字的点选卡片 */
.student-login-page--focus :deep(.auth-stage) {
  grid-template-columns: minmax(0, 1fr);
}

.student-login-page--focus .auth-copy-column {
  display: none;
}

.student-login-page--focus :deep(.auth-form-panel) {
  width: min(100%, 980px);
  margin: 0 auto;
}

.grade-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.grade-chip {
  border: 1px solid var(--ls-border);
  border-radius: 999px;
  background: var(--ls-input-bg);
  padding: 7px 14px;
  color: var(--ls-muted);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.grade-chip:hover {
  border-color: var(--ls-primary);
  color: var(--ls-text);
}

.grade-chip--active {
  border-color: var(--ls-primary);
  background: var(--ls-auth-tag-bg);
  color: var(--ls-auth-tag-text);
}

.class-chip-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
}

.class-chip {
  border: 1px solid var(--ls-border);
  border-radius: 12px;
  background: var(--ls-input-bg);
  padding: 12px 8px;
  color: var(--ls-text);
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.15s ease, transform 0.15s ease;
}

.class-chip:hover {
  border-color: var(--ls-primary);
  transform: translateY(-1px);
}

/* 班级码：老师投屏的 6 位码，作为「直接进班」的快捷入口 */
.class-code-block {
  display: grid;
  gap: 8px;
  margin-top: 4px;
  padding-top: 16px;
  border-top: 1px solid var(--ls-border);
}

.class-code-block__label {
  margin: 0;
  color: var(--ls-muted);
  font-size: 13px;
  font-weight: 600;
}

.class-code-block__row {
  display: flex;
  gap: 10px;
}

.class-code-input :deep(.n-input__input-el) {
  height: 44px;
  line-height: 44px;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.class-code-block__row :deep(.n-button) {
  flex-shrink: 0;
  min-width: 88px;
}

/* 名单：48 人同屏点选，卡片做大点击区 */
.roster-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 8px;
  margin: 14px 0;
  max-height: 52vh;
  overflow-y: auto;
  padding-right: 4px;
}

.roster-card {
  display: grid;
  gap: 2px;
  border: 1px solid var(--ls-border);
  border-radius: 12px;
  background: var(--ls-input-bg);
  padding: 10px 12px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
}

.roster-card:hover {
  border-color: var(--ls-primary);
  box-shadow: var(--ls-soft-shadow);
  transform: translateY(-1px);
}

.roster-card__name {
  color: var(--ls-text);
  font-size: 15px;
  font-weight: 700;
}

.roster-card__meta {
  color: var(--ls-muted);
  font-size: 11px;
}

.auth-link-stack--footer {
  margin-top: 16px;
}

@media (max-width: 720px) {
  .student-login-page :deep(.auth-form-panel) {
    border-radius: 20px;
  }

  .roster-grid {
    grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
    max-height: 40vh;
  }
}
</style>
