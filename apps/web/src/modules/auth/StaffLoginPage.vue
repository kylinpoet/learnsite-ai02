<template>
  <section class="page-stack auth-login-page staff-login-page">
    <div class="auth-stage">
      <div class="auth-copy-column">
        <div class="staff-login-page__heading">
          <p class="eyebrow">{{ appStore.title }}</p>
          <n-tag :bordered="false" round type="success">统一后台</n-tag>
        </div>
        <h1>教职工登录</h1>
        <p class="hero-copy">
          教师与管理员从同一入口进入后台，根据权限查看上课中控、学案管理、作品评分和系统设置。登录后可继续切换账号或直接退出。
        </p>

        <article class="auth-note-card staff-note-card">
          <p class="auth-note-card__kicker">登录后可直达</p>
          <div class="staff-capability-grid">
            <div class="staff-capability-item">
              <strong>上课中控</strong>
              <span>切换课堂模式，推送当前学案给班级。</span>
            </div>
            <div class="staff-capability-item">
              <strong>学案与任务</strong>
              <span>按教材课次创建、发布并回看任务进度。</span>
            </div>
            <div class="staff-capability-item">
              <strong>作品与测验</strong>
              <span>统一处理评分、签到、题库和课堂反馈。</span>
            </div>
          </div>
        </article>
      </div>

      <SaPanel panel-class="auth-form-panel">
        <div class="auth-form-panel__top">
          <span class="auth-form-panel__tag staff-login-page__tag">教师 / 管理员</span>
          <p class="auth-form-panel__title">输入账号和密码进入教学后台</p>
        </div>

        <n-alert
          :closable="false"
          class="staff-login-page__alert"
          show-icon
          title="请使用教师或管理员账号登录"
          type="info"
        />

        <n-form :show-feedback="false" label-placement="top" @submit.prevent="handleLogin">
          <n-form-item label="账号">
            <n-input v-model:value="form.username" placeholder="请输入账号" />
          </n-form-item>
          <n-form-item label="密码">
            <n-input v-model:value="form.password" placeholder="请输入密码" show-password-on="click" type="password" />
          </n-form-item>
          <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />
          <div class="action-row">
            <n-button :loading="isSubmitting" attr-type="submit" type="primary">登录</n-button>
            <div class="auth-link-stack">
              <RouterLink to="/login/student">切换到学生登录</RouterLink>
            </div>
          </div>
        </n-form>
      </SaPanel>
    </div>
  </section>
</template>

<script setup lang="ts">
import { NAlert, NButton, NForm, NFormItem, NInput, NTag } from 'naive-ui';
import { reactive, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';

import { apiPost } from '@/api/http';
import SaPanel from '@/components/sa/SaPanel.vue';
import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';

type LoginResponse = {
  access_token: string;
  token_type: string;
  expires_at: string;
  user: {
    id: string;
    username: string;
    display_name: string;
    role: string;
    roles: string[];
  };
};

const router = useRouter();
const authStore = useAuthStore();
const appStore = useAppStore();
const isSubmitting = ref(false);
const errorMessage = ref('');
const form = reactive({
  username: '',
  password: '',
});

async function handleLogin() {
  errorMessage.value = '';
  isSubmitting.value = true;
  try {
    const payload = await apiPost<LoginResponse>('/auth/staff/login', form);
    authStore.setSession(payload.access_token, payload.user, payload.expires_at);
    await router.push('/staff/classroom');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '登录失败，请稍后重试';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<style scoped>
.staff-login-page {
  gap: 20px;
}

.staff-login-page__heading {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.staff-note-card {
  max-width: 620px;
  border-color: var(--ls-auth-note-border);
  background: var(--ls-auth-note-bg);
  border-radius: 22px;
  box-shadow: var(--ls-soft-shadow);
}

.staff-capability-grid {
  display: grid;
  gap: 10px;
}

.staff-capability-item {
  display: grid;
  gap: 6px;
  padding: 14px 16px;
  border: 1px solid var(--ls-auth-note-border);
  border-radius: 14px;
  background: var(--ls-panel-soft);
  box-shadow: var(--ls-surface-glow);
}

.staff-capability-item strong {
  color: var(--ls-text);
  font-size: 15px;
}

.staff-capability-item span {
  color: var(--ls-muted);
  line-height: 1.6;
}

.staff-login-page :deep(.hero-copy) {
  max-width: 64ch;
  font-size: 14px;
  line-height: 1.8;
}

.staff-login-page__tag {
  background: var(--ls-auth-tag-bg);
  color: var(--ls-auth-tag-text);
}

.staff-login-page :deep(.n-tag) {
  border: none;
  background-color: var(--ls-auth-tag-bg);
  color: var(--ls-auth-tag-text);
}

.staff-login-page :deep(.n-form-item-label) {
  color: var(--ls-text);
  font-weight: 700;
}

.staff-login-page :deep(.n-form-item) {
  margin-bottom: 14px;
}

.staff-login-page :deep(.n-input) {
  border-radius: 14px;
  background-color: var(--ls-input-bg);
  transition: box-shadow 0.2s ease;
}

.staff-login-page :deep(.n-input .n-input__input-el) {
  height: 47px;
  line-height: 47px;
}

.staff-login-page :deep(.n-input .n-input__border) {
  border-color: var(--ls-border);
}

.staff-login-page :deep(.n-input:focus-within) {
  box-shadow: var(--ls-focus-ring);
}

.staff-login-page :deep(.n-input:focus-within .n-input__state-border) {
  border-color: var(--ls-primary);
  box-shadow: none;
}

.staff-login-page :deep(.n-button) {
  border-radius: 14px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.staff-login-page :deep(.n-button--primary-type) {
  min-height: 48px;
  height: auto;
  background: var(--ls-button-gradient);
  box-shadow: var(--ls-button-shadow);
  transition: transform 0.2s ease;
}

.staff-login-page :deep(.n-button--primary-type .n-button__border),
.staff-login-page :deep(.n-button--primary-type .n-button__state-border) {
  border: none;
}

.staff-login-page :deep(.n-button--primary-type:hover) {
  filter: brightness(1.02);
  transform: translateY(-1px);
}

.staff-login-page :deep(.n-alert) {
  box-sizing: border-box;
  border: 1px solid var(--ls-border);
  border-radius: 14px;
}

@media (max-width: 720px) {
  .staff-note-card {
    border-radius: 18px;
  }
}
</style>
