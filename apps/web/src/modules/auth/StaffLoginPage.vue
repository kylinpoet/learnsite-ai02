<template>
  <section class="page-stack auth-login-page staff-login-page">
    <div class="auth-stage">
      <div class="auth-copy-column">
        <div class="staff-login-page__heading">
          <p class="eyebrow">Teacher & Admin</p>
          <el-tag effect="dark" round type="success">统一后台</el-tag>
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

      <el-card class="soft-card auth-form-panel">
        <div class="auth-form-panel__top">
          <span class="auth-form-panel__tag staff-login-page__tag">教师 / 管理员</span>
          <p class="auth-form-panel__title">使用测试账号进入统一后台</p>
        </div>

        <el-alert
          :closable="false"
          class="staff-login-page__alert"
          show-icon
          title="测试账号：t1 / 222221、t2 / 222221、admin / 222221"
          type="info"
        />

        <el-form label-position="top" @submit.prevent="handleLogin">
        <el-form-item label="账号">
          <el-input v-model="form.username" placeholder="请输入账号" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" placeholder="请输入密码" show-password type="password" />
        </el-form-item>
        <el-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />
        <div class="action-row">
          <el-button :loading="isSubmitting" native-type="submit" type="primary">登录</el-button>
          <div class="auth-link-stack">
            <RouterLink to="/login/student">切换到学生登录</RouterLink>
          </div>
        </div>
      </el-form>
      </el-card>
    </div>
  </section>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';

import { apiPost } from '@/api/http';
import { useAuthStore } from '@/stores/auth';

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
const isSubmitting = ref(false);
const errorMessage = ref('');
const form = reactive({
  username: 't1',
  password: '222221',
});

async function handleLogin() {
  errorMessage.value = '';
  isSubmitting.value = true;
  try {
    const payload = await apiPost<LoginResponse>('/auth/staff/login', form);
    authStore.setSession(payload.access_token, payload.user, payload.expires_at);
    await router.push('/staff/dashboard');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '登录失败，请稍后重试';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<style scoped>
.staff-login-page__heading {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.staff-note-card {
  max-width: 620px;
  background: linear-gradient(180deg, rgba(250, 252, 255, 0.9) 0%, rgba(255, 255, 255, 0.84) 100%);
}

.staff-capability-grid {
  display: grid;
  gap: 12px;
}

.staff-capability-item {
  display: grid;
  gap: 4px;
  padding: 14px 16px;
  border: 1px solid rgba(41, 74, 124, 0.1);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.82);
}

.staff-capability-item strong {
  color: var(--ls-text);
  font-size: 15px;
}

.staff-capability-item span {
  color: var(--ls-muted);
  line-height: 1.6;
}

.staff-login-page__tag {
  background: rgba(66, 97, 162, 0.14);
  color: #2f4f86;
}

.staff-login-page :deep(.el-tag) {
  border: none;
}

.staff-login-page :deep(.el-form-item__label) {
  color: var(--ls-text);
  font-weight: 700;
}

.staff-login-page :deep(.el-input__wrapper) {
  min-height: 46px;
  border-radius: 14px;
  background: rgba(249, 251, 255, 0.96);
  box-shadow: 0 0 0 1px rgba(35, 58, 92, 0.1) inset;
}

.staff-login-page :deep(.el-button--primary) {
  min-height: 48px;
  border: none;
  border-radius: 14px;
  background: linear-gradient(135deg, #4261a2 0%, #5472b8 100%);
  box-shadow: 0 14px 28px rgba(66, 97, 162, 0.2);
}

.staff-login-page :deep(.el-alert) {
  border-radius: 16px;
}
</style>
