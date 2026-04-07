<template>
  <section class="page-stack auth-login-page student-login-page">
    <div class="auth-stage">
      <div class="auth-copy-column">
        <p class="eyebrow">初中信息科技学习平台</p>
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
          <p class="auth-note-card__kicker">Today in learnsite</p>
          <ul class="auth-feature-list">
            <li>老师推送学案后，阅读、提交作品和编程任务会自动衔接到同一学习路径。</li>
            <li>登录完成后可以继续查看互评结果、班级共享资料和个人成长档案。</li>
          </ul>
        </article>
      </div>

      <el-card class="soft-card auth-form-panel">
        <div class="auth-form-panel__top">
          <span class="auth-form-panel__tag">主题可切换</span>
          <p class="auth-form-panel__title">使用测试账号快速体验学生端流程</p>
        </div>

        <el-alert
          :closable="false"
          class="student-login-page__alert"
          show-icon
          title="测试账号：70101 / 12345，可切换 70101-70110、80901-80910 等学生账号"
          type="info"
        />

        <el-form label-position="top" @submit.prevent="handleLogin">
        <el-form-item label="学号">
          <el-input v-model="form.username" placeholder="请输入学号" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" placeholder="请输入密码" show-password type="password" />
        </el-form-item>
        <el-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />
        <div class="action-row">
          <el-button :loading="isSubmitting" native-type="submit" type="primary">登录</el-button>
          <div class="auth-link-stack">
            <RouterLink to="/login/staff">切换到教师登录</RouterLink>
            <RouterLink to="/rules">查看课堂守则</RouterLink>
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
  username: '70101',
  password: '12345',
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
.student-note-card {
  max-width: 560px;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.86) 0%, rgba(245, 250, 255, 0.84) 100%);
}

.student-login-page :deep(.el-form-item__label) {
  color: var(--ls-text);
  font-weight: 700;
}

.student-login-page :deep(.el-input__wrapper) {
  min-height: 46px;
  border-radius: 16px;
  box-shadow: 0 0 0 1px rgba(44, 76, 132, 0.08) inset;
}

.student-login-page :deep(.el-button--primary) {
  min-height: 48px;
  border: none;
  border-radius: 16px;
  background: linear-gradient(135deg, #3e95ff 0%, #4ea9ff 100%);
  box-shadow: 0 16px 30px rgba(62, 149, 255, 0.22);
}

.student-login-page :deep(.el-alert) {
  border-radius: 18px;
}
</style>
