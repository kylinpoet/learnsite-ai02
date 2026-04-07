<template>
  <div class="session-tools">
    <div v-if="authStore.user" class="session-chip">
      <p class="session-name">{{ authStore.user.display_name }}</p>
      <p class="session-meta">{{ sessionMeta }}</p>
    </div>

    <el-dropdown trigger="click" @command="handleSwitchCommand">
      <el-button plain>切换账号</el-button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item command="student">切换到学生登录</el-dropdown-item>
          <el-dropdown-item command="staff">切换到教师/管理员登录</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <el-button plain type="danger" @click="logout">退出登录</el-button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ElMessage } from 'element-plus';
import { useRouter } from 'vue-router';

import { useAuthStore } from '@/stores/auth';

type LoginTarget = 'student' | 'staff';

const authStore = useAuthStore();
const router = useRouter();

const sessionMeta = computed(() => {
  const roleLabel = authStore.isAdmin ? '管理员' : authStore.isStaff ? '教师' : '学生';
  const username = authStore.user?.username || '';
  return username ? `${roleLabel}账号 · ${username}` : `${roleLabel}账号`;
});

async function openLogin(target: LoginTarget) {
  authStore.clearSession();
  await router.push(target === 'student' ? '/login/student' : '/login/staff');
  ElMessage.success(target === 'student' ? '已切换到学生登录' : '已切换到教师/管理员登录');
}

async function handleSwitchCommand(command: string | number | object) {
  if (command !== 'student' && command !== 'staff') {
    return;
  }
  await openLogin(command);
}

async function logout() {
  const target: LoginTarget = authStore.isStaff ? 'staff' : 'student';
  authStore.clearSession();
  await router.push(target === 'student' ? '/login/student' : '/login/staff');
  ElMessage.success('已退出登录');
}
</script>

<style scoped>
.session-tools {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: nowrap;
  justify-content: flex-end;
}

.session-chip {
  min-width: 148px;
  flex: 0 0 auto;
  padding: 10px 14px;
  border: 1px solid var(--ls-border);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.8);
}

.session-name,
.session-meta {
  margin: 0;
}

.session-name {
  font-weight: 700;
  color: var(--ls-ink);
  white-space: nowrap;
}

.session-meta {
  margin-top: 2px;
  color: var(--ls-muted);
  font-size: 12px;
  white-space: nowrap;
}

@media (max-width: 960px) {
  .session-tools {
    flex-wrap: wrap;
    justify-content: flex-start;
  }
}
</style>
