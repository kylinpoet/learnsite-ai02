<template>
  <section class="st-pane">
    <header class="st-head">
      <div class="st-head__main">
        <h2>AI 安全</h2>
        <p class="st-head__sub">限制学生每日发送的消息数量，并按分类拦截关键词；命中的对话会进入教师端审计。</p>
      </div>
      <div class="st-head__actions">
        <n-button :loading="isSavingSafetySettings" type="primary" @click="saveSafetySettings">保存安全设置</n-button>
      </div>
    </header>

    <section class="sf-panel">
      <header class="sf-panel__head">
        <h3 class="sf-panel__title">学生使用限制</h3>
      </header>
      <div class="sf-panel__body">
        <div class="st-limit">
          <div class="st-limit__main">
            <p class="st-switch-row__title">每日消息上限</p>
            <p class="st-switch-row__desc">教职工不受限制；设为 0 表示不限制。</p>
          </div>
          <n-input-number v-model:value="safetyForm.student_daily_message_limit" :max="500" :min="0" class="st-limit__input" />
        </div>
      </div>
    </section>

    <section class="sf-panel">
      <header class="sf-panel__head">
        <h3 class="sf-panel__title">
          关键词黑名单
          <span class="sf-panel__count">{{ safetyCategoryCount }} 个分类 · 关键词用逗号或换行分隔</span>
        </h3>
      </header>
      <div class="st-cats">
        <article v-for="(category, key) in safetyForm.blocked_keywords" :key="key" class="st-cat">
          <header class="st-cat__head">
            <div class="st-cat__main">
              <p class="st-cat__title">{{ category.label }}</p>
              <p class="st-cat__key">{{ key }}</p>
            </div>
            <n-switch v-model:value="category.enabled">
              <template #checked>启用拦截</template>
              <template #unchecked>放行</template>
            </n-switch>
          </header>
          <n-input
            v-model:value="category.keywordsText"
            :rows="3"
            placeholder="每行一个关键词，或用逗号分隔"
            type="textarea"
          />
        </article>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { NButton, NInput, NInputNumber, NSwitch } from 'naive-ui';
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from '@/ui/feedback';

import { apiGet, apiPut } from '@/api/http';
import { useAuthStore } from '@/stores/auth';
import type { SafetyCategoryForm, SafetySettingsPayload } from '../adminTypes';

const authStore = useAuthStore();

const safetyForm = ref<{ student_daily_message_limit: number; blocked_keywords: Record<string, SafetyCategoryForm> }>({
  student_daily_message_limit: 50,
  blocked_keywords: {},
});
const isSavingSafetySettings = ref(false);

const safetyCategoryCount = computed(() => Object.keys(safetyForm.value.blocked_keywords ?? {}).length);

function applySafetySettings(payload: SafetySettingsPayload) {
  const categories: Record<string, SafetyCategoryForm> = {};
  for (const [key, item] of Object.entries(payload.blocked_keywords || {})) {
    categories[key] = {
      label: item.label,
      enabled: item.enabled,
      keywordsText: (item.keywords || []).join('\n'),
    };
  }
  safetyForm.value = {
    student_daily_message_limit: payload.student_daily_message_limit,
    blocked_keywords: categories,
  };
}

function splitKeywords(text: string): string[] {
  return text
    .split(/[\n,，、;；]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function loadSafetySettings() {
  const payload = await apiGet<SafetySettingsPayload>('/assistants/admin/safety-settings', authStore.token);
  applySafetySettings(payload);
}

async function saveSafetySettings() {
  if (!authStore.token) return;
  isSavingSafetySettings.value = true;
  try {
    const blockedKeywords: Record<string, { label: string; enabled: boolean; keywords: string[] }> = {};
    for (const [key, item] of Object.entries(safetyForm.value.blocked_keywords)) {
      blockedKeywords[key] = {
        label: item.label || key,
        enabled: item.enabled,
        keywords: splitKeywords(item.keywordsText),
      };
    }
    const payload = await apiPut<SafetySettingsPayload>(
      '/assistants/admin/safety-settings',
      {
        student_daily_message_limit: safetyForm.value.student_daily_message_limit,
        blocked_keywords: blockedKeywords,
      },
      authStore.token
    );
    applySafetySettings(payload);
    ElMessage.success('AI 安全设置已保存');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存 AI 安全设置失败');
  } finally {
    isSavingSafetySettings.value = false;
  }
}

defineExpose({ loadSafetySettings });

onMounted(() => {
  void loadSafetySettings();
});
</script>
