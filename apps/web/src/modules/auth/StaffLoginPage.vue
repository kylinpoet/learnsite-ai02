<template>
  <section class="page-stack">
    <div class="auth-hero">
      <div>
        <p class="eyebrow">Teacher & Admin</p>
        <h1>教职工登录</h1>
        <p class="hero-copy">
          教师与管理员统一从这里进入后台，按权限查看教学中控、学案管理、作品评分和系统设置。登录后同样支持一键切换账号或退出。
        </p>
      </div>
      <el-tag type="success" round>统一后台</el-tag>
    </div>

    <el-card class="soft-card">
      <el-alert
        :closable="false"
        class="soft-card"
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
          <RouterLink to="/login/student">切换到学生登录</RouterLink>
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
    authStore.setSession(payload.access_token, payload.user);
    await router.push('/staff/dashboard');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '登录失败，请稍后重试';
  } finally {
    isSubmitting.value = false;
  }
}
</script>
