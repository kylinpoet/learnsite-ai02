<template>
  <section class="page-stack">
    <SaPageHeader
      description="请在进入课程与活动前阅读课堂守则，保持专注、有序、友善的学习氛围。"
      eyebrow="课堂规则"
      title="课堂守则"
    >
      <template #actions>
        <RouterLink to="/login/student">
          <n-button type="primary">返回学生登录</n-button>
        </RouterLink>
      </template>
    </SaPageHeader>

    <SaPanel>
      <ol class="rule-list">
        <li>按时签到，进入课堂后先查看本节课活动。</li>
        <li>完成阅读与说明后再进入作品提交或代码活动。</li>
        <li>互评时要友善、真实、有依据。</li>
        <li>使用 AI 助手时只作为学习辅助，不直接代替作业。</li>
      </ol>
    </SaPanel>
  </section>
</template>

<script setup lang="ts">
import { NButton } from 'naive-ui';
import { RouterLink } from 'vue-router';

import SaPageHeader from '@/components/sa/SaPageHeader.vue';
import SaPanel from '@/components/sa/SaPanel.vue';
</script>

<style scoped>
.page-stack :deep(.n-button) {
  border-radius: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.page-stack :deep(.n-button--primary-type) {
  background: var(--ls-button-gradient);
  box-shadow: var(--ls-button-shadow);
}

.page-stack :deep(.n-button--primary-type .n-button__border),
.page-stack :deep(.n-button--primary-type .n-button__state-border) {
  border: none;
}

.page-stack :deep(.n-button--primary-type:hover) {
  filter: brightness(1.02);
  transform: translateY(-1px);
}
</style>
