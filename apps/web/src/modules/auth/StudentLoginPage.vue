<template>
  <section :class="['page-stack', 'auth-login-page', 'student-login-page', { 'student-login-page--focus': isNamePickingStep }]">
    <div class="auth-stage">
      <div class="auth-copy-column">
        <p class="eyebrow">{{ appStore.title }}</p>
        <h1>学生登录</h1>
        <p class="hero-copy">
          输入黑板上的班级码，点自己的名字，再输密码即可进入学习空间；不知道班级码也可以按年级选班级。
          只想看看这节课讲什么，用班级码选择「仅旁听」即可，不需要账号。
        </p>

        <div class="auth-pill-row">
          <span class="auth-pill">班级码进班</span>
          <span class="auth-pill">点名字登录</span>
          <span class="auth-pill">仅旁听</span>
        </div>

        <article class="auth-note-card student-note-card">
          <p class="auth-note-card__kicker">登录后可继续</p>
          <ul class="auth-feature-list">
            <li>老师推送学案后，阅读、提交作品和编程任务会自动衔接到同一学习路径。</li>
            <li>登录成功即完成今日签到，座位按机房电脑自动识别。</li>
          </ul>
        </article>
      </div>

      <SaPanel panel-class="auth-form-panel">
        <!-- 第一步：班级码 -->
        <template v-if="step === 'code' && loginMode === 'class'">
          <div class="auth-form-panel__top">
            <span class="auth-form-panel__tag">第 1 步 / 共 3 步</span>
            <p class="auth-form-panel__title">输入班级码</p>
          </div>

          <n-alert
            :closable="false"
            class="student-login-page__alert"
            show-icon
            title="班级码写在黑板或投影上，6 位字母数字"
            type="info"
          />

          <n-form :show-feedback="false" @submit.prevent="submitClassCode">
            <n-form-item label="班级码">
              <n-input
                ref="classCodeFieldRef"
                v-model:value="classCodeInput"
                :maxlength="6"
                class="class-code-input"
                placeholder="例如 7K3M9Q"
                size="large"
                @input="onClassCodeInput"
                @keyup.enter="submitClassCode"
              />
            </n-form-item>

            <p v-if="pickedClassName" class="class-code-hint">
              正在进入 {{ pickedClassName }}，请输入该班班级码（班级码不公开名单）。
            </p>

            <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

            <div class="action-row">
              <n-button
                :disabled="classCodeInput.length !== 6"
                :loading="isSubmitting"
                attr-type="submit"
                size="large"
                type="primary"
              >
                进入本班
              </n-button>
            </div>
          </n-form>

          <div class="class-picker-block">
            <button class="class-picker-toggle" type="button" @click="showClassPicker = !showClassPicker">
              {{ showClassPicker ? '收起班级列表' : '不知道班级码？按年级选班级' }}
            </button>

            <div v-if="showClassPicker" class="class-picker-body">
              <n-select
                :options="gradeOptions"
                :value="pickedGradeNo"
                placeholder="选择年级"
                size="large"
                @update:value="onGradeChange"
              />
              <div v-if="pickedGradeClasses.length" class="class-chip-grid">
                <button
                  v-for="item in pickedGradeClasses"
                  :key="item.id"
                  class="class-chip"
                  type="button"
                  @click="openRosterByClass(item.id)"
                >
                  {{ item.class_name }}
                </button>
              </div>
              <n-empty v-else description="先选择年级" size="small" />
            </div>
          </div>

          <div class="auth-link-stack auth-link-stack--footer">
            <button class="link-button" type="button" @click="switchToUsernameLogin">用学号登录</button>
            <RouterLink to="/login/staff">切换到教师登录</RouterLink>
            <RouterLink to="/rules">查看课堂守则</RouterLink>
          </div>
        </template>

        <!-- 第二步：点名字 -->
        <template v-else-if="step === 'roster' && roster">
          <div class="auth-form-panel__top">
            <span class="auth-form-panel__tag">第 2 步 / 共 3 步 · 班级码 {{ roster.class_code }}</span>
            <p class="auth-form-panel__title">{{ roster.class_name }} · 找到你自己的名字</p>
          </div>

          <n-input
            v-model:value="rosterFilter"
            clearable
            placeholder="输入姓名或学号筛选"
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
              <span class="roster-card__meta">
                {{ student.student_no }}
                <template v-if="student.seat_label"> · {{ student.seat_label }} 号机</template>
              </span>
            </button>
          </div>
          <n-empty v-if="!filteredRoster.length" description="没有匹配的同学，换个关键词试试" />

          <div class="action-row action-row--split">
            <n-button secondary size="large" @click="backToCode">返回</n-button>
            <n-button size="large" tertiary @click="startGuestObserve">不登录，仅旁听</n-button>
          </div>
        </template>

        <!-- 第三步：输密码 -->
        <template v-else-if="step === 'password' && pickedStudent">
          <div class="auth-form-panel__top">
            <span class="auth-form-panel__tag">第 3 步 / 共 3 步 · {{ roster?.class_name }}</span>
            <p class="auth-form-panel__title">{{ pickedStudent.display_name }}（{{ pickedStudent.student_no }}）</p>
          </div>

          <n-form :show-feedback="false" @submit.prevent="submitPassword">
            <n-form-item label="密码">
              <n-input
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

        <!-- 学号登录（兜底入口） -->
        <template v-else>
          <div class="auth-form-panel__top">
            <span class="auth-form-panel__tag">备用入口</span>
            <p class="auth-form-panel__title">输入学号和密码进入学习空间</p>
          </div>

          <n-alert
            :closable="false"
            class="student-login-page__alert"
            show-icon
            title="请使用学校分配的学号和密码登录"
            type="info"
          />

          <n-form :show-feedback="false" label-placement="top" @submit.prevent="submitUsernameLogin">
            <n-form-item label="学号">
              <n-input v-model:value="usernameForm.username" placeholder="请输入学号" />
            </n-form-item>
            <n-form-item label="密码">
              <n-input
                v-model:value="usernameForm.password"
                placeholder="请输入密码"
                show-password-on="click"
                type="password"
              />
            </n-form-item>
            <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />
            <div class="action-row">
              <n-button :loading="isSubmitting" attr-type="submit" type="primary">登录</n-button>
              <div class="auth-link-stack">
                <button class="link-button" type="button" @click="switchToClassLogin">用班级码登录</button>
                <RouterLink to="/login/staff">切换到教师登录</RouterLink>
                <RouterLink to="/rules">查看课堂守则</RouterLink>
              </div>
            </div>
          </n-form>
        </template>
      </SaPanel>
    </div>
  </section>
