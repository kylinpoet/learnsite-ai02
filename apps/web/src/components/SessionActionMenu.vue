<template>
  <n-dropdown :options="options" placement="bottom-end" trigger="click" @select="handleSelect">
    <button class="session-chip" type="button">
      <n-avatar :size="28" round class="session-avatar">{{ avatarText }}</n-avatar>
      <span class="session-copy">
        <strong class="session-name">{{ authStore.user?.display_name || '未登录' }}</strong>
        <small class="session-meta">{{ sessionMeta }}</small>
      </span>
      <AppIcon class="session-caret" :icon="ChevronDown" :size="13" />
    </button>
  </n-dropdown>
</template>

<script setup lang="ts">
import type { DropdownOption } from 'naive-ui';
import { NAvatar, NDropdown } from 'naive-ui';
import { ElMessage } from '@/ui/feedback';
import { ChevronDown } from 'lucide-vue-next';
import { computed } from 'vue';
import { useRouter } from 'vue-router';

import AppIcon from '@/components/AppIcon.vue';
import { useAuthStore } from '@/stores/auth';

type LoginTarget = 'student' | 'staff';

const authStore = useAuthStore();
const router = useRouter();

const options: DropdownOption[] = [
  { label: '切换到学生登录', key: 'switch-student' },
  { label: '切换到教师/管理员登录', key: 'switch-staff' },
  { type: 'divider', key: 'divider' },
  { label: '退出登录', key: 'logout' },
];

const roleLabel = computed(() => (authStore.isAdmin ? '管理员' : authStore.isStaff ? '教师' : '学生'));

const sessionMeta = computed(() => {
  const username = authStore.user?.username || '';
  return username ? `${roleLabel.value} · ${username}` : roleLabel.value;
});

const avatarText = computed(() => {
  const name = authStore.user?.display_name?.trim() || '';
  return name ? name.slice(0, 1) : '师';
});

async function openLogin(target: LoginTarget) {
  authStore.clearSession();
  await router.push(target === 'student' ? '/login/student' : '/login/staff');
  ElMessage.success(target === 'student' ? '已切换到学生登录' : '已切换到教师/管理员登录');
}

async function handleSelect(key: string | number) {
  if (key === 'switch-student' || key === 'switch-staff') {
    await openLogin(key === 'switch-student' ? 'student' : 'staff');
    return;
  }
  if (key === 'logout') {
    const target: LoginTarget = authStore.isStaff ? 'staff' : 'student';
    authStore.clearSession();
    await router.push(target === 'student' ? '/login/student' : '/login/staff');
    ElMessage.success('已退出登录');
  }
}
</script>

<style scoped>
.session-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 3px 10px 3px 3px;
  border: 1px solid var(--ls-chip-border, var(--ls-border));
  border-radius: 999px;
  background: var(--ls-chip-bg, rgba(255, 255, 255, 0.84));
  cursor: pointer;
  font-family: inherit;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.session-chip:hover {
  border-color: var(--ls-primary);
  box-shadow: 0 4px 12px rgba(44, 64, 106, 0.08);
}

.session-avatar {
  flex: 0 0 auto;
  background: linear-gradient(135deg, var(--ls-primary), var(--ls-accent));
  color: #fff;
  font-size: 13px;
  font-weight: 700;
}

.session-copy {
  display: grid;
  gap: 0;
  text-align: left;
  line-height: 1.25;
}

.session-name {
  color: var(--ls-ink);
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}

.session-meta {
  color: var(--ls-muted);
  font-size: 11px;
  white-space: nowrap;
}

.session-caret {
  flex: 0 0 auto;
  color: var(--ls-muted);
}

@media (max-width: 760px) {
  .session-copy,
  .session-caret {
    display: none;
  }

  .session-chip {
    padding: 3px;
  }
}
</style>
