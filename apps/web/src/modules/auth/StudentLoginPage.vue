<template>
  <section class="page-stack auth-login-page student-login-page">
    <div class="auth-stage">
      <div class="auth-copy-column">
        <p class="eyebrow">{{ appStore.title }}</p>
        <h1>学生登录</h1>
        <p class="hero-copy">
          从这里进入学习中心、课程任务、作品互评、网盘和个人资料页。一次登录后，学习、提交和回看进度都会保持在同一个入口里。
        </p>

        <div class="auth-pill-row">
          <span class="auth-pill">学习中心</span>
          <span class="auth-pill">课程任务</span>
          <span class="auth-pill">作品互评</span>
          <span class="auth-pill">班级网盘</span>
        </div>

        <article class="auth-note-card student-note-card">
          <p class="auth-note-card__kicker">登录后可继续</p>
          <ul class="auth-feature-list">
            <li>老师推送学案后，阅读、提交作品和编程任务会自动衔接到同一学习路径。</li>
            <li>登录完成后可以继续查看互评结果、班级共享资料和个人成长档案。</li>
          </ul>
        </article>
      </div>

      <SaPanel panel-class="auth-form-panel">
        <div class="auth-form-panel__top">
          <span class="auth-form-panel__tag">主题可切换</span>
          <p class="auth-form-panel__title">输入学号和密码进入学习空间</p>
        </div>

        <n-alert
          :closable="false"
          class="student-login-page__alert"
          show-icon
          title="请使用学校分配的学号和密码登录"
          type="info"
        />

        <n-form :show-feedback="false" label-placement="top" @submit.prevent="handleLogin">
          <n-form-item label="学号">
            <n-input v-model:value="form.username" placeholder="请输入学号" />
          </n-form-item>
          <n-form-item label="密码">
            <n-input v-model:value="form.password" placeholder="请输入密码" show-password-on="click" type="password" />
          </n-form-item>
          <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />
          <div class="action-row">
            <n-button :loading="isSubmitting" attr-type="submit" type="primary">登录</n-button>
            <div class="auth-link-stack">
              <RouterLink to="/login/staff">切换到教师登录</RouterLink>
              <RouterLink to="/rules">查看课堂守则</RouterLink>
            </div>
          </div>
        </n-form>
      </SaPanel>
    </div>
  </section>
</template>

<script setup lang="ts">
import { NAlert, NButton, NForm, NFormItem, NInput } from 'naive-ui';
import { reactive, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';

import type { components } from '@/api/schema';
import { apiPost } from '@/api/http';
import SaPanel from '@/components/sa/SaPanel.vue';
import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';

type LoginRequest = components['schemas']['LoginRequest'];

// 后端已泛型化 ApiResponse：登录端点返回 ApiResponse[LoginPayload]，
// OpenAPI 已内联 data 结构，响应类型直接取自生成文件。
type LoginResponse = components['schemas']['LoginPayload'];

const router = useRouter();
const authStore = useAuthStore();
const appStore = useAppStore();
const isSubmitting = ref(false);
const errorMessage = ref('');
const form = reactive<LoginRequest>({
  username: '',
  password: '',
});

async function handleLogin() {
  errorMessage.value = '';
  isSubmitting.value = true;
  try {
    const payload = await apiPost<LoginResponse>('/auth/student/login', form);
    authStore.setSession(payload.access_token, payload.user, payload.expires_at);
    await router.push('/student/home');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '登录失败，请稍后重试';
  } finally {
    isSubmitting.value = false;
  }
}
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

@media (max-width: 720px) {
  .student-login-page :deep(.auth-form-panel) {
    border-radius: 20px;
  }
}
</style>