</template>

<script setup lang="ts">
import { NAlert, NButton, NEmpty, NForm, NFormItem, NInput, NSelect } from 'naive-ui';
import { computed, onMounted, reactive, ref } from 'vue';
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

const step = ref<'code' | 'roster' | 'password'>('code');
const loginMode = ref<'class' | 'username'>('class');
const isSubmitting = ref(false);
const errorMessage = ref('');

const classCodeInput = ref('');
const classOptions = ref<ClassOptionGrade[]>([]);
const showClassPicker = ref(false);
const pickedGradeNo = ref<number | null>(null);
const pickedClassName = ref('');
const classCodeFieldRef = ref<{ focus: () => void } | null>(null);

const roster = ref<RosterPayload | null>(null);
const rosterFilter = ref('');
const pickedStudent = ref<RosterStudent | null>(null);
const passwordInput = ref('');

const usernameForm = reactive({ username: '', password: '' });

/** 点名字 / 输密码这两步把版面让给名单：48 个名字比介绍文案更需要空间 */
const isNamePickingStep = computed(() => loginMode.value === 'class' && step.value !== 'code');

const gradeOptions = computed(() =>
  classOptions.value.map((item) => ({ label: `${item.grade_no} 年级`, value: item.grade_no })),
);

const pickedGradeClasses = computed(
  () => classOptions.value.find((item) => item.grade_no === pickedGradeNo.value)?.classes || [],
);

