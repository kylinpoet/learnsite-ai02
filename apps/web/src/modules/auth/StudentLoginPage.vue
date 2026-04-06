<template>
  <section class="page-stack">
    <div class="auth-hero">
      <div>
        <p class="eyebrow">初中信息科技学习平台</p>
        <h1>学生登录</h1>
        <p class="hero-copy">
          学生可以从这里进入学习中心、课程任务、作品互评、网盘和个人资料页面。登录后也支持随时切换到教师登录或直接退出。
        </p>
      </div>
      <el-tag type="warning" round>主题可切换</el-tag>
    </div>

    <el-card class="soft-card">
      <el-alert
        :closable="false"
        class="soft-card"
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
          <RouterLink to="/login/staff">切换到教师登录</RouterLink>
          <RouterLink to="/rules">查看课堂守则</RouterLink>
        </div>
      </el-form>
    </el-card>
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