const filteredRoster = computed(() => {
  const students = roster.value?.students || [];
  const keyword = rosterFilter.value.trim().toLowerCase();
  if (!keyword) return students;
  return students.filter(
    (student) =>
      student.display_name.toLowerCase().includes(keyword) || student.student_no.includes(keyword),
  );
});

function resetError() {
  errorMessage.value = '';
}

function onClassCodeInput(value: string) {
  classCodeInput.value = value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 6);
}

async function ensureClassOptions() {
  if (classOptions.value.length) return;
  try {
    classOptions.value = await apiGet<ClassOptionGrade[]>('/auth/class/options');
  } catch {
    // 班级列表只是兜底入口，取不到不影响班级码登录
    classOptions.value = [];
  }
}

function onGradeChange(value: number | null) {
  pickedGradeNo.value = value;
}

async function loadRoster(code: string) {
  resetError();
  isSubmitting.value = true;
  try {
    roster.value = await apiPost<RosterPayload>('/auth/class/roster', { class_code: code });
    rosterFilter.value = '';
    pickedStudent.value = null;
    passwordInput.value = '';
    step.value = 'roster';
    return true;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '班级码无效，请核对后重试';
    return false;
  } finally {
    isSubmitting.value = false;
  }
}

async function submitClassCode() {
  if (classCodeInput.value.length !== 6) {
    errorMessage.value = '班级码是 6 位字母数字';
    return;
  }
  await loadRoster(classCodeInput.value);
}

async function openRosterByClass(classId: number) {
  const target = classOptions.value.flatMap((grade) => grade.classes).find((item) => item.id === classId);
  if (!target) return;
  // 班级码是名单的口令，按班级选择只负责帮你确认「我在哪个班」，名字仍然要班级码才放出来。
  resetError();
  pickedClassName.value = target.class_name;
  classCodeInput.value = '';
  showClassPicker.value = false;
  classCodeFieldRef.value?.focus();
}

function pickStudent(student: RosterStudent) {
  resetError();
  pickedStudent.value = student;
  passwordInput.value = '';
  step.value = 'password';
}

function backToCode() {
  resetError();
  step.value = 'code';
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
      class_code: roster.value.class_code,
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

async function submitUsernameLogin() {
  resetError();
  isSubmitting.value = true;
  try {
    const payload = await apiPost<LoginPayload>('/auth/student/login', usernameForm);
    authStore.setSession(payload.access_token, payload.user, payload.expires_at);
    await router.push('/student/home');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '登录失败，请稍后重试';
  } finally {
    isSubmitting.value = false;
  }
}

function switchToUsernameLogin() {
  resetError();
  loginMode.value = 'username';
}

function switchToClassLogin() {
  resetError();
  loginMode.value = 'class';
  step.value = 'code';
  void ensureClassOptions();
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

/* 班级码：投屏上要一眼可读，字形放大并拉开字距 */
.class-code-input :deep(.n-input__input-el) {
  height: 62px;
  line-height: 62px;
  font-size: 28px;
  font-weight: 800;
  letter-spacing: 0.28em;
  text-align: center;
  text-transform: uppercase;
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

.class-picker-block {
  margin-top: 18px;
  border-top: 1px dashed var(--ls-border);
  padding-top: 14px;
}

.class-picker-toggle,
.link-button {
  border: none;
  background: none;
  padding: 0;
  color: var(--ls-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.class-picker-toggle:hover,
.link-button:hover {
  text-decoration: underline;
}

.class-picker-body {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.class-code-hint {
  margin: -4px 0 12px;
  color: var(--ls-muted);
  font-size: 12px;
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
  padding: 10px 8px;
  color: var(--ls-text);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.15s ease, transform 0.15s ease;
}

.class-chip:hover {
  border-color: var(--ls-primary);
  transform: translateY(-1px);
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
